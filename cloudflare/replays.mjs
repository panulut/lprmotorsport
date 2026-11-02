import {databaseNowSQL,guestNameSQL,principalJoins,principalExists} from './guests.mjs';
import {hash} from '../verification/protocol.mjs';
export const replaySchema=[
 `CREATE TABLE IF NOT EXISTS verified_replays (
 session_id TEXT NOT NULL,lap INTEGER NOT NULL,payload TEXT NOT NULL,payload_hash TEXT NOT NULL,
 expires_ms INTEGER NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,review TEXT NOT NULL DEFAULT 'unreviewed',
 PRIMARY KEY(session_id,lap))`,
 'CREATE INDEX IF NOT EXISTS replay_expiry ON verified_replays(pinned,review,expires_ms)'
];
export const SERIES=['human','bot'];
export const REPORT_REASONS=['bot','inputs','line','other'];
// Created lazily by the Worker as well, so an existing D1 database needs no manual migration.
export const moderationSchema=[
 `CREATE TABLE IF NOT EXISTS verified_account_series (
 player_hash TEXT PRIMARY KEY,series TEXT NOT NULL CHECK(series IN ('human','bot')),changed_ms INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS verified_reports (
 session_id TEXT NOT NULL,lap INTEGER NOT NULL,reporter_hash TEXT NOT NULL,reason TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',
 created_ms INTEGER NOT NULL,PRIMARY KEY(session_id,lap,reporter_hash))`,
 'CREATE INDEX IF NOT EXISTS verified_report_author ON verified_reports(reporter_hash,created_ms)',
 `CREATE TABLE IF NOT EXISTS verified_lap_exclusions (session_id TEXT NOT NULL,lap INTEGER NOT NULL,reason TEXT NOT NULL DEFAULT 'admin',created_ms INTEGER NOT NULL,PRIMARY KEY(session_id,lap))`
];
replaySchema.push(...moderationSchema);
// Accounts without a row belong to the human series.
export const seriesOf=player=>`COALESCE((SELECT series FROM verified_account_series WHERE player_hash=${player}),'human')`;
// Each series keeps its current fastest recordings; previously public evidence is archived
// permanently so retention cannot destroy a restorable official record.
export const REPLAY_LIMIT=20;
const ranked=`FROM verified_laps l JOIN verified_replays r USING(session_id,lap)
 ${principalJoins} WHERE ${principalExists} AND l.revision=? AND ${seriesOf('l.player_hash')}=? AND NOT EXISTS (SELECT 1 FROM verified_lap_exclusions x WHERE x.session_id=l.session_id AND x.lap=l.lap)`;
const order='ORDER BY l.lap_ticks,l.issued_ms,l.session_id,l.lap';
const top=limit=>SERIES.map(()=>`SELECT session_id,lap FROM (SELECT l.session_id,l.lap ${ranked} ${order} LIMIT ${limit})`).join(' UNION ALL ');
const topValues=revision=>SERIES.flatMap(series=>[revision,series]);
export function retentionStatements(db,revision){
 const kept=top(REPLAY_LIMIT),values=topValues(revision);
 return [
  // Preserve all previously public evidence, including older revisions.
  db.prepare('INSERT OR IGNORE INTO verified_record_archive SELECT session_id,lap FROM verified_replays WHERE pinned=1'),
  // Sticky pin: a top-ten recording stays public while it remains among its series' retained set.
  db.prepare(`UPDATE verified_replays SET pinned=1 WHERE (session_id,lap) IN (${top(10)})`).bind(...values),
  db.prepare('INSERT OR IGNORE INTO verified_record_archive SELECT session_id,lap FROM verified_replays WHERE pinned=1'),
  db.prepare(`UPDATE verified_replays SET pinned=0 WHERE pinned=1 AND (session_id,lap) NOT IN (${kept})`).bind(...values),
  db.prepare(`DELETE FROM verified_replays WHERE review!='flagged' AND NOT EXISTS (SELECT 1 FROM verified_record_archive e WHERE e.session_id=verified_replays.session_id AND e.lap=verified_replays.lap) AND (session_id,lap) NOT IN (${kept}) AND NOT EXISTS (SELECT 1 FROM verified_lap_exclusions x WHERE x.session_id=verified_replays.session_id AND x.lap=verified_replays.lap)`).bind(...values),
  db.prepare('DELETE FROM verified_reports WHERE (session_id,lap) NOT IN (SELECT session_id,lap FROM verified_replays)')
 ];
}
export async function replayStatements(env,lap,data,now,login){
 const statements=[];
 if(lap.replayHash&&data.replay!==undefined){
  if(typeof data.replay!=='string'||data.replay.length>900000||(data.replay.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.replay))||await hash(data.replay)!==lap.replayHash)
   throw Object.assign(Error('Recording does not match the signed lap'),{status:400});
  // Skip the write when the lap cannot enter its series' retained set.
  statements.push(env.DB.prepare(`INSERT OR IGNORE INTO verified_replays
   (session_id,lap,payload,payload_hash,expires_ms) SELECT ?,?,?,?,?
   WHERE EXISTS (SELECT 1 FROM verified_laps WHERE session_id=? AND lap=?)
   AND (SELECT COUNT(*) FROM (SELECT 1 ${ranked} AND (l.lap_ticks,l.issued_ms,l.session_id,l.lap)<(?,?,?,?) LIMIT ${REPLAY_LIMIT}))<${REPLAY_LIMIT}
   ${login?`AND EXISTS (SELECT 1 FROM verified_login_sessions WHERE token_hash=? AND expires_ms>MAX(?,${databaseNowSQL}) AND secret_hash=? AND player_hash=?)`:''}`)
   .bind(lap.sessionId,lap.lap,data.replay,lap.replayHash,lap.issuedAt+30*86400000,lap.sessionId,lap.lap,
    lap.revision,await seriesFor(env.DB,lap.playerHash),lap.lapTicks,lap.issuedAt,lap.sessionId,lap.lap,
    ...(login?[login.tokenHash,Date.now(),login.secretHash,lap.playerHash]:[])));
 }
 statements.push(...retentionStatements(env.DB,lap.revision));
 return statements;
}
export async function seriesFor(db,playerHash){
 return (await db.prepare(`SELECT ${seriesOf('?')} AS series`).bind(playerHash).first())?.series||'human';
}
const validNote=value=>value===undefined||typeof value==='string'&&value.trim().length<=200&&!/[\p{Cc}\p{Cf}]/u.test(value);
const REPORTS_PER_DAY=30;
// Signed-in viewers report a public recording once each; it joins the review queue and is
// retained until reviewed. The result itself stays on the leaderboard.
export async function reportReplay(env,data,playerHash,revision,now,reply){
 const lap=Number(data?.lap);
 if(!/^[a-f0-9]{32}$/.test(data?.sessionId??'')||!Number.isSafeInteger(lap)||lap<1||lap>999999||
  !REPORT_REASONS.includes(data.reason)||!validNote(data.note))return reply({error:'Invalid report'},400);
 const target=await env.DB.prepare(`SELECT l.player_hash FROM verified_replays r JOIN verified_laps l USING(session_id,lap)
  WHERE r.session_id=? AND r.lap=? AND r.pinned=1 AND l.revision=?`).bind(data.sessionId,lap,revision).first();
 if(!target)return reply({error:'Recording unavailable'},404);
 if(target.player_hash===playerHash)return reply({error:'Own lap'},403);
 const recent=await env.DB.prepare('SELECT COUNT(*) AS n FROM verified_reports WHERE reporter_hash=? AND created_ms>?').bind(playerHash,now-86400000).first();
 if(recent.n>=REPORTS_PER_DAY)return reply({error:'Too many reports'},429);
 const note=(data.note??'').trim().normalize('NFC');
 const [inserted]=await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO verified_reports(session_id,lap,reporter_hash,reason,note,created_ms) VALUES (?,?,?,?,?,?)')
   .bind(data.sessionId,lap,playerHash,data.reason,note,now),
  env.DB.prepare(`UPDATE verified_replays SET review='flagged' WHERE session_id=? AND lap=?
   AND EXISTS (SELECT 1 FROM verified_reports WHERE session_id=? AND lap=? AND reporter_hash=? AND created_ms=?)`)
   .bind(data.sessionId,lap,data.sessionId,lap,playerHash,now)
 ]);
 if(!inserted.meta.changes)return reply({error:'Already reported'},409);
 return reply({reported:true});
}
export async function admin(request,env){
 if(typeof env.ANALYTICS_ADMIN_TOKEN!=='string'||env.ANALYTICS_ADMIN_TOKEN.length<32)return false;
 const a=await hash(request.headers.get('Authorization')?.replace(/^Bearer /,'')||''),b=await hash(env.ANALYTICS_ADMIN_TOKEN);
 let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;
}
export async function replayRoute(request,env,url,reply,headers,readBody,revision){
 const privateRoute=url.pathname.startsWith('/api/verified/admin/');
 if(privateRoute&&!await admin(request,env))return reply({error:'Unauthorized'},401);
 if(privateRoute&&url.pathname==='/api/verified/admin/lap-status'){
  if(request.method!=='GET')return reply({error:'GET required'},405);
  const id=url.searchParams.get('sessionId'),lap=Number(url.searchParams.get('lap'));
  if(!/^[a-f0-9]{32}$/.test(id||'')||!Number.isSafeInteger(lap)||lap<1)return reply({error:'Invalid lap identifier'},400);
  const row=await env.DB.prepare(`SELECT l.session_id,l.lap,l.revision,l.issued_ms,l.lap_ticks,
   ${guestNameSQL} nickname,${seriesOf('l.player_hash')} series,
   r.pinned,r.payload_hash,x.reason exclusion,e.receipt,e.replay_hash,
   CASE WHEN a.player_hash IS NOT NULL THEN 'account' WHEN g.player_hash IS NOT NULL THEN 'guest' ELSE 'unknown' END owner_type,
   CASE WHEN ar.session_id IS NULL THEN 0 ELSE 1 END archived
   FROM verified_laps l ${principalJoins}
   LEFT JOIN verified_replays r USING(session_id,lap)
   LEFT JOIN verified_lap_exclusions x USING(session_id,lap)
   LEFT JOIN verified_lap_evidence e USING(session_id,lap)
   LEFT JOIN verified_record_archive ar USING(session_id,lap)
   WHERE l.session_id=? AND l.lap=?`).bind(id,lap).first();
  const failure=await env.DB.prepare('SELECT reason,at_ms FROM verified_lap_upload_failures WHERE session_id=? AND lap=?').bind(id,lap).first();
  if(!row)return reply({status:failure?'upload_rejected':'not_received',sessionId:id,lap,failure,detail:'No accepted upload. Inspect client upload queue and verification server diagnostics.'});
  const reasons=[];
  if(row.owner_type==='unknown')reasons.push('unknown_owner');
  if(row.revision!==revision)reasons.push('old_revision');
  if(row.exclusion)reasons.push('excluded:'+row.exclusion);
  if(!row.payload_hash)reasons.push('replay_not_retained');
  else if(!row.pinned)reasons.push('outside_public_set');
  let rank=null;
  if(!reasons.length){
   const better=await env.DB.prepare(`SELECT COUNT(*) n ${ranked} AND r.pinned=1
    AND (l.lap_ticks,l.issued_ms,l.session_id,l.lap)<(?,?,?,?)`)
    .bind(revision,row.series,row.lap_ticks,row.issued_ms,id,lap).first();
   rank=better.n+1;if(rank>10)reasons.push('outside_top_ten');
  }
  return reply({...row,status:reasons.length?'not_listed':'listed',rank,reasons,last_upload_failure:failure});
 }
 if(privateRoute&&url.pathname==='/api/verified/admin/laps'){
  if(request.method==='GET'){
   const series=url.searchParams.get('series')||'human';
   if(!SERIES.includes(series))return reply({error:'Invalid series'},400);
   const rows=await env.DB.prepare(`SELECT l.session_id,l.lap,l.nickname,l.lap_ticks,l.issued_ms,l.sector1,l.sector2,l.sector3,
    CASE WHEN x.session_id IS NULL THEN 0 ELSE 1 END AS excluded
    FROM verified_laps l LEFT JOIN verified_lap_exclusions x USING(session_id,lap)
    WHERE l.revision=? AND ${seriesOf('l.player_hash')}=?
    ORDER BY l.lap_ticks,l.issued_ms,l.session_id,l.lap LIMIT 100`).bind(revision,series).all();
   return reply({series,results:rows.results.map(row=>({...row,lap_ms:row.lap_ticks*1000/120}))});
  }
  if(request.method==='POST'&&url.searchParams.get('reset')==='1'){
   // Exclude old track times from records without deleting laps or championship entries.
   await env.DB.prepare(`INSERT OR IGNORE INTO verified_lap_exclusions(session_id,lap,reason,created_ms)
    SELECT session_id,lap,'track_reset',? FROM verified_laps WHERE revision=?`).bind(Date.now(),revision).run();
   await env.DB.batch(retentionStatements(env.DB,revision));
   return reply({reset:true});
  }
  if(request.method==='POST'){
   const id=url.searchParams.get('sessionId'),lap=Number(url.searchParams.get('lap'));
   if(!/^[a-f0-9]{32}$/.test(id||'')||!Number.isSafeInteger(lap)||lap<1||lap>999999)return reply({error:'Invalid lap identifier'},400);
   const exists=await env.DB.prepare('SELECT 1 FROM verified_laps WHERE session_id=? AND lap=?').bind(id,lap).first();
   if(!exists)return reply({error:'Lap not found'},404);
   if(url.searchParams.get('restore')==='1')await env.DB.prepare('DELETE FROM verified_lap_exclusions WHERE session_id=? AND lap=?').bind(id,lap).run();
   else await env.DB.prepare(`INSERT OR REPLACE INTO verified_lap_exclusions(session_id,lap,reason,created_ms) VALUES (?,?,'admin',?)`).bind(id,lap,Date.now()).run();
   await env.DB.batch(retentionStatements(env.DB,revision));
   return reply({updated:true});
  }
  return reply({error:'Method not allowed'},405);
 }
 const reports=url.pathname.match(/^\/api\/verified\/admin\/replays\/([a-f0-9]{32})\/([1-9][0-9]{0,5})\/reports$/);
 if(reports){
  if(request.method!=='GET')return reply({error:'GET required'},405);
  const rows=await env.DB.prepare(`SELECT p.reason,p.note,p.created_ms,a.nickname AS reporter FROM verified_reports p
   LEFT JOIN verified_accounts a ON a.player_hash=p.reporter_hash WHERE p.session_id=? AND p.lap=? ORDER BY p.created_ms DESC LIMIT 100`)
   .bind(reports[1],Number(reports[2])).all();
  return reply({results:rows.results});
 }
 if(privateRoute&&url.pathname==='/api/verified/admin/series'){
  if(request.method!=='POST')return reply({error:'POST required'},405);
  const data=await readBody(request),lap=Number(data?.lap);
  if(!/^[a-f0-9]{32}$/.test(data?.sessionId??'')||!Number.isSafeInteger(lap)||!SERIES.includes(data.series))return reply({error:'Invalid series change'},400);
  const owner=await env.DB.prepare('SELECT player_hash FROM verified_laps WHERE session_id=? AND lap=?').bind(data.sessionId,lap).first();
  if(!owner)return reply({error:'Lap not found'},404);
  // Moves the whole account, then recomputes both series' pins and retained recordings.
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO verified_account_series(player_hash,series,changed_ms) VALUES (?,?,?)
    ON CONFLICT(player_hash) DO UPDATE SET series=excluded.series,changed_ms=excluded.changed_ms`).bind(owner.player_hash,data.series,Date.now()),
   ...retentionStatements(env.DB,revision)
  ]);
  return reply({ok:true,series:data.series});
 }
 const match=url.pathname.match(/^\/api\/verified\/(admin\/)?replays\/([a-f0-9]{32})\/([1-9][0-9]{0,5})$/);
 if(match){
  const [,isAdmin,id,lap]=match;
  if(request.method==='POST'&&isAdmin){
   const data=await readBody(request);
   if(!['unreviewed','flagged','reviewed'].includes(data.review))return reply({error:'Invalid review status'},400);
   // A review status ends the retention exception; the next cleanup removes recordings outside the retained set.
   const result=await env.DB.prepare('UPDATE verified_replays SET review=? WHERE session_id=? AND lap=?')
    .bind(data.review,id,Number(lap)).run();
   return result.meta.changes?reply({ok:true}):reply({error:'Recording unavailable'},404);
  }
  if(request.method!=='GET')return reply({error:'GET required'},405);
  const r=await env.DB.prepare(`SELECT r.payload FROM verified_replays r JOIN verified_laps l USING(session_id,lap)
   WHERE r.session_id=? AND r.lap=? AND ${isAdmin?"(? IS NOT NULL)":'l.revision=? AND r.pinned=1'}`)
   .bind(id,Number(lap),revision).first();
  if(!r)return reply({error:'Recording unavailable'},404);
  const bytes=Uint8Array.from(atob(r.payload),c=>c.charCodeAt(0));
  return new Response(bytes,{encodeBody:'manual',headers:{...headers,'Content-Type':'application/json','Content-Encoding':'gzip'}});
 }
 if(privateRoute&&url.pathname==='/api/verified/admin/replays'&&request.method==='GET'){
  const offset=Number(url.searchParams.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)return reply({error:'Invalid offset'},400);
  const flagged=url.searchParams.get('flagged')==='1';
  const rows=await env.DB.prepare(`SELECT l.session_id,l.lap,l.nickname,l.revision,l.lap_ticks,l.sector1,l.sector2,l.sector3,l.issued_ms,
   CASE WHEN r.session_id IS NOT NULL AND (? IS NOT NULL) THEN 1 ELSE 0 END AS replay_available,r.pinned,r.review,length(r.payload) AS bytes,
   ${seriesOf('l.player_hash')} AS series,
   (SELECT COUNT(*) FROM verified_reports p WHERE p.session_id=l.session_id AND p.lap=l.lap) AS reports
   FROM verified_laps l LEFT JOIN verified_replays r USING(session_id,lap)
   ${flagged?"WHERE r.review='flagged'":''} ORDER BY l.issued_ms DESC,l.session_id,l.lap DESC LIMIT 51 OFFSET ?`).bind(revision,offset).all();
  return reply({results:rows.results.slice(0,50),hasMore:rows.results.length>50});
 }
 return reply({error:'Not found'},404);
}
