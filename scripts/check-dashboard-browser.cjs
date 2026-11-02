const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launchBrowser}=require('./browser.cjs');
(async()=>{
 const {revision,createWorld}=require('../verification/world.cjs'),game=require('../server.js').createServer();
 await new Promise(r=>game.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${game.address().port}`;let browser;
 try{
  browser=await launchBrowser({headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   localStorage.setItem('lpr-account',JSON.stringify({nickname:'Test Driver',token:'a'.repeat(64),expiresAt:Date.now()+3600000,series:'human'}));
   localStorage.setItem('lpr-chat-visible','true');
  });
  await page.route('**/verification/config.js*',r=>r.fulfill({contentType:'text/javascript',body:`window.LPRVerificationConfig={service:'https://service.test',leaderboard:'https://board.test'};`}));
  const rows=Array.from({length:10},(_,i)=>({nickname:'Driver '+(i+1)+' with a long name',speedRank:i+1,volumeRank:i+1,rank:i+1,bestMs:65000+i*100,laps:20-i,points:100-i}));
  const ids=rows.map((_,i)=>(i+1).toString(16).padStart(32,'0'));
  await page.route('https://board.test/**',r=>{
   const url=new URL(r.request().url());
   if(url.pathname.endsWith('/championship'))return r.fulfill({json:{today:'2026-10-27',day:'2026-10-27',month:'2026-10',serverNow:Date.now(),endsAt:Date.now()+3600000,final:false,fastest:rows,mostLaps:rows,monthly:rows,me:{streak:5,bestStreak:10,todayLaps:8,activeToday:true,selectedDay:{points:30,breakdown:{speed:10,volume:10,participation:5,milestones:3,streak:2}}}}});
   return r.fulfill({json:{protocol:'driving-v1',revision,results:rows.map((row,i)=>({nickname:row.nickname,lap_ms:row.bestMs,lap:1,session_id:ids[i],replay_available:true}))}});
  });
  const {world}=createWorld(),recorder=new (require('../verification/replay.cjs').Recorder)(world,revision),frame=recorder.frame();
  await page.route('https://service.test/**',r=>{
   const url=new URL(r.request().url());
   if(url.pathname==='/health')return r.fulfill({json:{revision,protocol:'driving-v1'}});
   if(url.pathname==='/spectate')return r.fulfill({json:{results:rows.map((row,i)=>({id:ids[i],nickname:row.nickname}))}});
   if(url.pathname.startsWith('/spectate/'))return r.fulfill({json:{format:'lpr-live-v1',sceneRevision:revision,hz:120,nickname:rows[0].nickname,lap:1,track:recorder.track,frames:[frame,[120,...frame.slice(1)]],inputs:[[0,1,0,0,false,false,true]]}});
   return r.fulfill({json:{onlineCount:10,messages:[{id:'1',at:Date.now(),nickname:'Varikko',text:'Terve!'}]}});
  });
  await page.addInitScript(()=>localStorage.setItem('lpr-release-notes-seen','2026-10-27-major-update'));
  await page.goto(origin);await page.waitForFunction(()=>document.querySelector('#championship-fastest li'),null,{polling:100});
  const dir=path.resolve(__dirname,'../artifacts/dashboard');fs.mkdirSync(dir,{recursive:true});
  async function check(label){
   await page.waitForTimeout(200);
   const result=await page.evaluate(()=>{
    const d=document.querySelector('#settings-dialog'),box=d.getBoundingClientRect(),failures=[];
    for(const root of document.querySelectorAll('.championship-grid > section,.active-drivers,.verified-standings')){
     const r=root.getBoundingClientRect();
     for(const node of root.querySelectorAll('li:not([hidden]),.dashboard-pager:not([hidden])')){
      const n=node.getBoundingClientRect();if(n.bottom>r.bottom+2||n.right>r.right+2)failures.push('list outside card '+root.id+' '+node.textContent);
     }
    }
    if(document.documentElement.scrollWidth>innerWidth+1)failures.push('horizontal scroll');
    return {failures,box:{width:box.width,height:box.height},sizes:[...document.querySelectorAll('.championship-grid > section')].map(n=>({height:n.clientHeight,scroll:n.scrollHeight}))};
   });
   await page.screenshot({path:path.join(dir,label+'.png')});
   assert.deepEqual(result.failures,[],label+' '+JSON.stringify(result));
   // On narrow screens the dashboard stacks its cards and intentionally scrolls.
   // Check each section after scrolling it into view, including nested spectator panes.
   for(const selector of ['.active-drivers','.verified-standings','#championship-fastest','#championship-volume','#championship-monthly']){
    const section=page.locator(selector);
    await section.evaluate(node=>node.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'}));
    const visibility=await section.evaluate(node=>{
     const r=node.getBoundingClientRect();let top=0,bottom=innerHeight,left=0,right=innerWidth;
     for(let parent=node.parentElement;parent;parent=parent.parentElement){
      const style=getComputedStyle(parent),bounds=parent.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,bounds.top);bottom=Math.min(bottom,bounds.bottom);}
      if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,bounds.left);right=Math.min(right,bounds.right);}
      // Modal dialogs live in the top layer and escape their DOM ancestors' clipping.
      if(parent.matches('dialog:modal'))break;
     }
     return {visible:r.width>0&&r.height>0&&r.bottom>top&&r.top<bottom&&r.right>left&&r.left<right,rect:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},clip:{top,bottom,left,right}};
    });
    assert(visibility.visible,label+' cannot reach '+selector+' '+JSON.stringify(visibility));
   }
  }
  for(const [w,h] of [[1366,768],[1280,720],[1920,1080],[390,844],[390,740]]){
   await page.setViewportSize({width:w,height:h});await check('menu-'+w+'x'+h);
  }
  await page.setViewportSize({width:1366,height:768});
  const pager=page.locator('#championship-fastest + .dashboard-pager button').last();
  await pager.scrollIntoViewIfNeeded();
  await pager.click();
  assert(await page.locator('#championship-fastest li').nth(3).isVisible(),'Next page exposes further results');
  await page.locator('#active-drivers-list a').first().click();
  await page.waitForFunction(()=>window.LPRSpectator.active&&document.querySelector('#spectate-connection').hidden,null,{polling:100});
  for(const [w,h] of [[1366,768],[1280,720],[390,844],[390,740]]){
   await page.setViewportSize({width:w,height:h});await check('watch-'+w+'x'+h);
  }
  assert.equal(await page.locator('#menu-chat-button,#chat-button').count(),0);
  if(await page.locator('#chat-panel').isVisible())await page.locator('#rail-collapse').click();
  assert((await page.locator('.sidebar-compact [data-action="chat"]').boundingBox()).x<20,'Closed chat reopens from the left edge');
  await check('watch-closed-chat-mobile');
  await page.setViewportSize({width:1366,height:768});await check('watch-closed-chat-desktop');
  await page.locator('.sidebar-compact [data-action="chat"]').click();assert(await page.locator('#chat-panel').isVisible());
  await page.locator('#spectate-back').click();
  await page.locator('#dashboard-details-open').click();assert(await page.locator('#championship-day').isVisible());
  await page.locator('#dashboard-details-close').click();
  await page.locator('#leaderboard-logout').click();
  await check('guest-desktop');
  await page.setViewportSize({width:390,height:740});await check('guest-mobile');
  async function guestEntry(label){
   if(await page.locator('#left-rail').evaluate(node=>node.classList.contains('is-collapsed')))await page.locator('.sidebar-compact [data-action="chat"]').click();
   await page.locator('#leaderboard-practice').click();
   await page.waitForFunction(()=>document.querySelector('#settings-dialog').classList.contains('dashboard-account-editing'),null,{polling:20});
   const form=page.locator('#leaderboard-start-form'),box=await form.boundingBox();
   assert.equal(await form.evaluate(n=>getComputedStyle(n).position),'fixed',label+' uses the existing mobile entry overlay');
   assert(box.width>340&&box.x>=0&&box.x+box.width<=390,label+' has full-width fields');
   for(const selector of ['#leaderboard-guest-name','.guest-series-segment','#leaderboard-guest-start','#leaderboard-guest-back']){
    const field=page.locator(selector);await field.scrollIntoViewIfNeeded();const b=await field.boundingBox();
    assert(b.x>=box.x&&b.x+b.width<=box.x+box.width+1,label+' keeps '+selector+' within the entry panel');
   }
   await page.locator('#leaderboard-guest-back').click();
   await page.waitForFunction(()=>!document.querySelector('#settings-dialog').classList.contains('dashboard-account-editing'),null,{polling:20});
  }
  await guestEntry('signed-out guest setup');
  await page.reload();await page.waitForFunction(()=>window.LPRLeaderboard,null,{polling:20});
  if(await page.locator('#left-rail').evaluate(node=>node.classList.contains('is-collapsed')))await page.locator('.sidebar-compact [data-action="chat"]').click();
  await page.locator('#leaderboard-logout').click();
  await guestEntry('guest setup after account reload');
  assert.deepEqual(errors,[]);
  console.log('PASS: populated dashboard and spectator statistics are reachable at desktop, laptop and phone sizes; paging and options work');
 }finally{await browser?.close();game.closeAllConnections();await new Promise(r=>game.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
