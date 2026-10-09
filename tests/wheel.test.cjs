const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

const labels=[];
const context={window:{}};
vm.createContext(context);
vm.runInContext(source('renderer3d.js'),context);
const Renderer=context.window.LPRRenderer3D;
const renderer=Object.create(Renderer.prototype);
renderer.cockpit=new Proxy({}, {get:(_,key)=>key==='fillText' ? (text)=>labels.push(text) : ()=>{}});
for(const [width,height] of [[360,450],[800,380],[1280,720]]) {
  renderer.width=width;renderer.height=height;
  renderer.canvas={getBoundingClientRect:()=>({left:25,top:40,width:width/2,height:height/2})};
  for(const steer of [-1,0,1]) {
    const car={steer,speed:10,lap:2,lapElapsedMs:65400,lateralG:-1.2,tireUse:.86,tcEnabled:true};
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
    renderer.drawSteeringWheel(car);
    assert(labels.includes('36') && labels.includes('L2  1:05.4'));
    labels.length=0;
    renderer.drawSteeringWheel({...car,wheelPage:1,tcEnabled:false});
    assert(labels.includes('1.20 G') && labels.includes('PITO 86%') && labels.includes('TC OFF'));
  }
}

const nodes=new Map(), events=new Map();
const element=id=>{
  if(!nodes.has(id)) nodes.set(id,{tagName:'DIV',classList:{add(){},remove(){},toggle(){}},
    style:{setProperty(){}},attributes:{},setAttribute(k,v){this.attributes[k]=v;},
    addEventListener(type,handler){this[type]=handler;},clientWidth:800});
  return nodes.get(id);
};
const gameContext={
  window:{matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(type,handler){if(!events.has(type)) events.set(type,[]);events.get(type).push(handler);},screen:{}},
  performance:{now:()=>1000},document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},
  navigator:{},localStorage:{getItem:()=>null},setTimeout(){},clearTimeout(){},requestAnimationFrame(){},
  ResizeObserver:class{observe(){}},
  LPRRenderer3D:class{constructor(){this.saunaStop={x:900,y:650};}resize(){}},
  LPRTiltSteering:class{read(){return 0;}}
};
vm.createContext(gameContext);
for(const file of ['sauna.js','vehicle.js','campus.js','sale.js','timing.js']) vm.runInContext(source(file),gameContext);
for(const name of ['LPRCampus','LPRSaunaLife','VehicleDynamics','LPRLapTiming']) gameContext[name]=gameContext.window[name];
vm.runInContext(source('game.js').replace(/  reset\(\);\s+resize\(\);/,
  'reset(); globalThis.test={get car(){return car},operateWheel,dynamics,update,reset,held}; resize();'),gameContext);
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
assert.equal(game.car.lapElapsedMs,0);
game.update(.05,1100);assert.equal(game.car.lapElapsedMs,50);
game.car.crashed=true;game.update(.05,1150);assert.equal(game.car.throttleInput,0);
assert.equal(game.car.lapElapsedMs,50,'Crash freezes lap display');
console.log('PASS: wheel telemetry, responsive full-lock bounds, rotated hit targets, controls, TC, keyboard, reset and crash');
