/* Authoritative 120 Hz driving rules. No renderer, wall clock or browser storage. */
(function(root){
  const hz=120;
  function create({car,dynamics=new root.VehicleDynamics(),onImpact=()=>{},indexed=true}={}) {
    const LPRCampus=root.LPRCampus,window=root;
    const track=LPRCampus.track,POINTS=track.length,WORLD=LPRCampus.bounds;
    const {halfWidth:ROAD_HALF,kerbOuter:KERB_OUTER,shoulderOuter:SHOULDER_OUTER}=LPRCampus.road;
    const trackDistances=[0];
    for(let i=0;i<POINTS;i++)trackDistances.push(trackDistances[i]+Math.hypot(track[(i+1)%POINTS].x-track[i].x,track[(i+1)%POINTS].y-track[i].y));
  function nearestTrack(x, y) {
    let bestDist = Infinity;
    let index = 0;
    let along = 0;
    for (let i = 0; i < POINTS; i++) {
      const a = track[i];
      const b = track[(i + 1) % POINTS];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
      const distance = (x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2;
      if (distance < bestDist) {
        bestDist = distance; index = i;
        along=trackDistances[i]+t*(trackDistances[i+1]-trackDistances[i]);
      }
    }
    return { index, distance: Math.sqrt(bestDist), along };
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


    const people=root.LPRPeople.create();
    let ticks=0,lapStartTick=0,lastSplit=0,stage=0,lap=1,sectors=[],lastLap=null;
    let query;
    function reset(state) {
      LPRCampus.resetObstacles();
      car=state||{x:track[0].x,y:track[0].y,angle:Math.atan2(track[1].y-track[0].y,track[1].x-track[0].x)};
      dynamics.reset(car);dynamics.parameters.tractionControlEnabled=true;car.tcEnabled=true;
      ticks=0;lapStartTick=0;lastSplit=0;stage=0;lap=1;sectors=[];lastLap=null;
      people.update(0);query=root.LPRCreateCollisionIndex(LPRCampus.obstacleBounds);return car;
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
        const reach=Math.max(...LPRCampus.carCollisionParts(car).flat().map(p=>Math.hypot(...p)));
        const padding=reach+Math.hypot(car.x-previous.x,car.y-previous.y)+1;
        LPRCampus.resolveBoundsCollision(car,previous,query(previous.x,previous.y,car.x,car.y,padding),impact);
      }else LPRCampus.resolveObstacleCollision(car,previous,impact);
      const x=Math.max(12,Math.min(WORLD.width-12,car.x)),y=Math.max(12,Math.min(WORLD.height-12,car.y));
      if(x!==car.x||y!==car.y){car.vx=0;car.vy=0;}car.x=x;car.y=y;
      car.grassFraction=grassContact(car);car.offroad=car.grassFraction>.5;
      if(![car.x,car.y,car.angle,car.vx,car.vy].every(Number.isFinite))throw Error('Non-finite physics');
      const nearest=nearestTrack(car.x,car.y);let completed=null,split=null;
      if(!car.crashed&&nearest.distance<ROAD_HALF&&car.speed>2.2){
        if(stage===0&&nearest.index>55&&nearest.index<85){stage=1;split=ticks-lapStartTick;}
        else if(stage===1&&nearest.index>115&&nearest.index<145){stage=2;split=ticks-lapStartTick;}
        else if(stage===2&&nearest.index>175&&nearest.index<205)stage=3;
        else if(stage===3&&(nearest.index<5||nearest.index>235)){
          split=ticks-lapStartTick;
          completed={lap:lap++,startTick:lapStartTick,endTick:ticks,lapTicks:split,sectorTicks:[...sectors,ticks-lastSplit]};
          lastLap=completed;stage=0;lapStartTick=ticks;
        }
        if(split!==null){if(completed){sectors=[];}else sectors.push(ticks-lastSplit);lastSplit=ticks;}
      }
      return {completed,split};
    }
    function result(){return {ticks,stage,lap,lapStartTick,sectorTicks:[...sectors],lastLap,crashed:!!car.crashed,
      state:{x:car.x,y:car.y,angle:car.angle,vx:car.vx,vy:car.vy,yawRate:car.yawRate,damage:car.damage??0}};}
    reset(car);
    return {reset,step,result,nearestTrack,grassContact,get car(){return car},dynamics,people,track,trackDistances};
  }
  function encode(input){return [input.gas,input.brake,input.steer,!!input.analog,!!input.wheel,input.tc!==false];}
  function valid(a){return Array.isArray(a)&&a.length===6&&a.slice(0,3).every(Number.isFinite)&&a[0]>=0&&a[0]<=1&&a[1]>=0&&a[1]<=1&&Math.abs(a[2])<=1&&a.slice(3).every(v=>typeof v==='boolean');}
  function decode(a){if(!valid(a))throw Error('Invalid driving input');return {gas:a[0],brake:a[1],steer:a[2],analog:a[3],wheel:a[4],tc:a[5]};}
  root.LPRDriving={create,encode,decode,valid,hz};
})(window);
