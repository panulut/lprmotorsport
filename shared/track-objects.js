/* Shared mature-tree geometry for campus woods and editor objects. */
window.LPRTreeGeometry = (() => {
  function build(trees,{quad,tri=(a,b,c,color)=>quad(a,b,c,c,color),groundShadow=()=>{},beginTree=()=>{},endTree=()=>{}},seed=17) {
    let treeSeed=seed;
    const treeRandom=()=>{treeSeed=(treeSeed*1664525+1013904223)>>>0;return treeSeed/4294967296;};
    const treeStem=(start,end,startRadius,endRadius,color,sides=7)=>{
      const axis=end.map((value,i)=>value-start[i]),length=Math.hypot(...axis)||1;
      const direction=axis.map(value=>value/length);
      const reference=Math.abs(direction[1])>.92?[1,0,0]:[0,1,0];
      const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
      const normalize=v=>{const n=Math.hypot(...v)||1;return v.map(value=>value/n);};
      const u=normalize(cross(direction,reference)),v=normalize(cross(direction,u));
      const ring=(center,radius,phase)=>Array.from({length:sides},(_,i)=>{
        const angle=i*Math.PI*2/sides+phase;
        return center.map((value,j)=>value+radius*(u[j]*Math.cos(angle)+v[j]*Math.sin(angle)));
      });
      const lower=ring(start,startRadius,.08),upper=ring(end,endRadius,.08);
      for(let i=0;i<sides;i++) {
        const next=(i+1)%sides,shade=.78+(i%3)*.10;
        const face=color.map(value=>value*shade);
        quad(lower[i],lower[next],upper[next],upper[i],face);
      }
      for(let i=1;i<sides-1;i++) tri(start,lower[i],lower[i+1],color.map(value=>value*.72));
    };
    const leafCrown=(center,radii,color,phase,segments=9,rings=4)=>{
      const levels=[];
      for(let row=0;row<=rings;row++) {
        const latitude=-Math.PI/2+Math.PI*row/rings;
        const ring=[];
        for(let column=0;column<segments;column++) {
          const angle=column*Math.PI*2/segments+phase;
          const lobing=1+.10*Math.sin(column*5.1+phase*3)+.045*Math.sin(column*8.7+phase);
          ring.push([
            center[0]+Math.cos(latitude)*Math.cos(angle)*radii[0]*lobing,
            center[1]+Math.sin(latitude)*radii[1],
            center[2]+Math.cos(latitude)*Math.sin(angle)*radii[2]*lobing
          ]);
        }
        levels.push(ring);
      }
      for(let row=0;row<rings;row++) for(let column=0;column<segments;column++) {
        const next=(column+1)%segments,a=levels[row][column],b=levels[row][next];
        const c=levels[row+1][next],d=levels[row+1][column];
        const tint=.78+treeRandom()*.38;
        const face=color.map(value=>Math.min(.82,value*tint));
        quad(a,b,c,d,face);
      }
      const top=center.map((value,i)=>value+(i===1?radii[1]:0));
      for(let column=0;column<segments;column++) {
        const next=(column+1)%segments;
        tri(top,levels[rings-1][column],levels[rings-1][next],color.map(value=>Math.min(.82,value*1.08)));
      }
    };
    const coniferCrown=(x,z,base,top,radius,color,phase)=>{
      const segments=10,rings=7,levels=[];
      for(let row=0;row<=rings;row++) {
        const t=row/rings;
        const tier=.82+.18*Math.cos(t*Math.PI*14+phase);
        const width=radius*Math.pow(1-t,.82)*tier;
        const leanX=Math.sin(t*4.8+phase)*radius*.035;
        const leanZ=Math.cos(t*4.1+phase)*radius*.03;
        const ring=[];
        for(let column=0;column<segments;column++) {
          const angle=column*Math.PI*2/segments+phase;
          const irregular=.84+.12*Math.sin(column*4.7+row*1.9+phase)
            +.08*Math.sin(column*8.2+phase);
          ring.push([x+leanX+Math.cos(angle)*width*irregular,
            base+(top-base)*t,
            z+leanZ+Math.sin(angle)*width*irregular]);
        }
        levels.push(ring);
      }
      for(let row=0;row<rings;row++) for(let column=0;column<segments;column++) {
        const next=(column+1)%segments;
        const shade=.80+treeRandom()*.34;
        const face=color.map(value=>Math.min(.82,value*shade));
        quad(levels[row][column],levels[row][next],levels[row+1][next],
          levels[row+1][column],face);
      }
      const apex=[x,top,z];
      for(let column=0;column<segments;column++) {
        const next=(column+1)%segments;
        tri(apex,levels[rings-1][column],levels[rings-1][next],color);
      }
    };
    for(const tree of trees) {
      beginTree(tree);
      const {x,y,height,canopyRadius,trunkWidth,species}=tree;
      const foliage=tree.color,wood=[.30,.19,.10];
      groundShadow(x,y,canopyRadius*2.1,canopyRadius*2.1,height*.82);
      if(species==='pine') {
        treeStem([x,0,y],[x+canopyRadius*.045,height,y-canopyRadius*.025],
          trunkWidth*.55,trunkWidth*.10,[.36,.24,.14],7);
        for(let tier=0;tier<6;tier++) {
          const fraction=tier/6,branchHeight=height*(.36+fraction*.58);
          const radius=canopyRadius*(1-fraction*.82);
          for(let branch=0;branch<5;branch++) {
            const count=5;
            const angle=branch*Math.PI*2/count+tier*.48+treeRandom()*.16;
            const reach=radius*(.72+treeRandom()*.16);
            const start=[x,branchHeight,y];
            const end=[x+Math.cos(angle)*reach,branchHeight-reach*.13,y+Math.sin(angle)*reach];
            treeStem(start,end,trunkWidth*.12,trunkWidth*.035,wood,5);
          }
        }
        coniferCrown(x,y,height*.34,height*.98,canopyRadius,foliage,treeRandom()*6);
      } else if(species==='birch') {
        const bark=[.69,.66,.56];
        treeStem([x,0,y],[x+canopyRadius*.025,height,y],trunkWidth*.54,trunkWidth*.20,bark,7);
        for(let mark=0;mark<8;mark++) {
          const fraction=.16+mark*.095,angle=mark*2.4;
          const center=[x+Math.cos(angle)*trunkWidth*.30,height*fraction,y+Math.sin(angle)*trunkWidth*.30];
          const direction=angle+.7;
          treeStem(center,[center[0]+Math.cos(direction)*trunkWidth*.42,
            center[1]+.45,center[2]+Math.sin(direction)*trunkWidth*.42],.085,.055,[.16,.14,.12],3);
        }
        for(let branch=0;branch<12;branch++) {
          const fraction=.38+branch*.047,angle=branch*2.399;
          const reach=canopyRadius*(.46+treeRandom()*.34)*(1-fraction*.42);
          const start=[x,height*fraction,y];
          const elbow=[x+Math.cos(angle)*reach*.58,height*(fraction+.09),y+Math.sin(angle)*reach*.58];
          const tip=[x+Math.cos(angle)*reach,height*(fraction+.16),y+Math.sin(angle)*reach];
          treeStem(start,elbow,trunkWidth*.15,trunkWidth*.065,[.34,.27,.19],4);
          treeStem(elbow,tip,trunkWidth*.065,.07,[.34,.27,.19],4);
          for(const side of [-1,1]) {
            const twigAngle=angle+side*.48,twigReach=reach*.25;
            const twig=[tip[0]+Math.cos(twigAngle)*twigReach,tip[1]+twigReach*.28,
              tip[2]+Math.sin(twigAngle)*twigReach];
            treeStem(elbow,twig,trunkWidth*.05,.045,[.38,.30,.21],3);
            if(branch%3===0) leafCrown(twig,[1.8,2.2,1.8],
              [.27,.34,.16],treeRandom()*6,6,2);
          }
        }
      } else {
        treeStem([x,0,y],[x+canopyRadius*.025,height*.68,y-canopyRadius*.018],
          trunkWidth*.66,trunkWidth*.28,[.31,.20,.12],8);
        for(let branch=0;branch<10;branch++) {
          const angle=branch*Math.PI/5+treeRandom()*.24;
          const reach=canopyRadius*(.60+treeRandom()*.24);
          const start=[x,height*(.26+treeRandom()*.12),y];
          const end=[x+Math.cos(angle)*reach,height*(.56+treeRandom()*.17),
            y+Math.sin(angle)*reach];
          treeStem(start,end,trunkWidth*.25,trunkWidth*.10,wood,5);
          const twig=[end[0]+Math.cos(angle+.4)*reach*.32,end[1]+reach*.14,
            end[2]+Math.sin(angle+.4)*reach*.32];
          treeStem(end,twig,trunkWidth*.13,.10,wood,4);
          for(const side of [-1,1]) {
            const twigAngle=angle+side*.42,twigEnd=[twig[0]+Math.cos(twigAngle)*reach*.20,
              twig[1]+reach*.16,twig[2]+Math.sin(twigAngle)*reach*.20];
            treeStem(twig,twigEnd,.10,.045,wood,3);
          }
        }
        for(let bud=0;bud<16;bud++) {
          const angle=bud*2.399,reach=canopyRadius*(.35+treeRandom()*.62);
          const center=[x+Math.cos(angle)*reach,height*(.48+treeRandom()*.42),
            y+Math.sin(angle)*reach];
          const size=1.5+treeRandom()*1.5;
          leafCrown(center,[size,size*1.1,size],
            [.31,.30,.13],treeRandom()*6,6,2);
        }
      }
      endTree(tree);
    }
  }
  function profile(object) {
    // Position-based variation survives reloads and object reordering.
    const seed=(Math.imul(Math.round(object.x*10),73856093)^Math.imul(Math.round(object.y*10),19349663))>>>0;
    let state=seed;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const species=['pine','birch','pine','broadleaf','pine'][seed%5];
    const profiles={
      pine:{height:145,spread:24,trunk:3.5,color:[.055,.20,.115]},
      birch:{height:125,spread:22,trunk:2.5,color:[.12,.29,.17]},
      broadleaf:{height:82,spread:38,trunk:4.2,color:[.20,.28,.105]}
    };
    const p=profiles[species],height=p.height*(1+random()*.34),canopyRadius=p.spread*(1+random()*.32);
    const tint=.88+random()*.24,trunkWidth=p.trunk*(1+random()*.35);
    return {x:0,y:0,species,height,canopyRadius,trunkWidth,color:p.color.map(v=>v*tint),seed};
  }
  return {build,profile};
})();

/* Shared editor document and geometry; world units are 10 per metre. */
window.LPRTrackObjects = (() => {
  const {types,validate,wallFootprint,asphaltOutline,onAsphaltObject}=window.LPRTrackDocument;
  const objects=validate(window.LPRTrackData);
  const terrain=window.LPRTerrain?.create(objects);
  const roadMask=window.LPRTrackDocument.createRoadMask(window.LPRCampus);
  const sceneObjects=window.LPRTrackDocument.withSceneDefaults(objects,window.LPRCampus);
  const scene=type=>sceneObjects.find(o=>o.type===type);
  const campus=window.LPRCampus,sauna=scene('sauna'),fire=scene('bonfire');
  if(sauna){
    const dx=sauna.x-campus.saunaSite.x,dy=sauna.y-campus.saunaSite.y;
    const footprint=campus.vehicleBounds.at(-1);
    footprint.minX+=dx;footprint.maxX+=dx;footprint.minY+=dy;footprint.maxY+=dy;
    campus.saunaSite.x=sauna.x;campus.saunaSite.y=sauna.y;
    campus.placeBody(footprint.body,sauna.x,sauna.y);
  }
  if(fire){campus.bonfireSite.x=fire.x;campus.bonfireSite.y=fire.y;}
  if(scene('pool')) {
    campus.poolSite={x:scene('pool').x,y:scene('pool').y};
    campus.placeBody(campus.poolBody,campus.poolSite.x,campus.poolSite.y);
  }
  campus.peopleSites=sceneObjects.filter(o=>o.type==='person').sort((a,b)=>a.personId-b.personId);
  function bounds(o) {
    const t=['barrier','tyreWall'].includes(o.type)?wallFootprint(o):types[o.type],w=(o.type==='tree'?3:t.w)*o.scale,d=(o.type==='tree'?3:t.d)*o.scale;
    return {minX:o.x-w/2,maxX:o.x+w/2,minY:o.y-d/2,maxY:o.y+d/2,angle:o.angle,...(o.type==='tyreWall'?{impactMaterial:'tyres'}:{})};
  }
  const objectBodies=new Map();
  for(const o of objects.filter(o=>!['asphalt','hill'].includes(o.type)&&!window.LPRTrackDocument.isScene(o.type))) {
    const b=bounds(o);campus.obstacleBounds.push(b);
    objectBodies.set(o,campus.makeBody(b,o.type==='tree'?'tree':o.type==='building'?'wall':o.type,
      o.type==='cone'?3:Infinity));
  }
  // Static, conservative point-query grid. Rounded/rotated shapes still use
  // the original exact membership test; insertion preserves document order.
  const asphaltCells=new Map(),asphaltCellSize=100;
  for(const o of objects.filter(o=>o.type==='asphalt')) {
    const r=Math.hypot(types.asphalt.w,o.square?types.asphalt.w:types.asphalt.d)*o.scale/2+1e-7;
    for(let cx=Math.floor((o.x-r)/asphaltCellSize);cx<=Math.floor((o.x+r)/asphaltCellSize);cx++)
      for(let cy=Math.floor((o.y-r)/asphaltCellSize);cy<=Math.floor((o.y+r)/asphaltCellSize);cy++) {
        const key=cx+','+cy;
        if(!asphaltCells.has(key))asphaltCells.set(key,[]);
        asphaltCells.get(key).push(o);
      }
  }
  function onAsphalt(x,y) {
    let onRoad;
    return (asphaltCells.get(Math.floor(x/asphaltCellSize)+','+Math.floor(y/asphaltCellSize))||[]).some(o=>{
      if(o.allowOnTrack===false) {
        onRoad ??= roadMask.contains(x,y);
        if(onRoad)return false;
      }
      return onAsphaltObject(o,x,y);
    });
  }
  function build({quad,groundShadow,beginObject=()=>{},endObject=()=>{}}) {
    for(const o of objects) {
      if(o.type==='hill'||window.LPRTrackDocument.isScene(o.type))continue;
      beginObject(objectBodies.get(o));
      const t=['barrier','tyreWall'].includes(o.type)?{...types[o.type],...wallFootprint(o)}:types[o.type],s=o.scale,c=Math.cos(o.angle),n=Math.sin(o.angle);
      const p=(x,h,y)=>[o.x+(x*c-y*n)*s,h*s,o.y+(x*n+y*c)*s];
      const cuboid=(w,d,h,color,base=0,offsetX=0)=>{
        const a=p(offsetX-w/2,base,-d/2),b=p(offsetX+w/2,base,-d/2),c=p(offsetX+w/2,base,d/2),d0=p(offsetX-w/2,base,d/2);
        const A=p(offsetX-w/2,base+h,-d/2),B=p(offsetX+w/2,base+h,-d/2),C=p(offsetX+w/2,base+h,d/2),D=p(offsetX-w/2,base+h,d/2);
        quad(a,b,B,A,color);quad(b,c,C,B,color);quad(c,d0,D,C,color);quad(d0,a,A,D,color);quad(A,B,C,D,color);
      };
      if(o.type==='asphalt') {
        for(const polygon of window.LPRTrackDocument.asphaltPolygons(o,roadMask)){
          const outline=polygon.map(([x,y])=>[x,o.allowOnTrack===true?.06:-.35,y]);
          for(let i=1;i<outline.length-1;i++)quad(outline[0],outline[i+1],outline[i],outline[0],t.color);
        }
        continue;
      }
      if(o.type==='lake') {
        // Overlapping brush stamps share the campus lake's height and colour.
        // A flat ellipse matches the editor footprint and leaves no seams.
        const center=[o.x,-.12,o.y];
        const edge=a=>{const v=p(t.w/2*Math.cos(a),0,t.d/2*Math.sin(a));v[1]=-.12;return v;};
        for(let i=0;i<48;i++)quad(center,edge((i+1)*Math.PI/24),edge(i*Math.PI/24),center,[.12,.36,.45]);
        continue;
      }
      if(o.type==='tyreWall') {
        const count=Math.max(1,Math.ceil(t.w/7.2)),radiusX=Math.min(3.6,t.w/2);
        const layers=4,layerHeight=t.h/layers;
        // Closed tyre cross-section with a tread, shoulders and centre hole.
        // Flat sidewalls touch the next layer; widely spaced thin tori left
        // a large see-through gap across the middle of the entire wall.
        const profile=[[1.7,0],[3.15,0],[3.6,.16],[3.6,.84],[3.15,1],[1.7,1],[1.7,0]];
        for(let i=0;i<count;i++) {
          const center=count===1?0:-t.w/2+radiusX+i*(t.w-2*radiusX)/(count-1);
          for(let layer=0;layer<layers;layer++) {
            for(let major=0;major<16;major++) for(let ring=0;ring<profile.length-1;ring++) {
              const a=major*Math.PI/8,b=(major+1)*Math.PI/8;
              const [radius,height]=profile[ring],[nextRadius,nextHeight]=profile[ring+1];
              const point=(around,r,h)=>p(center+r*Math.cos(around)*radiusX/3.6,(layer+h)*layerHeight,r*Math.sin(around));
              quad(point(a,radius,height),point(b,radius,height),point(b,nextRadius,nextHeight),point(a,nextRadius,nextHeight),
                t.color.map(value=>value*(ring===5?.6:ring===2?1:1.15)));
            }
          }
        }
      } else if(o.type==='barrier') {
        const postCount=Math.max(2,Math.ceil(t.w/20));
        const postSpacing=t.w/(postCount-1);
        const postColor=[.30,.34,.36],beamColors=[[.52,.56,.58],[.44,.48,.50],[.61,.64,.65]];
        for(let i=0;i<postCount;i++) {
          const x=-t.w/2+i*postSpacing;
          const inset=Math.max(0,t.w/2-1.2),postX=Math.max(-inset,Math.min(inset,x));
          cuboid(Math.min(1.35,t.w),1.35,8,postColor,0,postX);
          cuboid(Math.min(2.4,t.w),2.2,.65,[.38,.42,.44],5.2,postX);
          if(i<postCount-1) {
            const nextX=x+postSpacing;
            const profile=[[5.8,.40],[6.35,.50],[6.95,.24],[7.55,.50],
              [8.15,.24],[8.75,.50],[9.35,.24],[9.95,.50],[10.5,.40]];
            for(const side of [-1,1]) for(let band=0;band<profile.length-1;band++) {
              const [h0,depth0]=profile[band],[h1,depth1]=profile[band+1];
              const color=beamColors[band%beamColors.length];
              const outer=depth=>side*(t.d*depth);
              const inner=depth=>side*(t.d*depth-.55);
              quad(p(x,h0,outer(depth0)),p(nextX,h0,outer(depth0)),
                p(nextX,h1,outer(depth1)),p(x,h1,outer(depth1)),color);
              quad(p(x,h1,inner(depth1)),p(nextX,h1,inner(depth1)),
                p(nextX,h0,inner(depth0)),p(x,h0,inner(depth0)),color.map(value=>value*.78));
            }
          }
        }
      } else if(o.type==='building') {
        cuboid(t.w,t.d,t.h,[.58,.57,.51]);
        cuboid(t.w+4,t.d+4,3,[.28,.29,.27],t.h);
      } else if(o.type==='cone') {
        cuboid(6,6,1,[.15,.15,.15]);
        for(let i=0;i<12;i++){const a=i*Math.PI/6,b=(i+1)*Math.PI/6;quad(p(3*Math.cos(a),1,3*Math.sin(a)),p(3*Math.cos(b),1,3*Math.sin(b)),p(0,8,0),p(0,8,0),t.color);}
      } else if(o.type==='tree') {
        const tree=window.LPRTreeGeometry.profile(o);
        window.LPRTreeGeometry.build([tree],{
          quad:(a,b,c,d,color)=>quad(p(a[0],a[1],a[2]),p(b[0],b[1],b[2]),p(c[0],c[1],c[2]),p(d[0],d[1],d[2]),color),
          groundShadow:groundShadow ? (x,y,w,d,h)=>groundShadow(o.x,o.y,w*s,d*s,h*s) : undefined
        },tree.seed);
      }
      else cuboid(t.w,t.d,t.h,t.color);
      endObject(objectBodies.get(o));
    }
  }
  return {types,validate,bounds,build,onAsphalt,terrain,active:objects.length>0};
})();
