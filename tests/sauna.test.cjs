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
const element = id => {
  if (!nodes.has(id)) nodes.set(id, {
    tagName: 'DIV', classList: { add() {}, remove() {}, toggle() {} }, style: { setProperty() {} },
    setAttribute() {}, addEventListener() {}, clientWidth: 800
  });
  return nodes.get(id);
};
const gameContext = {
  window: { addEventListener() {}, screen: {} }, performance: { now: () => 1000 },
  document: { querySelector: element, querySelectorAll: () => [], addEventListener() {} },
  navigator: {}, localStorage: { getItem: () => null }, setTimeout() {}, clearTimeout() {},
  requestAnimationFrame() {}, ResizeObserver: class { observe() {} },
  LPRRenderer3D: class { constructor() { this.saunaStop = { x: 900, y: 650 }; } resize() {} },
  LPRTiltSteering: class { read() { return 0; } }
};
vm.createContext(gameContext);
vm.runInContext(source('sauna.js'), gameContext);
vm.runInContext(source('vehicle.js'), gameContext);
vm.runInContext(source('campus.js'), gameContext);
gameContext.LPRCampus = gameContext.window.LPRCampus;
gameContext.LPRSaunaLife = gameContext.window.LPRSaunaLife;
gameContext.VehicleDynamics = gameContext.window.VehicleDynamics;
vm.runInContext(source('game.js').replace(/  reset\(\);\s+resize\(\);/,
  'reset(); globalThis.test={get car(){return car},saunaLife,toggleSauna,update,throwSteam,reset}; resize();'), gameContext);
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
console.log('PASS: social actions, sound lifecycle, guest steam, turnover, door, route, animated geometry, sauna pause and reset');
