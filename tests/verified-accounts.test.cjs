const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {revision}=require('../verification/world.cjs');
// Nickname ownership against the real verified Worker and SQL on local SQLite.
(async()=>{
 const secret='test-only-secret-'.repeat(4),{sign,verify,hash}=await import('../verification/protocol.mjs');
 const board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision});
 await new Promise(r=>board.listen(0,'127.0.0.1',r));
 board.db.exec('DROP TABLE verified_login_sessions'); // Existing deployments have accounts but no session table yet.
 const base=`http://127.0.0.1:${board.address().port}`;
 const post=(path,data,credential,ip='1.1.1.1')=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':ip,...(credential?{Authorization:'Bearer '+credential}:{})},body:JSON.stringify(data)});
 const account=(nickname,password,create,ip)=>post('/api/verified/account',{nickname,password,create},undefined,ip);
 const replay=require('node:zlib').gzipSync(JSON.stringify({format:'account-test'})).toString('base64');
 const receipt=async(playerHash,nickname,sessionId,lapTicks)=>sign({kind:'lap',protocol:'driving-v1',revision,playerHash,nickname,sessionId,lap:1,
  startTick:0,endTick:lapTicks,lapTicks,sectorTicks:[lapTicks-2000,1000,1000],issuedAt:Date.now(),replayHash:await hash(replay)},secret);
 try{
  assert.equal((await account('Panu','salasana',false)).status,404,'Unknown nicknames are never claimed implicitly');
  assert.equal((await account('Panu','1234567',true)).status,400,'Passwords need at least eight characters');
  assert.equal((await account(' Panu','salasana',true)).status,400,'Leading spaces cannot create look-alike names');
  assert.equal((await account('Pa  nu','salasana',true)).status,400,'Double spaces cannot create look-alike names');
  const created=await account('Panu','salasana',true);assert.equal(created.status,201);
  const panu=await created.json();assert.equal(panu.nickname,'Panu');assert.equal(panu.created,true);assert.match(panu.token,/^[a-f0-9]{64}$/);
  const stored=board.db.prepare('SELECT * FROM verified_accounts').get();
  assert.notEqual(stored.password_hash,'salasana');assert(!JSON.stringify(stored).includes('salasana'),'Only a PBKDF2 hash of the password is stored');
  assert.equal(stored.iterations,100000);assert.notEqual(stored.player_hash,await hash(panu.token),'Account identity is independent of login sessions');
  assert.equal(board.db.prepare('SELECT token_hash FROM verified_login_sessions').get().token_hash,await hash(panu.token),'Only a hash of the session token is stored');
  assert(panu.expiresAt>Date.now()&&panu.expiresAt<=Date.now()+7*86400000,'Sessions have an absolute seven-day lifetime');
  assert.equal((await account('PANU','toinen12',true)).status,409,'Nicknames are unique regardless of case');
  assert.equal((await account('panu','väärä123',false)).status,401,'A wrong password is rejected');
  const again=await(await account('pAnU','salasana',false)).json();
  assert.notEqual(again.token,panu.token,'Each device has its own random login session');assert.equal(again.nickname,'Panu');
  const eve=await(await account('Eve','salasana',true)).json();assert.notEqual(eve.token,panu.token,'Same password, different account credential');
  const start=await post('/api/verified/start',{nickname:'Eve',revision},panu.token);assert.equal(start.status,200);
  const started=await start.json();assert.equal(started.nickname,'Panu','The start ticket always carries the account nickname, not the requested one');
  const outsider='c'.repeat(64);
  assert.equal((await post('/api/verified/start',{nickname:'Panu',revision},outsider)).status,401,'A browser without the account cannot drive as Panu');
  const chatGrant=await post('/api/verified/chat-ticket',{nickname:'Eve'},panu.token);assert.equal(chatGrant.status,200);
  const chatTicket=await verify((await chatGrant.json()).ticket,secret);
  assert.equal(chatTicket.kind,'chat');assert.equal(chatTicket.nickname,'Panu','The chat ticket always carries the account nickname');
  assert.equal(chatTicket.playerHash,stored.player_hash);assert(chatTicket.expiresAt-chatTicket.issuedAt<=10*60000,'Chat tickets are short-lived');
  const guestGrant=await post('/api/verified/guest-chat-ticket',{nickname:'Vierailija'});
  assert.equal(guestGrant.status,200);
  const guestTicket=await verify((await guestGrant.json()).ticket,secret);
  assert.equal(guestTicket.kind,'guest-chat');assert.equal(guestTicket.nickname,'Vierailija');
  assert.notEqual(guestTicket.playerHash,stored.player_hash,'Guest chat identity is separate from registered accounts');
  assert(guestTicket.expiresAt-guestTicket.issuedAt<=10*60000,'Guest chat tickets are short-lived');
  assert.equal((await post('/api/verified/guest-chat-ticket',{nickname:'Eve'})).status,409,'Guests cannot claim a registered nickname');
  assert.equal((await post('/api/verified/guest-chat-ticket',{nickname:'eVe'})).status,409,'Registered nicknames remain reserved regardless of case');
  assert.equal((await post('/api/verified/guest-chat-ticket',{nickname:' <script>'})).status,400,'Guest tickets require a valid nickname');
  assert.equal((await post('/api/verified/chat-ticket',{},outsider)).status,401,'A browser without the account cannot chat as Panu');
  const forged=await receipt(await hash(outsider),'Panu','1'.repeat(32),7000);
  assert.equal((await post('/api/verified/laps',{receipt:forged,replay},outsider)).status,401,'Laps without an account are not stored');
  // A lap from before accounts existed stays in the table but is not listed.
  board.db.prepare(`INSERT INTO verified_laps (session_id,lap,revision,player_hash,nickname,start_tick,end_tick,lap_ticks,sector1,sector2,sector3,issued_ms)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run('2'.repeat(32),1,revision,await hash('d'.repeat(64)),'Panu',0,6500,6500,4500,1000,1000,1);
  const saved=await post('/api/verified/laps',{replay,receipt:await receipt(stored.player_hash,'Panu','3'.repeat(32),8000)},panu.token);
  assert.equal(saved.status,200);assert.equal((await saved.json()).saved,true);
  const list=await(await fetch(base+'/api/verified/leaderboard')).json();
  assert.deepEqual(list.results.map(row=>[row.nickname,row.lap_ticks]),[['Panu',8000]],'Only account laps appear; the pre-account lap is hidden');
  const timingResponse=await fetch(base+'/api/verified/timing-panel?series=human',{headers:{Authorization:'Bearer '+panu.token}});
  assert.equal(timingResponse.status,200);
  const timingPanel=await timingResponse.json();
  assert.deepEqual(timingPanel.personalBest.replay,{sessionId:'3'.repeat(32),lap:1},'An authenticated timing panel returns only the owner PB replay pointer');
  assert.deepEqual(timingPanel.personalBest.sectors,[6000*1000/120,1000*1000/120,1000*1000/120]);
  assert.equal((await fetch(base+'/api/verified/timing-panel?series=human')).status,401,'Replay pointers require the authenticated owner');
  // Revoke between authentication and the lap INSERT, using real SQLite and the production Worker.
  const {default:worker}=await import('../cloudflare/verified-worker.mjs');
  const raceToken=(await(await account('Panu','salasana',false,'2.2.2.2')).json()).token;
  const raceBinding={async batch(statements){board.db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());board.db.exec('COMMIT');return results;}catch(error){board.db.exec('ROLLBACK');throw error;}},prepare(sql){let values=[];return {bind(...args){values=args;return this;},
   async first(){return board.db.prepare(sql).get(...values)||null;},
   async run(){if(sql.startsWith('INSERT OR IGNORE INTO verified_laps'))board.db.prepare('DELETE FROM verified_login_sessions WHERE token_hash=?').run(await hash(raceToken));
    return {meta:{changes:Number(board.db.prepare(sql).run(...values).changes)}};}
  };}};
  const racingReceipt=await receipt(stored.player_hash,'Panu','7'.repeat(32),8000);
  const racing=await worker.fetch(new Request(base+'/api/verified/laps',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+raceToken},body:JSON.stringify({receipt:racingReceipt,replay})}),
   {DB:raceBinding,SIMULATION_REVISION:revision,VERIFICATION_SECRET:secret});
  assert.equal(racing.status,401,'Revocation during an in-flight upload prevents the database write');
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_laps WHERE session_id=?').get('7'.repeat(32)).n,0);
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM championship_laps WHERE session_id=?').get('7'.repeat(32)).n,0,'Revocation also blocks competition writes');
  const logout=()=>post('/api/verified/logout',{},panu.token);
  assert(board.db.prepare('SELECT 1 FROM verified_login_sessions WHERE token_hash=?').get(await hash(panu.token)));
  assert.equal((await logout()).status,200);
  assert.equal(board.db.prepare('SELECT 1 FROM verified_login_sessions WHERE token_hash=?').get(await hash(panu.token)),undefined,'Logout deletes a live session on the server');
  assert.equal((await logout()).status,200,'Logout retries are idempotent');
  assert.equal((await post('/api/verified/start',{revision},panu.token)).status,401,'A stolen copy cannot start after logout');
  assert.equal((await post('/api/verified/chat-ticket',{},panu.token)).status,401,'A stolen copy cannot get chat tickets after logout');
  assert.equal((await post('/api/verified/laps',{replay,receipt:await receipt(stored.player_hash,'Panu','5'.repeat(32),8000)},panu.token)).status,401,'Even a signed lap cannot be submitted with a revoked token');
  assert.equal((await post('/api/verified/start',{revision},again.token)).status,200,'Logging out one device preserves another device');
  board.db.prepare('UPDATE verified_login_sessions SET expires_ms=? WHERE token_hash=?').run(Date.now(),await hash(again.token));
  assert.equal((await post('/api/verified/start',{revision},again.token)).status,401,'Expired sessions cannot start');
  assert.equal((await post('/api/verified/laps',{replay,receipt:await receipt(stored.player_hash,'Panu','6'.repeat(32),8000)},again.token)).status,401,'Expired sessions cannot submit');
  const renewed=await(await account('Panu','salasana',false)).json();
  assert.notEqual(renewed.token,panu.token);assert.notEqual(renewed.token,again.token);
  assert.equal((await post('/api/verified/start',{revision},renewed.token)).status,200,'Password sign-in recovers access after expiry');
  assert.equal((await(await fetch(base+'/api/verified/leaderboard')).json()).results.length,1,'Logout and expiry preserve prior lap times');
  const legacy='a'.repeat(64);
  board.db.prepare('UPDATE verified_accounts SET player_hash=? WHERE name_key=?').run(await hash(legacy),'panu');
  assert.equal((await post('/api/verified/start',{revision},legacy)).status,401,'Legacy permanent credentials never bypass session validation');
  assert.equal((await post('/api/verified/start',{revision},renewed.token)).status,401,'A session cannot authenticate a missing account identity');
  for(let i=0;i<5;i++)assert.equal((await account('Eve','arvaus00'+i,false,'10.0.0.1')).status,401);
  assert.equal((await account('Eve','salasana',false,'10.0.0.1')).status,429,'One address gets five password guesses per nickname');
  assert.equal((await account('Eve','salasana',false,'10.0.0.2')).status,200,'Guessing from one address cannot lock the owner out');
  for(let i=0;i<5;i++)assert.equal((await account('Panu','salasana',false,'10.0.1.1')).status,200,'Successful sign-ins are not throttled per nickname');
  for(let address=3;address<8;address++)for(let i=0;i<5;i++)await account('Eve','arvaus00'+i,false,'10.0.0.'+address);
  assert.equal((await account('Eve','salasana',false,'10.0.2.1')).status,429,'Thirty failed guesses lock the nickname for a while');
  for(let i=0;i<20;i++)await account('Ip'+i,'salasana',false,'9.9.9.9');
  assert.equal((await account('Ip-last','salasana',false,'9.9.9.9')).status,429,'One address cannot probe accounts without limit');
  assert.equal((await fetch(base+'/api/verified/account')).status,405);
 }finally{await new Promise(r=>board.close(r));}
 // A new signing secret or iteration count must not strand accounts or their laps.
 const file=path.join(os.tmpdir(),`lpr-accounts-${process.pid}.sqlite`);
 const open=async(options)=>{const server=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({revision,database:file,...options});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,url:`http://127.0.0.1:${server.address().port}`};};
 const shut=server=>new Promise(r=>{server.close(r);server.closeAllConnections();});
 const call=(url,path,data,credential)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},body:JSON.stringify(data)});
 let server,url;
 try{
  ({server,url}=await open({secret}));
  const old=await(await call(url,'/api/verified/account',{nickname:'Kiertäjä',password:'salasana',create:true})).json();
  assert.equal((await call(url,'/api/verified/laps',{replay,receipt:await receipt(server.db.prepare('SELECT player_hash FROM verified_accounts').get().player_hash,'Kiertäjä','4'.repeat(32),9000)},old.token)).status,200);
  await shut(server);
  ({server,url}=await open({secret:'rotated-secret-'.repeat(4),passwordIterations:20000}));
  assert.equal((await call(url,'/api/verified/start',{revision},old.token)).status,401,'A signing-secret change invalidates existing sessions');
  const fresh=await(await call(url,'/api/verified/account',{nickname:'kiertäjä',password:'salasana'})).json();
  assert.notEqual(fresh.token,old.token);
  assert.equal((await call(url,'/api/verified/start',{revision},fresh.token)).status,200,'Signing in again recovers the account after a secret change');
  assert.equal((await call(url,'/api/verified/start',{revision},old.token)).status,401,'Old sessions remain invalid after reauthentication');
  const list=await(await fetch(url+'/api/verified/leaderboard')).json();
  assert.deepEqual(list.results.map(row=>[row.nickname,row.lap_ticks]),[['Kiertäjä',9000]],'Earlier laps follow the account to its new credential');
  assert.equal(server.db.prepare('SELECT iterations FROM verified_accounts').get().iterations,20000,'A changed iteration count is applied at the next sign-in');
  assert.equal((await call(url,'/api/verified/account',{nickname:'Kiertäjä',password:'salasana'})).status,200,'The rehashed password still works');
  await shut(server);
  console.log('PASS: password accounts own nicknames (case-insensitive, confirmed claims), hashed passwords, independent expiring and revocable device sessions, account-bound starts and laps, hidden pre-account laps, guessing limits without owner lockout, secret rotation and iteration changes');
 }finally{if(server?.listening)await shut(server);try{fs.rmSync(file,{force:true});}catch{}}
})().catch(error=>{console.error(error);process.exitCode=1;});
