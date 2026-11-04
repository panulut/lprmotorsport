const fs=require('node:fs'),vm=require('node:vm');
function create(){
  const context={window:{LPRTrackData:JSON.parse(fs.readFileSync("data/track-objects.json","utf8"))}};vm.createContext(context);
  for(const f of ['shared/dmath.js','shared/vehicle-spec-f1.js','campus.js','shared/track-document.js','shared/terrain.js','shared/track-objects.js','shared/collision-index.js','tracks/monaco-reference.js','tracks/monaco.js','vehicle.js','shared/vehicle-f1.js','tracks/monaco-f1-collision.js']){
    vm.runInContext(fs.readFileSync(f,'utf8'),context,{filename:f});
  }
  const w=context.window,d=new w.VehicleDynamics(),s={x:0,y:0,angle:0};d.reset(s);
  return {context,w,d,s};
}
module.exports={create};

// Match game.js grassContact: four SI tyre heights (including existing kerbs),
// smoothed shoulder blend, and the existing terrain's grade in body coordinates.
const contactDistances=new WeakMap();
function sampleRoad(w,d,s){
 const M=w.LPRMath,c=w.LPRCampus,p=d.parameters,scale=1/p.metresPerWorldUnit;
 let distances=contactDistances.get(w);
 if(!distances){distances=[0];c.track.forEach((a,i)=>{const b=c.track[(i+1)%c.track.length];distances.push(distances.at(-1)+M.hypot(b.x-a.x,b.y-a.y));});contactDistances.set(w,distances);}
 const ca=M.cos(s.angle),sa=M.sin(s.angle),heights=[];let grass=0;
 for(const axle of [p.frontAxle,-p.rearAxle])for(const side of [-p.trackWidth/2,p.trackWidth/2]){
  const x=s.x+(axle*ca-side*sa)*scale,y=s.y+(axle*sa+side*ca)*scale;
  const q=c.monaco.mainQuery(x,y),r=c.roadAt(x,y),index=q.segment.index;
  const along=distances[index]+q.t*(distances[index+1]-distances[index]);
  const loop=distances.at(-1),ribAlong=along*(M.round(loop*p.metresPerWorldUnit/.45)*.45)/(loop*p.metresPerWorldUnit);
  heights.push(c.monaco.terrain.heightAt(x,y)*p.metresPerWorldUnit+d.kerbHeight(r.distance,ribAlong,r));
  const blend=w.LPRTrackObjects.onAsphalt(x,y)?0:M.max(0,M.min(1,(r.distance-r.kerbOuter)/(r.shoulderOuter-r.kerbOuter)));
  grass+=blend*blend*(3-2*blend)/4;
 }
 s.roadHeights=heights;const slope=c.monaco.terrain.sample(s.x,s.y);
 s.terrainSlope={forward:slope.dx*ca+slope.dy*sa,right:-slope.dx*sa+slope.dy*ca};
 return grass;
}
module.exports.sampleRoad=sampleRoad;

// IEEE-754 byte representation, with stable object-key order across VM realms.
function binary(value){if(typeof value==='number'){const b=Buffer.alloc(8);b.writeDoubleBE(value);return b.toString('hex');}if(Array.isArray(value))return value.map(binary);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,binary(value[k])]));return value;}
module.exports.binary=binary;
