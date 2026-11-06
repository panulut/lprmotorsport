const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

const labels=[];
const handDraws=[];
const context={window: { LPRVehicleSpec: require('../shared/vehicle-spec.js'), }};
vm.createContext(context);
vm.runInContext(source('renderer3d.js'),context);
const Renderer=context.window.LPRRenderer3D;
const renderer=Object.create(Renderer.prototype);
renderer.cockpit=new Proxy({}, {get:(_,key)=>key==='fillText' ? (text)=>labels.push(text)
  : key==='createLinearGradient' ? ()=>({addColorStop(){}})
  : key==='drawImage' ? (...args)=>handDraws.push(args) : ()=>{}});
renderer.driverArm={complete:true,naturalWidth:1024,naturalHeight:1536};
for(const [width,height] of [[360,450],[800,380],[1280,720]]) {
  renderer.width=width;renderer.height=height;
  renderer.canvas={getBoundingClientRect:()=>({left:25,top:40,width:width/2,height:height/2})};
  for(const steer of [-1,-.75,-.5,-.25,0,.25,.5,.75,1]) {
    const car={steer,steerAngle:steer*context.window.LPRVehicleSpec.maxRoadWheelAngle,speed:10,lap:2,lapElapsedMs:65400,lateralG:-1.2,tireUse:.86,tcEnabled:true};
    const layout=renderer.steeringWheelLayout(car);
    const verticalExtent=layout.radius*(Math.hypot(.94*Math.sin(layout.angle),.64*Math.cos(layout.angle))+.08);
    assert(layout.y-verticalExtent>=0 && layout.y+verticalExtent<=height,'Wheel remains inside viewport at full lock');
    for(const control of renderer.steeringWheelControls()) {
      const x=layout.x+layout.radius*(control.x*Math.cos(layout.angle)-control.y*Math.sin(layout.angle));
      const y=layout.y+layout.radius*(control.x*Math.sin(layout.angle)+control.y*Math.cos(layout.angle));
      assert.equal(renderer.steeringWheelActionAt(car,25+x/2,40+y/2),control.action);
      assert.equal(renderer.steeringWheelActionAt({...car,sauna:true},25+x/2,40+y/2),null);
    }
    labels.length=0;
    handDraws.length=0;
    renderer.drawSteeringWheel(car);
    assert(handDraws.length>=2,'Both articulated arms render at every steering angle');
    assert(handDraws.every(([image])=>image===renderer.driverArm));
    for(const side of [-1,1]) {
      const pose=renderer.driverArmPose(layout,side);
      const contact=renderer.driverArmWheelPoint(pose,pose.grip);
      assert(Math.abs(contact.x-side*.94)<1e-12 && Math.abs(contact.y)<1e-12,
        'Hands grip opposite horizontal sides of the wheel at 9 and 3');
      assert(pose.wristWorld.y>layout.y+layout.radius*contact.x*Math.sin(layout.angle),
        'Wrist descends from the side grip');
      assert(pose.elbow.y>height,'Elbow remains below the view');
      assert(Math.abs(pose.bend)<=.28,'Wrist bend stays anatomically modest');
      const hand=renderer.driverArmPoint(pose,.4,.20);
      assert(Math.abs(hand.x-pose.width*(.4-.45))<1e-12 && Math.abs(hand.y-(-.50+pose.height*.20))<1e-12,
        'Glove remains locked to the wheel as the wrist flexes');
      const a=renderer.driverArmPoint(pose,.45,.5),b=renderer.driverArmPoint(pose,.7,.9);
      assert(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-Math.hypot(pose.width*.25,pose.height*.4))<1e-12,
        'Visible forearm rotates rigidly without bending or stretching');
      const bottom=renderer.driverArmPoint(pose,.78,1);
      const wheelBottom=renderer.driverArmWheelPoint(pose,bottom);
      assert(layout.y+layout.radius*(wheelBottom.x*Math.sin(layout.angle)+wheelBottom.y*Math.cos(layout.angle))>=height,
        'Animated forearm continues beyond the viewport');
    }
    assert(labels.includes('36') && labels.includes('L2  1:05.4'));
    labels.length=0;
    renderer.drawSteeringWheel({...car,wheelPage:1,tcEnabled:false});
    assert(labels.includes('1.20 G') && labels.includes('PITO 86%') && labels.includes('TC OFF'));
  }
}

for(const side of [-1,1]) {
  const bends=[];
  for(let step=-10;step<=10;step++) {
    const pose=renderer.driverArmPose(renderer.steeringWheelLayout({steerAngle:step/10*context.window.LPRVehicleSpec.maxRoadWheelAngle}),side);
    const joint=renderer.driverArmPoint(pose,.52,.36);
    assert(Math.hypot(joint.x-pose.wrist.x,joint.y-pose.wrist.y)<1e-12,'Wrist pivot stays connected');
    const before=renderer.driverArmPoint(pose,.52,.43-1e-7),after=renderer.driverArmPoint(pose,.52,.43+1e-7);
    assert(Math.hypot(before.x-after.x,before.y-after.y)<1e-5,'Cuff blends continuously into the forearm');
    if(bends.length) assert(Math.abs(pose.bend-bends.at(-1))<.12,'Pose changes continuously through a steering sweep');
    bends.push(pose.bend);
  }
  const left=renderer.driverArmPose(renderer.steeringWheelLayout({steerAngle:-context.window.LPRVehicleSpec.maxRoadWheelAngle}),side);
  const right=renderer.driverArmPose(renderer.steeringWheelLayout({steerAngle:context.window.LPRVehicleSpec.maxRoadWheelAngle}),side);
  assert(Math.abs(left.baseAngle-right.baseAngle)>3,'Grip rotates to keep crossed forearms below the wheel');
}

const spec=context.window.LPRVehicleSpec;
assert.equal(renderer.steeringWheelLayout({steer:1,steerAngle:0}).angle,0,'Wheel follows actual rack rather than requested input');
assert.equal(renderer.steeringWheelLayout({steer:0,steerAngle:spec.maxRoadWheelAngle}).angle,spec.maxSteeringWheelAngle);
for(let step=-100;step<=100;step++) {
  const angle=step/100*spec.maxRoadWheelAngle;
  const left=spec.roadWheelAngle(angle,-1),right=spec.roadWheelAngle(angle,1);
  assert.equal(left,-spec.roadWheelAngle(-angle,1),'Ackermann geometry mirrors between turns');
  if(step===0) {assert.equal(left,0);assert.equal(right,0);continue;}
  assert(angle>0 ? right>left : left<right,'Inside wheel has greater lock');
  assert(Math.abs(spec.wheelbase/Math.tan(left)-spec.wheelbase/Math.tan(right)-spec.trackWidth)<1e-10,
    'Both wheel axes meet at the same turn centre');
}

const nodes=new Map(), events=new Map();
const element=id=>{
  if(!nodes.has(id)) nodes.set(id,{tagName:'DIV',dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    style:{setProperty(){}},attributes:{},setAttribute(k,v){this.attributes[k]=v;},querySelector:element,
    addEventListener(type,handler){this[type==='close'?'onclose':type]=handler;},showModal(){this.open=true;},close(){this.open=false;this.onclose?.();},clientWidth:800});
  return nodes.get(id);
};
const gameContext={
  URLSearchParams, CustomEvent,
  window: { location:{search:''}, LPRVehicleSpec: require('../shared/vehicle-spec.js'), matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(type,handler){if(!events.has(type)) events.set(type,[]);events.get(type).push(handler);},screen:{}},
  performance:{now:()=>1000},document:{documentElement:{classList:{add(){},remove(){}}},querySelector:element,querySelectorAll:()=>[],addEventListener(){},dispatchEvent(){return true;}},
  navigator:{},localStorage:{getItem:()=>null},setTimeout(){},clearTimeout(){},requestAnimationFrame(){},
  ResizeObserver:class{observe(){}},
  LPRRenderer3D:class{constructor(){this.saunaStop={x:900,y:650};}resize(){}updatePeople(){}},
  LPRTiltSteering:class{read(){return 0;}}
};
vm.createContext(gameContext);
for(const file of ['audio.js','sauna.js','vehicle.js','campus.js','sale.js','timing.js']) vm.runInContext(source(file),gameContext);
for(const name of ['LPRGameAudio','LPRCampus','LPRSaunaLife','VehicleDynamics','LPRLapTiming']) gameContext[name]=gameContext.window[name];
vm.runInContext(source('game.js').replace('  openTestScene(window.location.search);',
  '  globalThis.test={get car(){return car},operateWheel,dynamics,update,reset,held};'),gameContext);
const game=gameContext.test;
element('#wheel-page').click();assert.equal(game.car.wheelPage,1);
element('#wheel-dim').click();assert.equal(game.car.wheelDim,true);
element('#wheel-tc').click();assert.equal(game.car.tcEnabled,false);
assert.equal(game.dynamics.parameters.tractionControlEnabled,false);
assert.equal(element('#wheel-tc').attributes['aria-pressed'],'false');
for(const handler of events.get('keydown')) handler({code:'KeyT',target:{tagName:'DIV'},preventDefault(){}});
assert.equal(game.car.tcEnabled,true,'Keyboard activates the same control');
game.car.sauna=true;game.operateWheel('tc');assert.equal(game.car.tcEnabled,true);
game.car.sauna=false;game.car.crashed=true;game.operateWheel('page');assert.equal(game.car.wheelPage,1);
game.reset();assert.equal(game.car.tcEnabled,true);assert.equal(game.car.wheelPage,0);
game.held.gas=true;game.update(.05,1050);assert.equal(game.car.throttleInput,1);
assert.equal(game.car.lapElapsedMs,0,'Timing waits for the flying-lap start line');
// Timing arms when the car crosses the start line; simulate that crossing here.
game.car.lapTimingArmed=true;game.car.lapStart=1050;
game.update(.05,1100);assert.equal(game.car.lapElapsedMs,50);
game.car.crashed=true;game.update(.05,1150);assert.equal(game.car.throttleInput,0);
assert.equal(game.car.lapElapsedMs,50,'Crash freezes lap display');
game.reset();
element('#leaderboard-button').click();
assert.equal(element('#settings-dialog').open,true,'Trophy opens leaderboard dialog');
assert.equal(element('#settings-dialog').scrollTop,0,'Leaderboard opens at the top');
element('#close-settings').click();
assert.equal(element('#settings-dialog').open,false);
console.log('PASS: wheel telemetry, responsive full-lock bounds, rotated hit targets, controls, TC, keyboard, reset and crash');
