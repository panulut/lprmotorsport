/* Run from repository root: node tests/monaco-trackside.test.cjs */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {monacoPage}=require('../scripts/monaco-page.cjs');
const context={window:{innerWidth:1280}};
context.window.LPRTrackData=JSON.parse(fs.readFileSync('data/track-objects.json','utf8'));
vm.createContext(context);
for(const file of ['shared/dmath.js','shared/vehicle-spec-f1.js','campus.js','shared/track-document.js','shared/terrain.js','shared/track-objects.js','tracks/monaco-reference.js','tracks/monaco-sponsors.js','tracks/monaco-trackside.js','tracks/monaco.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const {window:w}=context,campus=w.LPRCampus,track=campus.track,m=campus.monaco;
const bounds=JSON.stringify(campus.obstacleBounds);
let emitted,placements;
const original=w.LPRMonacoTrackside.build;
w.LPRMonacoTrackside.build=args=>{
 emitted=[];placements=[];
 return original({...args,inspect:p=>placements.push(p),quad:(...p)=>{emitted.push(p);args.quad(...p);}});
};
const noQuad=()=>{};
function build(width){w.innerWidth=width;campus.build({quad:noQuad,absoluteQuad:noQuad});return JSON.parse(JSON.stringify({...w.LPRMonacoTrackside.scene,placements}));}
const a=build(1280),geometry=JSON.stringify(emitted),b=build(1280);
assert.deepEqual(a,b,'Scene placement, colours and UVs repeat exactly');
assert.equal(JSON.stringify(emitted),geometry,'Baked crowd geometry is bit-for-bit deterministic');
assert.equal(JSON.stringify(campus.obstacleBounds),bounds,'No added collision bounds');
assert(!('placements' in w.LPRMonacoTrackside.scene),'Production scene retains no per-person objects');
assert.equal(campus.peopleSites.length,0);assert.equal(campus.bodies.length,0);
assert(a.people>1200,'Grandstands and balconies feel occupied');
assert(a.boards.length>35,'Multiple boards at every braking zone');
assert(a.boards.some(b=>b.overhead&&b.section==='start-finish'));
for(const kind of ['harbour','sainte-devote','swimming-pool','rascasse','anthony-noghes','rascasse-hill','balcony-person','yacht'])assert(a.placements.some(p=>p.kind===kind),kind+' crowd present');
for(const section of ['sainte-devote','massenet-casino','mirabeau','loews','tunnel-exit','nouvelle-chicane','tabac','swimming-pool','rascasse'])assert(a.boards.some(b=>b.section===section),section+' signs present');
// Check the full conservative footprint against each independently queried route.
// In particular, checking only roadAt() would miss pit/main overlaps.
function outside(x,y,radius=0){
 for(const query of [m.mainQuery,m.pitQuery]){const q=query(x,y);assert(q.distance>q.halfWidth+radius,`Off-road footprint at ${x}, ${y}`);}
}
for(const item of a.placements){assert(Number.isFinite(item.bottom));outside(item.x,item.y,item.radius);}
// Verify every emitted crowd vertex and every edge, not just person centres.
// All of a crowd triangle lies in its tested circumscribed placement disc.
for(const face of emitted)for(const v of face.slice(0,4)){assert(v.every(Number.isFinite));outside(v[0],v[2]);}
for(const board of a.boards){
 for(let edge=0;edge<4;edge++){
  const p=board.points[edge],q=board.points[(edge+1)%4];
  const n=Math.max(1,Math.ceil(Math.hypot(q[0]-p[0],q[2]-p[2])/2));
  for(let i=0;i<=n;i++){
   const x=p[0]+(q[0]-p[0])*i/n,z=p[2]+(q[2]-p[2])*i/n,y=p[1]+(q[1]-p[1])*i/n;
   if(board.overhead){assert(y>=m.terrain.heightAt(x,z)+74.9,'Bridge clears both lanes vertically by at least 7.49 m');}
   else outside(x,z);
  }
 }
}
const mobile=build(390);assert(mobile.people<a.people*.4,'Narrow viewport reduces crowd to about one third');
const full=new Map(a.placements.filter(p=>Number.isInteger(p.key)).map(p=>[p.key,p]));
for(const p of mobile.placements.filter(p=>Number.isInteger(p.key)))assert.deepEqual(p,full.get(p.key),'Mobile is a stable subset of desktop');
assert.deepEqual(mobile.boards,a.boards,'Phone keeps all legible sponsor boards');
assert.deepEqual(build(390),mobile,'Mobile builds also repeat');
// No ambient random state is read, even accidentally in a later addition.
vm.runInContext('Math.random=()=>{throw Error("Unseeded scene randomness");}',context);build(1280);
assert.equal(a.boardVertices.length,a.boards.length*6*8);
assert(a.boardVertices.every(Number.isFinite));
for(let i=6;i<a.boardVertices.length;i+=8)assert(a.boardVertices[i]>=0&&a.boardVertices[i]<=1&&a.boardVertices[i+1]>=0&&a.boardVertices[i+1]<=1);
assert.equal(a.atlas.width&(a.atlas.width-1),0);assert.equal(a.atlas.height&(a.atlas.height-1),0);
assert.equal(new Set(w.LPRMonacoSponsors.map(s=>s.id)).size,w.LPRMonacoSponsors.length);
for(const s of w.LPRMonacoSponsors){
 const file='assets/monaco/sponsors/'+s.id+'.png',data=fs.readFileSync(file);
 assert.equal(s.image,file);assert.equal(data.readUInt32BE(16),1024);assert.equal(data.readUInt32BE(20),256);
 assert.match(s.background,/^#[\da-f]{6}$/i);assert.match(s.foreground,/^#[\da-f]{6}$/i);
}
const html=monacoPage(fs.readFileSync('index.html','utf8'));
for(const name of ['monaco-sponsors','monaco-trackside','monaco-trackside-renderer'])assert.equal((html.match(new RegExp('src="tracks/'+name+'\\.js','g'))||[]).length,1);
assert(html.indexOf('tracks/monaco-sponsors.js')<html.indexOf('tracks/monaco-trackside.js'));
assert(html.indexOf('tracks/monaco-trackside.js')<html.indexOf('tracks/monaco.js'));
assert(html.indexOf('tracks/monaco-trackside-renderer.js')>html.indexOf('tracks/monaco-f1-renderer.js'));
assert(!fs.readFileSync('index.html','utf8').includes('monaco-trackside'),'Skinnarila does not load scenery');
console.log(`PASS: ${a.people} desktop / ${mobile.people} mobile static figures, ${a.boards.length} signs, ${a.triangles} / ${mobile.triangles} baked triangles, ${a.boards.length*2} textured triangles`);
console.log('PASS: deterministic geometry, full road AND pit footprints, overhead envelope, unchanged bounds and script isolation');
// Exercise the real renderer chain and GL upload lifecycle without a browser.
for(const file of ['renderer3d.js','tracks/monaco-f1-renderer.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const Parent=w.LPRRenderer3D;
vm.runInContext(fs.readFileSync('tracks/monaco-trackside-renderer.js','utf8'),context);
assert(w.LPRRenderer3D.prototype instanceof Parent,'Preserves F1 renderer chain');
const calls=[],images=[],uploads=[];let textureUploads=0;
let buffer,source;
context.Image=class {constructor(){images.push(this);}set src(value){this.url=value;}};
context.document={createElement:()=>({getContext:()=>new Proxy({},{get:(_,key)=>key==='drawImage'?(...args)=>calls.push(['image',args[0].url]):key==='fillText'?(name)=>calls.push(['wordmark',name]):()=>{}})})};
const gl=new Proxy({isContextLost:()=>false,texImage2D:()=>textureUploads++},{get:(obj,key)=>obj[key]||(['createBuffer','createTexture'].includes(key)?()=>({}):key==='bindBuffer'?(_,b)=>{buffer=b;}:key==='bufferData'?(_,data)=>{source=data;uploads.push([buffer,data]);}:()=>{})});
const renderer=Object.create(w.LPRRenderer3D.prototype);renderer.gl=gl;renderer.track=track;renderer.locations={};
renderer.makeWorld();
assert(renderer.worldSource.every(Number.isFinite));assert(renderer.monacoBoards.count===a.boards.length*6);
assert.equal(renderer.spectatorMeshes.length,0);
const originalMesh=renderer.monacoBoards;
for(const sponsor of w.LPRMonacoSponsors)assert(calls.some(c=>c[0]==='wordmark'&&c[1]===sponsor.name),'Canvas fallback for '+sponsor.id);
const fallbackUpload=textureUploads;
for(const image of images)image.onerror();
assert.equal(textureUploads,fallbackUpload+1,'Failed images keep the atlas fallback');
const catalogue=w.LPRMonacoSponsors;
w.LPRMonacoSponsors=catalogue.map((s,i)=>i? s:{...s,image:'assets/monaco/sponsors/designer-swap.png'});
renderer.makeWorld();
assert(images.some(i=>i.url==='assets/monaco/sponsors/designer-swap.png'));
const loaded=images.findLast(i=>i.url==='assets/monaco/sponsors/designer-swap.png');loaded.naturalWidth=1024;loaded.naturalHeight=256;loaded.onload();
assert(calls.some(c=>c[0]==='image'),'Optional designer image is composited into the shared atlas');
renderer.makeWorld();const beforeStale=textureUploads;loaded.onload();assert.equal(textureUploads,beforeStale,'Stale loads cannot resurrect replaced atlas');assert.notEqual(renderer.monacoBoards,originalMesh);
renderer.drawRoadPaint();
console.log('PASS: renderer subclass, finite GPU uploads, shared atlas, designer image swap, stale load and no animated spectators');

// Optional CPU-side submission counts through the actual renderer and frustum.
// No GPU executes here: these numbers must never be described as measured FPS.
if(process.argv.includes('--triangles')){
 const {context,w,d}=require('./helpers-monaco-f1.cjs').create();
 for(const file of ['tracks/monaco-sponsors.js','tracks/monaco-trackside.js','renderer3d.js','tracks/monaco-f1-renderer.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 const Base=w.LPRRenderer3D;
 vm.runInContext(fs.readFileSync('tracks/monaco-trackside-renderer.js','utf8'),context);
 let triangles=0,drawCalls=0;
 const gl=new Proxy({getExtension:()=>({}),isContextLost:()=>false,
  drawArrays:(_,start,count)=>{triangles+=count/3;drawCalls++;},
  drawElements:(_,count)=>{triangles+=count/3;drawCalls++;}
 },{get:(o,key)=>o[key]||(['createBuffer','createTexture'].includes(key)?()=>({}):()=>{})});
 let ctx;ctx=new Proxy({},{get:()=>()=>ctx});
 context.document={createElement:()=>({getContext:()=>ctx})};context.Image=class {};
 const r=Object.create(w.LPRRenderer3D.prototype);
 Object.assign(r,{gl,track:w.LPRCampus.track,locations:{},cockpit:ctx,driverArm:{complete:false},wheelPhase:0});
 const trackside=w.LPRMonacoTrackside.build;
 const cameras=[['start-finish',null],['casino',[7.42719,43.73940]],['harbour',[7.42196,43.73639]]];
 function countAt(name,position){
  let index=r.track.length-8;
  if(position){
   const target=w.LPRCampus.monaco.project(position);index=0;
   r.track.forEach((p,i)=>{if(Math.hypot(p.x-target.x,p.y-target.y)<Math.hypot(r.track[index].x-target.x,r.track[index].y-target.y))index=i;});
   index=(index+r.track.length-4)%r.track.length;
  }
  const p=r.track[index],q=r.track[(index+1)%r.track.length],car={x:p.x,y:p.y,angle:Math.atan2(q.y-p.y,q.x-p.x)},spec=w.LPRVehicleSpec;
  d.reset(car);
  // Actual four wheel-contact elevations in SI units, so the camera is above
  // the Casino crest instead of incorrectly counting from the flat world base.
  car.roadHeights=[spec.frontAxle,-spec.rearAxle].flatMap(f=>[-1,1].map(side=>{
   const z=side*spec.trackWidth/2,c=Math.cos(car.angle),s=Math.sin(car.angle);
   return w.LPRCampus.monaco.terrain.heightAt(car.x+10*(f*c-z*s),car.y+10*(f*s+z*c))/10;
  }));
  d.createSuspension(car);d.stepSuspension(car,0);
  triangles=0;drawCalls=0;r.look=null;r.lastLook=0;r.render(car,1000);
  return {name,index,triangles,drawCalls};
 }
 for(const enabled of [false,true]){
  for(const [width,height] of [[1280,720],[390,844]]){
   w.innerWidth=width;r.width=width;r.height=height;
   w.LPRMonacoTrackside.build=enabled?trackside:()=>{};
   Object.setPrototypeOf(r,enabled?w.LPRRenderer3D.prototype:Base.prototype);
   r.makeWorld();
   console.log(JSON.stringify({enabled,width,height,worldTriangles:r.vertexCount/3,boardTriangles:enabled?r.monacoBoards.count/3:0,views:cameras.map(([name,p])=>countAt(name,p))}));
  }
 }
}
