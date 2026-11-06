const assert=require('node:assert/strict'),{gzipSync}=require('node:zlib');
const {createTestServer,validate,SOURCE,TEST_WORKER,ORIGIN,wrapperHash}=require('../verification/azure-test-bootstrap.cjs');
const {targets,validateProof,assess,APP}=require('../scripts/lib/azure-capacity.cjs');
const {verifyArtifact}=require('../scripts/measure-azure-capacity.cjs'),{revision}=require('../verification/world.cjs');
(async()=>{
 const secret='test-capacity-signing-'.repeat(4),metrics='test-capacity-metrics-'.repeat(4);
 const env={NODE_ENV:'production',VERIFICATION_ENVIRONMENT:'azure-test',VERIFICATION_PUBLIC:'1',PORT:'8081',LPR_RELEASE_COMMIT:SOURCE,LPR_TEST_WRAPPER_SHA:wrapperHash,
  LPR_TEST_WORKER_URL:TEST_WORKER,GAME_ORIGINS:ORIGIN,MAX_VERIFIED_SESSIONS:'10',MAX_VERIFIED_STARTS_PER_MINUTE:'32',VERIFICATION_WORKERS:'1',VERIFICATION_WORKER_HEAP_MB:'256',VERIFICATION_LAP_LAG_MS:'2000',
  VERIFICATION_SECRET:secret,VERIFICATION_METRICS_TOKEN:metrics};
 validate(env);
 for(const patch of [{MAX_VERIFIED_SESSIONS:'5'},{VERIFICATION_LAP_LAG_MS:'3000'},{LPR_RELEASE_COMMIT:'a'.repeat(40)},{CHAT_STORAGE_URL:'https://production.invalid'},
  {CAPACITY_REPORT_URL:'https://production.invalid'},{LPR_TEST_WORKER_URL:'https://lpr-verified.panu-musakka.workers.dev'},{GAME_ORIGINS:'https://lprmotorsports.me'},{VERIFICATION_METRICS_TOKEN:secret}])
  assert.throws(()=>validate({...env,...patch}));
 const service='https://'+APP+'.test.swedencentral.azurecontainerapps.io';
 targets(service,TEST_WORKER);
 for(const s of ['https://lpr-verification-prod.test.azurecontainerapps.io','https://prod.azurecontainerapps.io','https://'+APP+'.evil.invalid','http://'+APP+'.test.azurecontainerapps.io'])assert.throws(()=>targets(s,TEST_WORKER));
 assert.throws(()=>targets(service,'https://lpr-verified.panu-musakka.workers.dev'));
 const proof={name:APP,id:'/subscriptions/id/resourceGroups/rg-lpr-prod/providers/Microsoft.App/containerApps/'+APP,resources:{cpu:.5,memory:'1Gi'},minReplicas:1,maxReplicas:1,
  activeRevisionsMode:'Single',workloadProfileName:'Consumption',image:'ghcr.io/test@sha256:'+'a'.repeat(64),commit:SOURCE,wrapperHash,service,worker:TEST_WORKER};
 validateProof(proof);assert.throws(()=>validateProof({...proof,resources:{cpu:1,memory:'1Gi'}}));assert.throws(()=>validateProof({...proof,image:'tag:mutable'}));
 const {sign,hash}=await import('../verification/protocol.mjs'),player={session:{id:'a'.repeat(32)},playerHash:'b'.repeat(64)};
 const replay=gzipSync(JSON.stringify({sceneRevision:revision,startTick:0,endTick:60})).toString('base64'),lap={lap:1,startTick:0,endTick:60,lapTicks:60};
 const value={lap,replay,receipt:await sign({kind:'lap',protocol:'driving-v1',revision,sessionId:player.session.id,playerHash:player.playerHash,...lap,replayHash:await hash(replay)},secret)};
 assert((await verifyArtifact(value,player,secret)).signatureValid);
 await assert.rejects(verifyArtifact({...value,replay:replay.slice(4)},player,secret));await assert.rejects(verifyArtifact(value,player,metrics));
 const first={capacityTest:{instance:'one'},counters:{verifiedLaps:0,practiceLaps:0,lagTerminations:0,processingTimeouts:0},serverMaxRssBytes:500*1048576,
  invalidations:{},activeSessions:0,pool:{limit:1,workerHeapMb:256},maxSessions:10,workerStats:[],timings:{}};
 const last={...first,counters:{...first.counters,verifiedLaps:20},workerStats:[{worlds:0,queued:0,pendingRecordings:0,packing:false}],timings:{replayPackMs:{count:20}}};
 const run={players:Array.from({length:10},()=>({verifiedLaps:[{signatureValid:true,replayHashValid:true},{signatureValid:true,replayHashValid:true}]})),metrics:[{phase:'before',data:structuredClone(first)},{phase:'during',data:structuredClone(first)},{phase:'final',data:structuredClone(last)}],metricErrors:[],failures:[],serverAckLagMaxMsSinceStart:999,ackLagMs:{max:999}};
 assert(assess(run).passed);
 for(const change of [r=>{r.ackLagMs.max=1000;},r=>{r.ackLagMs.max=null;},r=>{r.metrics[2].data.serverMaxRssBytes=800*1048576;},r=>{r.metrics[2].data.invalidations.replay=1;},r=>{r.metrics[2].data.counters.processingTimeouts=1;},r=>{r.metrics[2].data.capacityTest.instance='restart';},r=>{r.players[0].verifiedLaps[0].replayHashValid=false;},r=>{r.metricErrors.push({});}]){
  const bad=structuredClone(run);change(bad);assert.equal(assess(bad).passed,false);
 }
 // Evidence reporting recomputes the gate and requires the matching test app's
 // stopped state. These synthetic files and document live only in a temp folder.
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{publish}=require('../scripts/report-azure-capacity.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'azure-report-unit-'));
 try{
  const document=path.join(directory,'review.md'),status=path.join(directory,'status.json');fs.writeFileSync(document,'Synthetic unit document\n');
  fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify({sourceCommit:SOURCE,proof}));
  for(let number=1;number<=3;number++)fs.writeFileSync(path.join(directory,'run-'+number+'.json'),JSON.stringify({...run,number,sourceCommit:SOURCE,service,worker:TEST_WORKER}));
  fs.writeFileSync(path.join(directory,'stop-proof.json'),JSON.stringify({id:proof.id,runningStatus:'Stopped'}));
  assert(publish(directory,{document,status}).allThreePassed);
  fs.writeFileSync(path.join(directory,'stop-proof.json'),JSON.stringify({id:proof.id,runningStatus:'Running'}));
  assert.equal(publish(directory,{document,status}).allThreePassed,false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
 const previous={...process.env};Object.assign(process.env,env);delete process.env.CHAT_STORAGE_URL;delete process.env.CAPACITY_REPORT_URL;
 let server;
 try{
  server=await createTestServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/metrics')).status,401);assert.equal((await fetch(base+'/metrics',{headers:{Authorization:'Bearer '+secret}})).status,401);
  assert.equal((await fetch(base+'/health',{headers:{Origin:'https://lprmotorsports.me'}})).status,403);
  const h=await(await fetch(base+'/health')).json();assert.equal(h.commit,SOURCE);assert.equal(h.capacityTest.wrapperHash,wrapperHash);
  const p=await server.sessions.create(revision,{});const s=server.sessions.sessions.get(p.id);server.sessions.invalidate(s,'replay');server.sessions.invalidate(s,'replay');await server.sessions.pool.drain();
  const m=await(await fetch(base+'/metrics',{headers:{Authorization:'Bearer '+metrics}})).json();
  assert.equal(m.invalidations.replay,1);assert(m.serverMaxRssBytes>0);assert.equal(m.workerStats.length,1);assert.equal(m.workerStats[0].worlds,0);
  assert(!JSON.stringify(m).includes(secret));assert(!JSON.stringify(m).includes(metrics));assert(!JSON.stringify(m).includes(p.sessionToken));
 }finally{
  if(server){await server.sessions.close();await new Promise(r=>server.close(r));}
  for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);
 }
 console.log('PASS: isolated Azure source/config/URL proof, actual signature/hash validation, all acceptance thresholds, server-only high-water metrics, auth and durable replay-invalidations');
})().catch(e=>{console.error(e);process.exitCode=1;});
