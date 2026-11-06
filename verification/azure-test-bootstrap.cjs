// Test-only instrumentation around the unmodified e70218a verification service.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createHash,timingSafeEqual,randomUUID}=require('node:crypto');
const SOURCE='e70218a6298aecaacd748c62a77f6e67bfcae731';
const TEST_WORKER='https://lpr-verified-test.panu-musakka-0bf.workers.dev';
const ORIGIN='https://lpr-motorsport-test-a1gg.onrender.com';
const wrapperHash=createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
function validate(env){
 for(const [key,value] of Object.entries({NODE_ENV:'production',VERIFICATION_ENVIRONMENT:'azure-test',VERIFICATION_PUBLIC:'1',PORT:'8081',
  LPR_RELEASE_COMMIT:SOURCE,LPR_TEST_WRAPPER_SHA:wrapperHash,LPR_TEST_WORKER_URL:TEST_WORKER,GAME_ORIGINS:ORIGIN,
  MAX_VERIFIED_SESSIONS:'10',MAX_VERIFIED_STARTS_PER_MINUTE:'32',VERIFICATION_WORKERS:'1',VERIFICATION_WORKER_HEAP_MB:'256',VERIFICATION_LAP_LAG_MS:'2000'}))
  assert.equal(env[key],value,'Azure test requires '+key+'='+value);
 assert(typeof env.VERIFICATION_SECRET==='string'&&env.VERIFICATION_SECRET.length>=32,'Test signing key required');
 assert(typeof env.VERIFICATION_METRICS_TOKEN==='string'&&env.VERIFICATION_METRICS_TOKEN.length>=32&&env.VERIFICATION_METRICS_TOKEN!==env.VERIFICATION_SECRET,'Separate test metrics token required');
 assert(!env.CHAT_STORAGE_URL&&!env.CAPACITY_REPORT_URL,'Remote chat/capacity storage must be disabled in this test image');
}
async function createTestServer(){
 validate(process.env);
 // The pinned server's production-only guard rejects test mode. Validate our
 // stricter test contract first, then invoke its ordinary factory unchanged.
 const mode=process.env.VERIFICATION_ENVIRONMENT;delete process.env.VERIFICATION_ENVIRONMENT;
 let server;try{server=await require('./server.cjs').createServer({origins:[ORIGIN]});}
 finally{process.env.VERIFICATION_ENVIRONMENT=mode;}
 const instance=randomUUID(),invalidations={};
 const originalInvalidate=server.sessions.invalidate.bind(server.sessions);
 server.sessions.invalidate=(s,reason)=>{if(s.slot)invalidations[reason]=(invalidations[reason]||0)+1;return originalInvalidate(s,reason);};
 const handlers=server.listeners('request');server.removeAllListeners('request');
 server.on('request',async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method!=='GET'||!['/health','/metrics'].includes(path))return handlers.forEach(h=>h.call(server,req,res));
  const origin=req.headers.origin,headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origin&&origin!==ORIGIN){res.writeHead(403,headers);return res.end('{}');}
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  const reply=(status,data)=>{if(!res.destroyed){res.writeHead(status,headers);res.end(JSON.stringify(data));}};
  const identity={sourceCommit:SOURCE,wrapperHash,instance,workerURL:TEST_WORKER,environment:'azure-test'};
  if(path==='/health')return reply(200,{ready:true,protocol:'driving-v1',revision:require('./world.cjs').revision,commit:SOURCE,hz:120,streaming:true,
   activeSessions:server.sessions.activeCount,maxSessions:10,lapLagMs:2000,capacityTest:identity});
  const provided=Buffer.from(req.headers.authorization?.replace(/^Bearer /,'')||''),expected=Buffer.from(process.env.VERIFICATION_METRICS_TOKEN);
  if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return reply(401,{error:'Unauthorized'});
  try{
   const workerStats=await server.sessions.pool.inspect();
   reply(200,{...server.sessions.snapshotMetrics(),capacityTest:identity,workerStats,
    serverMaxRssBytes:process.resourceUsage().maxRSS*1024,invalidations:{...invalidations}});
  }catch{reply(503,{error:'Test worker metrics unavailable'});}
 });
 return server;
}
module.exports={createTestServer,validate,SOURCE,TEST_WORKER,ORIGIN,wrapperHash};
if(require.main===module)createTestServer().then(server=>{
 let stopping=false;
 const stop=async()=>{if(stopping)return;stopping=true;server.close();await server.sessions.close();await server.capacityReporter.close();};
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void stop().catch(()=>{process.exitCode=1;});});
 server.listen(8081,'0.0.0.0',()=>console.log('Isolated Azure capacity test listening'));
}).catch(error=>{console.error(error.message);process.exitCode=1;});
