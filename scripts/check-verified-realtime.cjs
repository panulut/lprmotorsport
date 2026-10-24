// Two real-time browser clients, full 3D rendering, unmodified monotonic server clock.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{driver}=require('../tests/helpers-driving.cjs');
(async()=>{
 const secret='real-time-local-test-'.repeat(4),{revision}=require('../verification/world.cjs');let browser;
 const game=require('../server.js').createServer();await new Promise(r=>game.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${game.address().port}`;
 const service=await require('../verification/server.cjs').createServer({secret,origins:[origin]});
 const board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision,origins:origin});
 await new Promise(r=>service.listen(0,'127.0.0.1',r));await new Promise(r=>board.listen(0,'127.0.0.1',r));
 const serviceURL=`http://127.0.0.1:${service.address().port}`,boardURL=`http://127.0.0.1:${board.address().port}`;
 const errors=[],players=[];
 try{
  browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-swiftshader']});
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:640,height:480}}),page=await context.newPage();
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/verification/config.js',route=>route.fulfill({contentType:'text/javascript',body:`window.LPRVerificationConfig=${JSON.stringify({service:serviceURL,leaderboard:boardURL})};`}));
   await page.route('https://lpr-leaderboard.panu-musakka.workers.dev/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:'lut-20261011-v3',results:[]})}));
   await page.route('**/game.js?*',route=>{
    let source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replaceAll('\r\n','\n');
    source=source.replace('  function readInput() {',`  function readInput() {\n    if(drivingWorld&&window.__driver)return window.__driver(drivingWorld);`);
    source=source.replace('  reset();\n  openTestScene',`  window.__verifiedGame={get world(){return drivingWorld}};\n  reset();\n  openTestScene`);
    return route.fulfill({contentType:'text/javascript',body:source});
   });
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__verifiedGame);
   await page.evaluate(source=>{window.__driver=eval('('+source+')');},driver.toString());
   await page.fill('#leaderboard-name','Realtime '+(i+1));await page.check('#analytics-consent');
   players.push({page,context});
  }
  const started=performance.now();
  await Promise.all(players.map(async player=>{await player.page.click('#leaderboard-start');await player.page.waitForFunction(()=>window.LPRVerifiedDriving.active,null,{timeout:40000});}));
  console.log('Two real-time 3D browser sessions started');
  for(let second=0;second<180;second++){
   await new Promise(r=>setTimeout(r,1000));
   const states=await Promise.all(players.map(player=>player.page.evaluate(()=>({active:window.LPRVerifiedDriving.active,tick:window.LPRVerifiedDriving.ackTick,
    simulated:window.__verifiedGame.world?.result().ticks||0,status:document.querySelector('#verification-status').textContent,hidden:document.hidden}))));
   if(second%15===0)console.log(JSON.stringify({elapsedSeconds:second+1,states}));
   for(const state of states)assert(state.active,state.status);
   if(board.db.prepare('SELECT COUNT(*) n FROM verified_laps').get().n>=2){
    assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),revision,browser:browser.version(),wallMs:performance.now()-started,
     scope:'Two simultaneous local Chrome clients, real 3D rendering, synthetic controls, real server clock; no remote capacity claim',
     states,laps:board.db.prepare('SELECT nickname,lap,lap_ticks,sector1,sector2,sector3 FROM verified_laps ORDER BY nickname').all(),errors};
    const directory=path.resolve(__dirname,'../artifacts/verification');fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,'realtime-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));return;
   }
  }
  throw Error('Two real-time laps did not complete in three minutes');
 }finally{if(browser)await browser.close();await service.sessions.close();await Promise.all([game,service,board].map(server=>new Promise(r=>server.close(r))));}
})().catch(error=>{console.error(error);process.exitCode=1;});
