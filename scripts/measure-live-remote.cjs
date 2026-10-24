// Real-time, two-player test of the live protocol. Does not print credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const LiveClient=require('../experiment/live-client.js');
(async()=>{
 const base=new URL(process.env.REPLAY_BASE_URL||'');if(base.protocol!=='https:')throw Error('HTTPS REPLAY_BASE_URL required');
 if(!process.env.LAB_TOKEN)throw Error('LAB_TOKEN required');
 const replay=JSON.parse(fs.readFileSync(process.argv[2]||path.resolve(__dirname,'../artifacts/replay-probe/experiment-replay.json'),'utf8'));
 const expected=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../experiment/local-measurement-after-asphalt.json'),'utf8')).single.result;
 const health=await (await fetch(new URL('/health',base),{signal:AbortSignal.timeout(20000)})).json();
 assert(health.streaming,'Deploy the live-session server first');assert.equal(health.revision,replay.revision);
 const players=[],timers=[];
 try{
  const runs=[0,1].map(async index=>{
   const record={player:index+1,acks:[],enqueued:0};let resolve,reject;
   const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});
   // Attach a rejection handler during asynchronous initialization too.
   finished.catch(()=>{});
   const client=new LiveClient({base:base.origin,revision:replay.revision,token:process.env.LAB_TOKEN,
    onUpdate:ack=>{if(ack.seq===undefined)return;
     record.acks.push({seq:ack.seq,ticks:ack.ackTick,wallMs:ack.wallMs,cpuMs:ack.cpuMs,elapsedMs:performance.now()-record.started});
     if(ack.verified){try{assert.deepEqual(ack.result,expected);record.result=ack.result;record.finishedMs=performance.now()-record.started;resolve();}catch(error){reject(error);}}
    },onLost:reason=>reject(Error('Player '+(index+1)+': '+reason))});
   players.push(client);await client.start();record.started=performance.now();
   const deadline=setTimeout(()=>reject(Error('Live test timed out')),150000);timers.push(deadline);
   const timer=setInterval(()=>{
    const target=Math.min(replay.inputs.length,Math.floor((performance.now()-record.started)*replay.hz/1000));
    while(client.active&&record.enqueued<target)client.enqueue(replay.inputs[record.enqueued++]);
    if(record.enqueued===replay.inputs.length){clearInterval(timer);void client.flush(true).catch(reject);}
   },20);timers.push(timer);
   await finished;clearTimeout(deadline);clearInterval(timer);
   const last=record.acks.at(-1);
   return {player:record.player,verified:true,inputs:record.enqueued,batches:record.acks.length,lapMs:record.result.lapMs,
    completionWallMs:record.finishedMs,finishDelayMs:record.finishedMs-record.result.lapMs,
    maxObservedAckLagMs:Math.max(...record.acks.map(a=>a.elapsedMs-a.ticks*1000/replay.hz)),
    workerCpuMs:record.acks.reduce((a,b)=>a+b.cpuMs,0),maxBatchWallMs:Math.max(...record.acks.map(a=>a.wallMs)),lastAck:last,result:record.result};
  });
  const result=await Promise.all(runs);
  const report={generatedAt:new Date().toISOString(),target:base.origin,revision:replay.revision,plan:'free',
   scope:'Two real-time paced Node clients using a synthetic fixture, not human/browser/3D-game evidence',players:result};
  const dest=path.resolve(__dirname,'../artifacts/replay-probe/live-remote-report.json');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }finally{timers.forEach(t=>{clearInterval(t);clearTimeout(t)});await Promise.all(players.map(c=>c.cancel()));}
})().catch(error=>{console.error(error.message);process.exitCode=1});
