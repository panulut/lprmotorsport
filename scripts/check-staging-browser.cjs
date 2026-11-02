// Actual staging files and normal animation/server clocks. All services are local.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {launchBrowser}=require('./browser.cjs');
const {buildStaging}=require('./build-staging.cjs');
const targets=require('../verification/staging-targets.json');
const {revision}=require('../verification/world.cjs');
const output=path.resolve(__dirname,'../artifacts/integration/staging-browser');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
async function close(server){if(!server)return;await server.sessions?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
(async()=>{
 let site,service,board,browser;
 const report={scope:'Local staging build, local verification/SQLite; normal browser clocks; no Azure or public D1 writes',passed:false,views:[]};
 const watchdog=setTimeout(()=>{console.error('Staging browser watchdog expired');process.exit(1);},120000);watchdog.unref();
 try{
  const folder=buildStaging({LPR_TEST_SERVICE_URL:targets.service,LPR_TEST_LEADERBOARD_URL:targets.leaderboard,
   LPR_TEST_ANALYTICS_URL:targets.analytics,LPR_TEST_GIT_COMMIT:'local-browser-check'},path.join(output,'site'));
  site=http.createServer((req,res)=>{
   const url=new URL(req.url,'http://localhost'),file=path.resolve(folder,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!file.startsWith(folder+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
  });
  const origin=await listen(site),secret='local-staging-browser-test-secret-'.repeat(2);
  service=await require('../verification/server.cjs').createServer({secret,origins:[origin]});
  board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision,origins:origin,passwordIterations:10000});
  const serviceURL=await listen(service),boardURL=await listen(board);
  browser=await launchBrowser({headless:true});
  for(const viewport of [{width:1366,height:768},{width:390,height:844}]){
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],unexpected=[],httpErrors=[];
   page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000);
   page.on('pageerror',error=>errors.push(error.message));
   page.on('response',response=>{if(response.status()>=500)httpErrors.push({url:response.url(),status:response.status()});});
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin)return route.continue();
    if(url.origin===targets.analytics)return route.fulfill({json:{results:[],ok:true}});
    const local=url.origin===targets.service?serviceURL:url.origin===targets.leaderboard?boardURL:null;
    if(local){
     try{return await route.fulfill({response:await route.fetch({url:local+url.pathname+url.search,timeout:15000})});}
     catch(error){if(!page.isClosed())httpErrors.push({path:url.pathname,error:error.name});return;}
    }
    unexpected.push(url.origin);return route.abort();
   });
   await page.addInitScript(()=>localStorage.setItem('lpr-release-notes-seen','2026-10-27-major-update'));
   await page.goto(origin);
   await page.waitForFunction(()=>window.LPRLeaderboard&&window.LPRVerifiedDriving);
   assert(await page.getByRole('note').isVisible(),'Staging banner is visible');
   if(await page.locator('#left-rail').evaluate(node=>node.classList.contains('is-collapsed')))
    await page.locator('.sidebar-compact [data-action="chat"]').click();
   await page.click('#leaderboard-practice');
   await page.fill('#leaderboard-guest-name','Staging '+viewport.width);
   await page.locator('#leaderboard-guest-series-human').check();
   await page.click('#leaderboard-guest-start');
   await page.waitForFunction(()=>window.LPRLeaderboard.identity?.guest);
   await page.screenshot({path:path.join(output,`lobby-${viewport.width}.png`)});
   await page.click('#leaderboard-drive');
   await page.waitForFunction(()=>window.LPRVerifiedDriving.active);
   await page.waitForTimeout(4000);
   await page.keyboard.down('ArrowUp');await page.waitForTimeout(500);await page.keyboard.up('ArrowUp');
   assert(await page.evaluate(()=>window.LPRVerifiedDriving.active),'Normal-clock drive remains verified');
   const frames=await page.evaluate(()=>new Promise(resolve=>{const times=[];let previous;function step(now){if(previous)times.push(now-previous);previous=now;if(times.length===60)resolve(times);else requestAnimationFrame(step);}requestAnimationFrame(step);}));
   await page.screenshot({path:path.join(output,`drive-${viewport.width}.png`)});
   const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
   assert(layout.scrollWidth<=layout.width+1,'No horizontal overflow');
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(httpErrors,[]);
   report.views.push({viewport,errors,unexpectedOrigins:unexpected,httpErrors,frameMaxMs:Math.max(...frames),frameMeanMs:frames.reduce((a,b)=>a+b)/frames.length});
   const releaseStart=performance.now();
   if(viewport.width>600){
    await Promise.all([
     page.waitForResponse(response=>response.url().startsWith(targets.service+'/sessions/')&&response.request().method()==='DELETE'&&response.status()===200),
     page.evaluate(()=>window.LPRVerifiedDriving.cancel())
    ]);
    await context.unrouteAll({behavior:'ignoreErrors'});await context.close();
   }else{
    await context.setOffline(true);await context.unrouteAll({behavior:'ignoreErrors'});await context.close();
   }
   for(let i=0;i<270&&service.sessions.activeCount;i++)await new Promise(resolve=>setTimeout(resolve,100));
   assert.equal(service.sessions.activeCount,0,'Leaving the drive releases the session');
   report.views.at(-1).release={kind:viewport.width>600?'explicit-cancel':'connection-loss',ms:performance.now()-releaseStart};
  }
  report.passed=true;console.log('PASS: built staging desktop/mobile guest entry, normal-clock verified drive, rendering, origin isolation and session release');
 }finally{
  clearTimeout(watchdog);await browser?.close();await close(service);await close(board);await close(site);
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
