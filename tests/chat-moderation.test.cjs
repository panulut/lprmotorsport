// End-to-end chat moderation: real verified Worker (local SQLite D1) and verification server.
const assert=require('node:assert/strict');
const {revision}=require('../verification/world.cjs');
const secret='chat-moderation-test-secret-'.repeat(2),adminToken='m'.repeat(40);
(async()=>{
 const board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision,passwordIterations:10000,adminToken});
 await new Promise(resolve=>board.listen(0,'127.0.0.1',resolve));
 const boardURL=`http://127.0.0.1:${board.address().port}`;
 const server=await require('../verification/server.cjs').createServer({secret,origins:['https://game.test'],chatStorageURL:boardURL+'/api/verified/chat-storage'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const chatURL=`http://127.0.0.1:${server.address().port}/api/chat`;
 const json=async response=>({status:response.status,body:await response.json()});
 const call=(path,{token,body,method=body?'POST':'GET'}={})=>fetch(boardURL+path,{method,
  headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}).then(json);
 const adminCall=(query='',method='GET',token=adminToken)=>call('/api/verified/admin/chat'+query,{token,method});
 const ticket=async login=>(await call('/api/verified/chat-ticket',{token:login.token,body:{}}));
 const say=(chatTicket,text)=>fetch(chatURL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+chatTicket},body:JSON.stringify({text})}).then(json);
 const room=async()=>(await json(await fetch(chatURL))).body.messages.map(m=>m.text);
 try{
  const troll=(await call('/api/verified/account',{body:{nickname:'Trolli',password:'salasana1',create:true}})).body;
  const friend=(await call('/api/verified/account',{body:{nickname:'Kaveri',password:'salasana2',create:true}})).body;
  const guest=(await call('/api/verified/guest',{body:{nickname:'Vieras',series:'human'}})).body;
  assert(troll.token&&friend.token&&guest.token,'Test identities exist');

  assert.equal((await call('/api/verified/guest-chat-ticket',{body:{nickname:'Anonyymi'}})).status,410,
   'Anonymous chat tickets are gone: every writer has a stable identity that can be blocked');

  const trollTicket=(await ticket(troll)).body.ticket,friendTicket=(await ticket(friend)).body.ticket,guestTicket=(await ticket(guest)).body.ticket;
  for(const [chatTicket,text] of [[trollTicket,'Asiaton 1'],[friendTicket,'Hei kaikki'],[trollTicket,'Asiaton 2'],[guestTicket,'Vieras täällä']])
   assert.equal((await say(chatTicket,text)).status,201);
  // Messages posted within one millisecond are ordered by random id, so compare contents.
  assert.deepEqual((await room()).sort(),['Asiaton 1','Asiaton 2','Hei kaikki','Vieras täällä']);

  assert.equal((await adminCall('','GET','x'.repeat(40))).status,401,'Moderation requires the admin key');
  assert.equal((await adminCall()).status,200);
  const listed=(await adminCall()).body;
  assert.equal(listed.guestsOpen,true);
  const first=listed.messages.find(m=>m.text==='Asiaton 1');
  assert.match(first.player_hash,/^[a-f0-9]{64}$/,'Admins see the stored author');
  assert(!JSON.stringify((await json(await fetch(chatURL))).body).includes(first.player_hash),'The public room never exposes authors');

  // Deleting one message removes it from the public room.
  const greeting=listed.messages.find(m=>m.text==='Hei kaikki');
  assert.equal((await adminCall('?delete='+greeting.id,'POST')).status,200);
  assert(!(await room()).includes('Hei kaikki'),'A deleted message disappears from the room');

  // Blocking an author removes all their messages and stops both new and already issued tickets.
  assert.equal((await adminCall('?block='+first.id,'POST')).status,200);
  assert.deepEqual(await room(),['Vieras täällä'],'All messages of a blocked author are removed');
  const refused=await ticket(troll);
  assert.equal(refused.status,403);assert.equal(refused.body.code,'chat_blocked');
  const late=await say(trollTicket,'Vanhalla luvalla');
  assert.equal(late.status,403,'A ticket issued before the block cannot post');assert.equal(late.body.code,'chat_blocked');
  assert(!(await room()).includes('Vanhalla luvalla'),'A refused message is not shown');
  const blocks=(await adminCall()).body.blocks;
  assert.deepEqual(blocks.map(b=>b.nickname),['Trolli']);
  assert.equal((await say(friendTicket,'Muut voivat jatkaa')).status,201,'Other players are unaffected');

  assert.equal((await adminCall('?unblock='+blocks[0].player_hash,'POST')).status,200);
  assert.equal((await ticket(troll)).status,200,'Unblocking restores chat');

  // Closing guest chat stops guests immediately but keeps registered players chatting.
  assert.equal((await adminCall('?guests=off','POST')).body.guestsOpen,false);
  const closedTicket=await ticket(guest);
  assert.equal(closedTicket.status,403);assert.equal(closedTicket.body.code,'chat_guests_closed');
  const closedPost=await say(guestTicket,'Vieras taas');
  assert.equal(closedPost.status,403);assert.equal(closedPost.body.code,'chat_guests_closed');
  assert.equal((await say(friendTicket,'Tilit toimivat')).status,201);
  assert.equal((await adminCall('?guests=on','POST')).body.guestsOpen,true);
  assert.equal((await say(guestTicket,'Vieras palasi')).status,201);

  for(const query of ['?delete=bad','?block=bad','?unblock=bad','?other=1'])assert.equal((await adminCall(query,'POST')).status,400);
  console.log('PASS: chat moderation deletes messages, blocks authors and old tickets, closes guest chat, hides authors and removes anonymous tickets');
 }finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  board.closeAllConnections();await new Promise(resolve=>board.close(resolve));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
