/* Coordinate-derived Monaco practice scene. Layout: Tomislav Bacinger, MIT;
 * see MONACO-LICENSE.md. Elevation, widths and architecture are authored estimates. */
(() => {
  'use strict';
  const Math=window.LPRMath||globalThis.Math;
  const base=window.LPRCampus,reference=window.LPRMonacoReference;
  const coordinates=[[7.427191,43.739404],[7.427171,43.739494],[7.427199,43.739575],[7.427271,43.739686],[7.427339,43.739764],[7.427551,43.739958],[7.428628,43.741015],[7.428703,43.741091],[7.428814,43.741114],[7.428949,43.741086],[7.429043,43.74103],[7.429111,43.740942],[7.429125,43.740843],[7.429128,43.740761],[7.429139,43.740694],[7.429195,43.740614],[7.42926,43.740553],[7.429381,43.74043],[7.429463,43.740321],[7.429495,43.740255],[7.429536,43.740216],[7.429601,43.740203],[7.429676,43.740219],[7.429732,43.740261],[7.429749,43.740321],[7.429712,43.740372],[7.429617,43.740422],[7.429336,43.74068],[7.429296,43.740742],[7.429295,43.740802],[7.429317,43.740848],[7.429347,43.740891],[7.429479,43.74094],[7.429683,43.740978],[7.429794,43.741008],[7.429908,43.741041],[7.430066,43.741081],[7.430238,43.74109],[7.430329,43.741057],[7.430363,43.740955],[7.430331,43.740359],[7.430204,43.739746],[7.430072,43.739356],[7.429925,43.739078],[7.429673,43.73876],[7.429383,43.738491],[7.428963,43.73816],[7.428362,43.737894],[7.428004,43.737767],[7.427314,43.737534],[7.42685,43.737418],[7.426165,43.737301],[7.425724,43.737251],[7.42549,43.737219],[7.42545,43.73717],[7.425447,43.737127],[7.425433,43.737077],[7.425403,43.737028],[7.425304,43.737003],[7.425164,43.736986],[7.425009,43.73705],[7.424924,43.737054],[7.42369,43.736937],[7.423077,43.736873],[7.422513,43.736809],[7.422357,43.736792],[7.422253,43.736779],[7.422178,43.736723],[7.42206,43.736555],[7.42196,43.736392],[7.42188,43.736229],[7.421845,43.736113],[7.421808,43.735911],[7.421805,43.735565],[7.42181,43.735479],[7.421845,43.73542],[7.421915,43.735363],[7.42207,43.735281],[7.422174,43.735212],[7.422219,43.735138],[7.422237,43.735031],[7.422413,43.734295],[7.422458,43.734166],[7.422472,43.734125],[7.422468,43.73407],[7.422423,43.734026],[7.422324,43.733976],[7.422225,43.733941],[7.422202,43.733891],[7.422221,43.733786],[7.422334,43.733547],[7.422437,43.733367],[7.422542,43.733225],[7.422722,43.733039],[7.422948,43.732874],[7.423114,43.732805],[7.4233,43.732742],[7.423393,43.732712],[7.42344,43.732674],[7.423494,43.732557],[7.423468,43.732495],[7.423384,43.732459],[7.423011,43.732388],[7.422803,43.732364],[7.422666,43.732362],[7.422544,43.732375],[7.422467,43.732417],[7.42242,43.732452],[7.422418,43.732534],[7.4224,43.7326],[7.422364,43.732681],[7.422154,43.732868],[7.422,43.733047],[7.42188,43.733181],[7.421753,43.733435],[7.421472,43.734142],[7.421395,43.73437],[7.421341,43.734614],[7.421271,43.73497],[7.421216,43.735433],[7.421216,43.735735],[7.421234,43.735966],[7.421269,43.736206],[7.421331,43.736373],[7.421401,43.736523],[7.421435,43.736615],[7.421452,43.736696],[7.421444,43.736819],[7.421441,43.736895],[7.421475,43.73694],[7.421562,43.73697],[7.421774,43.737007],[7.421963,43.737013],[7.422222,43.737036],[7.422583,43.737069],[7.422903,43.73711],[7.423717,43.737283],[7.424172,43.737373],[7.424589,43.737422],[7.424875,43.737439],[7.425098,43.737497],[7.425743,43.737718],[7.426026,43.737802],[7.426439,43.737869],[7.426784,43.737904],[7.427113,43.737944],[7.427298,43.737991],[7.427523,43.738093],[7.427718,43.73824],[7.427828,43.738364],[7.427877,43.738494],[7.427869,43.73863],[7.427837,43.738758],[7.427767,43.738899],[7.427674,43.739033],[7.427528,43.739115],[7.427388,43.73921],[7.42732,43.739253],[7.427257,43.739299],[7.427191,43.739404]];
  const origin=[7.421216,43.741114],cos=Math.cos(origin[1]*Math.PI/180);
  const raw=coordinates.slice(0,-1).map(([lon,lat])=>({x:(lon-origin[0])*111320*cos,y:(origin[1]-lat)*111320}));
  const measure=points=>points.map((a,i)=>Math.hypot(points[(i+1)%points.length].x-a.x,points[(i+1)%points.length].y-a.y));
  const factor=33370/measure(raw).reduce((a,b)=>a+b,0);
  const project=([lon,lat])=>({x:600+(lon-origin[0])*111320*cos*factor,y:600+(origin[1]-lat)*111320*factor});
  const outline=coordinates.slice(0,-1).map(project),lengths=measure(outline),distances=[0];
  for(const length of lengths)distances.push(distances.at(-1)+length);
  const anchors=reference.profile.map(([index,elevation,width])=>({s:distances[index],elevation:elevation*10,width:width*10}));
  function profile(s){
    let i=0;while(i<anchors.length-2&&anchors[i+1].s<s)i++;
    const a=anchors[i],b=anchors[i+1],t=Math.max(0,Math.min(1,(s-a.s)/(b.s-a.s)));
    // Smooth transitions keep crests and changing road widths continuous.
    const blend=t*t*(3-2*t);
    return {height:a.elevation+(b.elevation-a.elevation)*blend,halfWidth:(a.width+(b.width-a.width)*blend)/2};
  }
  let segment=0;
  const samples=960;
  const track=Array.from({length:samples},(_,i)=>{
    const s=i*distances.at(-1)/samples;
    while(distances[segment+1]<s)segment++;
    const a=outline[segment],b=outline[(segment+1)%outline.length],t=(s-distances[segment])/lengths[segment];
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,sourceAlong:s,...profile(s)};
  });
  const startTarget=project([7.42128,43.73495]);
  let startIndex=0;
  for(let i=1;i<samples;i++)if(Math.hypot(track[i].x-startTarget.x,track[i].y-startTarget.y)<Math.hypot(track[startIndex].x-startTarget.x,track[startIndex].y-startTarget.y))startIndex=i;
  track.push(...track.splice(0,startIndex));
  const finish=track[0],next=track[1],norm=Math.hypot(next.x-finish.x,next.y-finish.y);
  const finishGate={x:finish.x,y:finish.y,tangentX:(next.x-finish.x)/norm,tangentY:(next.y-finish.y)/norm,normalX:-(next.y-finish.y)/norm,normalY:(next.x-finish.x)/norm,halfWidth:finish.halfWidth+5};
  const launch=track[samples-12],launchNext=track[samples-11];
  const launchPosition={x:launch.x,y:launch.y,angle:Math.atan2(launchNext.y-launch.y,launchNext.x-launch.x)};
  const segments=(points,closed,route)=>Array.from({length:points.length-(closed?0:1)},(_,index)=>{
    const a=points[index],b=points[(index+1)%points.length],dx=b.x-a.x,dy=b.y-a.y;
    return {a,b,dx,dy,lengthSquared:dx*dx+dy*dy,index,route,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)};
  });
  function makeQuery(items){
    function build(list){
      const node={minX:Math.min(...list.map(s=>s.minX)),maxX:Math.max(...list.map(s=>s.maxX)),minY:Math.min(...list.map(s=>s.minY)),maxY:Math.max(...list.map(s=>s.maxY))};
      if(list.length<=6){node.items=list;return node;}
      const axis=node.maxX-node.minX>node.maxY-node.minY?'x':'y';
      list.sort((a,b)=>a.a[axis]+a.b[axis]-b.a[axis]-b.b[axis]||a.index-b.index);
      const mid=list.length>>1;node.left=build(list.slice(0,mid));node.right=build(list.slice(mid));return node;
    }
    const root=build(items.slice());
    return (x,y)=>{
      let best=Infinity,found,t=0;
      const lower=n=>Math.max(0,n.minX-x,x-n.maxX)**2+Math.max(0,n.minY-y,y-n.maxY)**2;
      function visit(node){
        if(lower(node)>best+1e-8)return;
        if(node.items){for(const s of node.items){
          const mix=Math.max(0,Math.min(1,((x-s.a.x)*s.dx+(y-s.a.y)*s.dy)/s.lengthSquared));
          const d=(x-s.a.x-s.dx*mix)**2+(y-s.a.y-s.dy*mix)**2;
          if(d<best){best=d;found=s;t=mix;}
        }}else{const left=lower(node.left),right=lower(node.right);if(left<right){visit(node.left);visit(node.right);}else{visit(node.right);visit(node.left);}}
      }
      visit(root);
      return {segment:found,t,distance:Math.sqrt(best),x:found.a.x+found.dx*t,y:found.a.y+found.dy*t,
        height:found.a.height+(found.b.height-found.a.height)*t,
        halfWidth:found.a.halfWidth+(found.b.halfWidth-found.a.halfWidth)*t};
    };
  }
  const mainQuery=makeQuery(segments(track,true,'main'));
  // Pit route follows the FIA plan: entry at Rascasse, lane beside the straight,
  // then a separate exit joining after Sainte Devote. Local dimensions are estimates.
  const pitAnchors=reference.pit.map(project),pit=[];
  const entryHeight=mainQuery(pitAnchors[0].x,pitAnchors[0].y).height;
  const exitHeight=mainQuery(pitAnchors.at(-1).x,pitAnchors.at(-1).y).height;
  const pitDistances=[0];for(let i=1;i<pitAnchors.length;i++)pitDistances.push(pitDistances.at(-1)+Math.hypot(pitAnchors[i].x-pitAnchors[i-1].x,pitAnchors[i].y-pitAnchors[i-1].y));
  for(let i=0;i<pitAnchors.length-1;i++){
    const a=pitAnchors[i],b=pitAnchors[i+1],count=Math.ceil((pitDistances[i+1]-pitDistances[i])/30);
    for(let j=0;j<count;j++){
      const t=j/count;
      const from=reference.pitElevation[i]===null?entryHeight:reference.pitElevation[i]*10;
      const to=reference.pitElevation[i+1]===null?exitHeight:reference.pitElevation[i+1]*10;
      pit.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,height:from+(to-from)*t,halfWidth:35});
    }
  }
  pit.push({...pitAnchors.at(-1),height:exitHeight,halfWidth:35});
  const pitQuery=makeQuery(segments(pit,false,'pit')),allQuery=makeQuery([...segments(track,true,'main'),...segments(pit,false,'pit')]);
  function roadAt(x,y){
    const main=mainQuery(x,y),branch=pitQuery(x,y);
    const q=branch.halfWidth-branch.distance>main.halfWidth-main.distance?branch:main;
    return {halfWidth:q.halfWidth,kerbOuter:q.halfWidth+(q.segment.route==='pit'?0:4),shoulderOuter:q.halfWidth+6,distance:q.distance,route:q.segment.route};
  }
  const mainSegments=segments(track,true,'main'),pitSegments=segments(pit,false,'pit');
  function calculateHeight(x,y){
    const q=allQuery(x,y),items=q.segment.route==='main'?mainSegments:pitSegments;
    const radius=q.distance+24,radiusSquared=radius*radius;
    let weighted=0,total=0;
    // Compact, continuous weights remove the nearest-segment seams on a sloping bend.
    // Only topological neighbours contribute, preserving different street levels.
    for(let offset=-16;offset<=16;offset++){
      let index=q.segment.index+offset;
      if(q.segment.route==='main')index=(index+items.length)%items.length;
      else if(index<0||index>=items.length)continue;
      const s=items[index],t=Math.max(0,Math.min(1,((x-s.a.x)*s.dx+(y-s.a.y)*s.dy)/s.lengthSquared));
      const distanceSquared=(x-s.a.x-s.dx*t)**2+(y-s.a.y-s.dy*t)**2;
      const weight=Math.max(0,1-distanceSquared/radiusSquared)**3;
      if(!weight)continue;
      const height=s.a.height+(s.b.height-s.a.height)*t;
      weighted+=weight*height;total+=weight;
    }
    return total?weighted/total:q.height;
  }
  // Mesh tessellation revisits shared vertices; a bounded cache also caps runtime memory.
  const heightCache=new Map();
  function heightAt(x,y){
    const key=`${x},${y}`;
    if(heightCache.has(key))return heightCache.get(key);
    const value=calculateHeight(x,y);
    if(heightCache.size>=32768)heightCache.clear();
    heightCache.set(key,value);return value;
  }
  function sample(x,y){
    const epsilon=.01;
    return {height:heightAt(x,y),dx:(heightAt(x+epsilon,y)-heightAt(x-epsilon,y))/(2*epsilon),dy:(heightAt(x,y+epsilon)-heightAt(x,y-epsilon))/(2*epsilon)};
  }
  const harbourCoordinates=[[7.4230,43.7364],[7.4270,43.7370],[7.4285,43.7361],[7.4270,43.7330],[7.4240,43.7333]];
  const harbour=harbourCoordinates.map(project);
  const inHarbour=(x,y)=>{let inside=false;for(let i=0,j=harbour.length-1;i<harbour.length;j=i++){const a=harbour[i],b=harbour[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;};
  function triangle(a,b,c,emit,split=true,depth=0){
    const pairs=[[a,b,c],[b,c,a],[c,a,b]],lengths=pairs.map(([p,q])=>Math.hypot(p[0]-q[0],p[2]-q[2])),index=lengths.indexOf(Math.max(...lengths));
    const [p,q,r]=pairs[index],mid=p.map((v,i)=>(v+q[i])/2);
    const error=Math.abs(heightAt(mid[0],mid[2])-(heightAt(p[0],p[2])+heightAt(q[0],q[2]))/2);
    if(split&&depth<8&&(lengths[index]>180||lengths[index]>40&&error>.05)){
      triangle(p,mid,r,emit,true,depth+1);triangle(mid,q,r,emit,true,depth+1);return;
    }
    emit(...[a,b,c].map(p=>{const out=p.slice();out[1]+=heightAt(out[0],out[2]);return out;}));
  }
  function mesh(vertices,stride=8,split=true){
    const out=[];for(let i=0;i<vertices.length;i+=stride*3)triangle(Array.from(vertices.slice(i,i+stride)),Array.from(vertices.slice(i+stride,i+2*stride)),Array.from(vertices.slice(i+2*stride,i+3*stride)),(a,b,c)=>out.push(...a,...b,...c),split);return out;
  }
  const terrain={active:true,heightAt,sample,triangle,mesh,groundTiles(emit){
    const size=160,minX=Math.floor((Math.min(...track.map(p=>p.x))-700)/size)*size,minY=Math.floor((Math.min(...track.map(p=>p.y))-700)/size)*size;
    const maxX=Math.max(...track.map(p=>p.x))+700,maxY=Math.max(...track.map(p=>p.y))+700;
    for(let x=minX;x<maxX;x+=size)for(let y=minY;y<maxY;y+=size){
      if([[0,0],[size,0],[size,size],[0,size],[size/2,size/2]].some(([dx,dy])=>inHarbour(x+dx,y+dy)))continue;
      if(allQuery(x+size/2,y+size/2).distance<900)emit(x,y,size);
    }
  }};
  const isPitLane=(x,y)=>{const p=pitQuery(x,y),m=mainQuery(x,y);return p.distance<p.halfWidth&&m.distance>m.halfWidth;};
  function crossesFinishLine(previous,current){
    const along=p=>(p.x-finish.x)*finishGate.tangentX+(p.y-finish.y)*finishGate.tangentY;
    const before=along(previous),after=along(current);if(before>0||after<=0)return false;
    const t=-before/(after-before),x=previous.x+(current.x-previous.x)*t,y=previous.y+(current.y-previous.y)*t;
    return Math.abs((x-finish.x)*finishGate.normalX+(y-finish.y)*finishGate.normalY)<=finishGate.halfWidth;
  }
  function edge(points,i,side,extra=0,closed=true){
    const n=points.length,prev=points[closed?(i+n-1)%n:Math.max(0,i-1)],here=points[i],next=points[closed?(i+1)%n:Math.min(n-1,i+1)];
    let ax=here.x-prev.x,ay=here.y-prev.y,bx=next.x-here.x,by=next.y-here.y;
    if(i===0&&!closed){ax=bx;ay=by;}if(i===n-1&&!closed){bx=ax;by=ay;}
    const al=Math.hypot(ax,ay),bl=Math.hypot(bx,by),nx=-ay/al-by/bl,ny=ax/al+bx/bl,norm=Math.hypot(nx,ny);
    const mx=nx/norm,my=ny/norm,miter=(here.halfWidth+extra)/Math.max(.55,mx*(-by/bl)+my*(bx/bl));
    return {x:here.x+side*mx*miter,y:here.y+side*my*miter};
  }
  const rectangle=(x,y,w,d,angle=0)=>({minX:x-w/2,maxX:x+w/2,minY:y-d/2,maxY:y+d/2,angle,impactMaterial:'wall'});
  const obstacleBounds=[],walls=[],buildings=[],openEdges=new Set();
  const addWall=(a,b,red=false)=>{
    const w=Math.hypot(b.x-a.x,b.y-a.y)+1,wall={a,b,x:(a.x+b.x)/2,y:(a.y+b.y)/2,w,angle:Math.atan2(b.y-a.y,b.x-a.x),red};
    walls.push(wall);obstacleBounds.push(rectangle(wall.x,wall.y,w,5,wall.angle));
  };
  // Remove only wall pieces intersecting the joining route; both mouths stay open.
  for(let i=0;i<samples;i++)for(const side of [-1,1]){
    const a=edge(track,i,side,9),b=edge(track,(i+1)%samples,side,9);
    const p=pitQuery((a.x+b.x)/2,(a.y+b.y)/2);
    if(p.distance<p.halfWidth+7){openEdges.add(`${i}:${side}`);continue;}
    addWall(a,b,Math.floor(i/5)%2===0);
  }
  for(let i=0;i<pit.length-1;i++)for(const side of [-1,1]){
    const a=edge(pit,i,side,4,false),b=edge(pit,i+1,side,4,false),m=mainQuery((a.x+b.x)/2,(a.y+b.y)/2);
    if(m.distance<m.halfWidth+10)continue;
    addWall(a,b,false);
  }
  const gantryHalfWidth=finish.halfWidth+11;
  const finishPostBounds=[-1,1].map(side=>rectangle(finish.x+finishGate.normalX*gantryHalfWidth*side,finish.y+finishGate.normalY*gantryHalfWidth*side,3,3));obstacleBounds.push(...finishPostBounds);
  const clearance=(x,y,r)=>{const a=mainQuery(x,y),b=pitQuery(x,y);return a.distance>a.halfWidth+r&&b.distance>b.halfWidth+r;};
  function addBuilding(item){
    // Landmarks never place an invisible solid across either driveable route.
    if(!clearance(item.x,item.y,Math.hypot(item.w,item.d)/2+12))return false;
    buildings.push(item);obstacleBounds.push(rectangle(item.x,item.y,item.w,item.d,item.angle));return true;
  }
  for(let i=0;i<samples;i+=14){
    const p=track[i],q=track[(i+1)%samples],angle=Math.atan2(q.y-p.y,q.x-p.x),distance=220+(i%3)*35;
    const x=p.x+Math.sin(angle)*distance,y=p.y-Math.cos(angle)*distance,w=105+(i%4)*18,d=90,h=100+(i%6)*27;
    addBuilding({x,y,w,d,h,angle,color:[[.79,.69,.55],[.84,.78,.65],[.73,.66,.59],[.84,.70,.59]][Math.floor(i/14)%4],style:'town'});
  }
  const landmarks=reference.landmarks.map(o=>({...o,...project(o.position),color:o.style==='rascasse'?[.65,.35,.23]:[.88,.80,.65]}));
  for(const item of landmarks)if(item.style!=='pool'){
    // Fit the authored landmark to available space, keeping its real location as a guide.
    let fit={...item};for(let attempt=0;attempt<5;attempt++){if(addBuilding(fit))break;fit={...fit,w:fit.w*.7,d:fit.d*.7};}
  }
  const garages=[];
  for(let i=0;i<pit.length;i+=12){const p=pit[i],q=pit[Math.min(i+1,pit.length-1)];if(p.y<project([7.4215,43.7343]).y&&p.y>project([7.4215,43.7362]).y){
    const angle=Math.atan2(q.y-p.y,q.x-p.x),x=p.x-Math.sin(angle)*105,y=p.y+Math.cos(angle)*105;
    const garage={x,y,w:90,d:70,h:45,angle,color:[.64,.67,.64],style:'garage'};if(addBuilding(garage))garages.push(garage);
  }}
  const road={halfWidth:40,kerbOuter:44,shoulderOuter:46,halfWidthAt:i=>track[i].halfWidth,edgeOpenAt:(i,side)=>openEdges.has(`${i}:${side}`)};
  function build({quad,absoluteQuad=quad}){
    quad=absoluteQuad;
    const oriented=(x,y,w,h,d,angle,color,bottom=0,level=heightAt(x,y))=>{
      const c=Math.cos(angle),s=Math.sin(angle),at=(u,z,v)=>[x+c*u-s*v,z+level,y+s*u+c*v];
      const points=[at(-w/2,bottom,-d/2),at(w/2,bottom,-d/2),at(w/2,bottom,d/2),at(-w/2,bottom,d/2)];
      for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4];quad(a,b,[b[0],level+bottom+h,b[2]],[a[0],level+bottom+h,a[2]],color.map(v=>v*(.8+i*.05)));}
      quad(...points.map(p=>[p[0],level+bottom+h,p[2]]),color);
      if(bottom>0)quad(...points.slice().reverse(),color.map(v=>v*.6));
    };
    const polygon=(coords,y,color)=>{const points=coords.map(project).map(p=>[p.x,y,p.y]);for(let i=1;i<points.length-1;i++)quad(points[0],points[i],points[i+1],points[0],color);};
    // Waterfront stays horizontal while roads and scenery sit at their own elevations.
    polygon(harbourCoordinates,-12,[.035,.36,.49]);
    // Pit asphalt and both boundary lines share the same edge points as collisions.
    for(let i=0;i<pit.length-1;i++){
      const a=edge(pit,i,-1,0,false),b=edge(pit,i+1,-1,0,false),c=edge(pit,i+1,1,0,false),d=edge(pit,i,1,0,false);
      const vertex=p=>[p.x,heightAt(p.x,p.y)+.07,p.y];quad(vertex(a),vertex(b),vertex(c),vertex(d),[.23,.25,.26]);
      for(const side of [-1,1]){const a=edge(pit,i,side,-2,false),b=edge(pit,i+1,side,-2,false),c=edge(pit,i+1,side,-3,false),d=edge(pit,i,side,-3,false);quad(...[a,b,c,d].map(vertex),[.92,.88,.66]);}
    }
    // Direction arrows show the entrance and the return path without extra controls.
    for(const i of [5,pit.length-8]){
      const a=pit[i],b=pit[i+1],length=Math.hypot(b.x-a.x,b.y-a.y),fx=(b.x-a.x)/length,fy=(b.y-a.y)/length;
      const p=(f,r)=>{const x=a.x+fx*f-fy*r,y=a.y+fy*f+fx*r;return [x,heightAt(x,y)+.12,y];};
      quad(p(-14,-2),p(7,-2),p(7,2),p(-14,2),[.93,.86,.53]);quad(p(15,0),p(3,-8),p(3,8),p(3,8),[.93,.86,.53]);
    }
    for(const wall of walls){
      const nx=-Math.sin(wall.angle)*2.5,ny=Math.cos(wall.angle)*2.5;
      const a=[wall.a.x,heightAt(wall.a.x,wall.a.y),wall.a.y],b=[wall.b.x,heightAt(wall.b.x,wall.b.y),wall.b.y],color=wall.red?[.77,.13,.12]:[.87,.88,.82];
      for(const side of [-1,1])quad([a[0]+nx*side,a[1],a[2]+ny*side],[b[0]+nx*side,b[1],b[2]+ny*side],[b[0]+nx*side,b[1]+12,b[2]+ny*side],[a[0]+nx*side,a[1]+12,a[2]+ny*side],color);
      quad([a[0]-nx,a[1]+12,a[2]-ny],[b[0]-nx,b[1]+12,b[2]-ny],[b[0]+nx,b[1]+12,b[2]+ny],[a[0]+nx,a[1]+12,a[2]+ny],color);
    }
    // Thin fence rails above the solid barriers leave the city visible.
    for(let i=0;i<walls.length;i+=6){const wall=walls[i],level=heightAt(wall.x,wall.y);oriented(wall.x,wall.y,1.2,34,1.2,0,[.38,.42,.43],0,level);for(const h of [23,33])oriented(wall.x,wall.y,wall.w,1,1,wall.angle,[.47,.51,.52],h,level);}
    for(const house of buildings){
      oriented(house.x,house.y,house.w,house.h,house.d,house.angle,house.color);
      oriented(house.x,house.y,house.w+5,4,house.d+5,house.angle,[.61,.32,.24],house.h);
      const c=Math.cos(house.angle),s=Math.sin(house.angle);
      for(let h=20;h<house.h-8;h+=25)for(let u=-house.w/2+12;u<house.w/2-8;u+=22)oriented(house.x+u*c+(house.d/2+.4)*s,house.y+u*s-(house.d/2+.4)*c,10,13,1,house.angle,[.14,.26,.29],h,heightAt(house.x,house.y));
      if(['casino','hotel'].includes(house.style))for(const side of [-1,1]){
        const x=house.x+side*c*house.w*.38,y=house.y+side*s*house.w*.38;
        oriented(x,y,35,35,35,house.angle,[.82,.72,.53],house.h+4,heightAt(house.x,house.y));
      }
      if(house.style==='fairmont')for(let h=25;h<house.h;h+=25)oriented(house.x,house.y,house.w+9,3,house.d+9,house.angle,[.87,.82,.70],h,heightAt(house.x,house.y));
      if(house.style==='garage'){
        oriented(house.x+Math.sin(house.angle)*(house.d/2+.5),house.y-Math.cos(house.angle)*(house.d/2+.5),house.w*.8,28,1,house.angle,[.12,.16,.18],3,heightAt(house.x,house.y));
        oriented(house.x,house.y,house.w+12,3,house.d+22,house.angle,[.83,.85,.77],house.h);
      }
    }
    // Covered Portier/tunnel section, now continuous with the uphill/downhill surface.
    for(let i=39;i<52;i++){
      const a=outline[i],b=outline[i+1],angle=Math.atan2(b.y-a.y,b.x-a.x),w=Math.hypot(b.x-a.x,b.y-a.y)+2;
      const y=(heightAt(a.x,a.y)+heightAt(b.x,b.y))/2;
      oriented((a.x+b.x)/2,(a.y+b.y)/2,w,8,130,angle,[.38,.39,.38],46,y);
      oriented((a.x+b.x)/2,(a.y+b.y)/2,10,1,7,angle,[1,.87,.55],45,y);
    }
    const pool=landmarks.find(o=>o.style==='pool');if(pool&&clearance(pool.x,pool.y,Math.hypot(pool.w,pool.d)/2)){
      oriented(pool.x,pool.y,pool.w+15,8,pool.d+15,pool.angle,[.91,.88,.78]);oriented(pool.x,pool.y,pool.w,1,pool.d,pool.angle,[.12,.66,.77],8);
    }
    for(let i=0;i<12;i++){
      const p=project([7.4242+(i%4)*.00065,43.7358-Math.floor(i/4)*.00065]);
      oriented(p.x,p.y,55,7,160,-.18,[.90,.91,.86],0,-10);oriented(p.x,p.y,37,14,70,-.18,[.95,.95,.91],7,-10);oriented(p.x,p.y,28,8,42,-.18,[.17,.28,.31],21,-10);
    }
    // Grandstands alongside the harbour, with visible tiered seating.
    for(const [index,side] of [[520,1],[560,1],[610,-1]]){
      const p=track[index],q=track[(index+1)%samples],angle=Math.atan2(q.y-p.y,q.x-p.x),distance=p.halfWidth+110;
      const x=p.x-Math.sin(angle)*distance*side,y=p.y+Math.cos(angle)*distance*side;
      if(clearance(x,y,85))for(let row=0;row<7;row++)oriented(x-Math.sin(angle)*row*11*side,y+Math.cos(angle)*row*11*side,140,4,12,angle,row%2?[.56,.65,.70]:[.38,.50,.59],row*6,heightAt(x,y));
    }
  }
  const offsite={x:-100000,y:-100000};
  window.LPRCampus={...base,track,road,roadAt,isPitLane,length:measure(track).reduce((a,b)=>a+b,0),finishGate,finishPostBounds,launchPosition,gantryHalfWidth,crossesFinishLine,
    hasAmenities:false,groundLevel:-30,groundColor:[.48,.46,.40],bounds:{width:Math.max(...track.map(p=>p.x))+1000,height:Math.max(...track.map(p=>p.y))+1000},
    build,trees:[],treeBounds:[],treeSeed:17,buildingBounds:obstacleBounds,obstacleBounds,bodies:[],vehicleBounds:[],tyreBarrier:[],tyreBarrierBounds:[],
    saunaSite:offsite,bonfireSite:offsite,poolSite:offsite,peopleSites:[],resetObstacles(){},stepObstacles(){},
    resolveObstacleCollision:(state,previous,onImpact)=>base.resolveBoundsCollision(state,previous,obstacleBounds,onImpact),
    monaco:{project,profile,terrain,mainQuery,pitQuery,pit,landmarks,buildings,garages,walls,openEdges}};
  window.LPRTrackData={version:1,objects:[]};window.LPRTrackObjects={terrain,onAsphalt:(x,y)=>{const r=roadAt(x,y);return r.distance<=r.halfWidth;},build(){}};
  window.LPRTrackConfig={id:'monaco-v2',bestTimeKey:'lpr-best-time-monaco-v2',bestSectorsKey:'lpr-best-sectors-monaco-v2'};
})();
