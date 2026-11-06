const assert=require('node:assert/strict');
const {validateAzureProduction}=require('../verification/azure-production.cjs');
const {createServer}=require('../verification/server.cjs');
const origin='https://panulut.github.io',custom='https://lprmotorsports.me';
const env={NODE_ENV:'production',VERIFICATION_ENVIRONMENT:'azure-production',VERIFICATION_PUBLIC:'1',PORT:'8081',
 MAX_VERIFIED_SESSIONS:'10',MAX_VERIFIED_STARTS_PER_MINUTE:'32',VERIFICATION_WORKERS:'1',
 VERIFICATION_WORKER_HEAP_MB:'256',VERIFICATION_LAP_LAG_MS:'2000',LPR_RELEASE_COMMIT:'a'.repeat(40),GAME_ORIGINS:origin+','+custom};
const options={secret:'production-test-signing-key-'.repeat(2),metricsToken:'production-test-metrics-key-'.repeat(2),origins:[origin,custom],sessionsOptions:{},
 chatStorageURL:'https://lpr-verified.panu-musakka.workers.dev/api/verified/chat-storage',
 capacityReportURL:'https://lpr-leaderboard.panu-musakka.workers.dev/api/internal/capacity'};
validateAzureProduction(options,env);
for(const [key,values]of Object.entries({VERIFICATION_ENVIRONMENT:['','azure-test','other'],VERIFICATION_PUBLIC:['0'],PORT:['8080'],
 MAX_VERIFIED_SESSIONS:['11','5','1',''],MAX_VERIFIED_STARTS_PER_MINUTE:['8','100'],VERIFICATION_WORKERS:['2'],
 VERIFICATION_WORKER_HEAP_MB:['512'],VERIFICATION_LAP_LAG_MS:['16000'],LPR_RELEASE_COMMIT:['main','a'.repeat(7)],
 GAME_ORIGINS:['','https://lpr-motorsport-test-a1gg.onrender.com',origin+'/',origin+',https://attacker.example',origin+'.attacker.example']}))
 for(const value of values)assert.throws(()=>validateAzureProduction(options,{...env,[key]:value}),Error,key);
for(const changed of [{secret:'short'},{metricsToken:options.secret},{metricsToken:null},
 {chatStorageURL:'https://lpr-verified-test.panu-musakka-0bf.workers.dev/api/verified/chat-storage'},
 {capacityReportURL:null},{origins:[]},{origins:[origin,'https://attacker.example']},{sessionsOptions:{maxSessions:10}}])
 assert.throws(()=>validateAzureProduction({...options,...changed},env),Error);
const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
Object.assign(process.env,env);
(async()=>{let server;try{
 server=await createServer(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 for(const allowed of [origin,custom]){const r=await fetch(base+'/health',{method:'OPTIONS',headers:{Origin:allowed}});assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Max-Age'),'600');assert.equal(r.headers.get('Access-Control-Allow-Origin'),allowed);}
 const denied=await fetch(base+'/health',{method:'OPTIONS',headers:{Origin:'https://lpr-motorsport-test-a1gg.onrender.com'}});assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Max-Age'),null);
 const h=await fetch(base+'/health',{headers:{Origin:origin}}).then(r=>r.json());assert(h.ready);assert.equal(h.commit,env.LPR_RELEASE_COMMIT);assert.equal(h.maxSessions,10);assert.equal(h.lapLagMs,2000);assert.equal(h.revision,require('../verification/world.cjs').revision);
 assert.equal((await fetch(base+'/metrics')).status,401);
 assert.equal((await fetch(base+'/metrics',{headers:{Authorization:'Bearer '+options.metricsToken}})).status,200);
 console.log('PASS: explicit Azure production guards, origin isolation, CORS cache, metrics protection and source identity');
}finally{
 if(server){await new Promise(r=>server.close(r));await server.sessions.close();await server.capacityReporter.close();}
 for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}})().catch(e=>{console.error(e);process.exitCode=1});
