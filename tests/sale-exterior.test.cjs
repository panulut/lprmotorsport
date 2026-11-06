const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
// Street view looks toward +Z: screen-right is -X. The two tenants must
// remain in their respective wings and the interaction must match the door.
const exteriorContext={window: { LPRVehicleSpec: require('../shared/vehicle-spec.js'), LPRCampus:{world:(x,y)=>({x:(x-100)*5+200,y:(y-100)*5+200})}}};
vm.createContext(exteriorContext);
vm.runInContext(fs.readFileSync(path.join(root,'sale.js'),'utf8'),exteriorContext);
const exteriorSale=exteriorContext.window.LPRSale,facade=new Map(),exteriorBoxes=[],exteriorQuads=[];
exteriorSale.buildExterior({box(...args){exteriorBoxes.push(args);},quad(...args){
  assert(args.slice(0,4).flat().every(Number.isFinite));
  exteriorQuads.push(args);
},artwork(id,points){facade.set(id,points);}});
const buildingCenter=exteriorContext.window.LPRCampus.world(550,462);
const faceCenterX=id=>facade.get(id).reduce((sum,p)=>sum+p[0],0)/4;
assert(faceCenterX('yolo')>buildingCenter.x,'Yolo must be on the left from the street');
assert(faceCenterX('sign')<buildingCenter.x-75,'Sale sign must be in the right wing');
for(let i=0;i<10;i++) assert(faceCenterX('poster'+i)<buildingCenter.x-75,
  'Shop advertisements must not cover the cafeteria');
for(const points of facade.values()) {
  assert(points[0][0]>points[1][0],'Facade text must read left to right from the street');
  assert(points[0][1]<points[3][1],'Facade text must remain upright');
}
assert(exteriorBoxes.some(([x,y,z,w,h])=>x===exteriorSale.entrance.x && y===6.5 && w===17 && h===29),
  'Sale interaction point must align with the relocated shop doorway');
assert(exteriorBoxes.filter(([x,y,z,w,h])=>y===47 && h===7).length>=20,
  'The shared building must have narrow, individually framed upper windows');
const rampTops=exteriorQuads.filter(args=>args[4].join(',')==='0.49,0.5,0.46');
assert.equal(rampTops.length,2,'There must be two sloping ramp surfaces');
const localU=point=>buildingCenter.x-point[0];
const leftRamp=rampTops.find(args=>localU(args[0])<0);
const rightRamp=rampTops.find(args=>localU(args[0])>0);
assert(leftRamp[0][1]<leftRamp[1][1],'Left ramp must rise toward the entrance');
assert(rightRamp[0][1]>rightRamp[1][1],'Right ramp must fall away from the entrance');
assert.equal(leftRamp[1][1],rightRamp[0][1],'Both ramps must meet the same landing height');
for(const points of [leftRamp,rightRamp]) {
  for(const p of points.slice(0,2)) assert(exteriorQuads.some(args=>args.slice(0,4).some(v=>
    Math.abs(v[0]-p[0])<.3 && Math.abs(v[2]-p[2])<.3 && Math.abs(v[1]-(p[1]+10.5))<.3)),
    'Ramp handrails must follow the incline at a consistent height');
}
const doorMin=exteriorSale.entrance.x-8.5,doorMax=exteriorSale.entrance.x+8.5;
for(let i=0;i<10;i++) assert(facade.get('poster'+i).every(p=>p[0]<doorMin || p[0]>doorMax),
  'Posters must not obscure the shared entrance');
const document=JSON.parse(fs.readFileSync(path.join(root,'data/track-objects.json'),'utf8'));
// The barrier line drawn on 2026-10-27 closes the gap between the track and the
// building corner. Its rails stop about 3 units short of the left ramp; only the
// 8-unit-deep barrier footprint grazes the clear zone, by up to 2.5 units.
// Moving the barriers would change the verified driving revision.
const barrierTolerance=3;
for(const o of document.objects.filter(o=>o.type==='barrier')) {
  // Same footprint as shared/track-document.js: editor-drawn barriers carry their own length.
  const halfLength=(o.length??40)/2;
  const halfX=(halfLength*Math.abs(Math.cos(o.angle))+4*Math.abs(Math.sin(o.angle)))*o.scale-barrierTolerance;
  const halfZ=(halfLength*Math.abs(Math.sin(o.angle))+4*Math.abs(Math.cos(o.angle)))*o.scale-barrierTolerance;
  assert(!(o.x+halfX>buildingCenter.x-150 && o.x-halfX<buildingCenter.x+150 &&
    o.y+halfZ>buildingCenter.y-77 && o.y-halfZ<buildingCenter.y-51),
    'Track crash barriers must stay clear of the building ramps and entrance');
}
console.log('PASS: shared facade, clear shop entrance, two inclined ramps and matching tubular rails');

const drivingContext={window: { LPRVehicleSpec: require('../shared/vehicle-spec.js'), }};
vm.runInNewContext(fs.readFileSync(path.join(root,'campus.js'),'utf8'),drivingContext);
vm.runInNewContext(fs.readFileSync(path.join(root,'vehicle.js'),'utf8'),drivingContext);
const campus=drivingContext.window.LPRCampus,dynamics=new drivingContext.window.VehicleDynamics();
const steps=exteriorBoxes.filter(([x,y,z,w,h,d])=>y===0 && w===22 && d===2.1);
assert.equal(steps.length,3);
for(const [x,y,z,w,h,d] of steps) assert(campus.obstacleBounds.some(b=>
  Math.abs(b.minX-(x-w/2))<1e-8 && Math.abs(b.maxX-(x+w/2))<1e-8 &&
  Math.abs(b.minY-(z-d/2))<1e-8 && Math.abs(b.maxY-(z+d/2))<1e-8),
  'Every visible stair must have its matching collision footprint');
const front=steps[0][2]-steps[0][5]/2,x=steps[0][0];
for(const speed of [1,36]) {
  const previous={x,y:front-40,angle:Math.PI/2};
  const car={x,y:front+10,angle:Math.PI/2,vx:speed,vy:0,speed,yawRate:0};
  const hit=campus.resolveObstacleCollision(car,previous,
    contact=>dynamics.applyImpact(car,contact.normal,contact.impactMaterial));
  assert(hit,'Driving into the stairs must cause contact even during a fast sweep');
  assert(car.y<front-12.4,'The nose must stop before the first visible step');
  assert.equal(!!car.crashed,speed>=8,'Stair impacts must use the normal vehicle damage rules');
}
// Check each entire road segment, including the shoulder, against the access area.
const access={minX:buildingCenter.x-148,maxX:buildingCenter.x+147,
  minY:front,maxY:buildingCenter.y-51};
const clearance=campus.road.shoulderOuter+2;
for(let i=0;i<campus.track.length;i++) {
  const a=campus.track[i],b=campus.track[(i+1)%campus.track.length];
  assert(Math.max(a.x,b.x)+clearance<access.minX || Math.min(a.x,b.x)-clearance>access.maxX ||
    Math.max(a.y,b.y)+clearance<access.minY || Math.min(a.y,b.y)-clearance>access.maxY,
    'The full road shoulder must stay clear of the ramps, landing and stairs');
}
console.log('PASS: solid Sale stairs, impact damage and road clearance beside the ramps');
