const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const context = {window:{LPRCampus:{world:(x,y)=>({x,y})}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'sale.js'),'utf8'),context);
const sale=context.window.LPRSale;
const counts=new Map();
const boxes=[];
let displayQuads=0;
sale.buildInterior({box(...args){boxes.push(args);},quad(...args){
  displayQuads++;
  assert(args.slice(0,4).flat().every(Number.isFinite));
},productFace(id,points){
  counts.set(id,(counts.get(id)||0)+1);
  assert.equal(points.length,4);
  assert(points.flat().every(Number.isFinite));
  const centerX=points.reduce((sum,p)=>sum+p[0],0)/4+6000;
  const centerZ=(points[0][2]+points[1][2])/2;
  // Read artwork from the reachable aisle on either side, never from the shelf.
  if(points.every(p=>p[1]===points[0][1])) {
    assert(points[0][1]>9,'Frozen packages must be visible near the top of the chest');
    assert(sale.canWalk(sale.freezer.x+(sale.freezer.x<0 ? 20 : -20),centerZ),'Frozen stock must have an accessible viewing aisle');
  } else {
    const normalX=-(points[1][2]-points[0][2])*(points[2][1]-points[1][1]);
    const normalZ=(points[1][0]-points[0][0])*(points[2][1]-points[1][1]);
    // Stock behind the staffed checkout is reached from the staff side.
    if(!(centerZ>104 && centerX<-22))
      assert(sale.canWalk(centerX+Math.sign(normalX)*9,centerZ+Math.sign(normalZ)*9),
        'Stock must face a reachable aisle: '+id+' at '+centerX+','+centerZ);
  }
}});
assert.equal(counts.size,40);
assert(!counts.has('omena'),'Loose apples must use rounded geometry rather than box artwork');
for(const product of sale.products){
  if(product.id!=='omena') assert(counts.get(product.id)>0,`Missing shelf stock: ${product.name}`);
  if(product.candyLabel || product.packageLabel) continue; // Original wrappers are rendered directly on canvas.
  const filename=product.image || `assets/${product.id}.jpg`;
  const image=fs.readFileSync(path.join(root,filename));
  if(filename.endsWith('.jpg')) assert.equal(image.readUInt16BE(0),0xffd8,`Invalid JPEG: ${product.name}`);
  else if(filename.endsWith('.png')) assert.equal(image.toString('hex',0,8),'89504e470d0a1a0a');
  else assert.equal(image.toString('ascii',8,12),'WEBP');
}
for(const id of ['aino-maitosuklaa','pingviini-suklaatuutit','eskimo-vanilja','pingviini-vanilja'])
  assert.equal(counts.get(id),4,'Every ice cream variety must fill its own basket');
for(const [x,z] of [[-79,-85],[-69,-110],[-79,-70]]) assert.equal(sale.canWalk(x,z),false);
for(const [x,z] of [[45,-100],[45,-40],[20,95],[58,95],[35,135]]) assert(sale.canWalk(x,z));
console.log('PASS: product artwork, stocked freezer baskets and accessible aisles');
assert(displayQuads>1000,'Banana display must contain curved 3D fruit');
assert.equal(sale.canWalk(-3,102),false,'Banana stand must block walking through it');
for(const x of [-23,17]) assert(sale.canWalk(x,102),'Banana stand side aisles remain open');
assert(boxes.some(([x,y,z,w,h])=>x===-6003 && y===13 && z===90 && h===7),
  'Compact banana stand must have a low back sign');
for(const x of [-72,-50,-28]) for(const z of [110,119,128]) {
  assert.equal(sale.canWalk(x,z),false,'Checkout must block walking across its footprint');
}
assert.equal(sale.canWalk(-50,136),false,'Cashier must block walking through their body');
for(const [x,z] of [[-50,103],[-20,119],[35,135],[-70,99]]) {
  assert(sale.canWalk(x,z),'Customer approach and routes around checkout must remain open');
}
assert(boxes.some(([x,y,z,w,h])=>x===-6050 && y===26 && z===133 && h===8),
  'Cashier head must be visible above the checkout');
console.log('PASS: visible cashier, solid checkout and accessible customer routes');

// Moving inward decreases Z: each department follows the requested sequence.
const productPositions=new Map();
sale.buildInterior({box(){},productFace(id,points){
  if(!productPositions.has(id)) productPositions.set(id,[]);
  productPositions.get(id).push(points.reduce((sum,p)=>sum+p[2],0)/4);
}});
const averageZ=id=>productPositions.get(id).reduce((a,b)=>a+b,0)/productPositions.get(id).length;
assert(sale.shelves[0].products.includes('riisi'),'Entrance-side shelving must contain dry groceries');
assert(averageZ('croissant')>averageZ('hk-sininen'),'Small bakery section precedes chilled meat');
const chilledZ=['hk-sininen','snellman-nakki','lihapiirakka'].reduce((sum,id)=>sum+averageZ(id),0)/3;
const drinksZ=['hartwall-vichy','coca-cola','ekstroms-vadelma','marli-juissi','megaforce','karjala'].reduce((sum,id)=>sum+averageZ(id),0)/6;
assert(chilledZ>drinksZ,'Chilled meat precedes the drinks section');
assert(averageZ('remix')>averageZ('megaforce'),'Candy must be after drinks on the return towards checkout');
assert(averageZ('megaforce')>sale.freezer.z);
assert(boxes.some(([x,y,z,w,h,d])=>x===-6003 && y===0 && z===102 && w===18 && h===9 && d===24));
for(let z=135;z>=-135;z-=5) assert(sale.canWalk(45,z),'Main aisle must stay open from entrance to sweets and ice cream');
console.log('PASS: compact entrance produce display, department order and clear main aisle');

for(const id of ['hartwall-vichy','coca-cola','ekstroms-vadelma','marli-juissi'])
  assert(counts.get(id)>=6,'New drinks must fill shelves: '+id);
// Only the exposed ends carry endcaps; middle sections join directly.
for(const endZ of [-121.32,61.32]) {
  let endStock=0;
  sale.buildInterior({box(){},productFace(id,points){
    if(points.every(p=>p[2]===points[0][2]) && Math.abs(points[0][2]-endZ)<.01) endStock++;
  }});
  assert(endStock>=20,'Exposed end displays must be fully stocked');
}
assert.equal(sale.canWalk(-80,81),false,'Bottle-return machine must be solid');
assert(sale.canWalk(-64,81),'Bottle-return machine must have a clear approach');
assert(boxes.some(([x,y,z,w,h,d])=>x===-6088 && y===0 && z===0 && h===34 && d===32),'Staff door must be present');
console.log('PASS: four new drinks, filled endcaps, wall stock, staff door and bottle return');

// A single central shelf bank makes two continuous lanes and a turn at the rear.
assert(sale.shelves.every(shelf=>shelf.x===-3),'Shelves must form one central bank');
for(let z=135;z>=-130;z-=5) assert(sale.canWalk(45,z),'Right entry aisle must be continuous');
for(let z=100;z>=-130;z-=5) assert(sale.canWalk(-52,z),'Left return aisle must be continuous');
for(let x=-52;x<=45;x+=5) assert(sale.canWalk(x,-130),'Rear crossover must connect both aisles');
for(let x=-52;x<=-20;x+=5) assert(sale.canWalk(x,100),'Return aisle must reach checkout');
for(let z=100;z<=139;z+=3) assert(sale.canWalk(-20,z),'Checkout approach must connect to left exit');
assert(boxes.some(([x,y,z,w,h])=>x===-6008 && y===0 && z===149 && w===24 && h===34),'Left exit must be separate from the right entry');
console.log('PASS: two aisles, rear crossover, checkout route and separate exit');

const candyFaces=[];
sale.buildInterior({box(){},productFace(id,points){
  if(sale.products.find(product=>product.id===id)?.candyLabel) candyFaces.push({id,points});
}});
for(const product of sale.products.filter(product=>product.candyLabel))
  assert(counts.get(product.id)>=4,'Candy varieties must appear across the dense peg displays');
for(const {points} of candyFaces) {
  const width=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  assert(width(points[2],points[3])<width(points[0],points[1]),'Pouches must pinch inward at the upper seal');
}
assert(boxes.filter(([, , ,w,h,d])=>w===.24 && h===.3 && d===.04 || w===.04 && h===.3 && d===.24).length>400,
  'Candy racks must have a densely perforated backing');
console.log('PASS: varied hanging candy pouches and perforated rack backing');

assert(sale.freezer.x<0,'Ice cream must be against the left wall');
let standBananas=0,centralDrinks=0,centralCandy=0;
const drinkIds=['hartwall-vichy','coca-cola','ekstroms-vadelma','marli-juissi','megaforce','karjala'];
sale.buildInterior({box(){},productFace(id,points){
  const x=points.reduce((sum,p)=>sum+p[0],0)/4+6000;
  const z=points.reduce((sum,p)=>sum+p[2],0)/4;
  if(id==='banaani') { assert(Math.abs(x+3)<12 && Math.abs(z-102)<12,'Bananas must only appear on their own stand');standBananas++; }
  if(points.every(p=>p[0]===points[0][0]) && Math.abs(x)<50) {
    if(drinkIds.includes(id)) { assert(x<-3,'Central drinks must face the left aisle');centralDrinks++; }
    if(sale.products.find(p=>p.id===id)?.candyLabel || id==='remix') {
      assert(x<-3,'Central candy must face the left aisle');centralCandy++;
    }
  }
}});
assert.equal(standBananas,2);
assert(centralDrinks>0 && centralCandy>0);
assert(!counts.has('omena'),'Apples must remain loose fruit on their dedicated stand');
console.log('PASS: left-wall freezer, left-facing drinks and candy, produce only on stands');

for(let z=-120;z<=60;z+=3) for(const x of [-35,-15,0,20,30])
  assert.equal(sale.canWalk(x,z),false,'Continuous shelving must prevent crossing between the two aisles');
for(const z of [-110,-65,-30,0,30,55]) {
  assert(sale.canWalk(45,z) && sale.canWalk(-52,z),'Both narrow aisles must remain passable');
  assert(!sale.canWalk(30,z) && !sale.canWalk(-35,z),'Aisle width must be limited by the broad shelving run');
}
console.log('PASS: continuous shelving, no island gaps and two narrow aisles');

sale.buildInterior({box(){},productFace(id,points){
  if(id==='remix' || id==='fazer-sininen' || sale.products.find(p=>p.id===id)?.candyLabel) {
    const x=points.reduce((sum,p)=>sum+p[0],0)/4+6000;
    const z=points.reduce((sum,p)=>sum+p[2],0)/4;
    assert(x<-3 && z>=0 && z<=60,'Candy must only be on the final left-facing section nearest checkout');
  }
}});
console.log('PASS: all candy is confined to the final shelf before checkout');

const pastries=['croissant','nakkipiilo'],biscuits=['doris','jaffa'];
sale.buildInterior({box(){},productFace(id,points){
  if(!pastries.includes(id) && !biscuits.includes(id)) return;
  const x=points.reduce((sum,p)=>sum+p[0],0)/4+6000;
  const z=points.reduce((sum,p)=>sum+p[2],0)/4;
  if(Math.abs(x)<50 && points.every(p=>p[0]===points[0][0])) {
    if(pastries.includes(id)) assert(z>=0,'Pastries must stay in their entrance-side shelf section');
    if(biscuits.includes(id)) assert(z<0,'Biscuits must stay in separate shelf sections beyond pastries');
  }
}});
assert(sale.shelves.every(shelf=>!(shelf.products.some(id=>pastries.includes(id)) && shelf.products.some(id=>biscuits.includes(id)))),
  'Shelf sections must never mix pastries and biscuits');
console.log('PASS: pastries and biscuits occupy separate shelf sections');

assert.equal(counts.get('doris'),4,'Doris must occupy just one four-level facing');
assert.equal(counts.get('jaffa'),4,'Jaffa must occupy just one four-level facing');
const stapleIds=['riisi','pasta','kaurahiutaleet','kahvi','tee','tomaattimurska','hernekeitto','maito','jogurtti','juusto','ruisleipa','paahtoleipa','talouspaperi','astianpesuaine'];
for(const id of stapleIds) assert(counts.get(id)>0,'Basic groceries must be stocked: '+id);
assert(stapleIds.reduce((sum,id)=>sum+counts.get(id),0)>10*(counts.get('doris')+counts.get('jaffa')),
  'General groceries must dominate the assortment rather than biscuits');
console.log('PASS: one small biscuit bay and a varied everyday grocery assortment');
