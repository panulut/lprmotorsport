const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {revision}=require('../verification/world.cjs');

const secret='azure-test-only-signing-secret-not-for-production';
const productionSecret='production-signing-secret-never-used-by-azure-test';
const metricsToken='azure-test-only-metrics-token-not-for-production';
const envKeys=['VERIFICATION_ENVIRONMENT','VERIFICATION_PUBLIC','PORT','MAX_VERIFIED_SESSIONS','GAME_ORIGINS'];
const previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
Object.assign(process.env,{VERIFICATION_ENVIRONMENT:'azure-test',VERIFICATION_PUBLIC:'1',PORT:'8081',MAX_VERIFIED_SESSIONS:'2'});

(async()=>{
 const {sign,verify,protocol}=await import('../verification/protocol.mjs');
 const {createServer}=require('../verification/server.cjs');
 await assert.rejects(createServer({secret,metricsToken,chatStorageURL:'https://lpr-verified.panu-musakka.workers.dev/api/verified/chat-storage'}),/forbids external/);
 process.env.GAME_ORIGINS='https://panulut.github.io';
 await assert.rejects(createServer({secret,metricsToken}),/forbids production/);
 delete process.env.GAME_ORIGINS;
 const server=await createServer({secret,metricsToken,capacityReportURL:null,chatStorageURL:null});
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const health=await fetch(base+'/health').then(response=>response.json());
  assert.equal(health.ready,true);
  assert.equal(health.maxSessions,2);
  const unauthorized=await fetch(base+'/metrics');
  assert.equal(unauthorized.status,401);
  const metrics=await fetch(base+'/metrics',{headers:{Authorization:'Bearer '+metricsToken}}).then(response=>response.json());
  assert.equal(metrics.activeSessions,0);
  assert.equal(typeof metrics.activeConnections,'number');

  const playerHash=randomBytes(32).toString('hex');
  const startTicket=async signingSecret=>sign({kind:'start',protocol,revision,playerHash,nickname:'Azure test',nonce:randomBytes(32).toString('hex'),
   issuedAt:Date.now(),expiresAt:Date.now()+60000},signingSecret);
  const productionTicket=await startTicket(productionSecret);
  const rejected=await fetch(base+'/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket:productionTicket,revision})});
  assert.equal(rejected.status,401,'Production-signed login tickets cannot start sessions on the Azure test service');

  const testTicket=await startTicket(secret);
  const accepted=await fetch(base+'/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket:testTicket,revision,armed:true})});
  assert.equal(accepted.status,201);
  const session=await accepted.json();
  assert.equal(server.sessions.activeCount,1);
  await assert.rejects(verify(testTicket,productionSecret),'Azure test tickets do not validate with the production signing key');
  const testReceipt=await sign({kind:'lap',sessionId:session.id,playerHash},secret);
  await assert.rejects(verify(testReceipt,productionSecret),'Azure test results do not validate with the production signing key');
  console.log('Azure verification isolation, health, metrics authorization, and test-only signing passed');
 }finally{
  await server.sessions.close();
  await new Promise(resolve=>server.close(resolve));
  for(const key of envKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 }
})().catch(error=>{
 for(const key of envKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 console.error(error);
 process.exitCode=1;
});
