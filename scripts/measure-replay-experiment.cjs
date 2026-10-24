const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createWorld,recordLap,replayLap,browserBundle}=require('./lib/replay-probe.cjs');
const {createServer}=require('../experiment/server.cjs');
function measure(fn){const cpu=process.threadCpuUsage(),start=performance.now(),value=fn(),usage=process.threadCpuUsage(cpu);return {value,wallMs:performance.now()-start,cpuMs:(usage.user+usage.system)/1000};}
(async()=>{
 const recorded=measure(()=>recordLap(createWorld()));const replay=recorded.value;console.log('Recorded fixture',replay.inputs.length);
 const indexed=measure(()=>replayLap(createWorld(),replay));console.log('Indexed replay',indexed.wallMs);
 const reference=measure(()=>replayLap(createWorld(false),replay));assert.deepEqual(indexed.value,reference.value);console.log('Reference matches',reference.wallMs);
 const context={window:{}};new Function('window',browserBundle())(context.window);
 const bundled=measure(()=>context.window.ReplayLab.replayLap(context.window.ReplayLab.createWorld(),JSON.parse(JSON.stringify(replay))));
 assert.equal(JSON.stringify(bundled.value),JSON.stringify(indexed.value));console.log('Browser bundle matches in Node (not a browser)');
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let single,pair;
 try{const request=async()=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(replay)});const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));assert.deepEqual(b.result,indexed.value);return b;};
 single=await request();const start=performance.now();const results=await Promise.all([request(),request()]);pair={wallMs:performance.now()-start,results};
 }finally{await new Promise(r=>server.close(r));}
 const dir=path.resolve(__dirname,'../artifacts/replay-probe');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'experiment-replay.json'),JSON.stringify(replay));
 const report={generatedAt:new Date().toISOString(),runtime:process.version,hostCPU:require('node:os').cpus()[0]?.model,
 revision:replay.revision,source:'synthetic Node driver; not a human or actual browser recording',hz:120,lapMs:indexed.value.lapMs,ticks:replay.inputs.length,
 indexed:{wallMs:indexed.wallMs,cpuMs:indexed.cpuMs},reference:{wallMs:reference.wallMs,cpuMs:reference.cpuMs},
 exactReferenceMatch:true,browserBundleNodeMatch:true,actualBrowserTest:'not run: Chromium unavailable',single,pair,
 scope:'Local experiment; not Render capacity or production anti-cheat evidence'};
 fs.writeFileSync(path.join(dir,'experiment-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
