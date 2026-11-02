// Development-only fixtures for the real game UI. These never run in production.
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,timingSafeEqual,createHash}=require('node:crypto');
const {revision}=require('../verification/world.cjs');

const protocol='driving-v1';
const sessions=new Map();
const chatTickets=new Map();
const fixtureAliases={'Mika Demo':'Mika Laine','Aino Example':'Aino Korhonen','Leo Sample':'Leo Nieminen'};
const displayName=value=>fixtureAliases[value]||value;
const chatMessages=[
 {id:'demo-chat-1',nickname:'Aino Korhonen',text:'Nice first sector!',at:Date.now()-180000},
 {id:'demo-chat-2',nickname:'Leo Nieminen',text:'Track is clear. Good luck!',at:Date.now()-90000}
];
const token=()=>randomBytes(32).toString('hex');
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const result=(status,body)=>({status,headers,body});
const safeName=value=>typeof value==='string'&&/^[\p{L}\p{N} _.-]{1,24}$/u.test(value.trim())&&!/\s\s/.test(value)?value.trim():null;
const validSeries=value=>value==='bot'?'bot':'human';
const accountToken=(name,password)=>createHash('sha256').update('lpr-local-demo\0'+name+'\0'+password).digest('hex');

function readEnvFile(file){
 const values={};
 if(!fs.existsSync(file))return values;
 for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
  const m=line.match(/^\s*(DEMO_DRIVER_NAME|DEMO_ACCOUNT_PASSWORD)\s*=\s*(.*?)\s*$/);
  if(!m)continue;
  let value=m[2];
  if(value.length>=2&&((value[0]==='"'&&value.at(-1)==='"')||(value[0]==="'"&&value.at(-1)==="'")))value=value.slice(1,-1);
  values[m[1]]=value;
 }
 return values;
}
function readBody(req){
 if(req.demoBody!==undefined)return Promise.resolve(typeof req.demoBody==='string'?JSON.parse(req.demoBody):req.demoBody);
 return new Promise((resolve,reject)=>{
  let text='';req.setEncoding('utf8');
  req.on('data',chunk=>{text+=chunk;if(text.length>8192){reject(Object.assign(Error('Body too large'),{status:413}));req.destroy();}});
  req.on('end',()=>{try{resolve(JSON.parse(text||'{}'));}catch{reject(Object.assign(Error('Invalid JSON'),{status:400}));}});
  req.on('error',reject);
 });
}
function currentDay(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function leaderboard(series,driverName='Mika Laine'){
 const names=series==='bot'?['Kide-7','Sisu','Kajo']:['Mika Laine','Aino Korhonen','Leo Nieminen','Sami Virtanen','Noora Mäkinen'];
 if(series!=='bot')names[0]=driverName;
 const times=series==='bot'?[81372,82110,83642]:[84508,85104,86772,87991,88340];
 return {protocol,revision,series,results:names.map((nickname,i)=>({nickname,lap_ms:times[i],session_id:'a'.repeat(31)+(i+1),lap:1,replay_available:false}))};
}
function championship(series,day,identity,driverName='Mika Laine'){
 const today=currentDay(),selected=/^\d{4}-\d{2}-\d{2}$/.test(day||'')?day:today;
 const names=series==='bot'?['Kide-7','Sisu','Kajo']:['Mika Laine','Aino Korhonen','Leo Nieminen'];
 if(series!=='bot')names[0]=driverName;
 const times=series==='bot'?[81372,82110,83642]:[84508,85104,86772];
 const fastest=names.map((nickname,i)=>({nickname,bestMs:times[i],speedRank:i+1}));
 const mostLaps=names.map((nickname,i)=>({nickname,laps:[27,19,12][i],volumeRank:i+1}));
 const monthly=names.map((nickname,i)=>({nickname,points:[46,32,21][i],rank:i+1}));
 const now=Date.now();
 return {mode:'demo-only',series,today,day:selected,month:selected.slice(0,7),final:false,serverNow:now,endsAt:now+6*60*60*1000,fastest,mostLaps,monthly,
  me:identity?{nickname:identity.nickname,series:identity.series,streak:4,bestStreak:8,todayLaps:3,activeToday:true,selectedDay:{points:12,activeToday:true,breakdown:{speed:10,volume:1,participation:1,milestones:0,streak:0}}}:null};
}

/**
 * Handle one local dev request; return null for non-demo routes.
 * The caller must first prove that the request came through its loopback-only dev server.
 * Pass the Node request and absolute .env path; JSON responses are `{status,headers,body}`.
 */
async function handleLocalDemoApi(req,envPath=path.resolve(__dirname,'../.env')){
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/api/verified/')&&!url.pathname.startsWith('/api/chat')&&url.pathname!=='/health'&&!url.pathname.startsWith('/spectate'))return null;
 const fileEnv=readEnvFile(envPath);
 // Read only the two preview keys; no other process or file environment values leave this module.
 const env={DEMO_DRIVER_NAME:process.env.DEMO_DRIVER_NAME??fileEnv.DEMO_DRIVER_NAME,
  DEMO_ACCOUNT_PASSWORD:process.env.DEMO_ACCOUNT_PASSWORD??fileEnv.DEMO_ACCOUNT_PASSWORD};
 const accountName=safeName(env.DEMO_DRIVER_NAME)||'Mika Demo';
 const driverName=displayName(accountName);
 const expectedPassword=typeof env.DEMO_ACCOUNT_PASSWORD==='string'&&env.DEMO_ACCOUNT_PASSWORD.length>=8?env.DEMO_ACCOUNT_PASSWORD:'demo1234';
 const seededToken=accountToken(accountName,expectedPassword);
 const identityFor=accessToken=>sessions.get(accessToken)||(accessToken===seededToken?{nickname:driverName,series:'human',expiresAt:Date.now()+7*86400000}:null);
 try{
  if(url.pathname==='/health'&&req.method==='GET')return result(200,{mode:'demo-only',protocol,revision,hz:120,streaming:true,activeSessions:0,maxSessions:2,lapLagMs:0});
  if(url.pathname==='/spectate'&&req.method==='GET')return result(200,{mode:'demo-only',results:[
   {id:'b'.repeat(32),watchId:'c'.repeat(32),nickname:'Aino Korhonen'},
   {id:'d'.repeat(32),watchId:'e'.repeat(32),nickname:'Leo Nieminen'}
  ]});
  const spectate=url.pathname.match(/^\/spectate\/([a-f0-9]{32})$/);
  if(spectate&&req.method==='GET'){
   const row=spectate[1]==='b'.repeat(32)?'Aino Korhonen':spectate[1]==='d'.repeat(32)?'Leo Nieminen':null;
   if(!row)return result(404,{error:'Unknown demo driver'});
   const seed=row==='Aino Korhonen'?0:Math.PI/2,tick=Math.floor(Date.now()*0.12),pose={steerAngle:0,damage:0,impactSide:0,bodySlip:0,lateralG:0,longitudinalG:0,tireUse:0,offroad:false,tcActive:false,tcEnabled:true};
   const frame=(t,angle)=>[t,Math.cos(angle)*18,Math.sin(angle)*18,angle,Math.cos(angle+.15)*12,Math.sin(angle+.15)*12,pose];
   return result(200,{mode:'demo-only',nickname:row,sceneRevision:revision,hz:120,frames:[frame(tick,seed),frame(tick+60,seed+.15)],inputs:[[tick,0.65,0,0,false,false,true],[tick+60,0.65,0,0,false,false,true]]});
  }
  if(url.pathname==='/api/chat/presence'&&req.method==='GET')return result(200,{mode:'demo-only',onlineCount:8});
  if(url.pathname==='/api/chat'&&req.method==='GET')return result(200,{mode:'demo-only',messages:chatMessages.slice(-100)});
  if(url.pathname==='/api/chat'&&req.method==='POST'){
   const ticket=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
   const identity=chatTickets.get(ticket);if(!identity)return result(401,{error:'Sign in required'});
   const data=await readBody(req),text=typeof data?.text==='string'?data.text.trim():'';
   if(!text||text.length>500)return result(400,{error:'Message must be 1–500 characters'});
   const message={id:token(),nickname:identity.nickname+(identity.guest?' (vierailija)':''),text,at:Date.now()};chatMessages.push(message);
   while(chatMessages.length>100)chatMessages.shift();
   return result(201,{mode:'demo-only',message});
  }
  if(url.pathname==='/api/verified/account'&&req.method==='POST'){
   const data=await readBody(req),name=safeName(data?.nickname),password=typeof data?.password==='string'?data.password:'';
   const provided=Buffer.from(password),expected=Buffer.from(expectedPassword);
   if(![accountName,driverName].includes(name)||provided.length!==expected.length||!timingSafeEqual(provided,expected))return result(401,{error:'Invalid demo credentials'});
   if(data.create===true)return result(409,{error:'The seeded demo account already exists'});
   const accessToken=seededToken,expiresAt=Date.now()+7*86400000,series=validSeries(data.series);
   sessions.set(accessToken,{nickname:driverName,series,expiresAt});
   return result(200,{mode:'demo-only',nickname:driverName,token:accessToken,expiresAt,series});
  }
  if(url.pathname==='/api/verified/logout'&&req.method==='POST'){
   const auth=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');sessions.delete(auth);return result(200,{mode:'demo-only',loggedOut:true});
  }
  if(url.pathname==='/api/verified/chat-ticket'&&req.method==='POST'){
   const auth=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
   const identity=identityFor(auth);if(!identity||identity.expiresAt<=Date.now())return result(401,{error:'Sign in required'});
   const value=token();chatTickets.set(value,identity);return result(200,{mode:'demo-only',ticket:value,expiresInMs:10*60*1000});
  }
  if(url.pathname==='/api/verified/guest'&&req.method==='POST'){
   const data=await readBody(req),name=safeName(data?.nickname);if(!name)return result(400,{error:'Invalid demo nickname'});
   const accessToken=token(),expiresAt=Date.now()+86400000,series=validSeries(data.series);
   sessions.set(accessToken,{nickname:name,series,expiresAt,guest:true});
   return result(200,{mode:'demo-only',nickname:name,token:accessToken,expiresAt,series,guest:true});
  }
  if(url.pathname==='/api/verified/leaderboard'&&req.method==='GET')return result(200,leaderboard(validSeries(url.searchParams.get('series')),driverName));
  if(url.pathname==='/api/verified/timing-panel'&&req.method==='GET'){
   const auth=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
   const identity=auth?identityFor(auth):null;if(auth&&(!identity||identity.expiresAt<=Date.now()))return result(401,{error:'Sign in required'});
   const series=validSeries(url.searchParams.get('series')),board=leaderboard(series,driverName).results;
   const personal=identity?(identity.guest?board[0]:series==='human'&&identity.nickname===driverName?board[0]:null):(board[0]||null);
   const personalIndex=personal?board.findIndex(row=>row.nickname===personal.nickname):-1,next=personalIndex>=0?board[personalIndex+1]||null:null;
   return result(200,{mode:'demo-only',protocol,revision,series,fieldSize:board.length,rank:personal?1:null,
    trackBest:board[0]?{nickname:board[0].nickname,lap_ms:board[0].lap_ms}:null,
    personalBest:personal?{nickname:identity?.guest?identity.nickname+' (vierailija)':personal.nickname,lap_ms:personal.lap_ms}:null,
    next:next?{nickname:next.nickname,lap_ms:next.lap_ms}:null,
    sectorBest:personal?(series==='bot'?[27124,26986,27262]:[28100,27982,28426]):null});
  }
  if(url.pathname==='/api/verified/championship'&&req.method==='GET'){
   const auth=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
   const identity=identityFor(auth);if(identity&&identity.expiresAt<=Date.now())sessions.delete(auth);
   return result(200,championship(validSeries(url.searchParams.get('series')),url.searchParams.get('day'),identity&&identity.expiresAt>Date.now()?identity:null,driverName));
  }
  return result(404,{error:'Demo endpoint unavailable'});
 }catch(error){return result(error.status||400,{error:error.status?error.message:'Invalid demo request'});}
}

module.exports={handleLocalDemoApi,leaderboard,championship};
