/* Independent, unbranded LPR F1 mesh. Geometry uses SI dimensions then converts
   to the existing renderer's world units. Skinnarila never loads this file. */
(function(root){
 'use strict';
 const p=root.LPRVehicleSpec;
 // Livery: deep racing green bodywork, LPR green only as accents, carbon floor,
 // wings and halo, warm white pinstripes and silver suspension.
 const paint=[.02,.26,.12],green=[.04,.55,.22],carbon=[.055,.075,.065],dark=[.025,.032,.035],white=[.86,.88,.85],steel=[.38,.42,.43];
 function builder(){
  const vertices=[],normals=[];
  const tri=(a,b,c,color)=>{
   const u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]);
   const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n)||1;
   for(const point of [a,b,c]){vertices.push(...point.map(x=>x*10),...color);normals.push(...n.map(x=>x/length));}
  };
  const quad=(a,b,c,d,color)=>{tri(a,b,c,color);tri(a,c,d,color);};
  const box=(x0,x1,y0,y1,z0,z1,color)=>{
   const a=[x0,y0,z0],b=[x1,y0,z0],c=[x1,y0,z1],d=[x0,y0,z1],e=[x0,y1,z0],f=[x1,y1,z0],g=[x1,y1,z1],h=[x0,y1,z1];
   for(const face of [[a,d,c,b],[e,f,g,h],[a,b,f,e],[b,c,g,f],[c,d,h,g],[d,a,e,h]])quad(...face,color);
  };
  const rod=(a,b,r,color)=>{
   const axis=b.map((v,i)=>v-a[i]),len=Math.hypot(...axis)||1,d=axis.map(v=>v/len),ref=Math.abs(d[1])>.9?[1,0,0]:[0,1,0];
   let u=[d[1]*ref[2]-d[2]*ref[1],d[2]*ref[0]-d[0]*ref[2],d[0]*ref[1]-d[1]*ref[0]],ul=Math.hypot(...u);u=u.map(v=>v/ul);
   const v=[d[1]*u[2]-d[2]*u[1],d[2]*u[0]-d[0]*u[2],d[0]*u[1]-d[1]*u[0]];
   const point=(o,t)=>o.map((x,i)=>x+r*(u[i]*Math.cos(t)+v[i]*Math.sin(t)));
   for(let i=0;i<10;i++)quad(point(a,i*Math.PI/5),point(a,(i+1)*Math.PI/5),point(b,(i+1)*Math.PI/5),point(b,i*Math.PI/5),color);
  };
  const loft=(rings,color)=>{for(let i=1;i<rings.length;i++){
   const ring=([x,half,bottom,top])=>[[x,bottom,-half],[x,bottom,half],[x,top,half],[x,top,-half]];
   const a=ring(rings[i-1]),b=ring(rings[i]);for(let j=0;j<4;j++)quad(a[j],b[j],b[(j+1)%4],a[(j+1)%4],color);
   if(i===1)quad(...a,carbon);if(i===rings.length-1)quad(...b,carbon);
  }};
  return {vertices,normals,tri,quad,box,rod,loft};
 }
 // Main tub/nose sections: [x, half-width, bottom, top] in metres.
 const TUB=[[-2.3,.20,.16,.45],[-1.1,.36,.14,.64],[.55,.30,.14,.49],[2.35,.10,.22,.32]];
 function tubAt(x){
  const found=TUB.findIndex(r=>r[0]>=x),i=found<0?TUB.length-1:Math.max(1,found),a=TUB[i-1],b=TUB[i],t=b===a?0:Math.max(0,Math.min(1,(x-a[0])/(b[0]-a[0])));
  return [1,2,3].map(j=>a[j]+(b[j]-a[j])*t);
 }
 function body(){
  const b=builder(),{box,rod,loft}=b;
  box(-2.4,1.65,.07,.12,-.85,.85,carbon);
  // Sculpted tub, tapered nose, sidepods with black cooling inlets.
  loft(TUB,paint);
  for(const side of [-1,1]){
   loft([[-1.95,.10,.15,.30],[-1.4,.20,.12,.46],[.20,.23,.15,.54],[.65,.12,.20,.44]].map(([x,w,y,h])=>[x,w,y,h]),carbon);
   const z0=side>0?.32:-.80,z1=side>0?.80:-.32;
   box(-1.8,.42,.18,.44,z0,z1,paint);
   box(.40,.43,.26,.42,side>0?.38:-.75,side>0?.75:-.38,dark);
   box(-1.85,-.7,.445,.455,side>0?.37:-.76,side>0?.76:-.37,carbon);
   // Pinstripe along the sidepod shoulder.
   box(-1.6,.38,.44,.448,side>0?.765:-.80,side>0?.80:-.765,green);
   // Double wishbones, upright and pushrod. Inboard pickups sit just inside
   // the tub surface at their own x, so every arm visibly enters the body;
   // outboard ends meet a short upright inside the rim instead of one point.
   for(const front of [true,false]){
    const axle=front?p.frontAxle:-p.rearAxle,tyre=front?p.frontTyreWidth:p.rearTyreWidth;
    const hub=p.tyreDiameter/2,uz=side*(p.trackWidth/2-tyre*.25),low=[axle,hub-.15,uz],high=[axle,hub+.13,uz];
    const pickup=(x,upper,inset=.02)=>{const [half,bottom,top]=tubAt(x);return [x,upper?top-.04:bottom+.04,side*(half-inset)];};
    for(const dx of [-.38,.26]){
     rod(pickup(axle+dx,false),low,.014,carbon);
     rod(pickup(axle+dx,true),high,.014,carbon);
    }
    rod(low,high,.028,steel);
    // Pushrod from the lower outboard joint up to a rocker on the tub shoulder.
    rod([axle,low[1]+.02,side*(Math.abs(uz)-.04)],pickup(axle+(front?-.30:.30),true,.03),.016,steel);
   }
  }
  // Front wing: two separate elements and compact endplates.
  for(const [x,y] of [[2.37,.13],[2.16,.23]])box(x-.21,x+.21,y,y+.035,-.95,.95,carbon);
  for(const side of [-1,1]){box(2.1,2.6,.12,.32,side*.94-.01,side*.94+.01,green);box(2.1,2.6,.33,.345,side*.72-.06,side*.72+.06,white);}
  // Rear wing and pylons.
  for(const z of [-.18,.18])box(-2.3,-2.25,.25,.78,z-.025,z+.025,carbon);
  box(-2.6,-2.05,.76,.80,-.85,.85,carbon);box(-2.55,-2.10,.89,.925,-.85,.85,carbon);
  for(const z of [-.85,.85])box(-2.6,-2.05,.66,.94,z-.015,z+.015,green);
  // Raised engine cover and air intake.
  loft([[-2.2,.08,.35,.44],[-1.45,.18,.40,.83],[-.94,.15,.45,.91],[-.75,.12,.45,.72]],paint);
  // White spine stripe over the engine cover.
  box(-2.1,-1.0,.84,.85,-.03,.03,white);
  box(-.98,-.94,.73,.84,-.085,.085,dark);
  // Cockpit opening, side bolsters and a continuous halo arch with centre strut.
  box(-.85,.28,.55,.57,-.22,.22,dark);
  // Cockpit rim: the tub's own top edge, body-coloured and flush with the tub
  // (no free-standing bars), falling toward the front; padded dark inner wall.
  {
   const top=x=>tubAt(x)[2]+.012,outer=x=>tubAt(x)[0]+.004,xs=[-.95,-.65,-.3,0,.3],inner=.225,drop=.02;
   for(const side of [-1,1])for(let i=1;i<xs.length;i++){
    const a=xs[i-1],c=xs[i];
    b.quad([a,top(a)-drop,side*inner],[c,top(c)-drop,side*inner],[c,top(c),side*outer(c)],[a,top(a),side*outer(a)],paint);
    b.quad([a,.50,side*inner],[c,.50,side*inner],[c,top(c)-drop,side*inner],[a,top(a)-drop,side*inner],dark);
   }
  }
  // The halo tubes around the head are separate, ghosted meshes (halo()).
  for(const side of [-1,1])rod([-.9,.58,side*.31],[-.9,.80,side*.31],.03,carbon);
  // Two small mirrors and LPR-colour identification stripes; no sponsor marks.
  for(const side of [-1,1]){rod([.2,.53,side*.28],[.1,.62,side*.5],.012,steel);box(-.04,.20,.60,.67,side>0?.48:-.62,side>0?.62:-.48,carbon);}
  box(.65,1.70,.405,.415,-.035,.035,white);
  return b;
 }
 // Halo, laid out from the cockpit eye. renderer3d.js puts the eye 0.80 m
 // behind the car origin and 0.80 m above the reference plane, on the centre
 // line, pitched 0.055 rad down. Looking ahead (60° desktop lens) the hoop
 // apex projects to ~67 % of the half-height above centre and the hoop rises
 // to the top edge at ~80 % of the half-width: a band across the upper view.
 // The side tubes sweep out through the top corners, then drop beside the
 // helmet (outside a 60° lens) to the body's rear mounts at x=-0.90. Nearest
 // tube surface is ~0.32 m from the eye, far beyond the 0.1 m near plane.
 // The centre pillar is a thin strut narrower than the driver's eye
 // spacing, so with two eyes it nearly vanishes. It is built from three
 // nested tubes drawn at a very low opacity: the core overlaps all three
 // layers and the rim only one, which gives a soft-edged shadow without
 // any shader change.
 const HALO_EYE=[-.80,.80,0];
 const HALO_APEX=[-.18,1.00,0];
 // Hoop and side tube, one smooth curve per side from the apex to the mount.
 const HALO_CURVE=[[-.18,1.00,0],[-.21,1.00,.11],[-.27,1.00,.19],[-.36,.995,.255],[-.48,.975,.29],[-.62,.945,.305],[-.76,.88,.31],[-.90,.80,.31]];
 // Pillar from the top of the tub, ahead of the cockpit opening, to the apex.
 const HALO_PILLAR=[[.12,.56,0],[-.04,.80,0],HALO_APEX];
 const HALO_PILLAR_LAYERS=[.010,.017,.025];
 function catmull(points,steps){
  const out=[],n=points.length,at=i=>points[Math.max(0,Math.min(n-1,i))];
  for(let i=0;i<n-1;i++)for(let k=0;k<steps;k++){
   const t=k/steps,p0=at(i-1),p1=at(i),p2=at(i+1),p3=at(i+2),t2=t*t,t3=t2*t;
   out.push(p1.map((_,j)=>.5*(2*p1[j]+(-p0[j]+p2[j])*t+(2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t2+(-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t3)));
  }
  out.push(points[n-1].slice());return out;
 }
 // One continuous tube along a polyline (parallel-transported frame). Unlike
 // chained rods, translucent joints neither overlap nor gap.
 function sweep(b,path,r,color,sides=10){
  const sub=(a,c)=>a.map((v,i)=>v-c[i]),cross=(a,c)=>[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]];
  const unit=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
  const tangent=i=>unit(sub(path[Math.min(path.length-1,i+1)],path[Math.max(0,i-1)]));
  let t=tangent(0),u=unit(cross(t,Math.abs(t[1])>.9?[1,0,0]:[0,1,0]));
  const rings=path.map((p,i)=>{
   const next=tangent(i);u=unit(sub(u,next.map(v=>v*(u[0]*next[0]+u[1]*next[1]+u[2]*next[2]))));t=next;
   const v=cross(t,u);
   return Array.from({length:sides},(_,k)=>{const a=k*2*Math.PI/sides;return p.map((x,j)=>x+r*(u[j]*Math.cos(a)+v[j]*Math.sin(a)));});
  });
  for(let i=1;i<rings.length;i++)for(let k=0;k<sides;k++)b.quad(rings[i-1][k],rings[i-1][(k+1)%sides],rings[i][(k+1)%sides],rings[i][k],color);
 }
 // halo(true): the soft centre pillar. halo(false): hoop and side tubes.
 function halo(front){
  const b=builder();
  if(front){const path=catmull(HALO_PILLAR,6);for(const r of HALO_PILLAR_LAYERS)sweep(b,path,r,carbon,8);}
  else{
   const half=catmull(HALO_CURVE,6);
   // Both sides as one path through the apex, so the apex has no seam.
   const path=[...half.slice().reverse().map(([x,y,z])=>[x,y,-z]),...half.slice(1)];
   sweep(b,path,.024,carbon,12);
  }
  return b;
 }
 // Pillar opacity: a soft but clearly present strut (core ~40 %, rim ~15 %).
 const HALO_OPACITY={pillar:.08,hoop:.62};
 function wheel(front){
  const b=builder(),width=front?p.frontTyreWidth:p.rearTyreWidth,r=p.tyreDiameter/2,rim=p.rimDiameter/2;
  // Axial silhouette: rounded shoulders, broad slick tread and recessed rims.
  for(let i=0;i<48;i++){
   const a=i*Math.PI/24,c=(i+1)*Math.PI/24;
   const at=(rad,t,z)=>[rad*Math.cos(t),rad*Math.sin(t),z];
   const rings=[[-width/2,r*.90],[-width*.42,r],[width*.42,r],[width/2,r*.90]];
   for(let j=1;j<rings.length;j++)b.quad(at(rings[j-1][1],a,rings[j-1][0]),at(rings[j-1][1],c,rings[j-1][0]),at(rings[j][1],c,rings[j][0]),at(rings[j][1],a,rings[j][0]),[.075,.085,.09]);
   for(const side of [-1,1]){
    const z=side*width/2;b.quad(at(r*.90,a,z),at(r*.90,c,z),at(rim,c,z),at(rim,a,z),dark);
    b.tri([0,0,z],at(rim,a,z),at(rim,c,z),steel);
    b.quad(at(r*.93,a,z+side*.001),at(r*.93,c,z+side*.001),at(r*.91,c,z+side*.001),at(r*.91,a,z+side*.001),green);
   }
  }
  return b;
 }
 // ---- Cockpit head movement and road feel --------------------------------
 // Output units match renderer3d.js: yaw in radians (positive looks right),
 // shift sideways and dip downward in world units (10 units = 1 m).
 const HEAD_KEY='lpr-monaco-head-movement',SHAKE_KEY='lpr-monaco-camera-shake';
 // A HANS-held head: the driver looks into corners mostly with the eyes.
 const HEAD={
  yawMax:.07,            // ~4.0°, soft-saturated
  yawPerYawRate:.045,    // rad per rad/s
  yawPerSteer:.10,       // rad per rad of road-wheel angle (steering leads yaw: anticipation)
  shiftMax:.20,          // 2.0 cm, approached asymptotically (1.5 cm at 5 g)
  shiftPerG:.04,         // 4 mm/g at low load, toward the outside of the corner
  dipBrakeMax:.17,       // 1.7 cm down/forward under braking (1.3 cm at 5 g)
  dipAccelMax:.08,       // 0.8 cm up/back under acceleration
  dipPerG:.035,          // 3.5 mm/g at low load
  omegaYaw:6,omegaShift:9,omegaDip:9 // critically damped neck, rad/s (time constants 0.17 s and 0.11 s)
 };
 const SHAKE={
  textureSpeed:80,       // m/s at which road texture reaches full strength
  texture:{dip:.02,shift:.008,yaw:.0006},    // 2 mm, 0.8 mm, 0.034° at full speed
  kerb:{dip:.05,shift:.03,yaw:.0025},        // +5 mm, +3 mm, +0.14° on full kerb roughness
  bumpPerMetre:.05,      // 5 cm of wheel-height change per metre travelled = full roughness
  roughRelease:.18,      // s, kerb roughness envelope decay
  crestPerG:.05,         // 5 mm of head drop per g of vertical load change
  crestMax:.035,         // 3.5 mm
  crestFilter:.12,       // s, low-pass on vertical speed and acceleration
  omegaCrest:7,
  maxDt:.1,              // longer frames (tab switch, pause) are treated as 0.1 s
  teleport:.5            // m: a wheel-height jump larger than this is a reset, not a bump
 };
 const finite=v=>Number.isFinite(v)?v:0;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const soft=(v,max)=>max>0?max*Math.tanh(v/max):0;
 function readStrength(key){
  try{
   const store=root.localStorage??globalThis.localStorage,raw=store?.getItem(key);
   if(raw==null||raw==='')return 1;
   const v=parseFloat(raw);return Number.isFinite(v)?clamp(v,0,1):1;
  }catch{return 1;}
 }
 // Exact solution of x'' = w^2 (target - x) - 2 w x' over dt for a constant
 // target: critically damped, unconditionally stable for any dt, no overshoot
 // from rest. dt is already finite and bounded by the caller.
 function critical(state,target,omega,dt){
  if(!(dt>0))return state.x;
  const e=state.x-target,k=state.v+omega*e,decay=Math.exp(-omega*dt);
  state.x=target+(e+k*dt)*decay;state.v=(state.v-omega*k*dt)*decay;
  if(!Number.isFinite(state.x)||!Number.isFinite(state.v)){state.x=target;state.v=0;}
  return state.x;
 }
 // Spatial noise, phased by distance travelled: identical runs give identical
 // shake and a stationary car gives none. Wavelengths are incommensurate so
 // the pattern never visibly repeats; at 20-60 m/s they sit at ~4-25 Hz.
 function roadNoise(d,phase){
  const w=Math.PI*2;
  return .5*Math.sin(w*d/2.3+phase)+.3*Math.sin(w*d/3.7+phase*1.7+1.3)+.2*Math.sin(w*d/5.9+phase*2.3+2.1);
 }
 function kerbNoise(d,phase){
  const w=Math.PI*2;
  return .6*Math.sin(w*d/1.1+phase)+.4*Math.sin(w*d/1.7+phase*1.9+.7);
 }
 function createCockpitMotion(){
  const channel=()=>({x:0,v:0});
  const s={last:null,head:{yaw:channel(),shift:channel(),dip:channel()},crest:channel(),
   distance:0,heights:null,dev:null,grade:null,rough:0,vz:0,vzLast:null,az:0};
  const out={yaw:0,shift:0,dip:0};
  function resetRoad(){s.heights=null;s.dev=null;s.grade=null;s.rough=0;s.vzLast=null;s.az=0;}
  function update(car,now,settings={}){
   car=car||{};
   const t=Number.isFinite(now)?now:s.last;
   let dt=s.last==null||t==null?0:(t-s.last)/1000;
   if(!Number.isFinite(dt)||dt<0)dt=0;
   if(t!=null)s.last=t;
   if(dt>SHAKE.maxDt){dt=SHAKE.maxDt;resetRoad();}
   const headGain=clamp(finite(settings.head??1),0,1),shakeGain=clamp(finite(settings.shake??1),0,1);
   const crashed=!!car.crashed;

   // Head: targets from g-load and yaw, then a critically damped neck.
   const latG=finite(car.lateralG),lonG=finite(car.longitudinalG);
   const yawRaw=HEAD.yawPerYawRate*finite(car.yawRate)+HEAD.yawPerSteer*finite(car.steerAngle);
   const yawT=crashed?0:headGain*soft(yawRaw,HEAD.yawMax);
   const shiftT=crashed?0:-headGain*soft(HEAD.shiftPerG*latG,HEAD.shiftMax);
   const dipT=crashed?0:headGain*(lonG<0?soft(-HEAD.dipPerG*lonG,HEAD.dipBrakeMax):-soft(HEAD.dipPerG*lonG,HEAD.dipAccelMax));
   const yaw=critical(s.head.yaw,yawT,HEAD.omegaYaw,dt);
   const shift=critical(s.head.shift,shiftT,HEAD.omegaShift,dt);
   const dip=critical(s.head.dip,dipT,HEAD.omegaDip,dt);

   // Road feel.
   const speed=Math.abs(Number.isFinite(car.speed)?car.speed:Math.hypot(finite(car.vx),finite(car.vy)));
   const step=speed*dt;s.distance+=step;
   const h=Array.isArray(car.roadHeights)&&car.roadHeights.length===4&&car.roadHeights.every(Number.isFinite)?car.roadHeights:null;
   let instant=0;
   if(h){
    const mean=(h[0]+h[1]+h[2]+h[3])/4,dev=h.map(v=>v-mean);
    if(s.heights&&h.some((v,i)=>Math.abs(v-s.heights[i])>SHAKE.teleport))resetRoad();
    if(s.heights&&dt>0&&step>1e-4){
     // Between wheels: change of each wheel's offset from the car mean
     // (kerbs, ribs; independent of hills). Between frames: change of the
     // mean grade (sharp common bumps; a smooth hill changes it slowly).
     const grade=(mean-s.heights.mean)/step;
     let bump=dev.reduce((sum,v,i)=>sum+Math.abs(v-s.dev[i]),0);
     if(s.grade!=null)bump+=Math.abs(grade-s.grade)*Math.min(step,1);
     s.grade=grade;
     instant=clamp(bump/Math.max(step,.1)/SHAKE.bumpPerMetre,0,1);
    }
    s.heights=h.slice();s.heights.mean=mean;s.dev=dev;
   }else resetRoad();
   // Optional existing signal: fraction of tyres on a kerb. Fills in when frame
   // sampling aliases the 45 cm ribs. Absent field = no effect.
   if(Number.isFinite(car.kerbFraction))instant=Math.max(instant,clamp(car.kerbFraction,0,1)*.8);
   s.rough=Math.max(instant,s.rough*Math.exp(-dt/SHAKE.roughRelease));
   if(!Number.isFinite(s.rough))s.rough=0;
   const moving=clamp(speed/3,0,1);
   const texture=Math.pow(clamp(speed/SHAKE.textureSpeed,0,1),1.5);
   const kerb=s.rough*clamp(speed/25,.3,1);
   const d=s.distance,gain=crashed?0:shakeGain*moving;
   const vib={
    dip:gain*(texture*SHAKE.texture.dip*roadNoise(d,0)+kerb*SHAKE.kerb.dip*kerbNoise(d,0)),
    shift:gain*(texture*SHAKE.texture.shift*roadNoise(d,2.4)+kerb*SHAKE.kerb.shift*kerbNoise(d,1.1)),
    yaw:gain*(texture*SHAKE.texture.yaw*roadNoise(d,4.1)+kerb*SHAKE.kerb.yaw*kerbNoise(d,2.9))
   };
   // Crests and compressions: vertical speed from the terrain grade under the
   // car, its rate of change is vertical acceleration. Compression (az > 0)
   // presses the head down, a crest lets it float up.
   if(dt>0){
    const slope=car.terrainSlope&&Number.isFinite(car.terrainSlope.forward)?car.terrainSlope.forward:null;
    const vz=slope!=null?slope*finite(car.vx):(s.grade!=null?s.grade*speed:0);
    const a=1-Math.exp(-dt/SHAKE.crestFilter);
    s.vz+=(vz-s.vz)*a;
    if(s.vzLast!=null)s.az+=((s.vz-s.vzLast)/dt-s.az)*a;
    s.vzLast=s.vz;
    if(!Number.isFinite(s.vz)||!Number.isFinite(s.az)){s.vz=0;s.az=0;s.vzLast=null;}
   }
   const crestT=gain*clamp(SHAKE.crestPerG*s.az/9.81,-SHAKE.crestMax,SHAKE.crestMax);
   const crest=critical(s.crest,crestT,SHAKE.omegaCrest,dt);

   out.yaw=yaw+vib.yaw;out.shift=shift+vib.shift;out.dip=dip+vib.dip+crest;
   for(const k in out)if(!Number.isFinite(out[k]))out[k]=0;
   return out;
  }
  return {update,state:s};
 }
 root.LPRF1Cockpit={HEAD_KEY,SHAKE_KEY,HEAD,SHAKE,readStrength,createCockpitMotion,
  halo:{eye:HALO_EYE,apex:HALO_APEX,curve:HALO_CURVE,pillar:HALO_PILLAR,pillarLayers:HALO_PILLAR_LAYERS,opacity:HALO_OPACITY}};
 root.LPRF1Mesh={body,wheel,halo};
 root.LPRRenderer3D=class MonacoF1Renderer extends root.LPRRenderer3D {
  // A narrower lens than the Formula Student view: 72° made the car read narrow.
  cockpitFov(){return this.width<650?74:60;}
  // Head movement and road feel. Presentation only: reads the car, never
  // writes it. Strengths come from localStorage and are re-read twice a
  // second so a future settings slider applies without a reload.
  cockpitLook(car,now){
   const t=Number.isFinite(now)?now:0,cache=this.cockpitSettings;
   if(!cache||Math.abs(t-cache.time)>500)this.cockpitSettings={time:t,head:readStrength(HEAD_KEY),shake:readStrength(SHAKE_KEY)};
   const motion=this.cockpitMotion||(this.cockpitMotion=createCockpitMotion());
   return motion.update(car,now,this.cockpitSettings);
  }
  drawWheels(car,now){
   const gl=this.gl,pose=this.vehiclePose||this.updateSuspension(car,now);
   if(!this.f1Meshes){
    this.f1Meshes=[body(),wheel(true),wheel(false),halo(true),halo(false)].map(data=>{
     const mesh={buffer:gl.createBuffer(),normalBuffer:gl.createBuffer(),count:data.vertices.length/6};
     gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data.vertices),gl.STATIC_DRAW);
     gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normalBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data.normals),gl.STATIC_DRAW);return mesh;
    });
   }
   const draw=(mesh,origin,forward,up,right,floor)=>{
    this.bindMesh(mesh.buffer);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normalBuffer);gl.enableVertexAttribArray(this.locations.normal);gl.vertexAttribPointer(this.locations.normal,3,gl.FLOAT,false,12,0);
    gl.uniform1i(this.locations.vehicle,1);gl.uniform1i(this.locations.meshTransform,1);
    gl.uniform3f(this.locations.carOrigin,car.x,0,car.y);gl.uniform3f(this.locations.carForward,Math.cos(car.angle),0,Math.sin(car.angle));gl.uniform3f(this.locations.carRight,-Math.sin(car.angle),0,Math.cos(car.angle));
    gl.uniform3f(this.locations.meshOrigin,...origin);gl.uniform3f(this.locations.meshForward,...forward);gl.uniform3f(this.locations.meshUp,...up);gl.uniform3f(this.locations.meshRight,...right);gl.uniform1f(this.locations.meshFloor,floor);
    gl.drawArrays(gl.TRIANGLES,0,mesh.count);
   };
   const heave=pose.heave||0;
   draw(this.f1Meshes[0],[car.x,heave,car.y],pose.forward,pose.up,pose.right,heave+.3);
   if(this.lastWheelFrame)this.wheelPhase+=Math.min((now-this.lastWheelFrame)/1000,.05)*(car.vx||0)/(p.tyreDiameter/2);
   this.lastWheelFrame=now;const phase=this.wheelPhase||0;
   for(let axle=0;axle<2;axle++)for(const side of [-1,1]){
    const f=axle===0?p.frontAxle:-p.rearAxle,z=side*p.trackWidth/2,index=axle*2+(side>0?1:0),w=car.suspension?.wheels[index];
    const ground=(w?.z??heave/10)*10,angle=car.angle+(axle===0?p.roadWheelAngle(this.visualSteeringAngle(car),side):0),c=Math.cos(angle),s=Math.sin(angle),cp=Math.cos(phase),sp=Math.sin(phase);
    draw(this.f1Meshes[axle+1],[car.x+10*(f*Math.cos(car.angle)-z*Math.sin(car.angle)),ground+p.tyreDiameter*5,car.y+10*(f*Math.sin(car.angle)+z*Math.cos(car.angle))],
      [c*cp,-sp,s*cp],[c*sp,cp,s*sp],[-s,0,c],ground);
   }
   // Ghosted halo front last, blended over the scene without writing depth.
   gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
   // Hoop first, then the faint pillar over it (both without depth writes).
   for(const [mesh,opacity] of [[4,HALO_OPACITY.hoop],[3,HALO_OPACITY.pillar]]){gl.uniform1f(this.locations.opacity,opacity);draw(this.f1Meshes[mesh],[car.x,heave,car.y],pose.forward,pose.up,pose.right,heave+.3);}
   gl.uniform1f(this.locations.opacity,1);gl.depthMask(true);gl.disable(gl.BLEND);
   gl.uniform1i(this.locations.meshTransform,0);gl.uniform1i(this.locations.vehicle,0);
  }
 };
})(window);
