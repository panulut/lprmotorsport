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
 function body(){
  const b=builder(),{box,rod,loft}=b;
  box(-2.4,1.65,.07,.12,-.85,.85,carbon);
  // Sculpted tub, tapered nose, sidepods with black cooling inlets.
  loft([[-2.3,.20,.16,.45],[-1.1,.36,.14,.64],[.55,.30,.14,.49],[2.35,.10,.22,.32]],paint);
  for(const side of [-1,1]){
   loft([[-1.95,.10,.15,.30],[-1.4,.20,.12,.46],[.20,.23,.15,.54],[.65,.12,.20,.44]].map(([x,w,y,h])=>[x,w,y,h]),carbon);
   const z0=side>0?.32:-.80,z1=side>0?.80:-.32;
   box(-1.8,.42,.18,.44,z0,z1,paint);
   box(.40,.43,.26,.42,side>0?.38:-.75,side>0?.75:-.38,dark);
   box(-1.85,-.7,.445,.455,side>0?.37:-.76,side>0?.76:-.37,carbon);
   // Pinstripe along the sidepod shoulder.
   box(-1.6,.38,.44,.448,side>0?.765:-.80,side>0?.80:-.765,green);
   // Front/rear pushrods and double wishbones, outside the narrow nose.
   for(const axle of [p.frontAxle,-p.rearAxle])for(const h of [.20,.43]){
    rod([axle-.38,h,side*.25],[axle,.3525,side*p.trackWidth/2],.015,steel);
    rod([axle+.26,h,side*.25],[axle,.3525,side*p.trackWidth/2],.015,carbon);
   }
   rod([p.frontAxle-.35,.5,side*.22],[p.frontAxle,.3525,side*.70],.018,carbon);
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
  for(const z of [-.29,.29])rod([-.95,.59,z],[.35,.60,z],.035,carbon);
  // The halo tubes around the head are separate, ghosted meshes (halo()).
  for(const side of [-1,1])rod([-.9,.58,side*.31],[-.9,.80,side*.31],.03,carbon);
  // Two small mirrors and LPR-colour identification stripes; no sponsor marks.
  for(const side of [-1,1]){rod([.2,.53,side*.28],[.1,.62,side*.5],.012,steel);box(-.04,.20,.60,.67,side>0?.48:-.62,side>0?.62:-.48,carbon);}
  box(.65,1.70,.405,.415,-.035,.035,white);
  return b;
 }
 // Forward halo hoop and centre pillar. Narrower than the gap between the
 // driver's eyes, so with two eyes it reads as a faint ghost, not a solid bar.
 // The side tubes pass just beside the helmet, so they ghost slightly less.
 function halo(front){
  const b=builder();
  if(front){const hoop=[[.15,.94,-.25],[.42,.90,0],[.15,.94,.25]];
   for(let i=1;i<hoop.length;i++)b.rod(hoop[i-1],hoop[i],.022,carbon);
   b.rod([.48,.42,0],[.42,.90,0],.026,carbon);}
  else{const side=[[-.90,.80,.31],[-.58,.95,.32],[.15,.94,.25]];
   for(const z of [-1,1])for(let i=1;i<side.length;i++)b.rod(side[i-1].map((v,j)=>j===2?v*z:v),side[i].map((v,j)=>j===2?v*z:v),.022,carbon);}
  return b;
 }
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
 root.LPRF1Mesh={body,wheel,halo};
 root.LPRRenderer3D=class MonacoF1Renderer extends root.LPRRenderer3D {
  // A narrower lens than the Formula Student view: 72° made the car read narrow.
  cockpitFov(){return this.width<650?74:60;}
  // The driver's head: looks toward the corner with the yaw rate and sways
  // with lateral and longitudinal g, smoothed like a neck, never snapping.
  cockpitLook(car,now){
   const dt=this.lastLook?Math.min((now-this.lastLook)/1000,.05):0;this.lastLook=now;
   const target={yaw:Math.max(-.26,Math.min(.26,(car.yawRate||0)*.22)),
     shift:Math.max(-.35,Math.min(.35,-(car.lateralG||0)*.07)),
     dip:Math.max(-.25,Math.min(.25,-(car.longitudinalG||0)*.05))};
   const look=this.look||(this.look={yaw:0,shift:0,dip:0});
   for(const k in target)look[k]+=(target[k]-look[k])*(1-Math.exp(-(k==='yaw'?4:6)*dt));
   return look;
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
   for(const [mesh,opacity] of [[4,.45],[3,.22]]){gl.uniform1f(this.locations.opacity,opacity);draw(this.f1Meshes[mesh],[car.x,heave,car.y],pose.forward,pose.up,pose.right,heave+.3);}
   gl.uniform1f(this.locations.opacity,1);gl.depthMask(true);gl.disable(gl.BLEND);
   gl.uniform1i(this.locations.meshTransform,0);gl.uniform1i(this.locations.vehicle,0);
  }
 };
})(window);
