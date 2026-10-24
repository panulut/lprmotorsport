const assert=require('node:assert/strict');
const {Sessions}=require('../experiment/sessions.cjs');
const {createWorld,recordLap,replayLap,revision}=require('../scripts/lib/replay-probe.cjs');
(async()=>{
 let clock=0;const sessions=new Sessions({clock:()=>clock});
 const batch=(seq,fromTick,inputs)=>({revision,seq,fromTick,inputs});
 try{
  await assert.rejects(()=>sessions.create('old'),e=>e.status===409);
  const a=await sessions.create(revision),b=await sessions.create(revision);
  await assert.rejects(()=>sessions.create(revision),e=>e.status===429);
  await assert.rejects(()=>sessions.batch(a.id,b.sessionToken,batch(0,0,[[0,0,0]])),e=>e.status===401);
  await assert.rejects(()=>sessions.batch(a.id,a.sessionToken,batch(0,0,Array(60).fill([0,0,0]))),e=>e.status===425);
  assert.equal(sessions.sessions.get(a.id).ticks,0,'Early input cannot advance physics');
  clock=500;
  const payload=batch(0,0,Array(60).fill([0,0,0]));
  const [first,duplicate]=await Promise.all([sessions.batch(a.id,a.sessionToken,payload),sessions.batch(a.id,a.sessionToken,payload)]);
  assert.deepEqual(first,duplicate,'Concurrent retry shares one simulation');assert.equal(first.ackTick,60);
  assert.deepEqual(await sessions.batch(a.id,a.sessionToken,payload),first,'Lost acknowledgement can be retried exactly');
  await assert.rejects(()=>sessions.batch(a.id,a.sessionToken,batch(0,0,Array(60).fill([1,0,0]))),e=>e.status===409);
  await assert.rejects(()=>sessions.batch(a.id,a.sessionToken,batch(2,60,[[0,0,0]])),e=>e.status===409);
  await assert.rejects(()=>sessions.batch(a.id,a.sessionToken,batch(1,61,[[0,0,0]])),e=>e.status===409);
  await assert.rejects(()=>sessions.batch(a.id,a.sessionToken,batch(1,60,[[2,0,0]])),e=>e.status===400);
  assert.equal(sessions.sessions.get(b.id).ticks,0,'Players have independent state');
  sessions.cancel(a.id,a.sessionToken);
  await assert.rejects(()=>sessions.batch(a.id,a.sessionToken,batch(1,60,[[0,0,0]])),e=>e.status===410);
  clock=9000;
  await assert.rejects(()=>sessions.batch(b.id,b.sessionToken,batch(0,0,[[0,0,0]])),e=>e.status===410,'No retrospective upload after a long pause');
  const c=await sessions.create(revision);clock+=16000;
  await assert.rejects(()=>sessions.batch(c.id,c.sessionToken,batch(0,0,[[0,0,0]])),e=>e.status===410);
  const d=await sessions.create(revision);await sessions.close();
  await assert.rejects(()=>sessions.batch(d.id,d.sessionToken,batch(0,0,[[0,0,0]])),e=>e.status===410,'Restart cannot restore a browser-provided state');
 }finally{await sessions.close();}
 // Artificial clock tests the complete protocol quickly; remote pacing is measured separately.
 let time=0;const full=new Sessions({clock:()=>time});
 try{
  const world=createWorld(),replay=recordLap(world),expected=replayLap(world,replay),s=await full.create(revision);
  let ack,seq=0;
  for(let offset=0;offset<replay.inputs.length;offset+=60){const inputs=replay.inputs.slice(offset,offset+60);time=(offset+inputs.length)*1000/120;
   ack=await full.batch(s.id,s.sessionToken,{...batch(seq++,offset,inputs),lapMs:1});}
  assert(ack.verified);assert.deepEqual(ack.result,expected,'Incremental physics matches whole-lap replay including final partial batch');
  assert.equal(ack.result.lapMs,96175,'Client time claim is ignored');assert.equal(full.activeCount,0,'Finishing releases the worker slot');
  const lastOffset=Math.floor((replay.inputs.length-1)/60)*60;
  const retried=await full.batch(s.id,s.sessionToken,batch(seq-1,lastOffset,replay.inputs.slice(lastOffset)));
  assert.deepEqual(retried,ack,'Final result is idempotent after worker shutdown');
 }finally{await full.close();}
 console.log('PASS: session ownership, bounded capacity, monotonic clock, future/late input, ordered batches, concurrent retries, immutable acknowledgments, disconnect/restart, final partial batch and independent server result');
})().catch(error=>{console.error(error);process.exitCode=1});
