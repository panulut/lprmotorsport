const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {create,sampleRoad,binary}=require('./helpers-monaco-f1.cjs');
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
// Trail braking with every aid on must not spin the car, even at full keyboard lock.
for(const steer of [.3,1]){const {d,s}=create();s.vx=250/3.6;let peak=0;
 for(let tick=0;tick<1200&&s.vx>8;tick++){d.step(s,{gas:0,brake:1,steer,tc:true,abs:true,steeringAssist:true},dt,0);peak=Math.max(peak,Math.abs(s.bodySlip));}
 assert(peak<.3,`Braking at steer ${steer} keeps the rear: ${(peak*180/Math.PI).toFixed(1)}° body slip`);}
// Keyboard steering builds progressively: a 60 ms tap is a small correction,
// lock builds more slowly at speed, and reversing unwinds through centre first.
{
 const hold=(kmh,ticks)=>{const {d,s}=create();s.vx=kmh/3.6;for(let t=0;t<ticks;t++){d.step(s,{gas:0,brake:0,steer:1,tc:true,abs:true,steeringAssist:true},dt,0);s.vx=kmh/3.6;}return {d,s};};
 const tap=hold(150,7).s;assert(tap.steer>0&&tap.steer<.2,`Tap steer ${tap.steer}`);
 assert(hold(250,24).s.steer<hold(80,24).s.steer,'Lock builds more slowly at speed');
 const {d,s}=hold(120,120);assert.equal(s.steer,1);d.step(s,{gas:0,brake:0,steer:-1},dt,0);assert(s.steer>0,'Reversal first unwinds toward centre');
}
// Keyboard release/reversal: no feedback-induced opposite-lock kick or weave.
for(const kmh of [40,150,250]){
 const {d,s}=create();
 for(let tick=0;tick<120;tick++){s.vx=kmh/3.6;d.step(s,{steer:1},dt);}
 let previous=s.steerAngle;
 for(let tick=0;tick<120;tick++){
  s.vx=kmh/3.6;d.step(s,{steer:0},dt);
  assert(s.steer>=0&&s.steerAngle>=0,'Release never crosses centre');
  assert(s.steerAngle<=previous+1e-5,'Release unwinds monotonically');previous=s.steerAngle;
 }
 assert(s.steerAngle<1e-7,'Rack settles at centre');
}
{
 const {d,s}=create();let lockTick;
 for(let tick=1;tick<=60;tick++){s.vx=25/3.6;d.step(s,{steer:1},dt);if(!lockTick&&s.steerAngle>d.parameters.maxRoadWheelAngle*.95)lockTick=tick;}
 assert(lockTick&&lockTick/120<.4,'95% hairpin lock in under 400 ms');
 // Fast alternating taps should settle without a growing yaw oscillation.
 const fast=create();fast.s.vx=250/3.6;let peak=0;
 for(let tick=0;tick<360;tick++){
  const phase=tick%72,steer=phase<7?(tick<180?1:-1):0;
  fast.d.step(fast.s,{steer,gas:.2},dt);peak=Math.max(peak,Math.abs(fast.s.yawRate));
 }
 assert(peak<.06,'High-speed taps stay small');assert(Math.abs(fast.s.yawRate)<.001,'Tap train settles');
}
// The existing analog contract bypasses the keyboard demand curve, including
// fractional/reversed steering and independent fractional gas/brake values.
{
 const a=create(),b=create();a.s.vx=30;b.s.vx=30;
 for(let tick=0;tick<120;tick++)for(const rig of [a,b])rig.d.step(rig.s,{analog:true,wheel:true,steer:rig===a?.25:-.25,gas:.37,brake:.08},dt);
 assert(Math.abs(a.s.steerAngle-a.d.parameters.maxRoadWheelAngle*.25)<1e-8);
 assert(Math.abs(a.s.steerAngle+b.s.steerAngle)<1e-12);assert(Math.abs(a.s.yawRate+b.s.yawRate)<1e-12);
 const old=a.s.steerAngle;for(let tick=0;tick<30;tick++)a.d.step(a.s,{analog:true,wheel:true,steer:-.25,gas:.37},dt);
 assert(old>0&&a.s.steerAngle<0,'Analog path can cross centre directly');
}
// Identical settled slow corner, then a full-throttle keyboard exit. Measure
// rear axle slip rather than body slip (which includes geometric sideslip).
function exit(tc,catchSlide=false){
 const {d,s}=create();
 for(let tick=0;tick<480;tick++){s.vx=60/3.6;d.step(s,{gas:0,steer:1,tc},dt);}
 let rearSlip=0,slipIntegral=0,peakRearAlpha=0,peakYawStep=0,minTorque=1,active=0,previousYaw=s.yawRate;
 for(let tick=0;tick<180;tick++){
  const correcting=catchSlide&&tick>=24;
  d.step(s,{gas:correcting?0:1,steer:correcting?(tick<40?-1:0):1,tc},dt);
  const rearAlpha=Math.abs(Math.atan2(s.vy-d.parameters.rearAxle*s.yawRate,s.vx));
  rearSlip=Math.max(rearSlip,s.rearSlip);slipIntegral+=rearAlpha*dt;peakRearAlpha=Math.max(peakRearAlpha,rearAlpha);
  peakYawStep=Math.max(peakYawStep,Math.abs(s.yawRate-previousYaw));previousYaw=s.yawRate;
  minTorque=Math.min(minTorque,s.torqueScale);active+=s.tcActive;
 }
 return {rearSlip,slipIntegral,peakRearAlpha,peakYawStep,minTorque,active,finalBodySlip:s.bodySlip,finalYaw:s.yawRate};
}
const exitOn=exit(true),exitOff=exit(false),caught=exit(false,true);
assert(exitOn.active>=10&&exitOn.minTorque<.7,'TC visibly limits corner-exit torque');
assert(exitOn.rearSlip>0&&exitOn.rearSlip<.08,'TC retains modest rear work');
assert(exitOff.rearSlip>exitOn.rearSlip*5&&exitOff.slipIntegral>exitOn.slipIntegral*1.05,'TC off permits progressively more rear slip');
assert(exitOff.peakRearAlpha<.2&&exitOff.peakYawStep<.08,'No instant rear snap');
assert(Math.abs(caught.finalBodySlip)<.01&&Math.abs(caught.finalYaw)<.02,'Lift and a short opposite-key correction catch the slide');
// A gentle lift tightens the line; braking transfers load forward and increases
// turn-in response even against a rig with the same deceleration but zero CG.
function transfer(mode){
 const {d,s}=create();
 for(let tick=0;tick<360;tick++){s.vx=80/3.6;d.step(s,{steer:.6,gas:.2,analog:true},dt);}
 if(mode==='no-transfer')d.parameters.centreOfMassHeight=0;
 for(let tick=0;tick<24;tick++)d.step(s,{steer:.6,gas:mode==='hold'?.2:0,brake:mode==='trail'||mode==='no-transfer'?.1:0,analog:true},dt);
 return {curvature:s.yawRate/s.vx,frontLoad:s.suspension.wheels[0].load+s.suspension.wheels[1].load};
}
const held=transfer('hold'),lifted=transfer('lift'),trail=transfer('trail'),noTransfer=transfer('no-transfer');
assert(lifted.curvature>held.curvature*1.02&&lifted.curvature<held.curvature*1.15,'Lift tightens the line modestly');
assert(trail.frontLoad>lifted.frontLoad&&trail.curvature>noTransfer.curvature*1.005,'Front loading aids turn-in');
// Without ABS the fronts lock first and the path pushes wide.
function lockedTurn(abs){
 const {d,s}=create();s.vx=100/3.6;let frontLocks=0,rearLocks=0,firstFront=Infinity,firstRear=Infinity;
 for(let tick=0;tick<36;tick++){d.step(s,{brake:.5,steer:.5,abs,analog:true},dt);frontLocks+=s.frontLocked;rearLocks+=s.rearLocked;if(s.frontLocked)firstFront=Math.min(firstFront,tick);if(s.rearLocked)firstRear=Math.min(firstRear,tick);}
 return {angle:s.angle,frontLocks,rearLocks,firstFront,firstRear};
}
const absTurn=lockedTurn(true),locked=lockedTurn(false);
assert(locked.frontLocks>0&&locked.firstFront<locked.firstRear,'Fronts lock first under heavy braking');assert.equal(absTurn.frontLocks,0);
assert(locked.angle<absTurn.angle*.8,'Locked fronts push wide');
// Smooth grades do not invent bumps. Crests unload, compressions load, and
// individual height changes alter contact loads without changing total weight.
{
 const {d,s}=create();s.vx=40;s.roadHeights=[1,1,1,1];s.terrainSlope={forward:.05,right:0};
 d.step(s,{gas:.2},dt);assert.equal(s.roadLoadScale,1,'No first-sample impulse');
 for(let tick=0;tick<60;tick++){s.roadHeights=s.roadHeights.map(h=>h+.01);d.step(s,{gas:.2},dt);}
 assert.equal(s.roadLoadScale,1,'Constant grade keeps nominal normal load');
 for(let tick=0;tick<24;tick++){s.terrainSlope.forward-=.001;d.step(s,{gas:.2},dt);}
 assert(s.roadLoadScale<.98&&s.roadLoadScale>.86,'Crest unloads modestly');
 for(let tick=0;tick<60;tick++){s.terrainSlope.forward+=.002;d.step(s,{gas:.2},dt);}
 assert(s.roadLoadScale>1.02&&s.roadLoadScale<1.14,'Compression loads modestly');
 s.roadHeights[0]+=.03;d.step(s,{gas:.2},dt);
 assert(s.roadContactLoads[0]>0&&s.roadContactLoads[1]<0,'Individual bump changes tyre loads');
 assert(Math.abs(s.roadContactLoads.reduce((a,b)=>a+b,0))<1e-8,'Contact redistribution conserves total load');
 const history=JSON.stringify([s.roadLoadHeights,s.roadFilteredSlope,s.roadVerticalAcceleration,s.roadContactLoads]);
 d.stepSuspension(s,dt);d.stepSuspension(s,dt);assert.equal(JSON.stringify([s.roadLoadHeights,s.roadFilteredSlope,s.roadVerticalAcceleration,s.roadContactLoads]),history,'Suspension queries do not advance history');
 s.steerHold=1;d.reset(s);const fresh=create();Object.assign(fresh.s,{x:s.x,y:s.y,angle:s.angle});assert.equal(JSON.stringify(binary(s)),JSON.stringify(binary(fresh.s)),'Reset clears all handling and road history');
}
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
{
 const a=create(),b=create();let seed=12345;
 // The F1 solver must never accidentally use native transcendentals.
 vm.runInContext(`Math=new Proxy(Math,{get:(t,k)=>typeof t[k]==='function'?()=>{throw Error('native '+k)}:t[k]})`,b.context);
 for(let tick=0;tick<120*30;tick++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const analog=tick%480<240;
  const i={gas:(seed&255)/255,brake:tick%700>600?.7:0,steer:analog?Math.sin(tick/170)*.3:tick%120<30?1:tick%120<60?-1:0,analog,wheel:analog&&tick%1000<100,tc:tick%900<600,abs:tick%800<400,steeringAssist:tick%600<400};
  // The same externally sampled road drives both replays, with a real height
  // profile plus deterministic kerb/bump changes to exercise load memory.
  const point=a.w.LPRCampus.track[tick%a.w.LPRCampus.track.length],next=a.w.LPRCampus.track[(tick+1)%a.w.LPRCampus.track.length];
  const sampler={...a.s,x:point.x,y:point.y,angle:Math.atan2(next.y-point.y,next.x-point.x)};
  sampleRoad(a.w,a.d,sampler);
  for(const rig of [a,b]){rig.s.roadHeights=[...sampler.roadHeights];rig.s.terrainSlope={...sampler.terrainSlope};}
  a.d.step(a.s,i,dt,0);b.d.step(b.s,i,dt,0);assert.equal(JSON.stringify(binary(a.s)),JSON.stringify(binary(b.s)),`bit-identical tick ${tick}`);
  // A saved mid-run state contains all solver history; fresh dynamics must
  // resume it without a hidden controller/road-load dependency.
  if(tick===1800){b.d=new b.w.VehicleDynamics();b.s=structuredClone(a.s);}
 }
}
assert.equal(require('../verification/world.cjs').revision,'3c5237068fcb1c7490b265c20f496b5bd0141815d542a7274518df534ed02346','Skinnarila authoritative revision must remain unchanged');
const metrics={t100,t200,terminalKmh:s.speed*3.6,braking,corner,exitOn,exitOff,caught,held,lifted,trail};
console.log('PASS: F1 acceleration/gears, speed, braking/ABS, steady corners, aero/load sensitivity, main/pit hull and bit-identical deterministic state',JSON.stringify(metrics));
module.exports={metrics,binary};
