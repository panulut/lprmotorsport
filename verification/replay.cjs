// Authoritative per-lap recordings. No client positions or client time claims.
const {gzip}=require('node:zlib');
const {promisify}=require('node:util');
const compress=promisify(gzip);
const {createHash}=require('node:crypto');
const {metresPerWorldUnit}=require('../shared/vehicle-spec.js');
const pose=require('../replay-pose.js');
const round=n=>Math.round(n*1e5)/1e5;
class Recorder {
 constructor(world,revision,{deferPacking=false}={}){
  this.deferPacking=deferPacking;
  this.revision=revision;
  this.world=world;
  this.track=world.track.map(p=>[round(p.x),round(p.y)]);
  this.reset();
 }
 frame(){const r=this.world.result(),s=r.state;return [r.ticks,round(s.x),round(s.y),round(s.angle),round(s.vx),round(s.vy),pose.capture(this.world.car)];}
 reset(){this.startTick=this.world.ticks;this.frames=[this.frame()];this.inputs=[];this.warmupInputs=[];}
 step(input,event){
  const tick=this.world.ticks;
  const last=this.inputs.at(-1);
  const changed=!last||!input.every((v,i)=>v===last[i+1]);
  if(event.started){
   if(changed)this.inputs.push([tick-1,...input]);
   const warmupInputs=this.inputs;this.reset();this.warmupInputs=warmupInputs;return null;
  }
  if(changed)this.inputs.push([tick-1,...input]);
  if(tick%6===0||event.completed)this.frames.push(this.frame());
  if(!event.completed)return null;
  const lap=event.completed;
  const document={format:'lpr-replay-v1',sceneRevision:this.revision,visualState:true,lap:lap.lap,hz:120,sampleHz:20,metresPerWorldUnit,track:this.track,roadHalfWidth:33,
   startTick:this.startTick,endTick:lap.endTick,frames:this.frames,inputs:this.inputs,
   ...(this.warmupInputs.length?{warmupInputs:this.warmupInputs}:{})};
  this.reset();
  return this.deferPacking?document:this.pack(document);
 }
 async pack(document){
  // Called only by the background scheduler in the pooled executor.
  const json=JSON.stringify(document);document=null;
  const payload=(await compress(json,{level:1})).toString('base64');
  if(payload.length>900000)return null; // Bound the artifact independently of lap acceptance.
  return {payload,hash:createHash('sha256').update(payload).digest('hex')};
 }
}
module.exports={Recorder};
