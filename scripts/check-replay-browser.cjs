// Optional browser check: requires Playwright and installed Chromium.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {createServer}=require('../experiment/server.cjs');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  const recording=await page.evaluate(async()=>{document.querySelector('#streaming').checked=false;const api=window.ReplayLabTest;await api.start(true);
   for(let i=0;i<120*240&&!api.result;i++)api.step();return {replay:api.recording,expected:api.result,source:'synthetic-browser-chromium'};});
  assert(recording.expected?.finished,'Browser driver completes a lap');
  const verified=await page.evaluate(async replay=>{const r=await fetch('/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(replay)});return {status:r.status,body:await r.json()};},recording.replay);
  assert.equal(verified.status,200,JSON.stringify(verified.body));assert.deepEqual(verified.body.result,recording.expected);
  assert.deepEqual(errors,[]);const target=path.resolve(__dirname,'../artifacts/replay-probe');fs.mkdirSync(target,{recursive:true});
  fs.writeFileSync(path.join(target,'browser-replay.json'),JSON.stringify(recording));
  fs.writeFileSync(path.join(target,'browser-verification.json'),JSON.stringify({generatedAt:new Date().toISOString(),browser:browser.version(),...verified.body},null,2));
  await page.screenshot({path:path.join(target,'replay-lab.png')});
  console.log(JSON.stringify({matches:true,source:recording.source,ticks:recording.expected.ticks,lapMs:recording.expected.lapMs,wallMs:verified.body.wallMs,cpuMs:verified.body.cpuMs}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
