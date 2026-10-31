// Real 3D game in Chromium; synthetic controls and accelerated server clock.
// This checks browser/server agreement, not human driving or remote capacity.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launchBrowser}=require('./browser.cjs');
const {driver}=require('../tests/helpers-driving.cjs');
(async()=>{
 const secret='browser-test-only-'.repeat(4),adminToken='browser-admin-test-only-'.repeat(3),{revision}=require('../verification/world.cjs');
 const guestMode=process.argv.includes('--guest');
 let clock=0,browser,releaseHealth;
 const game=require('../server.js').createServer();
 await new Promise(r=>game.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${game.address().port}`;
 const service=await require('../verification/server.cjs').createServer({secret,origins:[origin],sessionsOptions:{clock:()=>clock}});
 const board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision,origins:origin,adminToken});
 await new Promise(r=>service.listen(0,'127.0.0.1',r));await new Promise(r=>board.listen(0,'127.0.0.1',r));
 const serviceURL=`http://127.0.0.1:${service.address().port}`,boardURL=`http://127.0.0.1:${board.address().port}`;
 try{
  browser=await launchBrowser({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.route('**/verification/config.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.LPRVerificationConfig=${JSON.stringify({service:serviceURL,leaderboard:boardURL})};`}));
  let firstHealth=true;
  const healthGate=new Promise(resolve=>{releaseHealth=resolve;});
  await page.route(serviceURL+'/health',async route=>{
   if(firstHealth){firstHealth=false;await healthGate;}
   await route.continue();
  });
  await page.route('https://lpr-leaderboard.panu-musakka.workers.dev/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:'lut-20261011-v3',results:[]})}));
  await page.route('**/game.js?*',route=>{
   let source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replaceAll('\r\n','\n');
   source=source.replace('  function readInput() {','  function readInput() {\n    if(window.__input)return {...window.__input};');
   source=source.replace('  reset();\n  openTestScene',`  window.__verifiedGame={update,held,updateDriving,reset,get car(){return car},get world(){return drivingWorld},get timing(){return timing},render(){renderer.render(car,performance.now());}};window.__traceFromVerifiedReplay=verifiedReplayTrace;\n  reset();\n  openTestScene`);
   return route.fulfill({contentType:'text/javascript',body:source});
  });
  await page.addInitScript(()=>localStorage.setItem('lpr-release-notes-seen','2026-10-27-major-update'));
  await page.goto(origin);await page.waitForFunction(()=>window.__verifiedGame,null,{polling:20});
  await page.evaluate(()=>{window.__deltaSamples=[];document.addEventListener('lpr-sector-live-delta',event=>window.__deltaSamples.push(event.detail.delta));});
  const controls=Array.from({length:180},(_,i)=>[1,i>150?.2:0,i<60?.3:i<120?-.3:0,i>=60,i>=120,i<90]);
  const local=require('../verification/world.cjs').createWorld();for(const input of controls)local.world.step(local.api.decode(input));
  const browserControls=await page.evaluate(inputs=>{const world=window.LPRDriving.create();for(const input of inputs)world.step(window.LPRDriving.decode(input));return world.result();},controls);
  const expectedControls=local.world.result();
  for(const key of Object.keys(expectedControls.state))assert(Math.abs(browserControls.state[key]-expectedControls.state[key])<1e-7,`Browser control state matches: ${key}`);
  assert.deepEqual({...browserControls,state:null},{...expectedControls,state:null},'Keyboard, gamepad, wheel and traction-control transitions match across browser and server');
  const startArtifacts=path.resolve(__dirname,'../artifacts/verification');fs.mkdirSync(startArtifacts,{recursive:true});
  if(guestMode){
   await page.click('#leaderboard-practice');
   await page.fill('#leaderboard-guest-name','Browser Driver');await page.selectOption('#leaderboard-guest-series','human');await page.click('#leaderboard-guest-start');
   await page.waitForFunction(()=>window.LPRLeaderboard.identity?.guest,null,{polling:20}).catch(async error=>{console.error({errors,status:await page.textContent('#leaderboard-status'),guest:await page.evaluate(()=>!!window.LPRLeaderboard.identity?.guest)});throw error;});
   assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_accounts').get().n,0);
   assert(!await page.evaluate(()=>window.LPRVerifiedDriving.active),'Guest selection keeps the lobby open');
  }else{
  await page.click('#leaderboard-login');
  await page.click('#leaderboard-create');
  await page.fill('#leaderboard-name','Browser Driver');
  await page.fill('#leaderboard-password','browser-test-password');
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_accounts').get().n,0,'Selecting registration does not create an account before submitting');
  await page.click('#leaderboard-start');
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_accounts').get().n,0,'Credentials alone do not create an account before the series is chosen');
  await page.click('#leaderboard-start');
  assert.match(await page.locator('#leaderboard-status').textContent(),/Valitse ihmisten tai bottien sarja/);
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_accounts').get().n,0,'An explicit series choice is required');
  await page.click('label:has(#leaderboard-series-human)');
  await page.click('#leaderboard-start');
  await page.waitForFunction(()=>!!window.LPRLeaderboard.identity&&!window.LPRLeaderboard.requiresName,null,{polling:50}).catch(async error=>{console.error({status:await page.textContent('#leaderboard-status'),label:await page.textContent('#leaderboard-start-label'),errors});throw error;});
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_accounts').get().n,1,'Confirmed registration creates the account');
  assert.equal(await page.inputValue('#leaderboard-password'),'','The password is cleared after sign-in');
  assert(await page.locator('#settings-dialog').evaluate(d=>d.open),'Sign-in keeps the player in the lobby');
  assert(!await page.evaluate(()=>window.LPRVerifiedDriving.active),'Sign-in does not start driving');
  }
  await page.click('#leaderboard-drive');
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
  let ticks=0,promoted=false;
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
   if(guestMode&&!promoted&&board.db.prepare('SELECT COUNT(*) n FROM verified_laps').get().n===1){
    const before=board.db.prepare('SELECT * FROM verified_laps').all();
    const beforeToken=await page.evaluate(()=>window.LPRLeaderboard.identity.token);
    assert.equal((await (await fetch(boardURL+'/api/verified/leaderboard')).json()).results[0].nickname,'Browser Driver (vierailija)');
    assert.equal(board.db.prepare('SELECT COUNT(*) n FROM championship_laps').get().n,0);
    await page.locator('#guest-register-panel summary').click();
    await page.fill('#guest-register-name','Browser Driver');await page.fill('#guest-register-password','browser-test-password');
    await page.click('#guest-register-form button');
    await page.waitForFunction(()=>window.LPRLeaderboard.identity&&!window.LPRLeaderboard.identity.guest,null,{polling:20});
    assert(await page.evaluate(()=>window.LPRVerifiedDriving.active),'Registration never stops the verified drive');
    assert.equal(await page.evaluate(()=>window.LPRLeaderboard.identity.token),beforeToken);
    assert.deepEqual(board.db.prepare('SELECT * FROM verified_laps').all(),before);
    assert.equal(board.db.prepare('SELECT COUNT(*) n FROM championship_laps').get().n,1,'The original guest lap now earns open-day points');
    assert.equal((await (await fetch(boardURL+'/api/verified/leaderboard')).json()).results[0].nickname,'Browser Driver');
    await page.waitForFunction(()=>document.querySelector('#record-holder').textContent==='Browser Driver',null,{polling:20});
    assert.equal(await page.inputValue('#guest-register-password'),'');
    promoted=true;
   }
   if(result.state.lap>=3)break;
  }
  await page.waitForFunction(()=>document.querySelector('#verification-status').textContent.includes('tallennettu'),{},{timeout:10000,polling:20});
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_laps').get().n,2,'Browser standing and flying laps saved');
  const verifiedDelta=await page.evaluate(()=>{
   const record=JSON.parse(localStorage.getItem('lpr-best-sectors-lut-20261011-v3')||'null');
   return {traceLength:record?.trace?.length||record?.referenceTrace?.length||0,deltaSamples:window.__deltaSamples.filter(Number.isFinite),referenceTime:window.__verifiedGame.timing.referenceLapTime,
    displayedDelta:document.querySelector('#sector-delta')?.textContent.trim(),displayedState:document.querySelector('#sector-delta')?.parentElement?.dataset.state};
  });
  assert(verifiedDelta.traceLength>10000,'A full 120 Hz clean verified lap is retained beyond the former 10,000-sample limit');
  assert(verifiedDelta.deltaSamples.length>0,'The actual verified game loop emits position-matched delta during a later lap');
  const shownDelta=verifiedDelta.deltaSamples.at(-1),shownDeltaText=shownDelta<0?`−${(Math.abs(shownDelta)/1000).toFixed(3)}`:shownDelta>0?`+${(shownDelta/1000).toFixed(3)}`:'0.000';
  assert.notEqual(verifiedDelta.displayedDelta,'—','The Delta panel displays the live trace comparison');
  assert.equal(verifiedDelta.displayedDelta,shownDeltaText,'The visible Delta matches the most recent mini-sector event');
  assert.equal(verifiedDelta.displayedState,shownDelta<0?'faster':shownDelta>0?'slower':'even','The visible Delta state follows the comparison sign');
  // A second game tab must be able to recover the signed-in driver's clean PB
  // trace from the authenticated timing-panel pointer and public replay frames.
  await page.evaluate(()=>{
   const key='lpr-best-sectors-lut-20261011-v3',record=JSON.parse(localStorage.getItem(key)||'null');
   if(record){delete record.trace;delete record.referenceTrace;localStorage.setItem(key,JSON.stringify(record));}
  });
  const recoveryPage=await context.newPage();
  recoveryPage.on('pageerror',error=>errors.push('recovery: '+error.message));
  await recoveryPage.route('**/verification/config.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.LPRVerificationConfig=${JSON.stringify({service:serviceURL,leaderboard:boardURL})};`}));
  await recoveryPage.route('**/game.js?*',route=>{
   let source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8').replaceAll('\r\n','\n');
   source=source.replace('  function readInput() {','  function readInput() {\n    if(window.__input)return {...window.__input};');
   source=source.replace('  reset();\n  openTestScene',`  window.__verifiedGame={update,held,updateDriving,reset,get car(){return car},get world(){return drivingWorld},get timing(){return timing},render(){renderer.render(car,performance.now());}};window.__traceFromVerifiedReplay=verifiedReplayTrace;\n  reset();\n  openTestScene`);
   return route.fulfill({contentType:'text/javascript',body:source});
  });
  await recoveryPage.addInitScript(()=>localStorage.setItem('lpr-release-notes-seen','2026-10-27-major-update'));
  await recoveryPage.goto(origin);
  await recoveryPage.waitForFunction(()=>window.LPRLeaderboard?.accountIdentity,null,{timeout:10000,polling:50});
  await recoveryPage.click('#leaderboard-drive');
  await recoveryPage.waitForFunction(()=>!!window.LPRLeaderboard?.identity,null,{timeout:10000,polling:50});
  await recoveryPage.waitForFunction(()=>window.__verifiedGame?.timing?.bestTrace?.length>100,{},{timeout:15000,polling:50}).catch(async error=>{
   const diagnosis=await recoveryPage.evaluate(async()=>{
    const identity=window.LPRLeaderboard?.identity,config=window.LPRVerificationConfig;
    let panel=null,replay=null;
    if(identity?.token){const r=await fetch(config.leaderboard+'/api/verified/timing-panel?series=human',{headers:{Authorization:'Bearer '+identity.token}});panel={status:r.status,data:await r.json()};
     const pointer=panel.data?.personalBest?.replay;if(pointer){const rr=await fetch(config.leaderboard+'/api/verified/replays/'+pointer.sessionId+'/'+pointer.lap);const data=await rr.json();
      replay={status:rr.status,summary:{format:data.format,sceneRevision:data.sceneRevision,hz:data.hz,startTick:data.startTick,endTick:data.endTick,frameCount:data.frames?.length,first:data.frames?.[0],last:data.frames?.at(-1),trackCount:data.track?.length},converted:window.__traceFromVerifiedReplay?.(data,panel.data.personalBest.lap_ms)?.length||0};}}
    return {identity:!!identity,series:identity?.series,traceLength:window.__verifiedGame?.timing?.bestTrace?.length||0,panel,replay};
   });
   console.error(JSON.stringify({recoveryDiagnosis:diagnosis,pageErrors:errors},null,2));throw error;
  });
  const recovered=await recoveryPage.evaluate(()=>({time:window.__verifiedGame.timing.referenceLapTime,
   samples:window.__verifiedGame.timing.bestTrace.length,personalBest:window.__verifiedGame.timing.traceIsPersonalBest}));
  assert(recovered.samples>100,'A saved public replay restores a usable position trace');
  assert(recovered.personalBest,'Only the authenticated personal-best replay is marked as PB');
  await recoveryPage.close();
  if(guestMode)assert(promoted,'The guest registered between the two actual laps');
  await page.evaluate(()=>window.__verifiedGame.render());
  const artifacts=path.resolve(__dirname,'../artifacts/verification');fs.mkdirSync(artifacts,{recursive:true});
  await page.screenshot({path:path.join(artifacts,'verified-3d.png')});
  // Exercise the real replay DOM/WebGL renderer and moderation UI with a saved lap.
  await page.evaluate(()=>window.LPRVerifiedDriving.refresh());
  const link=page.locator('#verified-list .replay-link').first();
  const replayHref=await link.getAttribute('href');
  assert(replayHref,'A saved TOP 10 lap has a replay link');
  const viewer=await page.context().newPage();viewer.on('pageerror',error=>errors.push(error.message));
  await viewer.route('**/verification/config.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.LPRVerificationConfig=${JSON.stringify({service:serviceURL,leaderboard:boardURL})};`}));
  await viewer.goto(origin+'/'+replayHref);
  await viewer.waitForFunction(()=>!document.querySelector('#viewer').hidden);
  assert(await viewer.locator('#driver-view').isVisible(),'Replay renders the driver-seat view with real WebGL');
  assert.equal(await viewer.locator('#view-note').textContent(),'','Current visual recordings need no fallback');
  await viewer.locator('#seek').fill('0.5');
  const replayTimes=(await viewer.locator('#clock').textContent()).match(/[\d.]+/g).map(Number);
  assert(Math.abs(replayTimes[0]-replayTimes[1]/2)<0.002,'The replay timeline seeks into the saved lap');
  await viewer.locator('#play').click();
  await viewer.waitForFunction(()=>document.querySelector('#play').textContent.includes('Tauko'));
  await viewer.locator('#play').click();
  await viewer.locator('#report-send').click();
  await viewer.waitForFunction(()=>document.querySelector('#report-status').textContent.includes('Omasta'));
  const observer=await (await fetch(boardURL+'/api/verified/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'Replay Observer',password:'browser-observer-password',create:true,series:'bot'})})).json();
  assert.equal(observer.series,'bot');
  await viewer.evaluate(account=>localStorage.setItem('lpr-account',JSON.stringify(account)),observer);
  await viewer.reload();await viewer.waitForFunction(()=>!document.querySelector('#viewer').hidden);
  await viewer.locator('#report-note').fill('Selainkokeen tarkastuspyyntö');await viewer.locator('#report-send').click();
  await viewer.waitForFunction(()=>document.querySelector('#report-status').textContent.includes('Kiitos'));
  await viewer.goto(origin+'/replay.html?admin=1');
  await viewer.locator('#token').fill(adminToken);await viewer.locator('#login button').click();
  await viewer.waitForFunction(()=>!document.querySelector('#admin-tools').hidden);
  await viewer.locator('#flagged').check();await viewer.waitForFunction(()=>document.querySelectorAll('#runs > tr').length===1);
  assert.match(await viewer.locator('#runs').textContent(),/Browser Driver/);
  await viewer.locator('#runs button').filter({hasText:'kpl'}).click();
  await viewer.waitForFunction(()=>document.querySelector('#runs').textContent.includes('Selainkokeen tarkastuspyyntö'));
  assert.match(await viewer.locator('#runs').textContent(),/Replay Observer.*Selainkokeen tarkastuspyyntö/s);
  const seriesSelect=viewer.locator('select[aria-label="Kuljettajan sarja"]').first();
  await seriesSelect.selectOption('bot');
  await viewer.waitForFunction(()=>document.querySelector('select[aria-label="Kuljettajan sarja"]')?.value==='bot'&&!document.querySelector('select[aria-label="Kuljettajan sarja"]').disabled);
  const humanBoard=await (await fetch(boardURL+'/api/verified/leaderboard?series=human')).json();
  const botBoard=await (await fetch(boardURL+'/api/verified/leaderboard?series=bot')).json();
  assert.equal(humanBoard.results.length,0);assert.equal(botBoard.results.length,2,'Admin series changes move both laps');
  await viewer.locator('select[aria-label="Kuljettajan sarja"]').first().selectOption('human');
  await viewer.waitForFunction(()=>document.querySelector('select[aria-label="Kuljettajan sarja"]')?.value==='human'&&!document.querySelector('select[aria-label="Kuljettajan sarja"]').disabled);
  await viewer.locator('#lock').click();assert(await viewer.locator('#admin-tools').isHidden());
  // Restore the original page's account after the observer used shared storage.
  await page.evaluate(()=>localStorage.setItem('lpr-account',JSON.stringify({...window.LPRLeaderboard.identity,expiresAt:Date.now()+60000})));
  await viewer.close();
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
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM championship_laps').get().n,2,'Both actual driven laps also enter the daily race');
  const daily=await (await fetch(boardURL+'/api/verified/championship?series=human')).json();
  assert.equal(daily.fastest[0].laps,2,'Driving updates daily count without duplicating retries');
  await page.evaluate(()=>{const consent=document.querySelector('#analytics-consent');consent.checked=false;consent.dispatchEvent(new Event('change'));});
  assert(await page.evaluate(()=>!window.LPRLeaderboard.requiresName&&!!window.LPRLeaderboard.identity),'Withdrawing analytics consent keeps leaderboard participation');
  assert.deepEqual(errors,[]);
  const report={generatedAt:new Date().toISOString(),browser:browser.version(),revision,ticks,verifiedLaps:2,
   guestPromotion:guestMode,verifiedTraceCapture:true,verifiedDeltaSamples:verifiedDelta.deltaSamples.length,verifiedTraceSamples:verifiedDelta.traceLength,
   serverReplayTraceRecovery:true,recoveredReplaySamples:recovered.samples,
   scope:'Real 3D game with synthetic controls and accelerated server clock; no remote/human capacity claim',explicitDriveRequired:true,rollingStartMetres:200,automaticRestart:true,startLights:true,heldDuringPreparation:true,optionalAnalytics:true,driverSeatReplay:true,replaySeek:true,viewerReports:true,adminSeriesMoves:true,dailyChampionship:true,tamperedPhysicsRejected:true,tamperedPowerRejected:true,errors};
  fs.writeFileSync(path.join(artifacts,'browser-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }finally{releaseHealth?.();if(browser)await browser.close();await service.sessions.close();await Promise.all([game,service,board].map(server=>new Promise(r=>{server.closeAllConnections();server.close(r);})));}
})().catch(error=>{console.error(error);process.exitCode=1;});
