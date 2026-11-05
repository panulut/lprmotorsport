// Tiny authoritative test world isolates queue/cleanup races from driving time.
// The real two-lap HTTP measurement covers production world/Recorder integration.
const {parentPort}=require('node:worker_threads');
const worldModule=require('../../verification/world.cjs');
worldModule.createWorldFactory=()=>({create(){
 const world={ticks:0,track:[{x:0,y:0},{x:1,y:0}],car:{},
  result(){return {ticks:this.ticks,lap:Math.floor(this.ticks/60)+1,lapStartTick:Math.floor(this.ticks/60)*60,state:{x:0,y:0,angle:0,vx:0,vy:0}};},
  step(){this.ticks++;return this.ticks%60?{}:{completed:{lap:this.ticks/60,startTick:this.ticks-60,endTick:this.ticks,lapTicks:60,sectorTicks:[20,20,20]}};}};
 return {world,api:{decode:input=>input}};
}});
const {Recorder}=require('../../verification/replay.cjs'),pack=Recorder.prototype.pack;
let blocked=true,failed=false,release;
Recorder.prototype.pack=async function(document){
 if(blocked)await new Promise(r=>{release=r;});
 if(failed)throw Error('Injected packing failure');
 return pack.call(this,document);
};
parentPort.on('message',message=>{if(message.kind==='unblock-recordings'||message.kind==='fail-recordings'){failed=message.kind==='fail-recordings';blocked=false;release?.();}});
require('../../verification/pool-worker.cjs');
