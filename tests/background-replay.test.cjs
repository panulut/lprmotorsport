const assert=require('node:assert/strict'),path=require('node:path'),{createHash}=require('node:crypto'),{gunzipSync}=require('node:zlib');
const {Sessions}=require('../verification/sessions.cjs'),{VerificationPool}=require('../verification/worker-pool.cjs');
const {revision}=require('../verification/world.cjs');
const {Recorder}=require('../verification/replay.cjs');
const workerPath=path.join(__dirname,'fixtures/held-replay-worker.cjs'),idle=[0,0,0,false,false,true];
const wait=()=>new Promise(r=>setImmediate(r));
const make=options=>new Sessions({...options,executorFactory:o=>new VerificationPool({...o,workerPath}),signLap:async(s,lap)=>s.id+':'+lap.lap+':'+lap.replayHash});
(async()=>{
 // Completing a lap captures references and resets; it must not stringify it.
 const world={ticks:60,track:[],car:{},result:()=>({ticks:60,state:{x:0,y:0,angle:0,vx:0,vy:0}})},recorder=new Recorder(world,revision,{deferPacking:true});
 const stringify=JSON.stringify;let document;
 try{JSON.stringify=()=>{throw Error('Serialization on the physics path');};document=recorder.step(idle,{completed:{lap:1,endTick:60}});}finally{JSON.stringify=stringify;}
 assert(document.frames!==recorder.frames);assert(document.inputs!==recorder.inputs);
 const controller=new AbortController(),packing=recorder.pack(document,{signal:controller.signal});controller.abort();
 await assert.rejects(packing,e=>e.name==='AbortError','A per-lap abort destroys the actual zlib stream');
 let now=0;
 const sessions=make({clock:()=>now,maxSessions:2,ttlMs:5000});
 try{
  const players=await Promise.all([sessions.create(revision,{}),sessions.create(revision,{})]);
  const send=(p,seq,fromTick=seq*60,length=60)=>sessions.batch(p.id,p.sessionToken,{revision,seq,fromTick,inputs:Array(length).fill(idle)});
  now=500;
  const first=await Promise.all(players.map(p=>send(p,0)));
  assert(first.every(ack=>ack.laps.length===0&&ack.ackTick===60));
  const entry=[...sessions.pool.entries][0];
  // Packing is held indefinitely: no wall-clock race decides whether the ack wins.
  assert((await sessions.pool.inspect()).every(s=>s.pendingRecordings===2));
  let fetched=false;
  const fetchFinal=sessions.laps(players[0].id,players[0].sessionToken).then(v=>{fetched=true;return v;});
  await wait();assert.equal(fetched,false);
  now=1000;
  const second=await Promise.all(players.map(p=>send(p,1)));
  assert(second.every(ack=>ack.laps.length===0&&ack.ackTick===120),'Both players continue while their first recording is blocked');
  assert.equal(sessions.pool.recordings.size,4);
  // A later late boundary may not retroactively disqualify the first two laps.
  now=4000;const late=await send(players[0],2);assert.deepEqual(late.practiceLaps,[3]);assert.equal(late.eligibility.eligible,false);
  const original={revision,seq:0,fromTick:0,inputs:Array(60).fill(idle)};
  assert.deepEqual(await sessions.batch(players[0].id,players[0].sessionToken,original),first[0]);
  sessions.cancel(players[0].id,players[0].sessionToken);
  now=6000;sessions.sweep();assert.equal(sessions.sessions.get(players[1].id).reason,'expired');
  await assert.rejects(sessions.laps(players[0].id,'wrong'),e=>e.code==='owner');
  entry.worker.postMessage({kind:'unblock-recordings'});
  assert.equal((await fetchFinal).laps.length,1,'GET waits only for the boundary accepted when it arrived');
  const final=await Promise.all(players.map(p=>sessions.laps(p.id,p.sessionToken)));
  for(let i=0;i<players.length;i++){
   assert.deepEqual(final[i].laps.map(v=>v.lap.lap),[1,2]);
   assert.deepEqual(await sessions.laps(players[i].id,players[i].sessionToken),final[i],'Final retrieval is repeatable after cancellation/TTL');
   for(const item of final[i].laps){
    assert(item.receipt.startsWith(players[i].id+':'));
    assert(item.receipt.endsWith(createHash('sha256').update(item.replay).digest('hex')));
    const doc=JSON.parse(gunzipSync(Buffer.from(item.replay,'base64')));assert.equal(doc.endTick,item.lap.endTick);
   }
  }
  assert.deepEqual(await sessions.batch(players[0].id,players[0].sessionToken,original),first[0],'Packing cannot mutate an already cached ack');
  await sessions.pool.drain();assert.equal(sessions.pool.recordings.size,0);
  assert((await sessions.pool.inspect()).every(s=>s.worlds===0&&s.queued===0&&s.pendingRecordings===0&&s.queuedRecordings===0));
  assert.equal(sessions.metrics.verifiedLaps,4);assert.equal(sessions.metrics.practiceLaps,1);
 }finally{await sessions.close();}
 // Ready artifacts use a later input response without changing its tick/state;
 // a later failed recording must not hide an earlier completed receipt.
 now=0;const later=make({clock:()=>now});
 try{
  const p=await later.create(revision,{}),entry=[...later.pool.entries][0];now=500;
  const first=await later.batch(p.id,p.sessionToken,{revision,seq:0,fromTick:0,inputs:Array(60).fill(idle)});
  entry.worker.postMessage({kind:'unblock-recordings'});
  const completed=await later.laps(p.id,p.sessionToken);assert.equal(completed.laps.length,1);
  now=500+1000/120;
  const data={revision,seq:1,fromTick:60,inputs:[idle]},ack=await later.batch(p.id,p.sessionToken,data);
  assert.equal(ack.ackTick,61);assert.deepEqual(ack.laps,completed.laps);assert.deepEqual(first.laps,[]);
  assert.deepEqual(await later.batch(p.id,p.sessionToken,data),ack);
  entry.worker.postMessage({kind:'fail-recordings'});now=1000;
  await later.batch(p.id,p.sessionToken,{revision,seq:2,fromTick:61,inputs:Array(59).fill(idle)});
  assert.deepEqual(await later.laps(p.id,p.sessionToken),completed,'A later packing failure preserves completed receipts');
  await later.pool.drain();
 }finally{await later.close();}
 for(const failure of ['crash','packing']){
  now=0;const s=make({clock:()=>now});
  try{
   const p=await s.create(revision,{});now=500;
   await s.batch(p.id,p.sessionToken,{revision,seq:0,fromTick:0,inputs:Array(60).fill(idle)});
   const entry=[...s.pool.entries][0],pending=s.laps(p.id,p.sessionToken);
   if(failure==='crash'){
    await entry.worker.terminate();assert.deepEqual(await pending,{laps:[]});assert.equal(s.sessions.get(p.id).reason,'worker_lost');
   }else{
    const rejected=assert.rejects(pending,e=>e.code==='replay');entry.worker.postMessage({kind:'fail-recordings'});await rejected;
   }
   await s.pool.drain();assert.equal(s.pool.recordings.size,0);assert.equal(s.sessions.get(p.id).pendingLaps.size,0);
  }finally{await s.close();}
 }
 // A replay deadline must cancel just that artifact and leave a second player
 // and the same worker alive. Exercise the actual timer with a short test budget.
 now=0;
 const timed=new Sessions({clock:()=>now,maxSessions:2,executorFactory:o=>new VerificationPool({...o,workerPath,replayTimeoutMs:100}),signLap:async()=> 'signed'});
 try{
  const [p,other]=await Promise.all([timed.create(revision,{}),timed.create(revision,{})]);
  const entry=[...timed.pool.entries][0],threadId=entry.worker.threadId;now=500;
  await timed.batch(p.id,p.sessionToken,{revision,seq:0,fromTick:0,inputs:Array(60).fill(idle)});
  await assert.rejects(timed.laps(p.id,p.sessionToken),e=>e.code==='replay');
  await timed.pool.drain();
  assert.equal(entry.worker.threadId,threadId);assert.equal(entry.dead,false);
  assert.equal(timed.sessions.get(other.id).phase,'running');assert.equal(timed.sessions.get(p.id).reason,'replay');
  assert.equal(timed.pool.recordings.size,0);assert.equal(timed.sessions.get(p.id).pendingLaps.size,0);
  const healthy=await timed.batch(other.id,other.sessionToken,{revision,seq:0,fromTick:0,inputs:Array(59).fill(idle)});
  assert.equal(healthy.ackTick,59);assert.equal(healthy.eligibility.eligible,true);
  const stats=await timed.pool.inspect();assert(stats.every(v=>v.pendingRecordings===0&&!v.packing));
  entry.worker.postMessage({kind:'unblock-recordings'});
  await timed.batch(other.id,other.sessionToken,{revision,seq:1,fromTick:59,inputs:[idle]});
  const final=await timed.laps(other.id,other.sessionToken);assert.equal(final.laps.length,1);assert(final.laps[0].replay);
  assert.equal(entry.worker.threadId,threadId,'The unaffected player also completes a new replay in the original worker');
 }finally{await timed.close();}
 // Keep the FIFO artificially nonempty even between setImmediate turns.
 now=0;const busy=make({clock:()=>now});
 try{
  const p=await busy.create(revision,{}),entry=[...busy.pool.entries][0],threadId=entry.worker.threadId;
  entry.worker.postMessage({kind:'unblock-recordings'});
  entry.worker.postMessage({kind:'start-physics-flood'});now=500;
  const ack=await busy.batch(p.id,p.sessionToken,{revision,seq:0,fromTick:0,inputs:Array(60).fill(idle)});
  assert.equal(ack.ackTick,60);
  const receipt=await busy.laps(p.id,p.sessionToken);assert.equal(receipt.laps.length,1);
  const stats=await busy.pool.inspect();assert(stats[0].queued>0,'Physics FIFO stayed full throughout packing');
  assert(stats[0].forcedRecordings>0,'Starvation guard must have granted a packing turn');
  assert.equal(entry.worker.threadId,threadId);assert.equal(entry.dead,false);assert.equal(busy.sessions.get(p.id).phase,'running');
  entry.worker.postMessage({kind:'stop-physics-flood'});
  busy.cancel(p.id,p.sessionToken);await busy.pool.drain();
  assert((await busy.pool.inspect()).every(s=>s.worlds===0&&s.queued===0&&s.pendingRecordings===0&&!s.packing));
 }finally{await busy.close();}
 console.log('PASS: detached serialization, held packing without busy/ack delays, two queued laps, immutable retries, original finish eligibility, final GET ownership/retry, cancel/TTL/crash/error cleanup, per-lap timeout isolation and saturated-FIFO fairness');
})().catch(e=>{console.error(e);process.exitCode=1;});
