// Paste this entire module into the Cloudflare Worker editor. Bind D1 as DB.
// v4 (24.10.2026): fixed-step physics and deterministic math; earlier laps stay stored but are not comparable.
const VERSION = 'lut-20261024-v4';
// Plausibility floor: the circuit cannot be lapped flat out in under 30 s, and no sector in under 5 s.
// This blocks absurd submissions; it is not proof of driving (see verification/ for that).
const MIN_LAP_MS = 30000, MIN_SECTOR_MS = 5000;
const ORIGINS = new Set(['https://panulut.github.io', 'https://lprmotorsports.me', 'http://localhost:8000', 'http://127.0.0.1:8000']);
// Admin dashboard routes forwarded to the verified leaderboard Worker after the admin key check.
const VERIFIED_ADMIN_ROUTES = new Set(['/api/verified/admin/laps', '/api/verified/admin/chat']);
// BEGIN name-policy: generated from verification/name-policy.mjs by npm run build:worker
// Public nickname policy, applied when a new name is chosen (account, guest, legacy leaderboard).
// Inlined into both pasteable Workers by scripts/bundle-verified-worker.cjs and scripts/embed-admin.cjs:
// keep this file free of imports.
//
// Names are folded before matching so common evasions still hit: case, accents, full-width
// letters, separators ("n.e e_k"), digits for letters ("n33k"), Cyrillic/Greek look-alikes
// and stretched letters ("neeeekeri"). Add new entries in folded form (see nameSkeleton).
const NAME_LEET={0:'o',1:'i',3:'e',4:'a',5:'s',6:'g',7:'t',9:'g'};
const NAME_CONFUSABLES={'а':'a','в':'b','е':'e','ё':'e','к':'k','м':'m','н':'h','о':'o','р':'p','с':'c','т':'t','у':'y','х':'x','і':'i','ї':'i','ј':'j','ѕ':'s','ԁ':'d','ԛ':'q','ԝ':'w',
 'α':'a','β':'b','ε':'e','η':'n','ι':'i','κ':'k','μ':'m','ν':'v','ο':'o','ρ':'p','τ':'t','υ':'u','χ':'x','ϲ':'c'};
// Matched against the skeleton with repeated letters squeezed ("neekeri" -> "nekeri").
const NAME_SQUEEZED=['neker','nekru','niger','niga','nigr','neger','fagot','trany','mutakuon','ratipa','vinosilm','hitler','siegheil','wetbak','raghead','towelhead','chink'];
// Matched against the unsqueezed skeleton where squeezing would also hit ordinary names.
const NAME_PLAIN=['ryssa','hintti'];
// Matched against the raw lowercase text with separators removed (digits kept as digits).
const NAME_RAW=['1488'];
function nameSkeleton(name){
 const folded=String(name).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[\s_.-]+/g,'');
 return [...folded].map(c=>NAME_LEET[c]??NAME_CONFUSABLES[c]??c).join('');
}
// Latin mixed with Cyrillic or Greek letters is how look-alike names impersonate others ("Pаnu").
const mixedScripts=name=>/\p{Script=Latin}/u.test(name)&&/[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(name);
function allowedName(name){
 if(typeof name!=='string'||mixedScripts(name))return false;
 const plain=nameSkeleton(name),squeezed=plain.replace(/(.)\1+/g,'$1');
 const raw=name.normalize('NFKC').toLowerCase().replace(/[\s_.-]+/g,'');
 return !NAME_SQUEEZED.some(word=>squeezed.includes(word))&&!NAME_PLAIN.some(word=>plain.includes(word))&&!NAME_RAW.some(word=>raw.includes(word));
}
// END name-policy
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
        SELECT version, player_hash, 'legacy', nickname, lap_ms, sector1, sector2, sector3 FROM best_laps`)
    ]).catch(error => { ready.delete(db); throw error; });
    ready.set(db, upgrade);
  }
  await ready.get(db);
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => { await ensureAnalytics(env.DB); await cleanAnalytics(env.DB); await capacitySchema(env.DB); await env.DB.prepare('DELETE FROM capacity_history WHERE bucket < ?').bind(Date.now()-90*86400000).run(); })());
  },
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    const url = new URL(request.url);
    // Browsers send Origin on same-origin DELETE/POST too, e.g. from the /admin page.
    if (origin && !ORIGINS.has(origin) && origin !== url.origin) return reply({ error: 'Origin denied' }, 403);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    }
    if (VERIFIED_ADMIN_ROUTES.has(url.pathname) || url.pathname === '/api/internal/capacity' || url.pathname.startsWith('/api/analytics/') || url.pathname.startsWith('/api/admin/') || url.pathname === '/admin') {
      try { return await analyticsRoute(request, env, url, reply); }
      catch (error) { console.error('Analytics operation failed', error.message); return reply({ error: 'Analytics unavailable' }, 503); }
    }
    if (url.pathname === '/' && request.method === 'GET') return reply({ service: 'LPR leaderboard', version: VERSION });
    try {
      await ensureLaps(env.DB);
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT nickname, lap_ms, sector1, sector2, sector3 FROM laps WHERE version = ? ORDER BY lap_ms, id LIMIT 10').bind(VERSION).all();
        return reply({ version: VERSION, mode: 'laps', results });
      }
      if (url.pathname !== '/api/laps') return reply({ error: 'Not found' }, 404);
      if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
      if (!/^[a-f0-9]{64}$/.test(token ?? '')) return reply({ error: 'Invalid player token' }, 401);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({ error: 'JSON required' }, 415);
      // Bound actual streamed bytes, including requests without Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return reply({ error: 'Missing body' }, 400);
      const chunks = []; let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2048) { await reader.cancel(); return reply({ error: 'Body too large' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let data;
      try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({ error: 'Invalid JSON' }, 400); }
      const nickname = typeof data?.nickname === 'string' ? data.nickname.trim() : '';
      const sectors = data?.sectors;
      const lapId = data?.lapId ?? crypto.randomUUID().replaceAll('-', '');
      if (!/^[a-f0-9]{32,64}$/.test(lapId) || data?.version !== VERSION || !/^[\p{L}\p{N} _.-]{1,24}$/u.test(nickname) ||
          !Number.isSafeInteger(data.lapMs) || data.lapMs < MIN_LAP_MS || !analyticsToken(data.analyticsToken) ||
          !Array.isArray(sectors) || sectors.length !== 3 || !sectors.every(n => Number.isSafeInteger(n) && n >= MIN_SECTOR_MS) ||
          sectors.reduce((a, b) => a + b, 0) !== data.lapMs) return reply({ error: 'Invalid lap' }, 400);
      if (!allowedName(nickname)) return reply({ error: 'Nickname not allowed', code: 'name_not_allowed' }, 422);
      const now = Math.floor(Date.now() / 1000);
      const ip = await hash(request.headers.get('CF-Connecting-IP') ?? 'unknown');
      await env.DB.prepare('DELETE FROM submission_limits WHERE expires < ?').bind(now).run();
      const limit = await env.DB.prepare(`INSERT INTO submission_limits(ip_hash, expires, attempts) VALUES (?, ?, 1)
        ON CONFLICT(ip_hash) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`).bind(ip, now + 60).first();
      if (limit.attempts > 10) return reply({ error: 'Too many submissions; retry later' }, 429);
      // Leaderboard entry requires analytics consent: the same lap must be in the analytics trail,
      // and that session must have started the lap at least lapMs earlier (wall clock, 2 s slack).
      await ensureAnalytics(env.DB);
      const tracked = await env.DB.prepare(`SELECT 1 FROM analytics_events c WHERE c.player_hash = ? AND c.kind = 'lap_complete'
        AND c.lap_ms = ? AND c.received >= ? AND EXISTS (SELECT 1 FROM analytics_events s WHERE s.player_hash = c.player_hash
          AND s.session_id = c.session_id AND s.kind = 'lap_start' AND s.at <= c.at - ?) LIMIT 1`)
        .bind(await hash(data.analyticsToken), data.lapMs, Date.now() - 600000, data.lapMs - 2000).first();
      if (!tracked) return reply({ error: 'Analytics consent required' }, 428);
      const player = await hash(token);
      const result = await env.DB.prepare(`INSERT OR IGNORE INTO laps
        (version, player_hash, lap_id, nickname, lap_ms, sector1, sector2, sector3)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(VERSION, player, lapId, nickname, data.lapMs, ...sectors).run();
      const lap = await env.DB.prepare(`SELECT id, nickname, lap_ms, sector1, sector2, sector3 FROM laps
        WHERE version = ? AND player_hash = ? AND lap_id = ?`).bind(VERSION, player, lapId).first();
      if (lap.lap_ms !== data.lapMs || lap.nickname !== nickname ||
          [lap.sector1, lap.sector2, lap.sector3].some((n, i) => n !== sectors[i])) {
        return reply({ error: 'Lap ID already used for another lap' }, 409);
      }
      const rank = await env.DB.prepare(`SELECT COUNT(*) + 1 AS rank FROM laps
        WHERE version = ? AND (lap_ms < ? OR (lap_ms = ? AND id < ?))`)
        .bind(VERSION, lap.lap_ms, lap.lap_ms, lap.id).first();
      const personal = await env.DB.prepare('SELECT MIN(lap_ms) AS lap_ms FROM laps WHERE version = ? AND player_hash = ?')
        .bind(VERSION, player).first();
      const other = await env.DB.prepare('SELECT MIN(lap_ms) AS lap_ms FROM laps WHERE version = ? AND id != ?')
        .bind(VERSION, lap.id).first();
      const saved = result.meta.changes > 0;
      return reply({ mode: 'laps', saved, lapMs: lap.lap_ms, bestMs: personal.lap_ms,
        rank: rank.rank, inTop10: rank.rank <= 10,
        record: saved && (other.lap_ms === null || lap.lap_ms < other.lap_ms) });
    } catch (error) {
      console.error('Leaderboard database operation failed', error);
      return reply({ error: 'Leaderboard unavailable' }, 503);
    }
  }
};

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
async function adminLaps(request, env, url, reply) {
  await ensureLaps(env.DB);
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT id, nickname, player_hash, lap_ms, sector1, sector2, sector3 FROM laps
      WHERE version = ? ORDER BY lap_ms, id LIMIT 50`).bind(VERSION).all();
    return reply({ version: VERSION, results });
  }
  if (request.method !== 'DELETE') return reply({ error: 'Method not allowed' }, 405);
  const id = Number(url.searchParams.get('id'));
  let player = url.searchParams.get('player'), legacyVersion = null;
  if (Number.isSafeInteger(id) && id > 0) {
    const lap = await env.DB.prepare('SELECT version, player_hash, lap_id FROM laps WHERE id = ?').bind(id).first();
    if (!lap) return reply({ error: 'Lap not found' }, 404);
    if (lap.lap_id === 'legacy') { player = lap.player_hash; legacyVersion = lap.version; }
    // Legacy rows are re-copied from best_laps on cold start, so remove the source too.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM laps WHERE id = ?').bind(id),
      ...(legacyVersion ? [env.DB.prepare('DELETE FROM best_laps WHERE version = ? AND player_hash = ?').bind(legacyVersion, player)] : [])
    ]);
    return reply({ ok: true });
  }
  if (typeof player !== 'string' || !/^[\w-]{1,128}$/.test(player)) return reply({ error: 'Invalid lap or player' }, 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM laps WHERE player_hash = ?').bind(player),
    env.DB.prepare('DELETE FROM best_laps WHERE player_hash = ?').bind(player)
  ]);
  return reply({ ok: true });
}
// Read-only proxy: the metrics credential stays in Worker secrets, never in browser responses.
async function adminCapacity(request, env, reply) {
  if (request.method !== 'GET') return reply({error:'Method not allowed'},405);
  if (typeof env.VERIFICATION_METRICS_URL !== 'string' || typeof env.VERIFICATION_METRICS_TOKEN !== 'string' || env.VERIFICATION_METRICS_TOKEN.length < 32)
    return reply({error:'Capacity monitoring not configured',code:'not_configured'},503);
  const url = new URL(env.VERIFICATION_METRICS_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/metrics' || url.search || url.hash)
    return reply({error:'Invalid metrics configuration'},503);
  try {
    const response = await fetch(url.href, {headers:{Authorization:'Bearer '+env.VERIFICATION_METRICS_TOKEN},redirect:'error',signal:AbortSignal.timeout(5000)});
    if (!response.ok) { await response.body?.cancel(); throw Error('Metrics unavailable'); }
    // Bound the upstream body, even without Content-Length.
    const reader=response.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>32768){await reader.cancel();throw Error('Metrics too large');}text+=decoder.decode(value,{stream:true});}
    const m=JSON.parse(text+decoder.decode()),keys=['starts','capacityRejected','startRateRejected','practiceLaps','processingTimeouts','lagTerminations'];
    const counters={};for(const key of keys){if(!Number.isSafeInteger(m.counters?.[key])||m.counters[key]<0)throw Error('Invalid metrics');counters[key]=m.counters[key];}
    if(!Number.isSafeInteger(m.since)||m.since<=0||!Number.isSafeInteger(m.activeSessions)||m.activeSessions<0||!Number.isSafeInteger(m.maxSessions)||m.maxSessions<1)throw Error('Invalid metrics');
    return reply({since:m.since,observedAt:Date.now(),activeSessions:m.activeSessions,maxSessions:m.maxSessions,counters});
  } catch { return reply({error:'Capacity monitoring unavailable',code:'unavailable'},503); }
}

const capacityKeys=['starts','capacityRejected','startRateRejected','practiceLaps','processingTimeouts','lagTerminations'];
async function capacitySchema(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS capacity_history (
    source TEXT NOT NULL, bucket INTEGER NOT NULL, updated INTEGER NOT NULL,
    starts INTEGER NOT NULL, capacityRejected INTEGER NOT NULL, startRateRejected INTEGER NOT NULL,
    practiceLaps INTEGER NOT NULL, processingTimeouts INTEGER NOT NULL, lagTerminations INTEGER NOT NULL,
    PRIMARY KEY(bucket,source))`).run();
}
async function capacityIngest(request,env,reply){
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(typeof env.VERIFICATION_METRICS_TOKEN!=='string'||env.VERIFICATION_METRICS_TOKEN.length<32)return reply({error:'Not configured'},503);
  const provided=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  const [a,b]=await Promise.all([hash(provided),hash(env.VERIFICATION_METRICS_TOKEN)]);
  let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
  if(difference)return reply({error:'Unauthorized'},401);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'JSON required'},415);
  const body=await readAnalyticsBody(request);if(body.error)return reply({error:body.error},body.status);
  const d=body.data,now=Date.now();
  if(!d||typeof d.source!=='string'||!/^[a-f0-9-]{36}$/.test(d.source)||!Number.isSafeInteger(d.bucket)||d.bucket%3600000!==0||d.bucket<now-90*86400000||d.bucket>now||
    !capacityKeys.every(k=>Number.isSafeInteger(d.counters?.[k])&&d.counters[k]>=0&&d.counters[k]<=1000000000))return reply({error:'Invalid capacity report'},400);
  await capacitySchema(env.DB);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO capacity_history(source,bucket,updated,${capacityKeys.join(',')}) VALUES(?,?,?,${capacityKeys.map(()=>'?').join(',')})
      ON CONFLICT(bucket,source) DO UPDATE SET updated=MAX(updated,excluded.updated),${capacityKeys.map(k=>k+'=MAX('+k+',excluded.'+k+')').join(',')}`)
      .bind(d.source,d.bucket,now,...capacityKeys.map(k=>d.counters[k])),
    env.DB.prepare('DELETE FROM capacity_history WHERE bucket < ?').bind(now-90*86400000)
  ]);
  return reply({ok:true});
}
async function capacityHistory(request,env,url,reply){
  if(request.method!=='GET')return reply({error:'Method not allowed'},405);
  await capacitySchema(env.DB);
  const days=Math.max(1,Math.min(90,Math.floor(Number(url.searchParams.get('days'))||7)));
  const since=Math.floor((Date.now()-days*86400000)/3600000)*3600000;
  const sums=capacityKeys.map(k=>'COALESCE(SUM('+k+'),0) AS '+k).join(',');
  const totals=await env.DB.prepare(`SELECT ${sums},MAX(updated) AS lastReportAt,MIN(bucket) AS firstBucket FROM capacity_history WHERE bucket>=?`).bind(since).first();
  const daily=await env.DB.prepare(`SELECT date(bucket/1000,'unixepoch') AS day,${sums} FROM capacity_history WHERE bucket>=? GROUP BY day ORDER BY day DESC`).bind(since).all();
  return reply({totals,daily:daily.results,since,days,retentionDays:90,bucketMs:3600000});
}
async function analyticsRoute(request, env, url, reply) {
  // Public HTML is only a login shell. Every data route checks a server-side secret.
  if (url.pathname === '/admin' && request.method === 'GET') return new Response(url.searchParams.get('lang') === 'en' ? ADMIN_HTML_EN : ADMIN_HTML, { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  }});
  if(url.pathname==='/api/internal/capacity')return capacityIngest(request,env,reply);
  const admin = url.pathname.startsWith('/api/admin/') || VERIFIED_ADMIN_ROUTES.has(url.pathname);
  const bearer = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (admin) {
    if (typeof env.ANALYTICS_ADMIN_TOKEN !== 'string' || env.ANALYTICS_ADMIN_TOKEN.length < 32) return reply({ error: 'Admin access not configured' }, 503);
    // Fixed-length digests avoid content-dependent token comparison.
    const [a,b] = await Promise.all([hash(bearer || ''), hash(env.ANALYTICS_ADMIN_TOKEN)]);
    let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    if (difference) return reply({ error: 'Unauthorized' }, 401);
  }
  if (VERIFIED_ADMIN_ROUTES.has(url.pathname)) {
    if (!['GET','POST'].includes(request.method)) return reply({error:'Method not allowed'},405);
    // Keep the dashboard same-origin and forward only these authenticated routes.
    const target = new URL('https://lpr-verified.panu-musakka.workers.dev' + url.pathname);
    target.search = url.search;
    const response = await fetch(target.href, {method:request.method,headers:{Authorization:'Bearer '+(env.VERIFIED_ADMIN_TOKEN||bearer)},redirect:'error',signal:AbortSignal.timeout(10000)});
    return reply(await response.json(),response.status);
  }
  if (url.pathname === '/api/admin/capacity-history') return capacityHistory(request,env,url,reply);
  if (url.pathname === '/api/admin/capacity') return adminCapacity(request, env, reply);
  if (url.pathname === '/api/analytics/me' && !analyticsToken(bearer)) return reply({ error: 'Invalid player token' }, 401);
  const known = new Set(['/api/analytics/events','/api/analytics/me','/api/admin/summary','/api/admin/player','/api/admin/delete','/api/admin/laps']);
  if (!known.has(url.pathname)) return reply({ error: 'Not found' }, 404);
  if (url.pathname === '/api/admin/laps') return adminLaps(request, env, url, reply);
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

const ADMIN_HTML = "<!doctype html><html lang=\"fi\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>LPR · Pelianalytiikka</title>\n<style>\n:root{color-scheme:dark;font:15px system-ui;background:#101815;color:#eaf3ed}body{max-width:1200px;margin:35px auto;padding:0 20px}h1{font-size:30px}small,.muted{color:#a5b9ad}button,input,select{font:inherit;padding:10px;border:1px solid #52745e;border-radius:6px;background:#192c21;color:inherit}button{cursor:pointer}button:hover{background:#284d35}button:disabled{opacity:.5;cursor:default}a{color:#b5ec91}.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin:24px 0}.card{padding:18px;background:#1c2b22;border:1px solid #38513e;border-radius:10px}.card strong{display:block;font-size:28px;margin-top:7px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:11px 9px;border-bottom:1px solid #304238;white-space:nowrap}th{color:#a9ceab}section{margin:28px 0}#status{min-height:24px;color:#ffdca3}#token{width:min(360px,80vw)}.danger{border-color:#ad766b}.bar{display:inline-block;background:#7abb59;height:9px;min-width:1px;border-radius:3px;margin-right:8px}details{margin:15px 0}[hidden]{display:none!important}\n</style>\n<nav aria-label=\"Language\"><a href=\"?lang=fi\" lang=\"fi\">Suomi</a> · <a href=\"?lang=en\" lang=\"en\">English</a></nav>\n<h1>LPR <span class=\"muted\">/ Pelianalytiikka</span></h1><p class=\"muted\">Suostumuksen antaneiden selainten pelihistoria · säilytys 90 päivää</p>\n<form id=\"login\"><label for=\"token\">Ylläpitoavain</label> <input id=\"token\" type=\"password\" autocomplete=\"off\" required minlength=\"32\"> <button>Avaa tilastot</button><p><small>Avain säilyy vain tämän sivun muistissa. Älä jaa sitä pelaajille.</small></p></form>\n<p id=\"status\" role=\"status\"></p><main id=\"reports\" hidden>\n<div class=\"toolbar\"><label>Aikaväli <select id=\"days\"><option value=\"1\">24 tuntia</option><option value=\"7\" selected>7 päivää</option><option value=\"30\">30 päivää</option><option value=\"90\">90 päivää</option></select></label><button id=\"refresh\">Päivitä</button><button id=\"logout\">Lukitse</button></div>\n<section><h2>Kapasiteettihistoria</h2><p id=\"capacity-history-status\" role=\"status\"></p><div id=\"capacity-history\" class=\"cards\"></div><div id=\"capacity-daily\" class=\"scroll\"></div><p class=\"muted\">Tietokantaan tallennetut luvut säilyvät palvelimen uudelleenkäynnistyksissä 90 päivää. Aikavälivalinta koskee historiaa; tiedot ryhmitellään tunneittain ja päivät ovat UTC-ajassa. Estetyt aloitukset eivät tarkoita menetettyjä valmiita kierroksia. Viive voi johtua myös laitteesta tai verkosta.</p></section>\n<section><h2>Palvelimen nykyinen käynnistyskerta</h2><p id=\"capacity-status\" role=\"status\">Tietoja ei ole vielä haettu.</p><div id=\"capacity\" class=\"cards\"></div><p class=\"muted\">Luvut koskevat palvelimen nykyistä käynnistyskertaa, eivät yllä valittua aikaväliä. Estetty aloitus tarkoittaa täyttä palvelinta, ei menetettyä valmista kierrosta. Viive voi johtua myös pelaajan laitteesta tai verkkoyhteydestä. Luvut eivät kerro yksittäisten pelaajien määrää eivätkä kaikkia tallennusvirheitä.</p></section>\n<div id=\"totals\" class=\"cards\"></div>\n<section><h2>Päivät <small>(UTC)</small></h2><div id=\"daily\" class=\"scroll\"></div></section>\n<section><h2>Ajankäyttö ja laitteet</h2><div id=\"states\"></div><p id=\"devices\"></p></section>\n<section><h2>Pelaajat <small>Selainprofiilit, eivät varmennetut henkilöt</small></h2><div id=\"players\" class=\"scroll\"></div><p class=\"toolbar\"><button id=\"previous\">Edelliset</button><button id=\"next\">Seuraavat</button></p></section>\n<section><h2>Varmennetut kierrosajat</h2><p class=\"muted\">Näytä nykyisen rataversion tulokset ja piilota yksittäinen aika ennätyslistalta. Ajettujen kierrosten määrä ja pisteet säilyvät.</p><div class=\"toolbar\"><label>Sarja <select id=\"verified-series\"><option value=\"human\">Ihmiset</option><option value=\"bot\">Botit</option></select></label><button id=\"verified-refresh\" type=\"button\">Päivitä ajat</button><button id=\"verified-reset\" class=\"danger\" type=\"button\">Nollaa rataennätykset</button></div><div id=\"verified-laps\" class=\"scroll\"></div></section>\n<section><h2>Chatin valvonta</h2><p class=\"muted\">Viestit säilyvät 24 tuntia. Estetyn kirjoittajan kaikki viestit poistuvat, eikä hän voi kirjoittaa ennen eston purkamista.</p><div class=\"toolbar\"><button id=\"chat-refresh\" type=\"button\">Päivitä chat</button><button id=\"chat-guests\" class=\"danger\" type=\"button\">Sulje chat vierailijoilta</button><span id=\"chat-guests-state\" class=\"muted\"></span></div><div id=\"chat-admin\" class=\"scroll\"></div><h3>Estetyt kirjoittajat</h3><div id=\"chat-blocks\" class=\"scroll\"></div></section>\n<section><h2>Historiallinen tuloslista <small>Nopeimmat 50 · Pelaaja = tuloslistan profiili, ei analytiikkaprofiili</small></h2><div id=\"laps\" class=\"scroll\"></div></section>\n<section id=\"profile\" hidden><h2 id=\"profile-title\"></h2><div class=\"toolbar\"><button id=\"close-profile\">Sulje pelaajanäkymä</button><button class=\"danger\" id=\"delete-player\">Poista tämän profiilin analytiikka</button></div><div id=\"player-totals\" class=\"cards\"></div><p id=\"profile-note\"></p><div id=\"events\" class=\"scroll\"></div><p class=\"toolbar\"><button id=\"event-previous\">Uudemmat tapahtumat</button><button id=\"event-next\">Vanhemmat tapahtumat</button></p></section>\n<p><small>Aktiivinen aika edellyttää näkyvää ja kohdistettua peliä sekä toimintaa viimeisen kahden minuutin aikana. Tilastot ovat selaimen ilmoittamia; estäjät, suostumusvalinnat ja katkenneet yhteydet vaikuttavat kattavuuteen. Julkinen tuloslista on erillinen.</small></p></main>\n<script>\n'use strict';\nconst $=s=>document.querySelector(s);let secret='',offset=0,eventOffset=0,player='',playerName='',generation=0;\nconst duration=ms=>((ms||0)/60000).toFixed(1)+' min';\nconst date=ms=>ms?new Date(ms).toLocaleString('fi-FI',{timeZone:'Europe/Helsinki'}):'—';\nconst labels={menu:'Valikko',driving:'Ajaminen',sauna:'Sauna',shop:'Kauppa',pool:'Palju',crashed:'Hajonnut auto',idle:'Toimeton',session_start:'Pelikerran alku',play_start:'Ajoon siirtyminen',time:'Ajankäyttö',lap_start:'Kierroksen alku',lap_complete:'Kierros valmis',state_change:'Tilan vaihto',restart:'Uudelleenaloitus',leaderboard_open:'Tuloslista',page_hide:'Sivu piilotettu',error:'Tekninen virhe'};\nasync function api(path,method='GET') {const r=await fetch(path,{method,headers:{Authorization:'Bearer '+secret},cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(r.status===401?'Virheellinen ylläpitoavain.':r.status===503?'Palvelu ei ole käytettävissä. Tarkista käyttöönotto.':'Pyyntö epäonnistui ('+r.status+').');return r.json();}\nfunction table(target,headers,rows){const t=document.createElement('table'),head=t.createTHead().insertRow();for(const label of headers){const th=document.createElement('th');th.textContent=label;head.append(th);}const body=t.createTBody();for(const row of rows){const tr=body.insertRow();for(const value of row){const td=tr.insertCell();if(value instanceof Node)td.append(value);else td.textContent=value??'—';}}$(target).replaceChildren(t);}\nfunction cards(target,s){$(target).replaceChildren();for(const [label,value] of [['Pelaajaprofiileja',s.players||0],['Pelikertoja',s.sessions||0],['Ajon aloittaneita pelikertoja',s.played_sessions||0],['Aktiivista aikaa',duration(s.active_ms)],['Valmiita kierroksia',s.laps_completed||0],['Aloitettuja kierroksia',s.laps_started||0]]){const box=document.createElement('div');box.className='card';box.textContent=label;const strong=document.createElement('strong');strong.textContent=value;box.append(strong);$(target).append(box);}}\nfunction lock(){generation++;secret='';$('#token').value='';$('#reports').hidden=true;$('#login').hidden=false;$('#profile').hidden=true;for(const id of ['#capacity-history','#capacity-history-status','#capacity-daily','#capacity','#capacity-status','#totals','#daily','#states','#devices','#players','#events','#player-totals','#laps','#verified-laps','#chat-admin','#chat-blocks','#chat-guests-state'])$(id).replaceChildren();player='';$('#status').textContent='Tilastot lukittu.';}\nasync function load(){const gen=++generation;$('#status').textContent='Ladataan…';try{const d=await api('/api/admin/summary?days='+$('#days').value+'&offset='+offset);if(gen!==generation)return;$('#login').hidden=true;$('#token').value='';$('#reports').hidden=false;cards('#totals',d.totals);table('#daily',['Päivä','Profiileja','Pelikertoja','Aktiivinen aika','Kierroksia'],d.daily.map(r=>[r.day,r.players,r.sessions,duration(r.active_ms),r.laps_completed]));\nconst max=Math.max(1,...d.states.map(r=>r.ms));$('#states').replaceChildren();for(const r of d.states){const p=document.createElement('p'),bar=document.createElement('span');bar.className='bar';bar.style.width=(r.ms/max*180)+'px';p.append(bar,document.createTextNode((labels[r.state]||r.state)+': '+duration(r.ms)));$('#states').append(p);}$('#devices').textContent=d.devices.map(r=>r.device+': '+r.sessions+' pelikertaa').join(' · ');\ntable('#players',['Nimimerkki / profiili','Kerrat','Aktiivinen aika','Kierrokset','Viimeksi'],d.players.map(r=>{const b=document.createElement('button');b.textContent=(r.nickname||'Vierailija')+' · '+r.player_hash.slice(0,8);b.onclick=()=>{player=r.player_hash;playerName=r.nickname||'Vierailija';eventOffset=0;void profile();};return[b,r.sessions,duration(r.active_ms),r.laps_completed,date(r.last_seen)];}));$('#previous').disabled=offset===0;$('#next').disabled=!d.hasMore;void capacityHistory();void capacity();void laps();void verifiedLaps();void chatModeration();$('#status').textContent='Päivitetty '+new Date().toLocaleTimeString('fi-FI');}catch(e){if(gen===generation){$('#status').textContent=e.message;$('#reports').hidden=true;$('#login').hidden=false;}}}\nasync function capacityHistory(){const gen=generation;$('#capacity-history').replaceChildren();$('#capacity-daily').replaceChildren();$('#capacity-history-status').textContent='Haetaan tallennettua historiaa…';try{const d=await api('/api/admin/capacity-history?days='+$('#days').value);if(gen!==generation)return;if(!d.totals.lastReportAt){$('#capacity-history-status').textContent='Tälle aikavälille ei ole tallennettu kapasiteettitietoja. Puuttuva tieto ei tarkoita nollaa ylitystä.';return;}for(const [label,key]of [['Aloitus estetty: palvelin täynnä','capacityRejected'],['Aloitus estetty: nopeusraja','startRateRejected'],['Viiveen takia varmentamatta jääneet kierrokset','practiceLaps'],['Tarkastuksen aikarajan ylitykset','processingTimeouts'],['Viiveeseen päättyneet ajot','lagTerminations']]){const box=document.createElement('div');box.className='card';box.textContent=label;const strong=document.createElement('strong');strong.textContent=d.totals[key];box.append(strong);$('#capacity-history').append(box);}table('#capacity-daily',['Päivä (UTC)','Täysi palvelin','Aloitusraja','Varmentamatta: viive','Käsittelyaikaraja','Viiveeseen päättyneet ajot'],d.daily.map(r=>[r.day,r.capacityRejected,r.startRateRejected,r.practiceLaps,r.processingTimeouts,r.lagTerminations]));$('#capacity-history-status').textContent='Aikaväli alkaa '+date(d.since)+' · viimeisin tallennus '+date(d.totals.lastReportAt)+'. Mahdolliset yhteyskatkot voivat jättää aukkoja historiaan.';}catch{if(gen!==generation)return;$('#capacity-history').replaceChildren();$('#capacity-daily').replaceChildren();$('#capacity-history-status').textContent='Tallennettua kapasiteettihistoriaa ei saatu haettua.';}}\nasync function capacity(){const gen=generation;$('#capacity').replaceChildren();$('#capacity-status').textContent='Haetaan kapasiteettitietoja…';try{const d=await api('/api/admin/capacity');if(gen!==generation)return;for(const [label,value] of [['Ajamassa nyt / paikkoja',d.activeSessions+' / '+d.maxSessions],['Aloitus estetty: palvelin täynnä',d.counters.capacityRejected],['Aloitus estetty: aloitusten nopeusraja',d.counters.startRateRejected],['Viiveen takia varmentamatta jääneet kierrokset',d.counters.practiceLaps],['Tarkastuksen aikarajan ylitykset',d.counters.processingTimeouts],['Liialliseen viiveeseen päättyneet ajot',d.counters.lagTerminations]]){const box=document.createElement('div');box.className='card';box.textContent=label;const strong=document.createElement('strong');strong.textContent=value;box.append(strong);$('#capacity').append(box);}$('#capacity-status').textContent='Laskenta alkoi '+date(d.since)+' · haettu '+date(d.observedAt)+'. Laskurit nollautuvat palvelimen uudelleenkäynnistyksessä.';}catch{if(gen!==generation)return;$('#capacity').replaceChildren();$('#capacity-status').textContent='Kapasiteettitietoja ei ole saatavilla. Tarkista mittauksen käyttöönotto ja palvelimen yhteys. Puuttuva tieto ei tarkoita nollaa ylitystä.';}}\nasync function verifiedLaps(){\n const gen=generation;\n try{\n  const d=await api('/api/verified/admin/laps?series='+encodeURIComponent($('#verified-series').value));\n  if(gen!==generation)return;\n  table('#verified-laps',['Kuljettaja','Kierrosaika','Ajankohta','Sektorit','Poista'],d.results.map(r=>{\n   const button=document.createElement('button');button.className='danger';button.textContent=r.excluded?'Palauta listalle':'Poista ennätyslistalta';\n   button.onclick=async()=>{\n    if(!confirm((r.excluded?'Palautetaanko':'Piilotetaanko')+' pelaajan '+r.nickname+' aika '+(r.lap_ms/1000).toFixed(3)+' s ennätyslistalla? Kierrosmäärä ja pisteet säilyvät.'))return;\n    button.disabled=true;\n    try{\n     await api('/api/verified/admin/laps?sessionId='+encodeURIComponent(r.session_id)+'&lap='+r.lap+(r.excluded?'&restore=1':''),'POST');\n     await verifiedLaps();\n    }catch(e){$('#status').textContent=e.message;button.disabled=false;}\n   };\n   return[r.nickname,(r.lap_ms/1000).toFixed(3)+' s',date(r.issued_ms),\n    [r.sector1,r.sector2,r.sector3].map(n=>(n/120).toFixed(3)).join(' / '),button];\n  }));\n }catch(e){$('#status').textContent=e.message;}\n}\n$('#verified-refresh').addEventListener('click',verifiedLaps);\n$('#verified-reset').addEventListener('click',async()=>{if(!confirm('Nollataanko nykyisen rataversion ennätyslistat? Historialliset kierrokset ja kilpailupisteet säilyvät.'))return;try{await api('/api/verified/admin/laps?reset=1','POST');await verifiedLaps();}catch(e){$('#status').textContent=e.message;}});\n$('#verified-series').addEventListener('change',verifiedLaps);\nlet chatGuestsOpen=true;\nfunction chatAction(label,question,query){\n const button=document.createElement('button');button.className='danger';button.type='button';button.textContent=label;\n button.onclick=async()=>{\n  if(!confirm(question))return;\n  button.disabled=true;\n  try{await api('/api/verified/admin/chat?'+query,'POST');await chatModeration();}\n  catch(e){$('#status').textContent=e.message;button.disabled=false;}\n };\n return button;\n}\nasync function chatModeration(){\n const gen=generation;\n try{\n  const d=await api('/api/verified/admin/chat');\n  if(gen!==generation)return;\n  chatGuestsOpen=d.guestsOpen;\n  $('#chat-guests').textContent=chatGuestsOpen?'Sulje chat vierailijoilta':'Avaa chat vierailijoille';\n  $('#chat-guests-state').textContent=chatGuestsOpen?'Vierailijat voivat kirjoittaa.':'Vierailijoiden chat on suljettu.';\n  table('#chat-admin',['Aika','Kirjoittaja','Viesti','Poista','Estä'],d.messages.map(m=>[date(m.at),m.nickname,m.text,\n   chatAction('Poista viesti','Poistetaanko tämä viesti chatista?','delete='+encodeURIComponent(m.id)),\n   m.player_hash?chatAction('Estä kirjoittaja','Estetäänkö tämän viestin kirjoittaja? Kaikki hänen viestinsä poistetaan.','block='+encodeURIComponent(m.id)):'—']));\n  table('#chat-blocks',['Kirjoittaja','Estoaika','Pura'],d.blocks.map(b=>[b.nickname,date(b.created_ms),\n   chatAction('Pura esto','Puretaanko tämän kirjoittajan esto?','unblock='+encodeURIComponent(b.player_hash))]));\n }catch(e){$('#status').textContent=e.message;}\n}\n$('#chat-refresh').addEventListener('click',chatModeration);\n$('#chat-guests').addEventListener('click',async()=>{\n if(!confirm(chatGuestsOpen?'Suljetaanko chat vierailijoilta? Tilin luoneet pelaajat voivat yhä kirjoittaa.':'Avataanko chat vierailijoille?'))return;\n try{await api('/api/verified/admin/chat?guests='+(chatGuestsOpen?'off':'on'),'POST');await chatModeration();}\n catch(e){$('#status').textContent=e.message;}\n});\nasync function laps(){const gen=generation;try{const d=await api('/api/admin/laps');if(gen!==generation)return;table('#laps',['Sija','Nimimerkki','Aika','Sektorit','Pelaaja'],d.results.map((r,i)=>[i+1,r.nickname,(r.lap_ms/1000).toFixed(3)+' s',[r.sector1,r.sector2,r.sector3].map(n=>(n/1000).toFixed(3)).join(' / '),r.player_hash.slice(0,8)]));}catch(e){$('#status').textContent=e.message;}}\nasync function profile(){const expected=player,gen=generation;try{const d=await api('/api/admin/player?player='+player+'&days='+$('#days').value+'&offset='+eventOffset);if(expected!==player||gen!==generation)return;$('#profile').hidden=false;$('#profile-title').textContent=playerName+' · '+player.slice(0,8);cards('#player-totals',d.totals);$('#profile-note').textContent='Ensimmäinen havainto: '+date(d.totals.first_seen)+' · viimeisin: '+date(d.totals.last_seen)+' · tapahtumat '+(eventOffset+1)+'–'+(eventOffset+d.events.length);table('#events',['Aika (Suomi)','Tapahtuma','Nimimerkki','Tila','Kesto / kierros','Ohjaus','Laite / selain / OS','Näyttö / kieli / lähde','Peliversio / pelikerta'],d.events.map(r=>{const m=JSON.parse(r.metadata);return[date(r.at),labels[r.kind]||r.kind,r.nickname,labels[r.state]||r.state,r.kind==='time'?duration(r.duration_ms):r.lap_ms?(r.lap_ms/1000).toFixed(3)+' s':r.code,r.input,m.device+' / '+m.browser+' / '+m.os,m.width+'×'+m.height+' / '+m.language+' / '+(m.referrer||'suora / ei tietoa'),r.version+' / '+r.session_id.slice(0,8)];}));$('#event-previous').disabled=eventOffset===0;$('#event-next').disabled=!d.hasMore;}catch(e){$('#status').textContent=e.message;}}\n$('#login').onsubmit=e=>{e.preventDefault();secret=$('#token').value;offset=0;void load();};$('#logout').onclick=lock;$('#refresh').onclick=()=>{void load();$('#profile').hidden=true;};$('#days').onchange=()=>{offset=0;player='';$('#profile').hidden=true;void load();};$('#previous').onclick=()=>{offset=Math.max(0,offset-100);void load();};$('#next').onclick=()=>{offset+=100;void load();};$('#close-profile').onclick=()=>{player='';$('#profile').hidden=true;};$('#event-previous').onclick=()=>{eventOffset=Math.max(0,eventOffset-200);void profile();};$('#event-next').onclick=()=>{eventOffset+=200;void profile();};$('#delete-player').onclick=async()=>{if(!confirm('Poistetaanko tämän selainprofiilin kaikki analytiikkatiedot? Julkiset kierrostulokset säilyvät.'))return;try{await api('/api/admin/delete?player='+player,'DELETE');player='';$('#profile').hidden=true;offset=0;await load();}catch(e){$('#status').textContent=e.message;}};\n</script></html>\n";

const ADMIN_HTML_EN = "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>LPR · Game analytics</title>\n<style>\n:root{color-scheme:dark;font:15px system-ui;background:#101815;color:#eaf3ed}body{max-width:1200px;margin:35px auto;padding:0 20px}h1{font-size:30px}small,.muted{color:#a5b9ad}button,input,select{font:inherit;padding:10px;border:1px solid #52745e;border-radius:6px;background:#192c21;color:inherit}button{cursor:pointer}button:hover{background:#284d35}button:disabled{opacity:.5;cursor:default}a{color:#b5ec91}.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin:24px 0}.card{padding:18px;background:#1c2b22;border:1px solid #38513e;border-radius:10px}.card strong{display:block;font-size:28px;margin-top:7px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:11px 9px;border-bottom:1px solid #304238;white-space:nowrap}th{color:#a9ceab}section{margin:28px 0}#status{min-height:24px;color:#ffdca3}#token{width:min(360px,80vw)}.danger{border-color:#ad766b}.bar{display:inline-block;background:#7abb59;height:9px;min-width:1px;border-radius:3px;margin-right:8px}details{margin:15px 0}[hidden]{display:none!important}\n</style>\n<nav aria-label=\"Language\"><a href=\"?lang=fi\" lang=\"fi\">Suomi</a> · <a href=\"?lang=en\" lang=\"en\">English</a></nav>\n<h1>LPR <span class=\"muted\">/ Game analytics</span></h1><p class=\"muted\">Game history from consenting browsers · retained for 90 days</p>\n<form id=\"login\"><label for=\"token\">Admin key</label> <input id=\"token\" type=\"password\" autocomplete=\"off\" required minlength=\"32\"> <button>Open statistics</button><p><small>The key stays only in this page's memory. Do not share it with players.</small></p></form>\n<p id=\"status\" role=\"status\"></p><main id=\"reports\" hidden>\n<div class=\"toolbar\"><label>Time range <select id=\"days\"><option value=\"1\">24 hours</option><option value=\"7\" selected>7 days</option><option value=\"30\">30 days</option><option value=\"90\">90 days</option></select></label><button id=\"refresh\">Refresh</button><button id=\"logout\">Lock</button></div>\n<section><h2>Capacity history</h2><p id=\"capacity-history-status\" role=\"status\"></p><div id=\"capacity-history\" class=\"cards\"></div><div id=\"capacity-daily\" class=\"scroll\"></div><p class=\"muted\">Stored figures survive server restarts and are retained for 90 days. The selected time range applies to history; data is grouped hourly and days use UTC. Blocked starts do not mean completed laps were lost. Delays can also come from the device or network.</p></section>\n<section><h2>Current server uptime</h2><p id=\"capacity-status\" role=\"status\">Data has not been loaded yet.</p><div id=\"capacity\" class=\"cards\"></div><p class=\"muted\">Figures cover the current server uptime, rather than the time range selected above. A blocked start means the server was full; it does not mean a completed lap was lost. Delays can also come from the player's device or network. These figures do not show unique player counts or all recording errors.</p></section>\n<div id=\"totals\" class=\"cards\"></div>\n<section><h2>Days <small>(UTC)</small></h2><div id=\"daily\" class=\"scroll\"></div></section>\n<section><h2>Time spent and devices</h2><div id=\"states\"></div><p id=\"devices\"></p></section>\n<section><h2>Players <small>Browser profiles, not verified individuals</small></h2><div id=\"players\" class=\"scroll\"></div><p class=\"toolbar\"><button id=\"previous\">Previous</button><button id=\"next\">Next</button></p></section>\n<section><h2>Verified lap times</h2><p class=\"muted\">View results for the current track version and hide individual times from the record list. Lap counts and points are preserved.</p><div class=\"toolbar\"><label>Series <select id=\"verified-series\"><option value=\"human\">Humans</option><option value=\"bot\">Bots</option></select></label><button id=\"verified-refresh\" type=\"button\">Refresh times</button><button id=\"verified-reset\" class=\"danger\" type=\"button\">Reset track records</button></div><div id=\"verified-laps\" class=\"scroll\"></div></section>\n<section><h2>Chat moderation</h2><p class=\"muted\">Messages are kept for 24 hours. Blocking a writer removes all their messages, and they cannot write until the block is lifted.</p><div class=\"toolbar\"><button id=\"chat-refresh\" type=\"button\">Refresh chat</button><button id=\"chat-guests\" class=\"danger\" type=\"button\">Close chat to guests</button><span id=\"chat-guests-state\" class=\"muted\"></span></div><div id=\"chat-admin\" class=\"scroll\"></div><h3>Blocked writers</h3><div id=\"chat-blocks\" class=\"scroll\"></div></section>\n<section><h2>Historical leaderboard <small>Fastest 50 · Player = leaderboard profile, separate from the analytics profile</small></h2><div id=\"laps\" class=\"scroll\"></div></section>\n<section id=\"profile\" hidden><h2 id=\"profile-title\"></h2><div class=\"toolbar\"><button id=\"close-profile\">Close player view</button><button class=\"danger\" id=\"delete-player\">Delete this profile's analytics</button></div><div id=\"player-totals\" class=\"cards\"></div><p id=\"profile-note\"></p><div id=\"events\" class=\"scroll\"></div><p class=\"toolbar\"><button id=\"event-previous\">Newer events</button><button id=\"event-next\">Older events</button></p></section>\n<p><small>Active time requires the game to be visible and focused, with activity in the last two minutes. Statistics are reported by browsers; blockers, consent choices and lost connections affect coverage. The public leaderboard is separate.</small></p></main>\n<script>\n'use strict';\nconst $=s=>document.querySelector(s);let secret='',offset=0,eventOffset=0,player='',playerName='',generation=0;\nconst duration=ms=>((ms||0)/60000).toFixed(1)+' min';\nconst date=ms=>ms?new Date(ms).toLocaleString('en-GB',{timeZone:'Europe/Helsinki'}):'—';\nconst labels={menu:\"Menu\",driving:\"Driving\",sauna:\"Sauna\",shop:\"Shop\",pool:\"Hot tub\",crashed:\"Crashed car\",idle:\"Idle\",session_start:\"Session started\",play_start:\"Driving started\",time:\"Time spent\",lap_start:\"Lap started\",lap_complete:\"Lap completed\",state_change:\"State changed\",restart:\"Restart\",leaderboard_open:\"Leaderboard\",page_hide:\"Page hidden\",error:\"Technical error\"};\nasync function api(path,method='GET') {const r=await fetch(path,{method,headers:{Authorization:'Bearer '+secret},cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(r.status===401?\"Invalid admin key.\":r.status===503?\"Service unavailable. Check the deployment.\":\"Request failed (\"+r.status+').');return r.json();}\nfunction table(target,headers,rows){const t=document.createElement('table'),head=t.createTHead().insertRow();for(const label of headers){const th=document.createElement('th');th.textContent=label;head.append(th);}const body=t.createTBody();for(const row of rows){const tr=body.insertRow();for(const value of row){const td=tr.insertCell();if(value instanceof Node)td.append(value);else td.textContent=value??'—';}}$(target).replaceChildren(t);}\nfunction cards(target,s){$(target).replaceChildren();for(const [label,value] of [[\"Player profiles\",s.players||0],[\"Sessions\",s.sessions||0],[\"Sessions with driving\",s.played_sessions||0],[\"Active time\",duration(s.active_ms)],[\"Completed laps\",s.laps_completed||0],[\"Started laps\",s.laps_started||0]]){const box=document.createElement('div');box.className='card';box.textContent=label;const strong=document.createElement('strong');strong.textContent=value;box.append(strong);$(target).append(box);}}\nfunction lock(){generation++;secret='';$('#token').value='';$('#reports').hidden=true;$('#login').hidden=false;$('#profile').hidden=true;for(const id of ['#capacity-history','#capacity-history-status','#capacity-daily','#capacity','#capacity-status','#totals','#daily','#states','#devices','#players','#events','#player-totals','#laps','#verified-laps','#chat-admin','#chat-blocks','#chat-guests-state'])$(id).replaceChildren();player='';$('#status').textContent=\"Statistics locked.\";}\nasync function load(){const gen=++generation;$('#status').textContent=\"Loading…\";try{const d=await api('/api/admin/summary?days='+$('#days').value+'&offset='+offset);if(gen!==generation)return;$('#login').hidden=true;$('#token').value='';$('#reports').hidden=false;cards('#totals',d.totals);table('#daily',[\"Day\",\"Profiles\",\"Sessions\",\"Active time\",\"Laps\"],d.daily.map(r=>[r.day,r.players,r.sessions,duration(r.active_ms),r.laps_completed]));\nconst max=Math.max(1,...d.states.map(r=>r.ms));$('#states').replaceChildren();for(const r of d.states){const p=document.createElement('p'),bar=document.createElement('span');bar.className='bar';bar.style.width=(r.ms/max*180)+'px';p.append(bar,document.createTextNode((labels[r.state]||r.state)+': '+duration(r.ms)));$('#states').append(p);}$('#devices').textContent=d.devices.map(r=>r.device+': '+r.sessions+\" sessions\").join(' · ');\ntable('#players',[\"Nickname / profile\",\"Sessions\",\"Active time\",\"Laps\",\"Last seen\"],d.players.map(r=>{const b=document.createElement('button');b.textContent=(r.nickname||\"Guest\")+' · '+r.player_hash.slice(0,8);b.onclick=()=>{player=r.player_hash;playerName=r.nickname||\"Guest\";eventOffset=0;void profile();};return[b,r.sessions,duration(r.active_ms),r.laps_completed,date(r.last_seen)];}));$('#previous').disabled=offset===0;$('#next').disabled=!d.hasMore;void capacityHistory();void capacity();void laps();void verifiedLaps();void chatModeration();$('#status').textContent=\"Updated \"+new Date().toLocaleTimeString('en-GB');}catch(e){if(gen===generation){$('#status').textContent=e.message;$('#reports').hidden=true;$('#login').hidden=false;}}}\nasync function capacityHistory(){const gen=generation;$('#capacity-history').replaceChildren();$('#capacity-daily').replaceChildren();$('#capacity-history-status').textContent=\"Loading stored history…\";try{const d=await api('/api/admin/capacity-history?days='+$('#days').value);if(gen!==generation)return;if(!d.totals.lastReportAt){$('#capacity-history-status').textContent=\"No capacity data has been stored for this time range. Missing data does not mean there were no limit breaches.\";return;}for(const [label,key]of [[\"Start blocked: server full\",'capacityRejected'],[\"Start blocked: rate limit\",'startRateRejected'],[\"Laps unverified due to lag\",'practiceLaps'],[\"Verification timeouts\",'processingTimeouts'],[\"Runs ended due to lag\",'lagTerminations']]){const box=document.createElement('div');box.className='card';box.textContent=label;const strong=document.createElement('strong');strong.textContent=d.totals[key];box.append(strong);$('#capacity-history').append(box);}table('#capacity-daily',[\"Day (UTC)\",\"Server full\",\"Start rate limit\",\"Unverified: lag\",\"Processing timeout\",\"Runs ended due to lag\"],d.daily.map(r=>[r.day,r.capacityRejected,r.startRateRejected,r.practiceLaps,r.processingTimeouts,r.lagTerminations]));$('#capacity-history-status').textContent=\"Time range starts \"+date(d.since)+\" · last recorded \"+date(d.totals.lastReportAt)+\". Connection outages may leave gaps in the history.\";}catch{if(gen!==generation)return;$('#capacity-history').replaceChildren();$('#capacity-daily').replaceChildren();$('#capacity-history-status').textContent=\"Could not load stored capacity history.\";}}\nasync function capacity(){const gen=generation;$('#capacity').replaceChildren();$('#capacity-status').textContent=\"Loading capacity data…\";try{const d=await api('/api/admin/capacity');if(gen!==generation)return;for(const [label,value] of [[\"Driving now / slots\",d.activeSessions+' / '+d.maxSessions],[\"Start blocked: server full\",d.counters.capacityRejected],[\"Start blocked: start rate limit\",d.counters.startRateRejected],[\"Laps unverified due to lag\",d.counters.practiceLaps],[\"Verification timeouts\",d.counters.processingTimeouts],[\"Runs ended due to excessive lag\",d.counters.lagTerminations]]){const box=document.createElement('div');box.className='card';box.textContent=label;const strong=document.createElement('strong');strong.textContent=value;box.append(strong);$('#capacity').append(box);}$('#capacity-status').textContent=\"Counting started \"+date(d.since)+\" · retrieved \"+date(d.observedAt)+\". Counters reset when the server restarts.\";}catch{if(gen!==generation)return;$('#capacity').replaceChildren();$('#capacity-status').textContent=\"Capacity data is unavailable. Check the metrics configuration and server connection. Missing data does not mean there were no limit breaches.\";}}\nasync function verifiedLaps(){\n const gen=generation;\n try{\n  const d=await api('/api/verified/admin/laps?series='+encodeURIComponent($('#verified-series').value));\n  if(gen!==generation)return;\n  table('#verified-laps',[\"Driver\",\"Lap time\",\"Date\",\"Sectors\",\"Remove\"],d.results.map(r=>{\n   const button=document.createElement('button');button.className='danger';button.textContent=r.excluded?\"Restore to leaderboard\":\"Hide from record list\";\n   button.onclick=async()=>{\n    if(!confirm((r.excluded?\"Restore\":\"Hide\")+\" driver \"+r.nickname+\" time \"+(r.lap_ms/1000).toFixed(3)+\" s on the record list? Lap counts and points are preserved.\"))return;\n    button.disabled=true;\n    try{\n     await api('/api/verified/admin/laps?sessionId='+encodeURIComponent(r.session_id)+'&lap='+r.lap+(r.excluded?'&restore=1':''),'POST');\n     await verifiedLaps();\n    }catch(e){$('#status').textContent=e.message;button.disabled=false;}\n   };\n   return[r.nickname,(r.lap_ms/1000).toFixed(3)+' s',date(r.issued_ms),\n    [r.sector1,r.sector2,r.sector3].map(n=>(n/120).toFixed(3)).join(' / '),button];\n  }));\n }catch(e){$('#status').textContent=e.message;}\n}\n$('#verified-refresh').addEventListener('click',verifiedLaps);\n$('#verified-reset').addEventListener('click',async()=>{if(!confirm(\"Reset record lists for the current track version? Historical laps and championship points are preserved.\"))return;try{await api('/api/verified/admin/laps?reset=1','POST');await verifiedLaps();}catch(e){$('#status').textContent=e.message;}});\n$('#verified-series').addEventListener('change',verifiedLaps);\nlet chatGuestsOpen=true;\nfunction chatAction(label,question,query){\n const button=document.createElement('button');button.className='danger';button.type='button';button.textContent=label;\n button.onclick=async()=>{\n  if(!confirm(question))return;\n  button.disabled=true;\n  try{await api('/api/verified/admin/chat?'+query,'POST');await chatModeration();}\n  catch(e){$('#status').textContent=e.message;button.disabled=false;}\n };\n return button;\n}\nasync function chatModeration(){\n const gen=generation;\n try{\n  const d=await api('/api/verified/admin/chat');\n  if(gen!==generation)return;\n  chatGuestsOpen=d.guestsOpen;\n  $('#chat-guests').textContent=chatGuestsOpen?\"Close chat to guests\":\"Open chat to guests\";\n  $('#chat-guests-state').textContent=chatGuestsOpen?\"Guests can write.\":\"Guest chat is closed.\";\n  table('#chat-admin',[\"Time\",\"Writer\",\"Message\",\"Remove\",\"Block\"],d.messages.map(m=>[date(m.at),m.nickname,m.text,\n   chatAction(\"Delete message\",\"Delete this message from the chat?\",'delete='+encodeURIComponent(m.id)),\n   m.player_hash?chatAction(\"Block writer\",\"Block the writer of this message? All their messages will be deleted.\",'block='+encodeURIComponent(m.id)):'—']));\n  table('#chat-blocks',[\"Writer\",\"Blocked at\",\"Lift\"],d.blocks.map(b=>[b.nickname,date(b.created_ms),\n   chatAction(\"Lift block\",\"Lift the block on this writer?\",'unblock='+encodeURIComponent(b.player_hash))]));\n }catch(e){$('#status').textContent=e.message;}\n}\n$('#chat-refresh').addEventListener('click',chatModeration);\n$('#chat-guests').addEventListener('click',async()=>{\n if(!confirm(chatGuestsOpen?\"Close the chat to guests? Players with an account can still write.\":\"Open the chat to guests?\"))return;\n try{await api('/api/verified/admin/chat?guests='+(chatGuestsOpen?'off':'on'),'POST');await chatModeration();}\n catch(e){$('#status').textContent=e.message;}\n});\nasync function laps(){const gen=generation;try{const d=await api('/api/admin/laps');if(gen!==generation)return;table('#laps',[\"Rank\",\"Nickname\",\"Time\",\"Sectors\",\"Player\"],d.results.map((r,i)=>[i+1,r.nickname,(r.lap_ms/1000).toFixed(3)+' s',[r.sector1,r.sector2,r.sector3].map(n=>(n/1000).toFixed(3)).join(' / '),r.player_hash.slice(0,8)]));}catch(e){$('#status').textContent=e.message;}}\nasync function profile(){const expected=player,gen=generation;try{const d=await api('/api/admin/player?player='+player+'&days='+$('#days').value+'&offset='+eventOffset);if(expected!==player||gen!==generation)return;$('#profile').hidden=false;$('#profile-title').textContent=playerName+' · '+player.slice(0,8);cards('#player-totals',d.totals);$('#profile-note').textContent=\"First seen: \"+date(d.totals.first_seen)+\" · last seen: \"+date(d.totals.last_seen)+\" · events \"+(eventOffset+1)+'–'+(eventOffset+d.events.length);table('#events',[\"Time (Finland)\",\"Event\",\"Nickname\",\"State\",\"Duration / lap\",\"Controls\",\"Device / browser / OS\",\"Screen / language / referrer\",\"Game version / session\"],d.events.map(r=>{const m=JSON.parse(r.metadata);return[date(r.at),labels[r.kind]||r.kind,r.nickname,labels[r.state]||r.state,r.kind==='time'?duration(r.duration_ms):r.lap_ms?(r.lap_ms/1000).toFixed(3)+' s':r.code,r.input,m.device+' / '+m.browser+' / '+m.os,m.width+'×'+m.height+' / '+m.language+' / '+(m.referrer||\"direct / unknown\"),r.version+' / '+r.session_id.slice(0,8)];}));$('#event-previous').disabled=eventOffset===0;$('#event-next').disabled=!d.hasMore;}catch(e){$('#status').textContent=e.message;}}\n$('#login').onsubmit=e=>{e.preventDefault();secret=$('#token').value;offset=0;void load();};$('#logout').onclick=lock;$('#refresh').onclick=()=>{void load();$('#profile').hidden=true;};$('#days').onchange=()=>{offset=0;player='';$('#profile').hidden=true;void load();};$('#previous').onclick=()=>{offset=Math.max(0,offset-100);void load();};$('#next').onclick=()=>{offset+=100;void load();};$('#close-profile').onclick=()=>{player='';$('#profile').hidden=true;};$('#event-previous').onclick=()=>{eventOffset=Math.max(0,eventOffset-200);void profile();};$('#event-next').onclick=()=>{eventOffset+=200;void profile();};$('#delete-player').onclick=async()=>{if(!confirm(\"Delete all analytics data for this browser profile? Public lap results will be kept.\"))return;try{await api('/api/admin/delete?player='+player,'DELETE');player='';$('#profile').hidden=true;offset=0;await load();}catch(e){$('#status').textContent=e.message;}};\n</script></html>\n";
