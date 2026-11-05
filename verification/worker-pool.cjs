const {Worker}=require('node:worker_threads');
const path=require('node:path');
const fail=(status,code,message)=>Object.assign(Error(message),{status,code});
class VerificationPool {
 constructor({workerCount=1,workerHeapMb=256,onLost=()=>{},onReplay=()=>{},workerPath=path.join(__dirname,'pool-worker.cjs')}={}){
  if(!Number.isSafeInteger(workerCount)||workerCount<1||workerCount>16)throw Error('Worker count must be an integer from 1 to 16');
  if(!Number.isSafeInteger(workerHeapMb)||workerHeapMb<64||workerHeapMb>2048)throw Error('Worker heap must be an integer from 64 to 2048 MiB');
  Object.assign(this,{workerCount,workerHeapMb,onLost,onReplay,workerPath});this.entries=new Set();this.owners=new Map();this.pending=new Map();this.drops=new Map();this.nextId=0;this.closed=false;this.recordings=new Map();
 }
 spawn(){
  const worker=new Worker(this.workerPath,{resourceLimits:{maxOldGenerationSizeMb:this.workerHeapMb}});
  const entry={worker,owners:new Set(),ready:false,dead:false};this.entries.add(entry);
  worker.on('message',message=>{
   if(message.ready){entry.ready=true;return;}
   if(message.packed){
    const key=message.sessionId+':'+message.endTick,record=this.recordings.get(key);
    if(!record||record.entry!==entry)return;
    clearTimeout(record.timer);this.recordings.delete(key);this.onReplay(message);return;
   }
   const pending=this.pending.get(message.requestId);
   if(!pending||pending.entry!==entry)return;
   this.pending.delete(message.requestId);clearTimeout(pending.timer);
   if(message.deferred)for(const lap of message.laps||[]){
    const key=pending.sessionId+':'+lap.endTick;
    const timer=setTimeout(()=>{void entry.worker.terminate();},10000);
    this.recordings.set(key,{entry,sessionId:pending.sessionId,timer});
   }
   message.error?pending.reject(fail(message.status||422,message.code||'physics',message.error)):pending.resolve(message);
  });
  const lost=()=>{
   if(entry.dead)return;entry.dead=true;this.entries.delete(entry);
   const ids=[...entry.owners];entry.owners.clear();for(const id of ids)this.owners.delete(id);
   for(const [id,p] of this.pending)if(p.entry===entry){this.pending.delete(id);clearTimeout(p.timer);p.reject(fail(410,'worker_lost','Verification worker stopped'));}
   for(const [key,r] of this.recordings)if(r.entry===entry){clearTimeout(r.timer);this.recordings.delete(key);}
   for(const id of ids)this.onLost(id);
   void worker.terminate();
  };
  worker.once('error',lost);worker.once('exit',lost);return entry;
 }
 request(entry,kind,sessionId,data={},timeoutMs=10000){
  if(this.closed||entry.dead)return Promise.reject(fail(410,'worker_lost','Verification worker stopped'));
  return new Promise((resolve,reject)=>{
   const requestId=++this.nextId,timer=setTimeout(()=>{
    this.pending.delete(requestId);reject(fail(504,'budget','Verification request exceeded its time budget'));
    // An unresponsive worker may still hold a cancelled world. Kill it so memory
    // cannot accumulate behind timed-out cleanup or initialization requests.
    void entry.worker.terminate();
   },timeoutMs);
   this.pending.set(requestId,{entry,sessionId,resolve,reject,timer});
   try{entry.worker.postMessage({requestId,kind,sessionId,...data});}
   catch(error){clearTimeout(timer);this.pending.delete(requestId);reject(fail(410,'worker_lost','Verification worker stopped'));void entry.worker.terminate();}
  });
 }
 async create(sessionId){
  // Await actual worker acknowledgements before reusing slots freed by cancellation.
  await this.drain();
  if(this.closed)throw fail(410,'worker_lost','Verification pool closed');
  let entry=[...this.entries].sort((a,b)=>a.owners.size-b.owners.size)[0];
  if(!entry||(entry.owners.size>0&&this.entries.size<this.workerCount))entry=this.spawn();
  entry.owners.add(sessionId);this.owners.set(sessionId,entry);
  return this.request(entry,'create',sessionId,{},20000);
 }
 inputs(sessionId,inputs){
  const entry=this.owners.get(sessionId);
  if(!entry)return Promise.reject(fail(410,'session_lost','Verification session stopped'));
  return this.request(entry,'inputs',sessionId,{inputs});
 }
 release(sessionId,beforeDrop=Promise.resolve()){
  if(this.drops.has(sessionId))return this.drops.get(sessionId);
  const entry=this.owners.get(sessionId);if(!entry)return Promise.resolve();
  for(const [id,p] of this.pending)if(p.sessionId===sessionId){
   this.pending.delete(id);clearTimeout(p.timer);p.reject(fail(410,'session_closed','Verification session closed'));
  }
  const done=beforeDrop.then(()=>this.request(entry,'drop',sessionId,{},5000)).catch(()=>{}).finally(()=>{
   if(this.owners.get(sessionId)===entry)this.owners.delete(sessionId);
   entry.owners.delete(sessionId);this.drops.delete(sessionId);
   for(const [key,r] of this.recordings)if(r.sessionId===sessionId){clearTimeout(r.timer);this.recordings.delete(key);}
  });
  this.drops.set(sessionId,done);return done;
 }
 async drain(){await Promise.all([...this.drops.values()]);}
 snapshot(){return {mode:'pooled',limit:this.workerCount,workers:this.entries.size,readyWorkers:[...this.entries].filter(e=>e.ready).length,
  sessions:this.owners.size,pendingRequests:this.pending.size,closingSessions:this.drops.size,pendingRecordings:this.recordings.size,workerHeapMb:this.workerHeapMb};}
 async inspect(){return Promise.all([...this.entries].map(entry=>this.request(entry,'stats',undefined)));}
 close(){
  if(this.closing)return this.closing;this.closed=true;
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(fail(410,'session_closed','Verification pool closed'));}this.pending.clear();
  const entries=[...this.entries];for(const entry of entries)entry.dead=true;
  for(const r of this.recordings.values())clearTimeout(r.timer);this.recordings.clear();
  this.entries.clear();this.owners.clear();this.drops.clear();
  this.closing=Promise.all(entries.map(e=>e.worker.terminate())).then(()=>{});return this.closing;
 }
}
module.exports={VerificationPool};
