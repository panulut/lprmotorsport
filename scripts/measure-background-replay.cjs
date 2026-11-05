// Two synchronized full laps, real HTTP/clock/IPC/signatures. Local traffic only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{gzip}=require('node:zlib'),{promisify}=require('node:util');
const {createWorld,revision}=require('../verification/world.cjs'),{Recorder}=require('../verification/replay.cjs');
const {driver}=require('../tests/helpers-driving.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
const p95=a=>[...a].sort((a,b)=>a-b)[Math.ceil(a.length*.95)-1];
async function load(inputFile){
 const {inputs,finishes}=JSON.parse(fs.readFileSync(inputFile)),secret='local-background-replay-measurement-'.repeat(3);
 const {sign,verify,hash}=await import('../verification/protocol.mjs');
 const server=await require('../verification/server.cjs').createServer({secret,sessionsOptions:{maxSessions:10,maxStartsPerMinute:10}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(url,body,token)=>{
  const res=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  assert(res.ok,await res.clone().text());return res.json();
 };
 try{
  const players=await Promise.all(Array.from({length:10},async(_,i)=>{
   const now=Date.now(),ticket=await sign({kind:'start',protocol:'driving-v1',revision,playerHash:i.toString(16).padStart(64,'0'),nickname:'Replay load '+i,nonce:(i+32).toString(16).padStart(64,'0'),issuedAt:now,expiresAt:now+120000},secret);
   return {...await post('/sessions',{ticket,revision,armed:true}),received:new Map()};
  }));
  await Promise.all(players.map(p=>post('/sessions/'+p.id+'/start',{},p.sessionToken)));
  const start=performance.now(),cpu=process.cpuUsage(),ackLags=[],latencies=[],finishAcks=[];
  for(let from=0,seq=0;from<inputs.length;from+=60,seq++){
   const batch=inputs.slice(from,from+60),end=from+batch.length;
   await sleep(start+end*1000/120-performance.now());
   await Promise.all(players.map(async p=>{
    const sent=performance.now(),body={revision,seq,fromTick:from,inputs:batch};
    const ack=await post('/sessions/'+p.id+'/inputs',body,p.sessionToken);
    latencies.push(performance.now()-sent);ackLags.push(Math.max(0,ack.serverElapsedMs-end*1000/120));
    assert.equal(ack.ackTick,end);assert(ack.eligibility.eligible);assert.deepEqual(ack.practiceLaps,[]);
    for(const lap of ack.laps)p.received.set(lap.lap.lap,lap);
    if(finishes.some(t=>t>from&&t<=end))finishAcks.push(latencies.at(-1));
   }));
   if(seq%60===0)console.error('Load progress: '+Math.round(end/120)+' / '+Math.ceil(inputs.length/120)+' s');
  }
  for(const p of players){
   const res=await fetch(base+'/sessions/'+p.id+'/laps',{headers:{Authorization:'Bearer '+p.sessionToken}});assert(res.ok);
   for(const lap of (await res.json()).laps)p.received.set(lap.lap.lap,lap);
   assert.equal(p.received.size,2);
   for(const item of p.received.values()){
    const receipt=await verify(item.receipt,secret);assert.equal(receipt.sessionId,p.id);
    assert.equal(receipt.replayHash,await hash(item.replay));assert(item.replay.length<=900000);
   }
  }
  const metrics=server.sessions.snapshotMetrics(),usage=process.cpuUsage(cpu);
  assert.equal(metrics.counters.verifiedLaps,20);assert.equal(metrics.counters.practiceLaps,0);assert.equal(metrics.counters.lagTerminations,0);
  for(const p of players)server.sessions.cancel(p.id,p.sessionToken);
  await server.sessions.pool.drain();
  const cleanup=await server.sessions.pool.inspect();assert(cleanup.every(s=>s.worlds===0&&s.queued===0&&s.pendingRecordings===0&&s.queuedRecordings===0));
  return {players:10,lapsPerPlayer:2,verifiedLaps:20,practiceLaps:0,lagTerminations:0,ticksPerPlayer:inputs.length,finishTicks:finishes,
   elapsedMs:performance.now()-start,cpuMs:(usage.user+usage.system)/1000,
   ackLagMs:{p95:p95(ackLags),max:Math.max(...ackLags)},httpResponseMs:{p95:p95(latencies),max:Math.max(...latencies)},
   finishResponseMs:{p95:p95(finishAcks),max:Math.max(...finishAcks)},peakRssMiB:process.resourceUsage().maxRSS/1024,metrics,cleanup};
 }finally{await server.sessions.close();await new Promise(r=>server.close(r));}
}
(async()=>{
 if(process.argv[2]==='--child')return console.log(JSON.stringify(await load(process.argv[3])));
 const {world,api}=createWorld(),recorder=new Recorder(world,revision,{deferPacking:true}),inputs=[],finishes=[],documents=[];
 while(finishes.length<2){
  const input=driver(world),encoded=api.encode(input);inputs.push(encoded);
  const event=world.step(input),document=recorder.step(encoded,event);
  if(event.completed){documents.push(document);finishes.push(event.completed.endTick);}
  assert(inputs.length<72000);
 }
 const compression=[];
 for(let lap=0;lap<documents.length;lap++){
  const start=performance.now(),json=JSON.stringify(documents[lap]),stringifyMs=performance.now()-start;
  for(const level of [6,3,1]){
   const times=[];let payload;
   for(let trial=0;trial<5;trial++){const before=performance.now();payload=(await promisify(gzip)(json,{level})).toString('base64');times.push(performance.now()-before);}
   assert(payload.length<=900000);
   compression.push({lap:lap+1,level,jsonBytes:Buffer.byteLength(json),stringifyMs,base64Chars:payload.length,gzipBase64MedianMs:times.sort((a,b)=>a-b)[2]});
  }
 }
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'lpr-replay-load-'));
 try{
  const inputFile=path.join(temporary,'inputs.json');fs.writeFileSync(inputFile,JSON.stringify({inputs,finishes}));
  const child=spawnSync(process.execPath,[__filename,'--child',inputFile],{encoding:'utf8',timeout:720000,maxBuffer:1048576,stdio:['ignore','pipe','inherit']});
  if(child.status!==0)throw Error(child.error?.message||'Load child failed');
  const report={generatedAt:new Date().toISOString(),node:process.version,revision,
   scope:'Fresh local Node process, one pooled physics worker (256 MiB old-generation limit), 10 real-clock HTTP clients, two full synchronized laps, real signatures and replay hash verification. No production traffic; local CPU is not constrained to Azure 0.5 vCPU.',
   host:{platform:process.platform,arch:process.arch,cpus:os.availableParallelism()},compression,run:JSON.parse(child.stdout)};
  const output=path.resolve(__dirname,'../artifacts/verification/background-replay-load.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({report:output,ackLagMs:report.run.ackLagMs,peakRssMiB:report.run.peakRssMiB,verifiedLaps:20,practiceLaps:0,lagTerminations:0,compression}));
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
