// Visual state shared by the authoritative recorder and the replay viewer.
(function(root){
 const numbers=['steerAngle','damage','impactSide','bodySlip','lateralG','longitudinalG','tireUse'];
 const flags=['offroad','tcActive','tcEnabled'];
 const body=['pitch','roll','heave','centreHeight','motionRatio'];
 const wheel=['z','travel','load'];
 const number=n=>Number.isFinite(n)?Math.round(n*1e5)/1e5:0;
 function capture(car){
  const pose={};for(const k of numbers)pose[k]=number(car[k]);for(const k of flags)pose[k]=!!car[k];
  if(car.suspension){pose.suspension={};for(const k of body)pose.suspension[k]=number(car.suspension[k]);
   pose.suspension.wheels=car.suspension.wheels.map(w=>Object.fromEntries(wheel.map(k=>[k,number(w[k])])));
  }return pose;
 }
 function valid(p){return p&&numbers.every(k=>Number.isFinite(p[k]))&&flags.every(k=>typeof p[k]==='boolean')&&(!p.suspension||(body.every(k=>Number.isFinite(p.suspension[k]))&&Array.isArray(p.suspension.wheels)&&p.suspension.wheels.length===4&&p.suspension.wheels.every(w=>wheel.every(k=>Number.isFinite(w[k])))));}
 function mix(a,b,t){
  const out={};for(const k of numbers)out[k]=a[k]+(b[k]-a[k])*t;for(const k of flags)out[k]=a[k];
  if(a.suspension&&b.suspension){out.suspension={};for(const k of body)out.suspension[k]=a.suspension[k]+(b.suspension[k]-a.suspension[k])*t;
   out.suspension.wheels=a.suspension.wheels.map((w,i)=>Object.fromEntries(wheel.map(k=>[k,w[k]+(b.suspension.wheels[i][k]-w[k])*t])));
  }return out;
 }
 const api={capture,valid,mix};if(typeof module==='object'&&module.exports)module.exports=api;else root.LPRReplayPose=api;
})(typeof window==='object'?window:globalThis);
