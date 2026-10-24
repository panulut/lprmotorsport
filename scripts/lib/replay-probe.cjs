// Local feasibility probe. Never use this harness to approve production scores.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const files = ['shared/vehicle-spec.js', 'campus.js', 'shared/track-document.js',
  'shared/terrain.js', 'shared/track-objects.js', 'vehicle.js', 'shared/collision-index.js'];
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const game = read('game.js');
const begin = game.indexOf('  function nearestTrack(x, y) {');
const end = game.indexOf('  function update(dt, now', begin);
if (begin < 0 || end < begin) throw Error('Game contact helpers moved; update the probe.');
const helpers = game.slice(begin, end);
const sources = files.map(read);
const trackData = read('data/track-objects.json');
const revision = createHash('sha256').update(sources.join('\n') + helpers + trackData + 'experiment-120hz-v1' + createWorld.toString() + validateReplay.toString()).digest('hex');
const hz = 120;

function createWorld(indexed = true) {
  // Compile trusted repository sources once per world. No replay data is code.
  // A separate vm realm would add global-lookup overhead absent from a Worker.
  return new Function('window', 'module', `${sources.join('\n')}\nreturn (() => {
    const { LPRCampus, VehicleDynamics } = window;
    const track = LPRCampus.track, POINTS = track.length;
    const WORLD = LPRCampus.bounds;
    const { halfWidth: ROAD_HALF, kerbOuter: KERB_OUTER, shoulderOuter: SHOULDER_OUTER } = LPRCampus.road;
    const trackDistances = [0];
    for (let i=0;i<POINTS;i++) trackDistances.push(trackDistances[i]+Math.hypot(
      track[(i+1)%POINTS].x-track[i].x,track[(i+1)%POINTS].y-track[i].y));
    const dynamics = new VehicleDynamics();
    ${helpers}
    let car, ticks, stage, sectors, lastSplit, finished, collisionQuery;
    const indexed=${indexed ? 'true' : 'false'};
    const impact = contact => dynamics.applyImpact(car, contact.normal, contact.impactMaterial, contact);
    function reset() {
      LPRCampus.resetObstacles();
      car = {x:track[0].x,y:track[0].y,angle:Math.atan2(track[1].y-track[0].y,track[1].x-track[0].x)};
      dynamics.reset(car);
      collisionQuery=window.LPRCreateCollisionIndex(LPRCampus.obstacleBounds);
      ticks=0;stage=0;sectors=[];lastSplit=0;finished=false;
    }
    function split() { sectors.push(ticks-lastSplit);lastSplit=ticks; }
    function step(input) {
      if (finished) throw Error('Replay continues after finish');
      LPRCampus.stepObstacles(1/120,car,impact);
      car.grassFraction=grassContact(car);
      const previous={x:car.x,y:car.y,angle:car.angle};
      dynamics.step(car,input,1/120,car.grassFraction);
      if(indexed){
        const reach=Math.max(...LPRCampus.carCollisionParts(car).flat().map(p=>Math.hypot(...p)));
        // Padding covers any slide path of up to this step's full travel length.
        const padding=reach+Math.hypot(car.x-previous.x,car.y-previous.y)+1;
        LPRCampus.resolveBoundsCollision(car,previous,collisionQuery(previous.x,previous.y,car.x,car.y,padding),impact);
      }else LPRCampus.resolveObstacleCollision(car,previous,impact);
      const x=Math.max(12,Math.min(WORLD.width-12,car.x));
      const y=Math.max(12,Math.min(WORLD.height-12,car.y));
      if(x!==car.x||y!==car.y){car.vx=0;car.vy=0;}
      car.x=x;car.y=y;ticks++;
      const nearest=nearestTrack(car.x,car.y);
      car.grassFraction=grassContact(car);
      if(!car.crashed&&nearest.distance<ROAD_HALF&&car.speed>2.2) {
        if(stage===0&&nearest.index>55&&nearest.index<85){stage=1;split();}
        else if(stage===1&&nearest.index>115&&nearest.index<145){stage=2;split();}
        else if(stage===2&&nearest.index>175&&nearest.index<205)stage=3;
        else if(stage===3&&(nearest.index<5||nearest.index>235)){split();finished=true;}
      }
      if(![car.x,car.y,car.angle,car.vx,car.vy].every(Number.isFinite))throw Error('Non-finite physics');
    }
    function driver() {
      const nearest=nearestTrack(car.x,car.y),loop=trackDistances[POINTS];
      const lookahead=60+Math.max(0,car.speed)*3;
      const targetAlong=(nearest.along+lookahead)%loop;
      let i=0;while(i<POINTS-1&&trackDistances[i+1]<targetAlong)i++;
      const a=track[i],b=track[(i+1)%POINTS];
      const f=(targetAlong-trackDistances[i])/(trackDistances[i+1]-trackDistances[i]);
      const dx=a.x+(b.x-a.x)*f-car.x,dy=a.y+(b.y-a.y)*f-car.y;
      const lateral=(-Math.sin(car.angle)*dx+Math.cos(car.angle)*dy)*.1;
      const distance2=(dx*dx+dy*dy)*.01;
      const angle=Math.atan(2*dynamics.parameters.wheelbase*lateral/Math.max(.1,distance2));
      const steer=Math.max(-1,Math.min(1,angle/dynamics.parameters.maxRoadWheelAngle));
      const target=10;
      return {gas:car.speed<target?Math.min(1,(target-car.speed)*.5):0,
        brake:car.speed>target+.3?Math.min(1,(car.speed-target)*.25):0,steer,analog:true,wheel:true};
    }
    function result() {
      return {finished,ticks,lapMs:ticks*1000/120,sectorTicks:[...sectors],stage,
        crashed:!!car.crashed,state:{x:car.x,y:car.y,angle:car.angle,vx:car.vx,vy:car.vy,
          yawRate:car.yawRate,damage:car.damage??0}};
    }
    reset();
    return {reset,step,driver,result,track,position:()=>({x:car.x,y:car.y,angle:car.angle}),bodies:LPRCampus.bodies.length};
  })()` )({ LPRTrackData: JSON.parse(trackData) }, undefined);
}

function recordLap(world, maxTicks = hz * 240) {
  world.reset();
  const inputs=[];
  for(let i=0;i<maxTicks;i++) {
    const input=world.driver();
    inputs.push([input.gas,input.brake,input.steer]);
    world.step(input);
    const result=world.result();
    if(result.crashed)throw Error(`Test driver crashed after ${result.ticks} ticks`);
    if(result.finished)return {format:1,revision,hz,mode:'standing-start-no-people',inputs};
  }
  throw Error(`Test driver failed to finish: ${JSON.stringify(world.result())}`);
}

function validateReplay(replay) {
  if(replay?.format!==1||replay.revision!==revision||replay.hz!==hz||
    replay.mode!=='standing-start-no-people'||!Array.isArray(replay.inputs)||
    !replay.inputs.length||replay.inputs.length>hz*240)throw Error('Invalid replay header');
  for(const input of replay.inputs) {
    if(!Array.isArray(input)||input.length!==3||!input.every(Number.isFinite)||
      input[0]<0||input[0]>1||input[1]<0||input[1]>1||Math.abs(input[2])>1)throw Error('Invalid controls');
  }
}

function replayLap(world,replay) {
  validateReplay(replay);
  world.reset();
  for(const [gas,brake,steer] of replay.inputs)world.step({gas,brake,steer,analog:true,wheel:true});
  const result=world.result();
  if(!result.finished||result.crashed)throw Error('Replay did not complete a valid test lap');
  return result;
}
function browserBundle() {
  return `const sources=${JSON.stringify(sources)},helpers=${JSON.stringify(helpers)},trackData=${JSON.stringify(trackData)},revision=${JSON.stringify(revision)},hz=${hz};\n${createWorld.toString()}\n${validateReplay.toString()}\n${replayLap.toString()}\nwindow.ReplayLab={createWorld,validateReplay,replayLap,revision,hz};`;
}
module.exports={createWorld,recordLap,replayLap,validateReplay,revision,hz,browserBundle};
