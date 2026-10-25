import {hash} from '../verification/protocol.mjs';
export const replaySchema=[
 `CREATE TABLE IF NOT EXISTS verified_replays (
 session_id TEXT NOT NULL,lap INTEGER NOT NULL,payload TEXT NOT NULL,payload_hash TEXT NOT NULL,
 expires_ms INTEGER NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,review TEXT NOT NULL DEFAULT 'unreviewed',
 PRIMARY KEY(session_id,lap))`,
 'CREATE INDEX IF NOT EXISTS replay_expiry ON verified_replays(pinned,review,expires_ms)'
];
const liveReplay="(r.pinned=1 OR r.review='flagged' OR r.expires_ms>?)";
export async function replayStatements(env,lap,data,now){
 const statements=[];
 if(lap.replayHash&&data.replay!==undefined){
  if(typeof data.replay!=='string'||data.replay.length>900000||(data.replay.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.replay))||await hash(data.replay)!==lap.replayHash)
   throw Object.assign(Error('Recording does not match the signed lap'),{status:400});
  statements.push(env.DB.prepare(`INSERT OR IGNORE INTO verified_replays
   (session_id,lap,payload,payload_hash,expires_ms) VALUES (?,?,?,?,?)`)
   .bind(lap.sessionId,lap.lap,data.replay,lap.replayHash,lap.issuedAt+30*86400000));
 }
 // Sticky pin: keep any recording which has appeared in this revision's top ten.
 statements.push(env.DB.prepare(`UPDATE verified_replays SET pinned=1 WHERE (session_id,lap) IN
  (SELECT l.session_id,l.lap FROM verified_laps l JOIN verified_replays r USING(session_id,lap)
   WHERE l.revision=? AND (r.pinned=1 OR r.review='flagged' OR r.expires_ms>?) ORDER BY l.lap_ticks,l.issued_ms,l.session_id,l.lap LIMIT 10)`).bind(lap.revision,now));
 statements.push(env.DB.prepare("DELETE FROM verified_replays WHERE expires_ms<=? AND pinned=0 AND review!='flagged'").bind(now));
 return statements;
}
async function admin(request,env){
 if(typeof env.ANALYTICS_ADMIN_TOKEN!=='string'||env.ANALYTICS_ADMIN_TOKEN.length<32)return false;
 const a=await hash(request.headers.get('Authorization')?.replace(/^Bearer /,'')||''),b=await hash(env.ANALYTICS_ADMIN_TOKEN);
 let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;
}
export async function replayRoute(request,env,url,reply,headers,readBody){
 const privateRoute=url.pathname.startsWith('/api/verified/admin/');
 if(privateRoute&&!await admin(request,env))return reply({error:'Unauthorized'},401);
 const match=url.pathname.match(/^\/api\/verified\/(admin\/)?replays\/([a-f0-9]{32})\/([1-9][0-9]{0,5})$/);
 const now=Date.now();
 if(match){
  const [,isAdmin,id,lap]=match;
  if(request.method==='POST'&&isAdmin){
   const data=await readBody(request);
   if(!['unreviewed','flagged','reviewed'].includes(data.review))return reply({error:'Invalid review status'},400);
   const result=await env.DB.prepare(`UPDATE verified_replays SET review=? WHERE session_id=? AND lap=? AND (pinned=1 OR review='flagged' OR expires_ms>?)`)
    .bind(data.review,id,Number(lap),now).run();
   return result.meta.changes?reply({ok:true}):reply({error:'Recording unavailable'},404);
  }
  if(request.method!=='GET')return reply({error:'GET required'},405);
  const r=await env.DB.prepare(`SELECT r.payload FROM verified_replays r JOIN verified_laps l USING(session_id,lap)
   WHERE r.session_id=? AND r.lap=? AND ${isAdmin?liveReplay:'r.pinned=1'}`)
   .bind(id,Number(lap),...(isAdmin?[now]:[])).first();
  if(!r)return reply({error:'Recording unavailable'},404);
  const bytes=Uint8Array.from(atob(r.payload),c=>c.charCodeAt(0));
  return new Response(bytes,{encodeBody:'manual',headers:{...headers,'Content-Type':'application/json','Content-Encoding':'gzip'}});
 }
 if(privateRoute&&url.pathname==='/api/verified/admin/replays'&&request.method==='GET'){
  const offset=Number(url.searchParams.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)return reply({error:'Invalid offset'},400);
  const flagged=url.searchParams.get('flagged')==='1';
  const rows=await env.DB.prepare(`SELECT l.session_id,l.lap,l.nickname,l.revision,l.lap_ticks,l.sector1,l.sector2,l.sector3,l.issued_ms,
   CASE WHEN ${liveReplay} THEN 1 ELSE 0 END AS replay_available,r.pinned,r.review,length(r.payload) AS bytes
   FROM verified_laps l LEFT JOIN verified_replays r USING(session_id,lap)
   ${flagged?"WHERE r.review='flagged'":''} ORDER BY l.issued_ms DESC,l.session_id,l.lap DESC LIMIT 51 OFFSET ?`).bind(now,offset).all();
  return reply({results:rows.results.slice(0,50),hasMore:rows.results.length>50});
 }
 return reply({error:'Not found'},404);
}
