// In-memory experimental sessions. Restart/timeout loses verification, never approves it.
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {revision,hz}=require('../scripts/lib/replay-probe.cjs');
const fail=(status,code,message,extra={})=>Object.assign(Error(message),{status,code,...extra});
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
class Sessions {
 constructor({clock=()=>performance.now(),maxSessions=2,leadMs=250,lagMs=8000,idleMs=15000,ttlMs=260000}={}){
  Object.assign(this,{clock,maxSessions,leadMs,lagMs,idleMs,ttlMs});this.sessions=new Map();this.creations=[];
  this.timer=setInterval(()=>this.sweep(),1000);this.timer.unref();
 }
 get activeCount(){return [...this.sessions.values()].filter(s=>s.slot).length;}
 async create(version){
  this.sweep();
  if(version!==revision)throw fail(409,'revision','Simulation revision changed');
  if(this.activeCount>=this.maxSessions)throw fail(429,'capacity','Two verified sessions are already active');
  const now=this.clock();this.creations=this.creations.filter(t=>now-t<60000);
  if(this.creations.length>=8)throw fail(429,'rate_limit','Too many session starts');
  this.creations.push(now);
  // Bound completed receipt caches even when starts fail or clients disappear.
  for(const [id,s] of this.sessions){if(!s.slot&&this.sessions.size>=8)this.sessions.delete(id);}
  const id=randomBytes(16).toString('hex'),token=randomBytes(32).toString('hex');
  const s={id,token,phase:'starting',slot:true,nextSeq:0,ticks:0,receipts:new Map(),lastAccepted:now,created:now,failures:0};
  this.sessions.set(id,s);
  try{
   const initial=await this.spawn(s);
   s.started=this.clock();s.lastAccepted=s.started;s.phase='running';
   return {id,sessionToken:token,revision,hz,initial:initial.result,maxBatchTicks:120,sendEveryTicks:60,leadMs:this.leadMs,lagMs:this.lagMs};
  }catch(error){this.invalidate(s,'initialization');throw error;}
 }
 spawn(s){
  s.worker=new Worker(path.join(__dirname,'session-worker.cjs'),{resourceLimits:{maxOldGenerationSizeMb:128}});
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(fail(503,'initialization','Session initialization timed out')),20000);
   s.initReject=reject;
   s.worker.on('message',message=>{
    if(message.ready){clearTimeout(timer);s.initReject=null;resolve(message);return;}
    const pending=s.pending;
    if(pending&&pending.id===message.id){s.pending=null;clearTimeout(pending.timer);message.error?pending.reject(fail(422,'physics',message.error)):pending.resolve(message);}
   });
   const lost=()=>{clearTimeout(timer);const error=fail(410,'worker_lost','Verification worker stopped');s.initReject?.(error);s.pending?.reject(error);if(s.pending)clearTimeout(s.pending.timer);s.pending=null;
    if(s.phase==='running'||s.phase==='starting')this.invalidate(s,'worker_lost');};
   s.worker.once('error',lost);s.worker.once('exit',lost);
  });
 }
 owned(id,token){
  this.sweep();const s=this.sessions.get(id);
  if(!s)throw fail(410,'session_lost','Session expired or server restarted; continue in practice mode');
  if(!equal(token,s.token))throw fail(401,'owner','Invalid session credential');
  return s;
 }
 async batch(id,token,data){
  const s=this.owned(id,token);
  if(data?.revision!==revision)throw fail(409,'revision','Simulation revision changed');
  if(!Number.isSafeInteger(data.seq)||data.seq<0||data.seq>=480||!Number.isSafeInteger(data.fromTick)||data.fromTick<0||
    !Array.isArray(data.inputs)||data.inputs.length<1||data.inputs.length>120||data.inputs.some(a=>!Array.isArray(a)||a.length!==3||!a.every(Number.isFinite)||a[0]<0||a[0]>1||a[1]<0||a[1]>1||Math.abs(a[2])>1))
   throw fail(400,'batch','Invalid input batch');
  const digest=createHash('sha256').update(JSON.stringify([data.seq,data.fromTick,data.inputs])).digest('hex');
  const receipt=s.receipts.get(data.seq);
  if(receipt){if(receipt.digest!==digest)throw fail(409,'conflict','Acknowledged input cannot be changed');return receipt.reply;}
  if(s.phase!=='running')throw fail(410,'session_closed','Session is no longer running');
  if(s.inflight){if(s.inflight.seq===data.seq&&s.inflight.digest===digest)return s.inflight.promise;throw fail(409,'busy','Previous batch is still being verified',{retryable:true});}
  if(data.seq!==s.nextSeq||data.fromTick!==s.ticks)throw fail(409,'sequence','Input sequence or starting tick is not contiguous');
  const endTick=s.ticks+data.inputs.length;
  if(endTick>hz*240)throw fail(400,'duration','Session input limit exceeded');
  const elapsed=this.clock()-s.started,simMs=endTick*1000/hz;
  if(simMs>elapsed+this.leadMs){
   if(++s.failures>8)this.invalidate(s,'future_input');
   throw fail(425,'future','Inputs extend beyond server time',{retryable:s.phase==='running',retryAfterMs:Math.ceil(simMs-elapsed-this.leadMs)});
  }
  // Do not allow an attacker to wait and then upload an unbounded old replay.
  if(elapsed-s.ticks*1000/hz>this.lagMs){this.invalidate(s,'lag');throw fail(410,'lag','Verification fell too far behind; continue in practice mode');}
  const promise=this.process(s,data,digest,endTick);s.inflight={seq:data.seq,digest,promise};
  try{return await promise;}finally{s.inflight=null;}
 }
 async process(s,data,digest,endTick){
  try{
   const message=await new Promise((resolve,reject)=>{
    const id=data.seq,timer=setTimeout(()=>reject(fail(504,'budget','Input verification exceeded its time budget')),10000);
    s.pending={id,resolve,reject,timer};s.worker.postMessage({id,inputs:data.inputs});
   });
   if(s.phase!=='running')throw fail(410,'session_closed','Session was interrupted');
   if(message.result.crashed)throw fail(422,'crashed','Car crashed; session is not a verified lap');
   if(message.result.ticks!==endTick)throw fail(422,'ticks','Simulation tick mismatch');
   s.ticks=endTick;s.nextSeq++;s.lastAccepted=this.clock();
   const reply={sessionId:s.id,seq:data.seq,ackTick:s.ticks,phase:message.result.finished?'finished':'running',result:message.result,
    wallMs:message.wallMs,cpuMs:message.cpuMs,serverElapsedMs:this.clock()-s.started,verified:message.result.finished,experiment:true,leaderboardSaved:false};
   s.receipts.set(data.seq,{digest,reply});
   if(message.result.finished){s.phase='finished';this.release(s);}
   return reply;
  }catch(error){this.invalidate(s,error.code||'physics');throw error;}
 }
 release(s){s.slot=false;if(s.pending){clearTimeout(s.pending.timer);s.pending.reject(fail(410,'session_closed','Session closed'));s.pending=null;}
  if(s.worker){const worker=s.worker;s.worker=null;void worker.terminate();}}
 invalidate(s,reason){s.phase='invalid';s.reason=reason;this.release(s);}
 cancel(id,token){const s=this.owned(id,token);this.invalidate(s,'cancelled');return {cancelled:true};}
 sweep(){const now=this.clock();for(const [id,s] of this.sessions){
  if(s.slot&&((s.phase!=='starting'&&now-s.lastAccepted>this.idleMs)||now-s.created>this.ttlMs))this.invalidate(s,'expired');
  if(!s.slot&&now-s.lastAccepted>120000)this.sessions.delete(id);
 }}
 async close(){clearInterval(this.timer);const workers=[...this.sessions.values()].map(s=>s.worker).filter(Boolean);for(const s of this.sessions.values())this.invalidate(s,'shutdown');await Promise.all(workers.map(w=>w.terminate()));this.sessions.clear();}
}
module.exports={Sessions};
