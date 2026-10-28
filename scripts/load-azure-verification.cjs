const {randomBytes}=require('node:crypto');
const {setTimeout:sleep}=require('node:timers/promises');
const {monitorEventLoopDelay}=require('node:perf_hooks');
const {createWorld,revision}=require('../verification/world.cjs');
const {driver}=require('../tests/helpers-driving.cjs');
const {sign,protocol}=require('../verification/protocol.mjs');

const loadPoints=[2,5,10,25,50,100];
function targetURL(){
 const value=process.env.AZURE_VERIFICATION_URL;
 if(!value)throw Error('Set AZURE_VERIFICATION_URL to the Azure test app HTTPS URL');
 const url=new URL(value);
 if(url.protocol!=='https:'||!url.hostname.startsWith('lpr-verification-test.')||!url.hostname.endsWith('.azurecontainerapps.io')||
  url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/')
  throw Error('Load tests only accept the HTTPS lpr-verification-test Azure Container Apps URL');
 return url.origin;
}
function signingSecret(){
 const value=process.env.AZURE_VERIFICATION_TEST_SECRET;
 if(typeof value!=='string'||value.length<32)throw Error('Set AZURE_VERIFICATION_TEST_SECRET to the dedicated Azure test signing secret');
 return value;
}
function playerCounts(value=process.env.AZURE_LOAD_PLAYERS){
 if(value===undefined)return [...loadPoints];
 const counts=value.split(',').map(Number);
 if(!counts.length||counts.some(count=>!loadPoints.includes(count))||new Set(counts).size!==counts.length)
  throw Error('AZURE_LOAD_PLAYERS must list distinct load points from 2,5,10,25,50,100');
 return counts;
}
function client(base,fetchImpl){
 return (path,{timeoutMs=15000,...options}={})=>fetchImpl(base+path,{...options,redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
}
// Wait for every in-flight operation before cleanup, including on partial failures.
async function allOrThrow(promises){
 const results=await Promise.allSettled(promises),failed=results.find(result=>result.status==='rejected');
 if(failed)throw failed.reason;
 return results.map(result=>result.value);
}
async function createPlayer(request,secret,index){
 const playerHash=randomBytes(32).toString('hex'),now=Date.now();
 const ticket=await sign({kind:'start',protocol,revision,playerHash,nickname:`Azure Load ${index+1}`,
  nonce:randomBytes(32).toString('hex'),issuedAt:now,expiresAt:now+60000},secret);
 const response=await request('/sessions',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({ticket,revision,armed:true}),timeoutMs:30000});
 if(response.status!==201)throw Error(`Azure test refused simulated player ${index+1}: HTTP ${response.status} ${await response.text()}`);
 const session=await response.json();
 return session;
}
async function activatePlayer(request,session,index){
 const activation=await request(`/sessions/${session.id}/start`,{method:'POST',
  headers:{Authorization:'Bearer '+session.sessionToken,'Content-Type':'application/json'},body:'{}'});
 if(!activation.ok)throw Error(`Could not activate simulated player ${index+1}: HTTP ${activation.status}`);
}
async function cancelPlayer(request,session){
 if(!session)return;
 try{
  const response=await request(`/sessions/${session.id}`,{method:'DELETE',headers:{Authorization:'Bearer '+session.sessionToken}});
  if(!response.ok&&response.status!==410)throw Error('HTTP '+response.status);
 }
 catch(error){console.error(JSON.stringify({event:'azure-load.cleanup-failed',sessionId:session.id,error:error.message}));return error;}
}
async function run(base,secret,count,inputs,{fetchImpl=fetch,wait=sleep}={}){
 const request=client(base,fetchImpl);
 const healthResponse=await request('/health',{timeoutMs:60000});
 if(!healthResponse.ok)throw Error(`Azure health check failed: HTTP ${healthResponse.status}`);
 const health=await healthResponse.json();
 if(health.ready!==true||health.protocol!==protocol||health.revision!==revision)throw Error('Azure test service is not ready for this simulation revision');
 if(health.maxSessions<count)throw Error(`Azure app admits ${health.maxSessions} sessions; configure MAX_VERIFIED_SESSIONS to at least ${count} before this load point`);
 if(health.activeSessions!==0)throw Error('Azure load tests require an idle test service');
 const delay=monitorEventLoopDelay({resolution:20});delay.enable();
 const sessions=[];
 try{
  await allOrThrow(Array.from({length:count},async(_,i)=>{sessions.push(await createPlayer(request,secret,i));}));
  await allOrThrow(sessions.map((session,index)=>activatePlayer(request,session,index)));
  const started=performance.now(),latencies=[];let practiceLaps=0,ineligibleBatches=0,maxAckLagMs=0;
  for(let fromTick=0,seq=0;fromTick<inputs.length;fromTick+=60,seq++){
   const batch=inputs.slice(fromTick,fromTick+60);
   await wait(Math.max(0,started+(fromTick+batch.length)*1000/120-performance.now()));
   await allOrThrow(sessions.map(async session=>{
    const before=performance.now();
    const response=await request(`/sessions/${session.id}/inputs`,{method:'POST',
     headers:{Authorization:'Bearer '+session.sessionToken,'Content-Type':'application/json'},
     body:JSON.stringify({revision,seq,fromTick,inputs:batch})});
    if(!response.ok)throw Error(`Player batch rejected at ${count} players: HTTP ${response.status} ${await response.text()}`);
    const result=await response.json();
    if(result.ackTick!==fromTick+batch.length||result.result?.ticks!==fromTick+batch.length)throw Error(`Unexpected acknowledgement at ${count} players`);
    practiceLaps+=result.practiceLaps?.length||0;
    if(result.eligibility?.eligible===false)ineligibleBatches++;
    maxAckLagMs=Math.max(maxAckLagMs,(result.serverElapsedMs||0)-(fromTick+batch.length)*1000/120);
    latencies.push(performance.now()-before);
   }));
  }
  const elapsedMs=performance.now()-started;
  latencies.sort((a,b)=>a-b);
  const finalResponse=await request('/health'),finalHealth=await finalResponse.json();
  if(!finalResponse.ok||finalHealth.ready!==true||finalHealth.revision!==revision||finalHealth.activeSessions!==count)
   throw Error('Azure test service lost sessions during the load point');
  return {players:count,elapsedMs,batchP95Ms:latencies[Math.ceil(latencies.length*.95)-1]||0,
   clientEventLoopP99Ms:delay.percentile(99)/1e6,serviceActiveSessions:finalHealth.activeSessions,
   practiceLaps,ineligibleBatches,maxAckLagMs};
 }finally{
  delay.disable();
  const cleanup=await Promise.all(sessions.map(session=>cancelPlayer(request,session)));
  if(cleanup.some(Boolean))throw Error('Azure load session cleanup failed; inspect the test service before another run');
 }
}
async function main(){
 const base=targetURL(),secret=signingSecret(),seconds=Number(process.env.AZURE_LOAD_SECONDS||5),counts=playerCounts();
 if(!Number.isSafeInteger(seconds)||seconds<1||seconds>600)throw Error('AZURE_LOAD_SECONDS must be an integer from 1 to 600');
 const source=createWorld({trackIndexed:false}),inputs=[];
 for(let tick=0;tick<seconds*120;tick++){
  const input=driver(source.world);inputs.push(source.api.encode(input));source.world.step(input);
 }
 const report={generatedAt:new Date().toISOString(),target:new URL(base).hostname,revision,seconds,scope:'Azure Container Apps test endpoint only',runs:[]};
 for(const [index,count]of counts.entries()){
  // Admission limits are per minute. Keep consecutive load points independent.
  if(index)await sleep(61000);
  const result=await run(base,secret,count,inputs);report.runs.push(result);console.log(JSON.stringify(result));
  if(result.ineligibleBatches||result.practiceLaps)throw Error(`Verification timing lost at ${count} players; stop before increasing admission`);
 }
 console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({level:'error',event:'azure-load.failed',error:error.message}));process.exitCode=1;});

module.exports={targetURL,loadPoints,playerCounts,run};
