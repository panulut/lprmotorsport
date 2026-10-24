// Conservative broad phase; preserves obstacle order for collision tie-breaking.
(function(root){
 function createCollisionIndex(bounds,cellSize=160){
  const cells=new Map(),dynamic=[],order=new Map();
  bounds.forEach((b,i)=>{
   order.set(b,i);
   if(b.body&&Number.isFinite(b.body.mass)){dynamic.push(b);return;}
   const x=(b.minX+b.maxX)/2,y=(b.minY+b.maxY)/2,r=Math.hypot(b.maxX-b.minX,b.maxY-b.minY)/2;
   for(let cx=Math.floor((x-r)/cellSize);cx<=Math.floor((x+r)/cellSize);cx++)
    for(let cy=Math.floor((y-r)/cellSize);cy<=Math.floor((y+r)/cellSize);cy++){
     const key=cx+','+cy;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(b);
    }
  });
  return function query(x0,y0,x1,y1,padding){
   const candidates=new Set(dynamic);
   for(let cx=Math.floor((Math.min(x0,x1)-padding)/cellSize);cx<=Math.floor((Math.max(x0,x1)+padding)/cellSize);cx++)
    for(let cy=Math.floor((Math.min(y0,y1)-padding)/cellSize);cy<=Math.floor((Math.max(y0,y1)+padding)/cellSize);cy++)
     for(const b of cells.get(cx+','+cy)||[])candidates.add(b);
   return [...candidates].sort((a,b)=>order.get(a)-order.get(b));
  };
 }
 root.LPRCreateCollisionIndex=createCollisionIndex;
 if(typeof module==='object')module.exports=createCollisionIndex;
})(typeof window==='object'?window:globalThis);
