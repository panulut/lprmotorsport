import {databaseNowSQL,guestSchema,guestNameSQL,principalJoins,principalExists,sessionOwner,identityReply,uploadFailure} from './guests.mjs';
import {championshipSchema,championship,championshipEntry,claimChampionshipEntries} from './championship.mjs';
import {replaySchema,moderationSchema,replayStatements,replayRoute,retentionStatements,reportReplay,seriesFor,seriesOf,SERIES} from './replays.mjs';
import {sign,verify,hash,protocol,validPlayer,validName} from '../verification/protocol.mjs';
// npm run build:verified-worker inlines the protocol and the simulation revision into a pasteable bundle.
const BUILD_REVISION='';

// Separate table and endpoints: legacy times can never appear as verified results.
// player_hash is a stable account identity, never a login credential.
const accountSchema=`CREATE TABLE IF NOT EXISTS verified_accounts (
  name_key TEXT PRIMARY KEY,nickname TEXT NOT NULL,player_hash TEXT NOT NULL UNIQUE,credential_salt TEXT NOT NULL,
  password_salt TEXT NOT NULL,password_hash TEXT NOT NULL,iterations INTEGER NOT NULL,created_ms INTEGER NOT NULL)`;
const sessionSchema=`CREATE TABLE IF NOT EXISTS verified_login_sessions (
 token_hash TEXT PRIMARY KEY,player_hash TEXT NOT NULL,secret_hash TEXT NOT NULL,created_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL)`;
const sessionIndex='CREATE INDEX IF NOT EXISTS verified_login_expiry ON verified_login_sessions(expires_ms)';
const chatStorageSchema=`CREATE TABLE IF NOT EXISTS verified_chat_messages (
 id TEXT PRIMARY KEY,nickname TEXT NOT NULL,text TEXT NOT NULL,at INTEGER NOT NULL)`;
const chatStorageIndex='CREATE INDEX IF NOT EXISTS verified_chat_expiry ON verified_chat_messages(at)';
const SESSION_MS=7*86400000;
const CHAT_TICKET_MS=10*60000;
const CHAT_RETENTION_MS=24*60*60*1000;
// Timing-panel polling is infrequent. Protect its ranked SQL query from bursts.
const TIMING_PANEL_PER_PLAYER_PER_MINUTE=30, TIMING_PANEL_PER_IP_PER_MINUTE=120;
async function newSession(db,account,secret){
 const now=Date.now(),token=randomHex()+randomHex(),expiresAt=now+SESSION_MS;
 await db.prepare('DELETE FROM verified_login_sessions WHERE expires_ms<=?').bind(now).run();
 await db.prepare('INSERT INTO verified_login_sessions(token_hash,player_hash,secret_hash,created_ms,expires_ms) VALUES (?,?,?,?,?)')
  .bind(await hash(token),account.player_hash,await hash(secret),now,expiresAt).run();
 return {nickname:account.nickname,token,expiresAt,series:await seriesFor(db,account.player_hash)};
}
export const schema=[...guestSchema,...replaySchema,
 `CREATE TABLE IF NOT EXISTS verified_laps (
  session_id TEXT NOT NULL,lap INTEGER NOT NULL,revision TEXT NOT NULL,player_hash TEXT NOT NULL,nickname TEXT NOT NULL,
  start_tick INTEGER NOT NULL,end_tick INTEGER NOT NULL,lap_ticks INTEGER NOT NULL,
  sector1 INTEGER NOT NULL,sector2 INTEGER NOT NULL,sector3 INTEGER NOT NULL,issued_ms INTEGER NOT NULL,
  PRIMARY KEY(session_id,lap))`,
 'CREATE INDEX IF NOT EXISTS verified_order ON verified_laps(revision,lap_ticks,issued_ms,session_id,lap)',
 'CREATE INDEX IF NOT EXISTS verified_owner_time ON verified_laps(player_hash,issued_ms)',
 'CREATE TABLE IF NOT EXISTS verified_limits (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires INTEGER NOT NULL)',
 accountSchema,sessionSchema,sessionIndex,chatStorageSchema,chatStorageIndex,...championshipSchema
];
const accountsReady=new WeakSet();
const ensureAccounts=async db=>{
 if(accountsReady.has(db))return;
 // Cache completion only: never share request-owned I/O promises across Worker requests.
 for(const sql of [accountSchema,sessionSchema,sessionIndex,chatStorageSchema,chatStorageIndex,...guestSchema,...moderationSchema,...championshipSchema,'CREATE INDEX IF NOT EXISTS verified_owner_time ON verified_laps(player_hash,issued_ms)'])await db.prepare(sql).run();
 accountsReady.add(db);
};
// Cloudflare Workers caps PBKDF2 at 100 000 iterations. If sign-ins exceed the plan's CPU limit,
// set PASSWORD_ITERATIONS lower; each account is rehashed at its next successful sign-in.
const PASSWORD_MIN=8,PASSWORD_MAX=128;
const passwordIterations=env=>{const n=Number(env.PASSWORD_ITERATIONS??100000);return Number.isSafeInteger(n)&&n>=10000&&n<=100000?n:100000;};
const textEncoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
const randomHex=()=>hex(crypto.getRandomValues(new Uint8Array(16)));
export const nameKey=name=>name.normalize('NFC').toLowerCase();
const accountName=name=>validName(name)&&name===name.trim()&&!/\s\s/.test(name);
const validPassword=value=>typeof value==='string'&&[...value].length>=PASSWORD_MIN&&value.length<=PASSWORD_MAX;
const sameText=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
async function passwordHash(password,salt,iterations){
 const material=await crypto.subtle.importKey('raw',textEncoder.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:textEncoder.encode(salt),iterations},material,256));
}
async function body(request,limit=8192){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw Object.assign(Error('JSON required'),{status:415});
 const reader=request.body?.getReader();if(!reader)throw Object.assign(Error('Missing body'),{status:400});
 const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Object.assign(Error('Body too large'),{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(Error('Invalid JSON'),{status:400});}
}
export default {
 async scheduled(controller,env){
  const revision=env.SIMULATION_REVISION||BUILD_REVISION;
  // Without a valid revision the ranking is empty and every recording would be deleted.
  if(!validPlayer(revision))return;
  await ensureAccounts(env.DB);
  await env.DB.batch(retentionStatements(env.DB,revision));
  await env.DB.prepare('DELETE FROM verified_chat_messages WHERE at<=?').bind(Date.now()-CHAT_RETENTION_MS).run();
  await env.DB.prepare('DELETE FROM verified_limits WHERE expires < ?').bind(Date.now()).run();
 },
 async fetch(request,env){
  const revision=env.SIMULATION_REVISION||BUILD_REVISION;
  const origin=request.headers.get('Origin');
  const origins=new Set((env.GAME_ORIGINS||'https://panulut.github.io,http://localhost:8000,http://127.0.0.1:8000').split(','));
  const headers={'Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  if(origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(data,status=200,extraHeaders={})=>Response.json(data,{status,headers:{...headers,...extraHeaders}});
  if(origin&&!origins.has(origin))return reply({error:'Origin denied'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS'}});
  try{
   if(!env.DB||!validPlayer(revision)||typeof env.VERIFICATION_SECRET!=='string'||env.VERIFICATION_SECRET.length<32)return reply({error:'Verification not configured'},503);
   const url=new URL(request.url);
   await ensureAccounts(env.DB);
   if(url.pathname==='/api/verified/chat-storage'){
    const now=Date.now(),credential=request.headers.get('Authorization')?.replace(/^Bearer /,'');
    let access;try{access=await verify(credential,env.VERIFICATION_SECRET);}catch{return reply({error:'Unauthorized'},401);}
    if(access.kind!=='chat-storage'||!['read','write'].includes(access.operation)||
     !Number.isSafeInteger(access.issuedAt)||!Number.isSafeInteger(access.expiresAt)||access.issuedAt>now+5000||
     access.expiresAt<=now||access.expiresAt-access.issuedAt>30000)return reply({error:'Unauthorized'},401);
    if(request.method==='GET'&&access.operation==='read'){
     await env.DB.prepare('DELETE FROM verified_chat_messages WHERE at<=?').bind(now-CHAT_RETENTION_MS).run();
     const rows=await env.DB.prepare(`SELECT id,nickname,text,at FROM
      (SELECT id,nickname,text,at FROM verified_chat_messages WHERE at>? ORDER BY at DESC,id DESC LIMIT 100)
      ORDER BY at,id`).bind(now-CHAT_RETENTION_MS).all();
     return reply({messages:rows.results});
    }
    if(request.method==='POST'&&access.operation==='write'){
     const message=access.message;
     const nickname=typeof message?.nickname==='string'?message.nickname:'';
     const baseName=nickname.replace(/ \(vierailija\)$/,'');
     if(typeof message?.id!=='string'||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(message.id)||
      !validName(baseName)||nickname!==baseName&&nickname!==`${baseName} (vierailija)`||
      typeof message.text!=='string'||!message.text.trim()||message.text.length>280||/[\p{Cc}\p{Cf}]/u.test(message.text)||
      !Number.isSafeInteger(message.at)||message.at<=now-CHAT_RETENTION_MS||message.at>now+5000)return reply({error:'Invalid message'},400);
     await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO verified_chat_messages(id,nickname,text,at) VALUES (?,?,?,?)')
       .bind(message.id,nickname,message.text,message.at),
      env.DB.prepare('DELETE FROM verified_chat_messages WHERE at<=?').bind(now-CHAT_RETENTION_MS),
      env.DB.prepare(`DELETE FROM verified_chat_messages WHERE id NOT IN
       (SELECT id FROM verified_chat_messages ORDER BY at DESC,id DESC LIMIT 100)`)
     ]);
     return reply({saved:true});
    }
    return reply({error:'Method not allowed'},405);
   }
   if(url.pathname.startsWith('/api/verified/replays/')||url.pathname.startsWith('/api/verified/admin/'))return await replayRoute(request,env,url,reply,headers,body,revision);
   const limit=async(id,max,windowMs)=>{
    const result=await env.DB.prepare('INSERT INTO verified_limits(key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(id,Date.now()+windowMs).first();
    return result.attempts>max;
   };
   if(url.pathname==='/api/verified/leaderboard'&&request.method==='GET'){
    const series=url.searchParams.get('series')||'human';
    if(!SERIES.includes(series))return reply({error:'Invalid series'},400);
    const rows=await env.DB.prepare(`SELECT ${guestNameSQL} AS nickname,l.lap_ticks,l.sector1,l.sector2,l.sector3,l.session_id,l.lap,
     CASE WHEN r.pinned=1 THEN 1 ELSE 0 END AS replay_available FROM verified_laps l JOIN verified_replays r USING(session_id,lap) ${principalJoins}
     WHERE ${principalExists} AND l.revision=? AND r.pinned=1 AND ${seriesOf('l.player_hash')}=? AND NOT EXISTS (SELECT 1 FROM verified_lap_exclusions x WHERE x.session_id=l.session_id AND x.lap=l.lap) ORDER BY l.lap_ticks,l.issued_ms,l.session_id,l.lap LIMIT 10`).bind(revision,series).all();
    return reply({protocol,revision:revision,series,results:rows.results.map(row=>({...row,lap_ms:row.lap_ticks*1000/120}))});
   }
   if(url.pathname==='/api/verified/timing-panel'&&request.method==='GET'){
    const series=url.searchParams.get('series')||'human';
    if(!SERIES.includes(series))return reply({error:'Invalid series'},400);
    const credential=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
    const owner=await sessionOwner(env.DB,credential,env.VERIFICATION_SECRET,Date.now());
    if(!owner)return reply({error:'Sign in required'},401);
    const now=Date.now(),minute=Math.floor(now/60000);
    const playerLimit=`tp:p:${owner.player_hash}:${minute}`;
    // CF-Connecting-IP is set by Cloudflare at the edge; ignore spoofable X-Forwarded-For.
    const clientIp=request.headers.get('CF-Connecting-IP');
    const ipLimit=clientIp?`tp:i:${await hash(clientIp)}:${minute}`:null;
    if(await limit(playerLimit,TIMING_PANEL_PER_PLAYER_PER_MINUTE,120000)||
       (ipLimit&&await limit(ipLimit,TIMING_PANEL_PER_IP_PER_MINUTE,120000)))
     return reply({error:'Too many timing-panel requests'},429,{'Retry-After':String(60-Math.floor(now%60000/1000))});
    const rows=await env.DB.prepare(`WITH ranked AS (
     SELECT l.player_hash,${guestNameSQL} AS nickname,l.lap_ticks,l.issued_ms,l.session_id,l.lap,l.sector1,l.sector2,l.sector3,
      ROW_NUMBER() OVER (PARTITION BY l.player_hash ORDER BY l.lap_ticks,l.issued_ms,l.session_id,l.lap) AS best_order
     FROM verified_laps l JOIN verified_replays r USING(session_id,lap) ${principalJoins}
     WHERE ${principalExists} AND l.revision=? AND r.pinned=1 AND ${seriesOf('l.player_hash')}=?
      AND NOT EXISTS (SELECT 1 FROM verified_lap_exclusions x WHERE x.session_id=l.session_id AND x.lap=l.lap)
    ) SELECT player_hash,nickname,lap_ticks,session_id,lap,sector1,sector2,sector3 FROM ranked WHERE best_order=1
     ORDER BY lap_ticks,nickname COLLATE NOCASE,player_hash`).bind(revision,series).all();
    const standings=rows.results||[], personal=standings.find(row=>row.player_hash===owner.player_hash)||null;
    const track=standings[0]||null;
    const rank=personal?1+standings.filter(row=>row.lap_ticks<personal.lap_ticks).length:null;
    const next=personal?standings.find(row=>row.lap_ticks>personal.lap_ticks)||null:null;
    const timing=row=>row?{nickname:row.nickname,lap_ms:row.lap_ticks*1000/120}:null;
    const personalBest=timing(personal);
    if(personalBest){
     personalBest.sectors=[personal.sector1,personal.sector2,personal.sector3].map(ticks=>ticks*1000/120);
     personalBest.replay={sessionId:personal.session_id,lap:personal.lap};
    }
    return reply({protocol,revision,series,fieldSize:standings.length,rank,trackBest:timing(track),personalBest,next:timing(next)});
   }
   if(url.pathname==='/api/verified/championship'&&request.method==='GET'){
    const credential=request.headers.get('Authorization')?.replace(/^Bearer /,'');
    let playerHash=null;
    if(validPlayer(credential)){
     const owner=await env.DB.prepare(`SELECT a.player_hash FROM verified_login_sessions s
      JOIN verified_accounts a ON a.player_hash=s.player_hash WHERE s.token_hash=? AND s.expires_ms>MAX(?,${databaseNowSQL}) AND s.secret_hash=?`)
      .bind(await hash(credential),Date.now(),await hash(env.VERIFICATION_SECRET)).first();
     playerHash=owner?.player_hash||null;
    }
    return reply(await championship(env.DB,url,Date.now(),playerHash));
   }
   if(url.pathname==='/api/verified/account'){
    if(request.method!=='POST')return reply({error:'POST required'},405);
    const now=Date.now(),ip=await hash(request.headers.get('CF-Connecting-IP')||'unknown');
    if(await limit(`a:${ip}:${Math.floor(now/60000)}`,20,120000))return reply({error:'Too many requests'},429);
    await env.DB.prepare('DELETE FROM verified_limits WHERE expires < ?').bind(now).run();
    const data=await body(request);
    if(!accountName(data?.nickname)||!validPassword(data.password))return reply({error:'Invalid account'},400);
    const key=nameKey(data.nickname);
    const claimHeader=request.headers.get('Authorization');
    const claimToken=claimHeader?.replace(/^Bearer /,'');
    const claimant=claimToken?await sessionOwner(env.DB,claimToken,env.VERIFICATION_SECRET):null;
    if(claimHeader!==null&&!claimant)return reply({error:'Active guest session required'},401);
    if(claimToken&&data.create!==true)return reply({error:'Guest promotion requires registration'},400);
    // Only failed passwords count: tightly per nickname and address, loosely per nickname,
    // so one address cannot lock the owner out and successful sign-ins are never throttled.
    const slot=Math.floor(now/600000),nameId=`f:${await hash(key)}:${slot}`,pairId=`g:${await hash(key+'\n'+ip)}:${slot}`;
    const failures=async id=>(await env.DB.prepare('SELECT attempts FROM verified_limits WHERE key=? AND expires>=?').bind(id,now).first())?.attempts??0;
    const account=await env.DB.prepare('SELECT * FROM verified_accounts WHERE name_key=?').bind(key).first();
    if(account){
     if(data.create===true){
      // Recover a lost registration response only with the very same live session
      // and password. A nickname, a different guest or a new account cannot claim.
      if(claimant&&!claimant.guest&&claimant.player_hash===account.player_hash&&sameText(await passwordHash(data.password,account.password_salt,account.iterations),account.password_hash))
       return reply({...await identityReply(env.DB,claimant,claimToken),created:true,claimed:true});
      return reply({error:'Nickname taken'},409);
     }
     if(await failures(pairId)>=5||await failures(nameId)>=30)return reply({error:'Too many requests'},429);
     if(!sameText(await passwordHash(data.password,account.password_salt,account.iterations),account.password_hash)){
      await limit(pairId,Infinity,1200000);await limit(nameId,Infinity,1200000);
      return reply({error:'Wrong password'},401);
     }
     const iterations=passwordIterations(env);
     if(account.iterations!==iterations){
      const salt=randomHex();
      await env.DB.prepare('UPDATE verified_accounts SET password_salt=?,password_hash=?,iterations=? WHERE name_key=?')
       .bind(salt,await passwordHash(data.password,salt,iterations),iterations,key).run();
     }
     return reply({...await newSession(env.DB,account,env.VERIFICATION_SECRET),created:false});
    }
    if(data.create!==true)return reply({error:'Account not found'},404);
    if(claimant&&!claimant.guest)return reply({error:'Session already registered'},409);
    const series=claimant?await seriesFor(env.DB,claimant.player_hash):data.series??'human';
    if(claimant&&data.series!==undefined&&data.series!==series)return reply({error:'Guest series cannot change during registration'},409);
    if(!SERIES.includes(series))return reply({error:'Invalid account'},400);
    const created={name_key:key,nickname:data.nickname,credential_salt:randomHex(),password_salt:randomHex(),iterations:passwordIterations(env),created_ms:now};
    created.password_hash=await passwordHash(data.password,created.password_salt,created.iterations);
    created.player_hash=claimant?.player_hash||randomHex()+randomHex();
    const [inserted]=await env.DB.batch([env.DB.prepare(`INSERT OR IGNORE INTO verified_accounts
     (name_key,nickname,player_hash,credential_salt,password_salt,password_hash,iterations,created_ms) SELECT ?,?,?,?,?,?,?,?
     ${claimant?`WHERE EXISTS (SELECT 1 FROM verified_login_sessions WHERE token_hash=? AND player_hash=? AND secret_hash=? AND expires_ms>MAX(?,${databaseNowSQL}))`:''}`)
     .bind(key,created.nickname,created.player_hash,created.credential_salt,created.password_salt,created.password_hash,created.iterations,now,...(claimant?[await hash(claimToken),claimant.player_hash,await hash(env.VERIFICATION_SECRET),Date.now()]:[])),
     env.DB.prepare(`INSERT OR IGNORE INTO verified_account_series(player_hash,series,changed_ms)
      SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM verified_accounts WHERE player_hash=?)`).bind(created.player_hash,series,now,created.player_hash),
     ...(claimant?[env.DB.prepare(`UPDATE verified_login_sessions SET expires_ms=? WHERE token_hash=? AND expires_ms>MAX(?,${databaseNowSQL}) AND secret_hash=?
      AND EXISTS (SELECT 1 FROM verified_accounts WHERE player_hash=? AND password_hash=?)`)
      .bind(now+SESSION_MS,await hash(claimToken),Date.now(),await hash(env.VERIFICATION_SECRET),created.player_hash,created.password_hash),claimChampionshipEntries(env.DB,created.player_hash,key,created.password_hash,now,{tokenHash:await hash(claimToken),secretHash:await hash(env.VERIFICATION_SECRET)})]:[])]);
    if(!inserted.meta.changes){
     // A concurrent retry may already have promoted this exact principal.
     const promoted=claimant?await sessionOwner(env.DB,claimToken,env.VERIFICATION_SECRET):null;
     const existing=promoted?await env.DB.prepare('SELECT * FROM verified_accounts WHERE player_hash=?').bind(promoted.player_hash).first():null;
     if(existing&&promoted&&!promoted.guest&&promoted.player_hash===created.player_hash&&nameKey(promoted.nickname)===key&&sameText(await passwordHash(data.password,existing.password_salt,existing.iterations),existing.password_hash))return reply({...await identityReply(env.DB,promoted,claimToken),created:true,claimed:true});
     return reply({error:'Nickname taken or guest session expired'},409);
    }
    if(claimant)return reply({...await identityReply(env.DB,{...claimant,nickname:created.nickname,guest:0,expires_ms:now+SESSION_MS},claimToken),created:true,claimed:true},201);
    return reply({...await newSession(env.DB,created,env.VERIFICATION_SECRET),created:true},201);
   }
   if(url.pathname==='/api/verified/guest'){
    if(request.method!=='POST')return reply({error:'POST required'},405);
    const now=Date.now(),ip=await hash(request.headers.get('CF-Connecting-IP')||'unknown');
    if(await limit(`guest:${ip}:${Math.floor(now/60000)}`,10,120000))return reply({error:'Too many requests'},429);
    await env.DB.prepare('DELETE FROM verified_limits WHERE expires < ?').bind(now).run();
    const credential=request.headers.get('Authorization')?.replace(/^Bearer /,'');
    if(credential){
     const owner=await sessionOwner(env.DB,credential,env.VERIFICATION_SECRET);
     return owner?reply(await identityReply(env.DB,owner,credential)):reply({error:'Guest session expired'},401);
    }
    const data=await body(request,2048),series=data?.series;
    if(!accountName(data?.nickname)||!SERIES.includes(series))return reply({error:'Nickname and series required'},400);
    if(await env.DB.prepare('SELECT 1 FROM verified_accounts WHERE name_key=?').bind(nameKey(data.nickname)).first())return reply({error:'Nickname taken'},409);
    const playerHash=randomHex()+randomHex(),token=randomHex()+randomHex(),expiresAt=now+24*3600000;
    await env.DB.batch([
     env.DB.prepare('INSERT INTO verified_guests(player_hash,nickname,created_ms) VALUES (?,?,?)').bind(playerHash,data.nickname,now),
     env.DB.prepare('INSERT INTO verified_login_sessions(token_hash,player_hash,secret_hash,created_ms,expires_ms) VALUES (?,?,?,?,?)').bind(await hash(token),playerHash,await hash(env.VERIFICATION_SECRET),now,expiresAt),
     env.DB.prepare('INSERT INTO verified_account_series(player_hash,series,changed_ms) VALUES (?,?,?)').bind(playerHash,series,now)
    ]);
    return reply({nickname:data.nickname,token,expiresAt,guest:true,series},201);
   }
   if(url.pathname==='/api/verified/guest-chat-ticket'){
    if(request.method!=='POST')return reply({error:'POST required'},405);
    const now=Date.now(),ip=await hash(request.headers.get('CF-Connecting-IP')||'unknown');
    if(await limit(`guest-chat:${ip}:${Math.floor(now/60000)}`,30,120000))return reply({error:'Too many requests'},429);
    const data=await body(request,2048);
    if(!accountName(data?.nickname))return reply({error:'Invalid nickname'},400);
    if(await env.DB.prepare('SELECT 1 FROM verified_accounts WHERE name_key=?').bind(nameKey(data.nickname)).first())
     return reply({error:'Nickname taken'},409);
    const expiresAt=now+CHAT_TICKET_MS,playerHash=randomHex()+randomHex();
    return reply({protocol,nickname:data.nickname,expiresInMs:CHAT_TICKET_MS,
     ticket:await sign({kind:'guest-chat',protocol,playerHash,nickname:data.nickname,issuedAt:now,expiresAt},env.VERIFICATION_SECRET)});
   }
   if(!['/api/verified/start','/api/verified/chat-ticket','/api/verified/laps','/api/verified/logout','/api/verified/report'].includes(url.pathname))return reply({error:'Not found'},404);
   if(request.method!=='POST')return reply({error:'POST required'},405);
   const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
   if(!validPlayer(token))return reply({error:'Player credential required'},401);
   const tokenHash=await hash(token),secretHash=await hash(env.VERIFICATION_SECRET),now=Date.now(),starting=url.pathname.endsWith('/start');
   if(url.pathname==='/api/verified/logout'){
    await env.DB.prepare('DELETE FROM verified_login_sessions WHERE token_hash=?').bind(tokenHash).run();
    return reply({signedOut:true});
   }
   const owner=await sessionOwner(env.DB,token,env.VERIFICATION_SECRET,now);
   if(!owner)return reply({error:'Sign in required'},401);
   const playerHash=owner.player_hash;
   const minute=Math.floor(now/60000),ip=await hash(request.headers.get('CF-Connecting-IP')||'unknown');
   for(const [id,max]of [[`p:${playerHash}:${minute}`,20],[`i:${ip}:${minute}`,80]]){
    if(await limit(id,max,120000))return reply({error:'Too many requests'},429);
   }
   await env.DB.prepare('DELETE FROM verified_limits WHERE expires < ?').bind(now).run();
   if(url.pathname==='/api/verified/chat-ticket'){
    // Short-lived, so a logout or a stolen ticket cannot post for long.
    const expiresAt=now+CHAT_TICKET_MS;
    return reply({protocol,nickname:owner.nickname,expiresInMs:CHAT_TICKET_MS,
     ticket:await sign({kind:owner.guest?'guest-chat':'chat',protocol,playerHash,nickname:owner.nickname,issuedAt:now,expiresAt},env.VERIFICATION_SECRET)});
   }
   if(owner.guest&&url.pathname==='/api/verified/report')return reply({error:'Registered account required'},403);
   if(url.pathname==='/api/verified/report')return await reportReplay(env,await body(request,4096),playerHash,revision,now,reply);
   const data=await body(request,starting?8192:950000);
   if(starting){
    if(data?.revision!==revision)return reply({error:'Invalid start'},400);
    const nonce=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    return reply({protocol,nickname:owner.nickname,ticket:await sign({kind:'start',protocol,revision:revision,playerHash,nickname:owner.nickname,nonce,issuedAt:now,expiresAt:now+120000},env.VERIFICATION_SECRET)});
   }
   let lap;try{lap=await verify(data?.receipt,env.VERIFICATION_SECRET);}catch{return reply({error:'Invalid lap signature'},403);}
   if(lap.kind!=='lap'||lap.protocol!==protocol||lap.revision!==revision||lap.playerHash!==playerHash||!validName(lap.nickname)||
    !/^[a-f0-9]{32}$/.test(lap.sessionId)||!Number.isSafeInteger(lap.lap)||lap.lap<1||
    !Number.isSafeInteger(lap.startTick)||lap.startTick<0||!Number.isSafeInteger(lap.endTick)||lap.endTick>72000||
    !Number.isSafeInteger(lap.lapTicks)||lap.lapTicks<=600||lap.endTick-lap.startTick!==lap.lapTicks||
    !Array.isArray(lap.sectorTicks)||lap.sectorTicks.length!==3||!lap.sectorTicks.every(n=>Number.isSafeInteger(n)&&n>0)||lap.sectorTicks.reduce((a,b)=>a+b,0)!==lap.lapTicks||
    !Number.isSafeInteger(lap.issuedAt)||lap.issuedAt>now+5000)return reply({error:'Invalid verified lap'},403);
   if(!validPlayer(lap.replayHash)||typeof data.replay!=='string'){
    await uploadFailure(env.DB,lap,'missing_signed_replay',{tokenHash,secretHash});
    return reply({error:'A signed public replay is required for leaderboard submission'},403);
   }
   let replayWrites;
   try{replayWrites=await replayStatements(env,lap,data,now,{tokenHash,secretHash});}
   catch(error){await uploadFailure(env.DB,lap,'replay_mismatch',{tokenHash,secretHash});throw error;}
   const insert=env.DB.prepare(`INSERT OR IGNORE INTO verified_laps
    (session_id,lap,revision,player_hash,nickname,start_tick,end_tick,lap_ticks,sector1,sector2,sector3,issued_ms) SELECT ?,?,?,?,?,?,?,?,?,?,?,?
    WHERE EXISTS (SELECT 1 FROM verified_login_sessions s
     WHERE s.token_hash=? AND s.expires_ms>MAX(?,${databaseNowSQL}) AND s.secret_hash=? AND s.player_hash=?)`)
    .bind(lap.sessionId,lap.lap,lap.revision,lap.playerHash,lap.nickname,lap.startTick,lap.endTick,lap.lapTicks,...lap.sectorTicks,lap.issuedAt,tokenHash,Date.now(),secretHash,playerHash);
   const entry=championshipEntry(env.DB,lap,Date.now(),{tokenHash,secretHash});
   const evidence=env.DB.prepare(`INSERT OR IGNORE INTO verified_lap_evidence(session_id,lap,receipt,replay_hash,accepted_ms)
    SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM verified_laps WHERE session_id=? AND lap=? AND player_hash=?)
    AND EXISTS (SELECT 1 FROM verified_login_sessions WHERE token_hash=? AND expires_ms>MAX(?,${databaseNowSQL}) AND secret_hash=? AND player_hash=?)`)
    .bind(lap.sessionId,lap.lap,data.receipt,lap.replayHash,now,lap.sessionId,lap.lap,playerHash,tokenHash,Date.now(),secretHash,playerHash);
   const [inserted]=await env.DB.batch([insert,evidence,...replayWrites,...(entry?[entry]:[])]);
   // Revocation/expiry can occur while reading the body or checking the signature.
   // The write above validates the session atomically; distinguish this from a duplicate lap.
   if(!inserted.meta.changes&&!await sessionOwner(env.DB,token,env.VERIFICATION_SECRET))return reply({error:'Sign in required'},401);
   return reply({protocol,saved:inserted.meta.changes>0,verified:true,lap:lap.lap,lapMs:lap.lapTicks*1000/120});
  }catch(error){console.error('Verified leaderboard request failed',error.status||500);return reply({error:error.status?error.message:'Verified leaderboard unavailable'},error.status||503);}
 }
};
