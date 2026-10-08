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

  function resolveBuildingCollision(state, previous) {
    // A conservative circular footprint includes the nose and wheels at every
    // heading. Sweep it along the entire step so thin walls cannot be skipped.
    const radius=14, dx=state.x-previous.x, dy=state.y-previous.y;
    let firstHit=Infinity, normal={x:0,y:0};
    for(const bounds of buildingBounds) {
      let enter=0, exit=1, hitNormal={x:0,y:0};
      for(const [axis,start,delta,min,max] of [
        ['x',previous.x,dx,bounds.minX-radius,bounds.maxX+radius],
        ['y',previous.y,dy,bounds.minY-radius,bounds.maxY+radius]
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
      if(enter<exit && exit>0 && enter<firstHit) { firstHit=enter; normal=hitNormal; }
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
  function build({box,quad}) {
    const block = (x,z,w,d,h,color,y=0) => { const p=world(x,z); box(p.x,y,p.y,w*scale,h,d*scale,color); };
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
    const lakeside = world(687,365), diagonal = Math.SQRT1_2;
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
    function parkedCar(side,forward,color) {
      prism(side,forward,19,42,3,10,color);
      prism(side,forward-2,17,23,13,9,[.2,.3,.33]);
      prism(side,forward-2,17,17,22,1.2,color);
      for(const edge of [-10,10]) for(const axle of [-13,13]) prism(side+edge,forward+axle,3,8,0,8,[.055,.06,.06]);
      for(const edge of [-6,6]) prism(side+edge,forward+21,4,1,8,2,lines);
    }
    for(const [side,forward,color] of [
      [-108,25,[.45,.12,.1]],[-78,25,[.18,.2,.23]],[-48,25,[.5,.51,.46]],
      [80,15,[.57,.59,.55]],[111,15,[.85,.85,.8]],[143,15,[.16,.19,.2]],
      [105,-35,[.7,.7,.65]]]) parkedCar(side,forward,color);
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
      block(x,z,w,d,h,brick ? [.49,.25,.18] : [.65,.62,.55]);
      block(x,z,w+1,d+1,3,[.22,.25,.25],h);
      const p=world(x,z), sx=w*scale, sz=d*scale;
      for(let level=13;level<h-8;level+=17) {
        for(let dx=-sx/2+10;dx<sx/2-8;dx+=19) {
          box(p.x+dx,level,p.y-sz/2-.6,11,8,1,[.19,.38,.43]);
          box(p.x+dx,level,p.y+sz/2+.6,11,8,1,[.19,.38,.43]);
        }
        for(let dz=-sz/2+10;dz<sz/2-8;dz+=19) {
          box(p.x-sx/2-.6,level,p.y+dz,1,8,11,[.19,.38,.43]);
          box(p.x+sx/2+.6,level,p.y+dz,1,8,11,[.19,.38,.43]);
        }
      }
    }
    // Entrance faces the red camera marker across the forecourt. Coordinates
    // remain in the original route screenshot, not the cropped second map.
    block(454,337,12,57,52,[.49,.25,.18]);
    block(461,349,1,30,47,[.23,.39,.42]);
    for(let z=335;z<=363;z+=5) block(462,z,.5,.6,47,[.64,.66,.63]);
    for(const height of [15,32,48]) block(462,349,.5,30,1,[.64,.66,.63],height);
    block(463,349,1,12,16,[.09,.17,.18]);
    block(466,349,9,32,2,[.77,.78,.74],49);
    block(466,349,9,17,2,[.28,.3,.29],18);
    // A gently curved glazed wing reflects the distinctive footprint in the map.
    for(let i=0;i<12;i++) {
      const z=365+i*3.8, x=450+Math.sin(i/11*Math.PI)*13;
      block(x,z,5,4.2,40,[.25,.4,.43]);
      block(x+2.6,z,.4,.5,41,[.68,.7,.66]);
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
        if((Math.round(z)+row)%3===0) continue;
        const color = (z+row)%4===0 ? [.18,.22,.26] : [.65,.67,.65];
        block(row,z+3,8,3.8,6,color,.4);
        block(row,z+3,4.3,3.4,4,[.2,.32,.36],6.4);
        for(const x of [row-2.6,row+2.6]) for(const side of [-1,1])
          block(x,z+3+side*2,1.2,.55,3,[.07,.08,.08],.6);
      }
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
    for(let i=0;i<3;i++) block(727+i*24,213,5,64,1,[.56,.46,.32]);
  }
  return { track, length, world, occupied, build, saunaSite, bonfireSite, buildingBounds, resolveBuildingCollision, bounds:{width:5200,height:4400} };
})();
