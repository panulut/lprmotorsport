const http=require('node:http');
const {timingSafeEqual}=require('node:crypto');
const {Sessions}=require('./sessions.cjs');
const {createCapacityReporter}=require('./capacity-reporter.cjs');
const {revision}=require('./world.cjs');
const {createChat}=require('./chat.cjs');
async function createServer({secret=process.env.VERIFICATION_SECRET,origins=[],sessionsOptions={},metricsToken=process.env.VERIFICATION_METRICS_TOKEN,capacityReportURL=process.env.CAPACITY_REPORT_URL,chatStorageURL=process.env.CHAT_STORAGE_URL}={}) {
 validateAzureTestConfiguration({secret,metricsToken,capacityReportURL,chatStorageURL});
 const {sign,verify,protocol,validPlayer,validName}=await import('./protocol.mjs');
 if(typeof secret!=='string'||secret.length<32)throw Error('VERIFICATION_SECRET must contain at least 32 characters');
 const reporter=createCapacityReporter({url:capacityReportURL,token:metricsToken});
 const used=new Map();
 const lapLagMs=Number(process.env.VERIFICATION_LAP_LAG_MS??2000);
 if(!Number.isSafeInteger(lapLagMs)||lapLagMs<1||lapLagMs>16000)throw Error('VERIFICATION_LAP_LAG_MS must be an integer from 1 to 16000');
 const sessions=new Sessions({lapLagMs,workerCount:Number(process.env.VERIFICATION_WORKERS||1),workerHeapMb:Number(process.env.VERIFICATION_WORKER_HEAP_MB||256),maxSessions:Number(process.env.MAX_VERIFIED_SESSIONS||2),maxStartsPerMinute:Number(process.env.MAX_VERIFIED_STARTS_PER_MINUTE||8),...sessionsOptions,onMetric:(key,count)=>reporter.record(key,count),signLap:async(s,lap)=>sign({kind:'lap',protocol,revision,
  sessionId:s.id,playerHash:s.identity.playerHash,nickname:s.identity.nickname,...lap,issuedAt:Date.now()},secret)});
 const allowed=new Set(origins);
 const chat=createChat({protocol});
 let activeConnections=0;
 const chatStorageURLParsed=chatStorageURL?new URL(chatStorageURL):null;
 if(chatStorageURLParsed&&chatStorageURLParsed.protocol!=='https:'&&
  !['localhost','127.0.0.1'].includes(chatStorageURLParsed.hostname))throw Error('CHAT_STORAGE_URL must use HTTPS');
 async function chatStorage(operation,message){
  if(!chatStorageURLParsed)return null;
  const now=Date.now();
  const token=await sign({kind:'chat-storage',operation,issuedAt:now,expiresAt:now+30000,...(message?{message}:{})},secret);
  let response;
  try{
   response=await fetch(chatStorageURLParsed,{method:operation==='write'?'POST':'GET',
    headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();
   if(operation==='read'&&(!Array.isArray(data.messages)||data.messages.length>100||
    !data.messages.every(row=>typeof row?.id==='string'&&typeof row.nickname==='string'&&typeof row.text==='string'&&Number.isSafeInteger(row.at))))
    throw Error('Invalid chat history');
   return data;
  }catch(error){
   console.error('Chat storage request failed',operation,error.message);
   throw fail(503,'Chat storage unavailable');
  }
 }
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  if(allowed.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(code,data)=>{if(!res.destroyed){res.writeHead(code,headers);res.end(JSON.stringify(data));}};
  if(origin&&!allowed.has(origin))return reply(403,{error:'Origin denied'});
  if(req.method==='OPTIONS'){res.writeHead(204,{...headers,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'});return res.end();}
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return reply(200,{ready:true,protocol,revision,hz:120,streaming:true,activeSessions:sessions.activeCount,activeConnections,maxSessions:sessions.maxSessions,lapLagMs:sessions.lapLagMs});
  if(req.method==='GET'&&url.pathname==='/metrics'){
   if(typeof metricsToken!=='string'||metricsToken.length<32)return reply(404,{error:'Not found'});
   const expected=Buffer.from(metricsToken),provided=Buffer.from(req.headers.authorization?.replace(/^Bearer /,'')||'');
   if(expected.length!==provided.length||!timingSafeEqual(expected,provided))return reply(401,{error:'Unauthorized'});
   return reply(200,{...sessions.snapshotMetrics(),activeConnections});
  }
  const route=url.pathname.match(/^\/sessions\/([a-f0-9]{32})(\/inputs|\/start)?$/);
  try{
   if(url.pathname==='/spectate'||/^\/spectate\/[a-f0-9]{32}$/.test(url.pathname)){
    if(req.method!=='GET')return reply(405,{error:'Method not allowed'});
    return reply(200,sessions.spectators(url.pathname.split('/')[2]));
   }
   if(url.pathname==='/api/chat/presence'){
    if(req.method!=='GET')return reply(405,{error:'Method not allowed'});
    return reply(200,chat.presence(url.searchParams.get('visitor')));
   }
   if(url.pathname==='/api/chat'){
    if(req.method==='GET')return reply(200,chatStorageURLParsed?await chatStorage('read'):chat.list());
    if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
    // Trust the connecting socket; client-supplied forwarding headers can be forged.
    const data=await readJSON(req,2048);
    let identity;try{identity=await verify(req.headers.authorization?.replace(/^Bearer /,''),secret);}catch{throw fail(401,'Sign in required');}
    const result=chat.post(identity,req.socket.remoteAddress||'unknown',data);
    try{if(chatStorageURLParsed)await chatStorage('write',result.message);}
    catch(error){chat.discard(result.message.id);throw error;}
    return reply(201,result);
   }
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
  }catch(error){
   const status=error.status||500;
   if(status>=500)console.error(JSON.stringify({level:'error',event:'verification.request.failed',method:req.method,path:url.pathname,status,code:error.code||'internal'}));
   reply(status,{error:error.status?error.message:'Verification unavailable',code:error.code,retryable:!!error.retryable,retryAfterMs:error.retryAfterMs});
  }
 });
 server.on('connection',socket=>{activeConnections++;socket.once('close',()=>{activeConnections--;});});
 server.requestTimeout=15000;
 server.on('close',()=>{void sessions.close();void reporter.close();});
 server.capacityReporter=reporter;
 server.sessions=sessions;
 return server;
}
function fail(status,message){return Object.assign(Error(message),{status});}
function validateAzureTestConfiguration({secret,metricsToken,capacityReportURL,chatStorageURL}){
 if(process.env.VERIFICATION_ENVIRONMENT!=='azure-test')return;
 if(process.env.VERIFICATION_PUBLIC!=='1'||process.env.PORT!=='8081')throw Error('Azure test startup requires VERIFICATION_PUBLIC=1 and PORT=8081');
 if(typeof secret!=='string'||secret.length<32)throw Error('Azure test startup requires a dedicated VERIFICATION_SECRET of at least 32 characters');
 if(typeof metricsToken!=='string'||metricsToken.length<32)throw Error('Azure test startup requires VERIFICATION_METRICS_TOKEN of at least 32 characters');
 if(capacityReportURL||chatStorageURL)throw Error('Azure test startup forbids external capacity and chat storage integrations');
 const maxSessions=Number(process.env.MAX_VERIFIED_SESSIONS??2);
 if(!Number.isSafeInteger(maxSessions)||maxSessions<1||maxSessions>100)throw Error('MAX_VERIFIED_SESSIONS must be an integer from 1 to 100');
 const maxStartsPerMinute=Number(process.env.MAX_VERIFIED_STARTS_PER_MINUTE??8);
 if(!Number.isSafeInteger(maxStartsPerMinute)||maxStartsPerMinute<1||maxStartsPerMinute>256)
  throw Error('MAX_VERIFIED_STARTS_PER_MINUTE must be an integer from 1 to 256');
 const origins=(process.env.GAME_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean);
 if(!origins.length)throw Error('Azure test startup requires at least one test GAME_ORIGINS origin');
 for(const origin of origins){
  let parsed;
  try{parsed=new URL(origin);}catch{throw Error('GAME_ORIGINS must contain valid origins');}
  const hostname=parsed.hostname.toLowerCase();
  const azureTestOrigin=parsed.protocol==='https:'&&parsed.origin===origin&&
   ['azurecontainerapps.io','azurewebsites.net','azurestaticapps.net'].some(domain=>hostname.endsWith('.'+domain));
  if(!azureTestOrigin)throw Error('Azure test startup allows only HTTPS Azure test origins');
 }
}
async function readJSON(req,maxBytes=16384){
 if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'JSON required');
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>maxBytes)throw fail(413,'Body too large');chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail(400,'Invalid JSON');}
}
module.exports={createServer};
if(require.main===module)createServer({origins:(process.env.GAME_ORIGINS||'http://localhost:8000,http://127.0.0.1:8000').split(',')})
 .then(server=>{
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;console.log(JSON.stringify({level:'info',event:'verification.server.stopping'}));server.close();await server.sessions.close();await server.capacityReporter.close();};
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void stop().catch(error=>{console.error(JSON.stringify({level:'error',event:'verification.server.shutdown_failed',error:error.message}));process.exitCode=1;});});
  server.on('error',error=>{console.error(JSON.stringify({level:'error',event:'verification.server.failed',code:error.code||'unknown'}));if(!server.listening)process.exitCode=1;});
  server.listen(Number(process.env.PORT)||8081,process.env.VERIFICATION_PUBLIC==='1'?'0.0.0.0':'127.0.0.1',()=>console.log(JSON.stringify({level:'info',event:'verification.server.listening',port:server.address().port,public:process.env.VERIFICATION_PUBLIC==='1'})));
 })
 .catch(error=>{console.error(JSON.stringify({level:'error',event:'verification.server.startup_failed',error:error.message}));process.exitCode=1;});
