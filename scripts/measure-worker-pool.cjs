// Fresh-process real-clock comparison. No requests are sent to a remote service.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{monitorEventLoopDelay}=require('node:perf_hooks');
const {Sessions}=require('../verification/sessions.cjs'),{createWorld,revision}=require('../verification/world.cjs');
const {DedicatedExecutor}=require('../tests/helpers-dedicated-executor.cjs'),{driver}=require('../tests/helpers-driving.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
async function child(mode,count,inputFile){
 const {inputs,expectedLaps}=JSON.parse(fs.readFileSync(inputFile,'utf8'));
 const sessions=new Sessions({workerCount:1,maxSessions:count,maxStartsPerMinute:Math.max(8,count),signLap:async()=> 'measurement-receipt',
  ...(mode==='dedicated'?{executorFactory:options=>new DedicatedExecutor(options)}:{})});
 const loop=monitorEventLoopDelay({resolution:20});loop.enable();
 try{
  const initStart=performance.now(),players=await Promise.all(Array.from({length:count},(_,i)=>sessions.create(revision,{nickname:'Load '+i},{armed:true})));
  const initMs=performance.now()-initStart;for(const p of players)sessions.activate(p.id,p.sessionToken);
  const start=performance.now(),cpu=process.cpuUsage(),latencies=[];
  for(let from=0,seq=0;from<inputs.length;from+=60,seq++){
   const values=inputs.slice(from,from+60);await sleep(start+(from+values.length)*1000/120-performance.now());
   await Promise.all(players.map(async p=>{
    const before=performance.now(),reply=await sessions.batch(p.id,p.sessionToken,{revision,seq,fromTick:from,inputs:values});
    latencies.push(performance.now()-before);assert(reply.eligibility.eligible,'A timely client lost lap eligibility');
   }));
  }
  await Promise.all(players.map(p=>sessions.laps(p.id,p.sessionToken)));
  const elapsedMs=performance.now()-start,used=process.cpuUsage(cpu),metrics=sessions.snapshotMetrics();latencies.sort((a,b)=>a-b);
  assert.equal(metrics.counters.ticks,count*inputs.length);assert.equal(metrics.counters.verifiedLaps,count*expectedLaps);assert.equal(metrics.counters.practiceLaps,0);
  assert.equal(metrics.activeSessions,count);if(mode==='pooled')assert.equal(metrics.pool.workers,1);
  const report={mode,players:count,seconds:inputs.length/120,initMs,elapsedMs,cpuMs:(used.user+used.system)/1000,
   batchP95Ms:latencies[Math.ceil(latencies.length*.95)-1],batchMaxMs:latencies.at(-1),eventLoopP99Ms:loop.percentile(99)/1e6,
   peakRssBytes:process.resourceUsage().maxRSS*1024,metrics};
  for(const p of players)sessions.cancel(p.id,p.sessionToken);
  if(mode==='pooled'){await sessions.pool.drain();assert((await sessions.pool.inspect()).every(s=>s.worlds===0&&s.queued===0));report.cleanupVerified=true;}
  return report;
 }finally{loop.disable();await sessions.close();}
}
(async()=>{
 if(process.argv[2]==='--child')return console.log(JSON.stringify(await child(process.argv[3],Number(process.argv[4]),process.argv[5])));
 const seconds=Number(process.argv[2]||5),counts=(process.argv[3]||'2,4,8,16').split(',').map(Number),modeArg=process.argv[4]||'both';
 if(!Number.isSafeInteger(seconds)||seconds<1||seconds>600||counts.some(n=>!Number.isSafeInteger(n)||n<1||n>256)||!['both','pooled','dedicated'].includes(modeArg))throw Error('Usage: node scripts/measure-worker-pool.cjs [seconds] [players:2,4,8,16] [both|pooled|dedicated]');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'lpr-worker-pool-'));
 try{
  const {world,api}=createWorld(),inputs=[];let expectedLaps=0;
  for(let i=0;i<seconds*120;i++){const input=driver(world);inputs.push(api.encode(input));if(world.step(input).completed)expectedLaps++;}
  const inputFile=path.join(temporary,'inputs.json');fs.writeFileSync(inputFile,JSON.stringify({inputs,expectedLaps}));
  const runs=[];
  for(const count of counts)for(const mode of modeArg==='both'?['dedicated','pooled']:[modeArg]){
   const result=spawnSync(process.execPath,[__filename,'--child',mode,String(count),inputFile],{encoding:'utf8',timeout:(seconds+90)*1000,maxBuffer:1048576});
   if(result.status!==0)throw Error(result.stderr||result.error?.message||'Load test failed');
   const run=JSON.parse(result.stdout);runs.push(run);console.log(JSON.stringify({players:count,mode,batchP95Ms:run.batchP95Ms,peakRssMiB:run.peakRssBytes/1048576,verifiedLaps:run.metrics.counters.verifiedLaps}));
  }
  const report={generatedAt:new Date().toISOString(),revision,node:process.version,seconds,expectedLapsPerPlayer:expectedLaps,
   scope:'Local real-clock Sessions with worker IPC in fresh Node processes. Includes input batching and recording, excludes browser, HTTP/proxy and production hardware. Pooled runs use one shared worker with 256 MiB heap limit; dedicated reference uses one worker per player with 128 MiB limit each.',runs};
  const directory=path.resolve(__dirname,'../artifacts/verification');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,`worker-pool-${seconds}s-${modeArg}.json`),JSON.stringify(report,null,2)+'\n');
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
