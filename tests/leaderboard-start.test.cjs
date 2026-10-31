const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const analytics=[];
const localValues=new Map();
let observedPeopleTime;
const nodes=new Map(),submissions=[],mediaHandlers=[];let requiresName=true,startedSessions=0;
let onlineStarts=0,onlineCancels=0;
const timers=new Map();let nextTimer=0;
const windowHandlers=new Map(),documentHandlers=new Map();
const emitDocument=(type,event={})=>{for(const fn of documentHandlers.get(type)||[])fn(event)};
const emitWindow=(type,event={})=>{for(const fn of windowHandlers.get(type)||[])fn(event)};
const element=id=>{
  if(!nodes.has(id)){const handlers={};nodes.set(id,{dataset:{control:id.match(/data-control="(\w+)"/)?.[1]},setPointerCapture(){},trigger(type,event){handlers[type]?.(event)},tagName:'DIV',open:false,value:'',classList:{add(){},remove(){},toggle(){},contains(){return false}},style:{setProperty(){}},setAttribute(){},querySelector:element,querySelectorAll:()=>[],
    addEventListener:(type,handler)=>{handlers[type]=handler},click(){handlers.click?.()},showModal(){this.open=true},close(){this.open=false;handlers.close?.()},clientWidth:800});}
  return nodes.get(id);
};
const ctx={URLSearchParams,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail}},window:{LPRVehicleSpec:require('../shared/vehicle-spec.js'),location:{search:'',hostname:'localhost'},LPRDrivingRevision:'test-revision',LPRVerificationConfig:{demo:true},LPRDemoSectorBaseline:{revision:'test-revision',series:'human',lapMs:84508,sectors:[28100,27982,28426]},screen:{},addEventListener(type,fn){if(!windowHandlers.has(type))windowHandlers.set(type,[]);windowHandlers.get(type).push(fn)},
  matchMedia:()=>({matches:false,addEventListener:(type,handler)=>mediaHandlers.push(handler)}),
  LPRAnalytics:{event:(type,details)=>analytics.push({type,...details})},
  LPRLeaderboard:{refresh(){},startLap(){onlineStarts++;},cancelLap(){onlineCancels++;},get requiresName(){return requiresName},beginSession(){startedSessions++;element('#settings-dialog').showModal()},submit:(ms,sectors)=>submissions.push({ms,sectors})}},
  document:{hidden:false,documentElement:{classList:{add(){},remove(){}}},querySelector:element,querySelectorAll:selector=>selector==='.drive-input-meter'?['brake','throttle'].map(name=>element(`#drive-input-meter-${name}`)) : selector==='[data-control]'?['left','right','gas','brake'].map(name=>element('[data-control="'+name+'"]')):[],addEventListener(type,fn){if(!documentHandlers.has(type))documentHandlers.set(type,[]);documentHandlers.get(type).push(fn)},dispatchEvent:event=>emitDocument(event.type,event)},performance:{now:()=>clock},navigator:{},
  localStorage:{getItem:key=>localValues.get(key)??null,setItem(key,value){localValues.set(key,String(value));},removeItem(key){localValues.delete(key);}},setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id},clearTimeout(id){timers.delete(id)},requestAnimationFrame(){},ResizeObserver:class{observe(){}},
  LPRRenderer3D:class{constructor(){this.saunaStop={x:900,y:650}}resize(){}updatePeople(time){observedPeopleTime=time;}}};
let clock=1000;
vm.createContext(ctx);
for(const file of ['audio.js','sauna.js','vehicle.js','campus.js','sale.js','timing.js'])vm.runInContext(read(file),ctx);
for(const name of ['LPRGameAudio','LPRCampus','LPRSaunaLife','VehicleDynamics','LPRLapTiming'])ctx[name]=ctx.window[name];
const source=read('game.js').replace(/  reset\(\);\r?\n  openTestScene/,
 '  globalThis.test={get car(){return car},get best(){return best},get drivingWorld(){return drivingWorld},set drivingWorld(value){drivingWorld=value},held,update,updateDriving,dynamics,reset,operateWheel,showSector,syncLiveDelta,readInput,toggleSauna,toggleSale,togglePool,timing};\n  reset();\n  openTestScene');
ctx.window.LPRLeaderboard.beginSession(); // leaderboard.js runs before game.js.
vm.runInContext(source,ctx);const game=ctx.test,dialog=element('#settings-dialog');
assert.equal(startedSessions,1);assert(dialog.open);
game.held.gas=true;game.update(0,1500);assert.equal(game.car.started,false,'Startup dialog prevents the first lap from starting');
element('#close-settings').click();assert(dialog.open,'Close button cannot bypass nickname selection');
for(const handler of mediaHandlers)handler({matches:true});assert(dialog.open,'Rotating the phone cannot bypass nickname selection');
requiresName=false;dialog.close();
ctx.window.LPRVerifiedDriving={waitingForStart:true};
const waitingCar=JSON.stringify(game.car);
game.update(.5,1900);
assert.equal(JSON.stringify(game.car),waitingCar,'Throttle cannot move the car or start timing before server readiness');
delete ctx.window.LPRVerifiedDriving;
game.update(0,2000);
assert(game.car.started);assert.equal(game.car.lapStart,2000);assert(!game.car.onlineInvalid,'Initial naming does not invalidate the first lap');
// Move through the genuine gate/sector logic without replacing scoring or submission.
game.dynamics.step=()=>{};
const track=ctx.window.LPRCampus.track;
const gate=ctx.window.LPRCampus.finishGate;
function crossFinish(simTime,wallTime=simTime) {
  game.car.x=gate.x-gate.tangentX*2;game.car.y=gate.y-gate.tangentY*2;game.car.speed=10;
  let steps=0;
  game.dynamics.step=()=>{steps++;game.car.x=gate.x+gate.tangentX*steps*2;game.car.y=gate.y+gate.tangentY*steps*2;};
  // Cross in the first of several substeps, not the final one.
  game.update(.04,simTime,wallTime);
  game.dynamics.step=()=>{};
}
// Local demo data includes official PB sectors but intentionally has no position trace.
// A slower first lap must become a labeled reference, and later slower laps must not
// replace that fastest captured reference. A faster real lap can promote to PB.
ctx.window.LPRVerifiedDriving={active:false,waitingForStart:false,step(){},cancel(){}};
ctx.window.LPRLeaderboard.identity=null;
let promotedCompletion=null;
ctx.document.addEventListener('lpr-lap-completed',event=>{if(event.detail.personalBest)promotedCompletion=event.detail;});
 game.reset();game.held.gas=true;game.update(0,1000000);crossFinish(1000000);
function driveReferenceLap(start,duration){
  for(let index=1;index<track.length;index++){
    game.car.x=track[index].x;game.car.y=track[index].y;game.car.speed=10;
    game.update(0,start+Math.round(duration*index/track.length));
  }
  crossFinish(start+duration);
}
driveReferenceLap(1000000,90000);
assert.equal(game.best,0,'a slower local preview lap does not replace the displayed 84.508 s PB');
assert.equal(game.timing.traceIsPersonalBest,false,'the first clean local lap is labeled as a reference lap');
const cleanLapRecord=JSON.parse(localValues.get('lpr-best-sectors-lut-20261011-v3'));
assert.equal(cleanLapRecord.lapTime,84508,'persisting a comparison trace does not overwrite the demo PB time');
assert.deepEqual(Array.from(cleanLapRecord.sectors),[28100,27982,28426],'persisting a comparison trace preserves the demo PB sectors');
assert.equal(cleanLapRecord.referenceLapTime,90000,'the recorded clean lap time is persisted separately');
assert.equal(cleanLapRecord.referenceRevision,ctx.window.LPRDrivingRevision,'the comparison trace is tied to its driving revision');
assert(cleanLapRecord.referenceTrace.length>=10,'the complete clean lap is saved as dense distance/time samples');
const reloadedTiming=new ctx.window.LPRLapTiming(cleanLapRecord.sectors,cleanLapRecord.checkpoints,
  cleanLapRecord.referenceTrace,cleanLapRecord.referenceRevision,cleanLapRecord.referenceLapTime,false);
assert.equal(reloadedTiming.traceIsPersonalBest,false,'reload keeps the trace distinct from the older numeric PB');
assert(reloadedTiming.bestTrace?.length>=10,'reload accepts the saved current-revision clean trace');
const referenceElapsedAt40=-reloadedTiming.deltaAt(0,.4);
assert.equal(reloadedTiming.liveDelta(referenceElapsedAt40+1000,.4),1000,'a reloaded trace yields the position-matched delta');
const fastestReference=JSON.stringify(game.timing.bestTrace);
let referenceLapDelta;
let referenceLapDeltaSource;
ctx.document.addEventListener('lpr-sector-live-delta',event=>{referenceLapDelta=event.detail.delta;referenceLapDeltaSource=event.detail.source;});
driveReferenceLap(1090000,91000);
assert(Number.isFinite(referenceLapDelta),'the actual game loop emits delta during the lap that follows the clean reference');
assert.equal(referenceLapDeltaSource,'mini-sector','dense-reference live updates identify their recorded position basis');
assert.equal(JSON.stringify(game.timing.bestTrace),fastestReference,'a slower lap does not replace the fastest reference trace');
assert.equal(game.best,0,'later slower laps still do not replace the displayed PB');
driveReferenceLap(1181000,85000);
assert.equal(game.timing.referenceLapTime,85000,'a faster reference replaces the slower reference lap');
assert.equal(game.best,0,'a reference still slower than the displayed PB is not promoted');
driveReferenceLap(1266000,80000);
assert.equal(game.best,80000,'a faster real trace can become the local personal best');
assert.equal(game.timing.traceIsPersonalBest,true,'the faster trace is labeled as a personal best');
assert.equal(promotedCompletion?.lapMs,80000,'A locally accepted PB emits the confirmed completion state');
assert.equal(promotedCompletion?.verifiedPending,false);
const lapsBeforeReset=game.car.lap;
game.reset();assert.equal(game.car.lap,lapsBeforeReset,'Restart preserves the completed lap count');game.held.gas=true;game.update(0,2000);
ctx.window.LPRVerifiedDriving=null;
analytics.length=0;submissions.length=0;onlineStarts=0;
assert(!game.car.lapTimingArmed,'The acceleration zone does not start timing');
assert.equal(onlineStarts,0,'The acceleration zone does not request a lap ticket');
crossFinish(2000);
assert(game.car.lapTimingArmed,'Forward crossing arms the first timed lap');
for(const [index,time] of [[65,12000],[125,22000],[185,27000],[0,42000]]){
  if(index===0){crossFinish(time);continue;}
  game.car.x=track[index].x;game.car.y=track[index].y;game.car.speed=10;
  game.update(0,time);
}
assert.equal(submissions.length,1,'The very first complete valid lap is submitted');
assert.equal(submissions[0].ms,40000);
assert.equal(onlineStarts,2,'The first start and the next flying lap each request their own server ticket');
assert(onlineCancels>=1,'Reset cancels any stale online lap');
assert.deepEqual(Array.from(submissions[0].sectors),[10000,10000,20000]);
assert.equal(game.car.lap,lapsBeforeReset+1,'Completing another lap advances the preserved count');
assert.equal(analytics.filter(e=>e.type==='lap_start').length,2);
assert.equal(analytics.find(e=>e.type==='lap_complete').lapMs,40000,'Analytics uses genuine lap completion');
// A complete lap with sauna, pool and shop visits remains eligible.
game.reset();game.held.gas=true;game.update(0,50000);crossFinish(50000);
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
  if(index===0){crossFinish(time);continue;}
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
game.timing.setReferenceTrace(null,null,null);game.timing.setBest([10000,12000,18000],null,null,null,null,[0,.3,.6,1]);game.timing.reset();
const boundaryDeltas=[];ctx.document.addEventListener('lpr-sector-split',event=>boundaryDeltas.push(event.detail));
let liveDeltaEvents=0;ctx.document.addEventListener('lpr-sector-live-delta',()=>liveDeltaEvents++);
game.syncLiveDelta(500,.05,500);assert.equal(liveDeltaEvents,0,'sector-only baseline does not emit a fabricated continuous delta');
game.showSector(11000,.3,600);
assert.equal(boundaryDeltas.at(-1).delta,1000,'sector-only baseline reports exact cumulative delta at its completed gate');
assert.equal(boundaryDeltas.at(-1).deltaSource,'sector-boundary');
game.syncLiveDelta(11500,.35,700);
assert.equal(liveDeltaEvents,0,'periodic null updates do not erase the exact sector-boundary fallback');
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
game.reset();game.held.gas=true;game.update(0,200000);crossFinish(200000);
element('#leaderboard-button').click();assert(dialog.open);
game.update(5,205000);assert.equal(game.car.lapStart,200000,'Menu time remains in the lap clock');
dialog.close();ctx.document.hidden=true;clock=206000;emitDocument('visibilitychange');
ctx.document.hidden=false;clock=260000;emitDocument('visibilitychange');
assert.equal(game.car.lapStart,200000,'Time in another app remains in the lap clock');
for(const [index,time] of [[65,270000],[125,280000],[185,290000],[0,300000]]) {
 if(index===0){crossFinish(time);continue;}
  game.car.x=track[index].x;game.car.y=track[index].y;game.car.speed=10;game.update(0,time);
}
assert.equal(submissions.length,3);assert.equal(submissions[2].ms,100000,'Interrupted lap submits normally including time away');
console.log('PASS: leaderboard menu and app switching preserve submission and full elapsed time');

// Fixed physics time and timed-v1 wall-clock scoring must remain independent.
game.reset();game.held.gas=true;game.update(0,1000,400000);crossFinish(1000,400000);
assert.equal(game.car.lapStart,400000,'Server-timed lap starts on the wall clock');
for(const [index,simTime,wallTime] of [[65,2000,410000],[125,3000,420000],[185,4000,430000],[0,5000,440000]]) {
 if(index===0){crossFinish(simTime,wallTime);continue;}
  game.car.x=track[index].x;game.car.y=track[index].y;game.car.speed=10;game.update(0,simTime,wallTime);
}
assert.equal(submissions.at(-1).ms,40000,'Slow simulation cannot shorten the timed-v1 reported lap');
assert.equal(observedPeopleTime,5000,'Collision people follow simulation time');
console.log('PASS: fixed-step physics clock is independent of server-compatible wall-clock scoring');

// Losing verification must leave the active flying lap intact. A fresh start
// would synchronously call reset during its preparation hook, even if it fails.
const verifiedStarts=[];
ctx.window.LPRLeaderboard.identity={nickname:'Preview Driver',token:'preview'};
ctx.window.LPRVerifiedDriving={active:false,waitingForStart:false,step(){},cancel(){},start(options){
  verifiedStarts.push(options);
  game.reset({verified:true}); // Match the production prepare hook's reset.
  return Promise.resolve();
}};
const lapsBeforeFlyingLap=game.car.lap;
for(const [index,time] of [[65,450000],[125,460000],[185,470000],[0,480000]]){
  if(index===0){crossFinish(time);continue;}
  game.car.x=track[index].x;game.car.y=track[index].y;game.car.speed=10;game.update(0,time);
}
assert.equal(verifiedStarts.length,0,'Crossing the finish while verification is inactive does not launch a resetting session');
assert.equal(game.car.lap,lapsBeforeFlyingLap+1,'Flying lap counter advances normally');
assert.equal(game.car.lapStart,480000,'Lap clock rolls over at the finish line');
assert(game.car.lapTimingArmed,'The next flying lap stays armed');
assert.notEqual(game.car.x,ctx.window.LPRCampus.launchPosition.x,'The car stays at the finish instead of teleporting to the start');
element('#restart-button').click();
assert.equal(verifiedStarts.length,0,'Demo practice restart must not request verified start');
ctx.window.LPRVerificationConfig.demo=false;
element('#restart-button').click();
assert.equal(verifiedStarts.length,1,'An explicit non-demo restart still requests a fresh verified session');
assert.equal(verifiedStarts[0].replace,true);
assert.equal(game.car.lap,lapsBeforeFlyingLap+1,'Explicit restart preserves the lap count');
const shortcutEvent=(options={})=>({code:'KeyR',target:{tagName:'DIV'},preventDefault(){this.prevented=true;},...options});
const startCount=verifiedStarts.length;
for(const options of [
  {target:{tagName:'INPUT'}},{target:{tagName:'TEXTAREA'}},{target:{tagName:'SELECT'}},
  {target:{tagName:'DIV',isContentEditable:true}},
  {isComposing:true},{keyCode:229},{repeat:true},{ctrlKey:true},{metaKey:true},{altKey:true}
]){
  const event=shortcutEvent(options);emitWindow('keydown',event);assert.equal(event.prevented,undefined,'Shortcut ignores text entry, composition, repeats, and modifiers');
}
dialog.showModal();const modalKey=shortcutEvent();emitWindow('keydown',modalKey);assert.equal(modalKey.prevented,undefined,'Shortcut is inactive while a modal is open');dialog.close();
const restartKey=shortcutEvent();emitWindow('keydown',restartKey);
assert.equal(restartKey.prevented,true,'Gameplay restart shortcut consumes the key');
assert.equal(verifiedStarts.length,startCount+1,'One R press triggers one explicit restart');
assert.equal(verifiedStarts.at(-1).replace,true,'R uses the same verified restart path as the button');
assert.equal(game.car.lap,lapsBeforeFlyingLap+1,'R preserves the lap count through the explicit restart action');
const focusedRestart=shortcutEvent({target:{tagName:'BUTTON'}});emitWindow('keydown',focusedRestart);
assert.equal(verifiedStarts.length,startCount+2,'R still works after clicking a gameplay button');
console.log('PASS: inactive verification preserves flying laps; explicit and R restarts work with safe key guards');
ctx.window.LPRVerificationConfig.demo=true;

// Record and compare a dense reference through the real game update, sector gates,
// finish rollover, and next flying lap. This catches integration failures that
// unit tests of LPRLapTiming alone cannot detect.
let observedLiveDelta;
let lastCompletedLap=null,lastSectorCompletedLap=null;
ctx.document.addEventListener('lpr-sector-live-delta',event=>{observedLiveDelta=event.detail.delta;});
ctx.document.addEventListener('lpr-lap-completed',event=>{lastCompletedLap=event.detail;});
ctx.document.addEventListener('lpr-sector-lap-completed',event=>{lastSectorCompletedLap=event.detail;});
ctx.window.LPRVerifiedDriving={active:false,waitingForStart:false,step(){},cancel(){}};
ctx.window.LPRLeaderboard.identity=null;
game.reset();game.held.gas=true;game.update(0,1000000);crossFinish(1000000);
const lapsBeforeReferenceLap=game.car.lap;
function driveLap(start,duration){
  for(let index=1;index<track.length;index++){
    game.car.x=track[index].x;game.car.y=track[index].y;game.car.speed=10;
    game.update(0,start+Math.round(duration*index/track.length));
  }
  crossFinish(start+duration);
}
driveLap(1000000,40000);
assert.equal(lastCompletedLap.lapMs,40000);
assert.equal(lastCompletedLap.personalBest,false,'A reference lap is not mislabeled as a personal best');
assert.equal(lastCompletedLap.verifiedPending,false);
assert.equal(lastSectorCompletedLap.lapTime,40000,'The Last Lap alias carries the completed time');
assert(game.timing.bestTrace?.length>=10,'a complete driven lap stores a dense current-revision reference');
assert.equal(game.car.lap,lapsBeforeReferenceLap+1,'finishing the reference lap rolls over into the next flying lap');
for(let index=1;index<=12;index++){
  game.car.x=track[index].x;game.car.y=track[index].y;game.car.speed=10;
  game.update(0,1040000+index*200);
}
assert(Number.isFinite(observedLiveDelta),'the next lap emits a real, position-matched delta from the game loop');
console.log('PASS: completed game-loop lap captures a dense trace and emits live delta on the next flying lap');

// Driver preferences survive both local and verified reset paths.
dialog.close(); game.reset({verified:true});
game.operateWheel('tc');
assert.equal(game.car.tcEnabled,false);
assert.equal(localValues.get('lpr-traction-control'),'false');
game.reset({verified:true});
assert.equal(game.car.tcEnabled,false);
assert.equal(game.dynamics.parameters.tractionControlEnabled,false);
game.operateWheel('tc');
game.reset({verified:true});
assert.equal(game.car.tcEnabled,true);

// Verified driving advances at 120 Hz. Exercise updateDriving itself for an
// 84.5 s lap so clean traces above the old 10,000-sample cap are persisted.
game.timing.setReferenceTrace(null,null,null);
game.timing.setBest(null,null,null,null,null);
game.reset({verified:true});
let verifiedTick=0,lapStep=0;
const verifiedDistances=[0];
for(let index=0;index<track.length;index++)verifiedDistances.push(verifiedDistances[index]+Math.hypot(
  track[(index+1)%track.length].x-track[index].x,track[(index+1)%track.length].y-track[index].y));
const placeAtProgress=progress=>{
  const distance=progress*verifiedDistances.at(-1);
  let segment=0;while(segment<track.length-1&&verifiedDistances[segment+1]<distance)segment++;
  const a=track[segment],b=track[(segment+1)%track.length];
  const ratio=(distance-verifiedDistances[segment])/(verifiedDistances[segment+1]-verifiedDistances[segment]);
  game.car.x=a.x+(b.x-a.x)*ratio;game.car.y=a.y+(b.y-a.y)*ratio;game.car.speed=10;
};
game.drivingWorld={
  step(){
    verifiedTick++;
    if(verifiedTick===1){lapStep=0;placeAtProgress(0);return {started:true,split:null,completed:null};}
    lapStep++;
    const progress=lapStep/10140;placeAtProgress(progress);
    const split=lapStep===3042?3042:lapStep===6084?6084:lapStep===10140?10140:null;
    const completed=lapStep===10140?{lap:1,startTick:1,endTick:10141,lapTicks:10140,sectorTicks:[3042,3042,4056]}:null;
    return {started:false,split,completed};
  },
  result(){return {ticks:verifiedTick,lapStartTick:1,started:true,lap:lapStep>=10140?2:1,
    stage:lapStep>=6084?3:lapStep>=3042?2:lapStep?1:0,state:{}};}
};
ctx.window.LPRVerifiedDriving={active:true,waitingForStart:false,lapEligible:true,step(){},cancel(){}};
for(let index=0;index<=10140;index++)game.updateDriving(verifiedTick*1000/120);
assert.equal(lastCompletedLap.lapMs,84500);
assert.equal(lastCompletedLap.personalBest,false,'A verified result is not called a PB before the server accepts it');
assert.equal(lastCompletedLap.verifiedPending,false,'A slower verified lap is not queued as a PB candidate');
const verifiedRecord=JSON.parse(localValues.get('lpr-best-sectors-lut-20261011-v3'));
assert(verifiedRecord.referenceTrace.length>10000,'The verified-mode game loop persists a full 120 Hz reference trace');
assert.equal(verifiedRecord.referenceLapTime,84500,'The verified trace remains tied to the authoritative lap time');
let verifiedDelta,verifiedDeltaSource;
ctx.document.addEventListener('lpr-sector-live-delta',event=>{verifiedDelta=event.detail.delta;verifiedDeltaSource=event.detail.source;});
for(let index=1;index<=12;index++){
  lapStep=10140+index;placeAtProgress(index/10140);verifiedTick++;
  game.drivingWorld.result=()=>({ticks:verifiedTick,lapStartTick:10141,started:true,lap:2,stage:0,state:{}});
  game.drivingWorld.step=()=>({started:false,split:null,completed:null});
  game.updateDriving(verifiedTick*1000/120);
}
assert(Number.isFinite(verifiedDelta),'The verified update path emits a delta on the flying lap after a clean recorded lap');
assert.equal(verifiedDeltaSource,'mini-sector','verified 120 Hz telemetry drives continuous live delta');
console.log('PASS: verified game-update path persists >10,000 trace samples and compares the next flying lap');

// Existing official laps may have sector times and no usable position samples.
ctx.window.LPRLeaderboard.identity={nickname:'Owner',token:'owner-token',series:'human'};
const denseReference=game.timing.bestTrace;
ctx.window.LPRAcceptVerifiedReference({identityToken:'owner-token',series:'human',lapMs:60000,sectors:[20000,20000,20000],recording:{format:'legacy'}});
assert.equal(game.timing.bestTrace,denseReference,'sector-only official data does not replace a recorded trace');
game.timing.setReferenceTrace(null,null,null);
game.timing.setBest([20000,20000,20000],null,null,null,60000,[0,.3,.6,1]);
ctx.window.LPRAcceptVerifiedReference({identityToken:'owner-token',series:'human',lapMs:84000,sectors:[28000,28000,28000]});
assert.equal(game.timing.best.reduce((sum,value)=>sum+value,0),60000,'a faster local sector PB stays ahead of a slower lap without samples');
game.timing.setBest(null,null,null,null,null);
ctx.window.LPRAcceptVerifiedReference({identityToken:'someone-else',series:'human',lapMs:84000,sectors:[28000,28000,28000]});
assert.equal(game.timing.best,null,'another account cannot install its sector baseline');
ctx.window.LPRAcceptVerifiedReference({identityToken:'owner-token',series:'human',lapMs:84000,sectors:[28000,28000,28000],recording:{format:'legacy'}});
assert.equal(game.timing.bestTrace,null,'a lap without samples does not invent a continuous trace');
assert.deepEqual(Array.from(game.timing.best),[28000,28000,28000]);
game.drivingWorld={step(){},result(){return {started:false};}};
game.timing.reset();
const legacySplits=[];
ctx.document.addEventListener('lpr-sector-split',event=>legacySplits.push(event.detail));
game.showSector(30000,.3,1000);
assert.equal(legacySplits.at(-1).deltaSource,'sector-boundary');
assert.equal(legacySplits.at(-1).delta,2000,'existing sector times compare at the gate until a reference lap is recorded');
ctx.window.LPRAcceptVerifiedReference({identityToken:'owner-token',series:'human',lapMs:84000,sectors:[28000,28000,28000]});
assert.equal(game.timing.best.reduce((sum,value)=>sum+value,0),84000,'repeating the same sector baseline does not disturb it');
console.log('PASS: official laps without samples keep exact sector fallback');
