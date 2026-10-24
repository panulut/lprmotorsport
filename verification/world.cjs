const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const files=['shared/vehicle-spec.js','campus.js','shared/track-document.js','shared/terrain.js',
 'shared/track-objects.js','vehicle.js','shared/collision-index.js','shared/people.js','shared/driving.js'];
const sources=files.map(file=>fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n'));
const data=JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'data/track-objects.json'),'utf8')));
const revision=createHash('sha256').update(JSON.stringify({files,sources,data,protocol:'driving-v1'})).digest('hex');
function createWorld(){
 const window={LPRTrackData:JSON.parse(data)};
 // Only trusted project code is compiled. Client data is never executable code.
 new Function('window','module',sources.join('\n'))(window,undefined);
 return {world:window.LPRDriving.create(),api:window.LPRDriving};
}
module.exports={createWorld,revision,files};
