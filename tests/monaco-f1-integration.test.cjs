const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {create,sampleRoad,binary}=require('./helpers-monaco-f1.cjs');
const {monacoPage}=require('../scripts/monaco-page.cjs');
const html=fs.readFileSync('index.html','utf8'),monaco=monacoPage(html);
for(const file of ['shared/vehicle-spec-f1.js','shared/vehicle-f1.js','tracks/monaco-f1-aids.js','tracks/monaco-f1-collision.js','tracks/monaco-f1-renderer.js','tracks/monaco-f1-audio.js']){
 assert(monaco.includes(`src="${file}`));assert(!html.includes(`src="${file}`),'Skinnarila must not load '+file);
 assert(fs.existsSync('dist/'+file),'Build ships '+file);
 assert.equal(fs.readFileSync('dist/'+file,'utf8'),fs.readFileSync(file,'utf8'),'Build ships current '+file);
}
assert(!monaco.includes('src="shared/vehicle-spec.js'));
const scripts=[...monaco.matchAll(/<script[^>]+src="([^"?]+)/g)].map(m=>m[1]);
for(const [a,b] of [['shared/dmath.js','shared/vehicle-spec-f1.js'],['vehicle.js','shared/vehicle-f1.js'],['shared/vehicle-f1.js','game.js'],['renderer3d.js','tracks/monaco-f1-renderer.js'],['tracks/monaco-f1-aids.js','game.js']])assert(scripts.indexOf(a)<scripts.indexOf(b));
// Execute both renderer worlds. The legacy amenities branch must be exercised:
// Monaco-only geometry tests cannot detect a broken sauna/van scope.
for(const f1 of [false,true]){
 const context=f1?create().context:{window:{LPRVehicleSpec:require('../shared/vehicle-spec.js'),LPRTrackData:JSON.parse(fs.readFileSync('data/track-objects.json'))}};
 if(!f1){vm.createContext(context);for(const file of ['campus.js','shared/track-document.js','shared/terrain.js','shared/track-objects.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);}
 for(const file of ['shared/people.js','renderer3d.js',...(f1?['tracks/monaco-f1-renderer.js']:[])])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const r=Object.create(context.window.LPRRenderer3D.prototype),uploads=[];r.track=context.window.LPRCampus.track;r.locations={};r.wheelPhase=0;
 r.gl=new Proxy({},{get:(_,k)=>k==='createBuffer'?()=>({}):k==='bufferData'?(_,array)=>uploads.push(array):()=>{}});
 r.makeWorld();assert(r.vertexCount>10000);assert(r.worldSource.every(Number.isFinite));r.updateObstacleMeshes();r.updatePeople(0);
 const car={x:100,y:200,angle:.5,vx:20,steerAngle:.2};r.vehiclePose=r.updateSuspension(car,0);r.drawWheels(car,0);
 assert(uploads.length>0&&uploads.every(v=>v.every(Number.isFinite)));
 if(f1){
  assert.equal(r.f1Meshes.length,5);assert(r.f1Meshes[0].count>1000);
  const body=context.window.LPRF1Mesh.body().vertices,tyre=context.window.LPRF1Mesh.wheel(false).vertices;
  const dimension=(a,axis)=>{const x=a.filter((_,i)=>i%6===axis);return (Math.max(...x)-Math.min(...x))*.1;};
  assert(Math.abs(dimension(body,0)-5.2)<1e-9);assert(Math.abs(dimension(body,2)-1.9)<1e-9);
  assert(Math.abs(dimension(tyre,2)-.375)<.003,'Nominal tyre width plus thin identification band');
  const before=uploads.length;r.drawWheels({...car,angle:1,steerAngle:-.3},100);assert.equal(uploads.length,before,'Rigid F1 meshes are uploaded once');
 }
 console.log(`PASS: full ${f1?'Monaco F1':'Skinnarila amenities'} renderer world, obstacle/people update and finite vehicle GPU geometry`);
}
// Load the actual aid settings module, including corrupt/partial saved settings.
const storage=new Map(),context={window:{LPRTrackConfig:{},LPRVehicleSpec:{id:'lpr-f1-monaco-v2'},location:{reload(){context.reloads++;}}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},reloads:0};
vm.createContext(context);const source=fs.readFileSync('tracks/monaco-f1-aids.js','utf8');
const run=()=>vm.runInContext(source,context);run();
assert.equal(context.window.LPRF1Aids.code,'111');assert.equal(context.window.LPRTrackConfig.id,'monaco-f1-v2');const allKey=context.window.LPRTrackConfig.bestTimeKey;
context.window.LPRF1Aids.set('abs',false);assert.equal(context.reloads,1);run();
assert.equal(context.window.LPRF1Aids.code,'101');assert.notEqual(context.window.LPRTrackConfig.bestTimeKey,allKey);
assert.equal(context.window.LPRTrackConfig.lapMetadata().aids.abs,false);
assert(!storage.has('lpr-traction-control'),'Monaco aids never write Skinnarila preference');
storage.set('lpr-monaco-f1-v2-aids','{"tc":"false","abs":false}');run();assert.equal(context.window.LPRF1Aids.code,'101');
// Every aid combination uses its own v2 lap/sector records; aid settings also
// have a new namespace. A seeded older record survives every settings reload.
const oldKey='lpr-best-time-monaco-f1-'+['v',1].join('')+'-111';storage.set(oldKey,'93792');
const timeKeys=new Set(),sectorKeys=new Set();
for(let bits=0;bits<8;bits++){
 storage.set('lpr-monaco-f1-v2-aids',JSON.stringify({tc:!!(bits&4),abs:!!(bits&2),steering:!!(bits&1)}));run();
 const config=context.window.LPRTrackConfig;assert(config.bestTimeKey.includes('monaco-f1-v2'));assert(config.bestSectorsKey.includes('monaco-f1-v2'));
 timeKeys.add(config.bestTimeKey);sectorKeys.add(config.bestSectorsKey);
}
assert.equal(timeKeys.size,8);assert.equal(sectorKeys.size,8);assert.equal(storage.get(oldKey),'93792');
storage.set('lpr-monaco-f1-v2-aids','{"tc":true,"abs":false,"steering":true}');run();
// Exercise the actual game PB writer with the Monaco metadata hook.
const game=fs.readFileSync('game.js','utf8');const fn=game.slice(game.indexOf('  function promotePersonalBest('),game.indexOf('  function persistReferenceLap('));
const pb={window:{LPRDrivingRevision:'f1-test',LPRTrackConfig:context.window.LPRTrackConfig,LPRLapTiming:{validSamples:()=>null}},localStorage:context.localStorage,
 best:0,demoBest:0,storedSectors:null,timing:{best:[1000,2000,3000],setBest(){}},personalBestThreshold:0,defaultSectorProgress:[],bestTimeKey:'test-time',bestSectorsKey:'test-sectors',rememberLocalReference(){}};
vm.createContext(pb);vm.runInContext(fn+';promotePersonalBest(6000,[1000,2000,3000],null,null);',pb);
const saved=JSON.parse(storage.get('test-sectors'));assert.equal(saved.aids.abs,false);assert.equal(saved.aids.tc,true);assert.equal(saved.vehicle,'lpr-f1-monaco-v2');
console.log('PASS: Monaco entry/build isolation, default and persisted aid combinations, separate records and actual PB metadata writer');
// The bot remains an input-only analog controller, not a keyboard skill test.
// Its speed plan is controller-specific; it must never calibrate tyre grip.
const {runBot}=require('./monaco-f1-bot.cjs');const result=runBot({record:true});
assert(!result.failed,result.failed);assert.equal(result.hits,0,'Bot lap stays collision free');assert(result.lapSeconds>75&&result.lapSeconds<90,'Clean controller regression envelope; 70–75 s remains unmet');
// Replay the complete recorded lap from a fresh world, including actual terrain,
// kerbs, aid state and every suspension/load-history byte. No controller rerun.
const replay=create(),c=replay.w.LPRCampus;Object.assign(replay.s,c.launchPosition);replay.d.reset(replay.s);
for(let tick=0;tick<result.inputs.length;tick++){
 const grass=sampleRoad(replay.w,replay.d,replay.s),previous={x:replay.s.x,y:replay.s.y,angle:replay.s.angle};
 replay.d.step(replay.s,result.inputs[tick],1/120,grass);
 assert(!c.resolveObstacleCollision(replay.s,previous,contact=>replay.d.applyImpact(replay.s,contact.normal,contact.impactMaterial,contact)),`replay wall clearance tick ${tick}`);
 assert.equal(JSON.stringify(binary(replay.s)),JSON.stringify(binary(result.states[tick])),`full lap bit replay tick ${tick}`);
}
console.log('PASS: input-only, elevated-road, physical-hull complete bot lap and byte-identical replay',JSON.stringify({...result,inputs:undefined,states:undefined}));
