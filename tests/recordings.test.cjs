const assert=require('node:assert/strict');
(async()=>{
 const secret='recording-test-secret-'.repeat(3),adminToken='recording-admin-secret-'.repeat(3),revision='a'.repeat(64);
 const {hash,sign}=await import('../verification/protocol.mjs');
 const {default:worker}=await import('../cloudflare/verified-worker.mjs');
 const board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision,adminToken});
 await new Promise(r=>board.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+board.address().port;
 const token='b'.repeat(64),playerHash=await hash(token),sessionId='c'.repeat(32),now=Date.now();
 const payload=require('node:zlib').gzipSync(JSON.stringify({format:'test-recording'})).toString('base64');
 const post=(path,data,credential=token)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+credential},body:JSON.stringify(data)});
 const receipt=lap=>sign({kind:'lap',protocol:'driving-v1',revision,sessionId,playerHash,nickname:'Test',lap,startTick:0,endTick:12000+lap,lapTicks:12000+lap,sectorTicks:[4000,4000,4000+lap],issuedAt:now,replayHash:null},secret);
 try{
  // A legacy score without a recording cannot enter the public TOP 10.
  let old=await receipt(1);assert.equal((await post('/api/verified/laps',{receipt:old})).status,403);
  board.db.prepare('INSERT INTO verified_laps VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(sessionId,1,revision,playerHash,'Legacy faster score',0,900,900,300,300,300,now);
  assert.equal((await(await fetch(base+'/api/verified/leaderboard')).json()).results.length,0);
  // Omitting the recording fails closed. Retrying with the matching artifact succeeds.
  const signed=await import('../verification/protocol.mjs').then(async({verify})=>sign({...await verify(await receipt(2),secret),replayHash:await hash(payload)},secret));
  assert.equal((await post('/api/verified/laps',{receipt:signed})).status,403);
  assert.equal((await post('/api/verified/laps',{receipt:signed,replay:payload})).status,200);
  assert.equal(board.db.prepare('SELECT pinned FROM verified_replays WHERE lap=2').get().pinned,1);
  const top=await(await fetch(base+'/api/verified/leaderboard')).json();assert.deepEqual(top.results.map(r=>r.lap),[2],'Faster legacy scores without a public replay never occupy TOP 10 slots');
  assert(top.results.every(r=>r.replay_available===1));
  for(const row of top.results)assert.equal((await fetch(base+'/api/verified/replays/'+row.session_id+'/'+row.lap)).status,200);
  // Seed eleven additional records as if produced by the trusted server, to exercise retention independently of rate limits.
  for(let lap=3;lap<=13;lap++){
   board.db.prepare('INSERT INTO verified_laps VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(sessionId,lap,revision,playerHash,'Test',0,12000+lap,12000+lap,4000,4000,4000+lap,now);
   board.db.prepare('INSERT INTO verified_replays VALUES (?,?,?,?,?,?,?)').run(sessionId,lap,payload,await hash(payload),now+86400000,0,'unreviewed');
  }
  assert.equal((await post('/api/verified/laps',{receipt:signed,replay:payload})).status,200);
  const fullTop=await(await fetch(base+'/api/verified/leaderboard')).json();assert.equal(fullTop.results.length,10);assert(fullTop.results.every(r=>r.replay_available===1));
  for(const r of fullTop.results)assert.equal((await fetch(base+'/api/verified/replays/'+r.session_id+'/'+r.lap)).status,200,'Every TOP 10 entry has a publicly retrievable recording');
  const publicURL=lap=>base+'/api/verified/replays/'+sessionId+'/'+lap;
  assert.equal((await fetch(publicURL(13))).status,404,'Non-public recordings require administrator access');
  const privatePath='/api/verified/admin/replays/'+sessionId+'/13';
  assert.equal((await fetch(base+privatePath)).status,401);
  assert.equal((await fetch(base+privatePath,{headers:{Authorization:'Bearer '+adminToken}})).status,200);
  assert.equal((await post(privatePath,{review:'flagged'},'bad')).status,401);
  assert.equal((await post(privatePath,{review:'flagged'},adminToken)).status,200);
  assert.equal((await post(privatePath,{review:'invented'},adminToken)).status,400);
  const flagged=await(await fetch(base+'/api/verified/admin/replays?flagged=1',{headers:{Authorization:'Bearer '+adminToken}})).json();
  assert.deepEqual(flagged.results.map(r=>r.lap),[13]);
  // Expired private entries disappear from reads immediately, even before daily physical cleanup.
  board.db.prepare('UPDATE verified_replays SET expires_ms=?').run(now-1);
  assert.equal((await fetch(base+'/api/verified/admin/replays/'+sessionId+'/12',{headers:{Authorization:'Bearer '+adminToken}})).status,404);
  assert.equal((await fetch(base+privatePath,{headers:{Authorization:'Bearer '+adminToken}})).status,200,'Review flag retains an expired recording');
  const binding={prepare:sql=>({bind:value=>({run:async()=>board.db.prepare(sql).run(value)})})};
  await worker.scheduled({}, {DB:binding});
  assert.deepEqual(board.db.prepare('SELECT lap FROM verified_replays ORDER BY lap').all().map(r=>r.lap),[2,3,4,5,6,7,8,9,10,11,13],'Cleanup preserves pinned and flagged recordings');
  assert.equal((await fetch(publicURL(2))).status,200,'Top-ten archive remains public after expiry');
  // Removing the flag permits cleanup; it never changes the leaderboard result.
  assert.equal((await post(privatePath,{review:'reviewed'},adminToken)).status,200);
  await worker.scheduled({}, {DB:binding});
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_laps').get().n,13);
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_replays').get().n,10);
  console.log('PASS: mandatory signed artifacts, excluded legacy scores, private/public access, review authorization, expiry, sticky top-ten retention, flagged retention, scheduled cleanup');
 }finally{await new Promise(r=>board.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
