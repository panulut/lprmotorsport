const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const images = [];
const context = { window: { LPRVehicleSpec: require('../shared/vehicle-spec.js'), }, Image: class { constructor() { images.push(this); } } };
vm.createContext(context);
vm.runInContext(source('sauna.js'), context);
const captions = [];
const life = new context.window.LPRSaunaLife(text => captions.push(text));
const car = { sauna: true, saunaSide: -1, steamAt: -10000, saunaLife: life };

life.update(2, car, 2000);
assert(captions.some(line => line.includes('ajokierros')));
life.time = 4;
life.line = null;
assert(life.guests.some(guest => life.pose(guest.index).sip > 0));
for (const side of [-1, 1]) {
  life.nextSteam = 18;
  life.time = 17;
  car.saunaSide = side;
  car.steamAt = -10000;
  life.update(1, car, 20000);
  assert.equal(car.steamActor, side === 1 ? 5 : 1);
  assert.equal(car.steamAt, 20000);
}
life.time = 32.5;
assert(life.pose(0).standing > 0);
life.time = 35;
assert(life.pose(0).walking);
life.time = 39.5;
assert.equal(life.pose(0).visible, false);
life.time = 40.9;
life.update(.2, car, 41000);
assert.equal(life.guests[0].generation, 1);
assert(life.pose(0).walking);
assert.notEqual(life.guests[0].name, 'Aino');
life.time = 48.1;
assert.equal(life.pose(0).standing, 0);
assert.equal(life.pose(0).visible, true);
life.time = 38;
assert(life.doorOpen());
life.time = 20;
assert.equal(life.doorOpen(), false);
life.wasDoorOpen = true;
life.line = null;
life.nextLine = Infinity;
life.nextSteam = Infinity;
life.update(0, car, 20000);
assert(captions.at(-1).includes('Turkasen tulimmainen, nyt se ovi kiinni!'));
assert(!captions.at(-1).includes('oli kiinni'));
life.reset();
assert.equal(life.time, 0);
assert.equal(life.guests[0].generation, 0);
life.time = 30;
life.line = { speaker: 4, kind: 'sing', until: 35 };
assert(life.guests.every(guest => life.pose(guest.index).singing));

// Frequent throws build heat, trigger the requested lines and a real cooling trip.
const heatCaptions = [];
const hotLife = new context.window.LPRSaunaLife(text => heatCaptions.push(text));
const hotCar = { saunaSide: -1, steamAt: -10000 };
for(let second=0;second<=8;second++) {
  hotCar.steamAt=second*1000;
  hotLife.update(second ? 1 : 0,hotCar,second*1000);
  hotLife.registerSteam();
}
for(const text of ['Huh huh, nyt on kyllä kunnon löylyt','Ai saakeli, kun on kuuma','Ei hitto, ei tällaisia löylyjä kestä']) {
  assert(heatCaptions.some(line=>line.includes(text)),text);
}
const overheated = hotLife.guests.find(guest=>guest.heatExit!==undefined);
assert(overheated);
const exitTime=overheated.heatExit, originalName=overheated.name;
assert.equal(hotLife.pose(overheated.index).standing,0,'Guest finishes the complaint before leaving');
while(hotLife.time<exitTime+2) hotLife.update(.25,hotCar,hotLife.time*1000);
assert(hotLife.pose(overheated.index).walking);
while(hotLife.time<exitTime+7.5) hotLife.update(.25,hotCar,hotLife.time*1000);
assert.equal(hotLife.pose(overheated.index).visible,false);
while(hotLife.time<exitTime+10) hotLife.update(.25,hotCar,hotLife.time*1000);
assert(hotLife.pose(overheated.index).walking);
while(hotLife.time<exitTime+16.1) hotLife.update(.25,hotCar,hotLife.time*1000);
assert.equal(overheated.heatExit,undefined);
assert.equal(overheated.name,originalName,'Cooling guest returns without being replaced');
assert.equal(hotLife.pose(overheated.index).standing,0);
hotLife.time=overheated.regularStart+2;
assert(hotLife.pose(overheated.index).walking,'Regular turnover resumes after cooling');
hotLife.reset();
assert.equal(hotLife.heat,0);
assert(hotLife.guests.every(guest=>guest.heatExit===undefined));
for(let i=0;i<3;i++) {hotLife.registerSteam();hotLife.nextSteam=Infinity;hotLife.update(10,hotCar,100000);}
assert.equal(hotLife.heat,0,'Sparse throws cool between splashes');
assert.equal(hotLife.line?.kind==='heat',false);

// Sound is opt-in; speech and harmony notes stop on mute or leaving the sauna.
const spoken = [];
let stoppedNotes = 0;
context.window.speechSynthesis = { cancel() {}, getVoices: () => [{ lang: 'fi-FI' }], speak: speech => spoken.push(speech) };
context.window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
context.window.AudioContext = class {
  constructor() { this.currentTime = 0; }
  resume() { return Promise.resolve(); }
  createOscillator() { return { frequency: {}, connect() {}, disconnect() {}, start() {}, stop() { stoppedNotes++; } }; }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
};
life.setSound(true);
life.say(life.guests[0], 'Hyvät löylyt!');
assert.equal(spoken.at(-1).lang, 'fi-FI');
life.say(life.guests[0], 'Saunalaulu', 'sing');
assert.equal(life.notes.length, 24);
life.leave();
assert.equal(life.notes.length, 0);
assert(stoppedNotes >= 48);
life.setSound(false);

// Sample the entire entry/exit cycle, including the lower bench and steps.
for (let time = 33; time < 39; time += .1) {
  life.time = time;
  const pose = life.pose(0);
  if (pose.position[0] < 2005.5) assert.equal(pose.position[1], 0);
  assert.equal(pose.position[1]+4.5,life.floorAt(pose.position[0],pose.position[2]));
}

let mesh;
let boundBuffer, rendererReady=false;
const uploads=new Map();
const validateMesh=(data,stride)=>{
  assert.equal(data.length % (stride*3),0);
  assert([...data].every(Number.isFinite));
  assert([...data].filter((_,index)=>index%stride>=3 && index%stride<6).every(value=>value>=0 && value<=1));
};
const gl = new Proxy({}, {
  get: (_, key) => key === 'getShaderParameter' || key === 'getProgramParameter' ? () => true
    : key === 'createBuffer' ? () => ({})
    : key === 'bindBuffer' ? (_,buffer) => {boundBuffer=buffer;}
    : key === 'bufferData' ? (_, data) => {
      assert([...data].every(Number.isFinite));
      // Index buffers are validated separately by view-culling.test.cjs.
      if(data.constructor.name!=='Float32Array') return;
      mesh = data;
      uploads.set(boundBuffer,data);
      if(rendererReady) validateMesh(data,6);
    } : () => 0
});
vm.runInContext(source('campus.js'), context);
vm.runInContext(source('shared/track-document.js'), context);
vm.runInContext(source('shared/terrain.js'), context);
const initialSauna={...context.window.LPRCampus.saunaSite},initialFire={...context.window.LPRCampus.bonfireSite};
const saunaFootprint=context.window.LPRCampus.vehicleBounds.at(-1);
const initialFootprint={...saunaFootprint};
context.window.LPRTrackData={version:1,objects:[
  {type:'sauna',x:initialSauna.x+100,y:initialSauna.y+50,angle:-3*Math.PI/4,scale:1},
  {type:'bonfire',x:initialFire.x-80,y:initialFire.y+30,angle:0,scale:1},
  {type:'pool',x:3200,y:1500,angle:0,scale:1},
  {type:'person',personId:0,x:3100,y:1400,angle:0,scale:1}
]};
vm.runInContext(source('shared/track-objects.js'), context);
assert.equal(saunaFootprint.minX,initialFootprint.minX+100);
assert.equal(saunaFootprint.minY,initialFootprint.minY+50);
assert.equal(context.window.LPRCampus.bonfireSite.x,initialFire.x-80);
vm.runInContext(source('sale.js'), context);
vm.runInContext(source('renderer3d.js'), context);
const points = context.window.LPRCampus.track;
const renderer = new context.window.LPRRenderer3D({ getContext: () => gl }, { getContext: () => ({}) }, points);
assert.equal(renderer.saunaStop.x,initialSauna.x+100);
assert.equal(renderer.saunaStop.y,initialSauna.y+50);
assert.equal(renderer.poolStop.x,3200);
assert.equal(renderer.poolStop.y,1500);
const frame=renderer.spectatorFrame,person=renderer.spectatorMeshes[0];
assert(Math.abs(frame.stop[0]+frame.forwardX*person.forward+frame.rightX*person.side-3100)<1e-8);
assert(Math.abs(frame.stop[2]+frame.forwardZ*person.forward+frame.rightZ*person.side-1400)<1e-8);
const texturedMeshes=[...renderer.materialMeshes,renderer.gantryLogo,renderer.saunaArtwork,renderer.kerbMesh,renderer.roadPaintMesh];
for(const [buffer,data] of uploads) validateMesh(data,texturedMeshes.some(mesh=>mesh?.buffer===buffer) ? 8 : 6);
const gantryLogo=renderer.gantryLogo;
assert.equal(gantryLogo.count,12,'The finish gantry carries a logo quad on each face');
assert.equal(gantryLogo.ready,false);
images.find(image=>image.src==='assets/lpr-logo-transparent.png').onload();
assert.equal(gantryLogo.ready,true);
const logo=uploads.get(gantryLogo.buffer);
const {normalX,normalY}=context.window.LPRCampus.finishGate;
for(const [offset,direction] of [[0,1],[48,-1]]) {
  const across=(logo[offset+8]-logo[offset])*normalX+(logo[offset+10]-logo[offset+2])*normalY;
  assert(across*direction>0,'The logo reads left to right from each direction');
  assert.deepEqual(Array.from(logo.slice(offset+6,offset+8)),[0,0]);
  assert.deepEqual(Array.from(logo.slice(offset+14,offset+16)),[1,0]);
}
assert(renderer.materialMeshes.every(mesh=>mesh.count>0),'Campus must contain brick, concrete, wood and glass surfaces');
assert(renderer.saunaArtwork.count > 4000, 'Artwork follows both walls with perspective-correct subdivisions');
const artwork = uploads.get(renderer.saunaArtwork.buffer);
for(let i=0;i<artwork.length;i+=8) {
  assert(artwork[i+6]>=0 && artwork[i+6]<=1 && artwork[i+7]>=0 && artwork[i+7]<=1, 'Photo coordinates stay within the supplied image');
}
assert.equal(renderer.saunaArtwork.ready,false);
images.find(image=>image.src==='assets/sauna-reference.jpg').onload();
assert.equal(renderer.saunaArtwork.ready,true,'Artwork is drawn only after the image loads');
renderer.drawKerbs(renderer.saunaArtwork);
rendererReady=true;
assert.equal(renderer.saunaGuestMeshes.length, 8);
assert(renderer.saleVertexCount>0);
assert.equal(context.window.LPRSale.canWalk(35,130),true);
assert.equal(context.window.LPRSale.canWalk(-3,40),false);
assert.equal(context.window.LPRSale.canWalk(85,130),false);
for (const time of [0, 4, 18, 32.5, 34, 36, 38, 39.5, 41, 43, 47.5, 49, 162, 194]) {
  life.time = time;
  renderer.drawSaunaGuests(car, time * 1000);
  assert(mesh.length > 0);
  renderer.drawSaunaLadle(car, time * 1000);
}

// The throwing arm follows the player's shoulder on either bench, including
// after walking and turning, while the hand still grips the ladle.
for (const side of [-1, 1]) for (const yaw of [0, Math.PI / 2, Math.PI]) {
  const player = { saunaSide: side, saunaX: 1987, saunaZ: side * 5,
    saunaYaw: yaw, steamAt: 1000, steamActor: 'player' };
  renderer.drawSaunaLadle(player, 1450);
  const skinPoints = [];
  for (let i = 0; i < mesh.length; i += 6) {
    if (Math.abs(mesh[i + 3] - .86) < 1e-6 && Math.abs(mesh[i + 4] - .64) < 1e-6)
      skinPoints.push([mesh[i], mesh[i + 1], mesh[i + 2]]);
  }
  const shoulder = [player.saunaX - .8 * Math.cos(yaw) - 1.1 * Math.sin(yaw),
    14.6, player.saunaZ - .8 * Math.sin(yaw) + 1.1 * Math.cos(yaw)];
  assert(skinPoints.some(point => Math.abs(Math.hypot(...point.map((v, i) => v - shoulder[i])) - .38) < .001),
    'Upper arm must start at the player shoulder');
  assert(skinPoints.some(point => Math.hypot(point[0] - 1988.3, point[1] - 12.85, point[2] - side * 1.7) < .4),
    'Hand must remain on the moving ladle handle');
}

// Integration: driving/settings pause the sauna, and exit stops its audio.
const nodes = new Map();
const documentEvents = {};
const element = id => {
  if (!nodes.has(id)) nodes.set(id, {
    tagName: 'DIV', dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, style: { setProperty() {} },
    setAttribute() {}, addEventListener() {}, querySelector: element, clientWidth: 800
  });
  return nodes.get(id);
};
const gameContext = {
  URLSearchParams, CustomEvent,
  window: { LPRVehicleSpec: require('../shared/vehicle-spec.js'),  matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, screen: {}, location: {search:''} }, performance: { now: () => 1000 },
  document: { querySelector: element, querySelectorAll: () => [], addEventListener(type, handler) { documentEvents[type] = handler; }, dispatchEvent() {}, exitPointerLock() { this.pointerLockElement = null; } },
  navigator: {}, localStorage: { getItem: () => null }, setTimeout() {}, clearTimeout() {},
  requestAnimationFrame() {}, ResizeObserver: class { observe() {} },
  LPRRenderer3D: class { constructor() { this.saunaStop = { x: 900, y: 650 }; } resize() {} updatePeople() {} },
  LPRTiltSteering: class { read() { return 0; } }
};
vm.createContext(gameContext);
vm.runInContext(source('audio.js'), gameContext);
gameContext.LPRGameAudio = gameContext.window.LPRGameAudio;
vm.runInContext(source('sauna.js'), gameContext);
vm.runInContext(source('vehicle.js'), gameContext);
vm.runInContext(source('campus.js'), gameContext);
vm.runInContext(source('sale.js'), gameContext);
vm.runInContext(source('timing.js'), gameContext);
gameContext.LPRLapTiming = gameContext.window.LPRLapTiming;
gameContext.LPRCampus = gameContext.window.LPRCampus;
gameContext.LPRSaunaLife = gameContext.window.LPRSaunaLife;
gameContext.VehicleDynamics = gameContext.window.VehicleDynamics;
vm.runInContext(source('game.js').replace(/  reset\(\);\s+(?:openTestScene\([^\n]+\);\s+)?resize\(\);/,
  'reset(); globalThis.test={get car(){return car},saunaLife,toggleSauna,toggleSale,held,update,throwSteam,reset}; resize();'), gameContext);
const game = gameContext.test;
game.car.x = 900; game.car.y = 650;
game.toggleSauna();
game.car.started = true; game.car.lapStart = 500;
game.update(.05, 1050);
assert.equal(game.saunaLife.time, .05);
assert.equal(game.car.lapStart, 500,'Visits count toward the lap time');
assert.equal(game.car.x, 900);
element('#settings-dialog').open = true;
game.update(.05, 1100);
assert.equal(game.saunaLife.time, .05);
element('#settings-dialog').open = false;
game.throwSteam();
assert.equal(game.car.steamActor, 'player');
assert.equal(game.saunaLife.heat,1.2);
game.throwSteam();
assert.equal(game.saunaLife.heat,1.2,'Rejected rapid clicks do not add heat');
game.toggleSauna();
assert.equal(element('#sauna-dialogue').hidden, true);
game.toggleSauna();
assert.equal(game.saunaLife.time, 0);
game.reset();
assert.equal(element('#sauna-dialogue').hidden, true);
// Shop entry requires a parked car, freezes the driving position and lap timer,
// and returns to the same parked vehicle; shelving blocks foot movement.
const entrance=gameContext.window.LPRSale.entrance;
game.toggleSale();
assert(!game.car.sale);
game.car.x=entrance.x; game.car.y=entrance.y; game.car.speed=2;
game.toggleSale();
assert(!game.car.sale);
game.car.speed=0;
game.toggleSale();
assert.equal(game.car.sale,true);
assert.equal(element('#sauna-enter').disabled,true);
game.car.started=true; game.car.lapStart=500;
game.held.gas=true;
const beforeZ=game.car.saleZ;
game.update(.05,1100);
assert(game.car.saleZ<beforeZ);
assert.equal(game.car.lapStart,500,'Visits count toward the lap time');
assert.equal(game.car.x,entrance.x);
assert.equal(game.car.y,entrance.y);
game.toggleSauna();
assert(!game.car.sauna);
element('#settings-dialog').open=true;
const pausedZ=game.car.saleZ;
game.update(.05,1150);
assert.equal(game.car.saleZ,pausedZ);
element('#settings-dialog').open=false;
game.toggleSale();
assert.equal(game.car.sale,false);
assert.equal(game.car.x,entrance.x);
game.toggleSale();
const lookYaw=game.car.saunaYaw, lookPitch=game.car.saunaPitch;
documentEvents.mousemove({movementX:40,movementY:-20});
assert.equal(game.car.saunaYaw,lookYaw,'Unlocked mouse movement must not turn the view');
const view=element('#track');
view.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});
gameContext.document.pointerLockElement=view;
documentEvents.pointerlockchange();
documentEvents.mousemove({movementX:40,movementY:-20});
assert(Math.abs(game.car.saunaYaw-lookYaw-.1)<1e-9,'Locked mouse movement must turn right');
assert.equal(game.car.saunaPitch,lookPitch+.05,'Moving the mouse up must look up');
gameContext.document.pointerLockElement=null;
documentEvents.pointerlockchange();
game.car.saunaYaw=lookYaw; game.car.saunaPitch=lookPitch;
const yaw=game.car.saunaYaw;
const startX=game.car.saleX, startZ=game.car.saleZ;
game.held.gas=true; game.held.right=true;
game.update(.05,1200);
assert(game.car.saleX>startX && game.car.saleZ<startZ, 'W+D must walk forward and right');
assert.equal(game.car.saunaYaw,yaw,'Strafing must not turn the camera');
assert(Math.abs(Math.hypot(game.car.saleX-startX,game.car.saleZ-startZ)-1.1)<1e-9,
  'Diagonal walking must retain the straight walking speed');
game.held.gas=false;
const strafeZ=game.car.saleZ;
game.update(.05,1250);
assert.equal(game.car.saleZ,strafeZ,'D alone must move sideways');
game.reset(); assert(!game.car.sale);
const wall=gameContext.window.LPRCampus.buildingBounds[0];
Object.assign(game.car,{x:wall.minX-14-.1,y:(wall.minY+wall.maxY)/2,angle:0,vx:12,started:true,lapStart:1000});
game.update(.02,2000);
assert(game.car.crashed,'A hard wall impact must end driving');
assert.equal(game.car.speed,0);
const wreckX=game.car.x, frozenTime=element('#lap-time').textContent;
game.held.gas=true;
game.update(.05,3000);
assert.equal(game.car.x,wreckX);
assert.equal(element('#lap-time').textContent,frozenTime,'The lap timer must stop after a crash');
game.car.x=entrance.x; game.car.y=entrance.y;
game.toggleSale(); assert(!game.car.sale,'A wreck cannot bypass the crash by entering a shop');
game.reset();
assert.equal(game.car.damage,0);
assert.equal(game.car.crashed,false,'Restart must supply an undamaged car');
console.log('PASS: shop entry, walking, pause, return, reset; social actions, sound lifecycle, guest steam, turnover, door, route, animated geometry, sauna pause and reset');
