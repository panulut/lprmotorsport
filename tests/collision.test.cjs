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
