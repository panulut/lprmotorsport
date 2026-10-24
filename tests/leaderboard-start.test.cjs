const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const analytics=[];
let observedPeopleTime;
const nodes=new Map(),submissions=[],mediaHandlers=[];let requiresName=true,startedSessions=0;
let onlineStarts=0,onlineCancels=0;
const timers=new Map();let nextTimer=0;
const windowHandlers=new Map(),documentHandlers=new Map();
const emitDocument=(type,event={})=>{for(const fn of documentHandlers.get(type)||[])fn(event)};
const emitWindow=(type,event={})=>{for(const fn of windowHandlers.get(type)||[])fn(event)};
const element=id=>{
  if(!nodes.has(id)){const handlers={};nodes.set(id,{dataset:{control:id.match(/data-control="(\w+)"/)?.[1]},setPointerCapture(){},trigger(type,event){handlers[type]?.(event)},tagName:'DIV',open:false,value:'',classList:{add(){},remove(){},toggle(){}},style:{setProperty(){}},setAttribute(){},querySelector:element,
    addEventListener:(type,handler)=>{handlers[type]=handler},click(){handlers.click?.()},showModal(){this.open=true},close(){this.open=false;handlers.close?.()},clientWidth:800});}
  return nodes.get(id);
};
const ctx={URLSearchParams,window:{LPRVehicleSpec:require('../shared/vehicle-spec.js'),location:{search:''},screen:{},addEventListener(type,fn){if(!windowHandlers.has(type))windowHandlers.set(type,[]);windowHandlers.get(type).push(fn)},
  matchMedia:()=>({matches:false,addEventListener:(type,handler)=>mediaHandlers.push(handler)}),
  LPRAnalytics:{event:(type,details)=>analytics.push({type,...details})},
  LPRLeaderboard:{refresh(){},startLap(){onlineStarts++;},cancelLap(){onlineCancels++;},get requiresName(){return requiresName},beginSession(){startedSessions++;element('#settings-dialog').showModal()},submit:(ms,sectors)=>submissions.push({ms,sectors})}},
  document:{hidden:false,querySelector:element,querySelectorAll:()=>['left','right','gas','brake'].map(name=>element(`[data-control="${name}"]`)),addEventListener(type,fn){if(!documentHandlers.has(type))documentHandlers.set(type,[]);documentHandlers.get(type).push(fn)}},performance:{now:()=>clock},navigator:{},
  localStorage:{getItem:()=>null,setItem(){}},setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id},clearTimeout(id){timers.delete(id)},requestAnimationFrame(){},ResizeObserver:class{observe(){}},
  LPRRenderer3D:class{constructor(){this.saunaStop={x:900,y:650}}resize(){}updatePeople(time){observedPeopleTime=time;}}};
let clock=1000;
vm.createContext(ctx);
for(const file of ['audio.js','sauna.js','vehicle.js','campus.js','sale.js','timing.js'])vm.runInContext(read(file),ctx);
for(const name of ['LPRGameAudio','LPRCampus','LPRSaunaLife','VehicleDynamics','LPRLapTiming'])ctx[name]=ctx.window[name];
const source=read('game.js').replace(/  reset\(\);\r?\n  openTestScene/,
 '  globalThis.test={get car(){return car},held,update,dynamics,reset,showSector,readInput,toggleSauna,toggleSale,togglePool};\n  reset();\n  openTestScene');
ctx.window.LPRLeaderboard.beginSession(); // leaderboard.js runs before game.js.
vm.runInContext(source,ctx);const game=ctx.test,dialog=element('#settings-dialog');
assert.equal(startedSessions,1);assert(dialog.open);
game.held.gas=true;game.update(0,1500);assert.equal(game.car.started,false,'Startup dialog prevents the first lap from starting');
element('#close-settings').click();assert(dialog.open,'Close button cannot bypass nickname selection');
for(const handler of mediaHandlers)handler({matches:true});assert(dialog.open,'Rotating the phone cannot bypass nickname selection');
requiresName=false;dialog.close();game.update(0,2000);
assert(game.car.started);assert.equal(game.car.lapStart,2000);assert(!game.car.onlineInvalid,'Initial naming does not invalidate the first lap');
// Move through the genuine gate/sector logic without replacing scoring or submission.
game.dynamics.step=()=>{};
const track=ctx.window.LPRCampus.track;
for(const [index,time] of [[65,12000],[125,22000],[185,27000],[0,42000]]){
  game.car.x=track[index].x;game.car.y=track[index].y;game.car.speed=10;
  game.update(0,time);
}
assert.equal(submissions.length,1,'The very first complete valid lap is submitted');
assert.equal(submissions[0].ms,40000);
assert.equal(onlineStarts,2,'The first start and the next flying lap each request their own server ticket');
assert(onlineCancels>=1,'Reset cancels any stale online lap');
assert.deepEqual(Array.from(submissions[0].sectors),[10000,10000,20000]);
assert.equal(game.car.lap,2);
assert.equal(analytics.filter(e=>e.type==='lap_start').length,2);
assert.equal(analytics.find(e=>e.type==='lap_complete').lapMs,40000,'Analytics uses genuine lap completion');
// A complete lap with sauna, pool and shop visits remains eligible.
game.reset();game.held.gas=true;game.update(0,50000);
for(const [toggle,position,time] of [
  ['toggleSauna',{x:900,y:650},55000],
  ['togglePool',{x:864,y:668},60000],
  ['toggleSale',ctx.window.LPRSale.entrance,65000]
]) {
  game.car.x=position.x;game.car.y=position.y;game.car.speed=0;
  game[toggle]();assert(!game.car.onlineInvalid,`${toggle} does not invalidate the lap`);
  game.update(.05,time);assert.equal(game.car.lapStart,50000,'Visit time is not subtracted');
  assert.equal(game.car.lapElapsedMs,time-50000);
  game[toggle]();
}
for(const [index,time] of [[65,75000],[125,85000],[185,90000],[0,105000]]) {
  game.car.x=track[index].x;game.car.y=track[index].y;game.car.speed=10;game.update(0,time);
}
assert.equal(submissions.length,2,'Visited lap submits normally');
assert.equal(submissions[1].ms,55000,'Full wall-clock time, including visits, is submitted');
console.log('PASS: mandatory startup pauses racing, orientation/close cannot skip naming, and the first lap submits through real scoring');

game.reset();game.showSector(1000);
assert.equal(element('#sector-time').hidden,false);
let timer=[...timers.values()].find(t=>t.ms===3000);assert(timer,'Sector expires after three wall-clock seconds');
game.showSector(2000);assert.equal([...timers.values()].filter(t=>t.ms===3000).length,1,'New split replaces the previous expiry');
timer=[...timers.values()].find(t=>t.ms===3000);timer.fn();assert.equal(element('#sector-time').hidden,true);
game.reset();assert(![...timers.values()].some(t=>t.ms===3000),'Restart clears pending sector expiry');

// Touch arrows and WASD use exactly the same digital input path.
game.reset();
const left=element('[data-control="left"]'),right=element('[data-control="right"]'),gas=element('[data-control="gas"]');
const pointer=id=>({pointerId:id,preventDefault(){}});
left.trigger('pointerdown',pointer(1));gas.trigger('pointerdown',pointer(2));
const touchInput=game.readInput();assert.equal(touchInput.steer,-1);assert.equal(touchInput.gas,1);assert.equal(touchInput.analog,false);
left.trigger('pointerup',pointer(1));assert.equal(game.readInput().steer,0);assert.equal(game.readInput().gas,1,'Releasing steering keeps the pedal held');
gas.trigger('pointerup',pointer(2));
const key=code=>({code,target:{tagName:'DIV'},preventDefault(){}});
emitWindow('keydown',key('KeyA'));emitWindow('keydown',key('KeyW'));
assert.deepEqual(game.readInput(),touchInput,'Touch left + gas is identical to A + W');
emitWindow('keyup',key('KeyA'));emitWindow('keyup',key('KeyW'));
left.trigger('pointerdown',pointer(3));right.trigger('pointerdown',pointer(4));assert.equal(game.readInput().steer,0,'Opposite arrows cancel each other');
left.trigger('pointercancel',pointer(3));assert.equal(game.readInput().steer,1);
right.trigger('lostpointercapture',pointer(4));assert.equal(game.readInput().steer,0,'Lost capture cannot leave steering stuck');
right.trigger('pointerdown',pointer(5));gas.trigger('pointerdown',pointer(6));emitWindow('blur');
assert.equal(game.readInput().steer,0);assert.equal(game.readInput().gas,0,'Losing focus releases every control');
right.trigger('pointerdown',pointer(7));emitWindow('resize');assert.equal(game.readInput().steer,0,'Rotation releases steering');
console.log('PASS: touch arrows match WASD, simultaneous throttle, release, opposite arrows, cancellation, focus and orientation');

// Menus and leaving the app keep the lap eligible, with all elapsed time counted.
game.reset();game.held.gas=true;game.update(0,200000);
element('#leaderboard-button').click();assert(dialog.open);
game.update(5,205000);assert.equal(game.car.lapStart,200000,'Menu time remains in the lap clock');
dialog.close();ctx.document.hidden=true;clock=206000;emitDocument('visibilitychange');
ctx.document.hidden=false;clock=260000;emitDocument('visibilitychange');
assert.equal(game.car.lapStart,200000,'Time in another app remains in the lap clock');
for(const [index,time] of [[65,270000],[125,280000],[185,290000],[0,300000]]) {
 game.car.x=track[index].x;game.car.y=track[index].y;game.car.speed=10;game.update(0,time);
}
assert.equal(submissions.length,3);assert.equal(submissions[2].ms,100000,'Interrupted lap submits normally including time away');
console.log('PASS: leaderboard menu and app switching preserve submission and full elapsed time');

// Fixed physics time and timed-v1 wall-clock scoring must remain independent.
game.reset();game.held.gas=true;game.update(0,1000,400000);
assert.equal(game.car.lapStart,400000,'Server-timed lap starts on the wall clock');
for(const [index,simTime,wallTime] of [[65,2000,410000],[125,3000,420000],[185,4000,430000],[0,5000,440000]]) {
 game.car.x=track[index].x;game.car.y=track[index].y;game.car.speed=10;game.update(0,simTime,wallTime);
}
assert.equal(submissions.at(-1).ms,40000,'Slow simulation cannot shorten the timed-v1 reported lap');
assert.equal(observedPeopleTime,5000,'Collision people follow simulation time');
console.log('PASS: fixed-step physics clock is independent of server-compatible wall-clock scoring');
