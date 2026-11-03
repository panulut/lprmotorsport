const assert=require('node:assert/strict');
(async()=>{
 const secret='leaderboard-test-secret-'.repeat(3),adminToken='leaderboard-admin-secret-'.repeat(3),revision='a'.repeat(64);
 const {sign,hash}=await import('../verification/protocol.mjs');
 const {default:worker}=await import('../cloudflare/verified-worker.mjs');
 const board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision,adminToken,passwordIterations:10000});
 await new Promise(r=>board.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+board.address().port,now=Date.now();
 const replay=require('node:zlib').gzipSync(JSON.stringify({format:'leaderboard-test'})).toString('base64'),replayHash=await hash(replay);
 const post=(path,data,token)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
 const get=async path=>{const r=await fetch(base+path);assert.equal(r.status,200);return r.json();};
 const accounts=[];
 const seed=(owner,lap,ticks,{session=owner.session,issued=now,pinned=0}={})=>{
  board.db.prepare('INSERT INTO verified_laps VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(session,lap,revision,owner.hash,owner.nickname,0,ticks,ticks,2000,2000,ticks-4000,issued);
  board.db.prepare('INSERT INTO verified_replays VALUES (?,?,?,?,?,?,?)').run(session,lap,replay,replayHash,now+86400000,pinned,'unreviewed');
 };
 const clean=()=>worker.scheduled({}, {DB:board.binding,SIMULATION_REVISION:revision});
 const top=()=>get('/api/verified/leaderboard');
 const adminStatus=(session,lap)=>fetch(base+'/api/verified/admin/lap-status?sessionId='+session+'&lap='+lap,{headers:{Authorization:'Bearer '+adminToken}}).then(r=>r.json());
 try{
  for(let i=0;i<14;i++){
   const nickname='Driver '+i;
   const response=await post('/api/verified/account',{nickname,password:'test-password',create:true,series:i===13?'bot':'human'});
   assert.equal(response.status,201);
   const account=await response.json();
   accounts.push({...account,hash:board.db.prepare('SELECT player_hash FROM verified_accounts WHERE nickname=?').get(nickname).player_hash,session:(i+1).toString(16).padStart(32,'0')});
  }
  // One driver has more fast laps than the entire original retention pool.
  for(let lap=1;lap<=25;lap++)seed(accounts[0],lap,6000+lap);
  // A matching PB in another session must not produce a second row.
  const secondSession='f'.repeat(32);seed(accounts[0],1,6001,{session:secondSession,issued:now+1});
  for(let i=1;i<12;i++)seed(accounts[i],1,7000+Math.floor(i/2),{issued:now+i});
  seed(accounts[13],1,5000);
  await clean();
  let result=await top();
  assert.equal(result.results.length,10,'Deduplicate before applying TOP 10');
  assert.deepEqual(result.results.map(r=>r.nickname),accounts.slice(0,10).map(a=>a.nickname));
  assert.equal(result.results[0].session_id,accounts[0].session,'Equal personal times retain arrival order across sessions');
  assert(result.results.every(r=>r.player_hash===undefined&&r.player_order===undefined),'Internal identities stay private');
  for(const row of result.results)assert.equal((await fetch(base+'/api/verified/replays/'+row.session_id+'/'+row.lap)).status,200);
  assert.equal((await get('/api/verified/leaderboard?series=bot')).results[0].nickname,accounts[13].nickname);
  const related=await get('/api/verified/replays/'+accounts[0].session+'/1/related');
  assert(related.results.length>1,'Multiple replays remain discoverable for the same driver');
  assert(related.results.some(r=>r.lap===2));
  for(const row of related.results)assert.equal((await fetch(base+'/api/verified/replays/'+row.session_id+'/'+row.lap)).status,200);
  assert.equal((await fetch(base+'/api/verified/replays/'+accounts[0].session+'/20/related')).status,404,'Private replays cannot expose related recordings');
  assert.equal((await adminStatus(accounts[0].session,2)).reasons.includes('not_personal_best'),true);
  assert.equal((await adminStatus(accounts[9].session,1)).rank,10,'Admin ranks count drivers');
  // New drivers can upload a slower personal best despite another driver's twenty faster replays.
  const owner=accounts[12],ticks=7010;
  const receipt=await sign({kind:'lap',protocol:'driving-v1',revision,playerHash:owner.hash,nickname:owner.nickname,sessionId:owner.session,lap:1,startTick:0,endTick:ticks,lapTicks:ticks,sectorTicks:[2000,2000,ticks-4000],issuedAt:now,replayHash},secret);
  assert.equal((await post('/api/verified/laps',{receipt,replay},owner.token)).status,200);
  assert(board.db.prepare('SELECT 1 FROM verified_replays WHERE session_id=?').get(owner.session),'Distinct-driver reserve retains the new recording');
  // Exclusion selects that driver's next eligible lap; restoration recovers the PB.
  const path='/api/verified/admin/laps?sessionId='+accounts[0].session+'&lap=1';
  assert.equal((await post(path,{},adminToken)).status,200);
  result=await top();assert.equal(result.results[0].session_id,secondSession);assert.equal(result.results.length,10);
  assert.equal((await post(path+'&restore=1',{},adminToken)).status,200);
  assert.equal((await top()).results[0].session_id,accounts[0].session);
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_laps WHERE player_hash=?').get(accounts[0].hash).n,26,'Leaderboard changes preserve every lap');
  console.log('PASS: one personal best per stable driver, TOP 10 before limit, ties across sessions, series, multi-replay discovery/access, retention beyond one driver, diagnostics and exclusions');
 }finally{await new Promise(r=>{board.close(r);board.closeAllConnections();});}
})().catch(error=>{console.error(error);process.exitCode=1;});
