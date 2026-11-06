const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const files=['shared/dmath.js','shared/vehicle-spec.js','campus.js','shared/track-document.js','shared/terrain.js',
 'shared/track-objects.js','vehicle.js','shared/collision-index.js','shared/people.js','shared/driving.js'];
const sources=files.map(file=>fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n'));
const data=JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'data/track-objects.json'),'utf8')));
const sourceRevision=createHash('sha256').update(JSON.stringify({files,sources,data,protocol:'driving-v1'})).digest('hex');
// The revision names the physics, not the text: leaderboards, replays and personal
// bests are only comparable within one revision. A refactor proven bit-identical by
// tests/physics-golden.test.cjs may keep the revision it replaces. Entries match one
// exact source hash, so any later edit falls back to a new revision automatically.
const equivalent=JSON.parse(fs.readFileSync(path.join(__dirname,'equivalent-revisions.json'),'utf8')).equivalent;
const revision=Object.hasOwn(equivalent,sourceRevision)?equivalent[sourceRevision].revision:sourceRevision;
// Compile the trusted source once per thread; never evaluate client data.
const initialize=new Function('window','module',sources.join('\n'));
function createIsolatedWorld({trackIndexed=true}={}){
 const window={LPRTrackData:JSON.parse(data)};
 initialize(window,undefined);
 return {world:window.LPRDriving.create({trackIndexed}),api:window.LPRDriving,math:window.LPRMath,campus:window.LPRCampus};
}
function createWorldFactory(){
 const root={LPRTrackData:JSON.parse(data)};
 initialize(root,undefined);
 const prepared=root.LPRCampus.prepareSessionFactory();
 const collisionIndex=root.LPRCreateCollisionIndex.prepare(root.LPRCampus.obstacleBounds);
 // These functions close over immutable document/terrain lookup data only.
 const trackObjects=Object.freeze({onAsphalt:root.LPRTrackObjects.onAsphalt,
  terrain:Object.freeze({heightAt:root.LPRTrackObjects.terrain.heightAt,sample:root.LPRTrackObjects.terrain.sample})});
 return Object.freeze({definition:prepared.definition,
  create({trackIndexed=true}={}){
   const campus=prepared.createSession();campus.collisionIndex=collisionIndex;
   return {world:root.LPRDriving.create({trackIndexed,campus,trackObjects}),api:root.LPRDriving,math:root.LPRMath,campus,definition:prepared.definition};
  }
 });
}
// Isolated worlds remain useful for tools and reference tests. Production pool
// workers explicitly own a shared factory for their multiple sessions.
function createWorld(options){return createIsolatedWorld(options);}
module.exports={createWorld,createWorldFactory,createIsolatedWorld,revision,sourceRevision,files};
