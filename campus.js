/* Stylised campus, traced from the supplied route screenshot. Not a survey.
 * Screenshot coordinates share one transform for roads and architecture. */
window.LPRCampus = (() => {
  const scale = 5;
  const road = { halfWidth: 33, kerbOuter: 39, shoulderOuter: 41 };
  const world = (x, y) => ({ x: (x - 100) * scale + 200, y: (y - 100) * scale + 200 });
  const anchors = [[190,180],[310,180],[445,180],[500,225],[550,260],[600,305],[645,340],[645,360],[625,395],[623,425],[600,428],[550,428],[505,433],[512,510],[512,640],[507,745],[496,798],[480,812],[465,800],[450,735],[430,690],[395,650],[365,590],[350,530],[327,492],[285,470],[235,460],[210,445],[200,410],[200,345],[185,275],[182,225]];
  const dense = [];
  for (let i = 0; i < anchors.length; i++) {
    const p0 = anchors[(i + anchors.length - 1) % anchors.length], p1 = anchors[i];
    const p2 = anchors[(i + 1) % anchors.length], p3 = anchors[(i + 2) % anchors.length];
    for (let j = 0; j < 24; j++) {
      const t = j / 24, t2 = t*t, t3 = t2*t;
      const coord = k => .5 * ((2*p1[k]) + (-p0[k]+p2[k])*t + (2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2 + (-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3);
      dense.push(world(coord(0), coord(1)));
    }
  }
  // Equal-distance samples keep lap gates and roadside placement consistent.
  const distances = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i-1], b = dense[i % dense.length];
    distances.push(distances[i-1] + Math.hypot(b.x-a.x,b.y-a.y));
  }
  const length = distances[distances.length-1];
  let segment = 0;
  const track = Array.from({ length: 240 }, (_, i) => {
    const target = i * length / 240;
    while (distances[segment+1] < target) segment++;
    const a = dense[segment], b = dense[(segment+1)%dense.length];
    const f = (target-distances[segment])/(distances[segment+1]-distances[segment]);
    return { x:a.x+(b.x-a.x)*f, y:a.y+(b.y-a.y)*f };
  });
  // Move the shared start/finish onto the straight, about 50 metres forward.
  // Rotate existing samples so the road geometry stays exactly the same.
  const startIndex = Math.round(50 / window.LPRVehicleSpec.metresPerWorldUnit / (length / track.length));
  track.push(...track.splice(0, startIndex));
  const outsideTrackClearance = (x,y,clearance) => {
    const clearanceSquared=clearance*clearance;
    for(let i=0;i<track.length;i++) {
      const a=track[i],b=track[(i+1)%track.length],dx=b.x-a.x,dy=b.y-a.y;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
      const offsetX=x-(a.x+dx*t),offsetY=y-(a.y+dy*t);
      if(offsetX*offsetX+offsetY*offsetY<clearanceSquared) return false;
    }
    return true;
  };
  const lakeOutline = [[590,80],[1050,80],[1050,520],[850,480],[780,400],[745,330],[715,240]]
    .map(([x,y])=>world(x,y));
  const inLake = (x,y) => {
    let inside=false;
    for(let i=0,j=lakeOutline.length-1;i<lakeOutline.length;j=i++) {
      const a=lakeOutline[i],b=lakeOutline[j];
      if((a.y>y)!==(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside=!inside;
    }
    return inside;
  };
  const buildings = [
    [240,238,65,70,65],[318,222,35,50,80],[335,285,38,70,75],
    [270,325,115,34,65],[260,385,82,75,65],[370,438,195,32,75],
    [420,254,58,106,90],[413,337,70,45,85],[415,394,68,64,75],
    [545,474,55,34,65],[557,550,65,37,65],[560,620,58,34,65],
    [550,690,55,38,65],[543,758,48,35,65]
  ];
  const saunaSite = world(654,281);
  // Ground-level footprints share the dimensions used to draw the buildings.
  const solidBuildings = [...buildings, [454,337,12,57], [461,349,1,30], [463,349,1,12]];
  for (let i=0;i<12;i++) solidBuildings.push([450+Math.sin(i/11*Math.PI)*13,365+i*3.8,5,4.2]);
  const buildingBounds = solidBuildings.map(([x,y,w,d]) => {
    const p=world(x,y);
    return {minX:p.x-w*scale/2,maxX:p.x+w*scale/2,minY:p.y-d*scale/2,maxY:p.y+d*scale/2};
  });
  // Sale's facade is rendered separately in sale.js (300 by 100 world units).
  const saleCenter=world(550,462);
  buildingBounds.push({minX:saleCenter.x-150,maxX:saleCenter.x+150,minY:saleCenter.y-50,maxY:saleCenter.y+50});
  // Match Sale's two ramps, entrance landing and three street-facing steps.
  // Facade u is reversed relative to world X, as in sale.js.
  const saleAccessBounds=[[-147,30,-69,-51.4],[78,148,-69,-51.4],[30,78,-69,-51],
    ...Array.from({length:3},(_,i)=>[43,65,-76.05+i*2.1,-73.95+i*2.1])]
    .map(([u0,u1,v0,v1])=>({minX:saleCenter.x-u1,maxX:saleCenter.x-u0,
      minY:saleCenter.y+v0,maxY:saleCenter.y+v1}));

  const spec=window.LPRVehicleSpec;
  const units=1/spec.metresPerWorldUnit;
  const carGeometry={
    noseControls:[[-1.2,2.7,4],[3,2.75,2.65],[7.5,2.25,2.5],[10.8,1.65,2.05],[12,1.1,1.55],[12.4,.65,1.1]],
    wingPanels:[{front:14.1,rear:12.85,sweep:.16,rise:0},{front:12.35,rear:11.78,sweep:.13,rise:.12}],
    tyreProfile:[[-1.1,2.08],[-1.03,2.18],[-.78,2.28],[-.48,2.3],[.48,2.3],[.78,2.28],[1.03,2.18],[1.1,2.08]],
    wheelForward:spec.frontAxle*units,wheelRear:-spec.rearAxle*units,
    wheelSide:spec.trackWidth*units/2,
    tyreRadius:spec.tyreDiameter*units/2, rimRadius:spec.rimDiameter*units/2,
    tyreHalfWidth:spec.tyreWidth*units/2, rimHalfWidth:spec.rimWidth*units/2,
    bodyLengthScale:spec.bodyLengthScale,bodyHeightScale:spec.bodyHeightScale
  };
  carGeometry.tyreProfile=carGeometry.tyreProfile.map(([a,r])=>[
    a*carGeometry.tyreHalfWidth/1.1872,
    carGeometry.rimRadius+(r-1.12)/1.18*(carGeometry.tyreRadius-carGeometry.rimRadius)]);
  const controls=carGeometry.noseControls;
  carGeometry.noseSections=[];
  const tangent=(i,k)=>{
    const a=controls[Math.max(0,i-1)],b=controls[Math.min(controls.length-1,i+1)];
    return (b[k]-a[k])/(b[0]-a[0]);
  };
  for(let i=0;i<controls.length-1;i++) for(let j=0;j<5;j++) {
    const a=controls[i],b=controls[i+1],t=j/5,t2=t*t,t3=t2*t,length=b[0]-a[0];
    carGeometry.noseSections.push([a[0]+length*t,...[1,2].map(k=>
      (2*t3-3*t2+1)*a[k]+(t3-2*t2+t)*length*tangent(i,k)
      +(-2*t3+3*t2)*b[k]+(t3-t2)*length*tangent(i+1,k))]);
  }
  carGeometry.noseSections.push(controls.at(-1));
  // Separate visible parts preserve the open space beside the narrow nose.
  const bodyParts=[[[-9.64,-3.49],[-9.64,3.49],[-8.36,3.49],[-8.36,-3.49]],
    [[-9.4,-3.1],[-9.4,3.1],[-1.2,3.1],[-1.2,-3.1]]];
  for(let i=1;i<carGeometry.noseSections.length;i++) {
    const [a,w]=carGeometry.noseSections[i-1],[b,v]=carGeometry.noseSections[i];
    bodyParts.push([[a,-w-.22],[a,w+.22],[b,v+.22],[b,-v-.22]]);
  }
  for(const side of [-1,1]) {
    bodyParts.push([[-7.8,side*3.1],[-7.8,side*5.1],[2.8,side*4.5],[3,side*2.9]]);
    for(const panel of carGeometry.wingPanels) bodyParts.push(
      [[panel.front-panel.sweep*1.35,side*1.35],[panel.front-panel.sweep*10.25,side*10.25],
        [panel.rear-panel.sweep*.72*10.25,side*10.25],[panel.rear-panel.sweep*.72*1.35,side*1.35]]);
    bodyParts.push([[12.45,side*10.05],[12.4,side*10.28],[11,side*10.28],[11.1,side*10.05]]);
  }
  function carCollisionParts(state) {
    const damage=state.damage || 0,impactSide=state.impactSide || .3;
    const parts=bodyParts.map(part=>part.map(([f,s])=>{
      f*=spec.bodyLengthScale;
      const crush=Math.max(0,f-2)*damage;
      return [f-crush*.55,s+impactSide*crush*.25];
    }));
    for(const axle of [0,1]) for(const side of [-1,1]) {
      const angle=axle===0?(state.steerAngle || 0)+side*damage*.65:0,c=Math.cos(angle),s=Math.sin(angle);
      const crush=axle===0?6.1*damage:0;
      const f=(axle===0?carGeometry.wheelForward:carGeometry.wheelRear)-crush*.55,lateral=side*carGeometry.wheelSide+impactSide*crush*.25;
      const profile=[...carGeometry.tyreProfile.map(([axial,r])=>[r,axial]),
        ...carGeometry.tyreProfile.slice().reverse().map(([axial,r])=>[-r,axial])];
      // Raised sidewall mouldings also belong to the visible wheel.
      const band=carGeometry.rimRadius+(1.88-1.12)/1.18*(carGeometry.tyreRadius-carGeometry.rimRadius);
      for(const axial of [-carGeometry.tyreHalfWidth,carGeometry.tyreHalfWidth]) profile.push([band,axial],[-band,axial]);
      parts.push(convexHull(profile).map(([x,y])=>[f+x*c-y*s,lateral+x*s+y*c]));
    }
    return parts;
  }
  function convexHull(points) {
    const sorted=points.slice().sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    const half=list=>{const out=[];for(const p of list) {
      while(out.length>1) {
        const a=out.at(-2),b=out.at(-1);
        if((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>0) break;
        out.pop();
      }
      out.push(p);
    }return out;};
    return [...half(sorted).slice(0,-1),...half(sorted.reverse()).slice(0,-1)];
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
      impactObstacle(state,contact);
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
  const bonfireSite = world(625,228);
  const parkClearing = (x,z) => [saunaSite,bonfireSite].some(p=>Math.hypot(x-p.x,z-p.y)<110);
  const parkingLots = [
    {minX: 850, minY: 1300, maxX: 1650, maxY: 2150},
    {minX: 1650, minY: 1450, maxX: 2450, maxY: 2200},
    {minX: 2150, minY: 2550, maxX: 3300, maxY: 3700},
    {minX: 3300, minY: 2100, maxX: 4620, maxY: 3050}
  ];
  const inParkingLot = (x,z) => parkingLots.some(p=>x>=p.minX&&x<=p.maxX&&z>=p.minY&&z<=p.maxY);
  const occupied = (x,z) => (parkClearing(x,z) || inParkingLot(x,z) || (x > world(449,0).x && x < world(612,0).x &&
    z > world(0,308).y && z < world(0,427).y) || (x > world(650,0).x && x < world(780,0).x && z > world(0,250).y && z < world(0,425).y) || buildings.some(([bx,by,w,d]) => {
    const p = world(bx,by); return Math.abs(x-p.x)<w*scale/2+18 && Math.abs(z-p.y)<d*scale/2+18;
  }));
  // Drawing and collisions share the same seeded tree positions and trunks.
  let treeSeed = 17;
  const treeRandom = () => { treeSeed = (treeSeed * 1664525 + 1013904223) >>> 0; return treeSeed / 4294967296; };
  const trees = [];
  const treeSpecies = () => {
    const choice=treeRandom();
    if(choice<.48) return 'pine';
    if(choice<.83) return 'birch';
    return 'broadleaf';
  };
  const addTree = (x,y,species) => {
    const profiles={
      pine:{height:145,spread:24,trunk:3.5,color:[.055,.20,.115]},
      birch:{height:125,spread:22,trunk:2.5,color:[.12,.29,.17]},
      broadleaf:{height:82,spread:38,trunk:4.2,color:[.20,.28,.105]}
    };
    const profile=profiles[species],height=profile.height+treeRandom()*profile.height*.34;
    const canopyRadius=profile.spread+treeRandom()*profile.spread*.32;
    const tint=.88+treeRandom()*.24;
    trees.push({x,y,species,height,trunkWidth:profile.trunk+treeRandom()*profile.trunk*.35,
      canopyRadius,color:profile.color.map(value=>value*tint)});
  };
  // The road-edge woods are mixed boreal forest, not evenly spaced ornamental
  // conifers. Two staggered rows approximate the dense pine/birch margins.
  for(let i=0;i<track.length;i+=3) {
    const before=track[(i-1+track.length)%track.length], after=track[(i+1)%track.length];
    const dx=after.x-before.x, dy=after.y-before.y, length=Math.hypot(dx,dy);
    for(const side of [-1,1]) {
      if(i>=18 && i<=42 && side===-1) continue;
      for(const [row,distance] of [[0,145+treeRandom()*35],[1,220+treeRandom()*60]]) {
        if(row && treeRandom()>.76) continue;
        const radialDistance=distance+(treeRandom()-.5)*34;
        const along=(treeRandom()-.5)*82;
        const x=track[i].x-dy/length*radialDistance*side+dx/length*along;
        const y=track[i].y+dx/length*radialDistance*side+dy/length*along;
        if(occupied(x,y) || inLake(x,y) || !outsideTrackClearance(x,y,110) || (x>2850 && y<1200)) continue;
        addTree(x,y,treeSpecies());
      }
    }
  }
  const forestBands = [
    {minX: 0, minY: 1000, maxX: 1250, maxY: 4300, maxTrees:700, species:['pine','birch','pine']},
    {minX: 1450, minY: 3000, maxX: 2600, maxY: 4400, maxTrees:500, species:['birch','pine','broadleaf']},
    {minX: 3000, minY: 900, maxX: 5200, maxY: 4100, maxTrees:1100, species:['pine','broadleaf','birch']}
  ];
  for(const band of forestBands) {
    for(let i=0, added=0; i<band.maxTrees*5 && added<band.maxTrees; i++) {
      const x = band.minX + treeRandom()*(band.maxX-band.minX);
      const y = band.minY + treeRandom()*(band.maxY-band.minY);
      if(occupied(x,y) || inParkingLot(x,y) || inLake(x,y) || !outsideTrackClearance(x,y,110) || (x>2850 && y<1200)) continue;
      const choice = Math.floor(treeRandom()*band.species.length);
      addTree(x,y,band.species[choice]);
      added++;
    }
  }
  // Keep the closest 428 of the original 2,428 trees: remove 2,000 trees
  // from the distant woods, preserving the dense margin along the circuit.
  // Filter after generation so surviving positions, species and sizes stay fixed.
  const distanceToTrack = tree => {
    let distanceSquared=Infinity;
    for(let i=0;i<track.length;i++) {
      const a=track[i],b=track[(i+1)%track.length],dx=b.x-a.x,dy=b.y-a.y;
      const t=Math.max(0,Math.min(1,((tree.x-a.x)*dx+(tree.y-a.y)*dy)/(dx*dx+dy*dy)));
      const x=tree.x-a.x-dx*t,y=tree.y-a.y-dy*t;
      distanceSquared=Math.min(distanceSquared,x*x+y*y);
    }
    return distanceSquared;
  };
  const nearTrees=new Set(trees.map(tree=>({tree,distance:distanceToTrack(tree)}))
    .sort((a,b)=>a.distance-b.distance).slice(0,428).map(entry=>entry.tree));
  for(let i=trees.length-1;i>=0;i--)
    if(!nearTrees.has(trees[i])) trees.splice(i,1);
  const treeBounds=trees.map(tree=>({minX:tree.x-tree.trunkWidth/2,maxX:tree.x+tree.trunkWidth/2,
    minY:tree.y-tree.trunkWidth/2,maxY:tree.y+tree.trunkWidth/2}));
  // Approximate older everyday cars: dimensions are world units (10 per metre).
  // Distinct profiles, not licensed replicas or current showroom models.
  const studentCarModels=[
    {kind:'small-hatch',length:35.5,width:16.2,height:14.5,roofFront:.02,roofRear:-.27,rearBase:-.43,roundLights:true},
    {kind:'compact-hatch',length:40.5,width:17,height:14.2,roofFront:.01,roofRear:-.24,rearBase:-.43},
    {kind:'sedan',length:43.5,width:17,height:13.9,roofFront:.01,roofRear:-.20,rearBase:-.32},
    {kind:'boxy-wagon',length:46,width:17.4,height:14.6,roofFront:.03,roofRear:-.38,rearBase:-.46,roofRails:true},
    {kind:'liftback',length:43,width:17,height:14.1,roofFront:.02,roofRear:-.19,rearBase:-.43},
    {kind:'rounded-hatch',length:39,width:16.8,height:14.7,roofFront:.01,roofRear:-.25,rearBase:-.43,roundLights:true}
  ];
  const studentCarColors=[[.61,.64,.65],[.13,.19,.27],[.39,.10,.095],[.18,.28,.22],
    [.72,.71,.65],[.16,.17,.18],[.42,.46,.51],[.55,.38,.22],[.25,.31,.43]];
  const campusCars=[];
  for(const row of [514,555,590]) for(let z=359;z<414;z+=8) {
    if((Math.round(z)+row)%3===0) continue;
    const index=campusCars.length,model=studentCarModels[(index*5+Math.floor(index/6))%studentCarModels.length];
    const angle=(row===555 ? Math.PI : 0)+((index%3)-1)*.025;
    campusCars.push({row:row+(index%3-1)*.2,z:z+3+(index%4-1.5)*.12,
      model,kind:model.kind,width:(model.length+1.1)/scale,depth:(model.width+2.7)/scale,angle,
      color:studentCarColors[(index*4+Math.floor(index/5))%studentCarColors.length],
      worn:index%4===0,steelWheels:index%3!==0});
  }
  const lakesideSite=world(687,365), diagonal=Math.SQRT1_2;
  const lakesideCars=[[-108,25,[.45,.12,.1]],[-78,25,[.18,.2,.23]],[-48,25,[.5,.51,.46]],
    [80,15,[.57,.59,.55]],[111,15,[.85,.85,.8]],[143,15,[.16,.19,.2]],[105,-35,[.7,.7,.65]]];
  const footprint=(x,y,width,depth,angle=0)=>({minX:x-width/2,maxX:x+width/2,
    minY:y-depth/2,maxY:y+depth/2,angle});
  const vehicleBounds=campusCars.map(car=>{
    const p=world(car.row,car.z);
    return footprint(p.x,p.y,car.width*scale,car.depth*scale,car.angle);
  });
  for(const [index,[side,forward]] of lakesideCars.entries()) {
    const model=studentCarModels[(index+2)%studentCarModels.length];
    vehicleBounds.push(footprint(lakesideSite.x+(side+forward)*diagonal,
      lakesideSite.y+(side-forward)*diagonal,model.width+2.7,model.length+1.1,Math.PI/4));
  }
  // Include the lakeside tractor and the sauna truck as stationary vehicles.
  vehicleBounds.push(footprint(lakesideSite.x+(-153+22)*diagonal,
    lakesideSite.y+(-153-22)*diagonal,37.3,56,Math.PI/4));
  vehicleBounds.push(footprint(saunaSite.x,saunaSite.y,68,24,-3*Math.PI/4));
  // Protect the first-corner sign with stacked used tyres outside the kerb.
  const signSite=world(479,212);
  let signRoadPoint,signRoadDistance=Infinity,signTangent;
  for(let i=0;i<track.length;i++) {
    const a=track[i],b=track[(i+1)%track.length],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((signSite.x-a.x)*dx+(signSite.y-a.y)*dy)/(dx*dx+dy*dy)));
    const point={x:a.x+dx*t,y:a.y+dy*t},distance=Math.hypot(signSite.x-point.x,signSite.y-point.y);
    if(distance<signRoadDistance) {
      signRoadDistance=distance; signRoadPoint=point;
      const length=Math.hypot(dx,dy); signTangent={x:dx/length,y:dy/length};
    }
  }
  const signNormal={x:(signSite.x-signRoadPoint.x)/signRoadDistance,y:(signSite.y-signRoadPoint.y)/signRoadDistance};
  const protectedSignSite={x:signRoadPoint.x+signNormal.x*64,y:signRoadPoint.y+signNormal.y*64};
  // Wrap the road-facing half of the pole and return both ends behind it.
  // The upstream return blocks approaches that could bypass a straight wall.
  const barrierOffsets=[];
  for(let i=3;i>=1;i--) barrierOffsets.push([-19,i*19/3]);
  for(let i=0;i<=9;i++) {
    const angle=Math.PI*i/9;
    barrierOffsets.push([-19*Math.cos(angle),-19*Math.sin(angle)]);
  }
  for(let i=1;i<=3;i++) barrierOffsets.push([19,i*19/3]);
  const tyreBarrier=barrierOffsets.map(([along,outward])=>({
    x:protectedSignSite.x+signNormal.x*outward+signTangent.x*along,
    y:protectedSignSite.y+signNormal.y*outward+signTangent.y*along,
    radius:3.8,height:3.1,layers:3
  }));
  const tyreBarrierBounds=tyreBarrier.map(tyre=>({
    ...footprint(tyre.x,tyre.y,tyre.radius*2,tyre.radius*2),impactMaterial:'tyres'
  }));
  const poolSite={x:saunaSite.x-57*diagonal,y:saunaSite.y-57*diagonal};
  const poolBounds=footprint(poolSite.x,poolSite.y,28,28);
  const peopleBounds=[];
  const obstacleBounds=[...buildingBounds,...saleAccessBounds,...treeBounds,...vehicleBounds,...tyreBarrierBounds,poolBounds];
  // SI velocities and masses; only positions and mesh coordinates use world units.
  const bodies=[];
  function makeBody(bounds,kind,mass=Infinity) {
    const body={bounds,kind,mass,x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2,
      angle:bounds.angle||0,vx:0,vy:0,spin:0,damage:0,bend:0,bendVelocity:0,dents:[]};
    body.origin={x:body.x,y:body.y,angle:body.angle};
    body.spawn={...body.origin};
    body.width=bounds.maxX-bounds.minX;body.depth=bounds.maxY-bounds.minY;
    Object.defineProperty(bounds,'body',{value:body,enumerable:false});bodies.push(body);return body;
  }
  buildingBounds.forEach(b=>makeBody(b,'wall'));
  treeBounds.forEach((b,i)=>{Object.defineProperty(trees[i],'body',{value:makeBody(b,'tree'),enumerable:false});});
  saleAccessBounds.forEach(b=>makeBody(b,'wall'));
  vehicleBounds.forEach((b,i)=>makeBody(b,i===vehicleBounds.length-1?'sauna':'car',
    i===vehicleBounds.length-1?3500:i===vehicleBounds.length-2?4200:1200));
  const poolBody=makeBody(poolBounds,'pool',2200);
  function registerPerson(index,x,y) {
    if(peopleBounds[index]) return peopleBounds[index].body;
    const bounds=footprint(x,y,5,5);peopleBounds[index]=bounds;obstacleBounds.push(bounds);
    return makeBody(bounds,'person',80);
  }
  function updateBounds(body) {
    const b=body.bounds;b.minX=body.x-body.width/2;b.maxX=body.x+body.width/2;
    b.minY=body.y-body.depth/2;b.maxY=body.y+body.depth/2;b.angle=body.angle;
  }
  function impactObstacle(car,contact) {
    const b=contact.body;if(!b) return;
    const n=contact.normal,c=Math.cos(car.angle),s=Math.sin(car.angle);
    const speed=Math.max(0,-(((car.vx||0)*c-(car.vy||0)*s-b.vx)*n.x+
      ((car.vx||0)*s+(car.vy||0)*c-b.vy)*n.y));
    const inverseMass=Number.isFinite(b.mass)?1/b.mass:0;
    const impulse=speed/(1/spec.mass+inverseMass);
    contact.impulse=impulse;contact.relativeSpeed=speed;
    if(speed<.05) return;
    b.vx-=n.x*impulse*inverseMass;b.vy-=n.y*impulse*inverseMass;
    const px=car.x-n.x*12,py=car.y-n.y*12;
    const energy=.5*impulse*speed;
    const threshold=b.kind==='wall'?120000:b.kind==='tree'?70000:b.kind==='person'?1800:35000;
    const severity=Math.max(0,energy-150)/threshold;
    b.damage=Math.min(1,b.damage+severity);
    b.direction={x:-n.x,y:-n.y};
    if(b.kind==='tree') b.bendVelocity+=Math.min(2,impulse/18000);
    if(inverseMass) {
      const inertia=b.mass*((b.width*spec.metresPerWorldUnit)**2+(b.depth*spec.metresPerWorldUnit)**2)/12;
      b.spin+=Math.max(-2,Math.min(2,((px-b.x)*-n.y-(py-b.y)*-n.x)*spec.metresPerWorldUnit*impulse/inertia));
    }
    if(severity>0 && b.kind!=='person' && b.kind!=='tree') {
      // Keep bounded local contact patches; repeated hits deepen the same dent.
      const co=Math.cos(b.angle),si=Math.sin(b.angle),dx=px-b.x,dy=py-b.y;
      const dent={x:Math.max(-b.width/2,Math.min(b.width/2,dx*co+dy*si)),
        y:Math.max(-b.depth/2,Math.min(b.depth/2,-dx*si+dy*co)),
        nx:-n.x*co-n.y*si,ny:n.x*si-n.y*co,depth:Math.min(5,severity*6)};
      const old=b.dents.find(d=>Math.hypot(d.x-dent.x,d.y-dent.y)<12);
      if(old) old.depth=Math.min(6,old.depth+dent.depth);else {b.dents.push(dent);if(b.dents.length>8)b.dents.shift();}
    }
  }
  function overlap(a,b) {
    const dx=b.x-a.x,dy=b.y-a.y;
    if(Math.hypot(dx,dy)>Math.hypot(a.width,a.depth)/2+Math.hypot(b.width,b.depth)/2)return false;
    let depth=Infinity,normal;
    for(const angle of [a.angle,b.angle]) for(const turn of [0,Math.PI/2]) {
      const x=Math.cos(angle+turn),y=Math.sin(angle+turn);
      const extent=p=>Math.abs(Math.cos(p.angle)*x+Math.sin(p.angle)*y)*p.width/2+
        Math.abs(-Math.sin(p.angle)*x+Math.cos(p.angle)*y)*p.depth/2;
      const distance=dx*x+dy*y,gap=extent(a)+extent(b)-Math.abs(distance);
      if(gap<=0)return false;
      if(gap<depth){depth=gap;normal={x:x*Math.sign(distance||1),y:y*Math.sign(distance||1)};}
    }
    return {depth,normal};
  }
  function overlapCarPart(body,car,part) {
    const c=Math.cos(car.angle),s=Math.sin(car.angle);
    const points=part.map(([x,y])=>[car.x-body.x+x*c-y*s,car.y-body.y+x*s+y*c]);
    const bc=Math.cos(body.angle),bs=Math.sin(body.angle),axes=[[bc,bs],[-bs,bc]];
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(length>1e-8)axes.push([-(b[1]-a[1])/length,(b[0]-a[0])/length]);
    }
    let depth=Infinity,normal;
    for(const [x,y] of axes) {
      const extent=Math.abs(x*bc+y*bs)*body.width/2+Math.abs(-x*bs+y*bc)*body.depth/2;
      const values=points.map(p=>p[0]*x+p[1]*y),low=Math.min(...values),high=Math.max(...values);
      if(low>=extent || high<=-extent)return false;
      const positive=extent-low,negative=high+extent,penetration=Math.min(positive,negative);
      if(penetration<depth){depth=penetration;const direction=positive<negative?1:-1;normal={x:x*direction,y:y*direction};}
    }
    return {depth,normal};
  }
  function stepObstacles(seconds,car,onImpact) {
    const duration=Math.max(0,Math.min(seconds,.1));
    const motion=bodies.reduce((max,b)=>Number.isFinite(b.mass)?Math.max(max,
      Math.hypot(b.vx,b.vy)/spec.metresPerWorldUnit+Math.abs(b.spin)*Math.hypot(b.width,b.depth)/2):max,0);
    const steps=Math.max(1,Math.ceil(duration*Math.max(90,motion*4))),dt=duration/steps;
    for(let i=0;i<steps;i++) for(const b of bodies) {
      if(b.kind==='tree') {
        const target=b.damage*.65;
        b.bendVelocity+=((target-b.bend)*14-b.bendVelocity*5)*dt;
        b.bend=Math.max(0,Math.min(1,b.bend+b.bendVelocity*dt));continue;
      }
      if(!Number.isFinite(b.mass)||Math.abs(b.vx)+Math.abs(b.vy)+Math.abs(b.spin)<.001)continue;
      b.x+=b.vx*dt/spec.metresPerWorldUnit;b.y+=b.vy*dt/spec.metresPerWorldUnit;b.angle+=b.spin*dt;
      if(car) {
        // The target can also strike the player while the player is stationary.
        // Use separate visible car parts so the open nose gaps stay clear.
        for(const part of carCollisionParts(car)) {
          if(Math.hypot(b.x-car.x,b.y-car.y)>Math.hypot(b.width,b.depth)/2+30)break;
          const hit=overlapCarPart(b,car,part);if(!hit)continue;
          b.x-=hit.normal.x*(hit.depth+.001);b.y-=hit.normal.y*(hit.depth+.001);
          const normal=hit.normal,contact={body:b,normal,impactMaterial:b.bounds.impactMaterial};
          impactObstacle(car,contact);onImpact?.(contact);updateBounds(b);break;
        }
      }
      for(const other of bodies) {
        if(other===b)continue;
        const hit=overlap(b,other);if(!hit)continue;
        const n=hit.normal,inv=Number.isFinite(other.mass)?1/other.mass:0;
        b.x-=n.x*(hit.depth+.001);b.y-=n.y*(hit.depth+.001);
        const closing=(b.vx-other.vx)*n.x+(b.vy-other.vy)*n.y;
        if(closing>0) {
          const impulse=closing/(1/b.mass+inv);
          b.vx-=n.x*impulse/b.mass;b.vy-=n.y*impulse/b.mass;
          other.vx+=n.x*impulse*inv;other.vy+=n.y*impulse*inv;
          const damage=Math.max(0,.5*impulse*closing-150)/35000;
          b.damage=Math.min(1,b.damage+damage);other.damage=Math.min(1,other.damage+damage);
        }
        b.spin*=.4;
      }
      const drag=Math.exp(-(b.kind==='person'?3:1.7)*dt);
      b.vx*=drag;b.vy*=drag;b.spin*=Math.exp(-3*dt);updateBounds(b);
    }
  }
  function resetObstacles() {
    for(const b of bodies) {
      b.origin={...b.spawn};b.pose=undefined;
      Object.assign(b,{...b.origin,vx:0,vy:0,spin:0,damage:0,bend:0,bendVelocity:0,dents:[],direction:undefined});updateBounds(b);
    }
  }
  function movePerson(body,x,y,pose) {
    if(body.direction)return;
    body.x=x;body.y=y;body.origin.x=x;body.origin.y=y;body.pose=pose;updateBounds(body);
  }
  function placeBody(body,x,y) {
    body.x=x;body.y=y;body.origin={x,y,angle:body.angle};body.spawn={...body.origin};updateBounds(body);
  }
  function deformPoint(body,x,height,y) {
    const o=body.origin,c=Math.cos(o.angle),s=Math.sin(o.angle);
    let f=(x-o.x)*c+(y-o.y)*s,l=-(x-o.x)*s+(y-o.y)*c;
    for(const d of body.dents) {
      const weight=Math.max(0,1-Math.hypot(f-d.x,l-d.y)/22)*Math.max(0,1-Math.abs(height-6)/22);
      f+=d.nx*d.depth*weight;l+=d.ny*d.depth*weight;
    }
    const co=Math.cos(body.angle),si=Math.sin(body.angle);
    let wx=body.x+f*co-l*si,wy=body.y+f*si+l*co,h=height;
    if(body.kind==='tree' || body.kind==='person') {
      const angle=body.kind==='tree'?body.bend:body.damage*Math.PI*.48;
      const direction=body.direction||{x:0,y:0};
      wx+=direction.x*height*Math.sin(angle);wy+=direction.y*height*Math.sin(angle);
      h=height*Math.cos(angle);
    }
    return [wx,h,wy];
  }
  const resolveBuildingCollision=(state,previous,onImpact)=>resolveBoundsCollision(state,previous,buildingBounds,onImpact);
  const resolveObstacleCollision=(state,previous,onImpact)=>resolveBoundsCollision(state,previous,obstacleBounds,onImpact);
  function build({box,quad,materialBox=box,objectGeometry=(body,draw)=>draw()}) {
    const block = (x,z,w,d,h,color,y=0,material) => { const p=world(x,z); (material ? materialBox : box)(p.x,y,p.y,w*scale,h,d*scale,color,material); };
    const windowPane = (x,y,z,side,shade) => {
      const alongX=side==='z';
      const frame=[.12,.16,.17],sill=[.53,.54,.51];
      // Dark recess, projecting sill and a narrow mullion give the glass depth.
      box(x,y-.6,z,alongX?12.4:1.1,9.2,alongX?1.1:12.4,frame);
      materialBox(x,y,z,alongX?11:1.25,8,alongX?1.25:11,shade,'glass');
      box(x,y-.85,z,alongX?13:1.65,.45,alongX?1.65:13,sill);
      box(x,y,z,alongX?.35:1.4,8,alongX?1.4:.35,frame);
    };
    function studentCar(point,car) {
      const model=car.model,L=model.length,W=model.width,H=model.height;
      const color=car.color,black=[.055,.06,.065],trim=[.11,.12,.13];
      const belt=8.5,half=W/2,roofHalf=half*.82;
      const frontBase=L*.20,rearBase=L*model.rearBase;
      const roofFront=L*model.roofFront,roofRear=L*model.roofRear;
      const p=(f,s,h)=>point(f,s,h);
      const face=(points,c)=>quad(...points.map(v=>p(...v)),c);
      const cuboid=(f,s,y,length,width,height,c)=>{
        const a=f-length/2,b=f+length/2,l=s-width/2,r=s+width/2,t=y+height;
        face([[a,l,t],[b,l,t],[b,r,t],[a,r,t]],c);
        face([[b,l,y],[a,l,y],[a,l,t],[b,l,t]],c.map(v=>v*.84));
        face([[a,r,y],[b,r,y],[b,r,t],[a,r,t]],c.map(v=>v*.91));
        face([[a,l,y],[a,r,y],[a,r,t],[a,l,t]],c.map(v=>v*.78));
        face([[b,r,y],[b,l,y],[b,l,t],[b,r,t]],c);
      };
      const glass=(corners)=>{
        face(corners,trim);
        const center=corners[0].map((_,i)=>corners.reduce((sum,v)=>sum+v[i],0)/4);
        const a=corners[1].map((v,i)=>v-corners[0][i]),b=corners[2].map((v,i)=>v-corners[0][i]);
        let normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
        const length=Math.hypot(...normal)||1,sign=normal.reduce((sum,v,i)=>sum+v*center[i],0)<0?-1:1;
        normal=normal.map(v=>v/length*sign*.045);
        const inset=corners.map(v=>v.map((value,i)=>center[i]+(value-center[i])*.88+normal[i]));
        const low=inset[0].map((v,i)=>(v+inset[3][i])*.5),high=inset[1].map((v,i)=>(v+inset[2][i])*.5);
        face([inset[0],inset[1],high,low],[.16,.26,.30]);
        face([low,high,inset[2],inset[3]],[.32,.45,.51]);
      };
      const frontAxle=L*.29,rearAxle=-L*.30,radius=model.kind==='small-hatch'?2.8:3.05;
      const bodyTop=f=>f>frontBase ? belt+(6.5-belt)*(f-frontBase)/(L/2-frontBase)
        : f<rearBase ? belt+(7-belt)*(rearBase-f)/(rearBase+L/2) : belt;
      face([[-L*.46,-half*.95,.15],[L*.46,-half*.95,.15],[L*.46,half*.95,.15],[-L*.46,half*.95,.15]],[.12,.13,.13]);
      // Side panels follow the wheel openings instead of covering the tyres.
      for(const side of [-1,1]) {
        const s=side*half;
        const arch=radius+0.55;
        for(const [a,b] of [[-L/2,rearAxle-arch],[rearAxle+arch,frontAxle-arch],[frontAxle+arch,L/2]])
          face([[a,s,3.1],[b,s,3.1],[b,s,bodyTop(b)],[a,s,bodyTop(a)]],color);
        for(const axle of [rearAxle,frontAxle]) for(let i=0;i<8;i++) {
          const a=Math.PI-i*Math.PI/8,b=Math.PI-(i+1)*Math.PI/8;
          const x0=axle+Math.cos(a)*arch,x1=axle+Math.cos(b)*arch;
          const y0=radius+.5+Math.sin(a)*arch,y1=radius+.5+Math.sin(b)*arch;
          face([[x0,s,y0],[x1,s,y1],[x1,s,bodyTop(x1)],[x0,s,bodyTop(x0)]],color);
        }
        cuboid(0,s+side*.04,4.5,L*.92,.13,.35,trim);
        // Painted cabin surround and glazed side windows.
        face([[frontBase,s,belt],[roofFront,side*roofHalf,H],[roofRear,side*roofHalf,H],[rearBase,s,belt]],color);
        glass([[rearBase+.5,s+side*.025,belt+.6],[frontBase-.6,s+side*.025,belt+.6],
          [roofFront-.4,side*(roofHalf+.025),H-.5],[roofRear+.4,side*(roofHalf+.025),H-.5]]);
        const pillar=-L*.115;
        face([[pillar-.32,s+side*.08,belt+.5],[pillar+.32,s+side*.08,belt+.5],
          [pillar+.32,side*(roofHalf+.08),H-.45],[pillar-.32,side*(roofHalf+.08),H-.45]],trim);
        for(const door of [L*.03,-L*.23]) {
          cuboid(door,s+side*.15,7.6,1.35,.22,.32,trim);
          cuboid(door-1.7,s+side*.02,4.9,.10,.10,3.4,color.map(v=>v*.67));
        }
        cuboid(frontBase-.7,s+side*.7,9,1.9,1.3,.85,car.worn?trim:color);
        // A small weathered sill patch on a few older cars.
        if(car.worn) cuboid(-L*.18,s+side*.07,3.25,2.8,.14,.6,[.28,.17,.105]);
      }
      // Tapered nose, bonnet, roof and model-specific rear profile.
      face([[L/2,-half*.92,6.5],[L/2,half*.92,6.5],[frontBase,half,belt],[frontBase,-half,belt]],color);
      face([[-L/2,half*.94,7],[-L/2,-half*.94,7],[rearBase,-half,belt],[rearBase,half,belt]],color);
      face([[roofFront,-roofHalf,H],[roofFront,roofHalf,H],[roofRear,roofHalf,H],[roofRear,-roofHalf,H]],color);
      glass([[frontBase,-half,belt],[frontBase,half,belt],[roofFront,roofHalf,H],[roofFront,-roofHalf,H]]);
      glass([[rearBase,half,belt],[rearBase,-half,belt],[roofRear,-roofHalf,H],[roofRear,roofHalf,H]]);
      for(const end of [-1,1]) {
        const f=end*L/2;
        cuboid(f-end*.5,0,3.1,1,W*.94,3.2,color);
        cuboid(f,0,3.8,.7,W*.96,1.1,car.worn?trim:color.map(v=>v*.73));
        // Simple white European plates, dark grille and asymmetric lamp colours.
        cuboid(f+end*.4,0,4.9,.10,3.8,.8,[.85,.85,.78]);
        cuboid(f+end*.47,-1.65,4.9,.08,.35,.8,[.10,.24,.53]);
        if(end===1) cuboid(f+.4,0,6,.15,5.5,.65,black);
        for(const side of [-1,1]) {
          const lampWidth=model.roundLights?2.1:3.8;
          if(end===1 && model.roundLights) {
            for(let i=0;i<10;i++) {
              const a=i*Math.PI/5,b=(i+1)*Math.PI/5,s=side*(half-2.3);
              const center=[f+.44,s,6.0];
              face([center,[f+.44,s+Math.cos(a)*.94,6+Math.sin(a)*.78],
                [f+.44,s+Math.cos(b)*.94,6+Math.sin(b)*.78],center],[.78,.79,.69]);
            }
          } else cuboid(f+end*.3,side*(half-2.3),6.0,.25,lampWidth,1.35,end===1?[.78,.79,.69]:[.64,.065,.045]);
          cuboid(f+end*.43,side*(half-1.0),5.95,.09,.55,1.1,[.78,.39,.09]);
        }
      }
      if(model.roofRails) for(const side of [-1,1]) cuboid((roofFront+roofRear)/2,side*roofHalf*.82,H+.2,roofFront-roofRear,.35,.4,trim);
      // Twelve-sided rubber tyres, inset steel/alloy hubs and radial spokes.
      for(const axle of [frontAxle,rearAxle]) for(const side of [-1,1]) {
        const inner=side*(half-1.0),outer=side*(half+.65),hub=outer+side*.035;
        for(let i=0;i<12;i++) {
          const a=i*Math.PI/6,b=(i+1)*Math.PI/6;
          const ring=(s,r,angle)=>[axle+Math.cos(angle)*r,s,radius+.5+Math.sin(angle)*r];
          face([ring(inner,radius,a),ring(inner,radius,b),ring(outer,radius,b),ring(outer,radius,a)],black);
          face([[axle,outer,radius+.5],ring(outer,radius,a),ring(outer,radius,b),[axle,outer,radius+.5]],black);
          face([[axle,hub,radius+.5],ring(hub,radius*.60,a),ring(hub,radius*.60,b),[axle,hub,radius+.5]],car.steelWheels?[.25,.27,.28]:[.59,.61,.60]);
        }
        for(let i=0;i<6;i++) {
          const a=i*Math.PI/3;
          face([[axle,hub+side*.02,radius+.5],
            [axle+Math.cos(a-.10)*radius*.49,hub+side*.02,radius+.5+Math.sin(a-.10)*radius*.49],
            [axle+Math.cos(a+.10)*radius*.49,hub+side*.02,radius+.5+Math.sin(a+.10)*radius*.49],
            [axle,hub+side*.02,radius+.5]],car.steelWheels?black:[.76,.77,.75]);
        }
      }
    }
    // Park gathering clearings and the Wappunotski fire ring.
    for(const site of [saunaSite,bonfireSite]) {
      box(site.x,-.05,site.y,150,.12,130,[.35,.32,.23]);
    }
    for(let i=0;i<16;i++) {
      const angle=i*Math.PI/8;
      box(bonfireSite.x+Math.cos(angle)*17,0,bonfireSite.y+Math.sin(angle)*17,5,3,5,[.32,.34,.31]);
    }
    for(const offset of [-5,0,5]) {
      box(bonfireSite.x+offset,2,bonfireSite.y,3,3,24,[.22,.13,.07]);
      box(bonfireSite.x,5,bonfireSite.y+offset,24,3,3,[.29,.17,.08]);
    }
    for(let i=0;i<7;i++) {
      const angle=i*Math.PI*2/7, x=bonfireSite.x+Math.cos(angle)*8,z=bonfireSite.y+Math.sin(angle)*8;
      const height=12+(i%3)*4;
      quad([x-3,8,z],[x+3,8,z],[x+1,height+8,z],[x,height+10,z],[1,.38,.04]);
      quad([x,8,z-2],[x,8,z+2],[x,height+3,z],[x,height+3,z],[1,.72,.12]);
    }
    for(const side of [-1,1]) {
      box(bonfireSite.x+side*42,5,bonfireSite.y,8,2,55,[.43,.27,.13]);
      for(const end of [-19,19]) box(bonfireSite.x+side*42,0,bonfireSite.y+end,5,5,5,[.27,.19,.11]);
    }
    // Lake and shore lie to the northeast of the campus loop.
    const lake = lakeOutline.map(p=>[p.x,-.12,p.y]);
    for(let i=1;i<lake.length-1;i++) quad(lake[0],lake[i],lake[i+1],lake[i+1],[.12,.36,.45]);
    // Lakeside scene from the 31 Yliopistonkatu reference, looking northeast.
    // Local forward points NE; lateral points SE, parallel to Yliopistonkatu.
    const lakeside = lakesideSite;
    const local = (side,forward,height) => [lakeside.x+(side+forward)*diagonal,height,lakeside.y+(side-forward)*diagonal];
    function prism(side,forward,width,depth,bottom,height,color) {
      const p=(s,f,h)=>local(s,f,h);
      const s0=side-width/2,s1=side+width/2,f0=forward-depth/2,f1=forward+depth/2,h=bottom+height;
      quad(p(s0,f0,h),p(s1,f0,h),p(s1,f1,h),p(s0,f1,h),color);
      quad(p(s0,f0,bottom),p(s1,f0,bottom),p(s1,f0,h),p(s0,f0,h),color.map(v=>v*.8));
      quad(p(s1,f1,bottom),p(s0,f1,bottom),p(s0,f1,h),p(s1,f1,h),color.map(v=>v*.8));
      quad(p(s0,f1,bottom),p(s0,f0,bottom),p(s0,f0,h),p(s0,f1,h),color.map(v=>v*.65));
      quad(p(s1,f0,bottom),p(s1,f1,bottom),p(s1,f1,h),p(s1,f0,h),color.map(v=>v*.65));
    }
    prism(0,5,370,140,0,.2,[.34,.34,.31]);
    prism(35,110,45,110,0,.23,[.37,.36,.32]);
    const blue=[.04,.25,.7], metal=[.09,.27,.62], lines=[.88,.91,.88];
    // Two separate 10 ? 20 m courts, with open cage geometry for lake visibility.
    for(const center of [-160,-40]) {
      prism(center,205,100,200,0,.3,blue);
      for(const edge of [-50,50]) {
        prism(center+edge,205,1,200,.4,.2,lines);
        for(let forward=105;forward<=305;forward+=25) prism(center+edge,forward,1.6,1.6,0,40,metal);
        for(const height of [10,20,30,40]) prism(center+edge,205,.8,200,height,.7,metal);
      }
      for(const end of [105,305]) {
        prism(center,end,100,1,.4,.2,lines);
        for(let side=-50;side<=50;side+=10) prism(center+side,end,.65,.65,0,40,metal);
        for(const height of [10,20,30,40]) prism(center,end,100,.8,height,.7,metal);
      }
      for(const service of [135,275]) prism(center,service,100,1,.4,.2,lines);
      prism(center,205,1,140,.4,.2,lines);
      for(const edge of [-51,51]) prism(center+edge,205,2,2,0,11,[.12,.14,.14]);
      for(let side=-50;side<=50;side+=4) prism(center+side,205,.35,.4,.4,9,[.25,.28,.27]);
      for(const height of [3,6,9]) prism(center,205,100,.4,height,.35,[.25,.28,.27]);
      prism(center,205,102,.6,10,1,lines);
    }
    function parkedCar(side,forward,color,index) {
      studentCar((f,s,h)=>local(side+s,forward+f,h),{
        model:studentCarModels[(index+2)%studentCarModels.length],color,worn:index%3===0,steelWheels:index%3!==1
      });
    }
    for(const [index,[side,forward,color]] of lakesideCars.entries())
      objectGeometry(vehicleBounds[campusCars.length+index].body,()=>parkedCar(side,forward,color,index));
    // Reference tractor: orange enclosed cab, orange rims and rear safety triangle.
    objectGeometry(vehicleBounds[vehicleBounds.length-2].body,()=>{
    const tractorOrange=[1,.19,.025], tractorDark=[.12,.13,.12], tractorGlass=[.22,.34,.35];
    prism(-153,24,22,38,8,6,tractorDark);
    prism(-153,34,17,23,14,11,tractorOrange);
    prism(-153,10,22,20,17,7,tractorOrange);
    // Individual panes leave the orange frame visible on all four sides.
    prism(-153,10,19,17,24,15,tractorGlass);
    for(const edge of [-11,11]) for(const forward of [0,20])
      prism(-153+edge,forward,1.6,1.6,23,17,tractorOrange);
    for(const forward of [0,20]) {
      prism(-153,forward,23,1.6,23,1.3,tractorOrange);
      prism(-153,forward,23,1.6,38.5,1.5,tractorOrange);
      prism(-153,forward+(forward===0?-.85:.85),20,.35,24,1,[.045,.055,.05]);
    }
    for(const edge of [-11,11]) {
      prism(-153+edge,10,1.6,21,23,1.3,tractorOrange);
      prism(-153+edge,10,1.6,21,38.5,1.5,tractorOrange);
      prism(-153+edge,11,.9,1,24,15,tractorOrange);
      // Flat orange fenders over the large rear tyres, with rear light clusters.
      prism(-153+edge*1.25,7,8,25,26.5,1.5,tractorOrange);
      prism(-153+edge*1.25,-5.65,6,.65,25,2.4,tractorDark);
      prism(-153+edge*1.25-1,-6.05,2.3,.25,25.3,1.7,[.65,.025,.015]);
      prism(-153+edge*1.25+1.5,-6.05,1.6,.25,25.3,1.7,[1,.48,.03]);
      prism(-153+edge*1.25,22,3,7,11,1,tractorDark);
    }
    prism(-153,10,26,24,40,2,tractorOrange);
    prism(-153,-2.15,7,.35,39,1.7,[.65,.57,.3]);
    prism(-145,36,1.8,1.8,22,19,tractorDark);
    prism(-145,36,2.4,2.4,41,1,tractorDark);
    prism(-153,45.65,15,.5,15,8,tractorDark);
    for(const edge of [-6,6]) prism(-153+edge,46,3,.5,21,2,[.86,.86,.7]);
    // Reflective slow-vehicle triangle on the back, raised clear of the hitch.
    const rearTriangle=(f,inset,color)=>quad(local(-153,-2.5+f,29-inset),
      local(-159+inset,-2.5+f,19+inset),local(-147-inset,-2.5+f,19+inset),
      local(-147-inset,-2.5+f,19+inset),color);
    rearTriangle(0,0,[.45,.025,.015]);
    rearTriangle(-.1,1,[.95,.82,.57]);
    prism(-153,-3,5,6,8,8,tractorDark);
    for(const edge of [-5,5]) {
      prism(-153+edge,-6,1.5,9,5,2,[.27,.28,.25]);
      prism(-153+edge,-9,2.3,2,5,3,[.36,.34,.26]);
    }
    function tractorWheel(side,forward,radius,width) {
      for(let i=0;i<20;i++) {
        const a=i*Math.PI/10,b=(i+1)*Math.PI/10;
        for(const edge of [-width/2,width/2])
          quad(local(side+edge,forward,radius),local(side+edge,forward+Math.cos(a)*radius,radius+Math.sin(a)*radius),
               local(side+edge,forward+Math.cos(b)*radius,radius+Math.sin(b)*radius),local(side+edge,forward,radius),[.07,.075,.065]);
        quad(local(side-width/2,forward+Math.cos(a)*radius,radius+Math.sin(a)*radius),
             local(side+width/2,forward+Math.cos(a)*radius,radius+Math.sin(a)*radius),
             local(side+width/2,forward+Math.cos(b)*radius,radius+Math.sin(b)*radius),
             local(side-width/2,forward+Math.cos(b)*radius,radius+Math.sin(b)*radius),[.1,.105,.09]);
      }
      // Round orange rims sit on the outer tyre faces; raised diagonal tread
      // blocks make the rear wheels read as agricultural tyres at close range.
      for(const edge of [-1,1]) for(let i=0;i<20;i++) {
        const a=i*Math.PI/10,b=(i+1)*Math.PI/10,r=radius*.48;
        quad(local(side+edge*(width/2+.12),forward,radius),
          local(side+edge*(width/2+.12),forward+Math.cos(a)*r,radius+Math.sin(a)*r),
          local(side+edge*(width/2+.12),forward+Math.cos(b)*r,radius+Math.sin(b)*r),
          local(side+edge*(width/2+.12),forward,radius),tractorOrange);
      }
      prism(side,forward,width+.5,radius*.19,radius*.905,radius*.19,[.32,.29,.22]);
      for(let i=0;i<20;i++) for(const edge of [-1,1]) {
        const a=i*Math.PI/10, b=a+.1;
        const tread=(s,angle,r)=>local(side+s,forward+Math.cos(angle)*r,radius+Math.sin(angle)*r);
        quad(tread(0,a,radius+.35),tread(edge*width/2,a+.13,radius+.35),
          tread(edge*width/2,b+.13,radius+.35),tread(0,b,radius+.35),[.16,.17,.15]);
      }
    }
    for(const edge of [-15,15]) { tractorWheel(-153+edge,7,13,7); tractorWheel(-153+edge,42,8,5); }
    });
    for(const side of [-190,180]) {
      prism(side,0,2,2,0,55,[.5,.52,.48]);
      prism(side,0,8,5,55,2,[.38,.4,.35]);
    }
    for(const [x,z,w,d,h] of buildings) {
      // Street View reference: red brick campus wings with dark window bands.
      const brick = x < 500 && x > 300;
      block(x,z,w,d,h,brick ? [.49,.25,.18] : [.65,.62,.55],0,brick?'brick':'concrete');
      block(x,z,w+.12,d+.12,3.5,[.32,.34,.32],0,'concrete');
      block(x,z,w+1,d+1,3,[.22,.25,.25],h,'concrete');
      const p=world(x,z), sx=w*scale, sz=d*scale;
      for(let level=13;level<h-8;level+=17) {
        for(let dx=-sx/2+10;dx<sx/2-8;dx+=19) {
          const shade=[.17+(Math.floor(dx/19)%3+3)%3*.025,.32,.39];
          windowPane(p.x+dx,level,p.y-sz/2-.7,'z',shade);
          windowPane(p.x+dx,level,p.y+sz/2+.7,'z',shade);
        }
        for(let dz=-sz/2+10;dz<sz/2-8;dz+=19) {
          const shade=[.17,.31+(Math.floor(dz/19)%3+3)%3*.025,.39];
          windowPane(p.x-sx/2-.7,level,p.y+dz,'x',shade);
          windowPane(p.x+sx/2+.7,level,p.y+dz,'x',shade);
        }
      }
    }
    // Entrance faces the red camera marker across the forecourt. Coordinates
    // remain in the original route screenshot, not the cropped second map.
    block(454,337,12,57,52,[.49,.25,.18],0,'brick');
    block(454,337,12.12,57.12,3,[.31,.32,.3],0,'concrete');
    block(461,349,1,30,47,[.23,.39,.42],0,'glass');
    for(let z=335;z<=363;z+=5) block(462,z,.5,.6,47,[.64,.66,.63]);
    for(const height of [15,32,48]) block(462,349,.5,30,1,[.64,.66,.63],height);
    block(463,349,1,12,16,[.09,.17,.18],0,'glass');
    for(const z of [343,349,355]) block(463.6,z,.18,.18,16,[.11,.14,.15]);
    block(463.7,349,.2,12,.6,[.12,.15,.15],15.5);
    for(const z of [348.5,349.5]) block(463.8,z,.18,.18,2.3,[.69,.72,.71],7);
    block(466,349,9,32,2,[.77,.78,.74],49,'concrete');
    block(466,349,9,17,2,[.28,.3,.29],18,'concrete');
    block(466,349,8.8,16.8,.35,[.1,.13,.14],17.6);
    for(const z of [341.5,356.5]) block(469,z,.35,.35,18,[.4,.43,.43]);
    // A gently curved glazed wing reflects the distinctive footprint in the map.
    for(let i=0;i<12;i++) {
      const z=365+i*3.8, x=450+Math.sin(i/11*Math.PI)*13;
      block(x,z,5,4.2,40,[.25,.4,.43],0,'glass');
      block(x+2.6,z,.4,.5,41,[.68,.7,.66]);
      for(const height of [13,26]) block(x+2.55,z,.3,4.2,.5,[.39,.45,.46],height);
      block(x,z,5.5,4.3,2,[.3,.33,.32],41);
    }
    // Raised white wall lettering, traced as smooth strokes from Logo_0.jpg.
    // Viewed from the east, north (-Z) is screen-right.
    const wallX = world(460.2,0).x;
    const originZ = world(0,328).y;
    const white = [.96,.96,.92];
    const wallPoint=(u,v)=>[wallX,v,originZ-u];
    function stroke(path,width,point=wallPoint,color=white) {
      for(let i=1;i<path.length;i++) {
        const [u0,v0]=path[i-1], [u1,v1]=path[i];
        const length=Math.hypot(u1-u0,v1-v0);
        if(!length) continue;
        const du=-(v1-v0)*width/length/2, dv=(u1-u0)*width/length/2;
        quad(point(u0+du,v0+dv),point(u1+du,v1+dv),
             point(u1-du,v1-dv),point(u0-du,v0-dv),color);
      }
    }
    function arc(cx,cy,rx,ry,start,end) {
      return Array.from({length:33},(_,i)=>{
        const angle=start+(end-start)*i/32;
        return [cx+Math.cos(angle)*rx,cy+Math.sin(angle)*ry];
      });
    }
    // Two open curves and their crossing diagonal replace the old circular mark.
    stroke(arc(9,41,7,12,Math.PI*.78,Math.PI*1.88),2.7);
    stroke(arc(9,22,7,11,Math.PI*.12,Math.PI*1.22),2.7);
    stroke([[5,42],[16,18]],3.2);
    stroke([[7,30],[15,38]],3);
    const letters = {
      L:[[[0,1],[0,0],[.62,0]]],
      U:[[[0,1],[0,.28]],arc(.34,.28,.34,.28,Math.PI,Math.PI*2),[[.68,.28],[.68,1]]],
      T:[[[0,1],[.72,1]],[[.36,1],[.36,0]]],
      n:[[[0,0],[0,.68]],[[0,.45],[.1,.62],[.25,.68],[.42,.64],[.52,.5],[.52,0]]],
      i:[[[.12,0],[.12,.68]],[[.12,.9],[.12,.96]]],
      v:[[[0,.68],[.28,0],[.56,.68]]],
      e:[[[0,.34],[.55,.34],[.53,.51],[.43,.65],[.26,.69],[.1,.62],[.01,.45],[0,.22],[.1,.06],[.28,0],[.49,.08]]],
      r:[[[0,0],[0,.68]],[[0,.45],[.12,.62],[.27,.68],[.4,.65]]],
      s:[[[.49,.62],[.33,.69],[.14,.66],[.03,.54],[.07,.42],[.4,.28],[.49,.17],[.44,.05],[.26,0],[.05,.08]]],
      t:[[[.2,.96],[.2,.13],[.26,.02],[.42,.03]],[[0,.68],[.43,.68]]],
      y:[[[0,.68],[.28,.04]],[[.56,.68],[.24,-.18],[.14,-.27],[0,-.27]]]
    };
    function wallText(text,x,y,height,point=wallPoint,color=white) {
      let cursor=x;
      for(const letter of text) {
        for(const path of letters[letter]) stroke(path.map(([u,v])=>[cursor+u*height,y+v*height]),height*.065,point,color);
        cursor+=height*(letter==='i' ? .32 : letter==='r' || letter==='t' ? .55 : .82);
      }
    }
    wallText('LUT',23,35,16);
    wallText('University',23,15,14);
    function sign(x,z) {
      const p=x===479 && z===212 ? protectedSignSite : world(x,z);
      // End the support at the panel's lower edge so both faces stay unobstructed.
      box(p.x,0,p.y,6,58,6,[.35,.37,.35]);
      box(p.x,58,p.y,100,34,5,[1,1,1]);
      for(const side of [-1,1]) {
        // Each face has its own left-to-right coordinates, avoiding mirrored text.
        const face=(u,v)=>[p.x+side*(u-50),58+v,p.y+side*2.6];
        const mark=(u,v)=>face(7+u*.65,3+v*.65);
        const red=[.93,.04,.28],orange=[1,.51,.1],green=[.1,.74,0];
        stroke([[8,38],[5,34],[4,29],[5,25],[8,21],[31,0]],5,mark,red);
        stroke([[24,7],[33,15]],5,mark,red);
        stroke(arc(12,12,11,11,Math.PI*.78,Math.PI*1.73),5,mark,orange);
        stroke([[4,20],[21,36]],5,mark,orange);
        stroke(arc(17,11,10,10,Math.PI*1.25,Math.PI*1.83),5,mark,green);
        const black=[0,0,0];
        wallText('LUT',34,18,11,face,black);
        wallText('University',34,6,8,face,black);
      }
    }
    sign(479,212); sign(226,418);
    // Hollow horizontal tyres: rounded shoulders, tread and open centre holes.
    for(const tyre of tyreBarrier) for(let layer=0;layer<tyre.layers;layer++) {
      const base=.12+layer*tyre.height;
      const profile=[[2.05,.15],[3.25,.15],[3.8,.6],[3.8,2.5],[3.25,2.95],[2.05,2.95],[2.05,.15]];
      for(let ring=0;ring<profile.length-1;ring++) for(let segment=0;segment<16;segment++) {
        const a=segment*Math.PI/8,b=(segment+1)*Math.PI/8;
        const point=(r,h,angle)=>[tyre.x+r*Math.cos(angle),base+h,tyre.y+r*Math.sin(angle)];
        const [r,h]=profile[ring],[nr,nh]=profile[ring+1];
        const shade=ring===2 ? (segment%2 ? .075 : .085) : ring===5 ? .035 : .105;
        quad(point(r,h,a),point(r,h,b),point(nr,nh,b),point(nr,nh,a),[shade,shade*1.04,shade*1.06]);
      }
    }
    // Paved forecourt and car park: leave the racing line at x≈623 clear.
    block(539,385,128,74,.12,[.29,.31,.3]);
    block(490,338,40,50,.15,[.6,.6,.56]);
    for(const row of [514,555,590]) {
      for(let z=359;z<414;z+=8) {
        block(row,z,12,.35,.15,[.85,.84,.77],.2);
      }
    }
    for(const car of campusCars) {
      const center=world(car.row,car.z),cos=Math.cos(car.angle),sin=Math.sin(car.angle);
      objectGeometry(vehicleBounds[campusCars.indexOf(car)].body,()=>
        studentCar((f,s,h)=>[center.x+f*cos-s*sin,h+.16,center.y+f*sin+s*cos],car));
    }
    // Flagpoles and the disc-headed lamps visible in the supplied street view.
    for(let i=0;i<5;i++) block(483,323+i*5,.45,.45,90,[.77,.78,.74]);
    for(const [x,z] of [[494,312],[505,339],[604,365],[604,410],[482,406]]) {
      block(x,z,.6,.6,66,[.33,.35,.32]);
      block(x,z,5,5,1.3,[.43,.45,.39],66);
    }
    // Rooftop solar arrays and campus bicycle racks.
    for(let x=390;x<443;x+=13) for(let z=219;z<286;z+=18) block(x,z,10,13,2,[.08,.19,.3],94);
    for(let z=305;z<330;z+=4) block(462,z,5,1,6,[.45,.49,.48]);
    // Three small marina jetties on the lakefront.
    for(let i=0;i<3;i++) block(727+i*24,213,5,64,1,[.56,.46,.32],0,'wood');
  }
  return { track, road, length, world, occupied, build, saunaSite, bonfireSite, trees, treeSeed, treeBounds,
    campusCars, studentCarModels, lakesideCars, vehicleBounds, buildingBounds, obstacleBounds, resolveBoundsCollision, resolveBuildingCollision,
    resolveObstacleCollision, carGeometry, carCollisionParts, tyreBarrier, tyreBarrierBounds,
    bodies,poolSite,poolBody,registerPerson,movePerson,placeBody,makeBody,stepObstacles,resetObstacles,deformPoint, bounds:{width:5200,height:4400} };
})();
