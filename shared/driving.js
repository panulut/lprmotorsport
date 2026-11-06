/* Authoritative 120 Hz driving rules. No renderer, wall clock or browser storage. */
(function(root){
  // Shared physics must give bit-identical results in the browser and on the verification server.
  const Math=root.LPRMath||globalThis.Math;
  const hz=120;
  const preparedTracks=new WeakMap();
  function create({car,dynamics=new root.VehicleDynamics(),onImpact=()=>{},indexed=true,trackIndexed=true,campus=root.LPRCampus,trackObjects=root.LPRTrackObjects}={}) {
    const LPRCampus=campus,window={LPRTrackObjects:trackObjects};
    const track=LPRCampus.track,POINTS=track.length,WORLD=LPRCampus.bounds;
    const {halfWidth:ROAD_HALF,kerbOuter:KERB_OUTER,shoulderOuter:SHOULDER_OUTER}=LPRCampus.road;
    const prepared=Object.isFrozen(track)?preparedTracks.get(track):null;
    const trackDistances=prepared?.distances||[0];
    if(!prepared)for(let i=0;i<POINTS;i++)trackDistances.push(trackDistances[i]+Math.hypot(track[(i+1)%POINTS].x-track[i].x,track[(i+1)%POINTS].y-track[i].y));
  function nearestTrackLinear(x, y) {
    let bestDist = Infinity;
    let index = 0;
    let along = 0;
    for (let i = 0; i < POINTS; i++) {
      const a = track[i];
      const b = track[(i + 1) % POINTS];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
      const distance = (x - a.x - t * dx) * (x - a.x - t * dx) + (y - a.y - t * dy) * (y - a.y - t * dy);
      if (distance < bestDist) {
        bestDist = distance; index = i;
        along=trackDistances[i]+t*(trackDistances[i+1]-trackDistances[i]);
      }
    }
    return { index, distance: Math.sqrt(bestDist), along };
  }

  // Static segment BVH. Bounds only exclude distant segments; the final projection
  // uses the original arithmetic and ties always select the original track order.
  function buildTrackIndex(ids) {
    const node={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
    for(const i of ids){const a=track[i],b=track[(i+1)%POINTS];
      node.minX=Math.min(node.minX,a.x,b.x);node.minY=Math.min(node.minY,a.y,b.y);
      node.maxX=Math.max(node.maxX,a.x,b.x);node.maxY=Math.max(node.maxY,a.y,b.y);}
    if(ids.length<=8){node.ids=ids;return node;}
    const axis=node.maxX-node.minX>=node.maxY-node.minY?'x':'y';
    ids.sort((i,j)=>(track[i][axis]+track[(i+1)%POINTS][axis])-(track[j][axis]+track[(j+1)%POINTS][axis])||i-j);
    const mid=ids.length>>1;node.left=buildTrackIndex(ids.slice(0,mid));node.right=buildTrackIndex(ids.slice(mid));return node;
  }
  const trackIndex=trackIndexed?(prepared?.index||buildTrackIndex(Array.from({length:POINTS},(_,i)=>i))):null;
  if(Object.isFrozen(track))preparedTracks.set(track,{distances:Object.freeze(trackDistances),index:trackIndex||prepared?.index});
  function nearestTrack(x,y){
    if(!trackIndex||!Number.isFinite(x)||!Number.isFinite(y))return nearestTrackLinear(x,y);
    let bestDist=Infinity,index=0,along=0;
    function lower(node){const dx=Math.max(0,node.minX-x,x-node.maxX),dy=Math.max(0,node.minY-y,y-node.maxY);return dx*dx+dy*dy;}
    function visit(node,bound){
      // Conservative round-off allowance: never prune a numerically tied segment.
      if(bound>bestDist+1e-10*Math.max(1,bound,bestDist))return;
      if(node.ids){for(const i of node.ids){
        const a=track[i],b=track[(i+1)%POINTS],dx=b.x-a.x,dy=b.y-a.y;
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
        const distance=(x-a.x-t*dx)*(x-a.x-t*dx)+(y-a.y-t*dy)*(y-a.y-t*dy);
        if(distance<bestDist||(distance===bestDist&&i<index)){
          bestDist=distance;index=i;along=trackDistances[i]+t*(trackDistances[i+1]-trackDistances[i]);
        }
      }return;}
      const l=lower(node.left),r=lower(node.right);
      if(l<=r){visit(node.left,l);visit(node.right,r);}else{visit(node.right,r);visit(node.left,l);}
    }
    visit(trackIndex,0);return {index,distance:Math.sqrt(bestDist),along};
  }

  function grassContact(state) {
    const p = dynamics.parameters;
    const scale = 1 / p.metresPerWorldUnit;
    const forwardX = Math.cos(state.angle), forwardY = Math.sin(state.angle);
    let total = 0;
    let kerbTires = 0;
    const heights=[];
    // Sample each tire rather than switching the whole car to grass at its centre.
    for (const axle of [p.frontAxle, -p.rearAxle]) {
      for (const side of [-p.trackWidth / 2, p.trackWidth / 2]) {
        const x = state.x + (axle * forwardX - side * forwardY) * scale;
        const y = state.y + (axle * forwardY + side * forwardX) * scale;
        const contact = nearestTrack(x, y);
        const distance = contact.distance;
        const loop=trackDistances[POINTS];
        const ribAlong=contact.along*(Math.round(loop*p.metresPerWorldUnit/.45)*.45)/(loop*p.metresPerWorldUnit);
        heights.push((window.LPRTrackObjects?.terrain?.heightAt(x,y)||0)*p.metresPerWorldUnit+
          dynamics.kerbHeight(distance,ribAlong,LPRCampus.road));
        if (distance >= ROAD_HALF && distance <= KERB_OUTER) kerbTires++;
        const blend = window.LPRTrackObjects?.onAsphalt(x,y) ? 0 :
          Math.max(0, Math.min(1, (distance - KERB_OUTER) / (SHOULDER_OUTER - KERB_OUTER)));
        total += blend * blend * (3 - 2 * blend);
      }
    }
    state.kerbFraction = kerbTires / 4;
    state.roadHeights = heights;
    const slope=window.LPRTrackObjects?.terrain?.sample(state.x,state.y);
    state.terrainSlope={forward:slope?slope.dx*forwardX+slope.dy*forwardY:0,
      right:slope?-slope.dx*forwardY+slope.dy*forwardX:0};
    return total / 4;
  }


    const people=root.LPRPeople.create({campus:LPRCampus});
    let ticks=0,lapStartTick=0,lastSplit=0,stage=0,lap=1,sectors=[],lastLap=null,started=false;
    let query;
    function reset(state) {
      LPRCampus.resetObstacles();
      car=state||{...LPRCampus.launchPosition};
      dynamics.reset(car);dynamics.parameters.tractionControlEnabled=true;car.tcEnabled=true;
      ticks=0;lapStartTick=0;lastSplit=0;stage=0;lap=1;sectors=[];lastLap=null;started=false;
      people.update(0);query=root.LPRCreateCollisionIndex(LPRCampus.obstacleBounds,160,LPRCampus.collisionIndex);return car;
    }
    function step(input) {
      if(car.crashed)throw Error('Car crashed');
      ticks++;
      people.update(ticks*1000/hz);
      const impact=contact=>{const damage=dynamics.applyImpact(car,contact.normal,contact.impactMaterial,contact);onImpact(contact,damage);};
      LPRCampus.stepObstacles(1/hz,car,impact);
      const tc=input.tc!==false;
      if(!tc&&car.tcEnabled!==false){car.tcActive=false;car.torqueScale=1;}
      dynamics.parameters.tractionControlEnabled=tc;car.tcEnabled=tc;
      car.grassFraction=grassContact(car);
      const previous={x:car.x,y:car.y,angle:car.angle};
      dynamics.step(car,input,1/hz,car.grassFraction);
      if(indexed){
        const parts=LPRCampus.carCollisionParts(car),reach=LPRCampus.collisionReach?LPRCampus.collisionReach(parts):Math.max(...parts.flat().map(p=>Math.hypot(...p)));
        const padding=reach+Math.hypot(car.x-previous.x,car.y-previous.y)+1;
        LPRCampus.resolveBoundsCollision(car,previous,query(previous.x,previous.y,car.x,car.y,padding),impact);
      }else LPRCampus.resolveObstacleCollision(car,previous,impact);
      const x=Math.max(12,Math.min(WORLD.width-12,car.x)),y=Math.max(12,Math.min(WORLD.height-12,car.y));
      if(x!==car.x||y!==car.y){car.vx=0;car.vy=0;}car.x=x;car.y=y;
      car.grassFraction=grassContact(car);car.offroad=car.grassFraction>.5;
      if(![car.x,car.y,car.angle,car.vx,car.vy].every(Number.isFinite))throw Error('Non-finite physics');
      const nearest=nearestTrack(car.x,car.y);let completed=null,split=null,startedNow=false;
      if(!car.crashed&&nearest.distance<ROAD_HALF&&car.speed>2.2){
        if(!started&&LPRCampus.crossesFinishLine(previous,car)){
          started=true;startedNow=true;lapStartTick=ticks;lastSplit=ticks;stage=0;sectors=[];
        }
        else if(started&&stage===0&&nearest.index>55&&nearest.index<85){stage=1;split=ticks-lapStartTick;}
        else if(started&&stage===1&&nearest.index>115&&nearest.index<145){stage=2;split=ticks-lapStartTick;}
        else if(started&&stage===2&&nearest.index>175&&nearest.index<205)stage=3;
        else if(started&&stage===3&&LPRCampus.crossesFinishLine(previous,car)){
          split=ticks-lapStartTick;
          completed={lap:lap++,startTick:lapStartTick,endTick:ticks,lapTicks:split,sectorTicks:[...sectors,ticks-lastSplit]};
          lastLap=completed;stage=0;lapStartTick=ticks;
        }
        if(split!==null){if(completed){sectors=[];}else sectors.push(ticks-lastSplit);lastSplit=ticks;}
      }
      return {completed,split,started:startedNow};
    }
    function result(){return {ticks,stage,lap,lapStartTick,started,sectorTicks:[...sectors],lastLap,crashed:!!car.crashed,
      state:{x:car.x,y:car.y,angle:car.angle,vx:car.vx,vy:car.vy,yawRate:car.yawRate,damage:car.damage??0}};}
    reset(car);
    return {reset,step,result,get ticks(){return ticks},nearestTrack,grassContact,get car(){return car},dynamics,people,track,trackDistances};
  }
  function encode(input){return [input.gas,input.brake,input.steer,!!input.analog,!!input.wheel,input.tc!==false];}
  function valid(a){return Array.isArray(a)&&a.length===6&&a.slice(0,3).every(Number.isFinite)&&a[0]>=0&&a[0]<=1&&a[1]>=0&&a[1]<=1&&Math.abs(a[2])<=1&&a.slice(3).every(v=>typeof v==='boolean');}
  function decode(a){if(!valid(a))throw Error('Invalid driving input');return {gas:a[0],brake:a[1],steer:a[2],analog:a[3],wheel:a[4],tc:a[5]};}
  root.LPRDriving={create,encode,decode,valid,hz};
})(window);
