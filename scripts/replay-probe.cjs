const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {performance}=require('node:perf_hooks');
const {createWorld,recordLap,replayLap,revision}=require('./lib/replay-probe.cjs');

function measure(fn) {
  const cpu=process.cpuUsage(),start=performance.now();
  const value=fn();
  const wallMs=performance.now()-start,usage=process.cpuUsage(cpu);
  return {value,wallMs,cpuMs:(usage.user+usage.system)/1000};
}
function stats(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return {min:sorted[0],median:sorted[Math.floor(sorted.length/2)],max:sorted.at(-1)};
}
const initialization=measure(createWorld),world=initialization.value;
console.error(`World initialized: ${world.bodies} collision bodies, ${initialization.wallMs.toFixed(1)} ms`);
const replay=recordLap(world);
console.error(`Recorded ${replay.inputs.length} ticks; measuring cold and warm replays...`);
const cold=measure(()=>replayLap(createWorld(),replay));
for(let i=0;i<2;i++)replayLap(world,replay);
const runs=Array.from({length:7},(_,i)=>{
  const run=measure(()=>replayLap(world,replay));
  console.error(`Replay ${i+1}/7: ${run.wallMs.toFixed(1)} ms wall, ${run.cpuMs.toFixed(1)} ms CPU`);
  return run;
});
const result=runs[0].value;
if(runs.some(run=>JSON.stringify(run.value)!==JSON.stringify(result)))throw Error('Replay was not deterministic');
const report={
  generatedAt:new Date().toISOString(),runtime:process.version,platform:process.platform,
  cpu:os.cpus()[0]?.model,revision,
  scope:'Local Node.js feasibility probe; not a Cloudflare CPU measurement or production validator',
  fixture:{kind:'synthetic driver, standing start, no animated people',ticks:result.ticks,
    lapMs:result.lapMs,sectorTicks:result.sectorTicks,bodies:world.bodies,
    replayBytes:Buffer.byteLength(JSON.stringify(replay))},
  initialization:{wallMs:initialization.wallMs,cpuMs:initialization.cpuMs},
  coldReplayIncludingInitialization:{wallMs:cold.wallMs,cpuMs:cold.cpuMs},
  warmReplay:{samples:runs.length,wallMs:stats(runs.map(r=>r.wallMs)),cpuMs:stats(runs.map(r=>r.cpuMs))},
  deterministicAcrossMeasuredRuns:true,
  exclusions:['Browser recording and frame-rate parity','Animated people and interiors',
    'Flying-lap trusted start state','Network, JSON decoding, D1, authentication and abuse controls',
    'Cloudflare deployment and runtime measurement']
};
const target=path.resolve(__dirname,'../artifacts/replay-probe');
fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(target,'replay.json'),JSON.stringify(replay));
fs.writeFileSync(path.join(target,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
console.log(`Artifacts: ${target}`);
