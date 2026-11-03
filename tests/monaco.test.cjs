const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {monacoPage}=require('../scripts/monaco-page.cjs');
const context={window:{LPRVehicleSpec:require('../shared/vehicle-spec.js')}};
vm.createContext(context);
context.window.LPRTrackData=JSON.parse(fs.readFileSync('data/track-objects.json','utf8'));
for(const file of ['campus.js','shared/track-document.js','shared/terrain.js','shared/track-objects.js','tracks/monaco.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const campus=context.window.LPRCampus,track=campus.track,gate=campus.finishGate;
assert.equal(track.length,960);
assert(campus.length>33000&&campus.length<33400,'Resampled circuit stays near 3.337 km at 10 world units per metre');
assert(track.every(p=>p.x>0&&p.x<campus.bounds.width&&p.y>0&&p.y<campus.bounds.height));
assert(campus.obstacleBounds.length>1900,'Continuous physical barriers');
const along=d=>({x:gate.x+gate.tangentX*d,y:gate.y+gate.tangentY*d});
assert(campus.crossesFinishLine(along(-10),along(10)));
assert(!campus.crossesFinishLine(along(10),along(-10)));
assert.equal(context.window.LPRTrackData.objects.length,0);
assert.notEqual(context.window.LPRTrackConfig.bestTimeKey,'lpr-best-time-lut-20261011-v3');
// Sweep the actual car footprint around the entire centreline, including the hairpin.
let hits=[];
for(let i=0;i<track.length;i++){
 const a=track[i],b=track[(i+1)%track.length],angle=Math.atan2(b.y-a.y,b.x-a.x);
 const state={...b,angle,vx:0,vy:0,damage:0};
 if(campus.resolveObstacleCollision(state,{...a,angle}))hits.push(i);
}
assert.deepEqual(hits,[],'Every centreline segment must remain driveable by the Formula Student car');
const first=track[0],next=track[1],angle=Math.atan2(next.y-first.y,next.x-first.x);
const state={x:first.x+gate.normalX*90,y:first.y+gate.normalY*90,angle,vx:0,vy:0,damage:0};
assert(campus.resolveObstacleCollision(state,{...first,angle}),'Leaving the road hits a physical wall');
const html=monacoPage(fs.readFileSync('index.html','utf8'));
for(const script of ['leaderboard.js','analytics.js','verified-driving.js','chat.js','spectate-menu.js','championship.js'])assert(!html.includes(`src="${script}`),script+' must not start online activity');
assert(html.indexOf('tracks/monaco.js')>html.indexOf('src="shared/track-objects.js'));
assert(html.indexOf('tracks/monaco-practice.js')<html.indexOf('src="game.js'));
console.log('PASS: Monaco geometry, full centreline car sweep, physical walls, directional finish, isolated storage and practice page');

vm.runInContext(fs.readFileSync('renderer3d.js','utf8'),context);
const renderer=Object.create(context.window.LPRRenderer3D.prototype);
renderer.track=track;renderer.locations={};
renderer.gl=new Proxy({},{get:(_,key)=>key==='createBuffer'?()=>({}):()=>{}});
renderer.makeWorld();
assert(renderer.vertexCount>10000);
assert(renderer.worldSource.every(Number.isFinite),'Complete render geometry must be finite');
renderer.updateObstacleMeshes();renderer.updatePeople(0);
console.log('PASS: complete Monaco renderer geometry and amenity-free scene update');
