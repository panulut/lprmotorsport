const assert=require('node:assert/strict');
const {createServer}=require('../experiment/server.cjs');
const {revision,hz}=require('../scripts/lib/replay-probe.cjs');
(async()=>{
 assert.throws(()=>createServer({publicMode:true,token:'short'}),/LAB_TOKEN/);
 const protectedServer=createServer({publicMode:true,token:'s'.repeat(40)});
 await new Promise(r=>protectedServer.listen(0,'127.0.0.1',r));
 try{const url=`http://127.0.0.1:${protectedServer.address().port}/verify`;
  assert.equal((await fetch(url,{method:'POST'})).status,401);
  assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+'s'.repeat(40),'Content-Type':'application/json'},body:'{}'})).status,422);
 }finally{await new Promise(r=>protectedServer.close(r));}
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await (await fetch(url+'/health')).json()).revision,revision);
  assert.equal((await fetch(url+'/')).status,200);
  assert.equal((await fetch(url+'/simulation.js')).status,200);
  assert.equal((await fetch(url+'/api/laps',{method:'POST'})).status,404);
  const replay={format:1,revision,hz,mode:'standing-start-no-people',inputs:[[0,0,0]]};
  const post=(body,headers={})=>fetch(url+'/verify',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post(replay,{Origin:'https://evil.example'})).status,403);
  assert.equal((await post({...replay,revision:'old'})).status,422);
  assert.equal((await post({...replay,inputs:[[2,0,0]]})).status,422);
  const partial=await post(replay);assert.equal(partial.status,422);assert.match((await partial.json()).error,/did not complete/);
  assert.equal((await fetch(url+'/verify',{method:'POST',body:'x'.repeat(2*1024*1024+1),headers:{'Content-Type':'application/json'}})).status,413);
  console.log('PASS: isolated service, revision, request validation, origin, size, incomplete lap, no leaderboard writes');
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
