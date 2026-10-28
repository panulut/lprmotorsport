const assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');
const {monitorEventLoopDelay}=require('node:perf_hooks');
const {createWorld,revision}=require('../verification/world.cjs');
const {driver}=require('../tests/helpers-driving.cjs');
const {sign,protocol}=require('../verification/protocol.mjs');

const loadPoints=[2,5,10,20,50,100];
const timeout=ms=>AbortSignal.timeout(ms);
function targetURL(){
 const value=process.env.AZURE_VERIFICATION_URL;
 if(!value)throw Error('Set AZURE_VERIFICATION_URL to the Azure test app HTTPS URL');
 const url=new URL(value);
 if(url.protocol!=='https:'||!url.hostname.startsWith('lpr-verification-test.')||!url.hostname.endsWith('.azurecontainerapps.io')||
  url.username||url.password||url.search||url.hash||url.pathname!=='/')
  throw Error('Load tests only accept the HTTPS lpr-verification-test Azure Container Apps URL');
 return url.origin;
}
function signingSecret(){
 const value=process.env.AZURE_VERIFICATION_TEST_SECRET;
 if(typeof value!=='string'||value.length<32)throw Error('Set AZURE_VERIFICATION_TEST_SECRET to the dedicated Azure test signing secret');
 return value;
}
async function request(base,path,options={}){
 return fetch(base+path,{...options,signal:timeout(options.timeoutMs||15000)});
}
async function createPlayer(base,secret,index){
 const playerHash=randomBytes(32).toString('hex'),now=Date.now();
 const ticket=await sign({kind:'start',protocol,revision,playerHash,nickname:`Azure Load ${index+1}`,
  nonce:randomBytes(32).toString('hex'),issuedAt:now,expiresAt:now+60000},secret);
 const response=await request(base,'/sessions',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({ticket,revision,armed:true}),timeoutMs:30000});
 if(response.status!==201)throw Error(`Azure test refused simulated player ${index+1}: HTTP ${response.status} ${await response.text()}`);
 const session=await response.json();
 const activation=await request(base,`/sessions/${session.id}/start`,{method:'POST',
  headers:{Authorization:'Bearer '+session.sessionToken,'Content-Type':'application/json'},body:'{}'});
 if(!activation.ok)throw Error(`Could not activate simulated player ${index+1}: HTTP ${activation.status}`);
 return session;
}
async function cancelPlayer(base,session){
 if(!session)return;
 try{await request(base,`/sessions/${session.id}`,{method:'DELETE',headers:{Authorization:'Bearer '+session.sessionToken}});}
 catch(error){console.error(JSON.stringify({event:'azure-load.cleanup-failed',sessionId:session.id,error:error.message}));}
}
async function run(base,secret,count,inputs){
 const healthResponse=await request(base,'/health');
 if(!healthResponse.ok)throw Error(`Azure health check failed: HTTP ${healthResponse.status}`);
 const health=await healthResponse.json();
 if(health.ready!==true||health.protocol!==protocol||health.revision!==revision)throw Error('Azure test service is not ready for this simulation revision');
 if(health.maxSessions<count)throw Error(`Azure app admits ${health.maxSessions} sessions; configure MAX_VERIFIED_SESSIONS to at least ${count} before this load point`);
 const delay=monitorEventLoopDelay({resolution:20});delay.enable();
 const sessions=[];
 try{
  sessions.push(...await Promise.all(Array.from({length:count},(_,i)=>createPlayer(base,secret,i))));
  const started=performance.now(),latencies=[];
  for(let fromTick=0,seq=0;fromTick<inputs.length;fromTick+=60,seq++){
   const batch=inputs.slice(fromTick,fromTick+60);
   await new Promise(resolve=>setTimeout(Math.max(0,started+(fromTick+batch.length)*1000/120-performance.now())));
   const responses=await Promise.all(sessions.map(async session=>{
    const before=performance.now();
    const response=await request(base,`/sessions/${session.id}/inputs`,{method:'POST',
     headers:{Authorization:'Bearer '+session.sessionToken,'Content-Type':'application/json'},
     body:JSON.stringify({revision,seq,fromTick,inputs:batch})});
    const elapsed=performance.now()-before;
    if(!response.ok)throw Error(`Player batch rejected at ${count} players: HTTP ${response.status} ${await response.text()}`);
    const result=await response.json();
    if(result.result?.ticks!==fromTick+batch.length)throw Error(`Unexpected acknowledgement at ${count} players`);
    latencies.push(elapsed);
   }));
   void responses;
  }
  const elapsedMs=performance.now()-started;
  latencies.sort((a,b)=>a-b);
  return {players:count,elapsedMs,batchP95Ms:latencies[Math.ceil(latencies.length*.95)-1]||0,
   eventLoopP99Ms:delay.percentile(99)/1e6,serviceActiveSessions:(await request(base,'/health').then(r=>r.json())).activeSessions};
 }finally{
  delay.disable();
  await Promise.all(sessions.map(session=>cancelPlayer(base,session)));
 }
}
async function main(){
 const base=targetURL(),secret=signingSecret(),seconds=Number(process.env.AZURE_LOAD_SECONDS||5);
 if(!Number.isSafeInteger(seconds)||seconds<1||seconds>600)throw Error('AZURE_LOAD_SECONDS must be an integer from 1 to 600');
 const source=createWorld({trackIndexed:false}),inputs=[];
 for(let tick=0;tick<seconds*120;tick++){
  const input=driver(source.world);inputs.push(source.api.encode(input));source.world.step(input);
 }
 const report={generatedAt:new Date().toISOString(),target:new URL(base).hostname,revision,seconds,scope:'Azure Container Apps test endpoint only',runs:[]};
 for(const count of loadPoints){
  const result=await run(base,secret,count,inputs);report.runs.push(result);console.log(JSON.stringify(result));
 }
 console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({level:'error',event:'azure-load.failed',error:error.message}));process.exitCode=1;});

module.exports={targetURL,loadPoints};
