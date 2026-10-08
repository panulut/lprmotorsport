const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const context = { window: {} };
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
const gl = new Proxy({}, {
  get: (_, key) => key === 'getShaderParameter' || key === 'getProgramParameter' ? () => true
    : key === 'bufferData' ? (_, data) => {
      mesh = data;
      assert.equal(data.length % 18, 0);
      assert([...data].every(Number.isFinite));
      assert([...data].filter((_, index) => index % 6 >= 3).every(value => value >= 0 && value <= 1));
    } : () => 0
});
vm.runInContext(source('campus.js'), context);
vm.runInContext(source('sale.js'), context);
vm.runInContext(source('renderer3d.js'), context);
const points = context.window.LPRCampus.track;
const renderer = new context.window.LPRRenderer3D({ getContext: () => gl }, { getContext: () => ({}) }, points);
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

// Integration: driving/settings pause the sauna, and exit stops its audio.
const nodes = new Map();
const documentEvents = {};
const element = id => {
  if (!nodes.has(id)) nodes.set(id, {
    tagName: 'DIV', classList: { add() {}, remove() {}, toggle() {} }, style: { setProperty() {} },
    setAttribute() {}, addEventListener() {}, clientWidth: 800
  });
  return nodes.get(id);
};
const gameContext = {
  window: { addEventListener() {}, screen: {} }, performance: { now: () => 1000 },
  document: { querySelector: element, querySelectorAll: () => [], addEventListener(type, handler) { documentEvents[type] = handler; }, exitPointerLock() { this.pointerLockElement = null; } },
  navigator: {}, localStorage: { getItem: () => null }, setTimeout() {}, clearTimeout() {},
  requestAnimationFrame() {}, ResizeObserver: class { observe() {} },
  LPRRenderer3D: class { constructor() { this.saunaStop = { x: 900, y: 650 }; } resize() {} },
  LPRTiltSteering: class { read() { return 0; } }
};
vm.createContext(gameContext);
vm.runInContext(source('sauna.js'), gameContext);
vm.runInContext(source('vehicle.js'), gameContext);
vm.runInContext(source('campus.js'), gameContext);
vm.runInContext(source('sale.js'), gameContext);
gameContext.LPRCampus = gameContext.window.LPRCampus;
gameContext.LPRSaunaLife = gameContext.window.LPRSaunaLife;
gameContext.VehicleDynamics = gameContext.window.VehicleDynamics;
vm.runInContext(source('game.js').replace(/  reset\(\);\s+resize\(\);/,
  'reset(); globalThis.test={get car(){return car},saunaLife,toggleSauna,toggleSale,held,update,throwSteam,reset}; resize();'), gameContext);
const game = gameContext.test;
game.car.x = 900; game.car.y = 650;
game.toggleSauna();
game.car.started = true; game.car.lapStart = 500;
game.update(.05, 1050);
assert.equal(game.saunaLife.time, .05);
assert.equal(game.car.lapStart, 550);
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
assert.equal(game.car.lapStart,550);
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
