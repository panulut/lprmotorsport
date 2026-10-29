const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {setTimeout:sleep}=require('node:timers/promises');
const fs=require('node:fs'),path=require('node:path');
const {targetURL,run}=require('./load-azure-verification.cjs');
const {createWorld,revision}=require('../verification/world.cjs');
const {driver}=require('../tests/helpers-driving.cjs');
const {protocol,sign,verify,hash}=require('../verification/protocol.mjs');
async function main(){
 const base=targetURL(),secret=process.env.AZURE_VERIFICATION_TEST_SECRET,metricsToken=process.env.VERIFICATION_METRICS_TOKEN;
 assert(secret?.length>=32&&metricsToken?.length>=32&&secret!==metricsToken,'Dedicated test credentials required');
 const request=(route,options={})=>fetch(base+route,{redirect:'error',signal:AbortSignal.timeout(20000),...options});
 let ready=false;
 for(let attempt=0;attempt<30;attempt++){
  try{const response=await request('/health'),h=await response.json();if(response.ok&&h.ready&&h.protocol===protocol&&h.revision===revision&&h.maxSessions===2){ready=true;break;}}catch{}
  await sleep(2000);
 }
 assert(ready,'Test service did not become ready with the expected revision and admission');
 const http=await fetch(base.replace('https:','http:')+'/health',{redirect:'manual',signal:AbortSignal.timeout(20000)});
 assert([301,302,307,308].includes(http.status),'HTTP ingress must redirect to HTTPS');
 assert.equal(new URL(http.headers.get('location'),base).origin,base);
 const metrics=async()=>{const r=await request('/metrics',{headers:{Authorization:'Bearer '+metricsToken}});assert.equal(r.status,200);return r.json();};
 assert.equal((await request('/metrics')).status,401);
 assert.equal((await request('/metrics',{headers:{Authorization:'Bearer invalid'}})).status,401);
 for(const origin of ['https://panulut.github.io','https://unrelated-test.azurestaticapps.net'])assert.equal((await request('/health',{headers:{Origin:origin}})).status,403);
 const allowed=await request('/health',{headers:{Origin:process.env.GAME_ORIGINS}});
 assert.equal(allowed.status,200);assert.equal(allowed.headers.get('access-control-allow-origin'),process.env.GAME_ORIGINS);
 assert.equal(allowed.headers.get('cache-control'),'no-store');assert.equal(allowed.headers.get('x-content-type-options'),'nosniff');
 assert.equal((await request('/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket:'invalid',revision})})).status,401);
 const start=async()=>{
  const now=Date.now(),ticket=await sign({kind:'start',protocol,revision,playerHash:randomBytes(32).toString('hex'),nickname:'Azure Security',nonce:randomBytes(32).toString('hex'),issuedAt:now,expiresAt:now+60000},secret);
  return request('/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket,revision,armed:true})});
 };
 const armed=[];
 try{
  for(let i=0;i<2;i++){const response=await start();assert.equal(response.status,201);armed.push(await response.json());}
  assert.equal((await start()).status,429,'Third simultaneous player must be refused');
  assert.equal((await request('/sessions/'+armed[0].id,{headers:{Authorization:'Bearer invalid'}})).status,401);
 }finally{
  for(const s of armed){const r=await request('/sessions/'+s.id,{method:'DELETE',headers:{Authorization:'Bearer '+s.sessionToken}});assert(r.ok,'Admission-check cleanup failed');}
 }
 const source=createWorld({trackIndexed:false}),inputs=[],reference=new Map();
 while(source.world.result().lap<3&&inputs.length<120*300){
  for(let i=0;i<60;i++){const input=driver(source.world);inputs.push(source.api.encode(input));source.world.step(input);assert(!source.world.car.crashed,'Reference driver crashed');}
  reference.set(inputs.length,structuredClone(source.world.result()));
 }
 assert(source.world.result().lap>=3,'Reference must complete standing and flying laps');
 const before=await metrics(),receipts=new Map();let comparisons=0;
 const fetchImpl=async(url,options)=>{
  const response=await fetch(url,options);
  if(response.ok&&new URL(url).pathname.endsWith('/inputs')){
   const data=await response.clone().json();assert.deepEqual(data.result,reference.get(data.ackTick),'Remote physics differs from reference');comparisons++;
   for(const item of data.laps){
    const signed=await verify(item.receipt,secret);
    assert.equal(signed.kind,'lap');assert.equal(signed.protocol,protocol);assert.equal(signed.revision,revision);
    assert.equal(signed.sessionId,data.sessionId);assert.equal(await hash(item.replay),signed.replayHash);
    const laps=receipts.get(data.sessionId)||[];if(laps.length)assert.equal(signed.startTick,laps.at(-1).endTick);
    laps.push(signed);receipts.set(data.sessionId,laps);
   }
  }
  return response;
 };
 // One-second batches are within the existing 120-tick protocol bound and keep
 // this acknowledgement-gated checker sustainable on >500 ms network paths.
 const load=await run(base,secret,2,inputs,{fetchImpl,batchTicks:120});
 assert.equal(load.ineligibleBatches,0);assert.equal(load.practiceLaps,0);
 assert.equal(receipts.size,2);for(const laps of receipts.values())assert.equal(laps.length,2,'Both players must receive standing/flying receipts');
 const after=await metrics();assert.equal(after.activeSessions,0,'All test sessions must be cleaned up');
 const cpuSeconds=(after.cpuMicroseconds.user+after.cpuMicroseconds.system-before.cpuMicroseconds.user-before.cpuMicroseconds.system)/1e6;
 const report={generatedAt:new Date().toISOString(),endpoint:base,revision,security:{anonymousMetrics:401,wrongMetricsToken:401,productionOrigin:403,invalidTicket:401,wrongSessionOwner:401,thirdPlayer:429,allowedTestOrigin:200},
  load,simulationSeconds:inputs.length/120,verifiedReceipts:4,comparedBatches:comparisons,activeSessionsAfter:after.activeSessions,
  usage:{cpuSeconds,averageCpuCores:cpuSeconds/(load.elapsedMs/1000),rssBytesBefore:before.memoryBytes.rss,rssBytesAfter:after.memoryBytes.rss,workers:after.pool.workers},
  countersBefore:before.counters,countersAfter:after.counters};
 const output=process.env.RUNNER_TEMP?path.join(process.env.RUNNER_TEMP,'azure-two-player-report.json'):path.resolve('artifacts/verification/azure-two-player-report.json');
 fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\nAzure deployment health/security and two concurrent standing/flying laps passed. Four signed replay receipts verified; all sessions cleaned up.\n\n```json\n'+JSON.stringify(report,null,2)+'\n```\n');
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
