// Authoritative per-lap recordings. No client positions or client time claims.
const {gzipSync}=require('node:zlib');
const {createHash}=require('node:crypto');
const {metresPerWorldUnit}=require('../shared/vehicle-spec.js');
const pose=require('../replay-pose.js');
const round=n=>Math.round(n*1e5)/1e5;
class Recorder {
 constructor(world,revision){
  this.revision=revision;
  this.world=world;
  this.track=world.track.map(p=>[round(p.x),round(p.y)]);
  this.reset();
 }
 frame(){const r=this.world.result(),s=r.state;return [r.ticks,round(s.x),round(s.y),round(s.angle),round(s.vx),round(s.vy),pose.capture(this.world.car)];}
 reset(){this.startTick=this.world.result().ticks;this.frames=[this.frame()];this.inputs=[];}
 step(input,event){
  const tick=this.world.result().ticks;
  const last=this.inputs.at(-1);
  if(!last||!input.every((v,i)=>v===last[i+1]))this.inputs.push([tick-1,...input]);
  if(tick%6===0||event.completed)this.frames.push(this.frame());
  if(!event.completed)return null;
  const lap=event.completed;
  const document={format:'lpr-replay-v1',sceneRevision:this.revision,visualState:true,lap:lap.lap,hz:120,sampleHz:20,metresPerWorldUnit,track:this.track,roadHalfWidth:33,
   startTick:this.startTick,endTick:lap.endTick,frames:this.frames,inputs:this.inputs};
  const payload=gzipSync(JSON.stringify(document),{level:6}).toString('base64');
  this.reset();
  if(payload.length>900000)return null; // Bound the artifact independently of lap acceptance.
  return {payload,hash:createHash('sha256').update(payload).digest('hex')};
 }
}
module.exports={Recorder};
