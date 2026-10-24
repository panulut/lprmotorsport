const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const sources=['shared/vehicle-spec.js','campus.js','shared/track-document.js','shared/terrain.js','shared/track-objects.js'].map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/track-objects.json'),'utf8'));
const w={LPRTrackData:data};new Function('window','module',sources)(w,undefined);
const doc=w.LPRTrackDocument,objects=doc.validate(data),mask=doc.createRoadMask(w.LPRCampus);
const baseline=(x,y)=>objects.some(o=>o.type==='asphalt'&&!(o.allowOnTrack===false&&mask.contains(x,y))&&doc.onAsphaltObject(o,x,y));
let checked=0;const check=(x,y)=>{assert.equal(w.LPRTrackObjects.onAsphalt(x,y),baseline(x,y),`Membership differs at ${x},${y}`);checked++;};
let seed=123;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(let i=0;i<2000;i++)check(random()*5400-100,random()*4600-100);
for(const o of objects.filter(o=>o.type==='asphalt')){
 check(o.x,o.y);
 const c=Math.cos(o.angle),s=Math.sin(o.angle),d=o.square?120:80;
 for(const [x,y] of [[60,0],[-60,0],[0,d/2],[0,-d/2]])
  for(const delta of [-1e-7,0,1e-7])check(o.x+((x+delta)*c-y*s)*o.scale,o.y+((x+delta)*s+y*c)*o.scale);
}
console.log(`PASS: indexed asphalt matches original full scan at ${checked} random, rotated, rounded and boundary points`);
