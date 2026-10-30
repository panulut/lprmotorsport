const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {targetURL,run,loadPoints}=require('./load-azure-verification.cjs');
const {createWorld,revision}=require('../verification/world.cjs');
const {driver}=require('../tests/helpers-driving.cjs');
const {verify,hash,protocol}=require('../verification/protocol.mjs');
const {monitorEventLoopDelay}=require('node:perf_hooks');
async function main(){
 const count=Number(process.env.AZURE_LOAD_PLAYERS),base=targetURL(),secret=process.env.AZURE_VERIFICATION_TEST_SECRET,token=process.env.VERIFICATION_METRICS_TOKEN;
 assert(loadPoints.includes(count));assert(secret?.length>=32&&token?.length>=32&&secret!==token);
 const output=process.env.AZURE_LOAD_REPORT||path.resolve('artifacts/verification/azure-load-'+count+'.json');
 const report={startedAt:new Date().toISOString(),players:count,endpoint:base,revision,batchTicks:120,phase:'preflight',passed:false,receipts:0,comparedBatches:0,httpFailures:0,ineligibleBatches:0,practiceLaps:0,samples:[],timingSamples:[]};
 const metrics=async()=>{const r=await fetch(base+'/metrics',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);return r.json();};
 let timer,before,sampling=false,sampleError;const latencies=[],players=new Map(),clientDelay=monitorEventLoopDelay({resolution:20});
 try{
  let healthy=false;
  for(let i=0;i<30;i++){
   try{const r=await fetch(base+'/health',{redirect:'error',signal:AbortSignal.timeout(15000)}),h=await r.json();report.lastPreflightHealth=h;if(r.ok&&h.ready&&h.revision===revision&&h.maxSessions===count&&h.activeSessions===0){healthy=true;break;}}catch{}
   await new Promise(r=>setTimeout(r,2000));
  }
  assert(healthy,'Expected idle test revision/admission not ready');
  const source=createWorld({trackIndexed:false}),inputs=[],reference=new Map();
  while(source.world.result().lap<3&&inputs.length<36000){for(let i=0;i<60;i++){const input=driver(source.world);inputs.push(source.api.encode(input));source.world.step(input);assert(!source.world.car.crashed);}reference.set(inputs.length,structuredClone(source.world.result()));}
  assert(source.world.result().lap>=3);report.simulationSeconds=inputs.length/120;
  before=await metrics();report.before=before;assert.equal(before.pool.limit,1);assert.equal(before.maxSessions,count);
  report.phase='load';clientDelay.enable();
  const sample=async()=>{if(sampling)return;sampling=true;try{const m=await metrics();report.samples.push({at:new Date().toISOString(),since:m.since,uptimeMs:m.uptimeMs,rssBytes:m.memoryBytes.rss,cpuMicroseconds:m.cpuMicroseconds,activeSessions:m.activeSessions,pending:m.pool.pendingRequests});if(m.since!==before.since)sampleError=Error('Server restarted during load');}catch(e){sampleError=e;}finally{sampling=false;}};
  timer=setInterval(()=>{void sample();},5000);
  const receipts=new Map();let lastProgress=performance.now();
  const fetchImpl=async(url,options)=>{
   if(sampleError&&new URL(url).pathname.endsWith('/inputs'))throw sampleError;
   const sent=performance.now(),response=await fetch(url,options),headersAt=performance.now(),pathname=new URL(url).pathname;
   if(pathname==='/sessions'&&response.status===201){const d=await response.clone().json();players.set(d.id,{index:players.size+1,receipts:0,comparedBatches:0,recent:[]});}
   const player=players.get(pathname.split('/')[2]);
   if(pathname.endsWith('/start')&&response.ok&&player)player.activatedAt=performance.now();
   if(pathname.endsWith('/inputs')){
    if(!response.ok){latencies.push(performance.now()-sent);report.httpFailures++;const d=await response.clone().json().catch(()=>({}));report.httpFailure={player:player?.index,status:response.status,code:d.code,error:d.error,retryable:d.retryable};return response;}
    const d=await response.clone().json();
    assert(player,'Unknown simulated player');
    const sample={at:new Date().toISOString(),player:player.index,seq:d.seq,ackTick:d.ackTick,arrivalLagMs:d.eligibility?.lagMs,ackLagMs:d.serverElapsedMs-d.ackTick*1000/120,responseMs:performance.now()-sent,headersMs:headersAt-sent,sendIntervalMs:player.lastSent===undefined?null:sent-player.lastSent,sendBehindScheduleMs:sent-player.activatedAt-d.ackTick*1000/120,workerWallMs:d.wallMs,eligible:d.eligibility?.eligible};
    sample.serverProcessingMs=sample.ackLagMs-sample.arrivalLagMs;
    player.lastSent=sent;player.last=sample;player.recent.push(sample);if(player.recent.length>12)player.recent.shift();
    report.maxArrivalLagMs=Math.max(report.maxArrivalLagMs||0,sample.arrivalLagMs||0);
    if(d.seq%10===0||sample.arrivalLagMs>1500)report.timingSamples.push(sample);
    latencies.push(performance.now()-sent);report.maxAckLagMs=Math.max(report.maxAckLagMs||0,d.serverElapsedMs-d.ackTick*1000/120);
    if(d.eligibility?.eligible===false)report.ineligibleBatches++;
    report.practiceLaps+=d.practiceLaps?.length||0;
    if(d.eligibility?.eligible===false){if(!report.firstIneligibleBatch){report.firstIneligibleBatch=sample;report.failureTrace=structuredClone(player.recent);}throw Error('Lap eligibility lost under load: '+JSON.stringify(sample));}
    assert.equal(report.practiceLaps,0,'Practice receipt under load');
    assert.deepEqual(d.result,reference.get(d.ackTick),'Authoritative physics mismatch');report.comparedBatches++;player.comparedBatches++;
    for(const item of d.laps){const signed=await verify(item.receipt,secret);assert.equal(signed.kind,'lap');assert.equal(signed.protocol,protocol);assert.equal(signed.sessionId,d.sessionId);assert.equal(signed.revision,revision);assert.equal(await hash(item.replay),signed.replayHash);const list=receipts.get(d.sessionId)||[];if(list.length)assert.equal(signed.startTick,list.at(-1).endTick);list.push(signed);receipts.set(d.sessionId,list);report.receipts++;player.receipts++;}
    if(performance.now()-lastProgress>30000){console.log(JSON.stringify({players:count,ackTick:d.ackTick,receipts:report.receipts,elapsedSimulationSeconds:d.ackTick/120}));lastProgress=performance.now();}
   }
   return response;
  };
  report.load=await run(base,secret,count,inputs,{batchTicks:120,fetchImpl});
  assert.equal(receipts.size,count);for(const list of receipts.values())assert.equal(list.length,2);
  assert.equal(report.receipts,count*2);if(sampleError)throw sampleError;report.passed=true;report.phase='completed';
 }catch(e){report.error=e.message;}
 finally{
  clientDelay.disable();report.clientEventLoopP99Ms=before?clientDelay.percentile(99)/1e6:null;report.clientEventLoopMaxMs=before?clientDelay.max/1e6:null;
  report.playerResults=[...players.values()].map(p=>({player:p.index,receipts:p.receipts,comparedBatches:p.comparedBatches,last:p.last}));
  clearInterval(timer);while(sampling)await new Promise(r=>setTimeout(r,25));
  try{const after=await metrics();report.after=after;if(before){report.restarted=after.since!==before.since;report.cpuSeconds=(after.cpuMicroseconds.user+after.cpuMicroseconds.system-before.cpuMicroseconds.user-before.cpuMicroseconds.system)/1e6;report.observedSeconds=(after.uptimeMs-before.uptimeMs)/1000;report.averageCpuCores=report.cpuSeconds/report.observedSeconds;}report.activeSessionsAfter=after.activeSessions;if(after.activeSessions!==0||report.restarted){report.passed=false;report.error=report.error||'Cleanup/restart check failed';}}catch(e){report.passed=false;report.metricsError=e.message;}
  report.finishedAt=new Date().toISOString();report.peakRssBytes=Math.max(0,before?.memoryBytes.rss||0,report.after?.memoryBytes.rss||0,...report.samples.map(s=>s.rssBytes));
  latencies.sort((a,b)=>a-b);for(const percentile of [50,95,99])report['responseP'+percentile+'Ms']=latencies[Math.ceil(latencies.length*percentile/100)-1]??null;report.maxResponseMs=latencies.at(-1)??null;
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({players:count,passed:report.passed,error:report.error,receipts:report.receipts,comparedBatches:report.comparedBatches,httpFailures:report.httpFailures,ineligibleBatches:report.ineligibleBatches,practiceLaps:report.practiceLaps,load:report.load,responseP95Ms:report.responseP95Ms,maxAckLagMs:report.maxAckLagMs,cpuSeconds:report.cpuSeconds,averageCpuCores:report.averageCpuCores,peakRssBytes:report.peakRssBytes,restarted:report.restarted,activeSessionsAfter:report.activeSessionsAfter,report:output}));
  if(!report.passed)process.exitCode=1;
 }
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
