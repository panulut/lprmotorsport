const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {root,gameFiles,readDocument,dataScript}=require('./scripts/build.cjs');
const {validate,maxDocumentBytes}=require('./shared/track-document.js');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
function createServer({production=false}={}) {
  const base=production?path.join(root,'dist'):root;
  let allowed=new Set([...gameFiles,'shared/track-document.js','shared/track-objects.js','data/track-objects.json']);
  let manifestStamp=fs.statSync(path.join(root,'scripts/build.cjs')).mtimeMs;
  if(!production)for(const name of ['editor.html','editor.js','editor.css'])allowed.add(`tools/track-editor/${name}`);
  return http.createServer(async(request,response)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;
    const reply=(code,text)=>{response.writeHead(code,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});response.end(text);};
    if(pathname==='/api/dev/track-objects') {
      if(production)return reply(404,'Not found');
      if(request.method!=='PUT')return reply(405,'Method not allowed');
      // Browser writes must originate from this local development server.
      let origin;
      try{origin=new URL(request.headers.origin);}catch{return reply(403,'Local editor only');}
      const localHosts=new Set(['localhost','127.0.0.1','[::1]']);
      if(origin.protocol!=='http:' || origin.host!==request.headers.host || !localHosts.has(origin.hostname) || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress))return reply(403,'Local editor only');
      if(request.headers['content-type']!=='application/json')return reply(415,'Expected application/json');
      try {
        let body='';let size=0;
        for await(const chunk of request){size+=chunk.length;if(size>maxDocumentBytes)return reply(413,'File too large');body+=chunk.toString();}
        const doc={version:1,objects:validate(JSON.parse(body))};
        const file=path.join(root,'data/track-objects.json');
        const temporary=path.join(root,`data/.track-objects-${randomUUID()}.tmp`);
        try{
          fs.writeFileSync(temporary,JSON.stringify(doc,null,2)+'\n');
          fs.renameSync(temporary,file);
        }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
        return reply(200,'Saved');
      } catch(error){return reply(400,error.message);}
    }
    if(!['GET','HEAD'].includes(request.method))return reply(405,'Method not allowed');
    if(pathname==='/verification/revision.js') {
      response.writeHead(200,{'Content-Type':mime['.js'],'Cache-Control':'no-store'});
      return response.end(production?fs.readFileSync(path.join(base,'verification/revision.js')):`window.LPRDrivingRevision=${JSON.stringify(require('./verification/world.cjs').revision)};`);
    }
    if(!production && pathname==='/data/track-data.js') {
      try{response.writeHead(200,{'Content-Type':mime['.js'],'Cache-Control':'no-store'});return response.end(request.method==='HEAD'?undefined:dataScript(readDocument()));}catch(e){return reply(500,e.message);}
    }
    const name=pathname==='/'?'index.html':pathname.slice(1);
    if(!production){
      const stamp=fs.statSync(path.join(root,'scripts/build.cjs')).mtimeMs;
      if(stamp!==manifestStamp){
        delete require.cache[require.resolve('./scripts/build.cjs')];
        const current=require('./scripts/build.cjs');
        allowed=new Set([...current.gameFiles,'shared/track-document.js','shared/track-objects.js','data/track-objects.json',
          ...['editor.html','editor.js','editor.css'].map(file=>`tools/track-editor/${file}`)]);
        manifestStamp=stamp;
      }
    }
    const asset=/^assets\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(name);
    if(!allowed.has(name)&&!asset&&!(production&&name==='data/track-data.js'))return reply(404,'Not found');
    const file=path.join(base,name);
    if(!fs.existsSync(file)||!fs.statSync(file).isFile())return reply(404,'Not found');
    response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    if(request.method==='HEAD')return response.end();
    fs.createReadStream(file).pipe(response);
  });
}
module.exports={createServer};
if(require.main===module){
  const production=process.argv.includes('--production'),port=Number(process.env.PORT)||8000;
  if(production&&!fs.existsSync(path.join(root,'dist/index.html')))throw Error('Run npm run build first.');
  createServer({production}).listen(port,'127.0.0.1',()=>{
    console.log(`Peli: http://localhost:${port}`);
    if(!production)console.log(`Kehitystyökalu: http://localhost:${port}/tools/track-editor/editor.html`);
  });
}
