// Paced real-clock Sessions load test. Runs locally; never sends traffic to production.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {monitorEventLoopDelay}=require('node:perf_hooks');
const {Sessions}=require('../verification/sessions.cjs'),{createWorld,revision}=require('../verification/world.cjs');
const {driver}=require('../tests/helpers-driving.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
async function scenario(count,inputs,expectedLaps){
 const sessions=new Sessions({maxSessions:count,maxStartsPerMinute:Math.max(8,count),signLap:async()=> 'local-load-test'});
 const delay=monitorEventLoopDelay({resolution:20});delay.enable();
 try{
  const players=await Promise.all(Array.from({length:count},(_,i)=>sessions.create(revision,{playerHash:i.toString(16).padStart(32,'0'),nickname:'Load '+i},{armed:true})));
  for(const p of players)sessions.activate(p.id,p.sessionToken);
  const start=performance.now(),cpu=process.cpuUsage(),latencies=[];
  for(let from=0,seq=0;from<inputs.length;from+=60,seq++){
   const values=inputs.slice(from,from+60);await sleep(start+(from+values.length)*1000/120-performance.now());
   await Promise.all(players.map(async p=>{
    const before=performance.now();await sessions.batch(p.id,p.sessionToken,{revision,seq,fromTick:from,inputs:values});latencies.push(performance.now()-before);
   }));
  }
  await Promise.all(players.map(p=>sessions.laps(p.id,p.sessionToken)));
  const elapsedMs=performance.now()-start,usage=process.cpuUsage(cpu),metrics=sessions.snapshotMetrics();latencies.sort((a,b)=>a-b);
  assert.equal(metrics.counters.ticks,count*inputs.length);assert.equal(metrics.activeSessions,count);assert.equal(metrics.counters.verifiedLaps,count*expectedLaps);assert.equal(metrics.counters.practiceLaps,0);
  return {players:count,elapsedMs,cpuMs:(usage.user+usage.system)/1000,batchP95Ms:latencies[Math.ceil(latencies.length*.95)-1],
   eventLoopP99Ms:delay.percentile(99)/1e6,metrics};
 }finally{delay.disable();await sessions.close();}
}
(async()=>{
 const seconds=Number(process.argv[2]||10),counts=(process.argv[3]||'2,4,8,16').split(',').map(Number);
 if(!Number.isSafeInteger(seconds)||seconds<1||seconds>600||counts.some(n=>!Number.isSafeInteger(n)||n<1||n>256))throw Error('Usage: node scripts/load-verification.cjs [seconds:1..600] [players:2,4,8,16]');
 const source=createWorld({trackIndexed:false}),inputs=[];let expectedLaps=0;
 for(let i=0;i<seconds*120;i++){const input=driver(source.world);inputs.push(source.api.encode(input));if(source.world.step(input).completed)expectedLaps++;}
 const runs=[];for(const count of counts){const run=await scenario(count,inputs,expectedLaps);runs.push(run);console.log(JSON.stringify({players:count,batchP95Ms:run.batchP95Ms,cpuMs:run.cpuMs}));}
 const report={generatedAt:new Date().toISOString(),expectedLapsPerPlayer:expectedLaps,scope:'Local real-clock verification sessions with worker IPC, recordings and admission control; excludes browser, HTTP/proxy and production host',revision,seconds,runs};
 const dir=path.resolve(__dirname,'../artifacts/verification');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'capacity-load.json'),JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
