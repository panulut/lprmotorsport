// Embedded into worker.mjs by build:worker; the deployed Worker stays one module.
const LAP_POLICY = {"minSectorMs":[3884,3110,5307],"recordRatio":0.9,"timingToleranceMs":2000,"supersededGraceMs":5000};
const PROTECTION = 'timed-v1';
const publicLap = "NOT EXISTS (SELECT 1 FROM lap_moderation m WHERE m.lap_id = laps.id AND m.state != 'approved')";
const LAP_SECURITY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS lap_sessions (
    id TEXT PRIMARY KEY, version TEXT NOT NULL, player_hash TEXT NOT NULL, nickname TEXT NOT NULL,
    request_id TEXT NOT NULL, started_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL,
    closed_ms INTEGER, finished_ms INTEGER, invalid_ms INTEGER, UNIQUE(version,player_hash,request_id))`,
  'CREATE INDEX IF NOT EXISTS lap_sessions_player ON lap_sessions(player_hash,finished_ms,closed_ms)',
  'CREATE INDEX IF NOT EXISTS lap_sessions_expiry ON lap_sessions(expires_ms)',
  `CREATE TABLE IF NOT EXISTS lap_moderation (
    lap_id INTEGER PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('approved','quarantined','hidden')),
    reason TEXT NOT NULL, updated_ms INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS lap_moderation_state ON lap_moderation(state,lap_id)',
  `CREATE TABLE IF NOT EXISTS lap_moderation_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, lap_id INTEGER NOT NULL, previous_state TEXT NOT NULL,
    next_state TEXT NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS lap_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS lap_limits_expiry ON lap_limits(expires)',
  // Hide the identified forged result without deleting it or its legacy copy.
  `INSERT OR IGNORE INTO lap_moderation(lap_id,state,reason,updated_ms)
    SELECT id,'hidden','Identified forged result: 12.345 s',0 FROM laps
    WHERE version='lut-20261011-v3' AND nickname='OTTAKAA SIITÄ'
      AND lap_ms=12345 AND sector1=4000 AND sector2=4000 AND sector3=4345`
];
const validLapToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validLapName = value => typeof value === 'string' && /^[\p{L}\p{N} _.-]{1,24}$/u.test(value);
async function readLapBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return {error:'JSON required',status:415};
  const reader=request.body?.getReader();
  if(!reader)return {error:'Missing body',status:400};
  let size=0;const chunks=[];
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>2048){await reader.cancel();return {error:'Body too large',status:413};}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return {data:JSON.parse(new TextDecoder().decode(bytes))};}catch{return {error:'Invalid JSON',status:400};}
}
async function limitLapRequest(request,env,player,kind,now) {
  const ip=await hash(request.headers.get('CF-Connecting-IP')||'unknown');
  const minute=Math.floor(now/60000);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM lap_limits WHERE expires < ?').bind(now),
    env.DB.prepare('DELETE FROM lap_sessions WHERE expires_ms < ?').bind(now)
  ]);
  for(const [key,max] of [[`p:${kind}:${player}:${minute}`,12],[`i:${kind}:${ip}:${minute}`,60]]){
    const row=await env.DB.prepare(`INSERT INTO lap_limits(key,attempts,expires) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts`).bind(key,now+120000).first();
    if(row.attempts>max)return false;
  }
  return true;
}
async function lapReply(env,lap,player,saved,reply) {
  const review=await env.DB.prepare('SELECT state FROM lap_moderation WHERE lap_id=?').bind(lap.id).first();
  const state=review?.state??'approved';
  if(state!=='approved')return reply({mode:'laps',protection:PROTECTION,saved,lapMs:lap.lap_ms,
    moderation:state,rank:null,inTop10:false,record:false},202);
  const rank=await env.DB.prepare(`SELECT COUNT(*)+1 AS rank FROM laps WHERE version=? AND ${publicLap}
    AND (lap_ms<? OR (lap_ms=? AND id<?))`).bind(VERSION,lap.lap_ms,lap.lap_ms,lap.id).first();
  const personal=await env.DB.prepare(`SELECT MIN(lap_ms) AS lap_ms FROM laps WHERE version=? AND player_hash=? AND ${publicLap}`).bind(VERSION,player).first();
  const other=await env.DB.prepare(`SELECT MIN(lap_ms) AS lap_ms FROM laps WHERE version=? AND id!=? AND ${publicLap}`).bind(VERSION,lap.id).first();
  return reply({mode:'laps',protection:PROTECTION,moderation:state,saved,lapMs:lap.lap_ms,bestMs:personal.lap_ms,
    rank:rank.rank,inTop10:rank.rank<=10,record:saved&&(other.lap_ms===null||lap.lap_ms<other.lap_ms)});
}
async function securedLapRoute(request,env,url,reply) {
  await ensureLaps(env.DB);
  if(url.pathname==='/api/leaderboard'&&request.method==='GET'){
    const rows=await env.DB.prepare(`SELECT nickname,lap_ms,sector1,sector2,sector3 FROM laps
      WHERE version=? AND ${publicLap} ORDER BY lap_ms,id LIMIT 10`).bind(VERSION).all();
    return reply({version:VERSION,mode:'laps',protection:PROTECTION,results:rows.results});
  }
  if(!['/api/laps','/api/laps/start'].includes(url.pathname))return reply({error:'Not found'},404);
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!validLapToken(token))return reply({error:'Invalid player token'},401);
  const player=await hash(token),now=Date.now(),starting=url.pathname.endsWith('/start');
  if(!await limitLapRequest(request,env,player,starting?'start':'finish',now))return reply({error:'Too many requests; retry later'},429);
  const body=await readLapBody(request);
  if(body.error)return reply({error:body.error},body.status);
  const data=body.data;
  const nickname=typeof data?.nickname==='string'?data.nickname.trim():'';
  if(data?.version!==VERSION||!validLapName(nickname))return reply({error:'Invalid lap'},400);
  if(starting){
    if(!validLapToken(data.requestId))return reply({error:'Invalid start request'},400);
    const existing=await env.DB.prepare('SELECT * FROM lap_sessions WHERE version=? AND player_hash=? AND request_id=?')
      .bind(VERSION,player,data.requestId).first();
    if(existing){
      if(existing.nickname!==nickname)return reply({error:'Start request already used'},409);
      return reply({mode:PROTECTION,lapId:existing.id,startedAt:existing.started_ms,expiresAt:existing.expires_ms});
    }
    const id=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO lap_sessions(id,version,player_hash,nickname,request_id,started_ms,expires_ms)
        VALUES (?,?,?,?,?,?,?)`).bind(id,VERSION,player,nickname,data.requestId,now,now+86400000),
      env.DB.prepare(`UPDATE lap_sessions SET closed_ms=? WHERE player_hash=? AND finished_ms IS NULL AND closed_ms IS NULL
        AND id!=? AND EXISTS(SELECT 1 FROM lap_sessions WHERE id=?)`).bind(now,player,id,id)
    ]);
    const session=await env.DB.prepare('SELECT * FROM lap_sessions WHERE version=? AND player_hash=? AND request_id=?')
      .bind(VERSION,player,data.requestId).first();
    if(session.nickname!==nickname)return reply({error:'Start request already used'},409);
    return reply({mode:PROTECTION,lapId:session.id,startedAt:session.started_ms,expiresAt:session.expires_ms});
  }
  if(data.protocol!==PROTECTION||!validLapToken(data.lapId))return reply({error:'A server-issued lap start is required'},428);
  const sectors=data.sectors;
  if(!Number.isSafeInteger(data.lapMs)||data.lapMs<=5000||data.lapMs>86400000||!Array.isArray(sectors)||sectors.length!==3||
    !sectors.every(n=>Number.isSafeInteger(n)&&n>0)||sectors.reduce((a,b)=>a+b,0)!==data.lapMs)return reply({error:'Invalid lap'},400);
  const find=()=>env.DB.prepare('SELECT * FROM laps WHERE version=? AND player_hash=? AND lap_id=?').bind(VERSION,player,data.lapId).first();
  const matches=lap=>lap.nickname===nickname&&lap.lap_ms===data.lapMs&&[lap.sector1,lap.sector2,lap.sector3].every((n,i)=>n===sectors[i]);
  const existing=await find();
  if(existing)return matches(existing)?lapReply(env,existing,player,false,reply):reply({error:'Lap ID already used for another lap'},409);
  const session=await env.DB.prepare('SELECT * FROM lap_sessions WHERE id=? AND player_hash=? AND version=?')
    .bind(data.lapId,player,VERSION).first();
  if(!session||session.nickname!==nickname)return reply({error:'Unknown lap start'},403);
  if(session.invalid_ms!==null)return reply({error:'Lap start invalidated'},403);
  if(session.expires_ms<now)return reply({error:'Lap start expired'},410);
  // Reject early finishes rather than letting a later retry legalize them.
  const elapsed=(session.closed_ms??now)-session.started_ms;
  if(elapsed+LAP_POLICY.timingToleranceMs<data.lapMs){
    await env.DB.prepare('UPDATE lap_sessions SET invalid_ms=COALESCE(invalid_ms,?) WHERE id=? AND finished_ms IS NULL').bind(now,data.lapId).run();
    return reply({error:'Lap finished too soon'},422);
  }
  const reasons=[];
  if(elapsed>data.lapMs+LAP_POLICY.timingToleranceMs)reasons.push('timing_mismatch');
  if(session.closed_ms!==null&&now-session.closed_ms>LAP_POLICY.supersededGraceMs)reasons.push('superseded_start');
  if(sectors.some((n,i)=>n<LAP_POLICY.minSectorMs[i]))reasons.push('sector_below_physical_estimate');
  const best=await env.DB.prepare(`SELECT MIN(lap_ms) AS lap_ms FROM laps WHERE version=? AND ${publicLap}`).bind(VERSION).first();
  if(best.lap_ms!==null&&data.lapMs<best.lap_ms*LAP_POLICY.recordRatio)reasons.push('record_jump');
  const state=reasons.length?'quarantined':'approved';
  const result=await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO laps(version,player_hash,lap_id,nickname,lap_ms,sector1,sector2,sector3)
      SELECT ?,?,?,?,?,?,?,? FROM lap_sessions WHERE id=? AND invalid_ms IS NULL AND expires_ms>=?`)
      .bind(VERSION,player,data.lapId,nickname,data.lapMs,...sectors,data.lapId,now),
    env.DB.prepare(`INSERT OR IGNORE INTO lap_moderation(lap_id,state,reason,updated_ms)
      SELECT id,?,?,? FROM laps WHERE version=? AND player_hash=? AND lap_id=?`).bind(state,reasons.join(','),now,VERSION,player,data.lapId),
    env.DB.prepare('UPDATE lap_sessions SET finished_ms=COALESCE(finished_ms,?) WHERE id=?').bind(now,data.lapId)
  ]);
  const lap=await find();
  if(!lap)return reply({error:'Lap start invalidated'},409);
  if(!matches(lap))return reply({error:'Lap ID already used for another lap'},409);
  return lapReply(env,lap,player,result[0].meta.changes>0,reply);
}
async function lapAdminRoute(request,env,url,reply) {
  await ensureLaps(env.DB);
  if(url.pathname==='/api/admin/laps'){
    if(request.method!=='GET')return reply({error:'Method not allowed'},405);
    const state=url.searchParams.get('state')||'quarantined';
    if(!['all','approved','quarantined','hidden'].includes(state))return reply({error:'Invalid state'},400);
    const offset=Math.max(0,Math.min(1000000,Math.floor(Number(url.searchParams.get('offset'))||0)));
    const rows=await env.DB.prepare(`SELECT laps.id,version,nickname,lap_ms,sector1,sector2,sector3,
      COALESCE(m.state,'approved') AS state,COALESCE(m.reason,'legacy_unverified') AS reason,m.updated_ms
      FROM laps LEFT JOIN lap_moderation m ON m.lap_id=laps.id
      WHERE (?='all' OR COALESCE(m.state,'approved')=?) ORDER BY laps.id DESC LIMIT 101 OFFSET ?`).bind(state,state,offset).all();
    return reply({results:rows.results.slice(0,100),hasMore:rows.results.length>100,offset});
  }
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  const body=await readLapBody(request);if(body.error)return reply({error:body.error},body.status);
  const data=body.data;
  if(!Number.isSafeInteger(data?.id)||data.id<1||!['approved','quarantined','hidden'].includes(data.state)||
    typeof data.reason!=='string'||!data.reason.trim()||data.reason.length>200)return reply({error:'Invalid moderation'},400);
  const lap=await env.DB.prepare('SELECT id FROM laps WHERE id=?').bind(data.id).first();
  if(!lap)return reply({error:'Lap not found'},404);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO lap_moderation_audit(lap_id,previous_state,next_state,reason,at)
      SELECT id,COALESCE((SELECT state FROM lap_moderation WHERE lap_id=laps.id),'approved'),?,?,? FROM laps WHERE id=?`)
      .bind(data.state,data.reason.trim(),Date.now(),data.id),
    env.DB.prepare(`INSERT INTO lap_moderation(lap_id,state,reason,updated_ms) VALUES (?,?,?,?)
      ON CONFLICT(lap_id) DO UPDATE SET state=excluded.state,reason=excluded.reason,updated_ms=excluded.updated_ms`)
      .bind(data.id,data.state,data.reason.trim(),Date.now())
  ]);
  return reply({ok:true,id:data.id,state:data.state});
}
