/* Monaco practice scene. Coordinates adapted from Tomislav Bacinger's MIT-licensed
 * f1-circuits dataset; see tracks/MONACO-LICENSE.md. Flat, stylised scenery. */
(() => {
  'use strict';
  const base=window.LPRCampus;
  const coordinates=[[7.427191,43.739404],[7.427171,43.739494],[7.427199,43.739575],[7.427271,43.739686],[7.427339,43.739764],[7.427551,43.739958],[7.428628,43.741015],[7.428703,43.741091],[7.428814,43.741114],[7.428949,43.741086],[7.429043,43.74103],[7.429111,43.740942],[7.429125,43.740843],[7.429128,43.740761],[7.429139,43.740694],[7.429195,43.740614],[7.42926,43.740553],[7.429381,43.74043],[7.429463,43.740321],[7.429495,43.740255],[7.429536,43.740216],[7.429601,43.740203],[7.429676,43.740219],[7.429732,43.740261],[7.429749,43.740321],[7.429712,43.740372],[7.429617,43.740422],[7.429336,43.74068],[7.429296,43.740742],[7.429295,43.740802],[7.429317,43.740848],[7.429347,43.740891],[7.429479,43.74094],[7.429683,43.740978],[7.429794,43.741008],[7.429908,43.741041],[7.430066,43.741081],[7.430238,43.74109],[7.430329,43.741057],[7.430363,43.740955],[7.430331,43.740359],[7.430204,43.739746],[7.430072,43.739356],[7.429925,43.739078],[7.429673,43.73876],[7.429383,43.738491],[7.428963,43.73816],[7.428362,43.737894],[7.428004,43.737767],[7.427314,43.737534],[7.42685,43.737418],[7.426165,43.737301],[7.425724,43.737251],[7.42549,43.737219],[7.42545,43.73717],[7.425447,43.737127],[7.425433,43.737077],[7.425403,43.737028],[7.425304,43.737003],[7.425164,43.736986],[7.425009,43.73705],[7.424924,43.737054],[7.42369,43.736937],[7.423077,43.736873],[7.422513,43.736809],[7.422357,43.736792],[7.422253,43.736779],[7.422178,43.736723],[7.42206,43.736555],[7.42196,43.736392],[7.42188,43.736229],[7.421845,43.736113],[7.421808,43.735911],[7.421805,43.735565],[7.42181,43.735479],[7.421845,43.73542],[7.421915,43.735363],[7.42207,43.735281],[7.422174,43.735212],[7.422219,43.735138],[7.422237,43.735031],[7.422413,43.734295],[7.422458,43.734166],[7.422472,43.734125],[7.422468,43.73407],[7.422423,43.734026],[7.422324,43.733976],[7.422225,43.733941],[7.422202,43.733891],[7.422221,43.733786],[7.422334,43.733547],[7.422437,43.733367],[7.422542,43.733225],[7.422722,43.733039],[7.422948,43.732874],[7.423114,43.732805],[7.4233,43.732742],[7.423393,43.732712],[7.42344,43.732674],[7.423494,43.732557],[7.423468,43.732495],[7.423384,43.732459],[7.423011,43.732388],[7.422803,43.732364],[7.422666,43.732362],[7.422544,43.732375],[7.422467,43.732417],[7.42242,43.732452],[7.422418,43.732534],[7.4224,43.7326],[7.422364,43.732681],[7.422154,43.732868],[7.422,43.733047],[7.42188,43.733181],[7.421753,43.733435],[7.421472,43.734142],[7.421395,43.73437],[7.421341,43.734614],[7.421271,43.73497],[7.421216,43.735433],[7.421216,43.735735],[7.421234,43.735966],[7.421269,43.736206],[7.421331,43.736373],[7.421401,43.736523],[7.421435,43.736615],[7.421452,43.736696],[7.421444,43.736819],[7.421441,43.736895],[7.421475,43.73694],[7.421562,43.73697],[7.421774,43.737007],[7.421963,43.737013],[7.422222,43.737036],[7.422583,43.737069],[7.422903,43.73711],[7.423717,43.737283],[7.424172,43.737373],[7.424589,43.737422],[7.424875,43.737439],[7.425098,43.737497],[7.425743,43.737718],[7.426026,43.737802],[7.426439,43.737869],[7.426784,43.737904],[7.427113,43.737944],[7.427298,43.737991],[7.427523,43.738093],[7.427718,43.73824],[7.427828,43.738364],[7.427877,43.738494],[7.427869,43.73863],[7.427837,43.738758],[7.427767,43.738899],[7.427674,43.739033],[7.427528,43.739115],[7.427388,43.73921],[7.42732,43.739253],[7.427257,43.739299],[7.427191,43.739404]];
  const origin=[7.421216,43.741114],cos=Math.cos(origin[1]*Math.PI/180);
  const raw=coordinates.slice(0,-1).map(([lon,lat])=>({x:(lon-origin[0])*111320*cos,y:(origin[1]-lat)*111320}));
  const measure=points=>points.map((a,i)=>Math.hypot(points[(i+1)%points.length].x-a.x,points[(i+1)%points.length].y-a.y));
  const factor=33370/measure(raw).reduce((a,b)=>a+b,0);
  const project=([lon,lat])=>({x:600+(lon-origin[0])*111320*cos*factor,y:600+(origin[1]-lat)*111320*factor});
  const outline=coordinates.slice(0,-1).map(project),lengths=measure(outline),distances=[0];
  for(const length of lengths)distances.push(distances.at(-1)+length);
  let segment=0;
  const samples=960;
  const track=Array.from({length:samples},(_,i)=>{
    const target=i*distances.at(-1)/samples;
    while(distances[segment+1]<target)segment++;
    const a=outline[segment],b=outline[(segment+1)%outline.length],t=(target-distances[segment])/lengths[segment];
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  });
  // Albert I straight, before Sainte Devote; drive in the source's clockwise order.
  const startTarget=project([7.42128,43.73495]);
  let startIndex=0;
  for(let i=1;i<samples;i++)if(Math.hypot(track[i].x-startTarget.x,track[i].y-startTarget.y)<Math.hypot(track[startIndex].x-startTarget.x,track[startIndex].y-startTarget.y))startIndex=i;
  track.push(...track.splice(0,startIndex));
  const road={halfWidth:40,kerbOuter:44,shoulderOuter:46},a=track[0],b=track[1],norm=Math.hypot(b.x-a.x,b.y-a.y);
  const finishGate={x:a.x,y:a.y,tangentX:(b.x-a.x)/norm,tangentY:(b.y-a.y)/norm,normalX:-(b.y-a.y)/norm,normalY:(b.x-a.x)/norm,halfWidth:45};
  const launch=track[samples-12],next=track[samples-11];
  const launchPosition={...launch,angle:Math.atan2(next.y-launch.y,next.x-launch.x)};
  function crossesFinishLine(previous,current){
    const along=p=>(p.x-a.x)*finishGate.tangentX+(p.y-a.y)*finishGate.tangentY;
    const before=along(previous),after=along(current);
    if(before>0||after<=0)return false;
    const t=-before/(after-before),x=previous.x+(current.x-previous.x)*t,y=previous.y+(current.y-previous.y)*t;
    return Math.abs((x-a.x)*finishGate.normalX+(y-a.y)*finishGate.normalY)<=finishGate.halfWidth;
  }
  const obstacleBounds=[],walls=[],buildings=[];
  const rectangle=(x,y,w,d,angle=0)=>({minX:x-w/2,maxX:x+w/2,minY:y-d/2,maxY:y+d/2,angle,impactMaterial:'wall'});
  // Use the same mitered edge for the visible wall and its collision footprint.
  const edge=(i,side)=>{
    const prev=track[(i+samples-1)%samples],here=track[i],next=track[(i+1)%samples];
    const ax=here.x-prev.x,ay=here.y-prev.y,bx=next.x-here.x,by=next.y-here.y;
    const al=Math.hypot(ax,ay),bl=Math.hypot(bx,by),nx=-ay/al-by/bl,ny=ax/al+bx/bl,n=Math.hypot(nx,ny);
    const mx=nx/n,my=ny/n,miter=49/Math.max(.55,mx*(-by/bl)+my*(bx/bl));
    return {x:here.x+side*mx*miter,y:here.y+side*my*miter};
  };
  for(let i=0;i<samples;i++)for(const side of [-1,1]){
    const a=edge(i,side),b=edge((i+1)%samples,side),w=Math.hypot(b.x-a.x,b.y-a.y)+1;
    const wall={x:(a.x+b.x)/2,y:(a.y+b.y)/2,w,angle:Math.atan2(b.y-a.y,b.x-a.x),red:Math.floor(i/5)%2===0};
    walls.push(wall);obstacleBounds.push(rectangle(wall.x,wall.y,w,5,wall.angle));
  }
  const clearance=(x,y,r)=>track.every(p=>Math.hypot(p.x-x,p.y-y)>r);
  for(let i=0;i<samples;i+=12){
    const here=track[i],after=track[(i+1)%samples],angle=Math.atan2(after.y-here.y,after.x-here.x);
    const side=-1,distance=210+(i%4)*28,x=here.x-Math.sin(angle)*distance*side,y=here.y+Math.cos(angle)*distance*side;
    const w=100+(i%3)*26,d=90,h=90+(i%7)*27;
    if(clearance(x,y,Math.hypot(w,d)/2+65)){
      buildings.push({x,y,w,d,h,angle,color:[[.79,.69,.55],[.84,.78,.65],[.73,.66,.59],[.84,.70,.59]][i/12%4]});
      obstacleBounds.push(rectangle(x,y,w,d,angle));
    }
  }
  const finishPostBounds=[-1,1].map(side=>rectangle(a.x+finishGate.normalX*51*side,a.y+finishGate.normalY*51*side,3,3));
  obstacleBounds.push(...finishPostBounds);
  function build({box,quad}){
    const polygon=(coords,height,color)=>{
      const points=coords.map(project).map(p=>[p.x,height,p.y]);
      for(let i=1;i<points.length-1;i++)quad(points[0],points[i],points[i+1],points[0],color);
    };
    // Harbour basin inside the waterfront loop, kept away from the racing line.
    polygon([[7.4230,43.7364],[7.4270,43.7370],[7.4285,43.7361],[7.4270,43.7330],[7.4240,43.7333]],-.1,[.035,.36,.49]);
    const oriented=(x,y,w,h,d,angle,color,bottom=0)=>{
      const c=Math.cos(angle),s=Math.sin(angle),at=(u,z,v)=>[x+c*u-s*v,z,y+s*u+c*v];
      const points=[at(-w/2,bottom,-d/2),at(w/2,bottom,-d/2),at(w/2,bottom,d/2),at(-w/2,bottom,d/2)];
      for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4];quad(a,b,[b[0],bottom+h,b[2]],[a[0],bottom+h,a[2]],color.map(v=>v*(.8+i*.05)));}
      quad(...points.map(p=>[p[0],bottom+h,p[2]]),color);
    };
    for(const wall of walls)oriented(wall.x,wall.y,wall.w,12,5,wall.angle,wall.red?[.77,.13,.12]:[.87,.88,.82]);
    for(const house of buildings){
      oriented(house.x,house.y,house.w,house.h,house.d,house.angle,house.color);
      oriented(house.x,house.y,house.w+5,4,house.d+5,house.angle,[.61,.32,.24],house.h);
      for(let h=20;h<house.h-8;h+=25)for(let x=-house.w/2+12;x<house.w/2-8;x+=22){
        const c=Math.cos(house.angle),s=Math.sin(house.angle);
        oriented(house.x+x*c+(house.d/2+.4)*s,house.y+x*s-(house.d/2+.4)*c,10,13,1,house.angle,[.14,.26,.29],h);
      }
    }
    // Tunnel roof follows Portier to the waterfront exit, with repeated lights.
    for(let i=41;i<51;i++){
      const a=outline[i],b=outline[i+1],angle=Math.atan2(b.y-a.y,b.x-a.x),w=Math.hypot(b.x-a.x,b.y-a.y)+2;
      oriented((a.x+b.x)/2,(a.y+b.y)/2,w,8,118,angle,[.38,.39,.38],44);
      oriented((a.x+b.x)/2,(a.y+b.y)/2,10,1,7,angle,[1,.87,.55],43);
    }
    for(let i=0;i<12;i++){
      const p=project([7.4242+(i%4)*.00065,43.7358-Math.floor(i/4)*.00065]);
      oriented(p.x,p.y,55,7,160,-.18,[.90,.91,.86]);
      oriented(p.x,p.y,37,14,70,-.18,[.95,.95,.91],7);
      oriented(p.x,p.y,28,8,42,-.18,[.17,.28,.31],21);
    }
  }
  const offsite={x:-100000,y:-100000};
  window.LPRCampus={...base,track,road,length:measure(track).reduce((a,b)=>a+b,0),finishGate,finishPostBounds,launchPosition,gantryHalfWidth:51,crossesFinishLine,
    hasAmenities:false,groundColor:[.48,.46,.40],bounds:{width:Math.max(...track.map(p=>p.x))+1000,height:Math.max(...track.map(p=>p.y))+1000},
    build,trees:[],treeBounds:[],treeSeed:17,buildingBounds:obstacleBounds,obstacleBounds,bodies:[],vehicleBounds:[],tyreBarrier:[],tyreBarrierBounds:[],
    saunaSite:offsite,bonfireSite:offsite,poolSite:offsite,peopleSites:[],resetObstacles(){},stepObstacles(){},
    resolveObstacleCollision:(state,previous,onImpact)=>base.resolveBoundsCollision(state,previous,obstacleBounds,onImpact)};
  window.LPRTrackData={version:1,objects:[]};
  window.LPRTrackObjects={terrain:window.LPRTerrain.create([]),onAsphalt:()=>false,build(){}};
  window.LPRTrackConfig={id:'monaco-v1',bestTimeKey:'lpr-best-time-monaco-v1',bestSectorsKey:'lpr-best-sectors-monaco-v1'};
})();
