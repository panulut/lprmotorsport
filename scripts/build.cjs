const fs=require('node:fs');
const path=require('node:path');
const {validate}=require('../shared/track-document.js');
const root=path.resolve(__dirname,'..');
const gameFiles=['shared/collision-index.js','shared/people.js','shared/driving.js','experiment/live-client.js','verification/config.js','verified-driving.js','index.html','privacy.html','styles.css','3d.css','i18n.js','campus.js','sale.js','renderer3d.js','vehicle.js','sauna.js','timing.js','leaderboard.js','analytics.js','audio.js','game.js','race-effects.js','shared/track-sync.js','shared/terrain.js','shared/vehicle-spec.js'];
function readDocument(){return {version:1,objects:validate(JSON.parse(fs.readFileSync(path.join(root,'data/track-objects.json'),'utf8')))};}
function dataScript(doc=readDocument()){return `window.LPRTrackData=${JSON.stringify(doc)};\n`;}
function build(destination=path.join(root,'dist')) {
  const doc=readDocument();
  const target=path.resolve(destination);
  if(!target.startsWith(root+path.sep)||target===root)throw Error('Build output must be inside the project.');
  // Remove only this verified output folder so obsolete editor files cannot survive a build.
  fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true});
  for(const file of [...gameFiles,'shared/track-document.js','shared/track-objects.js','data/track-objects.json']) {
    fs.mkdirSync(path.dirname(path.join(target,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(target,file));
  }
  fs.cpSync(path.join(root,'assets'),path.join(target,'assets'),{recursive:true});
  fs.writeFileSync(path.join(target,'data/track-data.js'),dataScript(doc));
  fs.writeFileSync(path.join(target,'verification/revision.js'),`window.LPRDrivingRevision=${JSON.stringify(require('../verification/world.cjs').revision)};\n`);
  return target;
}
module.exports={build,readDocument,dataScript,gameFiles,root};
if(require.main===module)console.log(`Pelin julkaisupaketti: ${build()}`);
