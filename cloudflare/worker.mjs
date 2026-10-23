// Paste this entire module into the Cloudflare Worker editor. Bind D1 as DB.
const VERSION = 'lut-20261011-v3';
const ORIGINS = new Set(['https://panulut.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000']);
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');

// Upgrade existing D1 databases automatically; keep the legacy table intact.
const ready = new WeakMap();
async function ensureLaps(db) {
  if (!ready.has(db)) {
    const upgrade = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS laps (
        id INTEGER PRIMARY KEY AUTOINCREMENT, version TEXT NOT NULL,
        player_hash TEXT NOT NULL, lap_id TEXT NOT NULL, nickname TEXT NOT NULL,
        lap_ms INTEGER NOT NULL CHECK(lap_ms > 5000), sector1 INTEGER NOT NULL,
        sector2 INTEGER NOT NULL, sector3 INTEGER NOT NULL,
        UNIQUE(version, player_hash, lap_id))`),
      db.prepare('CREATE INDEX IF NOT EXISTS laps_order ON laps(version, lap_ms, id)'),
      db.prepare(`INSERT OR IGNORE INTO laps(version, player_hash, lap_id, nickname, lap_ms, sector1, sector2, sector3)
        SELECT version, player_hash, 'legacy', nickname, lap_ms, sector1, sector2, sector3 FROM best_laps`),
      ...LAP_SECURITY_SCHEMA.map(sql => db.prepare(sql))
    ]).catch(error => { ready.delete(db); throw error; });
    ready.set(db, upgrade);
  }
  await ready.get(db);
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => { await ensureAnalytics(env.DB); await cleanAnalytics(env.DB); })());
  },
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !ORIGINS.has(origin)) return reply({ error: 'Origin denied' }, 403);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    }
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/analytics/') || url.pathname.startsWith('/api/admin/') || url.pathname === '/admin') {
      try { return await analyticsRoute(request, env, url, reply); }
      catch (error) { console.error('Analytics operation failed', error.message); return reply({ error: 'Analytics unavailable' }, 503); }
    }
    if (url.pathname === '/' && request.method === 'GET') return reply({ service: 'LPR leaderboard', version: VERSION, protection: PROTECTION });
    try {
      return await securedLapRoute(request, env, url, reply);
    } catch (error) {
      console.error('Leaderboard database operation failed', error);
      return reply({ error: 'Leaderboard unavailable' }, 503);
    }
  }
};

// BEGIN LAP SECURITY
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
// END LAP SECURITY

// Analytics is isolated from leaderboard availability and identity.
const ANALYTICS_RETENTION = 90 * 86400000;
const analyticsReady = new WeakMap();
const ANALYTICS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS analytics_events (
    player_hash TEXT NOT NULL, session_id TEXT NOT NULL, event_id TEXT NOT NULL,
    nickname TEXT NOT NULL, version TEXT NOT NULL, kind TEXT NOT NULL,
    state TEXT NOT NULL, input TEXT NOT NULL, duration_ms INTEGER NOT NULL,
    lap_ms INTEGER, code TEXT NOT NULL, at INTEGER NOT NULL, received INTEGER NOT NULL,
    metadata TEXT NOT NULL, consent_at INTEGER NOT NULL, PRIMARY KEY(player_hash, session_id, event_id))`,
  'CREATE INDEX IF NOT EXISTS analytics_time ON analytics_events(at)',
  'CREATE INDEX IF NOT EXISTS analytics_player_time ON analytics_events(player_hash, at)',
  `CREATE TABLE IF NOT EXISTS analytics_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS analytics_limits_expiry ON analytics_limits(expires)',
  // Tombstones prevent an already queued beacon from recreating a deleted profile.
  'CREATE TABLE IF NOT EXISTS analytics_deleted (player_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)'
];
async function ensureAnalytics(db) {
  if (!analyticsReady.has(db)) analyticsReady.set(db, db.batch(ANALYTICS_SCHEMA.map(sql => db.prepare(sql))).catch(e => { analyticsReady.delete(db); throw e; }));
  await analyticsReady.get(db);
}
async function cleanAnalytics(db) {
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM analytics_events WHERE at < ?').bind(now - ANALYTICS_RETENTION),
    db.prepare('DELETE FROM analytics_limits WHERE expires < ?').bind(now),
    db.prepare('DELETE FROM analytics_deleted WHERE expires < ?').bind(now)
  ]);
}
async function readAnalyticsBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return { error: 'JSON required', status: 415 };
  const reader = request.body?.getReader();
  if (!reader) return { error: 'Missing body', status: 400 };
  let size = 0; const chunks = [];
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 32768) { await reader.cancel(); return { error: 'Body too large', status: 413 }; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return { data: JSON.parse(new TextDecoder().decode(bytes)) }; }
  catch { return { error: 'Invalid JSON', status: 400 }; }
}
const analyticsToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const eventKinds = new Set(['session_start','play_start','time','lap_start','lap_complete','state_change','restart','leaderboard_open','page_hide','error']);
const eventStates = new Set(['menu','driving','sauna','shop','pool','crashed','idle']);
const eventInputs = new Set(['unknown','keyboard','touch','mouse','gamepad']);
function validAnalytics(data, now) {
  if (!data || !Number.isSafeInteger(data.consentAt) || data.consentAt > now + 300000 || data.consentAt < now - 180 * 86400000 || !analyticsToken(data.token) || !analyticsToken(data.session) || typeof data.version !== 'string' || !/^[a-zA-Z0-9_.-]{1,60}$/.test(data.version) || !Array.isArray(data.events) || !data.events.length || data.events.length > 40) return false;
  const m = data.meta;
  if (!m || !['mobile','desktop'].includes(m.device) || !['Edge','Firefox','Chrome','Safari','other'].includes(m.browser) || !['Android','iOS','Windows','macOS','Linux','other'].includes(m.os) || !Number.isInteger(m.width) || m.width < 0 || m.width > 10000 || !Number.isInteger(m.height) || m.height < 0 || m.height > 10000 || typeof m.language !== 'string' || !/^[a-zA-Z0-9-]{0,20}$/.test(m.language) || typeof m.referrer !== 'string' || !/^[a-zA-Z0-9.:-]{0,200}$/.test(m.referrer)) return false;
  let duration = 0;
  for (const e of data.events) {
    if (!e || !analyticsToken(e.id) || !eventKinds.has(e.type) || !eventStates.has(e.state) || !eventInputs.has(e.input) || typeof e.nickname !== 'string' || !/^[\p{L}\p{N} _.-]{0,24}$/u.test(e.nickname) || !Number.isSafeInteger(e.at) || e.at < now - ANALYTICS_RETENTION || e.at > now + 300000) return false;
    if (e.type === 'time') { if (!Number.isSafeInteger(e.ms) || e.ms < 1 || e.ms > 60000) return false; duration += e.ms; }
    if (e.type === 'lap_complete' && (!Number.isSafeInteger(e.lapMs) || e.lapMs <= 5000 || e.lapMs > 86400000)) return false;
    if (e.type === 'error' && !['runtime','promise'].includes(e.code)) return false;
  }
  return duration <= 120000;
}
const reportTotals = `COUNT(DISTINCT player_hash) AS players, COUNT(DISTINCT session_id) AS sessions,
 COUNT(DISTINCT CASE WHEN kind='play_start' THEN session_id END) AS played_sessions,
 SUM(CASE WHEN kind='time' AND state!='idle' THEN duration_ms ELSE 0 END) AS active_ms,
 SUM(CASE WHEN kind='time' AND state='idle' THEN duration_ms ELSE 0 END) AS idle_ms,
 SUM(CASE WHEN kind='lap_start' THEN 1 ELSE 0 END) AS laps_started,
 SUM(CASE WHEN kind='lap_complete' THEN 1 ELSE 0 END) AS laps_completed,
 MIN(CASE WHEN kind='lap_complete' THEN lap_ms END) AS best_lap_ms,
 MIN(at) AS first_seen, MAX(at) AS last_seen`;
async function analyticsRoute(request, env, url, reply) {
  // Public HTML is only a login shell. Every data route checks a server-side secret.
  if (url.pathname === '/admin' && request.method === 'GET') return new Response(ADMIN_HTML, { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  }});
  const admin = url.pathname.startsWith('/api/admin/');
  const bearer = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (admin) {
    if (typeof env.ANALYTICS_ADMIN_TOKEN !== 'string' || env.ANALYTICS_ADMIN_TOKEN.length < 32) return reply({ error: 'Admin access not configured' }, 503);
    // Fixed-length digests avoid content-dependent token comparison.
    const [a,b] = await Promise.all([hash(bearer || ''), hash(env.ANALYTICS_ADMIN_TOKEN)]);
    let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    if (difference) return reply({ error: 'Unauthorized' }, 401);
  }
  if (admin && ['/api/admin/laps','/api/admin/laps/moderate'].includes(url.pathname)) return lapAdminRoute(request, env, url, reply);
  if (url.pathname === '/api/analytics/me' && !analyticsToken(bearer)) return reply({ error: 'Invalid player token' }, 401);
  const known = new Set(['/api/analytics/events','/api/analytics/me','/api/admin/summary','/api/admin/player','/api/admin/delete']);
  if (!known.has(url.pathname)) return reply({ error: 'Not found' }, 404);
  const expected = url.pathname.endsWith('/events') ? 'POST' : url.pathname.endsWith('/me') || url.pathname.endsWith('/delete') ? 'DELETE' : 'GET';
  if (request.method !== expected) return reply({ error: 'Method not allowed' }, 405);
  // Validate before touching the database, including streamed request size limits.
  let payload;
  if (expected === 'POST') {
    const body = await readAnalyticsBody(request);
    if (body.error) return reply({ error: body.error }, body.status);
    payload = body.data;
    if (!validAnalytics(payload, Date.now())) return reply({ error: 'Invalid analytics' }, 400);
  }
  await ensureAnalytics(env.DB);
  await cleanAnalytics(env.DB);
  if (url.pathname === '/api/analytics/events') {
    const now = Date.now(), player = await hash(payload.token);
    if (await env.DB.prepare('SELECT player_hash FROM analytics_deleted WHERE player_hash = ?').bind(player).first()) return reply({ error: 'Profile deleted' }, 410);
    const window = Math.floor(now / 60000);
    // Short-lived IP hash is used solely for abuse prevention, never player reports.
    const ip = await hash(request.headers.get('CF-Connecting-IP') || 'unknown');
    for (const key of [`p:${player}:${window}`, `i:${ip}:${window}`]) {
      const row = await env.DB.prepare(`INSERT INTO analytics_limits(key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts`).bind(key, now + 120000).first();
      if (row.attempts > (key.startsWith('p:') ? 30 : 300)) return reply({ error: 'Too many requests' }, 429);
    }
    // Pick known fields only. Arbitrary extra metadata never reaches persistent storage.
    const m = payload.meta;
    const metadata = JSON.stringify({device:m.device,browser:m.browser,os:m.os,width:m.width,height:m.height,language:m.language,referrer:m.referrer});
    const statements = payload.events.map(e => env.DB.prepare(`INSERT OR IGNORE INTO analytics_events
      (player_hash,session_id,event_id,nickname,version,kind,state,input,duration_ms,lap_ms,code,at,received,metadata,consent_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM analytics_deleted WHERE player_hash=?)`)
      .bind(player,payload.session,e.id,e.nickname,payload.version,e.type,e.state,e.input,e.type==='time'?e.ms:0,e.type==='lap_complete'?e.lapMs:null,e.type==='error'?e.code:'',Math.min(e.at,now),now,metadata,payload.consentAt,player));
    await env.DB.batch(statements);
    return reply({ ok: true });
  }
  if (url.pathname === '/api/analytics/me' || url.pathname === '/api/admin/delete') {
    const player = admin ? url.searchParams.get('player') : await hash(bearer);
    if (!analyticsToken(player)) return reply({ error: 'Invalid player' }, 400);
    await env.DB.batch([
      env.DB.prepare('INSERT OR REPLACE INTO analytics_deleted(player_hash,expires) VALUES (?,?)').bind(player,Date.now()+ANALYTICS_RETENTION),
      env.DB.prepare('DELETE FROM analytics_events WHERE player_hash=?').bind(player)
    ]);
    return reply({ ok: true });
  }
  const days = Math.max(1,Math.min(90,Number(url.searchParams.get('days')) || 7));
  const since = Date.now() - days * 86400000;
  const offset = Math.max(0,Math.min(1000000,Math.floor(Number(url.searchParams.get('offset')) || 0)));
  if (url.pathname === '/api/admin/summary') {
    const totals = await env.DB.prepare(`SELECT ${reportTotals} FROM analytics_events WHERE at>=?`).bind(since).first();
    const daily = await env.DB.prepare(`SELECT date(at/1000,'unixepoch') AS day, ${reportTotals} FROM analytics_events WHERE at>=? GROUP BY day ORDER BY day`).bind(since).all();
    const players = await env.DB.prepare(`SELECT player_hash, ${reportTotals},
      (SELECT nickname FROM analytics_events b WHERE b.player_hash=a.player_hash AND nickname!='' ORDER BY at DESC LIMIT 1) AS nickname
      FROM analytics_events a WHERE at>=? GROUP BY player_hash ORDER BY last_seen DESC LIMIT 101 OFFSET ?`).bind(since,offset).all();
    const states = await env.DB.prepare(`SELECT state,SUM(duration_ms) AS ms FROM analytics_events WHERE at>=? AND kind='time' GROUP BY state`).bind(since).all();
    const devices = await env.DB.prepare(`SELECT json_extract(metadata,'$.device') AS device,COUNT(DISTINCT session_id) AS sessions FROM analytics_events WHERE at>=? GROUP BY device`).bind(since).all();
    return reply({ totals, daily:daily.results, players:players.results.slice(0,100), hasMore:players.results.length>100, states:states.results, devices:devices.results, days, offset, retentionDays:90 });
  }
  const player = url.searchParams.get('player');
  if (!analyticsToken(player)) return reply({ error: 'Invalid player' },400);
  const totals = await env.DB.prepare(`SELECT ${reportTotals} FROM analytics_events WHERE player_hash=? AND at>=?`).bind(player,since).first();
  const events = await env.DB.prepare(`SELECT session_id,nickname,version,kind,state,input,duration_ms,lap_ms,code,at,metadata FROM analytics_events WHERE player_hash=? AND at>=? ORDER BY at DESC,event_id LIMIT 201 OFFSET ?`).bind(player,since,offset).all();
  return reply({ totals, events:events.results.slice(0,200), hasMore:events.results.length>200, days, offset });
}

const ADMIN_HTML = "<!doctype html><html lang=\"fi\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>LPR · Pelianalytiikka</title>\n<style>\n:root{color-scheme:dark;font:15px system-ui;background:#101815;color:#eaf3ed}body{max-width:1200px;margin:35px auto;padding:0 20px}h1{font-size:30px}small,.muted{color:#a5b9ad}button,input,select{font:inherit;padding:10px;border:1px solid #52745e;border-radius:6px;background:#192c21;color:inherit}button{cursor:pointer}button:hover{background:#284d35}button:disabled{opacity:.5;cursor:default}a{color:#b5ec91}.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin:24px 0}.card{padding:18px;background:#1c2b22;border:1px solid #38513e;border-radius:10px}.card strong{display:block;font-size:28px;margin-top:7px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:11px 9px;border-bottom:1px solid #304238;white-space:nowrap}th{color:#a9ceab}section{margin:28px 0}#status{min-height:24px;color:#ffdca3}#token{width:min(360px,80vw)}.danger{border-color:#ad766b}.bar{display:inline-block;background:#7abb59;height:9px;min-width:1px;border-radius:3px;margin-right:8px}details{margin:15px 0}[hidden]{display:none!important}\n</style>\n<h1>LPR <span class=\"muted\">/ Pelianalytiikka</span></h1><p class=\"muted\">Suostumuksen antaneiden selainten pelihistoria · säilytys 90 päivää</p>\n<form id=\"login\"><label for=\"token\">Ylläpitoavain</label> <input id=\"token\" type=\"password\" autocomplete=\"off\" required minlength=\"32\"> <button>Avaa tilastot</button><p><small>Avain säilyy vain tämän sivun muistissa. Älä jaa sitä pelaajille.</small></p></form>\n<p id=\"status\" role=\"status\"></p><main id=\"reports\" hidden>\n<div class=\"toolbar\"><label>Aikaväli <select id=\"days\"><option value=\"1\">24 tuntia</option><option value=\"7\" selected>7 päivää</option><option value=\"30\">30 päivää</option><option value=\"90\">90 päivää</option></select></label><button id=\"refresh\">Päivitä</button><button id=\"logout\">Lukitse</button></div>\n<div id=\"totals\" class=\"cards\"></div>\n<section><h2>Tuloslistan ylläpito</h2>\n<p>Vain hyväksytyt kierrokset näkyvät julkisella listalla. Piilotettu kierros säilyy tietokannassa ja sen voi palauttaa.</p>\n<div class=\"toolbar\"><label>Näytä <select id=\"lap-state\"><option value=\"quarantined\">Tarkistettavat</option><option value=\"hidden\">Piilotetut</option><option value=\"approved\">Hyväksytyt</option><option value=\"all\">Kaikki</option></select></label><button id=\"lap-refresh\">Päivitä kierrokset</button></div>\n<div id=\"lap-list\" class=\"scroll\"></div><p class=\"toolbar\"><button id=\"lap-previous\">Edelliset kierrokset</button><button id=\"lap-next\">Seuraavat kierrokset</button></p></section>\n<section><h2>Päivät <small>(UTC)</small></h2><div id=\"daily\" class=\"scroll\"></div></section>\n<section><h2>Ajankäyttö ja laitteet</h2><div id=\"states\"></div><p id=\"devices\"></p></section>\n<section><h2>Pelaajat <small>Selainprofiilit, eivät varmennetut henkilöt</small></h2><div id=\"players\" class=\"scroll\"></div><p class=\"toolbar\"><button id=\"previous\">Edelliset</button><button id=\"next\">Seuraavat</button></p></section>\n<section id=\"profile\" hidden><h2 id=\"profile-title\"></h2><div class=\"toolbar\"><button id=\"close-profile\">Sulje pelaajanäkymä</button><button class=\"danger\" id=\"delete-player\">Poista tämän profiilin analytiikka</button></div><div id=\"player-totals\" class=\"cards\"></div><p id=\"profile-note\"></p><div id=\"events\" class=\"scroll\"></div><p class=\"toolbar\"><button id=\"event-previous\">Uudemmat tapahtumat</button><button id=\"event-next\">Vanhemmat tapahtumat</button></p></section>\n<p><small>Aktiivinen aika edellyttää näkyvää ja kohdistettua peliä sekä toimintaa viimeisen kahden minuutin aikana. Tilastot ovat selaimen ilmoittamia; estäjät, suostumusvalinnat ja katkenneet yhteydet vaikuttavat kattavuuteen. Julkinen tuloslista on erillinen.</small></p></main>\n<script>\n'use strict';\nconst $=s=>document.querySelector(s);let secret='',offset=0,eventOffset=0,player='',playerName='',generation=0;\nlet lapOffset=0,lapGeneration=0;\nconst duration=ms=>((ms||0)/60000).toFixed(1)+' min';\nconst date=ms=>ms?new Date(ms).toLocaleString('fi-FI',{timeZone:'Europe/Helsinki'}):'—';\nconst labels={menu:'Valikko',driving:'Ajaminen',sauna:'Sauna',shop:'Kauppa',pool:'Palju',crashed:'Hajonnut auto',idle:'Toimeton',session_start:'Pelikerran alku',play_start:'Ajoon siirtyminen',time:'Ajankäyttö',lap_start:'Kierroksen alku',lap_complete:'Kierros valmis',state_change:'Tilan vaihto',restart:'Uudelleenaloitus',leaderboard_open:'Tuloslista',page_hide:'Sivu piilotettu',error:'Tekninen virhe'};\nasync function api(path,method='GET',body) {const r=await fetch(path,{method,headers:{Authorization:'Bearer '+secret,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(r.status===401?'Virheellinen ylläpitoavain.':r.status===503?'Palvelu ei ole käytettävissä. Tarkista käyttöönotto.':'Pyyntö epäonnistui ('+r.status+').');return r.json();}\nfunction table(target,headers,rows){const t=document.createElement('table'),head=t.createTHead().insertRow();for(const label of headers){const th=document.createElement('th');th.textContent=label;head.append(th);}const body=t.createTBody();for(const row of rows){const tr=body.insertRow();for(const value of row){const td=tr.insertCell();if(value instanceof Node)td.append(value);else td.textContent=value??'—';}}$(target).replaceChildren(t);}\nfunction cards(target,s){$(target).replaceChildren();for(const [label,value] of [['Pelaajaprofiileja',s.players||0],['Pelikertoja',s.sessions||0],['Ajon aloittaneita pelikertoja',s.played_sessions||0],['Aktiivista aikaa',duration(s.active_ms)],['Valmiita kierroksia',s.laps_completed||0],['Aloitettuja kierroksia',s.laps_started||0]]){const box=document.createElement('div');box.className='card';box.textContent=label;const strong=document.createElement('strong');strong.textContent=value;box.append(strong);$(target).append(box);}}\nfunction lock(){generation++;lapGeneration++;secret='';$('#token').value='';$('#reports').hidden=true;$('#login').hidden=false;$('#profile').hidden=true;for(const id of ['#totals','#daily','#states','#devices','#players','#events','#player-totals','#lap-list'])$(id).replaceChildren();player='';$('#status').textContent='Tilastot lukittu.';}\nconst lapReasons={timing_mismatch:'Palvelimen ajanmittaus poikkeaa ilmoitetusta ajasta',superseded_start:'Uudempi kierros on jo aloitettu',sector_below_physical_estimate:'Sektori alittaa varovaisen fysiikka-arvion',record_jump:'Yli 10 % nykyistä ennätystä nopeampi',legacy_unverified:'Vanha, teknisesti varmentamaton tulos'};\nasync function loadLaps(){const gen=++lapGeneration,loginGen=generation;try{const d=await api('/api/admin/laps?state='+$('#lap-state').value+'&offset='+lapOffset);if(gen!==lapGeneration||loginGen!==generation)return;table('#lap-list',['ID / versio','Nimimerkki','Aika / sektorit','Tila / syy','Toiminnot'],d.results.map(r=>{const actions=document.createElement('div');actions.className='toolbar';for(const [state,label] of [['approved','Hyväksy'],['quarantined','Tarkistukseen'],['hidden','Piilota']]){if(state===r.state)continue;const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{const reason=prompt(label+': '+r.nickname+' · '+(r.lap_ms/1000).toFixed(3)+' s. Kirjoita perustelu:');if(!reason?.trim())return;b.disabled=true;try{await api('/api/admin/laps/moderate','POST',{id:r.id,state,reason:reason.trim()});if(loginGen===generation)await loadLaps();}catch(e){if(loginGen===generation)$('#status').textContent=e.message;}finally{b.disabled=false;}};actions.append(b);}return[r.id+' / '+r.version,r.nickname,(r.lap_ms/1000).toFixed(3)+' s / '+[r.sector1,r.sector2,r.sector3].map(n=>(n/1000).toFixed(3)).join(' + '),({approved:'Hyväksytty',quarantined:'Tarkistettava',hidden:'Piilotettu'})[r.state]+' · '+r.reason.split(',').map(s=>lapReasons[s]||s).join('; '),actions];}));$('#lap-previous').disabled=lapOffset===0;$('#lap-next').disabled=!d.hasMore;if(!d.results.length)$('#lap-list').textContent='Ei kierroksia tässä ryhmässä.';}catch(e){if(gen===lapGeneration&&loginGen===generation)$('#status').textContent=e.message;}}\n$('#lap-state').onchange=()=>{lapOffset=0;void loadLaps();};$('#lap-refresh').onclick=()=>{void loadLaps();};$('#lap-previous').onclick=()=>{lapOffset=Math.max(0,lapOffset-100);void loadLaps();};$('#lap-next').onclick=()=>{lapOffset+=100;void loadLaps();};\nasync function load(){const gen=++generation;$('#status').textContent='Ladataan…';try{const d=await api('/api/admin/summary?days='+$('#days').value+'&offset='+offset);if(gen!==generation)return;$('#login').hidden=true;$('#token').value='';$('#reports').hidden=false;cards('#totals',d.totals);table('#daily',['Päivä','Profiileja','Pelikertoja','Aktiivinen aika','Kierroksia'],d.daily.map(r=>[r.day,r.players,r.sessions,duration(r.active_ms),r.laps_completed]));\nconst max=Math.max(1,...d.states.map(r=>r.ms));$('#states').replaceChildren();for(const r of d.states){const p=document.createElement('p'),bar=document.createElement('span');bar.className='bar';bar.style.width=(r.ms/max*180)+'px';p.append(bar,document.createTextNode((labels[r.state]||r.state)+': '+duration(r.ms)));$('#states').append(p);}$('#devices').textContent=d.devices.map(r=>r.device+': '+r.sessions+' pelikertaa').join(' · ');\ntable('#players',['Nimimerkki / profiili','Kerrat','Aktiivinen aika','Kierrokset','Viimeksi'],d.players.map(r=>{const b=document.createElement('button');b.textContent=(r.nickname||'Vierailija')+' · '+r.player_hash.slice(0,8);b.onclick=()=>{player=r.player_hash;playerName=r.nickname||'Vierailija';eventOffset=0;void profile();};return[b,r.sessions,duration(r.active_ms),r.laps_completed,date(r.last_seen)];}));$('#previous').disabled=offset===0;$('#next').disabled=!d.hasMore;$('#status').textContent='Päivitetty '+new Date().toLocaleTimeString('fi-FI');}catch(e){if(gen===generation){$('#status').textContent=e.message;$('#reports').hidden=true;$('#login').hidden=false;}}}\nasync function profile(){const expected=player,gen=generation;try{const d=await api('/api/admin/player?player='+player+'&days='+$('#days').value+'&offset='+eventOffset);if(expected!==player||gen!==generation)return;$('#profile').hidden=false;$('#profile-title').textContent=playerName+' · '+player.slice(0,8);cards('#player-totals',d.totals);$('#profile-note').textContent='Ensimmäinen havainto: '+date(d.totals.first_seen)+' · viimeisin: '+date(d.totals.last_seen)+' · tapahtumat '+(eventOffset+1)+'–'+(eventOffset+d.events.length);table('#events',['Aika (Suomi)','Tapahtuma','Nimimerkki','Tila','Kesto / kierros','Ohjaus','Laite / selain / OS','Näyttö / kieli / lähde','Peliversio / pelikerta'],d.events.map(r=>{const m=JSON.parse(r.metadata);return[date(r.at),labels[r.kind]||r.kind,r.nickname,labels[r.state]||r.state,r.kind==='time'?duration(r.duration_ms):r.lap_ms?(r.lap_ms/1000).toFixed(3)+' s':r.code,r.input,m.device+' / '+m.browser+' / '+m.os,m.width+'×'+m.height+' / '+m.language+' / '+(m.referrer||'suora / ei tietoa'),r.version+' / '+r.session_id.slice(0,8)];}));$('#event-previous').disabled=eventOffset===0;$('#event-next').disabled=!d.hasMore;}catch(e){$('#status').textContent=e.message;}}\n$('#login').onsubmit=e=>{e.preventDefault();secret=$('#token').value;offset=0;void load().then(()=>{if(secret)void loadLaps();});};$('#logout').onclick=lock;$('#refresh').onclick=()=>{void load().then(()=>{if(secret)void loadLaps();});$('#profile').hidden=true;};$('#days').onchange=()=>{offset=0;player='';$('#profile').hidden=true;void load();};$('#previous').onclick=()=>{offset=Math.max(0,offset-100);void load();};$('#next').onclick=()=>{offset+=100;void load();};$('#close-profile').onclick=()=>{player='';$('#profile').hidden=true;};$('#event-previous').onclick=()=>{eventOffset=Math.max(0,eventOffset-200);void profile();};$('#event-next').onclick=()=>{eventOffset+=200;void profile();};$('#delete-player').onclick=async()=>{if(!confirm('Poistetaanko tämän selainprofiilin kaikki analytiikkatiedot? Julkiset kierrostulokset säilyvät.'))return;try{await api('/api/admin/delete?player='+player,'DELETE');player='';$('#profile').hidden=true;offset=0;await load();}catch(e){$('#status').textContent=e.message;}};\n</script></html>\n";
