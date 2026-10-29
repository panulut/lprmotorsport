const assert=require('node:assert/strict');
const {setTimeout:sleep}=require('node:timers/promises');
const {targetURL,loadPoints,playerCounts,run}=require('../scripts/load-azure-verification.cjs');
const {revision}=require('../verification/world.cjs');
const {protocol}=require('../verification/protocol.mjs');
const secret='azure-load-regression-test-signing-secret-only';
const inputs=Array.from({length:120},()=>[0,0,0,false,false,true]);
const health={ready:true,protocol,revision,maxSessions:2,activeSessions:0};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});

async function partialFailure(stage){
 const allocated=[],deleted=[],activated=[],waits=[];let creates=0;
 const fetchImpl=async(url,options)=>{
  assert.equal(options.redirect,'error','Requests must never follow redirects off the test endpoint');
  assert(options.signal instanceof AbortSignal);
  const path=new URL(url).pathname;
  if(path==='/health')return json({...health,activeSessions:creates?2:0});
  if(path==='/sessions'){
   const index=++creates;
   if(stage==='create'&&index===2)return json({error:'full'},429);
   await sleep(20); // Success may arrive after another creation has failed.
   allocated.push(String(index));
   return json({id:String(index),sessionToken:'test-token-'+index},201);
  }
  const id=path.split('/')[2];
  if(options.method==='DELETE'){deleted.push(id);return json({cancelled:true},stage==='cleanup'?503:200);}
  if(path.endsWith('/start')){
   assert.equal(allocated.length,2,'Create every armed session before activating any');
   activated.push(id);
   return json({},stage==='activate'&&id==='2'?503:200);
  }
  if(path.endsWith('/inputs')){
   if(stage==='batch'&&id==='2')return json({error:'overloaded'},503);
   await sleep(10);
   const data=JSON.parse(options.body),ackTick=data.fromTick+data.inputs.length;
   return json({ackTick:stage==='ack'?0:ackTick,result:{ticks:ackTick}});
  }
  throw Error('Unexpected request '+path);
 };
 await assert.rejects(run('https://lpr-verification-test.example.azurecontainerapps.io',secret,2,inputs,
  {fetchImpl,wait:async ms=>{waits.push(ms);}}),stage==='create'?/refused/:stage==='activate'?/activate/:stage==='ack'?/acknowledgement/:stage==='cleanup'?/cleanup failed/:/batch rejected/);
 assert.deepEqual(deleted.sort(),allocated.sort(),'Clean up every allocated session after partial failure');
 if(stage==='create')assert.equal(activated.length,0);
 if(stage==='batch'||stage==='ack')assert(waits[0]>400&&waits[0]<=500,'Pace inputs against the simulation clock');
}

(async()=>{
 const saved=process.env.AZURE_VERIFICATION_URL;
 try{
  delete process.env.AZURE_VERIFICATION_URL;
  assert.throws(targetURL,/Set AZURE_VERIFICATION_URL/);
  for(const value of [
   'http://lpr-verification-test.example.azurecontainerapps.io','https://production.example.com',
   'https://lpr-verification-test.example.azurecontainerapps.io.attacker.example',
   'https://other.example.azurecontainerapps.io','https://lpr-verification-test.example.azurecontainerapps.io:8443',
   'https://user:password@lpr-verification-test.example.azurecontainerapps.io',
   'https://lpr-verification-test.example.azurecontainerapps.io/path',
   'https://lpr-verification-test.example.azurecontainerapps.io?query=1',
   'https://lpr-verification-test.example.azurecontainerapps.io#fragment'
  ]){process.env.AZURE_VERIFICATION_URL=value;assert.throws(targetURL,/only accept/);}
  process.env.AZURE_VERIFICATION_URL='https://lpr-verification-test.example.azurecontainerapps.io/';
  assert.equal(targetURL(),'https://lpr-verification-test.example.azurecontainerapps.io');
 }finally{if(saved===undefined)delete process.env.AZURE_VERIFICATION_URL;else process.env.AZURE_VERIFICATION_URL=saved;}
 assert.deepEqual(playerCounts('2,5,100'),[2,5,100]);
 for(const value of ['',',','1','20','101','2,2','2,garbage'])assert.throws(()=>playerCounts(value),/distinct load points/);
 assert.deepEqual(playerCounts(),[2,5,10,25,50,100]);
 assert.deepEqual(loadPoints,[2,5,10,25,50,100]);
 for(const stage of ['create','activate','batch','ack','cleanup'])await partialFailure(stage);
 // One player's slow acknowledgement must not block another player's next batch.
 let releaseSlow,created=0,fastAdvanced=false;const removed=[];
 const slow=new Promise(resolve=>{releaseSlow=resolve;});
 const independent=async(url,options)=>{
  const path=new URL(url).pathname,id=path.split('/')[2];
  if(path==='/health')return json({...health,activeSessions:created?2:0});
  if(path==='/sessions')return json({id:String(++created),sessionToken:'test-token'},201);
  if(options.method==='DELETE'){removed.push(id);return json({});}
  if(path.endsWith('/start'))return json({});
  const data=JSON.parse(options.body);
  if(id==='1'&&data.seq===0)await slow;
  if(id==='2'&&data.seq===1){fastAdvanced=true;releaseSlow();}
  return json({ackTick:data.fromTick+data.inputs.length,result:{ticks:data.fromTick+data.inputs.length}});
 };
 let barrierTimedOut=false;
 const deadline=setTimeout(()=>{barrierTimedOut=true;releaseSlow();},1000);
 try{await run('https://test.invalid',secret,2,[...inputs,...inputs],{fetchImpl:independent,wait:async()=>{}});}
 finally{clearTimeout(deadline);}
 assert(fastAdvanced,'The second player must advance while the first acknowledgement is pending');
 assert(!barrierTimedOut,'Independent players must advance before the slow response is released');
 assert.deepEqual(removed.sort(),['1','2']);
 for(const h of [{...health,revision:'old'},{...health,maxSessions:1},{...health,activeSessions:1}]){
  let requests=0;
  await assert.rejects(run('https://test.invalid',secret,2,inputs,{fetchImpl:async()=>{requests++;return json(h);}}));
  assert.equal(requests,1,'Failed preflight must never create players');
 }
 // Exercise the actual timer and HTTP protocol locally; no Azure traffic is sent.
 const server=await require('../verification/server.cjs').createServer({secret,metricsToken:null,capacityReportURL:null,chatStorageURL:null});
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const result=await run('http://127.0.0.1:'+server.address().port,secret,2,inputs);
  assert(result.elapsedMs>=950,'One second of simulation must take real time');
  assert.equal(result.serviceActiveSessions,2);
  assert.equal(server.sessions.activeCount,0);
  assert.equal(server.sessions.snapshotMetrics().counters.ticks,240);
  const oneSecond=await run('http://127.0.0.1:'+server.address().port,secret,2,inputs,{batchTicks:120});
  assert.equal(oneSecond.batchTicks,120);
  assert(oneSecond.elapsedMs>=950,'One-second batches must still follow server time');
  assert.equal(server.sessions.activeCount,0);
  assert.equal(server.sessions.snapshotMetrics().counters.ticks,480);
  await assert.rejects(run('http://127.0.0.1',secret,2,inputs,{batchTicks:121}),/60 or 120/);
 }finally{await server.sessions.close();await server.capacityReporter.close();await new Promise(resolve=>server.close(resolve));}
 console.log('Azure load target restrictions, pacing, admission preflight, and partial-failure cleanup passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
