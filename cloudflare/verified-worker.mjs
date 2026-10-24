import {sign,verify,hash,protocol,validPlayer,validName} from '../verification/protocol.mjs';

// Separate table and endpoints: legacy times can never appear as verified results.
export const schema=[
 `CREATE TABLE IF NOT EXISTS verified_laps (
  session_id TEXT NOT NULL,lap INTEGER NOT NULL,revision TEXT NOT NULL,player_hash TEXT NOT NULL,nickname TEXT NOT NULL,
  start_tick INTEGER NOT NULL,end_tick INTEGER NOT NULL,lap_ticks INTEGER NOT NULL,
  sector1 INTEGER NOT NULL,sector2 INTEGER NOT NULL,sector3 INTEGER NOT NULL,issued_ms INTEGER NOT NULL,
  PRIMARY KEY(session_id,lap))`,
 'CREATE INDEX IF NOT EXISTS verified_order ON verified_laps(revision,lap_ticks,issued_ms,session_id,lap)',
 'CREATE TABLE IF NOT EXISTS verified_limits (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires INTEGER NOT NULL)'
];
async function body(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw Object.assign(Error('JSON required'),{status:415});
 const reader=request.body?.getReader();if(!reader)throw Object.assign(Error('Missing body'),{status:400});
 const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw Object.assign(Error('Body too large'),{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(Error('Invalid JSON'),{status:400});}
}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin');
  const origins=new Set((env.GAME_ORIGINS||'https://panulut.github.io,http://localhost:8000,http://127.0.0.1:8000').split(','));
  const headers={'Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  if(origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(data,status=200)=>Response.json(data,{status,headers});
  if(origin&&!origins.has(origin))return reply({error:'Origin denied'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS'}});
  try{
   if(!env.DB||!validPlayer(env.SIMULATION_REVISION)||typeof env.VERIFICATION_SECRET!=='string'||env.VERIFICATION_SECRET.length<32)return reply({error:'Verification not configured'},503);
   const url=new URL(request.url);
   if(url.pathname==='/api/verified/leaderboard'&&request.method==='GET'){
    const rows=await env.DB.prepare(`SELECT nickname,lap_ticks,sector1,sector2,sector3 FROM verified_laps WHERE revision=? ORDER BY lap_ticks,issued_ms,session_id,lap LIMIT 10`).bind(env.SIMULATION_REVISION).all();
    return reply({protocol,revision:env.SIMULATION_REVISION,results:rows.results.map(row=>({...row,lap_ms:row.lap_ticks*1000/120}))});
   }
   if(!['/api/verified/start','/api/verified/laps'].includes(url.pathname))return reply({error:'Not found'},404);
   if(request.method!=='POST')return reply({error:'POST required'},405);
   const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
   if(!validPlayer(token))return reply({error:'Player credential required'},401);
   const playerHash=await hash(token),now=Date.now(),starting=url.pathname.endsWith('/start');
   const minute=Math.floor(now/60000),ip=await hash(request.headers.get('CF-Connecting-IP')||'unknown');
   for(const [id,max]of [[`p:${playerHash}:${minute}`,20],[`i:${ip}:${minute}`,80]]){
    const result=await env.DB.prepare('INSERT INTO verified_limits(key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(id,now+120000).first();
    if(result.attempts>max)return reply({error:'Too many requests'},429);
   }
   await env.DB.prepare('DELETE FROM verified_limits WHERE expires < ?').bind(now).run();
   const data=await body(request);
   if(starting){
    if(!validName(data?.nickname)||data.revision!==env.SIMULATION_REVISION)return reply({error:'Invalid start'},400);
    const nonce=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    return reply({protocol,ticket:await sign({kind:'start',protocol,revision:env.SIMULATION_REVISION,playerHash,nickname:data.nickname,nonce,issuedAt:now,expiresAt:now+120000},env.VERIFICATION_SECRET)});
   }
   let lap;try{lap=await verify(data?.receipt,env.VERIFICATION_SECRET);}catch{return reply({error:'Invalid lap signature'},403);}
   if(lap.kind!=='lap'||lap.protocol!==protocol||lap.revision!==env.SIMULATION_REVISION||lap.playerHash!==playerHash||!validName(lap.nickname)||
    !/^[a-f0-9]{32}$/.test(lap.sessionId)||!Number.isSafeInteger(lap.lap)||lap.lap<1||
    !Number.isSafeInteger(lap.startTick)||lap.startTick<0||!Number.isSafeInteger(lap.endTick)||lap.endTick>72000||
    !Number.isSafeInteger(lap.lapTicks)||lap.lapTicks<=600||lap.endTick-lap.startTick!==lap.lapTicks||
    !Array.isArray(lap.sectorTicks)||lap.sectorTicks.length!==3||!lap.sectorTicks.every(n=>Number.isSafeInteger(n)&&n>0)||lap.sectorTicks.reduce((a,b)=>a+b,0)!==lap.lapTicks||
    !Number.isSafeInteger(lap.issuedAt)||lap.issuedAt>now+5000)return reply({error:'Invalid verified lap'},403);
   const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO verified_laps
    (session_id,lap,revision,player_hash,nickname,start_tick,end_tick,lap_ticks,sector1,sector2,sector3,issued_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(lap.sessionId,lap.lap,lap.revision,lap.playerHash,lap.nickname,lap.startTick,lap.endTick,lap.lapTicks,...lap.sectorTicks,lap.issuedAt).run();
   return reply({protocol,saved:inserted.meta.changes>0,verified:true,lap:lap.lap,lapMs:lap.lapTicks*1000/120});
  }catch(error){console.error('Verified leaderboard request failed',error.status||500);return reply({error:error.status?error.message:'Verified leaderboard unavailable'},error.status||503);}
 }
};
