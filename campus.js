/* Stylised campus, traced from the supplied route screenshot. Not a survey.
 * Screenshot coordinates share one transform for roads and architecture. */
window.LPRCampus = (() => {
  const scale = 5;
  const world = (x, y) => ({ x: (x - 100) * scale + 200, y: (y - 100) * scale + 200 });
  const anchors = [[190,180],[310,180],[445,180],[500,225],[550,260],[600,305],[645,340],[645,360],[625,395],[623,435],[600,445],[550,440],[505,445],[512,510],[512,640],[507,745],[496,798],[480,812],[465,800],[450,735],[430,690],[395,650],[365,590],[350,530],[327,492],[285,470],[235,460],[210,445],[200,410],[200,345],[185,275],[182,225]];
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

  function resolveBoundsCollision(state, previous, obstacles) {
    // A conservative circular footprint includes the nose and wheels at every
    // heading. Sweep it along the entire step so thin walls cannot be skipped.
    const radius=14, dx=state.x-previous.x, dy=state.y-previous.y;
    let firstHit=Infinity, normal={x:0,y:0};
    for(const bounds of obstacles) {
      // Test rotated vehicle footprints in their own frame, then rotate the
      // contact normal back so glancing impacts preserve world-space motion.
      const cx=(bounds.minX+bounds.maxX)/2, cy=(bounds.minY+bounds.maxY)/2;
      const cos=Math.cos(bounds.angle || 0), sin=Math.sin(bounds.angle || 0);
      const px=previous.x-cx, py=previous.y-cy;
      const localX=px*cos+py*sin, localY=-px*sin+py*cos;
      const localDx=dx*cos+dy*sin, localDy=-dx*sin+dy*cos;
      let enter=0, exit=1, hitNormal={x:0,y:0};
      for(const [axis,start,delta,min,max] of [
        ['x',localX,localDx,bounds.minX-cx-radius,bounds.maxX-cx+radius],
        ['y',localY,localDy,bounds.minY-cy-radius,bounds.maxY-cy+radius]
      ]) {
        if(Math.abs(delta)<1e-12) {
          if(start<=min || start>=max) { exit=-1; break; }
        } else {
          const a=(min-start)/delta, b=(max-start)/delta;
          const near=Math.min(a,b);
          if(near>=enter) {
            enter=near;
            hitNormal={x:0,y:0};
            hitNormal[axis]=-Math.sign(delta);
          }
          exit=Math.min(exit,Math.max(a,b));
        }
      }
      if(enter<exit && exit>0 && enter<firstHit) {
        firstHit=enter;
        normal={x:hitNormal.x*cos-hitNormal.y*sin,y:hitNormal.x*sin+hitNormal.y*cos};
      }
    }
    if(!Number.isFinite(firstHit)) return false;
    const fraction=Math.max(0,firstHit-.001/Math.max(Math.hypot(dx,dy),.001));
    state.x=previous.x+dx*fraction;
    state.y=previous.y+dy*fraction;
    if(normal.x===0 && normal.y===0) {
      const distance=Math.hypot(dx,dy);
      if(distance>0) normal={x:-dx/distance,y:-dy/distance};
    }
    return {normal};
  }
  const bonfireSite = world(625,228);
  const parkClearing = (x,z) => [saunaSite,bonfireSite].some(p=>Math.hypot(x-p.x,z-p.y)<110);
  const occupied = (x,z) => (parkClearing(x,z) || (x > world(449,0).x && x < world(612,0).x &&
    z > world(0,308).y && z < world(0,427).y) || (x > world(650,0).x && x < world(780,0).x && z > world(0,250).y && z < world(0,425).y) || buildings.some(([bx,by,w,d]) => {
    const p = world(bx,by); return Math.abs(x-p.x)<w*scale/2+18 && Math.abs(z-p.y)<d*scale/2+18;
  }));
  // Drawing and collisions share the same seeded tree positions and trunks.
  let treeSeed = 17;
  const treeRandom = () => { treeSeed = (treeSeed * 1664525 + 1013904223) >>> 0; return treeSeed / 4294967296; };
  const trees = [];
  for(let i=0;i<track.length;i+=6) {
    const before=track[(i-1+track.length)%track.length], after=track[(i+1)%track.length];
    const dx=after.x-before.x, dy=after.y-before.y, length=Math.hypot(dx,dy);
    for(const side of [-1,1]) {
      if(i>=18 && i<=42 && side===-1) continue;
      const distance=75+treeRandom()*100;
      const x=track[i].x-dy/length*distance*side;
      const y=track[i].y+dx/length*distance*side;
      if(occupied(x,y) || (x>2850 && y<1200)) continue;
      trees.push({x,y,height:28+treeRandom()*20,trunkWidth:3,
        canopyRadius:9+treeRandom()*6,color:treeRandom()>.5?[.08,.29,.19]:[.055,.23,.16]});
    }
  }
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
  const obstacleBounds=[...buildingBounds,...treeBounds,...vehicleBounds];
  const resolveBuildingCollision=(state,previous)=>resolveBoundsCollision(state,previous,buildingBounds);
  const resolveObstacleCollision=(state,previous)=>resolveBoundsCollision(state,previous,obstacleBounds);
  function build({box,quad,materialBox=box}) {
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
    const lake = [[590,80],[1050,80],[1050,520],[850,480],[780,400],[745,330],[715,240]].map(([x,z])=>{const p=world(x,z);return [p.x,-.12,p.y];});
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
    for(const [index,[side,forward,color]] of lakesideCars.entries()) parkedCar(side,forward,color,index);
    // Weathered tractor: large rear wheels, smaller front wheels, bonnet and cab.
    prism(-153,24,22,38,8,6,[.28,.3,.25]);
    prism(-153,34,17,23,14,11,[.54,.54,.43]);
    prism(-153,10,20,18,14,23,[.28,.38,.39]);
    for(const edge of [-10,10]) for(const forward of [1,19]) prism(-153+edge,forward,1.6,1.6,14,24,[.66,.64,.5]);
    prism(-153,10,24,21,37,2,[.65,.63,.49]);
    prism(-145,36,1.8,1.8,22,19,[.13,.14,.13]);
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
      prism(side,forward,width+.3,radius*.7,radius*.65,radius*.7,[.52,.5,.38]);
    }
    for(const edge of [-15,15]) { tractorWheel(-153+edge,7,13,7); tractorWheel(-153+edge,42,8,5); }
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
      const p=world(x,z);
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
      studentCar((f,s,h)=>[center.x+f*cos-s*sin,h+.16,center.y+f*sin+s*cos],car);
    }
    // Flagpoles and the disc-headed lamps visible in the supplied street view.
    for(let i=0;i<5;i++) block(483,323+i*5,.45,.45,90,[.77,.78,.74]);
    for(const [x,z] of [[494,312],[505,339],[604,365],[604,410],[482,406]]) {
      block(x,z,.6,.6,66,[.33,.35,.32]);
      block(x,z,5,5,1.3,[.43,.45,.39],66);
    }
    // Low glass bus shelter alongside the southern edge of the forecourt.
    block(582,423,31,5,1.5,[.4,.43,.41],17);
    block(582,425,31,.4,16,[.28,.42,.43]);
    for(const x of [568,582,596]) block(x,423,.5,.5,17,[.38,.4,.38]);
    // Rooftop solar arrays and campus bicycle racks.
    for(let x=390;x<443;x+=13) for(let z=219;z<286;z+=18) block(x,z,10,13,2,[.08,.19,.3],94);
    for(let z=305;z<330;z+=4) block(462,z,5,1,6,[.45,.49,.48]);
    // Three small marina jetties on the lakefront.
    for(let i=0;i<3;i++) block(727+i*24,213,5,64,1,[.56,.46,.32],0,'wood');
  }
  return { track, length, world, occupied, build, saunaSite, bonfireSite, trees, treeSeed, treeBounds,
    campusCars, studentCarModels, lakesideCars, vehicleBounds, buildingBounds, resolveBuildingCollision,
    resolveObstacleCollision, bounds:{width:5200,height:4400} };
})();
