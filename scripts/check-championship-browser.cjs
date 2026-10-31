const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launchBrowser}=require('./browser.cjs');
(async()=>{
 const {revision}=require('../verification/world.cjs'),{competitionDay,shiftDay}=await import('../cloudflare/championship.mjs');
 const game=require('../server.js').createServer();
 await new Promise(r=>game.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${game.address().port}`;
 const board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret:'browser-championship-test-'.repeat(3),revision,origins:origin});
 await new Promise(r=>board.listen(0,'127.0.0.1',r));
 const api=`http://127.0.0.1:${board.address().port}`;
 let browser,updateChampionship=false;
 try{
  const today=competitionDay(Date.now()),yesterday=shiftDay(today,-1);
  for(const [i,name] of ['Panu','Eve','Driver with long name'].entries()){
   board.db.prepare('INSERT INTO verified_accounts VALUES (?,?,?,?,?,?,?,?)').run(name.toLowerCase(),name,String(i),'x','x','x',10000,Date.now());
   for(let lap=1;lap<=i+1;lap++)board.db.prepare('INSERT INTO championship_laps VALUES (?,?,?,?,?,?)').run('session'+i,lap,today,String(i),revision,5000+i*100);
   board.db.prepare('INSERT INTO championship_laps VALUES (?,?,?,?,?,?)').run('previous'+i,1,yesterday,String(i),revision,6000+i*100);
  }
  browser=await launchBrowser({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/verification/config.js*',r=>r.fulfill({contentType:'text/javascript',body:`window.LPRVerificationConfig={leaderboard:${JSON.stringify(api)},service:''};`}));
  await page.route(api+'/**',async route=>{
   const response=await route.fetch(),headers={...response.headers(),'Access-Control-Allow-Origin':origin};
   if(updateChampionship&&new URL(route.request().url()).pathname==='/api/verified/championship'){
    const result=await response.json();
    if(result.fastest?.[0])result.fastest[0].nickname='Panu updated';
    await route.fulfill({json:result,headers});
   }else await route.fulfill({response,headers});
  });
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.route('https://lpr-leaderboard.panu-musakka.workers.dev/**',route=>route.fulfill({contentType:'application/json',body:'{}'}));
  await page.addInitScript(()=>localStorage.setItem('lpr-release-notes-seen','2026-10-27-major-update'));
  await page.goto(origin);
  await page.waitForFunction(()=>document.querySelector('#championship-fastest li')?.textContent.includes('Panu'),null,{polling:20});
  await page.evaluate(()=>{window.__raceRow=document.querySelector('#championship-fastest li');});
  await page.click('#dashboard-details-open');
  const unchangedRefresh=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/verified/championship');
  await page.click('#championship-refresh');
  await unchangedRefresh;
  assert(await page.evaluate(()=>document.querySelector('#championship-fastest li')===window.__raceRow),'A refresh preserves existing leaderboard rows');
  updateChampionship=true;
  const changedRefresh=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/verified/championship');
  await page.click('#championship-refresh');
  await changedRefresh;
  await page.waitForFunction(()=>document.querySelector('#championship-fastest li')?.textContent.includes('Panu updated'),null,{polling:20});
  assert(await page.evaluate(()=>document.querySelector('#championship-fastest li')===window.__raceRow),'Changed results update the existing row without replacing it');
  updateChampionship=false;
  assert.match(await page.textContent('#championship-volume li'),/Driver with long name/);
  await page.click('#championship-series-bot');
  await page.waitForFunction(()=>document.querySelector('#championship-fastest p')?.textContent==='Ei vielä tuloksia.',null,{polling:20});
  await page.click('#championship-series-human');
  await page.waitForFunction(()=>document.querySelector('#championship-fastest li')?.textContent.includes('Panu'),null,{polling:20});
  await page.locator('#championship').scrollIntoViewIfNeeded();
  const dir=path.resolve(__dirname,'../artifacts/verification');fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,'championship-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.locator('#championship').scrollIntoViewIfNeeded();
  assert(await page.evaluate(()=>{const panel=document.querySelector('#championship');return panel.scrollWidth<=panel.clientWidth+1;}),'Mobile championship does not overflow');
  await page.screenshot({path:path.join(dir,'championship-mobile.png')});
  if(await page.locator('#dashboard-details').isHidden())await page.locator('#dashboard-details-open').click();
  await page.locator('#championship-day').fill(yesterday);await page.locator('#championship-day').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#championship-clock').textContent==='Tulokset vahvistettu',null,{polling:20});
  assert.equal(await page.textContent('#daily-race-name'),'Panu','Driving HUD stays on today while browsing history');
  await page.click('#championship-today');await page.waitForFunction(day=>document.querySelector('#championship-day').value===day,today,{polling:20});
  await page.evaluate(()=>window.LPRI18n.setLanguage('en'));
  assert.equal(await page.textContent('#championship-title'),'Daily');
  await page.waitForFunction(()=>document.querySelector('#championship-personal').textContent.includes('Sign in'),null,{polling:20});
  assert.match(await page.textContent('#daily-race-countdown'),/^Time left \d{2}:\d{2}:\d{2}$/);
  assert.equal(await page.textContent('#daily-race-time'),'00:41.667');
  await page.evaluate(()=>{document.querySelector('#settings-dialog').close();document.querySelector('#dashboard-details').hidden=true;});
  const railCollapse=page.locator('#rail-collapse');
  if(await railCollapse.count()&&await railCollapse.getAttribute('aria-expanded')==='true')await railCollapse.click();
  const before=await page.textContent('#daily-race-countdown');
  await page.waitForTimeout(2000);
  assert.notEqual(await page.textContent('#daily-race-countdown'),before,'Countdown ticks with menu closed');
  board.db.prepare('INSERT INTO championship_laps VALUES (?,?,?,?,?,?)').run('new-leader',1,today,'1',revision,4800);
  await page.waitForTimeout(30000);
  await page.waitForFunction(()=>document.querySelector('#daily-race-name').textContent==='Eve',null,{polling:20});
  assert.equal(await page.textContent('#daily-race-time'),'00:40.000','Leader refreshes during driving');
  for(const [label,width,height] of [['desktop',1280,900],['mobile',390,844],['landscape',844,390]]){
   await page.setViewportSize({width,height});
   assert(await page.locator('#daily-race-hud').isVisible());
   assert(await page.evaluate(()=>{const hud=document.querySelector('#daily-race-hud'),bounds=hud.getBoundingClientRect(),shell=document.querySelector('.game-shell').getBoundingClientRect();return hud.scrollWidth<=hud.clientWidth+1&&bounds.left>=shell.left&&bounds.right<=shell.right&&bounds.bottom<=shell.bottom;}),'HUD fits '+label);
   await page.screenshot({path:path.join(dir,'daily-race-driving-'+label+'.png')});
  }
  await page.route(api+'/api/verified/championship?series=human',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.evaluate(()=>document.dispatchEvent(new Event('lpr-lap-saved')));
  await page.waitForFunction(()=>document.querySelector('#daily-race-hud').dataset.stale==='true',null,{polling:20});
  assert.equal(await page.textContent('#daily-race-leader-label'),'Last known · offline');
  await page.unroute(api+'/api/verified/championship?series=human');
  await page.evaluate(()=>document.dispatchEvent(new Event('lpr-lap-saved')));
  await page.waitForFunction(()=>document.querySelector('#daily-race-hud').dataset.stale==='false',null,{polling:20});
  await page.route(api+'/api/verified/championship?series=human',async route=>{
   const response=await route.fetch(),result=await response.json();
   result.fastest=[{nickname:'Eve',speedRank:1,bestMs:40000},{nickname:'Panu',speedRank:1,bestMs:40000}];
   await route.fulfill({json:result});
  });
  await page.evaluate(()=>document.dispatchEvent(new Event('lpr-lap-saved')));
  await page.waitForFunction(()=>document.querySelector('#daily-race-name').textContent==='Eve, Panu',null,{polling:20});
  assert.equal(await page.textContent('#daily-race-leader-label'),'Joint leaders');
  await page.evaluate(()=>Object.defineProperty(window.LPRLeaderboard,'identity',{get:()=>({nickname:'Bot driver',series:'bot'})}));
  await page.waitForFunction(()=>document.querySelector('#daily-race-name').textContent==='No results yet',null,{polling:20});
  assert.equal(await page.textContent('#daily-race-label'),'Daily race · Bots');
  assert.equal(await page.textContent('#daily-race-time'),'');
  assert.deepEqual(errors,[]);
  console.log('PASS: daily API, desktop/mobile/landscape driving HUD, countdown and leader polling with menu closed, history isolation, ties, series, outage recovery and localization');
 }finally{await browser?.close();await new Promise(r=>{board.close(r);board.closeAllConnections();});await new Promise(r=>{game.close(r);game.closeAllConnections();});}
})().catch(e=>{console.error(e);process.exitCode=1;});
