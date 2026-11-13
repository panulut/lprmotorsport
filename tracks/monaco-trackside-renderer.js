/* Texture drawing/lifecycle only. Geometry is authored by monaco-trackside.js.
 * Loaded AFTER monaco-f1-renderer.js to preserve its cockpit/car subclass.
 */
(function(root){
 'use strict';
 root.LPRRenderer3D=class MonacoTracksideRenderer extends root.LPRRenderer3D {
  makeWorld(){
   this.releaseMonacoBoards();
   // Scene rebuilds also occur when rotating/resizing across 650 px. Release
   // the previous static uploads; retain the F1 car, shaders and dynamic buffers.
   const old=[{buffer:this.buffer,spatial:this.worldSpatial},{buffer:this.shadowBuffer,spatial:this.shadowSpatial},this.kerbMesh,this.roadPaintMesh,...(this.materialMeshes||[])];
   for(const mesh of old){if(!mesh)continue;if(mesh.buffer)this.gl.deleteBuffer(mesh.buffer);if(mesh.texture)this.gl.deleteTexture(mesh.texture);for(const chunk of mesh.spatial?.chunks||[])this.gl.deleteBuffer(chunk.buffer);}
   super.makeWorld();
   const scene=root.LPRMonacoTrackside?.scene;
   if(!scene||typeof document==='undefined')return;
   this.makeMonacoBoards(scene);
  }
  releaseMonacoBoards(){
   const mesh=this.monacoBoards;if(!mesh)return;
   this.gl.deleteBuffer(mesh.buffer);this.gl.deleteTexture(mesh.texture);
   for(const chunk of mesh.spatial?.chunks||[])this.gl.deleteBuffer(chunk.buffer);
   this.monacoBoards=null;
  }
  makeMonacoBoards(scene){
   const gl=this.gl,{atlas}=scene,canvas=document.createElement('canvas');
   canvas.width=atlas.width;canvas.height=atlas.height;
   const ctx=canvas.getContext('2d');if(!ctx)return;
   const mesh={buffer:gl.createBuffer(),texture:gl.createTexture(),count:scene.boardVertices.length/8,canvas,atlas,mobile:scene.mobile};
   this.monacoBoards=mesh;
   gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(scene.boardVertices),gl.STATIC_DRAW);
   mesh.spatial=this.makeSpatialMesh(scene.boardVertices,8);
   const upload=()=>{
    // Ignore callbacks belonging to a replaced world/GL context.
    if(this.monacoBoards!==mesh||gl.isContextLost?.())return;
    gl.bindTexture(gl.TEXTURE_2D,mesh.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
   };
   for(const [i,sponsor] of root.LPRMonacoSponsors.entries()){
    const tile=atlas.tiles[i];ctx.fillStyle=sponsor.background;ctx.fillRect(tile.x,tile.y,tile.width,tile.height);
    ctx.fillStyle=sponsor.foreground;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 92px Arial, sans-serif';
    // Same generous inset for every sponsor, including the longer LPR wordmark.
    ctx.fillText(sponsor.name,tile.x+512,tile.y+127,840);
    ctx.fillRect(tile.x+84,tile.y+202,856,5);
   }
   upload();
   let pending=root.LPRMonacoSponsors.filter(s=>s.image).length;
   const completed=()=>{if(--pending===0)upload();};
   for(const [i,sponsor] of root.LPRMonacoSponsors.entries()){
    if(!sponsor.image)continue;
    const image=new Image();image.onload=()=>{
     if(this.monacoBoards!==mesh)return;
     const tile=atlas.tiles[i],x=tile.x+32,y=tile.y+8,w=960,h=240;
     ctx.fillStyle=sponsor.background;ctx.fillRect(tile.x,tile.y,tile.width,tile.height);
     ctx.drawImage(image,x,y,w,h);
     // Extrude the artwork's outer pixels into mipmap gutters; no atlas seams.
     const iw=image.naturalWidth,ih=image.naturalHeight;
     ctx.drawImage(image,0,0,iw,1,x,tile.y,w,8);ctx.drawImage(image,0,ih-1,iw,1,x,y+h,w,8);
     ctx.drawImage(image,0,0,1,ih,tile.x,y,32,h);ctx.drawImage(image,iw-1,0,1,ih,x+w,y,32,h);
     completed();
    };
    image.onerror=completed; // Keep the wordmark on missing/broken artwork.
    image.src=sponsor.image;
   }
  }
  resize(){
   super.resize();
   // Rebuild only when crossing the density boundary, never per frame/person.
   if(this.monacoBoards&&this.monacoBoards.mobile!==((root.innerWidth||1024)<650))this.makeWorld();
  }
  drawRoadPaint(){
   super.drawRoadPaint();
   this.drawKerbs(this.monacoBoards,6);
  }
 };
})(window);
