// One driver cannot occupy the shared verified driving capacity.
const assert=require('node:assert/strict');
const {Sessions}=require('../verification/sessions.cjs');
const {revision}=require('../verification/world.cjs');
const player=c=>c.repeat(64);
(async()=>{
 // 1. One driving slot per driver: a new start replaces the driver's previous session.
 let clock=0;
 const sessions=new Sessions({clock:()=>clock,maxSessions:10,maxStartsPerMinute:32});
 try{
  const first=await sessions.create(revision,{playerHash:player('a')});
  const second=await sessions.create(revision,{playerHash:player('a')});
  assert.equal(sessions.activeCount,1,'The same driver holds one slot');
  assert.equal(sessions.sessions.get(first.id).reason,'replaced');
  assert.equal(sessions.sessions.get(second.id).slot,true);
  await sessions.create(revision,{playerHash:player('b')});
  assert.equal(sessions.activeCount,2,'Another driver keeps their own slot');

  // 2. Per-driver start budget is checked before, and never spends, the shared rate.
  for(let i=2;i<6;i++)await sessions.create(revision,{playerHash:player('a')});
  const sharedBefore=sessions.creations.length;
  await assert.rejects(()=>sessions.create(revision,{playerHash:player('a')}),e=>e.status===429&&e.code==='player_rate_limit');
  assert.equal(sessions.creations.length,sharedBefore,'A refused driver start uses none of the shared budget');
  await sessions.create(revision,{playerHash:player('c')});
  assert.equal(sessions.activeCount,3,'Drivers a, b and c each hold one slot');
  clock+=60001;
  const later=await sessions.create(revision,{playerHash:player('a')});
  assert.equal(sessions.sessions.get(later.id).slot,true,'The driver budget recovers after a minute');
 }finally{await sessions.close();}

 // 3. A driver's unused start tickets cannot fill the server's shared ticket memory.
 const {createServer}=require('../verification/server.cjs');
 const {sign}=await import('../verification/protocol.mjs');
 const secret='abuse-limit-secret-'.repeat(3);
 const server=await createServer({secret,origins:[],sessionsOptions:{maxSessions:10,maxStartsPerMinute:256}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;let nonce=0;
 const start=async playerHash=>{
  const now=Date.now(),ticket=await sign({kind:'start',protocol:'driving-v1',revision,playerHash,nickname:'Driver',
   nonce:(++nonce).toString(16).padStart(64,'0'),issuedAt:now,expiresAt:now+120000},secret);
  const r=await fetch(base+'/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,ticket,armed:true})});
  return {status:r.status,body:await r.json()};
 };
 try{
  const results=[];for(let i=0;i<17;i++)results.push(await start(player('d')));
  assert.equal(results.filter(r=>r.status===201).length,6,'Six starts a minute per driver');
  assert.equal(results.at(-1).status,429);assert.equal(results.at(-1).body.error,'Too many start tickets');
  assert.equal((await start(player('e'))).status,201,'Another driver can still start');
 }finally{await new Promise(r=>server.close(r));await server.sessions.close();}

 console.log('Abuse limits: one slot per driver, per-driver start and ticket budgets');
})().catch(error=>{console.error(error);process.exitCode=1;});
