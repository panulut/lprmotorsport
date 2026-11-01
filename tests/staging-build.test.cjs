const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {buildStaging,testURL,production}=require('../scripts/build-staging.cjs');
const {gameFiles}=require('../scripts/build.cjs');
const {createServer:createVerificationServer}=require('../verification/server.cjs');
const {createLocalLeaderboard}=require('../verification/local-leaderboard.cjs');
const {run:runRemoteCheck}=require('../scripts/check-verified-remote.cjs');

for(const bad of [
 'https://panulut.github.io',
 'https://lpr-verification.onrender.com',
 'https://lpr-verified.panu-musakka.workers.dev',
 'https://lpr-leaderboard.panu-musakka.workers.dev',
 'http://test.example',
 'http://127.0.0.1:8787',
 'https://test.example/path',
 'https://user:pass@test.example',
 'https://test.example/?key=x'
])assert.throws(()=>testURL(bad));
assert.equal(testURL('http://127.0.0.1:8787',{allowLoopback:true}),'http://127.0.0.1:8787');

const destination=path.resolve(__dirname,'../artifacts/integration/staging-build');
const reportFile=path.resolve(__dirname,'../artifacts/integration/staging-remote-report.json');
const {revision}=require('../verification/world.cjs');
assert(fs.readFileSync(path.resolve(__dirname,'../cloudflare/verified-worker.bundle.mjs'),'utf8').includes(
 'const BUILD_REVISION='+JSON.stringify(revision)+';'),
 'The deployed Worker bundle must match the committed simulation and track data');

function listenServer(server,port=0,host='127.0.0.1'){
 return new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(port,host,()=>resolve(server.address()));
 });
}
function closeServer(server){
 if(!server?.listening)return Promise.resolve();
 return new Promise(resolve=>server.close(resolve));
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

(async()=>{
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
  assert(fs.readFileSync(path.resolve(__dirname,'../verification/config.js'),'utf8').includes('https://lpr-verification.onrender.com'),'Production source stays unchanged');
  console.log('PASS: staging endpoint isolation, production URL rejection, test banner and revision manifest');

  const secret='staging-integration-test-secret-0123456789abcdef';
  let virtualClockMs=1000;
  const virtualNow=()=>virtualClockMs;
  const clockTimer=setInterval(()=>{virtualClockMs+=250;},15);
  clockTimer.unref();
  const siteServer=createStaticSiteServer(destination);
  const siteAddr=await listenServer(siteServer);
  const siteOrigin=`http://127.0.0.1:${siteAddr.port}`;
  const verificationServer=await createVerificationServer({
   secret,
   origins:[siteOrigin],
   sessionsOptions:{clock:virtualNow,lapLagMs:16000,lagMs:60000}
  });
  const leaderboardServer=await createLocalLeaderboard({
   secret,
   revision,
   origins:siteOrigin,
   passwordIterations:10000
  });
  try{
   const verAddr=await listenServer(verificationServer);
   const lbAddr=await listenServer(leaderboardServer);
   const serviceOrigin=`http://127.0.0.1:${verAddr.port}`;
   const leaderboardOrigin=`http://127.0.0.1:${lbAddr.port}`;
   buildStaging({
    LPR_TEST_SERVICE_URL:serviceOrigin,
    LPR_TEST_LEADERBOARD_URL:leaderboardOrigin,
    LPR_TEST_ANALYTICS_URL:leaderboardOrigin,
    LPR_TEST_GIT_COMMIT:'local-staging-test'
   },destination,{allowLoopback:true});

   const report=await runRemoteCheck({
    site:siteOrigin,
    count:2,
    output:reportFile,
    allowLoopback:true,
    clock:virtualNow,
    intervalMs:10
   });
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
   assert.equal(report.featureChecks.chat.anonymousGuestTicketVerified,true);
   assert.equal(report.featureChecks.chat.accountTicketVerified,true);
   assert.equal(report.featureChecks.chat.promotedTicketVerified,true);
   assert.equal(report.featureChecks.chat.takenNicknameRejected,true);
   console.log('PASS: staging remote check covers guest laps, in-drive guest promotion, timing-panel, championship, chat tickets and replays');
  }finally{
   clearInterval(clockTimer);
   await Promise.all([closeServer(verificationServer),closeServer(leaderboardServer),closeServer(siteServer)]);
  }
 }finally{
  fs.rmSync(destination,{recursive:true,force:true});
  fs.rmSync(reportFile,{force:true});
 }
})().catch(error=>{
 console.error(error);
 process.exitCode=1;
});
