const fs=require('node:fs'),vm=require('node:vm');
function create(){
  const context={window:{LPRTrackData:JSON.parse(fs.readFileSync("data/track-objects.json","utf8"))}};vm.createContext(context);
  for(const f of ['shared/dmath.js','shared/vehicle-spec-f1.js','campus.js','shared/track-document.js','shared/terrain.js','shared/track-objects.js','shared/collision-index.js','tracks/monaco-reference.js','tracks/monaco.js','vehicle.js','shared/vehicle-f1.js','tracks/monaco-f1-collision.js']){
    vm.runInContext(fs.readFileSync(f,'utf8'),context,{filename:f});
  }
  const w=context.window,d=new w.VehicleDynamics(),s={x:0,y:0,angle:0};d.reset(s);
  return {context,w,d,s};
}
module.exports={create};
