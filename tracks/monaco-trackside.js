/* Monaco-only static scenery. World units: 10 / metre. All random choices use
 * a local seed; no people objects, collision bounds or per-frame crowd work.
 * Geometry is emitted into the existing spatially culled world mesh. The
 * renderer consumes only the separate UV board payload and atlas description.
 */
(function(root){
 'use strict';
 const clothes=[[.94,.90,.78],[.10,.37,.61],[.88,.20,.13],[.94,.65,.12],[.13,.56,.43],[.64,.30,.65],[.21,.26,.34],[.65,.78,.83]];
 const skins=[[.75,.49,.32],[.94,.74,.55],[.40,.25,.18],[.66,.39,.26]];
 const TAU=Math.PI*2;
 function build({quad,oriented,heightAt,track,clearance,buildings,project,inspect,viewportWidth=root.innerWidth||1024}){
  const mobile=viewportWidth<650,boards=[],sponsors=root.LPRMonacoSponsors;
  if(!sponsors?.length)return;
  let seed=0x4d4f4e41,people=0,triangles=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const emit=(a,b,c,d,color)=>{quad(a,b,c,d,color);triangles+=2;};
  const at=(x,y,angle,u,h,v)=>[x+Math.cos(angle)*u-Math.sin(angle)*v,h,y+Math.sin(angle)*u+Math.cos(angle)*v];
  // Conservative circumscribed footprint for solid scenery; vertices and edges
  // of long thin signs are checked separately so they can sit on the barriers.
  const safe=(x,y,r)=>clearance(x,y,r+.75);
  const solid=(kind,x,y,w,h,d,angle,color,bottom,level)=>{
   const radius=Math.hypot(w,d)/2;if(!safe(x,y,radius))return false;
   oriented(x,y,w,h,d,angle,color,bottom,level);triangles+=bottom>0?12:10;
   inspect?.({kind,x,y,radius,bottom:level+bottom,top:level+bottom+h});return true;
  };
  function person(kind,x,y,angle,bottom,key,seated=false,style=null){
   // All candidates consume the same random sequence on either viewport. Mobile
   // is a stable subset, so people that remain keep their clothes/pose/location.
   // A style dresses officials (marshals, crews, photographers), shown on phones too.
   const random1=clothes[Math.floor(random()*clothes.length)],skin=skins[Math.floor(random()*skins.length)],decoration=random();
   const color=style?.color||random1;
   if(mobile&&!style?.always&&key%3!==0)return;
   const flag=style?style.flag!==undefined:decoration>.974,umbrella=!style&&decoration<.014,radius=umbrella?10:flag?8:style?.camera?6:3.9;
   if(!safe(x,y,radius))return;
   const p=(u,h,v=0)=>at(x,y,angle,u,bottom+h,v),head=seated?9:12,top=head+3;
   // Crossed, opaque shoulder/head facets read as people from both sides with
   // eight triangles each. No rounded heads or tiny eyes at racing speed.
   emit(p(-1.9,0),p(1.9,0),p(2.6,head),p(-2.6,head),color);
   emit(p(0,0,-1.2),p(0,0,1.2),p(0,head,1.8),p(0,head,-1.8),color.map(c=>c*.83));
   emit(p(-1.35,head),p(1.35,head),p(1.35,top),p(-1.35,top),skin);
   emit(p(0,head,-1.35),p(0,head,1.35),p(0,top,1.35),p(0,top,-1.35),skin);
   if(flag){
    emit(p(2.8,head/2),p(3.2,head/2),p(3.2,top+8),p(2.8,top+8),[.7,.73,.72]);
    emit(p(3,top+3),p(7.5,top+4),p(7.5,top+8),p(3,top+8),style?.flag||color);
   }
   if(style?.camera){
    // Body plus a long white telephoto lens pointing at the road (v = face).
    const f=style.camera,lens=[.93,.93,.90];
    emit(p(-1.2,head-2.5,f*.6),p(1.2,head-2.5,f*.6),p(1.2,head+.5,f*.6),p(-1.2,head+.5,f*.6),[.08,.08,.09]);
    emit(p(-.7,head-1.6,f*.6),p(.7,head-1.6,f*.6),p(.7,head-1.6,f*5.6),p(-.7,head-1.6,f*5.6),lens);
    emit(p(0,head-2.3,f*.6),p(0,head-.9,f*.6),p(0,head-.9,f*5.6),p(0,head-2.3,f*5.6),lens.map(c=>c*.85));
   }
   if(umbrella){
    for(let i=0;i<4;i++){
     const a=i*TAU/4,b=(i+1)*TAU/4;
     emit(p(0,top+8),p(9*Math.cos(a),top+5,9*Math.sin(a)),p(9*Math.cos(b),top+5,9*Math.sin(b)),p(0,top+8),i%2?color:[.94,.89,.77]);
    }
   }
   people++;inspect?.({kind,x,y,radius,bottom,top:bottom+top+(umbrella||flag?8:0),key});
  }
  let key=0;
  function stand(index,side,kind,existing=false,distance){
   const p=track[index],q=track[(index+1)%track.length],angle=Math.atan2(q.y-p.y,q.x-p.x),offset=distance||p.halfWidth+110;
   const x=p.x-Math.sin(angle)*offset*side,y=p.y+Math.cos(angle)*offset*side,level=heightAt(x,y);
   // Match monaco.js's seven existing rows exactly, including its gate.
   if(existing&&!clearance(x,y,85))return;
   for(let row=0;row<7;row++){
    const rx=x-Math.sin(angle)*row*11*side,ry=y+Math.cos(angle)*row*11*side;
    if(!safe(rx,ry,Math.hypot(140,12)/2))continue;
    if(!existing)solid('stand',rx,ry,140,4,12,angle,row%2?[.57,.64,.68]:[.37,.48,.57],row*6,level);
    for(let seat=0;seat<23;seat++){
     const u=(seat-11)*5.8,pt=at(rx,ry,angle,u,0,0);
     person(kind,pt[0],pt[2],angle,level+row*6+4,key++,true);
    }
   }
  }
  for(const [index,side] of [[520,1],[560,1],[610,-1]])stand(index,side,'harbour',true);
  // Geographic anchors remain stable if the route sample rotation changes.
  const nearest=position=>{
   const p=project(position);let best=0;
   for(let i=1;i<track.length;i++)if(Math.hypot(track[i].x-p.x,track[i].y-p.y)<Math.hypot(track[best].x-p.x,track[best].y-p.y))best=i;
   return best;
  };
  const stands=[
   [[7.42147,43.73694],-1,'sainte-devote'],
   [[7.42242,43.73430],-1,'swimming-pool'],
   [[7.42244,43.73338],-1,'swimming-pool'],
   [[7.42311,43.73280],1,'rascasse',350],
   [[7.42243,43.73245],1,'anthony-noghes'],
   [[7.42311,43.73280],-1,'rascasse-hill',290]
  ];
  for(const [position,side,kind,distance] of stands)stand(nearest(position),side,kind,false,distance);
  // Balcony slabs share the exact fitted buildings and building levels already
  // present in Monaco. Guests stand outside facades, behind a thin front rail.
  for(const house of buildings){
   if(house.style==='garage')continue;
   const {x,y,w,d,h,angle}=house,level=heightAt(x,y);
   for(let floor=25;floor<h-12;floor+=50){
    for(let slot=0;slot<Math.floor(w/48);slot++){
     const u=(slot-(Math.floor(w/48)-1)/2)*48,pt=at(x,y,angle,u,0,-d/2-5);
     if(!safe(pt[0],pt[2],15))continue;
     const point=(u,h,v)=>at(pt[0],pt[2],angle,u,level+floor+h,v);
     // Flat slab, front lip and rail: six triangles per balcony, no hidden
     // box backs/undersides. These share the same world buffer as the crowd.
     emit(point(-11,1.6,-5),point(11,1.6,-5),point(11,1.6,5),point(-11,1.6,5),[.85,.80,.68]);
     emit(point(-11,0,-5),point(11,0,-5),point(11,1.6,-5),point(-11,1.6,-5),[.70,.66,.57]);
     emit(point(-11,8,-5),point(11,8,-5),point(11,9,-5),point(-11,9,-5),[.32,.39,.42]);
     inspect?.({kind:'balcony',x:pt[0],y:pt[2],radius:15,bottom:level+floor,top:level+floor+9});
     for(const seat of [-1,1]){
      const guest=at(pt[0],pt[2],angle,seat*5,0,0);
      person('balcony-person',guest[0],guest[2],angle,level+floor+1.6,key++);
     }
    }
   }
  }
  // Match the twelve authored hulls, main deck and upper sun deck (sea -10).
  for(let i=0;i<12;i++){
   const p=project([7.4242+(i%4)*.00065,43.7358-Math.floor(i/4)*.00065]),angle=-.18;
   for(const [u,v,bottom] of [[-21,-50,-3],[0,-52,-3],[21,-50,-3],[-19,48,-3],[0,52,-3],[19,48,-3],[-8,0,19],[8,0,19]]){
    const pt=at(p.x,p.y,angle,u,0,v);person('yacht',pt[0],pt[2],angle,bottom,key++);
   }
  }
  // ---- Race-day atmosphere: officials, pit crews and street furniture. ----
  const n=track.length,wrapIndex=i=>(i%n+n)%n;
  const roadside=(index,side,offset)=>{
   const p=track[wrapIndex(index)],q=track[wrapIndex(index+1)],angle=Math.atan2(q.y-p.y,q.x-p.x),d=p.halfWidth+offset;
   const x=p.x-Math.sin(angle)*d*side,y=p.y+Math.cos(angle)*d*side;
   return {x,y,angle,level:heightAt(x,y)};
  };
  // Crossed vertical quads (two faces) for poles and trunks; no hidden caps.
  const post=(x,y,level,width,height,color,lean=[0,0])=>{
   const top=[x+lean[0],level+height,y+lean[1]];
   emit([x-width,level,y],[x+width,level,y],[top[0]+width*.7,top[1],top[2]],[top[0]-width*.7,top[1],top[2]],color);
   emit([x,level,y-width],[x,level,y+width],[top[0],top[1],top[2]+width*.7],[top[0],top[1],top[2]-width*.7],color.map(c=>c*.85));
   return top;
  };
  function palm(x,y,level,seed){
   if(!safe(x,y,26))return false;
   const lean=[Math.cos(seed)*6,Math.sin(seed)*6],top=post(x,y,level,1.6,62+(seed*7%12),[.45,.34,.22],lean);
   // Seven drooping fronds radiate from the crown, each a bent pair of quads.
   for(let i=0;i<7;i++){
    const a=seed+i*TAU/7,c=Math.cos(a),s=Math.sin(a),side=[-s*3,c*3];
    const mid=[top[0]+c*11,top[1]+3,top[2]+s*11],tip=[top[0]+c*22,top[1]-7,top[2]+s*22];
    emit([top[0]-side[0]*.3,top[1],top[2]-side[1]*.3],[top[0]+side[0]*.3,top[1],top[2]+side[1]*.3],[mid[0]+side[0],mid[1],mid[2]+side[1]],[mid[0]-side[0],mid[1],mid[2]-side[1]],[.16,.42,.18]);
    emit([mid[0]-side[0],mid[1],mid[2]-side[1]],[mid[0]+side[0],mid[1],mid[2]+side[1]],tip,tip,[.12,.35,.15]);
   }
   inspect?.({kind:'palm',x,y,radius:26,bottom:level,top:top[1]+3});return true;
  }
  function lamp(x,y,level,angle,face){
   // Ornate dark-green street lamp leaning its head over the road.
   if(!safe(x,y,9))return false;
   const top=post(x,y,level,.7,48,[.12,.20,.16]),hx=top[0]-Math.sin(angle)*face*7,hy=top[2]+Math.cos(angle)*face*7;
   emit([top[0],top[1]-.6,top[2]],[top[0],top[1]+.6,top[2]],[hx,top[1]+.6,hy],[hx,top[1]-.6,hy],[.12,.20,.16]);
   post(hx,hy,top[1]-6,1.6,6,[.96,.92,.74]);
   inspect?.({kind:'lamp',x,y,radius:9,bottom:level,top:top[1]+1});return true;
  }
  const flagColors=[[.86,.10,.16],[.97,.97,.95],[.06,.30,.62],[.97,.80,.10],[.05,.45,.25]];
  function flagpole(x,y,level,angle,i){
   if(!safe(x,y,10))return false;
   const top=post(x,y,level,.5,80,[.85,.86,.84]),u=[Math.cos(angle),Math.sin(angle)];
   const a=[top[0],top[1]-2,top[2]],b=[top[0]+u[0]*14,top[1]-2,top[2]+u[1]*14];
   // Monaco red/white, then rotating national colours along the row.
   const color=i%3===0?[.86,.10,.16]:flagColors[i%flagColors.length];
   emit([a[0],a[1]-9,a[2]],[b[0],b[1]-9,b[2]],b,a,color);
   if(i%3===0)emit([a[0],a[1]-9,a[2]],[b[0],b[1]-9,b[2]],[b[0],b[1]-4.5,b[2]],[a[0],a[1]-4.5,a[2]],[.97,.97,.95]);
   inspect?.({kind:'flagpole',x,y,radius:10,bottom:level,top:top[1]});return true;
  }
  const marshalOrange=[.98,.46,.07],hairpin=nearest([7.42968,43.74022]);
  // Marshal posts all round the lap, alternating sides, each with a waved flag.
  for(let i=0,station=0;i<n;i+=38,station++){
   const side=station%2?1:-1;
   for(let k=0;k<2;k++){
    const r=roadside(i+k,side,13);
    person('marshal',r.x,r.y,r.angle,r.level,key++,false,{color:marshalOrange,always:true,flag:k?[.98,.86,.08]:[.10,.55,.20]});
   }
  }
  // Loews hairpin: palms, photographers and spectators packed against the rail,
  // a row of flagpoles above the outside, lamps on the inside, as in period photos.
  for(let d=-12;d<=12;d++)for(const side of [-1,1]){
   for(let row=0;row<3;row++){
    const r=roadside(hairpin+d,side,14+row*6);
    for(const u of [-6,0,6]){const pt=at(r.x,r.y,r.angle,u+row*2,0,0);person('hairpin-fans',pt[0],pt[2],r.angle,heightAt(pt[0],pt[2]),key++);}
   }
   if(d%3===0){const r=roadside(hairpin+d,side,10);person('photographer',r.x,r.y,r.angle,r.level,key++,false,{color:[.16,.19,.22],always:true,camera:-side});}
   if(d%4===0){const r=roadside(hairpin+d,side,42+(d&1)*8);palm(r.x,r.y,r.level,hairpin+d*1.7+side);}
   if(d%6===0){const r=roadside(hairpin+d,side,13);lamp(r.x,r.y,r.level,r.angle,-side);}
  }
  for(let i=0;i<10;i++){const r=roadside(hairpin-14+i*3,1,60);flagpole(r.x,r.y,r.level,r.angle,i);}
  for(let i=0;i<10;i++){const r=roadside(hairpin-14+i*3,-1,60);flagpole(r.x,r.y,r.level,r.angle,i+1);}
  // Palms along the harbour front and street lamps around the whole lap.
  for(let i=480;i<660;i+=11)for(const side of [-1,1]){const r=roadside(i,side,48);palm(r.x,r.y,r.level,i*.37+side);}
  for(let i=0;i<n;i+=26){const side=(i/26)%2?1:-1,r=roadside(i,side,13);lamp(r.x,r.y,r.level,r.angle,-side);}
  // Pit crews in team colours outside each garage, with tyre sets ready.
  const teams=[[.80,.06,.10],[.06,.20,.45],[.97,.97,.95],[.02,.36,.24],[.97,.66,.06],[.30,.32,.36]];
  buildings.filter(h=>h.style==='garage').forEach((house,g)=>{
   const {x,y,w,d,angle}=house,level=heightAt(x,y),team=teams[g%teams.length];
   for(let i=0;i<6;i++){const pt=at(x,y,angle,(i-2.5)*9,0,-d/2-14-(i%2)*7);person('pit-crew',pt[0],pt[2],angle,level,key++,false,{color:team,always:true});}
   for(const u of [-w*.38,w*.38])for(let k=0;k<2;k++){const pt=at(x,y,angle,u+k*6,0,-d/2-5);solid('tyre-stack',pt[0],pt[2],5,6.5,5,angle,[.07,.07,.08],0,level);}
  });
  const atlas={width:2048,height:2**Math.ceil(Math.log2(Math.ceil(sponsors.length/2)*256)),tiles:sponsors.map((s,i)=>({id:s.id,x:(i%2)*1024,y:Math.floor(i/2)*256,width:1024,height:256}))};
  function sign(section,sponsor,points,overhead=false){
   // Check every metre along every footprint edge, not only four vertices.
   if(!overhead)for(let i=0;i<4;i++){
    const a=points[i],b=points[(i+1)%4],n=Math.max(1,Math.ceil(Math.hypot(a[0]-b[0],a[2]-b[2])/5));
    for(let j=0;j<=n;j++)if(!safe(a[0]+(b[0]-a[0])*j/n,a[2]+(b[2]-a[2])*j/n,.2))return;
   }
   boards.push({section,sponsor:sponsors[sponsor%sponsors.length].id,points,overhead});
  }
  const zones=[
   ['sainte-devote',[7.42147,43.73694]],['massenet-casino',[7.42719,43.73940]],
   ['mirabeau',[7.42895,43.74108]],['loews',[7.42968,43.74022]],
   ['tunnel-exit',[7.42572,43.73725]],['nouvelle-chicane',[7.42516,43.73699]],
   ['tabac',[7.42196,43.73639]],['swimming-pool',[7.42242,43.73430]],['rascasse',[7.42330,43.73274]]
  ];
  for(let zone=0;zone<zones.length;zone++){
   const [section,position]=zones[zone],index=nearest(position);
   // Short straight panels follow the local tangents into each braking zone.
   for(const delta of [-6,-3,0,3])for(const side of [-1,1]){
    const k=(index+delta+track.length)%track.length,p=track[k],q=track[(k+1)%track.length],angle=Math.atan2(q.y-p.y,q.x-p.x);
    const x=p.x-Math.sin(angle)*(p.halfWidth+7.3)*side,y=p.y+Math.cos(angle)*(p.halfWidth+7.3)*side;
    // Fence tier sits above Armco; barrier tier stays below the cockpit horizon.
    const bottom=delta===-3||delta===3?18:1,h=bottom===18?20:12,w=h*4;
    const pt=(u,z)=>{const a=at(x,y,angle,u,0,0);return [a[0],heightAt(a[0],a[2])+z,a[2]];};
    let points=[pt(-w/2,bottom),pt(w/2,bottom),pt(w/2,bottom+h),pt(-w/2,bottom+h)];
    // UV direction faces approaching drivers rather than mirrored inside faces.
    if(side<0)points=[points[1],points[0],points[3],points[2]];
    sign(section,zone+Math.abs(delta),points);
   }
  }
  // Advertising runs along the barriers all round the lap, as at a real Grand
  // Prix, not only at braking zones. Panels skip the zones' own boards.
  const zoneIndices=zones.map(([,position])=>nearest(position));
  for(let i=0,k=0;i<track.length;i+=5,k++){
   if(zoneIndices.some(z=>{const gap=Math.abs(z-i);return Math.min(gap,track.length-gap)<9;}))continue;
   for(const side of [-1,1]){
    const p=track[i],q=track[(i+1)%track.length],angle=Math.atan2(q.y-p.y,q.x-p.x);
    const x=p.x-Math.sin(angle)*(p.halfWidth+7.3)*side,y=p.y+Math.cos(angle)*(p.halfWidth+7.3)*side;
    const pt=(u,z)=>{const a=at(x,y,angle,u,0,0);return [a[0],heightAt(a[0],a[2])+z,a[2]];};
    let points=[pt(-24,1),pt(24,1),pt(24,13),pt(-24,13)];
    if(side<0)points=[points[1],points[0],points[3],points[2]];
    sign('barrier',k*3+(side>0?1:0),points);
   }
  }
  // Start/finish bridge: only the supports have a ground footprint. The cross
  // span is intentionally over the road, >=7.5 m above the highest lane below.
  const p=track[6],q=track[7],angle=Math.atan2(q.y-p.y,q.x-p.x),supports=[];
  for(const side of [-1,1])for(let offset=p.halfWidth+22;offset<450;offset+=20){
   const x=p.x-Math.sin(angle)*offset*side,y=p.y+Math.cos(angle)*offset*side;
   if(safe(x,y,6)){supports.push({x,y,offset:offset*side});break;}
  }
  if(supports.length===2){
   let base=p.height;
   for(let j=0;j<=40;j++){const t=j/40;base=Math.max(base,heightAt(supports[0].x+(supports[1].x-supports[0].x)*t,supports[0].y+(supports[1].y-supports[0].y)*t));}
   const bottom=base+75;
   for(const s of supports)solid('bridge-support',s.x,s.y,6,bottom-heightAt(s.x,s.y)+20,6,angle,[.28,.33,.36],0,heightAt(s.x,s.y));
   const a=supports[0],b=supports[1];
   sign('start-finish',0,[[a.x,bottom,a.y],[b.x,bottom,b.y],[b.x,bottom+24,b.y],[a.x,bottom+24,a.y]],true);
  }
  const boardVertices=[];
  for(const board of boards){
   const tile=atlas.tiles.find(t=>t.id===board.sponsor),u0=(tile.x+32)/atlas.width,u1=(tile.x+992)/atlas.width,v0=(tile.y+8)/atlas.height,v1=(tile.y+248)/atlas.height;
   const uv=[[u0,v1],[u1,v1],[u1,v0],[u0,v0]];
   for(const index of [0,1,2,0,2,3])boardVertices.push(...board.points[index],1,1,1,...uv[index]);
  }
  root.LPRMonacoTrackside.scene={mobile,people,triangles,boards,atlas,boardVertices};
  return root.LPRMonacoTrackside.scene;
 }
 root.LPRMonacoTrackside={build};
})(window);
