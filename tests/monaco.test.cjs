const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {monacoPage}=require('../scripts/monaco-page.cjs');
const context={window:{LPRVehicleSpec:require('../shared/vehicle-spec.js')}};
vm.createContext(context);
context.window.LPRTrackData=JSON.parse(fs.readFileSync('data/track-objects.json','utf8'));
for(const file of ['campus.js','shared/track-document.js','shared/terrain.js','shared/track-objects.js','tracks/monaco-reference.js','tracks/monaco.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
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
const head=html.slice(0,html.indexOf('<body'));
assert.equal((head.match(/<!--/g)||[]).length,(head.match(/-->/g)||[]).length,'Every head comment must stay closed, or the page body is swallowed');
assert.match(html,/<meta http-equiv="Content-Security-Policy" content="[^"]*connect-src 'self';/,'Monaco CSP allows only its own origin');
assert(!/connect-src[^"]*https:/.test(html.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)[0]),'Monaco CSP lists no remote services');
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

const m=campus.monaco,field=m.terrain;
const heights=track.map(p=>field.heightAt(p.x,p.y)),widths=track.map((_,i)=>campus.road.halfWidthAt(i)*2);
assert(Math.max(...heights)-Math.min(...heights)>418&&Math.max(...heights)-Math.min(...heights)<421,'Approximately 42 m relief');
assert(Math.min(...widths)<74&&Math.max(...widths)>119,'Width changes from narrow streets to the wider square');
for(let i=0;i<track.length;i++){
 const p=track[i],q=track[(i+1)%track.length];
 assert(Math.abs(field.heightAt(p.x,p.y)-p.height)<1.5,'Tyre height follows the route profile');
 assert(Math.abs(q.height-p.height)/Math.hypot(q.x-p.x,q.y-p.y)<.35,'No vertical steps or extreme grades');
 assert(Math.abs(q.halfWidth-p.halfWidth)<8,'Road widths change continuously');
}
assert(Math.abs(track[0].height-track.at(-1).height)<2,'Start/finish is vertically continuous');
const probeIndex=track.findIndex(p=>p.sourceAlong>28000&&p.sourceAlong<28500);
const probeA=track[probeIndex],probeB=track[(probeIndex+1)%track.length],probe={x:(probeA.x+probeB.x)/2,y:(probeA.y+probeB.y)/2};
const gradient=field.sample(probe.x,probe.y),epsilon=.001;
assert(Math.abs(gradient.dx-(field.heightAt(probe.x+epsilon,probe.y)-field.heightAt(probe.x-epsilon,probe.y))/(2*epsilon))<1e-5);
assert(Math.abs(gradient.dy-(field.heightAt(probe.x,probe.y+epsilon)-field.heightAt(probe.x,probe.y-epsilon))/(2*epsilon))<1e-5);

// Test both physical mouths and every bend of the pit lane with the actual car hull.
for(let i=0;i<m.pit.length-1;i++){
 const a=m.pit[i],b=m.pit[i+1],angle=Math.atan2(b.y-a.y,b.x-a.x);
 for(const offset of [-8,0,8]){
  const shifted=p=>({x:p.x-Math.sin(angle)*offset,y:p.y+Math.cos(angle)*offset});
  assert(!campus.resolveObstacleCollision({...shifted(b),angle,vx:0,vy:0,damage:0},{...shifted(a),angle}),`Pit lane sweep ${i} offset ${offset}`);
 }
 assert(Math.abs(field.heightAt(a.x,a.y)-field.heightAt(b.x,b.y))/Math.hypot(b.x-a.x,b.y-a.y)<.35,'Pit lane has no abrupt elevation steps');
 const r=campus.roadAt((a.x+b.x)/2,(a.y+b.y)/2);
 assert(r.distance<r.halfWidth,'The pit lane has asphalt grip');
}
const pitMiddle=m.pit[Math.floor(m.pit.length*.5)];
assert(campus.isPitLane(pitMiddle.x,pitMiddle.y));
assert(!campus.isPitLane(track[0].x,track[0].y));
assert(!campus.crossesFinishLine(m.pit[70],m.pit[71]),'Pit lane must not trigger the bounded main finish gate');
for(const style of ['casino','hotel','fairmont','rascasse'])assert(m.buildings.some(b=>b.style===style),style+' landmark retained');
assert(m.garages.length>=4,'Pit buildings must be included');
console.log('PASS: elevation and gradient continuity, 7.3–12 m widths, complete pit hull sweeps and landmark clearance');

// Exercise the actual client wheel-contact function, not a rewritten test formula.
vm.runInContext(fs.readFileSync('vehicle.js','utf8'),context);
const gameSource=fs.readFileSync('game.js','utf8');
const contactSource=gameSource.slice(gameSource.indexOf('  function grassContact(state)'),gameSource.indexOf('  function update(dt,'));
const trackDistances=[0];for(let i=0;i<track.length;i++)trackDistances.push(trackDistances.at(-1)+Math.hypot(track[(i+1)%track.length].x-track[i].x,track[(i+1)%track.length].y-track[i].y));
const nearest=(x,y)=>{const q=m.mainQuery(x,y);return {index:q.segment.index,distance:q.distance,along:trackDistances[q.segment.index]+q.t*(trackDistances[q.segment.index+1]-trackDistances[q.segment.index])};};
const dynamics=new context.window.VehicleDynamics();
const contact=new Function('dynamics','LPRCampus','window','nearestTrack','trackDistances','POINTS',contactSource+'return grassContact;')(dynamics,campus,context.window,nearest,trackDistances,track.length);
const probeAngle=Math.atan2(probeB.y-probeA.y,probeB.x-probeA.x),car={...probe,angle:probeAngle};dynamics.reset(car);
assert.equal(contact(car),0,'Centreline tyres stay on variable-width asphalt');
dynamics.createSuspension(car);
assert(car.suspension.heave>5,'The car starts settled on the elevated road, not the flat ground');
assert(car.terrainSlope.forward>.01,'The uphill contact supplies a grade to vehicle physics');
assert(contact({...car,x:car.x-Math.sin(probeAngle)*100,y:car.y+Math.cos(probeAngle)*100})>.9,'Outside the local edge, tyres leave the asphalt');
const pitCar={...pitMiddle,angle:Math.atan2(m.pit[Math.floor(m.pit.length*.5)+1].y-pitMiddle.y,m.pit[Math.floor(m.pit.length*.5)+1].x-pitMiddle.x)};
assert.equal(contact(pitCar),0,'Pit tyres use asphalt grip and local elevation');
function coast(reverse){const d=new context.window.VehicleDynamics(),state={...probe,angle:probeAngle+(reverse?Math.PI:0)};d.reset(state);state.vx=8;contact(state);d.createSuspension(state);for(let i=0;i<45;i++){contact(state);d.step(state,{gas:0,brake:0,steer:0},1/90,0);}return state.speed;}
assert(coast(true)>coast(false),'Same car coasts faster downhill than uphill on the actual terrain');
console.log('PASS: actual game wheel contacts, raised suspension, pit grip and uphill/downhill dynamics');

// Capture the actual generated GPU payloads to check paint and road alignment.
let bound;const uploads=new Map();
renderer.gl=new Proxy({}, {get:(_,key)=>key==='createBuffer'?()=>({}):key==='bindBuffer'?(_,v)=>{bound=v;}:key==='bufferData'?(_,v)=>{uploads.set(bound,v);}:()=>{}});
renderer.makeWorld();
for(const [mesh,base] of [[renderer.roadPaintMesh,.075],[renderer.kerbMesh,null]]){
 const vertices=uploads.get(mesh.buffer);assert(vertices.every(Number.isFinite));let raised=0;
 for(let i=0;i<vertices.length;i+=8){const h=field.heightAt(vertices[i],vertices[i+2]);if(h<100)continue;raised++;if(base!==null&&Math.abs(vertices[i+1]-h-base)>=.01){console.error({paint:[vertices[i],vertices[i+1],vertices[i+2]],h,base,q:m.mainQuery(vertices[i],vertices[i+2])});assert.fail('Paint follows the same elevated field as tyre contacts');}}
 assert(raised>0);
}
assert(renderer.worldSource.some((v,i)=>i%6===1&&v>420),'Landmarks and road render above the flat base');
assert(html.indexOf('tracks/monaco-reference.js')<html.indexOf('tracks/monaco.js'));
console.log('PASS: raised road/kerb/paint payloads and reference script load order');
