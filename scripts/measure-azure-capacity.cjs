// Three isolated Azure runs. Requires the existing TEST signing key, never production.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomBytes,createHash}=require('node:crypto'),{gunzipSync}=require('node:zlib');
const {targets,validateProof,assess,SOURCE,TEST_WORKER}=require('./lib/azure-capacity.cjs');
const {ORIGIN,wrapperHash}=require('../verification/azure-test-bootstrap.cjs');
const {revision,createWorld}=require('../verification/world.cjs'),{driver}=require('../tests/helpers-driving.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
const percentile=(a,p)=>a.length?[...a].sort((a,b)=>a-b)[Math.ceil(a.length*p)-1]:null;
async function request(base,route,{token,body,method=body?'POST':'GET',timeout=15000}={}){
 const r=await fetch(base+route,{method,redirect:'error',headers:{Origin:ORIGIN,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw Object.assign(Error(route+': HTTP '+r.status),{status:r.status});return r.json();
}
function fixture(){
 const {world,api}=createWorld(),inputs=[],states=new Map(),finishes=[];
 while(finishes.length<2){
  const v=driver(world);inputs.push(api.encode(v));const event=world.step(v);
  if(event.completed)finishes.push(world.ticks);
  if(inputs.length%60===0||finishes.length===2)states.set(world.ticks,world.result());
  assert(inputs.length<72000,'Two-lap fixture exceeded session duration');
 }
 return {inputs,states,finishes};
}
async function verifyArtifact(value,player,secret){
 const {verify,hash}=await import('../verification/protocol.mjs');
 const lap=await verify(value.receipt,secret);
 assert.equal(lap.kind,'lap');assert.equal(lap.protocol,'driving-v1');assert.equal(lap.revision,revision);
 assert.equal(lap.sessionId,player.session.id);assert.equal(lap.playerHash,player.playerHash);
 for(const k of ['lap','startTick','endTick','lapTicks'])assert.equal(lap[k],value.lap[k]);
 assert([1,2].includes(lap.lap));assert(typeof value.replay==='string'&&value.replay.length<=900000);
 assert.equal(lap.replayHash,await hash(value.replay));
 const doc=JSON.parse(gunzipSync(Buffer.from(value.replay,'base64')));
 assert.equal(doc.sceneRevision,revision);assert.equal(doc.startTick,lap.startTick);assert.equal(doc.endTick,lap.endTick);
 return {lap:lap.lap,startTick:lap.startTick,endTick:lap.endTick,lapTicks:lap.lapTicks,
  replayHash:lap.replayHash,base64Chars:value.replay.length,signatureValid:true,replayHashValid:true};
}
async function runOne({service,worker,secret,metricsToken,source,output,number,metricsIntervalMs=15000}){
 const run={number,startedAt:new Date().toISOString(),sourceCommit:SOURCE,revision,service,worker,passed:false,
  scope:'Public Azure ingress; server-only RSS high-water + 15-second samples; 10 independent real-clock clients, synchronized input/finish ticks; no production writes',
  metrics:[],metricErrors:[],failures:[],players:[],finishTicks:source.finishes,ticksPerPlayer:source.inputs.length};
 const players=[],ackLags=[],responses=[];let timer,sampling=Promise.resolve(),instance=null;
 const persist=()=>{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(run,null,2)+'\n');};
 const sample=phase=>{
  sampling=sampling.then(async()=>{
   const d=await request(service,'/metrics',{token:metricsToken});
   assert.equal(d.capacityTest.sourceCommit,SOURCE);assert.equal(d.capacityTest.wrapperHash,wrapperHash);assert.equal(d.capacityTest.workerURL,TEST_WORKER);
   assert(d.serverMaxRssBytes>0&&Number.isFinite(d.memoryBytes?.rss)&&Array.isArray(d.workerStats));
   assert(d.timings&&d.counters&&d.pool&&d.invalidations&&typeof d.capacityTest.instance==='string');
   assert(d.workerStats.every(w=>Number.isFinite(w.forcedRecordings)&&Number.isFinite(w.maxReplayQueueMs)));
   if(d.timings.replayPackMs)assert(Array.isArray(d.timings.replayPackMs.buckets));
   instance??=d.capacityTest.instance;assert.equal(d.capacityTest.instance,instance,'Container restarted or routing changed replica');
   run.metrics.push({at:new Date().toISOString(),phase,data:d});persist();
  }).catch(()=>{run.metricErrors.push({at:new Date().toISOString(),phase,error:'Metrics unavailable, wrong provenance or instance changed'});persist();});
  return sampling;
 };
 try{
  const h=await request(service,'/health',{timeout:90000});
  assert.equal(h.commit,SOURCE);assert.equal(h.revision,revision);assert.equal(h.maxSessions,10);assert.equal(h.lapLagMs,2000);assert.equal(h.activeSessions,0);
  assert.equal(h.capacityTest.wrapperHash,wrapperHash);assert.equal(h.capacityTest.workerURL,TEST_WORKER);
  const board=await request(worker,'/api/verified/leaderboard');assert.equal(board.revision,revision);assert.equal(board.protocol,'driving-v1');
  await sample('before');assert.equal(run.metricErrors.length,0,'Initial metrics required');
  assert.equal(run.metrics[0].data.activeSessions,0);timer=setInterval(()=>{void sample('during');},metricsIntervalMs);
  const runId=randomBytes(5).toString('hex');run.runId=runId;
  // Identity setup is outside the timed drive and writes only to TEST D1.
  for(let i=0;i<10;i++){
   const nickname='AzCap'+runId+'-'+i,password=randomBytes(24).toString('hex');
   const account=await request(worker,'/api/verified/account',{body:{nickname,password,create:true,series:'human'},timeout:30000});
   const p={nickname,token:account.token,verified:new Map(),seq:0,fromTick:0};players.push(p);
   run.players.push({nickname,verifiedLaps:[],ackLags:[],responseMs:[]});
  }
  const {verify}=await import('../verification/protocol.mjs');
  const initialized=await Promise.allSettled(players.map(async p=>{
   const {ticket}=await request(worker,'/api/verified/start',{token:p.token,body:{revision}});
   const claims=await verify(ticket,secret);assert.equal(claims.kind,'start');assert.equal(claims.revision,revision);p.playerHash=claims.playerHash;
   p.session=await request(service,'/sessions',{body:{ticket,revision,armed:true},timeout:25000});
  }));
  assert(initialized.every(v=>v.status==='fulfilled'),'Session initialization failed');
  const consume=async(p,item)=>{
   // Retain artifacts while driving; JSON/gunzip verification must not stall the
   // client input clocks when ten large replays arrive together.
   const digest=createHash('sha256').update(item.receipt).digest('hex'),lap=item.lap.lap;
   const existing=p.verified.get(lap);if(existing){assert.equal(existing.digest,digest);return;}
   p.verified.set(lap,{digest,item});
  };
  const activated=await Promise.allSettled(players.map(p=>request(service,'/sessions/'+p.session.id+'/start',{token:p.session.sessionToken,body:{}})));
  assert(activated.every(v=>v.status==='fulfilled'),'Session activation failed');
  const start=performance.now();
  await Promise.all(players.map(async(p,index)=>{
   try{
    for(let from=0,seq=0;from<source.inputs.length;from+=60,seq++){
     const inputs=source.inputs.slice(from,from+60),end=from+inputs.length;
     await sleep(start+end*1000/120-performance.now());const sent=performance.now();
     const ack=await request(service,'/sessions/'+p.session.id+'/inputs',{token:p.session.sessionToken,body:{revision,seq,fromTick:from,inputs}});
     assert.equal(ack.seq,seq);assert.equal(ack.ackTick,end);assert.deepEqual(ack.result,source.states.get(end));
     const lag=Math.max(0,ack.serverElapsedMs-end*1000/120),response=performance.now()-sent;
     ackLags.push(lag);responses.push(response);run.players[index].ackLags.push(lag);run.players[index].responseMs.push(response);
     if(!ack.eligibility.eligible||ack.practiceLaps.length)run.failures.push({player:index,tick:end,error:'Practice eligibility/lap observed'});
     for(const item of ack.laps||[])await consume(p,item,index);
    }
    const final=await request(service,'/sessions/'+p.session.id+'/laps',{token:p.session.sessionToken,timeout:15000});
    for(const item of final.laps)await consume(p,item,index);
   }catch(e){run.failures.push({player:index,error:e.status?'HTTP '+e.status:'Client state, signature, replay hash or protocol validation failed'});}
  }));
  run.elapsedMs=performance.now()-start;
  for(let index=0;index<players.length;index++)for(const {item} of players[index].verified.values()){
   try{run.players[index].verifiedLaps.push(await verifyArtifact(item,players[index],secret));}
   catch{run.failures.push({player:index,error:'Receipt signature, replay hash, identity or boundaries failed'});}
  }
 }catch{run.failures.push({error:'Preflight, TEST identity/key pairing or initialization failed'});}
 finally{
  clearInterval(timer);await sampling;
  for(const p of players){
   if(p.session)try{await request(service,'/sessions/'+p.session.id+'/laps',{token:p.session.sessionToken});await request(service,'/sessions/'+p.session.id,{token:p.session.sessionToken,method:'DELETE'});}catch{run.failures.push({error:'Session cleanup failed'});}
   if(p.token)try{await request(worker,'/api/verified/logout',{token:p.token,body:{}});}catch{run.failures.push({error:'TEST login revocation failed'});}
  }
  await sample('final');
  run.ackLagMs={p95:percentile(ackLags,.95),max:ackLags.length?Math.max(...ackLags):null};
  run.serverAckLagMaxMsSinceStart=run.metrics.at(-1)?.data.timings?.ackLagMs?.maxMs??null;
  run.httpResponseMs={p95:percentile(responses,.95),max:responses.length?Math.max(...responses):null};
  run.serverPeakRssMiB=Math.max(0,...run.metrics.map(s=>s.data.serverMaxRssBytes))/1048576;
  run.serverSampledRssPeakMiB=Math.max(0,...run.metrics.map(s=>s.data.memoryBytes.rss))/1048576;
  const firstForced=(run.metrics[0]?.data.workerStats||[]).reduce((n,w)=>n+w.forcedRecordings,0);
  run.forcedRecordings=Math.max(0,...run.metrics.flatMap(s=>s.data.workerStats.map(w=>w.forcedRecordings)))-firstForced;
  run.maxReplayQueueMs=Math.max(0,...run.metrics.flatMap(s=>s.data.workerStats.map(w=>w.maxReplayQueueMs)));
  const firstPack=run.metrics[0]?.data.timings.replayPackMs,lastPack=run.metrics.at(-1)?.data.timings.replayPackMs;
  const packCount=(lastPack?.count||0)-(firstPack?.count||0),packSum=(lastPack?.sumMs||0)-(firstPack?.sumMs||0);
  run.replayPackMs=lastPack?{count:packCount,sumMs:packSum,meanMs:packCount?packSum/packCount:null,
   maxMsSinceServiceStart:lastPack.maxMs,buckets:lastPack.buckets.map((n,i)=>n-(firstPack?.buckets[i]||0))}:null;
  run.highWaterScope='RSS: server process lifetime; maxReplayQueueMs: worker lifetime (cannot reset pinned e70218a counters)';
  const assessment=assess(run);run.passed=assessment.passed;run.acceptanceErrors=assessment.errors;run.finishedAt=new Date().toISOString();persist();
 }
 return run;
}
async function main(){
 const service=process.env.LPR_AZURE_TEST_SERVICE_URL,secret=process.env.LPR_AZURE_TEST_SIGNING_KEY,metricsToken=process.env.LPR_AZURE_TEST_METRICS_TOKEN;
 assert(typeof secret==='string'&&secret.length>=32&&typeof metricsToken==='string'&&metricsToken.length>=32&&secret!==metricsToken,'Supply TEST signing key and separate TEST metrics token through environment');
 const urls=targets(service,TEST_WORKER),proof=validateProof(JSON.parse(fs.readFileSync(process.env.LPR_AZURE_TEST_PROOF||'artifacts/verification/azure-test-proof.json')));
 assert.equal(urls.service,new URL(proof.service).origin);
 const source=fixture(),directory=path.resolve(process.env.LPR_AZURE_TEST_OUTPUT_DIR||'artifacts/verification/azure-ten-player'),results=[];
 for(let i=1;i<=3;i++){
  console.log('Starting isolated Azure run '+i+'/3');
  results.push(await runOne({...urls,secret,metricsToken,source,number:i,output:path.join(directory,'run-'+i+'.json')}));
  console.log(JSON.stringify({run:i,passed:results.at(-1).passed,ackLagMs:results.at(-1).ackLagMs,serverPeakRssMiB:results.at(-1).serverPeakRssMiB}));
 }
 const summary={at:new Date().toISOString(),sourceCommit:SOURCE,proof,allThreePassed:results.length===3&&results.every(r=>r.passed),
  runs:results.map(r=>({number:r.number,passed:r.passed,ackLagMs:r.ackLagMs,serverAckLagMaxMsSinceStart:r.serverAckLagMaxMsSinceStart,serverPeakRssMiB:r.serverPeakRssMiB,forcedRecordings:r.forcedRecordings,maxReplayQueueMs:r.maxReplayQueueMs,replayPackMs:r.replayPackMs,acceptanceErrors:r.acceptanceErrors}))};
 fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(summary,null,2)+'\n');if(!summary.allThreePassed)process.exitCode=1;
}
module.exports={fixture,verifyArtifact,runOne};
if(require.main===module)main().catch(()=>{
 const directory=path.resolve(process.env.LPR_AZURE_TEST_OUTPUT_DIR||'artifacts/verification/azure-ten-player');fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(directory,'preflight-error.json'),JSON.stringify({at:new Date().toISOString(),passed:false,sourceCommit:SOURCE,error:'Isolated test preflight failed; verify URLs, pinned resource proof and TEST credentials'})+'\n');
 console.error('Azure test preflight failed. Check isolated test URLs, pinned proof and TEST-only environment credentials.');process.exitCode=1;
});
