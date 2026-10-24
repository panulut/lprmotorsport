// Real 3D game in Chromium; synthetic controls and accelerated server clock.
// This checks browser/server agreement, not human driving or remote capacity.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {driver}=require('../tests/helpers-driving.cjs');
(async()=>{
 const secret='browser-test-only-'.repeat(4),{revision}=require('../verification/world.cjs');
 let clock=0,browser;
 const game=require('../server.js').createServer();
 await new Promise(r=>game.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${game.address().port}`;
 const service=await require('../verification/server.cjs').createServer({secret,origins:[origin],sessionsOptions:{clock:()=>clock}});
 const board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision,origins:origin});
 await new Promise(r=>service.listen(0,'127.0.0.1',r));await new Promise(r=>board.listen(0,'127.0.0.1',r));
 const serviceURL=`http://127.0.0.1:${service.address().port}`,boardURL=`http://127.0.0.1:${board.address().port}`;
 try{
  browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.route('**/verification/config.js',route=>route.fulfill({contentType:'text/javascript',body:`window.LPRVerificationConfig=${JSON.stringify({service:serviceURL,leaderboard:boardURL})};`}));
  let firstHealth=true,releaseHealth;
  const healthGate=new Promise(resolve=>{releaseHealth=resolve;});
  await page.route(serviceURL+'/health',async route=>{
   if(firstHealth){firstHealth=false;await healthGate;}
   await route.continue();
  });
  await page.route('https://lpr-leaderboard.panu-musakka.workers.dev/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:'lut-20261011-v3',results:[]})}));
  await page.route('**/game.js?*',route=>{
   let source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replaceAll('\r\n','\n');
   source=source.replace('  function readInput() {','  function readInput() {\n    if(window.__input)return {...window.__input};');
   source=source.replace('  reset();\n  openTestScene',`  window.__verifiedGame={update,held,updateDriving,reset,get car(){return car},get world(){return drivingWorld},render(){renderer.render(car,performance.now());}};\n  reset();\n  openTestScene`);
   return route.fulfill({contentType:'text/javascript',body:source});
  });
  await page.goto(origin);await page.waitForFunction(()=>window.__verifiedGame,null,{polling:20});
  const controls=Array.from({length:180},(_,i)=>[1,i>150?.2:0,i<60?.3:i<120?-.3:0,i>=60,i>=120,i<90]);
  const local=require('../verification/world.cjs').createWorld();for(const input of controls)local.world.step(local.api.decode(input));
  const browserControls=await page.evaluate(inputs=>{const world=window.LPRDriving.create();for(const input of inputs)world.step(window.LPRDriving.decode(input));return world.result();},controls);
  const expectedControls=local.world.result();
  for(const key of Object.keys(expectedControls.state))assert(Math.abs(browserControls.state[key]-expectedControls.state[key])<1e-7,`Browser control state matches: ${key}`);
  assert.deepEqual({...browserControls,state:null},{...expectedControls,state:null},'Keyboard, gamepad, wheel and traction-control transitions match across browser and server');
  await page.fill('#leaderboard-name','Browser Driver');await page.click('#leaderboard-start');
  assert(await page.evaluate(()=>window.LPRLeaderboard.requiresName&&!window.LPRVerifiedDriving.active),'Consent is required before driving starts');
  await page.check('#analytics-consent');await page.click('#leaderboard-start');
  const startArtifacts=path.resolve(__dirname,'../artifacts/verification');fs.mkdirSync(startArtifacts,{recursive:true});
  assert.equal(await page.locator('#start-lights').getAttribute('data-phase'),'red');
  await page.evaluate(()=>window.__verifiedGame.render());
  await page.screenshot({path:path.join(startArtifacts,'start-red-desktop.png')});
  const practice=await page.evaluate(()=>{
   const game=window.__verifiedGame,before=game.car.x;game.held.gas=true;
   for(let i=0;i<60;i++)game.update(1/120,i*1000/120,performance.now()+i*1000/120);
   game.held.gas=false;
   return {moved:Math.abs(game.car.x-before)>0.1,preparing:window.LPRVerifiedDriving.preparing,active:window.LPRVerifiedDriving.active};
  });
  assert(practice.preparing&&!practice.moved&&!practice.active,'Red lights hold the car while verification prepares');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.__verifiedGame.render());
  await page.screenshot({path:path.join(startArtifacts,'start-red-mobile.png')});
  await page.setViewportSize({width:1280,height:800});
  releaseHealth();
  await page.waitForFunction(()=>window.LPRVerifiedDriving.active,{},{timeout:40000,polling:20}).catch(async error=>{console.error({errors,status:await page.textContent('#verification-status')});throw error;});
  assert.equal(await page.locator('#start-lights').getAttribute('data-phase'),'green','Green lights require an activated session');
  await page.screenshot({path:path.join(startArtifacts,'start-green.png')});
  await page.evaluate(source=>{window.__driver=eval('('+source+')');},driver.toString());
  console.log('Browser verified session started');
  let ticks=0;
  for(let batch=0;batch<500;batch++){
   clock=(ticks+60)*1000/120;
   const result=await page.evaluate(()=>{
    const game=window.__verifiedGame;
    for(let i=0;i<60;i++){window.__input=window.__driver(game.world);game.updateDriving(game.world.result().ticks*1000/120);}
    return {state:game.world.result(),active:window.LPRVerifiedDriving.active,status:document.querySelector('#verification-status').textContent};
   });
   ticks=result.state.ticks;
   assert(result.active,result.status);assert(!result.state.crashed,'Browser driver does not crash');
   // A finish can split a batch; the next lap may retain up to 59 unsent inputs.
   await page.waitForFunction(tick=>!window.LPRVerifiedDriving.active||window.LPRVerifiedDriving.ackTick>=tick-59,ticks,{timeout:10000,polling:20});
   assert(await page.evaluate(()=>window.LPRVerifiedDriving.active),await page.textContent('#verification-status'));
   if(result.state.lap>=3)break;
  }
  await page.waitForFunction(()=>document.querySelector('#verification-status').textContent.includes('tallennettu'),{},{timeout:10000,polling:20});
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_laps').get().n,2,'Browser standing and flying laps saved');
  await page.evaluate(()=>window.__verifiedGame.render());
  const artifacts=path.resolve(__dirname,'../artifacts/verification');fs.mkdirSync(artifacts,{recursive:true});
  await page.screenshot({path:path.join(artifacts,'verified-3d.png')});
  // Tamper with local physics; the next server acknowledgment must force practice.
  await page.evaluate(()=>{window.__verifiedGame.world.car.x+=100;});
  clock=(ticks+60)*1000/120;
  await page.evaluate(()=>{for(let i=0;i<60;i++){window.__input=window.__driver(window.__verifiedGame.world);window.__verifiedGame.updateDriving(0);}});
  await page.waitForFunction(()=>!window.LPRVerifiedDriving.active,{},{timeout:10000,polling:20});
  assert.match(await page.textContent('#verification-status'),/Harjoittelu/);
  // Restart, then change engine power rather than submitting a false time.
  await page.click('#restart-button');
  await page.waitForFunction(()=>window.LPRVerifiedDriving.active,null,{timeout:40000,polling:20});
  clock+=500;
  await page.evaluate(()=>{
   const world=window.__verifiedGame.world;
   world.dynamics.parameters.peakDriveForce*=5;world.dynamics.parameters.peakPower*=5;
   for(let i=0;i<60;i++){window.__input={gas:1,brake:0,steer:0,analog:false,wheel:false};window.__verifiedGame.updateDriving(0);}
  });
  await page.waitForFunction(()=>!window.LPRVerifiedDriving.active,{},{timeout:10000,polling:20});
  assert.match(await page.textContent('#verification-status'),/Harjoittelu/,'Altered engine power cannot remain verified');
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_laps').get().n,2);
  await page.evaluate(()=>{const consent=document.querySelector('#analytics-consent');consent.checked=false;consent.dispatchEvent(new Event('change'));});
  assert(await page.evaluate(()=>window.LPRLeaderboard.requiresName&&document.querySelector('#settings-dialog').open),'Withdrawing consent pauses driving');
  assert.deepEqual(errors,[]);
  const report={generatedAt:new Date().toISOString(),browser:browser.version(),revision,ticks,verifiedLaps:2,
   scope:'Real 3D game with synthetic controls and accelerated server clock; no remote/human capacity claim',automaticStart:true,automaticRestart:true,startLights:true,heldDuringPreparation:true,consentRequired:true,tamperedPhysicsRejected:true,tamperedPowerRejected:true,errors};
  fs.writeFileSync(path.join(artifacts,'browser-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }finally{if(browser)await browser.close();await service.sessions.close();await Promise.all([game,service,board].map(server=>new Promise(r=>server.close(r))));}
})().catch(error=>{console.error(error);process.exitCode=1;});
