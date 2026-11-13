const assert=require('node:assert/strict');
(async()=>{
 const {allowedName}=await import('../verification/name-policy.mjs');
 const {validName}=await import('../verification/protocol.mjs');
 const blocked=['Neekeri','NEEKERI','neekeri123','N.e.e.k.e.r.i','N e e k e r i','N_e-e.k_eri','N33keri','Neeeeekeri','Nëëkeri','Ｎｅｅｋｅｒｉ',
  'Nekru','Nigger','n1gga','NIGGA','Ryssä','ryssa','Hintti','Hitler','Hitler88','1488','Sieg Heil','Mutakuono','Rättipää','Vinosilmä','Faggot',
  'irekeeN','IREKEEN','i.r.e.k.e.e.N','ireke33N','urkeN','reggiN','assyR','reltiH','8841'];
 for(const name of blocked){
  assert(validName(name),`fixture must pass the character check: ${name}`);
  assert.equal(allowedName(name),false,`should be refused: ${name}`);
 }
 // Latin mixed with Cyrillic or Greek look-alikes (impersonation and filter evasion).
 for(const name of ['Pаnu','Nееkeri','Niggеr','Aino Иван'])assert.equal(allowedName(name),false,`mixed scripts: ${name}`);
 const allowed=['Panu','Aino Korhonen','Hintikka','Larysa','Montenegro','Fagerholm','Väinö','Иван','Νίκος','Torpedo','Tiger','Nikke','Neko','Sneaker',
  'Pekka_88','Kimi.R','Laila-3','Sini','Kekkonen','Nakkila','Nigella','Nella',
  'Regina','Reginald','Tagin','Regen','Rekku','Ruken','Asser','Higgins','Biggins'];
 for(const name of allowed)assert.equal(allowedName(name),true,`should be accepted: ${name}`);
 assert.equal(allowedName(undefined),false);
 console.log('PASS: nickname policy refuses slurs and evasions, keeps ordinary names');

 // Both pasteable Workers carry the current policy (npm run build:worker / build:verified-worker).
 const fs=require('node:fs'),path=require('node:path');
 const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/\r\n/g,'\n');
 const policy=read('verification/name-policy.mjs').replace(/^export /gm,'').trim();
 assert(read('cloudflare/worker.mjs').includes(policy),'Run npm run build:worker: cloudflare/worker.mjs has a stale name policy');
 assert(read('cloudflare/verified-worker.bundle.mjs').includes(policy),'Run npm run build:verified-worker: the bundle has a stale name policy');

 // The verified Worker refuses new names but keeps existing accounts signing in.
 const secret='name-policy-secret-'.repeat(4);
 const board=await require('../verification/local-leaderboard.cjs').createLocalLeaderboard({secret,revision:'a'.repeat(64),passwordIterations:10000});
 await new Promise(resolve=>board.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+board.address().port;let ip=1;
  const post=(route,data)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'name-'+ip++},body:JSON.stringify(data)});
  for(const nickname of ['Neekeri','N33k.eri']){
   const guest=await post('/api/verified/guest',{nickname,series:'human'});
   assert.equal(guest.status,422);assert.equal((await guest.json()).code,'name_not_allowed');
   assert.equal((await post('/api/verified/account',{nickname,password:'long-password',create:true,series:'human'})).status,422);
  }
  assert.equal(board.db.prepare('SELECT COUNT(*) n FROM verified_guests').get().n+board.db.prepare('SELECT COUNT(*) n FROM verified_accounts').get().n,0);
  assert.equal((await post('/api/verified/guest',{nickname:'Hintikka',series:'human'})).status,201);
  assert.equal((await post('/api/verified/account',{nickname:'Panu',password:'long-password',create:true,series:'human'})).status,201);
  // An account created before the policy (here: renamed in the database) still signs in.
  board.db.prepare("UPDATE verified_accounts SET nickname='Neekeri',name_key='neekeri'").run();
  assert.equal((await post('/api/verified/account',{nickname:'Neekeri',password:'long-password'})).status,200);
  console.log('PASS: verified Worker refuses offensive guest and account names with 422');
 }finally{board.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
