const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {buildStaging,testURL,production}=require('../scripts/build-staging.cjs');
const {gameFiles}=require('../scripts/build.cjs');
const {createServer:createVerificationServer}=require('../verification/server.cjs');
const {createLocalLeaderboard}=require('../verification/local-leaderboard.cjs');
const {run:runRemoteCheck,request:remoteRequest}=require('../scripts/check-verified-remote.cjs');
const productionSource=fs.readFileSync(path.resolve(__dirname,'../verification/config.js'),'utf8');

for(const bad of [
 'https://panulut.github.io',
 'https://lpr-verification.onrender.com',
 'https://lpr-verification-prod.agreeablesky-be9aabca.swedencentral.azurecontainerapps.io',
 'https://lpr-verified.panu-musakka.workers.dev',
 'https://lpr-leaderboard.panu-musakka.workers.dev',
 'https://latest.example',
 'https://contest.example',
 'http://test.example',
 'http://127.0.0.1:8787',
 'https://test.example/path',
 'https://user:pass@test.example',
 'https://test.example/?key=x'
])assert.throws(()=>testURL(bad),`Expected testURL to reject ${bad}`);
for(const valid of [
 'https://test.example',
 'https://staging.example',
 'https://lpr-test.example',
 'https://lpr.staging.example'
])assert.equal(testURL(valid),valid);
assert.equal(testURL('http://127.0.0.1:8787',{allowLoopback:true}),'http://127.0.0.1:8787');

const destination=path.resolve(__dirname,'../artifacts/integration/staging-build');
const reportFile=path.resolve(__dirname,'../artifacts/integration/staging-remote-report.json');
const {revision}=require('../verification/world.cjs');
assert(fs.readFileSync(path.resolve(__dirname,'../cloudflare/verified-worker.bundle.mjs'),'utf8').includes(
 'const BUILD_REVISION='+JSON.stringify(revision)+';'),
 'The deployed Worker bundle must match the committed simulation and track data');

function listenServer(server,port=0,host='127.0.0.1',timeoutMs=5000){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{
   server.removeListener('error',onError);
   reject(Error('Server listen timed out'));
  },timeoutMs);
  timer.unref();
  function onError(error){
   clearTimeout(timer);
   reject(error);
  }
  server.once('error',onError);
  server.listen(port,host,()=>{
   clearTimeout(timer);
   server.removeListener('error',onError);
   resolve(server.address());
  });
 });
}

// Call server.close() before server.closeAllConnections() and avoid duplicate
// cleanup of SQLite/worker resources already wired to the server 'close' event.
async function closeServer(server,timeoutMs=5000){
 if(!server)return;
 const wasListening=Boolean(server.listening);
 try{
  if(wasListening){
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Server close timed out')),timeoutMs);
    timer.unref();
    server.close(error=>{
     clearTimeout(timer);
     if(error&&error.code!=='ERR_SERVER_NOT_RUNNING')reject(error);
     else resolve();
    });
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
   });
  }
 }finally{
  await Promise.allSettled([
   server.sessions?.close?.(),
   server.capacityReporter?.close?.()
  ]);
  if(!wasListening&&server.db?.isOpen!==false){
   try{server.db?.close?.();}catch{}
  }
 }
}

function createStaticSiteServer(root){
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
 return http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  const rel=pathname==='/'?'index.html':pathname.slice(1);
  const targetPath=path.resolve(root,rel);
  if(!targetPath.startsWith(path.resolve(root))||!fs.existsSync(targetPath)||fs.statSync(targetPath).isDirectory()){
   res.writeHead(404,{'Content-Type':'application/json; charset=utf-8'});
   res.end(JSON.stringify({error:'Not found',code:'not-found'}));
   return;
  }
  res.writeHead(200,{'Content-Type':types[path.extname(targetPath)]||'application/octet-stream'});
  res.end(fs.readFileSync(targetPath));
 });
}

async function testEarlyInitFailureAndErrorHandling(secret){
 let unstartedVerification=null,unstartedLeaderboard=null,faultServer=null;
 try{
  unstartedVerification=await createVerificationServer({secret,origins:[]});
  unstartedLeaderboard=await createLocalLeaderboard({secret,revision,passwordIterations:10000});
  assert.equal(unstartedVerification.listening,false);
  assert.equal(unstartedLeaderboard.listening,false);
  assert.equal(unstartedLeaderboard.db.isOpen,true);
  await closeServer(unstartedVerification);
  await closeServer(unstartedLeaderboard);
  assert.equal(unstartedVerification.sessions.closed,true,'Unstarted verification server sessions must close on setup failure');
  assert.equal(unstartedVerification.sessions.pool.closed,true,'Unstarted worker pool must close on setup failure');
  assert.equal(unstartedLeaderboard.db.isOpen,false,'Unstarted leaderboard SQLite DB must close on setup failure');
  // Calling closeServer a second time must be a safe no-op.
  await closeServer(unstartedVerification);
  await closeServer(unstartedLeaderboard);

  faultServer=http.createServer((req,res)=>{
   if(req.url==='/bad-gateway'){
    res.writeHead(502,{'Content-Type':'text/html; charset=utf-8'});
    res.end('<html><body>502 Bad Gateway</body></html>');
    return;
   }
   if(req.url==='/invalid-json'){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end('not-json');
    return;
   }
   if(req.url==='/slow'){
    const timer=setTimeout(()=>{
     if(!res.destroyed){res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');}
    },2000);
    timer.unref();
   }
  });
  const addr=await listenServer(faultServer);
  const base=`http://127.0.0.1:${addr.port}`;
  await assert.rejects(
   remoteRequest(base,'/bad-gateway',{timeout:2000}),
   error=>error.status===502&&/HTTP 502/.test(error.message)&&/502 Bad Gateway/.test(error.message),
   'Non-JSON 502 error response must surface HTTP status and text snippet'
  );
  await assert.rejects(
   remoteRequest(base,'/invalid-json',{timeout:2000}),
   error=>error.status===200&&/invalid JSON response/.test(error.message),
   'Malformed 200 JSON must fail closed'
  );
  await assert.rejects(
   remoteRequest(base,'/slow',{timeout:100}),
   error=>error.name==='TimeoutError'||error.name==='AbortError',
   'Slow remote endpoint must abort on phase timeout'
  );
 }finally{
  await Promise.allSettled([
   closeServer(unstartedVerification),
   closeServer(unstartedLeaderboard),
   closeServer(faultServer)
  ]);
 }
}

(async()=>{
 const suiteStart=performance.now();
 const watchdogMs=Number(process.env.LPR_STAGING_WATCHDOG_MS||90000);
 let watchdog=null,siteServer=null,verificationServer=null,leaderboardServer=null;
 const cleanup=async()=>{
  clearTimeout(watchdog);
  await Promise.allSettled([
   closeServer(verificationServer),
   closeServer(leaderboardServer),
   closeServer(siteServer)
  ]);
  fs.rmSync(destination,{recursive:true,force:true});
  fs.rmSync(reportFile,{force:true});
 };
 watchdog=setTimeout(()=>{
  console.error(`Staging integration test exceeded watchdog (${watchdogMs} ms); attempting graceful cleanup`);
  void cleanup().finally(()=>process.exit(1));
 },watchdogMs);
 watchdog.unref();

 try{
  const target=buildStaging({
   LPR_TEST_SERVICE_URL:'https://verification-test.example',
   LPR_TEST_LEADERBOARD_URL:'https://verified-test.example',
   LPR_TEST_ANALYTICS_URL:'https://analytics-test.example',
   RENDER_GIT_COMMIT:'test-commit'
  },destination);
  const config=fs.readFileSync(path.join(target,'verification/config.js'),'utf8');
  assert(config.includes('https://verification-test.example'));
  assert(config.includes('"mode":"staging"'));
  assert(!config.includes('lpr-verification.onrender.com'));
  for(const file of ['analytics.js','leaderboard.js']){
   const source=fs.readFileSync(path.join(target,file),'utf8');
   assert(source.includes('https://analytics-test.example'));
   assert(!source.includes('lpr-leaderboard.panu-musakka.workers.dev'));
  }
  assert(fs.readFileSync(path.join(target,'index.html'),'utf8').includes('TESTIVERSIO'));
  assert(fs.readFileSync(path.join(target,'replay.html'),'utf8').includes('TESTIVERSIO'));
  for(const file of gameFiles){
   const text=fs.readFileSync(path.join(target,file),'utf8');
   for(const host of production)assert(!text.includes(host),`Unexpected production host ${host} in ${file}`);
  }
  const manifest=JSON.parse(fs.readFileSync(path.join(target,'staging.json'),'utf8'));
  assert.equal(manifest.environment,'staging');
  assert.equal(manifest.commit,'test-commit');
  assert.equal(manifest.revision,revision);
  for(const feature of ['accounts','guests','guest-promotion','timing-panel','championship','chat-tickets','replays','spectate']){
   assert(manifest.features.includes(feature),`Missing staging manifest feature: ${feature}`);
  }
  assert.equal(fs.readFileSync(path.resolve(__dirname,'../verification/config.js'),'utf8'),productionSource,'Staging build must preserve the production source');
  console.log('PASS: staging endpoint isolation, production URL rejection, test banner and revision manifest');

  const secret='staging-integration-test-secret-0123456789abcdef';
  await testEarlyInitFailureAndErrorHandling(secret);
  console.log('PASS: early initialization failure cleanup, non-JSON error handling and phase timeout enforcement');

  // Continuous, monotonic 8x virtual clock: fast enough to finish 2 laps in ~12.5s
  // while preserving genuine 2000ms lapLagMs eligibility checks without suppressing time.
  const startPerf=performance.now();
  const virtualNow=()=>startPerf+(performance.now()-startPerf)*8;
  siteServer=createStaticSiteServer(destination);
  const siteAddr=await listenServer(siteServer);
  const siteOrigin=`http://127.0.0.1:${siteAddr.port}`;
  verificationServer=await createVerificationServer({
   secret,
   origins:[siteOrigin],
   sessionsOptions:{clock:virtualNow}
  });
  leaderboardServer=await createLocalLeaderboard({
   secret,
   revision,
   origins:siteOrigin,
   passwordIterations:10000
  });
  const verAddr=await listenServer(verificationServer);
  const lbAddr=await listenServer(leaderboardServer);
  const serviceOrigin=`http://127.0.0.1:${verAddr.port}`;
  const leaderboardOrigin=`http://127.0.0.1:${lbAddr.port}`;
  // Update only verification/config.js and staging.json in the already-built staging folder
  // to avoid re-copying all static binary assets a second time.
  fs.writeFileSync(path.join(target,'verification/config.js'),`window.LPRVerificationConfig=${JSON.stringify({service:serviceOrigin,leaderboard:leaderboardOrigin,mode:'staging'})};\n`);
  fs.writeFileSync(path.join(target,'staging.json'),JSON.stringify({...manifest,service:serviceOrigin,leaderboard:leaderboardOrigin,analytics:leaderboardOrigin,commit:'local-staging-test'},null,2));

  const remoteStart=performance.now();
  const report=await runRemoteCheck({
   site:siteOrigin,
   count:2,
   output:reportFile,
   allowLoopback:true,
   clock:virtualNow,
   intervalMs:10,
   requestTimeoutMs:10000,
   healthTimeoutMs:10000,
   driveTimeoutMs:45000,
   cleanupTimeoutMs:5000
  });
  const remoteElapsedMs=Math.round(performance.now()-remoteStart);
  assert.equal(report.passed,true);
  assert.equal(report.commit,'local-staging-test');
  assert.equal(report.players.length,2);
  assert.equal(report.players[0].promotedFromGuest,true);
  assert.deepEqual(report.players[0].completedLaps,[1,2]);
  assert.deepEqual(report.players[1].completedLaps,[1,2]);
  assert.equal(report.featureChecks.guest.resumed,true);
  assert.equal(report.featureChecks.promotion.promotedDuringActiveDrive,true);
  assert.equal(report.featureChecks.promotion.sessionPhaseDuringPromotion,'running');
  assert.equal(report.featureChecks.promotion.tokenPreserved,true);
  assert.equal(report.featureChecks.promotion.backfilledTodayLaps,1);
  assert.equal(report.featureChecks.timingPanel.unauthenticatedStatus,401);
  assert.equal(report.featureChecks.timingPanel.verifiedPlayers,2);
  assert.equal(report.featureChecks.championship.pastDayFinalVerified,true);
  assert.equal(report.featureChecks.chat.guestTicketVerified,true);
  assert.equal(report.featureChecks.chat.anonymousGuestTicketRejected,true);
  assert.equal(report.featureChecks.chat.accountTicketVerified,true);
  assert.equal(report.featureChecks.chat.promotedTicketVerified,true);
  assert.equal(report.featureChecks.chat.takenNicknameRejected,true);

  const closeStart=performance.now();
  await Promise.all([
   closeServer(verificationServer),
   closeServer(leaderboardServer),
   closeServer(siteServer)
  ]);
  const closeElapsedMs=Math.round(performance.now()-closeStart);
  assert.equal(verificationServer.listening,false,'Verification server must stop listening');
  assert.equal(verificationServer.sessions.closed,true,'Verification sessions must close');
  assert.equal(verificationServer.sessions.pool.snapshot().workers,0,'All worker threads must terminate on close');
  assert.equal(leaderboardServer.listening,false,'Leaderboard server must stop listening');
  assert.equal(leaderboardServer.db.isOpen,false,'Leaderboard SQLite database must close');
  assert.equal(siteServer.listening,false,'Static site server must stop listening');
  console.log(`PASS: staging remote check covers guest laps, in-drive guest promotion, timing-panel, championship, chat tickets and replays (remoteCheck=${remoteElapsedMs}ms, close=${closeElapsedMs}ms, total=${Math.round(performance.now()-suiteStart)}ms)`);
 }finally{
  await cleanup();
 }
})().catch(error=>{
 console.error(error);
 process.exitCode=1;
});
