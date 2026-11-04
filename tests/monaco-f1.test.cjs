const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {create}=require('./helpers-monaco-f1.cjs');
const between=(value,lo,hi,label)=>assert(value>=lo&&value<=hi,`${label}: ${value} outside ${lo}–${hi}`);
const input={gas:1,brake:0,steer:0,tc:true,abs:true,steeringAssist:true},dt=1/120;
const {d,s}=create();let t100,t200;const gears=new Set();
for(let tick=1;tick<=120*60;tick++){
 d.step(s,input,dt,0);gears.add(s.gear);
 if(!t100&&s.speed>=100/3.6)t100=tick/120;
 if(!t200&&s.speed>=200/3.6)t200=tick/120;
}
between(t100,2.5,3,'0–100 s');between(t200,5,6,'0–200 s');between(s.speed*3.6,280,295,'terminal km/h');assert.equal(gears.size,8);
let braking;
function stop(abs=true){const {d,s}=create();s.vx=200/3.6;let peakG=0,ticks=0;for(;s.vx>.01&&ticks<120*10;ticks++){d.step(s,{gas:0,brake:1,steer:0,abs},dt,0);peakG=Math.max(peakG,-s.longitudinalG);}assert(s.vx<=.01);return {metres:s.x*.1,seconds:ticks/120,peakG};}
braking=stop();between(braking.metres,35,65,'200–0 m');between(braking.peakG,4.5,5.5,'peak braking g');assert(stop(false).metres>braking.metres*1.1,'Disabling ABS permits locking and lengthens stop');
// Constant-speed corner rig: only longitudinal speed is held externally; lateral
// velocity, yaw and tyre forces settle freely. No pose or yaw is imposed.
const corner=[];
for(const [kmh,lo,hi] of [[60,2,2.5],[240,4,5]]){
 const {d,s}=create();s.vx=kmh/3.6;let sum=0;
 for(let tick=0;tick<2400;tick++){d.step(s,{gas:0,brake:0,steer:1},dt,0);s.vx=kmh/3.6;if(tick>=1800)sum+=s.lateralG/600;}
 between(sum,lo,hi,`steady g at ${kmh}`);assert(Math.abs(s.bodySlip)<.1,'Stable corner, not a spinning-car force peak');
 assert(Math.abs(s.vx*s.yawRate/9.81-sum)<.04,'Tyre force g agrees with centripetal g');corner.push({kmh,g:sum});
}
{
 const {d,s,w}=create();s.vx=30;d.stepSuspension(s,dt);const low=s.downforce,capacity=d.capacities(s).reduce((a,b)=>a+b,0);
 s.vx=60;d.stepSuspension(s,dt);assert.equal(s.downforce,low*4);assert.equal(s.frontAeroLoad,s.downforce*.46);
 assert(d.capacities(s).reduce((a,b)=>a+b,0)>capacity,'Downforce increases tyre capacity');
 const loads=s.suspension.wheels;loads.forEach(t=>t.load=1962);const nominal=d.capacities(s).reduce((a,b)=>a+b,0);
 loads.forEach(t=>t.load*=2);const doubled=d.capacities(s).reduce((a,b)=>a+b,0);assert(doubled>nominal&&doubled<nominal*2,'Load-sensitive tyres are sublinear');
 assert(w.LPRVehicleSpec.wheelbase/Math.tan(w.LPRVehicleSpec.maxRoadWheelAngle)<6,'Hairpin geometric turn radius');
}
// Whole route and pit sweeps use the actual F1 hull, not its centre point/circle.
{
 const {w}=create(),c=w.LPRCampus,M=w.LPRMath,t=c.track;
 for(const [route,closed,offsets] of [[t,true,[0]],[c.monaco.pit,false,[-8,0,8]]])for(let i=0;i<route.length-(closed?0:1);i++){
  const a=route[i],b=route[(i+1)%route.length],angle=M.atan2(b.y-a.y,b.x-a.x);
  for(const offset of offsets){const shift=p=>({x:p.x-M.sin(angle)*offset,y:p.y+M.cos(angle)*offset});assert(!c.resolveObstacleCollision({...shift(b),angle,vx:0,vy:0},{...shift(a),angle}),`F1 sweep ${i}/${offset}`);}
 }
 const gate=c.finishGate,a={x:gate.x,y:gate.y,angle:M.atan2(gate.tangentY,gate.tangentX)};
 const b={...a,x:a.x+gate.normalX*100,y:a.y+gate.normalY*100,vx:20,vy:0};
 assert(c.resolveObstacleCollision(b,a),'F1 hull collides when leaving road');
 const parts=c.carCollisionParts({steerAngle:0}).flat();between((Math.max(...parts.map(p=>p[0]))-Math.min(...parts.map(p=>p[0])))*.1,5.199,5.201,'hull length m');
}
// Every numeric state value is compared by IEEE-754 bytes, including suspension.
function binary(value){if(typeof value==='number'){const b=Buffer.alloc(8);b.writeDoubleBE(value);return b.toString('hex');}if(Array.isArray(value))return value.map(binary);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,binary(value[k])]));return value;}
{
 const a=create(),b=create();let seed=12345;
 // The F1 solver must never accidentally use native transcendentals.
 vm.runInContext(`Math=new Proxy(Math,{get:(t,k)=>['sin','cos','tan','atan','atan2','exp','pow','tanh','hypot'].includes(k)?()=>{throw Error('native '+k)}:t[k]})`,b.context);
 for(let tick=0;tick<120*30;tick++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const i={gas:(seed&255)/255,brake:tick%700>600?.7:0,steer:Math.sin(tick/170)*.3,analog:true,tc:tick%900<600,abs:tick%800<400,steeringAssist:tick%600<400};
  a.d.step(a.s,i,dt,0);b.d.step(b.s,i,dt,0);assert.equal(JSON.stringify(binary(a.s)),JSON.stringify(binary(b.s)),`bit-identical tick ${tick}`);
 }
}
assert.equal(require('../verification/world.cjs').revision,'3c5237068fcb1c7490b265c20f496b5bd0141815d542a7274518df534ed02346','Skinnarila authoritative revision must remain unchanged');
const metrics={t100,t200,terminalKmh:s.speed*3.6,braking,corner};
console.log('PASS: F1 acceleration/gears, speed, braking/ABS, steady corners, aero/load sensitivity, main/pit hull and bit-identical deterministic state',JSON.stringify(metrics));
module.exports={metrics,binary};
