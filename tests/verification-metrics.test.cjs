const assert=require('node:assert/strict');
(async()=>{
 const {Sessions}=require('../verification/sessions.cjs');
 for(const bad of [0,-1,1.5,257,NaN])assert.throws(()=>new Sessions({maxSessions:bad}),/Capacity limits/);
 const secret='capacity-metrics-secret-'.repeat(3),{revision}=require('../verification/world.cjs');
 const server=await require('../verification/server.cjs').createServer({secret,metricsToken:secret,sessionsOptions:{maxSessions:1}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(url+'/metrics')).status,401);
  assert.equal((await fetch(url+'/metrics',{headers:{Authorization:'Bearer wrong'}})).status,401);
  const sessions=server.sessions,identity={playerHash:'a'.repeat(32),nickname:'Metrics player'};
  const s=await sessions.create(revision,identity);
  await assert.rejects(()=>sessions.create(revision,identity),e=>e.code==='capacity');
  await new Promise(r=>setTimeout(r,500));
  const batch={revision,seq:0,fromTick:0,inputs:Array.from({length:60},()=>[0,0,0,false,false,true])};
  const first=await sessions.batch(s.id,s.sessionToken,batch);
  assert.deepEqual(await sessions.batch(s.id,s.sessionToken,batch),first);
  const response=await fetch(url+'/metrics',{headers:{Authorization:'Bearer '+secret}}),m=await response.json();
  assert.equal(response.status,200);assert.equal(m.counters.starts,1);assert.equal(m.counters.capacityRejected,1);
  assert.equal(m.counters.batches,1);assert.equal(m.counters.ticks,60);assert.equal(m.activeSessions,1);assert.equal(m.pool.workers,1);assert.equal(m.pool.sessions,1);
  assert(m.timings.physicsMs.count===1&&m.timings.batchResponseMs.count===1);assert.equal(m.timings.physicsMs.buckets.length,16);
  assert(!JSON.stringify(m).includes(identity.nickname));assert(!JSON.stringify(m).includes(s.sessionToken));
  sessions.cancel(s.id,s.sessionToken);
  sessions.maxStartsPerMinute=1;
  await assert.rejects(()=>sessions.create(revision,identity),e=>e.code==='rate_limit');
  assert.equal(sessions.snapshotMetrics().counters.startRateRejected,1);
  const started=m.since;assert(Number.isSafeInteger(started)&&started<=Date.now());
  // Terminal failures are counted once, even if cleanup repeats invalidation.
  const fake={slot:true,phase:'running',pendingLaps:new Map()};sessions.invalidate(fake,'budget');sessions.invalidate(fake,'budget');
  const late={slot:true,phase:'running',pendingLaps:new Map()};sessions.invalidate(late,'lag');sessions.invalidate(late,'lag');
  const counters=sessions.snapshotMetrics().counters;assert.equal(counters.processingTimeouts,1);assert.equal(counters.lagTerminations,1);assert.equal(sessions.snapshotMetrics().since,started);
  console.log('PASS: private bounded metrics, capacity rejection, start-rate rejection, retry idempotency and simulated ticks');
 }finally{await server.sessions.close();await new Promise(r=>server.close(r));}
 const disabled=await require('../verification/server.cjs').createServer({secret,metricsToken:''});
 await new Promise(r=>disabled.listen(0,'127.0.0.1',r));
 try{assert.equal((await fetch('http://127.0.0.1:'+disabled.address().port+'/metrics',{headers:{Authorization:'Bearer '+secret}})).status,404);}
 finally{await disabled.sessions.close();await new Promise(r=>disabled.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
