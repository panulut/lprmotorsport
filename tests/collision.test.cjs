const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../campus.js'), 'utf8'), context);
const campus = context.window.LPRCampus;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../vehicle.js'), 'utf8'), context);
const dynamics = new context.window.VehicleDynamics();
const radius = 14;
function move(previous, destination) {
  const car = { ...destination, angle:Math.atan2(destination.y-previous.y,destination.x-previous.x), vx:36, vy:0, yawRate:1, speed:36 };
  const hit = campus.resolveBuildingCollision(car, previous);
  if(hit) dynamics.applyImpact(car,hit.normal);
  return { car, hit };
}
for (const b of campus.buildingBounds) {
  const x=(b.minX+b.maxX)/2, y=(b.minY+b.maxY)/2;
  for (const [axis, center, low, high] of [['x',y,b.minX,b.maxX], ['y',x,b.minY,b.maxY]]) {
    const other=axis==='x'?'y':'x';
    for (const direction of [-1,1]) {
      const start=direction===1?low-radius-20:high+radius+20;
      const end=direction===1?high+radius+20:low-radius-20;
      const {car,hit}=move({[axis]:start,[other]:center},{[axis]:end,[other]:center});
      assert(hit, 'Swept movement must hit even when the destination is beyond the building');
      assert(direction===1?car[axis]<=low-radius:car[axis]>=high+radius);
      assert.equal(car.speed,0);
      assert.equal(car.vx,0);
      assert.equal(car.vy,0);
      assert.equal(car.yawRate,0);
    }
  }
}
const b=campus.buildingBounds[0], y=(b.minY+b.maxY)/2;
let position={x:b.minX-radius-10,y};
for(let i=0;i<100;i++) {
  const {car}=move(position,{x:position.x+4,y});
  assert(car.x<b.minX-radius, 'Repeated throttle must not creep through the wall');
  position={x:car.x,y:car.y};
}
assert(!move(position,{x:position.x-10,y}).hit, 'The car must be able to drive away');
assert(!move({x:0,y:0},{x:100,y:0}).hit, 'Open ground must remain drivable');
assert(move({x:b.minX-40,y:b.minY-40},{x:b.minX+20,y:b.minY+20}).hit,
  'Diagonal corner impacts must be blocked');
console.log('PASS: building walls, high-speed sweeps, corners, repeated contact and driving away');

function moveAmongObstacles(previous, destination, speed=36) {
  const car={...destination,angle:Math.atan2(destination.y-previous.y,destination.x-previous.x),vx:speed,vy:0,yawRate:0,speed};
  const hit=campus.resolveObstacleCollision(car,previous);
  if(hit) dynamics.applyImpact(car,hit.normal);
  return {car,hit};
}
assert(campus.trees.length>0);
assert.equal(campus.trees.length,campus.treeBounds.length);
for(const tree of campus.trees) {
  for(const direction of [-1,1]) {
    const start={x:tree.x-direction*40,y:tree.y};
    const end={x:tree.x+direction*40,y:tree.y};
    const {car,hit}=moveAmongObstacles(start,end);
    assert(hit,'A high-speed sweep must hit the visible tree trunk');
    assert(direction*(car.x-tree.x)<=-radius-tree.trunkWidth/2,
      'The car must stop before passing through the trunk');
    assert(car.crashed,'A hard tree impact must use the existing damage model');
  }
}
// Find a tree with enough clear surrounding ground to isolate near misses.
const isolated=campus.trees.find(tree=>
  [...campus.buildingBounds,...campus.treeBounds].every(b=>
    (Math.abs((b.minX+b.maxX)/2-tree.x)<1e-8 && Math.abs((b.minY+b.maxY)/2-tree.y)<1e-8) ||
    b.maxX<tree.x-60 || b.minX>tree.x+60 || b.maxY<tree.y-60 || b.minY>tree.y+60));
assert(isolated,'Tree collision checks need an isolated trunk');
const tree=isolated;
let treePosition={x:tree.x-40,y:tree.y};
for(let i=0;i<30;i++) {
  const {car}=moveAmongObstacles(treePosition,{x:treePosition.x+4,y:treePosition.y},1);
  assert(car.x<tree.x-radius-tree.trunkWidth/2,'Repeated throttle must not creep through a tree');
  assert(!car.crashed,'A parking-speed tree nudge must not destroy the car');
  treePosition={x:car.x,y:car.y};
}
assert(!moveAmongObstacles(treePosition,{x:treePosition.x-10,y:treePosition.y}).hit,
  'The car must be able to move away from the trunk');
const clearY=tree.y+radius+tree.trunkWidth/2+.5;
assert(!moveAmongObstacles({x:tree.x-40,y:clearY},{x:tree.x+40,y:clearY}).hit,
  'Passing beside the trunk must not collide with its canopy');
console.log('PASS: visible tree trunks, high-speed sweeps, tree damage, repeated contact and near misses');

assert.equal(campus.vehicleBounds.length,campus.campusCars.length+campus.lakesideCars.length+2,
  'All parked cars, the tractor and sauna truck must have collision footprints');
assert.equal(new Set(campus.campusCars.map(car=>car.kind)).size,6,'The student car park must contain six body styles');
assert(new Set(campus.campusCars.map(car=>car.color.join(','))).size>=6,'Parked cars must have varied paint colours');
for(const [index,car] of campus.campusCars.entries()) {
  const bounds=campus.vehicleBounds[index],center=campus.world(car.row,car.z);
  assert(Math.abs((bounds.minX+bounds.maxX)/2-center.x)<1e-8);
  assert(Math.abs((bounds.minY+bounds.maxY)/2-center.y)<1e-8);
  assert.equal(bounds.angle,car.angle,'The footprint must follow the parked orientation');
  const length=bounds.maxX-bounds.minX,width=bounds.maxY-bounds.minY;
  assert(length>=car.model.length+1 && length<=car.model.length+1.2,'Bumper and plate overhangs must fit the footprint');
  assert(width>=car.model.width+2.6 && width<=car.model.width+2.8,'Wing mirrors must fit the footprint');
}
function vehiclePoint(bounds,x,y) {
  const cos=Math.cos(bounds.angle || 0), sin=Math.sin(bounds.angle || 0);
  return {x:(bounds.minX+bounds.maxX)/2+x*cos-y*sin,
    y:(bounds.minY+bounds.maxY)/2+x*sin+y*cos};
}
for(const bounds of campus.vehicleBounds) {
  for(const axis of ['x','y']) for(const direction of [-1,1]) {
    const start=vehiclePoint(bounds,axis==='x'?-direction*100:0,axis==='y'?-direction*100:0);
    const end=vehiclePoint(bounds,axis==='x'?direction*100:0,axis==='y'?direction*100:0);
    const {car,hit}=moveAmongObstacles(start,end);
    assert(hit,'High-speed movement must not pass through a stationary vehicle');
    assert(car.crashed,'A hard vehicle impact must use the existing damage model');
    const travelX=end.x-start.x, travelY=end.y-start.y;
    const travelled=((car.x-start.x)*travelX+(car.y-start.y)*travelY)/(travelX*travelX+travelY*travelY);
    const halfSize=axis==='x'?(bounds.maxX-bounds.minX)/2:(bounds.maxY-bounds.minY)/2;
    assert(travelled<=(100-halfSize-radius)/200+1e-8,
      'The first obstacle must stop movement before it crosses the vehicle footprint');
    assert(Math.abs(Math.hypot(hit.normal.x,hit.normal.y)-1)<1e-8,
      'Rotated contacts must return a unit world-space normal');
  }
}
// The final lakeside passenger car has clear ground on its outward side.
const parked=campus.vehicleBounds[campus.campusCars.length+campus.lakesideCars.length-1];
const halfWidth=(parked.maxX-parked.minX)/2;
const approach=vehiclePoint(parked,-halfWidth-radius-5,0);
const inside=vehiclePoint(parked,-halfWidth,0);
const bump=moveAmongObstacles(approach,inside,1);
assert(bump.hit && !bump.car.crashed && bump.car.damage===0,
  'A parking-speed bump must stop the car without wrecking it');
assert(!moveAmongObstacles(bump.car,approach,1).hit,'The car must be able to leave a parked-car contact');
const nearStart=vehiclePoint(parked,-halfWidth-radius-.5,-10);
const nearEnd=vehiclePoint(parked,-halfWidth-radius-.5,10);
assert(!moveAmongObstacles(nearStart,nearEnd).hit,
  'A clear pass alongside a rotated car must remain drivable');
console.log('PASS: parked cars, rotated footprints, tractor, sauna truck, hard impacts and parking nudges');

function impact(vx,vy=0,normal={x:-1,y:0}) {
  const car={x:0,y:0,angle:0};
  dynamics.reset(car);
  car.vx=vx; car.vy=vy;
  dynamics.applyImpact(car,normal);
  return car;
}
assert.equal(impact(1).damage,0,'Parking nudges must not wreck the car');
const medium=impact(5);
assert(medium.damage>0 && medium.damage<1 && !medium.crashed);
const hard=impact(12);
assert(hard.crashed && hard.damage===1,'A hard head-on collision must wreck the car');
const wreckPosition={x:hard.x,y:hard.y,angle:hard.angle};
for(let i=0;i<100;i++) dynamics.step(hard,{gas:1,brake:0,steer:1},1/90,0);
assert.deepEqual({x:hard.x,y:hard.y,angle:hard.angle},wreckPosition,'A wreck must stay immobilized');
assert.equal(hard.speed,0);
const glancing=impact(30,1,{x:0,y:-1});
assert(!glancing.crashed && glancing.damage===0,'High tangential speed must not cause a fatal impact');
assert(glancing.vx>25 && glancing.vy===0,'A glancing impact must retain tangential movement');
assert(impact(6).damage>medium.damage,'Faster perpendicular impacts must cause more damage');
assert.equal(impact(12).impactEnergy,.5*dynamics.parameters.mass*12**2);
for(let i=0;i<3;i++) { medium.vx=5; dynamics.applyImpact(medium,{x:-1,y:0}); }
assert(medium.crashed,'Repeated moderate impacts must accumulate damage');
console.log('PASS: impact energy, progressive damage, glancing response, accumulated damage and immobilized wreck');
