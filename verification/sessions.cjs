// Server-owned driving state. Restarts and timeouts invalidate unfinished laps.
const {VerificationPool}=require('./worker-pool.cjs');
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {revision}=require('./world.cjs');
const hz=120;
const fail=(status,code,message,extra={})=>Object.assign(Error(message),{status,code,...extra});
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
class Sessions {
 constructor({clock=()=>performance.now(),workerCount=1,workerHeapMb=256,executorFactory=options=>new VerificationPool(options),maxSessions=2,maxStartsPerMinute=8,leadMs=250,lagMs=16000,lapLagMs=2000,idleMs=24000,ttlMs=620000,onMetric=()=>{},signLap=async()=>{throw Error('Missing signer')}}={}){
  Object.assign(this,{clock,maxSessions,maxStartsPerMinute,leadMs,lagMs,lapLagMs,idleMs,ttlMs,signLap,onMetric});this.sessions=new Map();this.creations=[];this.closed=false;this.spectatorSalt=randomBytes(32);
  for(const value of [maxSessions,maxStartsPerMinute])if(!Number.isSafeInteger(value)||value<1||value>256)throw Error('Capacity limits must be integers from 1 to 256');
  this.pool=executorFactory({workerCount,workerHeapMb,onReplay:message=>{void this.recorded(message);},onLost:id=>this.workerLost(id)});
  this.metricsSince=Date.now();
  this.metrics={started:performance.now(),starts:0,capacityRejected:0,startRateRejected:0,batches:0,ticks:0,verifiedLaps:0,practiceLaps:0,processingTimeouts:0,lagTerminations:0};
  this.timings={};
  this.timer=setInterval(()=>this.sweep(),1000);this.timer.unref();
 }
 countMetric(key,count=1){this.metrics[key]+=count;this.onMetric(key,count);}
 get activeCount(){return [...this.sessions.values()].filter(s=>s.slot).length;}
 observe(name,value){
  if(!Number.isFinite(value)||value<0)return;
  const h=this.timings[name]||(this.timings[name]={count:0,sumMs:0,maxMs:0,buckets:Array(16).fill(0)});
  h.count++;h.sumMs+=value;h.maxMs=Math.max(h.maxMs,value);h.buckets[Math.min(15,Math.ceil(Math.log2(Math.max(1,value))))]++;
 }
 snapshotMetrics(){return {since:this.metricsSince,uptimeMs:performance.now()-this.metrics.started,activeSessions:this.activeCount,maxSessions:this.maxSessions,
  maxStartsPerMinute:this.maxStartsPerMinute,pool:this.pool.snapshot(),counters:{...this.metrics,started:undefined},timings:JSON.parse(JSON.stringify(this.timings)),
  cpuMicroseconds:process.cpuUsage(),memoryBytes:process.memoryUsage()};}
 async create(version,identity,{armed=false}={}){
  if(this.closed)throw fail(410,'session_closed','Verification service closed');
  this.sweep();
  if(version!==revision)throw fail(409,'revision','Simulation revision changed');
  if(this.activeCount>=this.maxSessions){this.countMetric('capacityRejected');throw fail(429,'capacity','Verified session capacity reached');}
  const now=this.clock();this.creations=this.creations.filter(t=>now-t<60000);
  if(this.creations.length>=this.maxStartsPerMinute){this.countMetric('startRateRejected');throw fail(429,'rate_limit','Too many session starts');}
  this.creations.push(now);
  // Bound completed receipt caches even when starts fail or clients disappear.
  for(const [id,s] of this.sessions){if(!s.slot&&!s.pendingLaps.size&&now-Math.max(s.lastAccepted,s.retainedAt||0)>120000)this.sessions.delete(id);}
  const id=randomBytes(16).toString('hex'),token=randomBytes(32).toString('hex');
  const s={id,token,identity,phase:'starting',slot:true,nextSeq:0,ticks:0,receipts:new Map(),lastAccepted:now,created:now,failures:0,lapEligible:true,eligibleFromTick:0,pendingLaps:new Map(),completedLaps:new Map(),readyLaps:[]};
  this.sessions.set(id,s);
  try{
   const initStart=performance.now(),initial=await this.spawn(s);
   if(!s.slot)throw fail(410,'session_closed','Session was interrupted during initialization');
   s.live=initial.live;
   if(s.live){s.live.lapStates=[{lap:1,startTick:0,bestLapMs:0}];s.live.bestLapMs=0;}
   this.observe('initializationMs',performance.now()-initStart);this.countMetric('starts');
   s.started=this.clock();s.lastAccepted=s.started;s.phase=armed?'armed':'running';
   return {id,sessionToken:token,revision,hz,armed,initial:initial.result,maxBatchTicks:120,sendEveryTicks:60,leadMs:this.leadMs,lagMs:this.lagMs,lapLagMs:this.lapLagMs};
  }catch(error){this.invalidate(s,'initialization');throw error;}
 }
 spawn(s){return this.pool.create(s.id);}
 owned(id,token){
  this.sweep();const s=this.sessions.get(id);
  if(!s)throw fail(410,'session_lost','Session expired or server restarted; continue in practice mode');
  if(!equal(token,s.token))throw fail(401,'owner','Invalid session credential');
  return s;
 }
 activate(id,token){
  const s=this.owned(id,token);
  if(s.phase==='armed'){s.started=this.clock();s.lastAccepted=s.started;s.phase='running';}
  if(s.phase!=='running')throw fail(410,'session_closed','Session is no longer running');
  return {phase:s.phase,ackTick:s.ticks};
 }
 async batch(id,token,data){
  const s=this.owned(id,token);
  if(data?.revision!==revision)throw fail(409,'revision','Simulation revision changed');
  if(!Number.isSafeInteger(data.seq)||data.seq<0||data.seq>=2400||!Number.isSafeInteger(data.fromTick)||data.fromTick<0||
    !Array.isArray(data.inputs)||data.inputs.length<1||data.inputs.length>120||data.inputs.some(a=>!Array.isArray(a)||a.length!==6||!a.slice(0,3).every(Number.isFinite)||a[0]<0||a[0]>1||a[1]<0||a[1]>1||Math.abs(a[2])>1||!a.slice(3).every(v=>typeof v==='boolean')))
   throw fail(400,'batch','Invalid input batch');
  const digest=createHash('sha256').update(JSON.stringify([data.seq,data.fromTick,data.inputs])).digest('hex');
  const receipt=s.receipts.get(data.seq);
  if(receipt){if(receipt.digest!==digest)throw fail(409,'conflict','Acknowledged input cannot be changed');return receipt.reply;}
  if(s.phase!=='running')throw fail(410,'session_closed','Session is no longer running');
  if(s.inflight){if(s.inflight.seq===data.seq&&s.inflight.digest===digest)return s.inflight.promise;throw fail(409,'busy','Previous batch is still being verified',{retryable:true});}
  if(data.seq!==s.nextSeq||data.fromTick!==s.ticks)throw fail(409,'sequence','Input sequence or starting tick is not contiguous');
  const endTick=s.ticks+data.inputs.length;
  if(endTick>hz*600)throw fail(400,'duration','Session input limit exceeded');
  const elapsed=this.clock()-s.started,simMs=endTick*1000/hz;
  if(simMs>elapsed+this.leadMs){
   if(++s.failures>8)this.invalidate(s,'future_input');
   throw fail(425,'future','Inputs extend beyond server time',{retryable:s.phase==='running',retryAfterMs:Math.ceil(simMs-elapsed-this.leadMs)});
  }
  // Do not allow an attacker to wait and then upload an unbounded old replay.
  if(elapsed-s.ticks*1000/hz>this.lagMs){this.invalidate(s,'lag');throw fail(410,'lag','Verification fell too far behind; continue in practice mode');}
  // Compare arrival with the END of this bounded batch: normal batching is not slowdown.
  // Keep the original server clock forever; recovery cannot grant a fresh time budget.
  const arrivalLagMs=elapsed-simMs;
  if(arrivalLagMs>this.lapLagMs)s.lapEligible=false;
  const promise=this.process(s,data,digest,endTick,arrivalLagMs);s.inflight={seq:data.seq,digest,promise};
  try{return await promise;}finally{s.inflight=null;}
 }
 async process(s,data,digest,endTick,arrivalLagMs){
  const processingStart=performance.now();
  try{
   const message=await this.pool.inputs(s.id,data.inputs);
   this.observe('queueMs',message.queueMs);
   this.observe('workerWallMs',message.wallMs);this.observe('physicsMs',message.physicsMs);this.observe('replayMs',message.replayMs);
   if(s.phase!=='running')throw fail(410,'session_closed','Session was interrupted');
   if(message.result.crashed)throw fail(422,'crashed','Car crashed; session is not a verified lap');
   if(message.result.ticks!==endTick)throw fail(422,'ticks','Simulation tick mismatch');
   s.ticks=endTick;s.nextSeq++;s.lastAccepted=this.clock();
   if(s.live&&message.live){
    s.live.frames.push(...message.live.frames);s.live.inputs.push(...message.live.inputs);
     if(message.live.lapStartTick!==undefined&&s.live.lapStates[0]?.lap===1)
      s.live.lapStates[0].startTick=message.live.lapStartTick;
    s.live.frames=s.live.frames.filter(f=>f[0]>=endTick-600);
    s.live.inputs=s.live.inputs.filter(f=>f[0]>=s.live.frames[0][0]);
    for(const lap of message.laps||[]){
     const ms=lap.lapTicks*1000/hz;s.live.bestLapMs=s.live.bestLapMs?Math.min(s.live.bestLapMs,ms):ms;
     s.live.lapStates.push({lap:lap.lap+1,startTick:lap.endTick,bestLapMs:s.live.bestLapMs});
    }
    while(s.live.lapStates.length>1&&s.live.lapStates[1].startTick<=s.live.frames[0][0])s.live.lapStates.shift();
   }
   const laps=[],practiceLaps=[];
   for(const value of message.laps||[]){
    const {replay,...lap}=value;
    // Check the crossing itself as well as the batch end, so trailing inputs cannot
    // hide a late finish. Only server-simulated boundaries can restore eligibility.
    const crossingLagMs=arrivalLagMs+(endTick-lap.endTick)*1000/hz;
    if(crossingLagMs>this.lapLagMs)s.lapEligible=false;
    if(message.deferred){
     let resolve;const done=new Promise(r=>{resolve=r;});
     s.pendingLaps.set(lap.endTick,{lap,eligible:s.lapEligible,done,resolve});
    }
    if(s.lapEligible){
     // Reference executors still return recordings inline. The pool returns only
     // authoritative boundaries here; signing waits in recorded(), outside ack.
     if(!message.deferred)laps.push({lap,receipt:await this.signLap(s,{...lap,...(replay?{replayHash:replay.hash}:{})}),...(replay?{replay:replay.payload}:{})});
    }
    else practiceLaps.push(lap.lap);
    // Catch-up laps never get receipts. Rejoin only at an exact, timely boundary;
    // do not retroactively qualify the lap that is already underway in this batch.
    if(!s.lapEligible&&lap.endTick===endTick&&crossingLagMs<=this.lapLagMs){
     s.lapEligible=true;s.eligibleFromTick=lap.endTick;
    }
   }
   laps.push(...s.readyLaps.splice(0));
   const reply={sessionId:s.id,seq:data.seq,ackTick:s.ticks,phase:'running',result:message.result,
    wallMs:message.wallMs,serverElapsedMs:this.clock()-s.started,laps,practiceLaps,
    eligibility:{eligible:s.lapEligible,fromTick:s.eligibleFromTick,lap:message.result.lap,lagMs:Math.max(0,arrivalLagMs)}};
   this.metrics.batches++;this.metrics.ticks+=data.inputs.length;this.metrics.verifiedLaps+=message.deferred?0:laps.length;this.countMetric('practiceLaps',practiceLaps.length);
   this.observe('batchResponseMs',performance.now()-processingStart);this.observe('arrivalLagMs',Math.max(0,arrivalLagMs));
   this.observe('ackLagMs',Math.max(0,this.clock()-s.started-endTick*1000/hz));
   s.receipts.set(data.seq,{digest,reply});
   return reply;
  }catch(error){this.invalidate(s,error.code||'physics');throw error;}
 }
 workerLost(id){
  const s=this.sessions.get(id);if(!s)return;
  // Completed artifacts already being signed survive; unfinished documents in a
  // dead worker cannot be reconstructed from client state or given a signature.
  for(const [endTick,r] of s.pendingLaps)if(!r.replayReady){r.resolve();s.pendingLaps.delete(endTick);}
  if(s.slot)this.invalidate(s,'worker_lost');
 }
 async recorded(message){
  const s=this.sessions.get(message.sessionId),r=s?.pendingLaps.get(message.endTick);
  if(!r)return;
  r.replayReady=true;
  try{
   if(message.error)throw Error(message.error);
   this.observe('replayPackMs',message.replayMs);this.observe('replayQueueMs',message.replayQueueMs);
   if(r.eligible){
    const {lap}=r,replay=message.replay;
    const value={lap,receipt:await this.signLap(s,{...lap,...(replay?{replayHash:replay.hash}:{})}),...(replay?{replay:replay.payload}:{})};
    s.retainedAt=this.clock();s.completedLaps.set(lap.endTick,value);s.readyLaps.push(value);this.metrics.verifiedLaps++;
   }
  }catch(error){s.replayError=fail(422,'replay','Replay recording failed');}
  finally{s.pendingLaps.delete(message.endTick);r.resolve();}
  if(s.replayError&&s.slot)this.invalidate(s,'replay');
 }
 async laps(id,token){
  const s=this.owned(id,token);
  // Await only boundaries already accepted at request arrival; never wait for
  // future driving. Reads and retries retain all completed receipts unchanged.
  await Promise.all([...s.pendingLaps.values()].map(r=>r.done));
  if(s.replayError&&!s.completedLaps.size)throw s.replayError;
  return {laps:[...s.completedLaps.values()].sort((a,b)=>a.lap.endTick-b.lap.endTick)};
 }
 watchId(s){
  // Opaque, server-local identity keeps successive verified sessions linkable
  // without exposing the private account hash or session credential.
  return createHash('sha256').update(this.spectatorSalt).update(String(s.identity.playerHash||s.id)).digest('hex').slice(0,32);
 }
 spectators(id){
  this.sweep();
  const active=[...this.sessions.values()].filter(s=>s.slot&&s.phase==='running'&&s.live);
  if(!id)return {results:active.map(s=>({id:s.id,watchId:this.watchId(s),nickname:s.identity.nickname,tick:s.ticks})),revision};
  const s=active.find(s=>s.id===id);
  if(!s)throw fail(410,'session_closed','Driving session has ended');
  return {format:'lpr-live-v1',sceneRevision:revision,hz,lap:s.receipts.get(s.nextSeq-1)?.reply.result.lap||1,
   nickname:s.identity.nickname,watchId:this.watchId(s),track:s.live.track,frames:s.live.frames,inputs:s.live.inputs,
   lapStates:s.live.lapStates,bestLapMs:s.live.bestLapMs};
 }
 release(s){s.slot=false;void this.pool.release(s.id,Promise.all([...s.pendingLaps.values()].map(r=>r.done)));}
 invalidate(s,reason){if(s.slot){if(reason==='budget')this.countMetric('processingTimeouts');if(reason==='lag')this.countMetric('lagTerminations');}s.phase='invalid';s.reason=reason;this.release(s);}
 cancel(id,token){const s=this.owned(id,token);this.invalidate(s,'cancelled');return {cancelled:true};}
 sweep(){const now=this.clock();for(const [id,s] of this.sessions){
  if(s.slot&&((s.phase!=='starting'&&now-s.lastAccepted>this.idleMs)||now-s.created>this.ttlMs))this.invalidate(s,'expired');
  if(!s.slot&&!s.pendingLaps.size&&now-Math.max(s.lastAccepted,s.retainedAt||0)>120000)this.sessions.delete(id);
 }}
 async close(){this.closed=true;clearInterval(this.timer);for(const s of this.sessions.values())this.invalidate(s,'shutdown');await this.pool.close();for(const s of this.sessions.values())for(const r of s.pendingLaps.values())r.resolve();this.sessions.clear();}
}
module.exports={Sessions};
