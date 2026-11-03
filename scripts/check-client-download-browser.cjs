const assert=require('node:assert/strict'),fs=require('node:fs');
const {launchBrowser}=require('./browser.cjs');
const WINDOWS_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const out='artifacts/client-download';
// Real visitors are not webdriver-controlled; pretend so the offer can appear.
const asVisitor=page=>page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const game=require('../server.js').createServer();
 await new Promise(r=>game.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${game.address().port}`;
 let browser;
 try{
  browser=await launchBrowser({headless:true});
  const errors=[];
  const open=async(options)=>{
   const context=await browser.newContext(options);
   const page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**',r=>r.fulfill({json:{results:[],messages:[],onlineCount:0}}));
   return {context,page};
  };

  // First visit on Windows: the choice is shown on top of the start menu.
  const {context,page}=await open({userAgent:WINDOWS_UA,viewport:{width:1366,height:768}});
  await asVisitor(page);
  await page.goto(url);
  await page.locator('#client-download-panel').waitFor({state:'visible'});
  assert.match(await page.textContent('#client-download-title'),/Miten haluat pelata/);
  assert.equal(await page.getAttribute('#client-download-link','href'),'https://github.com/panulut/lprmotorsport/releases/latest/download/LPR-Lap-Challenge-Setup.exe');
  await page.screenshot({path:`${out}/choice-1366.png`});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:`${out}/choice-390.png`});
  await page.setViewportSize({width:1366,height:768});
  // English follows the shared language setting.
  await page.evaluate(()=>window.LPRI18n.setLanguage('en'));
  assert.match(await page.textContent('#client-download-title'),/How do you want to play/);
  assert.equal(await page.textContent('#client-download-open'),'PC app');
  await page.evaluate(()=>window.LPRI18n.setLanguage('fi'));

  // Continue in browser: hidden now and on the next visit, reopenable from the menu.
  await page.click('#client-download-browser');
  assert.equal(await page.isHidden('#client-download-panel'),true);
  await page.locator('#release-notes-close').click();
  await page.reload();
  await page.locator('#settings-dialog[open]').waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.isHidden('#client-download-panel'),true,'Choice is remembered');
  await page.click('#client-download-open');
  assert.equal(await page.isVisible('#client-download-panel'),true,'Menu button reopens the offer');

  // Download: shows install guidance instead of the choices (no real download in the test).
  await page.evaluate(()=>document.querySelector('#client-download-link').addEventListener('click',e=>e.preventDefault()));
  await page.click('#client-download-link');
  assert.equal(await page.isVisible('#client-download-started'),true);
  assert.match(await page.textContent('#client-download-started'),/Suorita silti/);
  await page.screenshot({path:`${out}/started-1366.png`});
  await page.click('#client-download-continue');
  assert.equal(await page.isHidden('#client-download-panel'),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('lpr-client-choice')),'download');
  await context.close();

  // Inside the PC client and on non-Windows devices the offer never appears.
  for(const userAgent of [WINDOWS_UA+' LPRDesktop/1.0.0','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148']){
   const other=await open({userAgent});
   await asVisitor(other.page);
   await other.page.goto(url);
   await other.page.locator('#release-notes-close').waitFor();
   assert.equal(await other.page.isHidden('#client-download-panel'),true,userAgent);
   assert.equal(await other.page.isHidden('#client-download-open'),true,userAgent);
   await other.context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Client download choice OK');
 }finally{await browser?.close();game.close();}
})().catch(error=>{console.error(error);process.exit(1);});
