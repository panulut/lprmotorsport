// Real Worker / SQLite test: authorization, throttling, growing leaderboard.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {createLocalLeaderboard}=require('../verification/local-leaderboard.cjs');
const {revision}=require('../verification/world.cjs');

(async()=>{
 const secret='timing-panel-performance-secret-'.repeat(3);
 const {hash}=await import('../verification/protocol.mjs');
 const board=await createLocalLeaderboard({secret,revision});
 await new Promise(ok=>board.listen(0,'127.0.0.1',ok));
 const db=board.db,base='http://127.0.0.1:'+board.address().port;
 const now=Date.now(),expires=now+3600000,secretHash=await hash(secret);
 const guest=db.prepare('INSERT INTO verified_guests(player_hash,nickname,created_ms) VALUES (?,?,?)');
 const session=db.prepare('INSERT INTO verified_login_sessions(token_hash,player_hash,secret_hash,created_ms,expires_ms) VALUES (?,?,?,?,?)');
 const insertLap=db.prepare('INSERT INTO verified_laps(session_id,lap,revision,player_hash,nickname,start_tick,end_tick,lap_ticks,sector1,sector2,sector3,issued_ms) VALUES (?,1,?,?,?,?,?,?,?,?,?,?)');
 const insertReplay=db.prepare("INSERT INTO verified_replays(session_id,lap,payload,payload_hash,expires_ms,pinned,review) VALUES (?,1,'fixture','fixture-hash',?,1,'unreviewed')");
 const users={};
 for(const [name,digit]of [['rate','f'],['ip','e'],['bench','d']]){
  const token=digit.repeat(64),owner=digit.repeat(64);
  guest.run(owner,name+' driver',now);
  session.run(await hash(token),owner,secretHash,now,expires);
  users[name]={owner,token};
 }
 let rankingCalls=0;
 const originalPrepare=board.binding.prepare.bind(board.binding);
 board.binding.prepare=sql=>{
  if(sql.includes('WITH ranked AS ('))rankingCalls++;
  return originalPrepare(sql);
 };
 const get=(token,ip='203.0.113.7')=>fetch(base+'/api/verified/timing-panel?series=human',{headers:{
  ...(token?{Authorization:'Bearer '+token}:{}),'CF-Connecting-IP':ip}});
 const sample=async()=>{
  const start=performance.now(),response=await get(users.bench.token,'198.51.100.50');
  const data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));
  return {ms:performance.now()-start,data};
 };
 const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const addLap=(i,ticks,owner,name)=>{
  const id=i.toString(16).padStart(32,'0');
  insertLap.run(id,revision,owner,name,0,ticks,ticks,2000,2000,ticks-4000,now);
  insertReplay.run(id,expires);
 };
 const seed=(first,last)=>{
  db.exec('BEGIN');
  try{
   for(let i=first;i<=last;i++){
    const owner=i.toString(16).padStart(64,'0'),name='Driver '+i;
    guest.run(owner,name,now);
    addLap(i,i<=1000?6000+i:7100+i,owner,name);
   }
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 };
 try{
  assert.equal((await get(null)).status,401);
  assert.equal((await get('0'.repeat(64))).status,401);
  assert.equal(rankingCalls,0,'No ranking SQL is executed for unauthenticated requests');
  for(let i=0;i<30;i++)assert.equal((await get(users.rate.token)).status,200);
  assert.equal(rankingCalls,30);
  const blocked=await get(users.rate.token);
  assert.equal(blocked.status,429,'31st player request must be throttled');
  const retryAfter=Number(blocked.headers.get('Retry-After'));
  assert(Number.isInteger(retryAfter)&&retryAfter>=1&&retryAfter<=60);
  assert.equal(rankingCalls,30,'Throttled requests must skip the expensive query');
  const ip='198.51.100.27';
  db.prepare('INSERT INTO verified_limits(key,attempts,expires) VALUES (?,?,?)')
   .run('tp:i:'+await hash(ip)+':'+Math.floor(Date.now()/60000),119,Date.now()+120000);
  assert.equal((await get(users.ip.token,ip)).status,200,'120th IP request must work');
  const beforeIpBlock=rankingCalls;
  assert.equal((await get(users.ip.token,ip)).status,429,'121st IP request must be throttled');
  assert.equal(rankingCalls,beforeIpBlock,'IP throttling must skip ranking SQL');
  assert.equal((await get(users.bench.token,'198.51.100.28')).status,200,'Other IP addresses remain available');

  db.exec('BEGIN');
  try{addLap(100000,6900,users.bench.owner,'bench driver');db.exec('COMMIT');}
  catch(error){db.exec('ROLLBACK');throw error;}
  seed(1,1000);
  const small=[];
  for(let i=0;i<3;i++)small.push(await sample());
  const reference=small[0].data;
  assert.equal(reference.fieldSize,1001);
  assert.equal(reference.rank,900,'Owner rank remains correct');
  assert.equal(reference.personalBest.lap_ms,6900*1000/120);
  assert.equal(reference.trackBest.lap_ms,6001*1000/120);
  assert.equal(reference.next.lap_ms,6901*1000/120);

  seed(1001,12000);
  const large=[];
  for(let i=0;i<3;i++)large.push(await sample());
  for(const result of large){
   assert.equal(result.data.fieldSize,12001);
   assert.equal(result.data.rank,900);
   assert.equal(result.data.next.lap_ms,6901*1000/120);
   assert(Buffer.byteLength(JSON.stringify(result.data))<2000,'Response must stay compact');
  }
  const smallMs=median(small.map(x=>x.ms)),largeMs=median(large.map(x=>x.ms));
  assert(largeMs<Math.max(2500,smallMs*18+200),
   'Response-time growth exceeds the generous local SQLite regression gate: '+smallMs.toFixed(1)+' -> '+largeMs.toFixed(1)+' ms');
  console.log('Timing-panel median, 1,001 drivers: '+smallMs.toFixed(1)+' ms; 12,001 drivers: '+largeMs.toFixed(1)+' ms');

  const bundle=path.join(__dirname,'../cloudflare/verified-worker.bundle.mjs');
  const checkedIn=fs.readFileSync(bundle,'utf8');
  execFileSync(process.execPath,[path.join(__dirname,'../scripts/bundle-verified-worker.cjs')]);
  assert.equal(fs.readFileSync(bundle,'utf8'),checkedIn,'The generated Worker bundle must match the source');
  console.log('PASS: timing-panel auth, 429/Retry-After, per-account/IP limits, 12k-driver scaling and bundle parity');
 }finally{await new Promise(ok=>{board.close(ok);board.closeAllConnections();});}
})().catch(error=>{console.error(error);process.exitCode=1;});
