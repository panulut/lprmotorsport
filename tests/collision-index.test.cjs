const assert=require('node:assert/strict'),create=require('../shared/collision-index.js');
let seed=42;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const bounds=Array.from({length:250},()=>{const x=random()*2000-1000,y=random()*2000-1000,w=random()*400,h=random()*400;return {minX:x-w,maxX:x+w,minY:y-h,maxY:y+h};});
const moving={minX:9000,maxX:9010,minY:9000,maxY:9010,body:{mass:3}};bounds.push(moving);const query=create(bounds);
for(let i=0;i<500;i++){
 const x=random()*2000-1000,y=random()*2000-1000,r=random()*100;const candidates=query(x,y,x,y,r);
 for(const b of bounds){const cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2,reach=Math.hypot(b.maxX-b.minX,b.maxY-b.minY)/2;
  if(cx+reach>=x-r&&cx-reach<=x+r&&cy+reach>=y-r&&cy-reach<=y+r)assert(candidates.includes(b),'No potentially colliding obstacle may be omitted');}
 assert.deepEqual(candidates,[...candidates].sort((a,b)=>bounds.indexOf(a)-bounds.indexOf(b)),'Stable original collision order');
 assert(candidates.includes(moving),'Moving bodies always included regardless of old location');
}
console.log('PASS: conservative rotated bounds, dynamic bodies, negative coordinates and collision ordering');
