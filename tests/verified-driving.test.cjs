const assert=require('node:assert/strict');
const {revision,createWorld}=require('../verification/world.cjs');
const {driver}=require('./helpers-driving.cjs');
(async()=>{
 const secret='test-only-secret-'.repeat(4),{verify,sign,hash}=await import('../verification/protocol.mjs');
 let clock=0;
 const service=await require('../verification/server.cjs').createServer({secret,sessionsOptions:{clock:()=>clock}});
 const board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision});
 await new Promise(r=>service.listen(0,'127.0.0.1',r));await new Promise(r=>board.listen(0,'127.0.0.1',r));
 const serviceURL=`http://127.0.0.1:${service.address().port}`,boardURL=`http://127.0.0.1:${board.address().port}`;
 const token='a'.repeat(64);
 const post=(base,path,data,credential=token)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+credential},body:JSON.stringify(data)});
 try{
  const begin=await post(boardURL,'/api/verified/start',{nickname:'Driver',revision});assert.equal(begin.status,200);
  const {ticket}=await begin.json();
  const start=()=>post(serviceURL,'/sessions',{ticket,revision,armed:true});
  const [first,retry]=await Promise.all([start(),start()]);
  const s=await first.json();assert.equal(first.status,201);assert.deepEqual(await retry.json(),s,'Concurrent ticket retries cannot reset a session');
  const send=data=>post(serviceURL,`/sessions/${s.id}/inputs`,data,s.sessionToken);
  const idle=[0,0,0,false,false,true];
  assert.equal((await send({revision,seq:0,fromTick:0,inputs:[idle]})).status,410,'Prepared sessions cannot simulate before the official start');
  clock=5000;
  const activation=()=>post(serviceURL,`/sessions/${s.id}/start`,{},s.sessionToken);
  assert.equal((await activation()).status,200);
  const baseClock=clock,startedClock=service.sessions.sessions.get(s.id).started;
  clock+=100;assert.equal((await activation()).status,200);
  assert.equal(service.sessions.sessions.get(s.id).started,startedClock,'Retrying activation never resets the server clock');
  assert.equal((await send({revision,seq:0,fromTick:0,inputs:Array(60).fill(idle)})).status,425,'Speed-up is bounded by the server clock');
  assert.equal((await post(serviceURL,`/sessions/${s.id}/inputs`,{revision,seq:0,fromTick:0,inputs:[idle]},'wrong')).status,401);
  const {world,api}=createWorld();let seq=0,receipts=[],last;
  while(world.result().lap<3){
   const inputs=[];for(let i=0;i<60;i++){const input=driver(world);inputs.push(api.encode(input));world.step(input);assert(!world.car.crashed);}
   clock=baseClock+world.result().ticks*1000/120;
   const data={revision,seq,fromTick:world.result().ticks-inputs.length,inputs,lapMs:1};
   const response=await send(data);assert.equal(response.status,200,await response.clone().text());
   last=await response.json();assert.deepEqual(last.result,world.result(),'Authoritative simulation matches the game including moving people');
   if(seq===0){assert.deepEqual(await(await send(data)).json(),last);
    assert.equal((await send({...data,inputs:inputs.map(()=>idle)})).status,409,'Acknowledged controls cannot be rewritten');
    assert.equal((await send({...data,seq:2,fromTick:60})).status,409,'Sequence gaps are rejected');
   }
   receipts.push(...last.laps.map(lap=>lap.receipt));seq++;
  }
  assert.equal(receipts.length,2,'Standing and flying laps both receive receipts');
  const firstLap=await verify(receipts[0],secret),flying=await verify(receipts[1],secret);
  assert.equal(firstLap.playerHash,await hash(token));assert.equal(flying.startTick,firstLap.endTick,'Flying lap preserves authoritative state');
  assert(firstLap.lapTicks>600);assert.notEqual(firstLap.lapTicks*1000/120,1,'Client time claims are ignored');
  for(const receipt of receipts){
   assert.equal((await post(boardURL,'/api/verified/laps',{receipt},'b'.repeat(64))).status,403,'Receipt is player-bound');
   const tampered=receipt.slice(0,-2)+(receipt.at(-2)==='A'?'B':'A')+receipt.at(-1);
   assert.equal((await post(boardURL,'/api/verified/laps',{receipt:tampered})).status,403,'Forged signature fails');
   const saved=await post(boardURL,'/api/verified/laps',{receipt});assert.equal(saved.status,200);assert.equal((await saved.json()).saved,true);
   assert.equal((await(await post(boardURL,'/api/verified/laps',{receipt})).json()).saved,false,'Receipt retries never duplicate a lap');
  }
  const rows=await(await fetch(boardURL+'/api/verified/leaderboard')).json();assert.equal(rows.results.length,2);
  assert.equal((await post(boardURL,'/api/verified/laps',{lapMs:12345})).status,403,'Unsigned client scores are never accepted');
  const wrongTicket=await sign({...await verify(ticket,secret),revision:'b'.repeat(64)},secret);
  assert.equal((await post(serviceURL,'/sessions',{ticket:wrongTicket,revision})).status,401);
  clock+=9000;
  assert.equal((await send({revision,seq,fromTick:last.ackTick,inputs:[idle]})).status,410,'A long disconnection invalidates verification');
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_laps').get().n,2);
  console.log('PASS: real HTTP → signed start → authoritative 3D physics with people → standing/flying receipts → SQLite leaderboard; clock, ownership, sequence, replay, forgery, duplicates and disconnect');
 }finally{await service.sessions.close();await Promise.all([service,board].map(server=>new Promise(r=>server.close(r))));}
})().catch(error=>{console.error(error);process.exitCode=1;});
