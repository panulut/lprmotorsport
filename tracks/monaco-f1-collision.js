/* Monaco-only static wall sweeps. Conservative SAT advance is preserved from
   campus.js; the F1 footprint is independent of the Formula Student shape. */
(function(root){
  'use strict';
  const Math=root.LPRMath,p=root.LPRVehicleSpec,unit=1/p.metresPerWorldUnit;
  const box=(f0,f1,s0,s1)=>[[f0,s0],[f1,s0],[f1,s1],[f0,s1]].map(a=>a.map(v=>v*unit));
  function carCollisionParts(state){
    const parts=[box(-2.6,-2.05,-.85,.85),box(2.1,2.6,-.95,.95),
      box(-2.3,.7,-.70,.70),box(.7,2.5,-.18,.18)];
    for(const axle of [0,1])for(const side of [-1,1]){
      const f=axle===0?p.frontAxle:-p.rearAxle,s=side*p.trackWidth/2;
      const width=axle===0?p.frontTyreWidth:p.rearTyreWidth;
      const a=axle===0?p.roadWheelAngle(state.steerAngle||0,side):0,c=Math.cos(a),sn=Math.sin(a);
      parts.push(box(-p.tyreDiameter/2,p.tyreDiameter/2,-width/2,width/2).map(([x,y])=>[f*unit+x*c-y*sn,s*unit+x*sn+y*c]));
    }
    return parts;
  }
  function resolveBoundsCollision(state, previous, obstacles, onImpact) {
    let from={...previous},firstContact;
    // Spend the rest of the step travelling along the contacted surface.
    // Sweep each slide again so a second wall can stop it at a corner.
    for(let i=0;i<6;i++) {
      const target={x:state.x,y:state.y};
      const contact=sweepBoundsCollision(state,from,obstacles);
      if(!contact) break;
      firstContact ||= contact;
      const tangent={x:-contact.normal.y,y:contact.normal.x};
      const beforeX=(state.vx || 0)*Math.cos(state.angle)-(state.vy || 0)*Math.sin(state.angle);
      const beforeY=(state.vx || 0)*Math.sin(state.angle)+(state.vy || 0)*Math.cos(state.angle);
      const c=Math.cos(state.angle),s=Math.sin(state.angle);
      const normalVelocity=Math.min(0,beforeX*contact.normal.x+beforeY*contact.normal.y);
      if(!onImpact){
        const vx=beforeX-normalVelocity*contact.normal.x,vy=beforeY-normalVelocity*contact.normal.y;
        state.vx=vx*c+vy*s;state.vy=-vx*s+vy*c;state.yawRate=0;
      }
      onImpact?.(contact);
      if(state.crashed) break;
      const afterX=(state.vx || 0)*Math.cos(state.angle)-(state.vy || 0)*Math.sin(state.angle);
      const afterY=(state.vx || 0)*Math.sin(state.angle)+(state.vy || 0)*Math.cos(state.angle);
      const tangentSpeed=Math.abs(beforeX*tangent.x+beforeY*tangent.y);
      const retention=onImpact && tangentSpeed>1e-12
        ? Math.min(1,Math.abs(afterX*tangent.x+afterY*tangent.y)/tangentSpeed) : 1;
      const remainingX=target.x-state.x,remainingY=target.y-state.y;
      const into=Math.min(0,remainingX*contact.normal.x+remainingY*contact.normal.y);
      const slideX=(remainingX-into*contact.normal.x)*retention;
      const slideY=(remainingY-into*contact.normal.y)*retention;
      if(Math.hypot(slideX,slideY)<1e-7) break;
      // Rotation has already stopped at contact; translate the same footprint.
      from={x:state.x,y:state.y,angle:state.angle};
      state.x+=slideX;
      state.y+=slideY;
      if(i===5) {state.x=from.x;state.y=from.y;}
    }
    return firstContact || false;
  }
  function sweepBoundsCollision(state, previous, obstacles) {
    const dx=state.x-previous.x,dy=state.y-previous.y;
    const startAngle=previous.angle ?? state.angle ?? 0;
    const turn=(state.angle ?? startAngle)-startAngle;
    const parts=carCollisionParts(state);
    const reach=Math.max(...parts.flat().map(p=>Math.hypot(...p)));
    const travel=Math.hypot(dx,dy)+Math.abs(turn)*reach;
    let firstHit=Infinity,normal,impactMaterial,hitBounds;
    for(const bounds of obstacles) {
      const cx=(bounds.minX+bounds.maxX)/2,cy=(bounds.minY+bounds.maxY)/2;
      const halfX=(bounds.maxX-bounds.minX)/2,halfY=(bounds.maxY-bounds.minY)/2;
      const obstacleReach=Math.hypot(halfX,halfY);
      if(cx+obstacleReach<Math.min(previous.x,state.x)-reach || cx-obstacleReach>Math.max(previous.x,state.x)+reach ||
        cy+obstacleReach<Math.min(previous.y,state.y)-reach || cy-obstacleReach>Math.max(previous.y,state.y)+reach) continue;
      const oc=Math.cos(bounds.angle || 0),os=Math.sin(bounds.angle || 0);
      const obstacleAxes=[[oc,os],[-os,oc]];
      for(const part of parts) {
        // Separating axes give a safe distance to advance along the sweep,
        // including rotation. Never expand a wall by an enclosing circle.
        const separation=t=>{
          const c=Math.cos(startAngle+turn*t),s=Math.sin(startAngle+turn*t);
          const points=part.map(([x,y])=>[previous.x+dx*t-cx+x*c-y*s,previous.y+dy*t-cy+x*s+y*c]);
          const axes=obstacleAxes.slice();
          for(let i=0;i<points.length;i++) {
            const a=points[i],b=points[(i+1)%points.length],x=b[0]-a[0],y=b[1]-a[1],length=Math.hypot(x,y);
            if(length>1e-12) axes.push([-y/length,x/length]);
          }
          let gap=-Infinity,n;
          for(const [x,y] of axes) {
            const extent=halfX*Math.abs(x*oc+y*os)+halfY*Math.abs(-x*os+y*oc);
            const projections=points.map(p=>p[0]*x+p[1]*y);
            const low=Math.min(...projections),high=Math.max(...projections);
            const a=low-extent,b=-extent-high;
            if(Math.max(a,b)>gap) {gap=Math.max(a,b);n=a>b?{x,y}:{x:-x,y:-y};}
          }
          return {gap,normal:n};
        };
        let t=0,contact=separation(0);
        const separating=turn===0
          ? dx*contact.normal.x+dy*contact.normal.y>=-1e-12
          : separation(1e-5).gap>=contact.gap-1e-12;
        if(contact.gap<=1e-7 && separating) continue;
        for(let i=0;i<200 && t<=1 && t<firstHit;i++) {
          if(contact.gap<=1e-7) {firstHit=t;normal=contact.normal;impactMaterial=bounds.impactMaterial;hitBounds=bounds;break;}
          const closingSpeed=-(dx*contact.normal.x+dy*contact.normal.y)+Math.abs(turn)*reach;
          if(closingSpeed<1e-12) break;
          t+=contact.gap/closingSpeed;
          if(t>1 || t>=firstHit) break;
          contact=separation(t);
        }
      }
    }
    if(!Number.isFinite(firstHit)) return false;
    const fraction=Math.max(0,firstHit-.00001/Math.max(travel,.00001));
    state.x=previous.x+dx*fraction;
    state.y=previous.y+dy*fraction;
    state.angle=startAngle+turn*fraction;
    return {normal,impactMaterial,body:hitBounds.body};
  }

  const campus=root.LPRCampus;
  const query=root.LPRCreateCollisionIndex(campus.obstacleBounds,160);
  campus.carCollisionParts=carCollisionParts;
  campus.resolveBoundsCollision=resolveBoundsCollision;
  campus.resolveObstacleCollision=(state,previous,onImpact)=>{
    const reach=32+Math.hypot(state.x-previous.x,state.y-previous.y);
    return resolveBoundsCollision(state,previous,query(previous.x,previous.y,state.x,state.y,reach),onImpact);
  };
})(window);
