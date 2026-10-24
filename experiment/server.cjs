// Isolated feasibility service. Never writes to the leaderboard.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {Worker}=require('node:worker_threads');
const {browserBundle,validateReplay,revision,hz}=require('../scripts/lib/replay-probe.cjs');
const {timingSafeEqual}=require('node:crypto');
const {Sessions}=require('./sessions.cjs');
function createServer({publicMode=false,token=process.env.LAB_TOKEN,sessionsOptions={}}={}) {
  if(publicMode&&(!token||token.length<32))throw Error('Public experiment requires LAB_TOKEN of at least 32 characters');
  const bundle=browserBundle(),sessions=new Sessions(sessionsOptions);let active=0;
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const reply=(code,value)=>{if(res.destroyed)return;res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    if(req.method==='GET'&&url.pathname==='/health')return reply(200,{ready:true,experiment:true,revision,hz,active:active+sessions.activeCount,streaming:true,activeSessions:sessions.activeCount});
    const files={'/':['index.html','text/html; charset=utf-8'],'/lab.js':['lab.js','text/javascript; charset=utf-8'],'/live-client.js':['live-client.js','text/javascript; charset=utf-8']};
    if(req.method==='GET'&&(files[url.pathname]||url.pathname==='/simulation.js')){
      const item=files[url.pathname];res.writeHead(200,{'Content-Type':item?item[1]:'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      return res.end(item?fs.readFileSync(path.join(__dirname,item[0])):bundle);
    }
    const sessionRoute=url.pathname.match(/^\/sessions\/([a-f0-9]{32})(\/inputs)?$/);
    const creating=url.pathname==='/sessions',legacy=url.pathname==='/verify';
    if(!creating&&!legacy&&!sessionRoute)return reply(404,{error:'Not found'});
    if(req.headers.origin&&req.headers.origin!==`${publicMode?'https':'http'}://${req.headers.host}`)return reply(403,{error:'Origin denied'});
    if((creating||legacy)&&publicMode){const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
      if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply(401,{error:'Invalid experiment token'});}
    if(creating||sessionRoute){
      try{
        if(creating){
          if(req.method!=='POST')return reply(405,{error:'POST required'});
          if(active+sessions.activeCount>=2)return reply(429,{error:'Experiment busy; retry later'});
          const data=await readJSON(req,16384);
          if(active+sessions.activeCount>=2)return reply(429,{error:'Experiment busy; retry later'});
          return reply(201,await sessions.create(data.revision));
        }
        const credential=req.headers.authorization?.replace(/^Bearer /,'');
        if(!sessionRoute[2]){
          if(req.method==='DELETE')return reply(200,sessions.cancel(sessionRoute[1],credential));
          if(req.method==='GET'){const s=sessions.owned(sessionRoute[1],credential);return reply(200,{phase:s.phase,ackTick:s.ticks,reason:s.reason});}
          return reply(405,{error:'Method not allowed'});
        }
        if(req.method!=='POST')return reply(405,{error:'POST required'});
        // Check ownership before reading or processing a batch.
        sessions.owned(sessionRoute[1],credential);
        return reply(200,await sessions.batch(sessionRoute[1],credential,await readJSON(req,16384)));
      }catch(error){return reply(error.status||400,{error:error.message,code:error.code,retryable:!!error.retryable,retryAfterMs:error.retryAfterMs});}
    }
    if(req.method!=='POST')return reply(405,{error:'POST required'});
    if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON required'});
    if(active+sessions.activeCount>=2)return reply(429,{error:'Experiment busy; retry later'});
    active++;let worker,timer;
    try {
      const chunks=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>2*1024*1024)return reply(413,{error:'Replay too large'});chunks.push(chunk);}
      const replay=JSON.parse(Buffer.concat(chunks).toString());validateReplay(replay);
      worker=new Worker(path.join(__dirname,'verify-worker.cjs'),{workerData:replay,resourceLimits:{maxOldGenerationSizeMb:128}});
      const result=await new Promise((resolve,reject)=>{
        timer=setTimeout(()=>reject(Error('Verification time budget exceeded')),60000);
        worker.once('message',m=>m.error?reject(Error(m.error)):resolve(m));worker.once('error',reject);
        worker.once('exit',code=>{if(code)reject(Error('Verification worker stopped'));});
      });
      reply(200,{...result,experiment:true,leaderboardSaved:false});
    }catch(error){reply(422,{error:error.message});}
    finally{clearTimeout(timer);if(worker)await worker.terminate();active--;}
  });
  server.on('close',()=>void sessions.close());
  return server;
}
async function readJSON(req,max){
 if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('JSON required'),{status:415});
 const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>max)throw Object.assign(Error('Batch too large'),{status:413});chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw Object.assign(Error('Invalid JSON'),{status:400});}
}
module.exports={createServer};
if(require.main===module){const publicMode=process.env.LAB_PUBLIC==='1';const server=createServer({publicMode});server.requestTimeout=15000;
  server.listen(Number(process.env.PORT)||8080,publicMode?'0.0.0.0':'127.0.0.1',()=>console.log('Replay experiment on port '+server.address().port));}
