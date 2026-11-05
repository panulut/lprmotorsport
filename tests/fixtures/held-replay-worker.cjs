// Tiny authoritative test world isolates queue/cleanup races from driving time.
// The real two-lap HTTP measurement covers production world/Recorder integration.
const {parentPort}=require('node:worker_threads');
const worldModule=require('../../verification/world.cjs');
worldModule.createWorldFactory=()=>({create(){
 const world={ticks:0,track:[{x:0,y:0},{x:1,y:0}],car:{},
  result(){return {ticks:this.ticks,lap:Math.floor(this.ticks/60)+1,lapStartTick:Math.floor(this.ticks/60)*60,state:{x:0,y:0,angle:0,vx:0,vy:0}};},
  step(input){
   if(input[0]===0.12345){const until=performance.now()+2;while(performance.now()<until){}this.ticks++;return {};}
   this.ticks++;return this.ticks%60?{}:{completed:{lap:this.ticks/60,startTick:this.ticks-60,endTick:this.ticks,lapTicks:60,sectorTicks:[20,20,20]}};}};
 return {world,api:{decode:input=>input}};
}});
const {Recorder}=require('../../verification/replay.cjs'),pack=Recorder.prototype.pack;
let blocked=true,failed=false,release;
Recorder.prototype.pack=async function(document,{signal}={}){
 signal?.throwIfAborted();
 if(blocked)await new Promise((resolve,reject)=>{
  const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};
  release=()=>{signal?.removeEventListener('abort',abort);resolve();};
  signal?.addEventListener('abort',abort,{once:true});
 });
 if(failed)throw Error('Injected packing failure');
 return pack.call(this,document,{signal});
};
parentPort.on('message',message=>{if(message.kind==='unblock-recordings'||message.kind==='fail-recordings'){failed=message.kind==='fail-recordings';blocked=false;release?.();}});
// Replenish sixteen worker-side physics jobs synchronously from each reply.
// There is always another admitted job when the pack scheduler gets a turn.
let flooding=false,nextFloodRequest=-1;
const floodIds=Array.from({length:16},(_,i)=>'flood-'+i),post=parentPort.postMessage.bind(parentPort);
parentPort.postMessage=message=>{
 post(message);
 if(flooding&&message.requestId<0&&message.result){
  const id=floodIds[(-message.requestId-1)%floodIds.length];
  parentPort.emit('message',{kind:'inputs',sessionId:id,requestId:message.requestId,inputs:[[0.12345,0,0,false,false,true]]});
 }
};
parentPort.on('message',message=>{
 if(message.kind==='start-physics-flood'){
  flooding=true;
  for(const id of floodIds)parentPort.emit('message',{kind:'create',sessionId:id,requestId:nextFloodRequest--});
 }
 if(message.kind==='stop-physics-flood'){
  flooding=false;
  for(const id of floodIds)parentPort.emit('message',{kind:'drop',sessionId:id,requestId:nextFloodRequest--});
 }
});
require('../../verification/pool-worker.cjs');
