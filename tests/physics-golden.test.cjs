// Guards performance work on the shared simulation: state must stay bit-identical,
// and it is the evidence behind every entry in verification/equivalent-revisions.json.
// Record on UNCHANGED physics, before a refactor:  node tests/physics-golden.test.cjs --write
// Verify after:                                    node tests/physics-golden.test.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {createWorldFactory,revision,sourceRevision}=require('../verification/world.cjs');
const {driver}=require('./helpers-driving.cjs');
const fixture=path.join(__dirname,'physics-golden.json');
const factory=createWorldFactory();
const KEYS=['x','y','angle','vx','vy','spin','damage','bend','bendVelocity'];
const num=v=>Object.is(v,-0)?'-0':String(v);
const carState=(world)=>{const c=world.car;return JSON.stringify([world.result(),c.x,c.y,c.angle,c.vx,c.vy,c.yawRate,c.damage]);};
// Every obstacle body, so tree bending and movable bodies are covered too.
const bodyState=bodies=>bodies.map(b=>KEYS.map(k=>num(b[k])).join()+JSON.stringify(b.direction||0)+b.dents.length).join(';');
const input=(api,v)=>api.decode(api.encode(v));
function drive(kind){
 let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
 const {world,api,campus}=factory.create(),hash=createHash('sha256'),checkpoints=[];
 for(let i=1;i<=120*90;i++){
  let v=driver(world);
  // 'wild' hits kerbs, walls and barriers to cover the car collision paths.
  if(kind==='wild')v={...v,gas:rnd()<.7?1:0,brake:rnd()<.1?1:0,steer:Math.max(-1,Math.min(1,v.steer+(rnd()-.5)*1.6))};
  world.step(input(api,v));hash.update(carState(world));
  if(i%600===0){hash.update(bodyState(campus.bodies));checkpoints.push(hash.copy().digest('hex').slice(0,16));}
 }
 return {checkpoints};
}
// Launch the car at every movable body and a sample of trees: impulses, spin,
// body-body contacts, tree bending and obstacles striking the car.
function obstacles(){
 const {world,api,campus}=factory.create(),bodies=campus.bodies,hash=createHash('sha256'),checkpoints=[];
 const targets=bodies.map((b,i)=>i).filter(i=>Number.isFinite(bodies[i].mass)||(bodies[i].kind==='tree'&&i%20===0));
 let trees=0,movers=0;
 for(let i=0;i<5;i++)world.step(input(api,{gas:0,brake:0,steer:0}));
 targets.forEach((index,n)=>{
  const target=bodies[index],a=(n%8)*Math.PI/4,car=world.car;
  Object.assign(car,{x:target.x-Math.cos(a)*60,y:target.y-Math.sin(a)*60,angle:a,vx:12,vy:0,yawRate:0,damage:0,crashed:false});
  for(let i=0;i<120&&!car.crashed;i++){world.step(input(api,{gas:1,brake:0,steer:0}));hash.update(carState(world));}
  if(target.kind==='tree'?target.bendVelocity!==0||target.bend!==0:target.vx!==0||target.vy!==0)target.kind==='tree'?trees++:movers++;
  hash.update(bodyState(bodies));checkpoints.push(hash.copy().digest('hex').slice(0,16));
 });
 return {checkpoints,coverage:{targets:targets.length,trees,movers}};
}
const timed=(name,f)=>{const t=performance.now(),r=f();if(process.env.GOLDEN_TIMING)console.log(name,Math.round(performance.now()-t),"ms");return r;};
const actual={gentle:timed("gentle",()=>drive("gentle")),wild:timed("wild",()=>drive("wild")),obstacles:timed("obstacles",obstacles)};
const {coverage}=actual.obstacles;
assert(coverage.trees>=10&&coverage.movers>=20,`Obstacle scenario no longer reaches trees/movable bodies: ${JSON.stringify(coverage)}`);
if(process.argv.includes('--write')){
 assert.equal(revision,sourceRevision,'Record the golden on unaliased physics: remove the equivalence entry first');
 fs.writeFileSync(fixture,JSON.stringify({revision,scenarios:actual},null,1)+'\n');console.log('Wrote',fixture,'for revision',revision);
}else{
 const expected=JSON.parse(fs.readFileSync(fixture,'utf8'));
 assert.equal(revision,expected.revision,`Golden belongs to revision ${expected.revision}, physics is ${revision}. `+
  'If physics changed on purpose, re-record with --write; if it is a bit-identical refactor, add an equivalence entry.');
 for(const [kind,{checkpoints}] of Object.entries(expected.scenarios)){
  assert.equal(actual[kind].checkpoints.length,checkpoints.length,`${kind}: checkpoint count changed`);
  checkpoints.forEach((h,i)=>assert.equal(actual[kind].checkpoints[i],h,`${kind}: simulation diverged at checkpoint ${i+1}`));
 }
 assert.deepEqual(coverage,expected.scenarios.obstacles.coverage);
 console.log(`Physics golden: bit-identical for revision ${revision.slice(0,12)}`+(revision===sourceRevision?'':` (source ${sourceRevision.slice(0,12)} proven equivalent)`)+
  `; ${Object.keys(expected.scenarios).length} scenarios, ${coverage.trees} trees and ${coverage.movers} movable bodies struck`);
}
