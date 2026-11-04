// Monaco F1 cockpit: head movement, road feel and halo layout from the eye.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {create}=require('./helpers-monaco-f1.cjs');

const {context}=create();
const storage=new Map();let storageThrows=false;
context.window.localStorage={getItem:k=>{if(storageThrows)throw new Error('blocked');return storage.has(k)?storage.get(k):null;}};
for(const f of ['shared/people.js','renderer3d.js','tracks/monaco-f1-renderer.js'])vm.runInContext(fs.readFileSync(f,'utf8'),context,{filename:f});
const w=context.window,C=w.LPRF1Cockpit;
assert(C&&typeof C.createCockpitMotion==='function','Cockpit motion is exposed for tests and settings UI');
assert.equal(C.HEAD_KEY,'lpr-monaco-head-movement');assert.equal(C.SHAKE_KEY,'lpr-monaco-camera-shake');

const FRAME=1000/60,HEAD_ONLY={head:1,shake:0},SHAKE_ONLY={head:0,shake:1};
const finiteOut=o=>['yaw','shift','dip'].every(k=>Number.isFinite(o[k]));
// Run a motion for `seconds` with a fixed car; returns the trace of outputs.
function hold(motion,car,seconds,settings,fps=60,start=0){
 const trace=[];const n=Math.round(seconds*fps);
 for(let i=0;i<=n;i++)trace.push({...motion.update(car,start+i*1000/fps,settings)});
 return trace;
}
const last=a=>a[a.length-1];

// ---- 1. Head limits at extreme load ----------------------------------------
{
 const right={lateralG:8,longitudinalG:0,yawRate:4,steerAngle:.52,speed:20,vx:20};
 const o=last(hold(C.createCockpitMotion(),right,4,HEAD_ONLY));
 assert(o.yaw>0&&o.yaw<=C.HEAD.yawMax+1e-12,`yaw into a right-hander, capped: ${o.yaw}`);
 assert(o.yaw*180/Math.PI<=4.05&&o.yaw*180/Math.PI>=3,'yaw max ~3-5°');
 assert(o.shift<0&&o.shift>=-.2-1e-12,`head pushed to the outside (left), ≤2 cm: ${o.shift}`);
 const at5=last(hold(C.createCockpitMotion(),{lateralG:5},4,HEAD_ONLY));
 assert(Math.abs(at5.shift)>=.14&&Math.abs(at5.shift)<=.2,`~1.5-2 cm at 5 g: ${Math.abs(at5.shift)*10} cm`);
 const left=last(hold(C.createCockpitMotion(),{lateralG:-8,yawRate:-4,steerAngle:-.52},4,HEAD_ONLY));
 assert(left.shift>0&&left.yaw<0,'mirrored for a left-hander');
 const brake=last(hold(C.createCockpitMotion(),{longitudinalG:-8},4,HEAD_ONLY));
 assert(brake.dip>0&&brake.dip<=.17+1e-12,`dips under braking, ≤1.7 cm: ${brake.dip}`);
 const b5=last(hold(C.createCockpitMotion(),{longitudinalG:-5},4,HEAD_ONLY));
 assert(b5.dip>=.1&&b5.dip<=.17,'~1-2 cm at 5 g braking');
 const accel=last(hold(C.createCockpitMotion(),{longitudinalG:4},4,HEAD_ONLY));
 assert(accel.dip<0&&accel.dip>=-.08-1e-12,`rises under acceleration, ≤0.8 cm: ${accel.dip}`);
 const old={yaw:.26,shift:.35,dip:.25};
 assert(o.yaw<old.yaw/3&&Math.abs(o.shift)<old.shift&&brake.dip<old.dip,'clearly calmer than before');
 const crashed=last(hold(C.createCockpitMotion(),{...right,crashed:true},2,{head:1,shake:1}));
 assert(Math.abs(crashed.yaw)<1e-6&&Math.abs(crashed.shift)<1e-6,'neutral head after a crash');
 console.log('PASS: head limits at extreme g (yaw ≤4°, shift ≤2 cm, dip ≤1.7/0.8 cm) and corner direction');
}

// ---- 2. Multipliers 0 and 1, and the localStorage path ----------------------
{
 const car={lateralG:4,longitudinalG:-3,yawRate:1,steerAngle:.2,speed:40,vx:40,roadHeights:[0,0,0,0]};
 const zero=hold(C.createCockpitMotion(),car,2,{head:0,shake:0});
 assert(zero.every(o=>o.yaw===0&&o.shift===0&&o.dip===0),'both multipliers 0: camera never moves');
 const full=last(hold(C.createCockpitMotion(),car,2,HEAD_ONLY)),half=last(hold(C.createCockpitMotion(),car,2,{head:.5,shake:0}));
 assert(Math.abs(full.shift)>.1&&Math.abs(half.shift/full.shift-.5)<1e-6,'head strength scales linearly');
 const shakeOff=hold(C.createCockpitMotion(),car,2,{head:0,shake:0}),shakeOn=hold(C.createCockpitMotion(),car,2,SHAKE_ONLY);
 assert(shakeOff.every(o=>o.dip===0)&&shakeOn.some(o=>Math.abs(o.dip)>1e-4),'shake 0 removes vibration, 1 keeps it');
 assert.equal(C.readStrength('missing'),1,'default 1 when unset');
 for(const [raw,want] of [['0',0],['1',1],['0.25',.25],['7',1],['-3',0],['nonsense',1],['',1]]){storage.set('k',raw);assert.equal(C.readStrength('k'),want,raw);}
 storageThrows=true;assert.equal(C.readStrength('k'),1,'storage access throwing falls back to 1');storageThrows=false;
 // Through the renderer hook: reads both keys and refreshes within a second.
 const r=Object.create(w.LPRRenderer3D.prototype);
 storage.set(C.HEAD_KEY,'0');storage.set(C.SHAKE_KEY,'0');
 for(let i=0;i<60;i++){const o=r.cockpitLook(car,i*FRAME);assert(o.yaw===0&&o.shift===0&&o.dip===0);}
 storage.set(C.HEAD_KEY,'1');storage.set(C.SHAKE_KEY,'1');
 let moved=false;for(let i=60;i<180;i++)moved=moved||Math.abs(r.cockpitLook(car,i*FRAME).shift)>.01;
 assert(moved,'slider changes apply without a reload');
 console.log('PASS: multipliers 0/0.5/1, localStorage defaults, clamping, corrupt values, blocked storage and live refresh');
}

// ---- 3. No NaN: dt=0, huge dt, missing fields, garbage ----------------------
{
 const m=C.createCockpitMotion(),car={lateralG:3,longitudinalG:-2,yawRate:.5,speed:50,vx:50,roadHeights:[0,.01,0,.01]};
 const outs=[m.update(car,1000),m.update(car,1000),m.update(car,1000)];      // dt = 0
 outs.push(m.update(car,1e12),m.update(car,1e12+16));                         // huge jump (pause)
 outs.push(m.update(car,5),m.update(car,NaN),m.update(car,undefined),m.update(car,Infinity)); // backwards / invalid time
 outs.push(m.update({},2e12),m.update(undefined,2e12+16),m.update(null,2e12+32));
 outs.push(m.update({lateralG:NaN,longitudinalG:Infinity,yawRate:'x',speed:-Infinity,roadHeights:[NaN,1,2]},2e12+48));
 outs.push(m.update({speed:30,roadHeights:[0,0,0,0],terrainSlope:{forward:NaN}},2e12+64));
 outs.push(m.update({speed:30,vx:30,roadHeights:[5,5,5,5],terrainSlope:{forward:.2}},2e12+80)); // teleport in height
 assert(outs.every(finiteOut),'all outputs finite');
 const bounded=hold(C.createCockpitMotion(),car,1,{head:1,shake:1},60).concat(hold(C.createCockpitMotion(),car,1,{head:1,shake:1},2));
 assert(bounded.every(o=>finiteOut(o)&&Math.abs(o.yaw)<.08&&Math.abs(o.shift)<.3&&Math.abs(o.dip)<.3),'bounded at 60 fps and at 2 fps');
 const snapshot=JSON.stringify(car);m.update(car,2e12+96);assert.equal(JSON.stringify(car),snapshot,'presentation only: car state is never written');
 console.log('PASS: finite and bounded with dt=0, huge dt, invalid time, missing/garbage fields; car state untouched');
}

// ---- 4. Smoothing: critically damped, no overshoot, frame-rate independent --
{
 for(const [key,car,target] of [['shift',{lateralG:5},null],['dip',{longitudinalG:-5},null],['yaw',{yawRate:2,steerAngle:.3},null]]){
  const trace=hold(C.createCockpitMotion(),car,3,HEAD_ONLY,60).map(o=>o[key]);
  const goal=last(trace),sign=Math.sign(goal);
  for(let i=1;i<trace.length;i++){
   assert(sign*trace[i]>=sign*trace[i-1]-1e-12,`${key} rises monotonically (no oscillation)`);
   assert(sign*trace[i]<=sign*goal+1e-9,`${key} never overshoots`);
  }
  const t90=trace.findIndex(v=>sign*v>=.9*sign*goal)/60;
  assert(t90>.05&&t90<.8,`${key} settles like a neck, 90 % in ${t90.toFixed(2)} s`);
  // Frame-rate independence: 30, 60, 120 fps agree at the same instant.
  const at=fps=>hold(C.createCockpitMotion(),car,.3,HEAD_ONLY,fps)[Math.round(.3*fps)][key];
  assert(Math.abs(at(30)-at(120))<1e-9&&Math.abs(at(60)-at(120))<1e-9,`${key} identical at 30/60/120 fps`);
  // Release back to centre, also without overshoot.
  const m=C.createCockpitMotion();hold(m,car,2,HEAD_ONLY);const back=hold(m,{},2,HEAD_ONLY,60,2000).map(o=>o[key]);
  assert(back.every(v=>sign*v>=-1e-12),`${key} returns to centre without crossing`);
 }
 // A pause mid-corner continues smoothly from where it was.
 const m=C.createCockpitMotion();const before=last(hold(m,{lateralG:3},.1,HEAD_ONLY)).shift;
 const after=m.update({lateralG:3},100+60000,HEAD_ONLY).shift;
 assert(Math.abs(after)>=Math.abs(before)&&Math.abs(after)<=.2,'no jump past the target after a long pause');
 console.log('PASS: critically damped neck: monotone, no overshoot, frame-rate independent, safe across pauses');
}

// ---- 5. Vibration: deterministic, zero when stationary, kerbs > smooth -----
{
 // Synthetic lap fragment: accelerate on smooth road, cross a ribbed kerb on
 // the right wheels, a crest, then brake to a stop.
 function sequence(){
  const states=[];let x=0,v=0;
  for(let i=0;i<600;i++){
   v=i<300?Math.min(60,v+.25):Math.max(0,v-.4);x+=v/60;
   const onKerb=i>150&&i<210,rib=onKerb?.045+.012*Math.sign(Math.sin(x/.45*Math.PI)):0;
   const hill=.8*Math.sin(x/40);
   states.push({speed:v,vx:v,vy:0,lateralG:0,longitudinalG:0,yawRate:0,steerAngle:0,
    roadHeights:[hill,hill+rib,hill,hill+rib],terrainSlope:{forward:.8/40*Math.cos(x/40),right:0}});
  }
  return states;
 }
 const run=()=>{const m=C.createCockpitMotion();return sequence().map((s,i)=>({...m.update(s,i*FRAME,SHAKE_ONLY)}));};
 const a=run(),b=run();
 assert.deepEqual(a,b,'identical state sequences give identical shake');
 const src=fs.readFileSync('tracks/monaco-f1-renderer.js','utf8');assert(!/Math\.random/.test(src),'no Math.random');
 const amp=(trace,from,to,k)=>Math.max(...trace.slice(from,to).map(o=>Math.abs(o[k])));
 assert(amp(a,150,210,'dip')>2*amp(a,90,150,'dip'),'kerb clearly stronger than smooth road at similar speed');
 assert(a.every(o=>Math.abs(o.dip)<=.106&&Math.abs(o.shift)<=.04&&Math.abs(o.yaw)<=.0035),'small: ≤~1 cm vertical, ≤4 mm sideways, ≤0.2°');
 // Speed dependence on smooth road.
 const smooth=speed=>{const m=C.createCockpitMotion();return Math.max(...Array.from({length:240},(_,i)=>Math.abs(m.update({speed,vx:speed,roadHeights:[0,0,0,0]},i*FRAME,SHAKE_ONLY).dip)));};
 assert(smooth(10)<smooth(40)&&smooth(40)<smooth(80),'texture vibration grows with speed');
 assert(smooth(80)<=.021,'top-speed road texture stays under ~2 mm');
 // Stationary: nothing, even on a kerb, even with the kerb flag set.
 const still=C.createCockpitMotion();
 const stopped=Array.from({length:300},(_,i)=>({...still.update({speed:0,vx:0,roadHeights:[0,.06,0,.06],kerbFraction:.5,terrainSlope:{forward:.1}},i*FRAME,SHAKE_ONLY)}));
 assert(stopped.every(o=>o.yaw===0&&o.shift===0&&o.dip===0),'zero when stationary');
 const tail=a.slice(-60);assert(tail.every(o=>Math.abs(o.dip)<.002&&Math.abs(o.shift)<1e-9&&Math.abs(o.yaw)<1e-9),'shake dies away after stopping');
 // Crest/compression: a dip in the road presses the head down (low frequency).
 const m=C.createCockpitMotion();let maxDown=0,maxUp=0;
 for(let i=0;i<600;i++){const x=i*50/60,slope=.08*Math.sin(x/25);
  const o=m.update({speed:50,vx:50,roadHeights:[0,0,0,0],terrainSlope:{forward:slope}},i*FRAME,{head:0,shake:1});
  maxDown=Math.max(maxDown,o.dip);maxUp=Math.min(maxUp,o.dip);}
 assert(maxDown>.01&&maxUp<-.01&&maxDown<=.035+.021&&maxUp>=-.035-.021,'crests and compressions move the view by a few mm, both ways');
 console.log('PASS: vibration deterministic, no Math.random, zero when stationary, kerb > smooth, bounded amplitudes, crest motion');
}

// ---- 6. Halo seen from the driver's eye -------------------------------------
{
 const eye=C.halo.eye,pitch=.055,fwd=[Math.cos(pitch),-Math.sin(pitch),0],up=[Math.sin(pitch),Math.cos(pitch),0];
 // Confirm the eye against renderer3d.js: camera = up*(8-centre) - forward*8 + centre height, in units.
 const r3d=fs.readFileSync('renderer3d.js','utf8');
 assert(/value\*\(8-pose\.centreHeight\)-pose\.forward\[i\]\*8/.test(r3d)&&/const pitch = \.055;/.test(r3d),'eye position derived from the current camera code');
 assert.deepEqual([...eye],[-.8,.8,0]);
 const project=(p,fov=60,aspect=16/9)=>{const d=p.map((v,i)=>v-eye[i]),depth=d[0]*fwd[0]+d[1]*fwd[1],f=1/Math.tan(fov*Math.PI/360);
  return {depth,u:d[2]/depth*f/aspect,v:(d[0]*up[0]+d[1]*up[1])/depth*f};};
 const apex=project(C.halo.apex);
 assert(apex.u===0&&apex.v>.55&&apex.v<.8,`hoop apex in the upper part of the view, centred (v=${apex.v.toFixed(2)})`);
 const edge=C.halo.curve.map(p=>project(p)).find(p=>p.v>=1);
 assert(edge&&edge.u>.4&&edge.u<1.1,'hoop reaches the top edge toward the corners');
 for(const front of [true,false]){
  const v=w.LPRF1Mesh.halo(front).vertices;assert(v.length>0&&v.every(Number.isFinite));
  let nearest=Infinity;for(let i=0;i<v.length;i+=6)nearest=Math.min(nearest,Math.hypot(v[i]/10-eye[0],v[i+1]/10-eye[1],v[i+2]/10-eye[2]));
  assert(nearest>.25,`${front?'pillar':'hoop'} nowhere near the camera (${nearest.toFixed(2)} m)`);
  const zs=v.filter((_,i)=>i%6===2);assert(Math.abs(Math.max(...zs)+Math.min(...zs))<1e-6,'symmetric about the centre line');
 }
 const pillarZ=w.LPRF1Mesh.halo(true).vertices.filter((_,i)=>i%6===2);
 assert(Math.max(...pillarZ)/10<=.0251,'pillar (5 cm) narrower than the ~6.5 cm eye spacing');
 const o=C.halo.opacity;
 assert(o.pillar<.06&&o.hoop>.5,'pillar faint, hoop clearly visible');
 // Pillar: 3 nested layers, front+back faces: soft core vs very faint rim.
 const core=1-Math.pow(1-o.pillar,2*C.halo.pillarLayers.length),rim=1-Math.pow(1-o.pillar,2);
 assert(core<.3&&rim<.1&&core>2*rim,`soft pillar shadow: core ${core.toFixed(2)}, rim ${rim.toFixed(2)}`);
 console.log(`PASS: halo from the eye: apex at v=${apex.v.toFixed(2)}, hoop to top edge at u=${edge.u.toFixed(2)}, ≥0.25 m from the eye, soft pillar`);
}
