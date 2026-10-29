// Actual Chrome game/renderer and production browser transport, real Azure clock.
// The frontend and disposable account database are served only inside test contexts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const {launchBrowser}=require('./browser.cjs');
const {buildStaging}=require('./build-staging.cjs');
const {targetURL}=require('./load-azure-verification.cjs');
const {revision}=require('../verification/world.cjs');
const {driver}=require('../tests/helpers-driving.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const service=targetURL(),origin='https://lpr-game-test.azurestaticapps.net',accounts='https://lpr-accounts-test.azurewebsites.net',analytics='https://lpr-analytics-test.azurewebsites.net';
 const secret=process.env.AZURE_VERIFICATION_TEST_SECRET,token=process.env.VERIFICATION_METRICS_TOKEN;assert(secret?.length>=32&&token?.length>=32&&secret!==token);
 const delays=(process.env.AZURE_BROWSER_DELAYS||'0,250').split(',').map(Number);
 assert(delays.length>=1&&delays.length<=2&&delays.every(d=>[0,250].includes(d))&&new Set(delays).size===delays.length);
 const report={startedAt:new Date().toISOString(),revision,service,passed:false,scope:'Actual Chrome 3D game with synthetic controls, normal animation/server clocks, real Azure HTTPS; browser-routed local test frontend and disposable SQLite accounts; no public frontend deployment',players:[],blockedOrigins:[],errors:[]};
 const directory=path.resolve('artifacts/verification/azure-browser-'+Date.now());fs.mkdirSync(directory,{recursive:true});
 const gameRoot=buildStaging({LPR_TEST_SERVICE_URL:service,LPR_TEST_LEADERBOARD_URL:accounts,LPR_TEST_ANALYTICS_URL:analytics},path.join(directory,'game'));
 const board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision,origins:origin});
 await new Promise(r=>board.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+board.address().port;
 const players=[],sensitive=[];let browser,cleaning=false;
 const metrics=async()=>{const r=await fetch(service+'/metrics',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(90000)});assert.equal(r.status,200);return r.json();};
 try{
  const before=await metrics();assert.equal(before.activeSessions,0);assert.equal(before.maxSessions,2);report.before=before;
  browser=await launchBrowser({headless:true,args:['--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});report.browser=browser.version();
  for(const [index,delayMs]of delays.entries()){
   const context=await browser.newContext({viewport:{width:1280,height:800},locale:'fi-FI',timezoneId:'Europe/Helsinki'}),page=await context.newPage();
   const nickname='Azure Browser '+index+' '+randomBytes(2).toString('hex'),password=randomBytes(24).toString('hex');sensitive.push(password);
   const player={context,page,nickname,delayMs,latencies:[],statuses:[],states:[],timings:[]};players.push(player);
   page.on('pageerror',e=>report.errors.push(e.message));
   page.on('requestfinished',async request=>{if(request.url().startsWith(service)&&new URL(request.url()).pathname.endsWith('/inputs')){
    try{const t=request.timing(),response=await request.response();player.latencies.push(t.responseEnd);player.statuses.push({status:response?.status(),cleanup:cleaning});
     if(response?.ok()){const d=await response.json();player.timings.push({seq:d.seq,ackTick:d.ackTick,arrivalLagMs:d.eligibility?.lagMs,ackLagMs:d.serverElapsedMs-d.ackTick*1000/120,eligible:d.eligibility?.eligible});}
    }catch(e){if(!page.isClosed())report.errors.push(e.message);}
   }});
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===service){if(url.pathname.endsWith('/inputs')&&delayMs)await sleep(delayMs);return route.continue();}
    if(url.origin===accounts){
     const headers={Origin:origin};for(const name of ['authorization','content-type'])if(request.headers()[name])headers[name]=request.headers()[name];
     const response=await fetch(local+url.pathname+url.search,{method:request.method(),headers,...(!['GET','HEAD'].includes(request.method())?{body:request.postDataBuffer()}:{}),redirect:'error'});
     const outgoing=Object.fromEntries(response.headers);for(const name of ['connection','keep-alive','transfer-encoding','content-length','content-encoding'])delete outgoing[name];
     return route.fulfill({status:response.status,headers:outgoing,body:Buffer.from(await response.arrayBuffer())});
    }
    if(url.origin===analytics)return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,version:'lut-20261024-v4',results:[]})});
    // Keep optional web fonts offline without treating them as a game API leak.
    if(url.origin==='https://fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
    if(url.origin===origin){
     const file=path.resolve(gameRoot,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));assert(file.startsWith(gameRoot+path.sep));
     if(!fs.existsSync(file))return route.fulfill({status:404,body:'Not found'});
     const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
     let body=fs.readFileSync(file);
     if(path.basename(file)==='game.js'){
      let source=body.toString().replaceAll('\r\n','\n');
      assert(source.includes('  function readInput() {')&&source.includes('  reset();\n  openTestScene'));
      source=source.replace('  function readInput() {','  function readInput() {\n    if(drivingWorld&&window.__azureDriver)return window.__azureDriver(drivingWorld);');
      source=source.replace('  reset();\n  openTestScene','  window.__azureGame={get world(){return drivingWorld}};\n  reset();\n  openTestScene');body=Buffer.from(source);
     }
     return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body});
    }
    report.blockedOrigins.push(url.origin);return route.abort();
   });
   await page.addInitScript(()=>{localStorage.setItem('lpr-release-notes-seen','2026-10-27-major-update');window.__azureFrames={count:0,maxGapMs:0,started:performance.now(),last:performance.now()};const observe=t=>{const f=window.__azureFrames;f.count++;f.maxGapMs=Math.max(f.maxGapMs,t-f.last);f.last=t;requestAnimationFrame(observe);};requestAnimationFrame(observe);});
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__azureGame,null,{timeout:30000});
   await page.evaluate(source=>{window.__azureDriver=eval('('+source+')');},driver.toString());
   await page.click('#leaderboard-login');await page.click('#leaderboard-create');await page.fill('#leaderboard-name',nickname);await page.fill('#leaderboard-password',password);
   await page.click('#leaderboard-start');await page.click('label:has(#leaderboard-series-bot)');await page.click('#leaderboard-start');
   await page.waitForFunction(()=>!!window.LPRLeaderboard.identity&&!window.LPRLeaderboard.requiresName,null,{timeout:30000});
  }
  report.drivingStartedAt=new Date().toISOString();
  await Promise.all(players.map(async p=>{await p.page.click('#leaderboard-drive');await p.page.setViewportSize({width:640,height:480});await p.page.waitForFunction(()=>window.LPRVerifiedDriving.active,null,{timeout:90000});}));
  console.log('Actual browser game: request delays '+delays.join(', ')+' ms started');
  for(let second=0;second<300;second++){
   await sleep(1000);
   for(const p of players){
    const state=await p.page.evaluate(()=>{const f=window.__azureFrames;return {active:window.LPRVerifiedDriving.active,eligible:window.LPRVerifiedDriving.lapEligible,ackTick:window.LPRVerifiedDriving.ackTick,ticks:window.__azureGame.world?.result().ticks,lap:window.__azureGame.world?.result().lap,status:document.querySelector('#verification-status').textContent,hidden:document.hidden,averageFps:f.count*1000/(performance.now()-f.started),maxFrameGapMs:f.maxGapMs,mismatch:window.LPRVerificationDiagnostics.lastMismatch};});
    p.states.push(state);assert(state.active,`Browser +${p.delayMs} ms lost verification: ${state.status}`);assert(state.eligible,`Browser +${p.delayMs} ms entered practice`);assert.equal(state.mismatch,null);
   }
   if(second%30===0)console.log(JSON.stringify({elapsedSeconds:second+1,players:players.map(p=>({delayMs:p.delayMs,...p.states.at(-1)}))}));
   const rows=board.db.prepare('SELECT nickname,COUNT(*) n FROM verified_laps GROUP BY nickname').all();
   if(rows.length===players.length&&rows.every(row=>row.n>=2)){
    assert.equal(report.errors.length,0);assert.equal(report.blockedOrigins.length,0);
    for(const p of players){await p.page.screenshot({path:path.join(directory,'browser-delay-'+p.delayMs+'.png')});}
    report.passed=true;report.laps=board.db.prepare('SELECT nickname,lap,lap_ticks FROM verified_laps ORDER BY nickname,lap').all();break;
   }
  }
  assert(report.passed,'Browsers did not save standing and flying laps within 300 seconds');
 }catch(e){report.error=sensitive.reduce((message,value)=>message.replaceAll(value,'[redacted]'),e.message);for(const p of players){try{await p.page.screenshot({path:path.join(directory,'failed-delay-'+p.delayMs+'.png')});}catch{}}}
 finally{
  cleaning=true;
  for(const p of players){try{await p.page.evaluate(()=>window.LPRVerifiedDriving?.cancel(null));}catch{}}
  await sleep(1500);if(browser)await browser.close();
  try{report.after=await metrics();if(report.after.activeSessions!==0){report.passed=false;report.cleanupError='Active sessions remain';}}catch(e){report.passed=false;report.cleanupError=e.message;}
  for(const p of players){const latency=p.latencies.filter(Number.isFinite).sort((a,b)=>a-b);report.players.push({addedRequestDelayMs:p.delayMs,responseP95Ms:latency[Math.ceil(latency.length*.95)-1],httpErrors:p.statuses.filter(s=>s.status!==200&&!s.cleanup).length,non200Responses:p.statuses.filter(s=>s.status!==200),lastState:p.states.at(-1),samples:p.states,timingSamples:p.timings});}
  await new Promise(r=>board.close(r));report.finishedAt=new Date().toISOString();report.artifactDirectory=directory;
  const output=path.resolve(process.env.AZURE_BROWSER_REPORT||'artifacts/verification/azure-browser-report.json');fs.writeFileSync(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,error:report.error,cleanupError:report.cleanupError,players:report.players.map(p=>({...p,samples:undefined,timingSamples:undefined})),laps:report.laps,blockedOrigins:report.blockedOrigins,errors:report.errors,report:output}));if(!report.passed)process.exitCode=1;
 }
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
