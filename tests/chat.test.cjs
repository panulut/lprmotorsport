const assert=require('node:assert/strict');
const {createChat}=require('../verification/chat.cjs');
const player='a'.repeat(64);
let time=0;
const chat=createChat({now:()=>time});
const ticket=(changes={})=>({kind:'chat',protocol:'driving-v1',playerHash:player,nickname:'Kuljettaja',issuedAt:time,expiresAt:time+600000,...changes});
const post=(text='Moi',identity=ticket())=>chat.post(identity,'local',{text});
assert.deepEqual(chat.list(),{messages:[]});
const visitorA='a'.repeat(36),visitorB='b'.repeat(36);
assert.deepEqual(chat.presence(visitorA),{onlineCount:1});
assert.deepEqual(chat.presence(visitorA),{onlineCount:1},'Multiple tabs in one browser count once');
assert.deepEqual(chat.presence(visitorB),{onlineCount:2});
time=30000;chat.presence(visitorA);
time=45000;assert.deepEqual(chat.presence(visitorA),{onlineCount:1},'Inactive visitors expire');
assert.throws(()=>chat.presence('invalid'),{status:400});
time=0;
for(const identity of [null,'a'.repeat(64),ticket({kind:'start'}),ticket({protocol:'other'}),ticket({playerHash:'bad'}),
 ticket({nickname:'<script>'}),ticket({expiresAt:time}),ticket({issuedAt:time+60000,expiresAt:time+120000}),ticket({expiresAt:time+3600000})])
 assert.throws(()=>post('Moi',identity),{status:401},'Only a valid, short-lived chat ticket can post');
assert.throws(()=>chat.post(undefined,'local',{nickname:'Kuljettaja',text:'Moi'}),{status:401});
for(const text of ['', ' '.repeat(10), 'x'.repeat(281),'a\nb','a\u202Eb'])assert.throws(()=>post(text),{status:400});
assert.equal(chat.post(ticket(),'local',{nickname:'Admin',text:'Hei'}).message.nickname,'Kuljettaja','The request body cannot choose the nickname');
post('<img src=x onerror=alert(1)>');
assert.equal(chat.list().messages[1].text,'<img src=x onerror=alert(1)>','Messages are plain data, rendered as text by the client');
assert(!JSON.stringify(chat.list()).includes(player));
assert(!('owner' in chat.list().messages[0]));
for(let i=2;i<6;i++)post();
assert.throws(()=>post(),{status:429});
time+=60000;post('Again');
for(let i=0;i<110;i++){time+=60000;post('message '+i);}
assert.equal(chat.list().messages.length,100);
time+=86400000;assert.equal(chat.list().messages.length,0);
const shared=createChat();
const fresh=n=>({kind:'chat',protocol:'driving-v1',playerHash:n.toString(16).padStart(64,'0'),nickname:'Player',issuedAt:Date.now(),expiresAt:Date.now()+600000});
for(let i=0;i<30;i++)shared.post(fresh(i),'shared',{text:'Hi'});
assert.throws(()=>shared.post(fresh(99),'shared',{text:'Hi'}),{status:429},'IP limit also applies across accounts');
(async()=>{
 const secret='test-secret-'.repeat(4),{sign}=await import('../verification/protocol.mjs');
 const server=await require('../verification/server.cjs').createServer({secret,origins:['https://game.test']});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/api/chat`;
 const signed=(changes={},key=secret)=>sign({kind:'chat',protocol:'driving-v1',playerHash:player,nickname:'Pelaaja',issuedAt:Date.now(),expiresAt:Date.now()+600000,...changes},key);
 const valid=await signed();
 const send=(data,credential=valid,origin='https://game.test')=>fetch(url,{method:'POST',headers:{...(origin?{Origin:origin}:{}),'Content-Type':'application/json',Authorization:'Bearer '+credential},body:JSON.stringify(data)});
 try{
  const response=await send({nickname:'Panu',text:'Terve varikko!'});
  assert.equal(response.status,201);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://game.test');
  assert.equal((await response.json()).message.nickname,'Pelaaja','The server uses the signed nickname, not the requested one');
  const other=await fetch(url);const data=await other.json();
  const presenceURL=url+'/presence?visitor=';
  assert.deepEqual(await (await fetch(presenceURL+visitorA)).json(),{onlineCount:1});
  assert.deepEqual(await (await fetch(presenceURL+visitorB)).json(),{onlineCount:2});
  assert.equal((await fetch(presenceURL+'invalid')).status,400);
  assert.equal(data.messages.length,1);assert.equal(data.messages[0].text,'Terve varikko!','Another client sees shared messages');
  assert.equal((await send({text:'No'},valid,'https://evil.test')).status,403);
  assert.equal((await send({text:'No'},'bad')).status,401);
  assert.equal((await send({nickname:'Panu',text:'No'},'b'.repeat(64),null)).status,401,'A random token without an Origin header cannot post');
  assert.equal((await send({text:'No'},await signed({nickname:'Panu'},'attacker-secret-'.repeat(4)),null)).status,401,'Forged tickets are rejected');
  assert.equal((await send({text:'No'},await signed({kind:'start'}))).status,401,'Driving start tickets cannot post');
  const guestTicket=await signed({kind:'guest-chat',playerHash:'c'.repeat(64),nickname:'Vierailija'});
  const guestResponse=await send({text:'Hei!'},guestTicket);
  assert.equal(guestResponse.status,201);
  assert.equal((await guestResponse.json()).message.nickname,'Vierailija (vierailija)');
  assert.equal((await send({text:'No'},await signed({issuedAt:Date.now()-700000,expiresAt:Date.now()-100000}))).status,401,'Expired tickets are rejected');
  assert.equal((await send({text:'x'.repeat(3000)})).status,413);
  assert.equal((await fetch(url,{method:'DELETE'})).status,405);
  assert.equal((await fetch(url,{method:'OPTIONS',headers:{Origin:'https://game.test'}})).status,204);
  for(let i=1;i<6;i++)assert.equal((await send({text:'Moi'})).status,201);
  assert.equal((await send({text:'Liikaa'},await signed())).status,429,'A new ticket for the same account shares its rate limit');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 const leaderboard=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({
  secret,revision:require('../verification/world.cjs').revision
 });
 await new Promise(resolve=>leaderboard.listen(0,'127.0.0.1',resolve));
 const storageURL=`http://127.0.0.1:${leaderboard.address().port}/api/verified/chat-storage`;
 let persistentServer;
 const startPersistentServer=async()=>require('../verification/server.cjs').createServer({
  secret,origins:['https://game.test'],chatStorageURL:storageURL
 });
 try{
  persistentServer=await startPersistentServer();await new Promise(resolve=>persistentServer.listen(0,'127.0.0.1',resolve));
  const persistentURL=`http://127.0.0.1:${persistentServer.address().port}/api/chat`;
  const saved=await fetch(persistentURL,{method:'POST',headers:{Origin:'https://game.test','Content-Type':'application/json',Authorization:'Bearer '+await signed()},
   body:JSON.stringify({text:'Säilyy uudelleenkäynnistyksessä'})});
  assert.equal(saved.status,201);
  persistentServer.closeAllConnections();await new Promise(resolve=>persistentServer.close(resolve));
  persistentServer=await startPersistentServer();await new Promise(resolve=>persistentServer.listen(0,'127.0.0.1',resolve));
  const restored=await(await fetch(`http://127.0.0.1:${persistentServer.address().port}/api/chat`)).json();
  assert.equal(restored.messages.length,1);
  assert.equal(restored.messages[0].text,'Säilyy uudelleenkäynnistyksessä','Cloudflare D1 restores chat history after a server restart');
  leaderboard.db.prepare('UPDATE verified_chat_messages SET at=?').run(Date.now()-86400001);
  assert.equal((await(await fetch(`http://127.0.0.1:${persistentServer.address().port}/api/chat`)).json()).messages.length,1,
   'Reads within the cache window share one upstream request');
  const after=await fetch(`http://127.0.0.1:${persistentServer.address().port}/api/chat`,{method:'POST',headers:{Origin:'https://game.test','Content-Type':'application/json',Authorization:'Bearer '+await signed({playerHash:'e'.repeat(64)})},
   body:JSON.stringify({text:'Uusi viesti'})});
  assert.equal(after.status,201);
  assert.deepEqual((await(await fetch(`http://127.0.0.1:${persistentServer.address().port}/api/chat`)).json()).messages.map(m=>m.text),['Uusi viesti'],
   'A post clears the read cache, and persisted messages expire after 24 hours');
 }finally{
  if(persistentServer){persistentServer.closeAllConnections();await new Promise(resolve=>persistentServer.close(resolve));}
  leaderboard.closeAllConnections();await new Promise(resolve=>leaderboard.close(resolve));
 }
 // Behind Azure ingress the socket is the proxy; the rightmost X-Forwarded-For entry is the client.
 const {addressKey}=await import('../verification/protocol.mjs');
 assert.equal(addressKey('203.0.113.7'),'203.0.113.7');
 assert.equal(addressKey('::ffff:203.0.113.7'),'203.0.113.7','IPv4-mapped addresses count as IPv4');
 assert.equal(addressKey('2001:db8:1:2::1'),addressKey('2001:db8:1:2:ffff:0:0:9'),'One IPv6 /64 shares one budget');
 assert.notEqual(addressKey('2001:db8:1:2::1'),addressKey('2001:db8:1:3::1'));
 const proxied=await require('../verification/server.cjs').createServer({secret,origins:['https://game.test'],trustForwardedFor:true});
 await new Promise(resolve=>proxied.listen(0,'127.0.0.1',resolve));
 try{
  const proxiedURL=`http://127.0.0.1:${proxied.address().port}/api/chat`;
  const from=async(forwarded,n)=>(await fetch(proxiedURL,{method:'POST',headers:{Origin:'https://game.test','Content-Type':'application/json','X-Forwarded-For':forwarded,
   Authorization:'Bearer '+await sign({kind:'chat',protocol:'driving-v1',playerHash:n.toString(16).padStart(64,'0'),nickname:'Pelaaja',issuedAt:Date.now(),expiresAt:Date.now()+600000},secret)},
   body:JSON.stringify({text:'Hei'})})).status;
  for(let i=0;i<30;i++)assert.equal(await from('203.0.113.7',i%6),201);
  assert.equal(await from('198.51.100.1, 203.0.113.7',7),429,'A forged leftmost entry does not give a new budget');
  assert.equal(await from('203.0.113.8',8),201,'Different clients behind the same ingress have separate budgets');
 }finally{proxied.closeAllConnections();await new Promise(resolve=>proxied.close(resolve));}
 console.log('Chat: signed nickname ownership, shared messages, persistence, validation, rate limits and expiry OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
