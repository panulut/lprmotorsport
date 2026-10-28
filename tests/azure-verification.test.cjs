const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {revision}=require('../verification/world.cjs');

const secret='azure-test-only-signing-secret-not-for-production';
const productionSecret='production-signing-secret-never-used-by-azure-test';
const metricsToken='azure-test-only-metrics-token-not-for-production';
const testOrigin='https://lpr-game-test.azurestaticapps.net';
const envKeys=['VERIFICATION_ENVIRONMENT','VERIFICATION_PUBLIC','PORT','MAX_VERIFIED_SESSIONS','MAX_VERIFIED_STARTS_PER_MINUTE',
 'GAME_ORIGINS','CAPACITY_REPORT_URL','CHAT_STORAGE_URL','VERIFICATION_LAP_LAG_MS','VERIFICATION_WORKERS','VERIFICATION_WORKER_HEAP_MB'];
const previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
for(const key of envKeys)delete process.env[key];
Object.assign(process.env,{VERIFICATION_ENVIRONMENT:'azure-test',VERIFICATION_PUBLIC:'1',PORT:'8081',MAX_VERIFIED_SESSIONS:'2',GAME_ORIGINS:testOrigin});

(async()=>{
 const {sign,verify,protocol}=await import('../verification/protocol.mjs');
 const {createServer}=require('../verification/server.cjs');
 const options={secret,metricsToken,capacityReportURL:null,chatStorageURL:null};
 for(const key of ['capacityReportURL','chatStorageURL'])
  await assert.rejects(createServer({...options,[key]:'https://lpr-verified.panu-musakka.workers.dev/api/verified/chat-storage'}),/forbids external/);
 for(const key of ['secret','metricsToken'])for(const value of [null,'','x'.repeat(31)])
  await assert.rejects(createServer({...options,[key]:value}),key==='secret'?/dedicated VERIFICATION_SECRET/:/VERIFICATION_METRICS_TOKEN/);
 for(const [key,values,pattern]of [
  ['VERIFICATION_PUBLIC',['','0'],/VERIFICATION_PUBLIC=1/],
  ['PORT',['','8080'],/PORT=8081/],
  ['MAX_VERIFIED_SESSIONS',['0','101','1.5','invalid'],/MAX_VERIFIED_SESSIONS/],
  ['MAX_VERIFIED_STARTS_PER_MINUTE',['0','257','1.5','invalid'],/MAX_VERIFIED_STARTS_PER_MINUTE/],
  ['GAME_ORIGINS',[''],/at least one test GAME_ORIGINS/],
  ['GAME_ORIGINS',['not a URL'],/valid origins/],
  ['GAME_ORIGINS',[
   'https://panulut.github.io','https://lpr-verified.panu-musakka.workers.dev','http://localhost:8000',
   'http://lpr-game-test.azurestaticapps.net','https://azurestaticapps.net',
   'https://lpr-game-test.azurestaticapps.net.attacker.example','https://attackerazurestaticapps.net',
   testOrigin+'/path',testOrigin+'/',testOrigin+'?query=1',testOrigin+'#fragment',
   'https://user:password@lpr-game-test.azurestaticapps.net',testOrigin+',https://panulut.github.io'
  ],/only HTTPS Azure test origins/]
 ]){
  const saved=process.env[key];
  try{for(const value of values){process.env[key]=value;await assert.rejects(createServer(options),pattern);}}
  finally{if(saved===undefined)delete process.env[key];else process.env[key]=saved;}
 }
 // Each supported Azure hosting suffix can start; use the same allowlist at runtime.
 for(const origin of ['https://lpr-game-test.azurewebsites.net','https://lpr-game-test.example.azurecontainerapps.io']){
  process.env.GAME_ORIGINS=origin;
  const candidate=await createServer({...options,origins:[origin]});
  await candidate.sessions.close();await candidate.capacityReporter.close();
 }
 process.env.GAME_ORIGINS=testOrigin;
 const server=await createServer({...options,origins:[testOrigin]});
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const health=await fetch(base+'/health').then(response=>response.json());
  assert.equal(health.ready,true);
  assert.equal(health.maxSessions,2);
  const allowed=await fetch(base+'/health',{headers:{Origin:testOrigin}});
  assert.equal(allowed.status,200);assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),testOrigin);
  for(const origin of ['https://panulut.github.io','http://lpr-game-test.azurestaticapps.net','https://other.azurestaticapps.net']){
   const denied=await fetch(base+'/health',{headers:{Origin:origin}});
   assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
  }
  const unauthorized=await fetch(base+'/metrics');
  assert.equal(unauthorized.status,401);
  assert.equal((await fetch(base+'/metrics',{headers:{Authorization:'Bearer wrong'}})).status,401);
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
  await server.capacityReporter.close();
  await new Promise(resolve=>server.close(resolve));
  for(const key of envKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 }
})().catch(error=>{
 for(const key of envKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 console.error(error);
 process.exitCode=1;
});
