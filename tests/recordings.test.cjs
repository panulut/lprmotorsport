const assert=require('node:assert/strict');
(async()=>{
 const secret='recording-test-secret-'.repeat(3),adminToken='recording-admin-secret-'.repeat(3),revision='a'.repeat(64);
 const {hash,sign}=await import('../verification/protocol.mjs');
 const {default:worker}=await import('../cloudflare/verified-worker.mjs');
 const board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision,adminToken});
 await new Promise(r=>board.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+board.address().port;
 const account=await(await fetch(base+'/api/verified/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'Test',password:'recording-password',create:true})})).json();
 const token=account.token,playerHash=board.db.prepare('SELECT player_hash FROM verified_accounts').get().player_hash,sessionId='c'.repeat(32),now=Date.now();
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
  const fullTop=await(await fetch(base+'/api/verified/leaderboard')).json();assert.equal(fullTop.results.length,1);assert(fullTop.results.every(r=>r.replay_available===1));
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
  // Retention is rank-based only: an old expiry timestamp no longer hides a retained recording.
  board.db.prepare('UPDATE verified_replays SET expires_ms=?').run(now-1);
  assert.equal((await fetch(base+'/api/verified/admin/replays/'+sessionId+'/12',{headers:{Authorization:'Bearer '+adminToken}})).status,200);
  // Fill past the limit: twenty-four recordings (laps 2–25), of which only the fastest twenty may remain.
  for(let lap=14;lap<=25;lap++){
   board.db.prepare('INSERT INTO verified_laps VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(sessionId,lap,revision,playerHash,'Test',0,12000+lap,12000+lap,4000,4000,4000+lap,now);
   board.db.prepare('INSERT INTO verified_replays VALUES (?,?,?,?,?,?,?)').run(sessionId,lap,payload,await hash(payload),now+86400000,0,'unreviewed');
  }
  board.db.prepare("UPDATE verified_replays SET review='flagged' WHERE lap=25").run();
  // Another revision's recording is invisible immediately and removed by cleanup.
  const oldRevision='b'.repeat(64),oldSession='d'.repeat(32);
  board.db.prepare('INSERT INTO verified_laps VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(oldSession,1,oldRevision,playerHash,'Test',0,700,700,200,200,300,now);
  board.db.prepare('INSERT INTO verified_replays VALUES (?,?,?,?,?,?,?)').run(oldSession,1,payload,await hash(payload),now+86400000,1,'unreviewed');
  assert.equal((await fetch(base+'/api/verified/replays/'+oldSession+'/1')).status,404,'Old-revision recordings are never public');
  assert.equal((await fetch(base+'/api/verified/admin/replays/'+oldSession+'/1',{headers:{Authorization:'Bearer '+adminToken}})).status,200,'Old evidence remains inspectable by administrators');
  const binding=board.binding;
  const laps=()=>board.db.prepare('SELECT lap FROM verified_replays ORDER BY session_id,lap').all().map(r=>r.lap);
  await worker.scheduled({}, {DB:binding});
  assert.equal(laps().length,25,'Cleanup without a configured revision deletes nothing');
  await worker.scheduled({}, {DB:binding,SIMULATION_REVISION:revision});
  assert.deepEqual(laps(),[...Array.from({length:20},(_,i)=>i+2),25,1],'The current revision\'s fastest twenty remain, plus the recording awaiting review');
  assert.equal((await fetch(publicURL(2))).status,200,'Top-ten recording stays public');
  assert.equal((await fetch(publicURL(13))).status,404,'Ranks eleven to twenty remain private');
  // A slower lap remains a result, but its replay is not retained outside the retained sets.
  const slow=await import('../verification/protocol.mjs').then(async({verify})=>sign({...await verify(await receipt(30),secret),replayHash:await hash(payload)},secret));
  assert.equal((await post('/api/verified/laps',{receipt:slow,replay:payload})).status,200);
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_laps WHERE lap=30').get().n,1);
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_replays WHERE lap=30').get().n,0);
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_replays').get().n,22);
  // A faster lap displaces the slowest retained recording within the same transaction.
  board.db.prepare('INSERT INTO verified_laps VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(sessionId,40,revision,playerHash,'Test',0,11000,11000,4000,4000,3000,now);
  board.db.prepare('INSERT INTO verified_replays VALUES (?,?,?,?,?,?,?)').run(sessionId,40,payload,await hash(payload),now,0,'unreviewed');
  assert.equal((await post('/api/verified/laps',{receipt:signed,replay:payload})).status,200);
  assert.deepEqual(laps(),[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,25,40,1]);
  assert.equal((await fetch(publicURL(40))).status,200,'A new top-ten recording becomes public');
  // Separate series: an account chosen as a bot at creation races only against bots.
  const signUp=async(nickname,series)=>(await fetch(base+'/api/verified/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname,password:'recording-password',create:true,...(series?{series}:{})})}));
  assert.equal((await signUp('Väärä','robot')).status,400);
  const botAccount=await(await signUp('Botti','bot')).json(),viewer=await(await signUp('Katsoja')).json();
  assert.equal(botAccount.series,'bot');assert.equal(viewer.series,'human');
  const hashOf=name=>board.db.prepare('SELECT player_hash FROM verified_accounts WHERE nickname=?').get(name).player_hash;
  const botHash=hashOf('Botti'),botSession='e'.repeat(32);
  const seedBot=async(lap,ticks)=>{
   board.db.prepare('INSERT INTO verified_laps VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(botSession,lap,revision,botHash,'Botti',0,ticks,ticks,3000,3000,ticks-6000,now);
   board.db.prepare('INSERT INTO verified_replays VALUES (?,?,?,?,?,?,?)').run(botSession,lap,payload,await hash(payload),now,0,'unreviewed');
  };
  for(let lap=1;lap<=22;lap++)await seedBot(lap,9000+lap);
  await worker.scheduled({}, {DB:binding,SIMULATION_REVISION:revision});
  const board_=async series=>(await(await fetch(base+'/api/verified/leaderboard'+(series?'?series='+series:''))).json());
  assert.deepEqual((await board_()).results.map(r=>r.lap),[40],'Faster bots never displace humans');
  const bots=await board_('bot');assert.equal(bots.series,'bot');assert.deepEqual(bots.results.map(r=>r.lap),[1]);
  assert(bots.results.every(r=>r.session_id===botSession));
  assert.equal((await fetch(base+'/api/verified/leaderboard?series=robot')).status,400);
  const count=session=>board.db.prepare('SELECT COUNT(*) n FROM verified_replays WHERE session_id=?').get(session).n;
  assert.equal(count(botSession),20,'Each series keeps its own twenty recordings');assert.equal(count(sessionId),21,'Twenty humans plus one awaiting review');
  // Viewer reports: signed-in, public recordings only, once per viewer, never one's own lap.
  const report=(data,credential)=>post('/api/verified/report',data,credential);
  const botLap=lap=>({sessionId:botSession,lap,reason:'bot',note:'  Täsmälleen samat ohjaukset joka kierroksella  '});
  assert.equal((await report(botLap(1),'0'.repeat(64))).status,401);
  assert.equal((await report({...botLap(1),reason:'cheat'},viewer.token)).status,400);
  assert.equal((await report({...botLap(1),note:'x'.repeat(201)},viewer.token)).status,400);
  assert.equal((await report(botLap(15),viewer.token)).status,404,'Private recordings cannot be reported');
  assert.equal((await report(botLap(1),botAccount.token)).status,403,'Own laps cannot be reported');
  assert.equal((await report(botLap(1),viewer.token)).status,200);
  assert.equal((await report(botLap(1),viewer.token)).status,409,'One report per viewer and recording');
  assert.equal(board.db.prepare('SELECT review FROM verified_replays WHERE session_id=? AND lap=1').get(botSession).review,'flagged');
  assert.equal((await board_('bot')).results[0].lap,1,'A report never removes the result');
  const queue=await(await fetch(base+'/api/verified/admin/replays?flagged=1',{headers:{Authorization:'Bearer '+adminToken}})).json();
  const queued=queue.results.find(r=>r.session_id===botSession&&r.lap===1);assert.equal(queued.reports,1);assert.equal(queued.series,'bot');
  const reportsPath='/api/verified/admin/replays/'+botSession+'/1/reports';
  assert.equal((await fetch(base+reportsPath)).status,401);
  const details=await(await fetch(base+reportsPath,{headers:{Authorization:'Bearer '+adminToken}})).json();
  assert.deepEqual(details.results.map(({reason,note,reporter})=>({reason,note,reporter})),[{reason:'bot',note:'Täsmälleen samat ohjaukset joka kierroksella',reporter:'Katsoja'}]);
  // Reported recordings stay until reviewed, but leave the public set once outside the twenty fastest.
  for(let lap=30;lap<50;lap++)await seedBot(lap,8000+lap);
  await worker.scheduled({}, {DB:binding,SIMULATION_REVISION:revision});
  assert.equal(count(botSession),30,'Twenty fastest bots plus ten archived former public recordings');
  assert.equal((await fetch(base+'/api/verified/replays/'+botSession+'/1')).status,404);
  assert.equal((await fetch(base+'/api/verified/admin/replays/'+botSession+'/1',{headers:{Authorization:'Bearer '+adminToken}})).status,200);
  assert.equal((await post('/api/verified/admin/replays/'+botSession+'/1',{review:'reviewed'},adminToken)).status,200);
  await worker.scheduled({}, {DB:binding,SIMULATION_REVISION:revision});
  assert.equal(count(botSession),30,'Review cannot delete archived official evidence');
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_reports').get().n,1,'Reports on archived evidence remain investigable');
  // Daily report cap per viewer.
  for(let i=0;i<30;i++)board.db.prepare('INSERT INTO verified_reports VALUES (?,?,?,?,?,?)').run('f'.repeat(32),i+1,hashOf('Katsoja'),'other','',now);
  assert.equal((await report(botLap(30),viewer.token)).status,429);
  board.db.prepare('DELETE FROM verified_reports').run();
  // The operator moves a whole account between series; pins and retention follow immediately.
  const move=(data,credential=adminToken)=>post('/api/verified/admin/series',data,credential);
  assert.equal((await move({sessionId,lap:40,series:'bot'},'bad')).status,401);
  assert.equal((await move({sessionId,lap:40,series:'robot'})).status,400);
  assert.equal((await move({sessionId:'0'.repeat(32),lap:1,series:'bot'})).status,404);
  assert.equal((await move({sessionId,lap:40,series:'bot'})).status,200);
  assert.equal((await board_()).results.length,0,'The moved account leaves the human series');
  assert.deepEqual((await board_('bot')).results.map(r=>r.session_id),[botSession,sessionId]);
  assert.deepEqual(board.db.prepare('SELECT lap FROM verified_replays WHERE session_id=? ORDER BY lap').all(sessionId).map(r=>r.lap),[2,3,4,5,6,7,8,9,10,11,13,25,40],'Previously public and flagged recordings survive category moves');
  // Record exclusions must preserve lap history, daily points and restorable replays.
  const adminPath='/api/verified/admin/laps';
  const listing=async credential=>fetch(base+adminPath+'?series=bot',{headers:{Authorization:'Bearer '+credential}});
  assert.equal((await listing('bad')).status,401);
  const before=await(await listing(adminToken)).json();assert(before.results.length);
  const selected=before.results.find(r=>r.session_id===botSession);
  assert(selected);
  const lapCount=()=>board.db.prepare('SELECT COUNT(*) n FROM verified_laps').get().n;
  const dailyCount=()=>board.db.prepare('SELECT COUNT(*) n FROM championship_laps').get().n;
  const counts=[lapCount(),dailyCount()];
  const selectedPath=adminPath+'?sessionId='+selected.session_id+'&lap='+selected.lap;
  assert.equal((await post(selectedPath,{},adminToken)).status,200);
  assert(!(await board_('bot')).results.some(r=>r.session_id===selected.session_id&&r.lap===selected.lap));
  assert.deepEqual([lapCount(),dailyCount()],counts);
  assert(board.db.prepare('SELECT 1 FROM verified_replays WHERE session_id=? AND lap=?').get(selected.session_id,selected.lap));
  assert.equal((await post(selectedPath+'&restore=1',{},adminToken)).status,200);
  assert((await board_('bot')).results.some(r=>r.session_id===selected.session_id&&r.lap===selected.lap));
  assert.equal((await post(adminPath+'?reset=1',{},adminToken)).status,200);
  assert.equal((await board_('bot')).results.length,0);
  assert.deepEqual([lapCount(),dailyCount()],counts);
  assert(board.db.prepare('SELECT 1 FROM verified_replays WHERE session_id=? AND lap=?').get(selected.session_id,selected.lap));
  console.log('PASS: signed artifacts, access, retention, reports, series moves, authenticated exclusions/restoration/reset preserve lap history and replays');
 }finally{await new Promise(r=>board.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
