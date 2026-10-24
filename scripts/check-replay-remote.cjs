// Run only against your deployed experiment. Never prints LAB_TOKEN.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const url=new URL(process.env.REPLAY_BASE_URL||'');
 if(url.protocol!=='https:')throw Error('REPLAY_BASE_URL must use HTTPS');
 if(!process.env.LAB_TOKEN)throw Error('LAB_TOKEN is required');
 const fixture=JSON.parse(fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../artifacts/replay-probe/experiment-replay.json'),'utf8'));
 const replay=fixture.replay||fixture;
 let start=performance.now();const healthResponse=await fetch(new URL('/health',url),{signal:AbortSignal.timeout(120000)});
 assert.equal(healthResponse.status,200);const health=await healthResponse.json(),startupWallMs=performance.now()-start;
 assert.equal(health.revision,replay.revision,'Deploy exactly the revision used to record the fixture');
 const verify=async()=>{const start=performance.now();const r=await fetch(new URL('/verify',url),{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.LAB_TOKEN},body:JSON.stringify(replay),signal:AbortSignal.timeout(120000)});
  const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return {requestWallMs:performance.now()-start,...body};};
 const single=await verify();start=performance.now();const results=await Promise.all([verify(),verify()]);
 assert.deepEqual(results[0].result,single.result);assert.deepEqual(results[1].result,single.result);
 const report={generatedAt:new Date().toISOString(),target:url.origin,health,startupWallMs,
  startupNote:'Includes cold start only if the service was actually asleep',single,pair:{wallMs:performance.now()-start,results}};
 const target=path.resolve(__dirname,'../artifacts/replay-probe/remote-report.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1});
