const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context={window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer3d.js'),'utf8'),context);
const renderer=Object.create(context.window.LPRRenderer3D.prototype);
let mesh;
const camera={};
renderer.gl=new Proxy({}, {get:(_,key)=>key==='bufferData' ? (_,data)=>{mesh=data;}
  : key==='uniform3f' ? (name,...values)=>{camera[name]=values;} : ()=>{}});
renderer.locations={camera:'camera',forward:'forward',right:'right',up:'up'};
renderer.bindMesh=()=>{};
renderer.drawCampusMaterials=()=>{};
renderer.drawSpectators=()=>{};
renderer.drawCockpit=()=>{};
renderer.width=1280;renderer.height=720;renderer.wheelPhase=0;
const car={x:100,y:200,angle:0,speed:0,steerAngle:0};
const bodyColor=[.055,.075,.065];
const bodyVertices=data=>{
  const vertices=[];
  for(let i=0;i<data.length;i+=6) if(bodyColor.every((c,j)=>Math.abs(data[i+3+j]-c)<1e-6)) vertices.push(Array.from(data.slice(i,i+3)));
  return vertices;
};
renderer.render(car,0);
const neutral=Array.from(mesh), body=bodyVertices(mesh);
assert(body.length>0);
for(const steerAngle of [-.36,.36]) {
  renderer.render({...car,steer:Math.sign(steerAngle),steerAngle,lateralG:1.5},0);
  assert.deepEqual(bodyVertices(mesh),body,'Steering and lateral G must not move bodywork');
  assert.notDeepEqual(Array.from(mesh),neutral,'Front tyre geometry must respond to steering');
}
const projectBody=()=>bodyVertices(mesh).map(vertex=>{
  const relative=vertex.map((v,i)=>v-camera.camera[i]);
  const dot=axis=>relative.reduce((sum,v,i)=>sum+v*camera[axis][i],0);
  const depth=dot('forward');
  return depth>1 ? [dot('right')/depth,dot('up')/depth] : null;
}).filter(Boolean);
renderer.render(car,0);
const reference=projectBody();
for(const angle of [-2.5,.8,2.9]) {
  renderer.render({...car,angle,steerAngle:.36,lateralG:-1.4,longitudinalG:.8,speed:20},1200);
  const projected=projectBody();
  projected.forEach((point,i)=>point.forEach((v,j)=>assert(Math.abs(v-reference[i][j])<1e-4,
    'Nose and cockpit must remain fixed in driver view as the whole car turns')));
}
renderer.render(car,0);
for(const side of [-1,1]) {
  const joint=[98.8,4,200+side*2.7];
  const matches=bodyVertices(mesh).filter(vertex=>vertex.every((v,i)=>Math.abs(v-joint[i])<1e-4));
  assert(matches.length>=2,'Nose and cockpit walls must share their attachment edge');
}
assert([...mesh].every(Number.isFinite));
console.log('PASS: fixed nose and cockpit, steering tyres, body-relative camera and connected bodywork');
