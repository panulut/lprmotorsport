const http=require('node:http');
const {Sessions}=require('./sessions.cjs');
const {revision}=require('./world.cjs');
async function createServer({secret=process.env.VERIFICATION_SECRET,origins=[],sessionsOptions={}}={}) {
 const {sign,verify,protocol,validPlayer,validName}=await import('./protocol.mjs');
 if(typeof secret!=='string'||secret.length<32)throw Error('VERIFICATION_SECRET must contain at least 32 characters');
 const used=new Map();
 const sessions=new Sessions({...sessionsOptions,signLap:async(s,lap)=>sign({kind:'lap',protocol,revision,
  sessionId:s.id,playerHash:s.identity.playerHash,nickname:s.identity.nickname,...lap,issuedAt:Date.now()},secret)});
 const allowed=new Set(origins);
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  if(allowed.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(code,data)=>{if(!res.destroyed){res.writeHead(code,headers);res.end(JSON.stringify(data));}};
  if(origin&&!allowed.has(origin))return reply(403,{error:'Origin denied'});
  if(req.method==='OPTIONS'){res.writeHead(204,{...headers,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'});return res.end();}
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return reply(200,{ready:true,protocol,revision,hz:120,streaming:true,activeSessions:sessions.activeCount});
  const route=url.pathname.match(/^\/sessions\/([a-f0-9]{32})(\/inputs|\/start)?$/);
  try{
   if(url.pathname==='/sessions'&&req.method==='POST'){
    const data=await readJSON(req),now=Date.now();
    let identity;try{identity=await verify(data.ticket,secret);}catch{throw fail(401,'Invalid start ticket');}
    if(identity.kind!=='start'||identity.protocol!==protocol||identity.revision!==revision||data.revision!==revision||
      !validPlayer(identity.playerHash)||!validName(identity.nickname)||!validPlayer(identity.nonce)||
      !Number.isSafeInteger(identity.issuedAt)||!Number.isSafeInteger(identity.expiresAt)||identity.issuedAt>now+5000||
      identity.expiresAt<now||identity.expiresAt-identity.issuedAt>120000)throw fail(401,'Expired or incompatible start ticket');
    for(const [nonce,item]of used)if(item.expiresAt<now)used.delete(nonce);
    const previous=used.get(identity.nonce);
    if(previous)return reply(201,await previous.promise);
    if(used.size>=128)throw fail(429,'Too many start tickets');
    const item={expiresAt:identity.expiresAt,promise:sessions.create(revision,identity,{armed:data.armed===true})};
    used.set(identity.nonce,item);
    // Retain failed nonces too: a ticket can never allocate a fresh timed session on retry.
    return reply(201,await item.promise);
   }
   if(!route)return reply(404,{error:'Not found'});
   const token=req.headers.authorization?.replace(/^Bearer /,'');
   const s=sessions.owned(route[1],token);
   if(route[2]==='/start'&&req.method==='POST')return reply(200,sessions.activate(s.id,token));
   if(route[2]==='/inputs'&&req.method==='POST')return reply(200,await sessions.batch(s.id,token,await readJSON(req)));
   if(!route[2]&&req.method==='DELETE')return reply(200,sessions.cancel(s.id,token));
   if(!route[2]&&req.method==='GET')return reply(200,{phase:s.phase,ackTick:s.ticks,reason:s.reason});
   return reply(405,{error:'Method not allowed'});
  }catch(error){reply(error.status||500,{error:error.status?error.message:'Verification unavailable',code:error.code,retryable:!!error.retryable,retryAfterMs:error.retryAfterMs});}
 });
 server.requestTimeout=15000;
 server.on('close',()=>{void sessions.close();});
 server.sessions=sessions;
 return server;
}
function fail(status,message){return Object.assign(Error(message),{status});}
async function readJSON(req){
 if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'JSON required');
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>16384)throw fail(413,'Body too large');chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail(400,'Invalid JSON');}
}
module.exports={createServer};
if(require.main===module)createServer({origins:(process.env.GAME_ORIGINS||'http://localhost:8000,http://127.0.0.1:8000').split(',')})
 .then(server=>server.listen(Number(process.env.PORT)||8081,process.env.VERIFICATION_PUBLIC==='1'?'0.0.0.0':'127.0.0.1',()=>console.log('Driving verification on port '+server.address().port)))
 .catch(error=>{console.error(error.message);process.exitCode=1;});
