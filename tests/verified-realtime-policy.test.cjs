const assert=require('node:assert/strict');
const {Sessions}=require('../verification/sessions.cjs');
const {revision,createWorld}=require('../verification/world.cjs');
const {driver}=require('./helpers-driving.cjs');

(async()=>{
 let clock=0;
 const signed=[];
 const sessions=new Sessions({clock:()=>clock,signLap:async(s,lap)=>{signed.push(lap);return 'signed-'+lap.lap;}});
 try{
  const session=await sessions.create(revision,{}),{world,api}=createWorld();
  let seq=0,ack,delayed=false,caughtUp=false,lateCrossing=false,afterLateCrossing=false;
  const send=async(inputs)=>{
   const data={revision,seq,fromTick:world.result().ticks-inputs.length,inputs};
   const reply=await sessions.batch(session.id,session.sessionToken,data);seq++;
   assert.deepEqual(reply.result,world.result(),'Recovery preserves all authoritative vehicle/world state');
   if(reply.practiceLaps.length){
    assert.equal(reply.laps.length,0,'Practice finishes must never receive a signature');
    assert.deepEqual(await sessions.batch(session.id,session.sessionToken,data),reply,'Retries cannot requalify or sign a practice lap');
   }
   return reply;
  };
  while(world.result().lap<5){
   const inputs=[];let completed=null;
   for(let i=0;i<60;i++){
    const input=driver(world);inputs.push(api.encode(input));
    const event=world.step(input);assert(!world.car.crashed);
    if(event.completed){completed=event.completed;break;}
   }
   const simMs=world.result().ticks*1000/120;
   // One nine-second outage, followed by the original buffered input history.
   if(!delayed){clock=simMs+9000;delayed=true;}
   else clock=Math.max(clock,simMs+100); // ordinary 100 ms transit jitter
   // Delay lap 2's FINISH only. Its following lap must remain practice even
   // when the server catches up immediately after that boundary.
   if(completed?.lap===2){clock=simMs+session.lapLagMs+100;lateCrossing=true;}
   ack=await send(inputs);
   if(seq===1){assert(!ack.eligibility.eligible);assert.equal(ack.laps.length,0);}
   if(!completed&&simMs>10000&&!caughtUp){
    assert(!ack.eligibility.eligible,'Catching up mid-lap cannot retroactively qualify it');caughtUp=true;
   }
   if(completed?.lap===1){
    assert.deepEqual(ack.practiceLaps,[1]);assert(ack.eligibility.eligible);
    assert.equal(ack.eligibility.fromTick,completed.endTick);
    assert.equal(signed.length,0,'A timely boundary qualifies only the following lap');
   }
   if(completed?.lap===2){assert(!ack.eligibility.eligible);assert.deepEqual(ack.practiceLaps,[2]);}
   if(lateCrossing&&!afterLateCrossing&&!completed&&simMs>clock-200){
    assert(!ack.eligibility.eligible,'Recovery just after a line must wait for another crossing');afterLateCrossing=true;
   }
   if(completed?.lap===3){assert.deepEqual(ack.practiceLaps,[3]);assert(ack.eligibility.eligible);}
   if(completed?.lap===4){const final=await sessions.laps(session.id,session.sessionToken);assert.equal(final.laps[0].lap.lap,4);assert.deepEqual(ack.practiceLaps,[]);}
  }
  assert(caughtUp&&afterLateCrossing);
  assert.deepEqual(signed.map(lap=>lap.lap),[4],'Only an entire timely lap is signed');
  assert.equal(sessions.sessions.get(session.id).started,0,'Recovery never rebases the pacing clock');

  // Exact threshold, accumulated slow motion, forged state and missing exact
  // boundary are checked independently of the long driving scenario.
  await sessions.cancel(session.id,session.sessionToken);
  const other=await sessions.create(revision,{});const started=clock;
  const idle=[0,0,0,false,false,true];
  clock=started+500+other.lapLagMs;
  let reply=await sessions.batch(other.id,other.sessionToken,{revision,seq:0,fromTick:0,inputs:Array(60).fill(idle)});
  assert(reply.eligibility.eligible,'The inclusive limit accepts normal bounded delay');
  clock+=501;
  reply=await sessions.batch(other.id,other.sessionToken,{revision,seq:1,fromTick:60,inputs:Array(60).fill(idle),lapEligible:true,x:123});
  assert(!reply.eligibility.eligible,'Cumulative slowdown beyond the limit fails even with regular requests');
  assert.notEqual(reply.result.state.x,123,'Client coordinates cannot establish trusted state');
  assert.deepEqual(reply.laps,[]);
  console.log('PASS: bounded jitter, cumulative slowdown, practice receipts, exact-once recovery, late crossings, flying requalification and continuous authoritative state');
 }finally{await sessions.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
