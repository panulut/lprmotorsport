const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');
const { webcrypto, createHash } = require('node:crypto');
function database() {
  const db = new DatabaseSync(':memory:');
  const binding = { async batch(statements) {
    db.exec('BEGIN');
    try { const out = []; for (const s of statements) out.push(await s.run()); db.exec('COMMIT'); return out; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }, prepare(sql) {
    let values = [];
    return { bind(...args) { values = args; return this; }, async first() { return db.prepare(sql).get(...values); }, async all() { return { results: db.prepare(sql).all(...values) }; }, async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; } };
  } };
  return { db, binding };
}
function client(storage = new Map()) {
  let clock = 0, interval;
  const nodes = new Map(), windowEvents = new Map(), docEvents = new Map(), requests = [], beacons = [];
  const node = id => { if (!nodes.has(id)) nodes.set(id, { checked:false, disabled:false, textContent:'', addEventListener(type, fn) { this[type] = fn; } }); return nodes.get(id); };
  const document = { hidden:false, hasFocus:()=>true, documentElement:{lang:'fi'}, querySelector:node, addEventListener:(t,f)=>docEvents.set(t,f) };
  const window = { addEventListener:(t,f)=>windowEvents.set(t,f) };
  const context = { window, document, navigator:{userAgent:'Firefox/140 Linux',language:'fi-FI',sendBeacon:(url,blob)=>{beacons.push({url,blob});return true;}}, screen:{width:1280,height:720},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    performance:{now:()=>clock},Date,crypto:webcrypto,AbortSignal,Blob,URL,Uint8Array,MutationObserver:class{observe(){}},setInterval:f=>{interval=f;},setTimeout,
    fetch:async(url,options)=>{requests.push({url,options});return{ok:true};}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../analytics.js'),'utf8'),context);
  return {app:window.LPRAnalytics,node,document,storage,requests,beacons,windowEvents,docEvents,step(ms=1000){clock+=ms;interval();},async settle(){await new Promise(r=>setImmediate(r));}};
}
(async () => {
  const worker = (await import(pathToFileURL(path.join(__dirname,'../cloudflare/worker.mjs')).href)).default;
  const { db, binding } = database();
  const env = { DB:binding, ANALYTICS_ADMIN_TOKEN:'secret-'.repeat(10) };
  const now = Date.now(), token = 'a'.repeat(64), session = 'b'.repeat(64);
  const hash = value=>createHash('sha256').update(value).digest('hex');
  let sequence = 1;
  const event = (kind,extra={})=>({id:(sequence++).toString(16).padStart(64,'0'),at:now,type:kind,state:'driving',input:'keyboard',nickname:'Panu',...extra});
  const payload = {token,session,version:'lut-20261011-v3',consentAt:now,meta:{device:'desktop',browser:'Firefox',os:'Linux',width:1280,height:720,language:'fi-FI',referrer:'example.com'},events:[event('session_start'),event('play_start'),event('lap_start'),event('time',{ms:30000}),event('lap_complete',{lapMs:40000})]};
  const send = (p,extra={})=>worker.fetch(new Request('https://service.test/api/analytics/events',{method:'POST',headers:{Origin:'https://panulut.github.io','Content-Type':'application/json',...extra},body:JSON.stringify(p)}),env);
  const admin = (route='/api/admin/summary',secret=env.ANALYTICS_ADMIN_TOKEN,method='GET')=>worker.fetch(new Request('https://service.test'+route,{method,headers:{Authorization:'Bearer '+secret}}),env);
  assert.equal((await admin('/api/admin/summary','wrong')).status,401);
  assert.equal((await worker.fetch(new Request('https://service.test/api/admin/summary'),{DB:binding})).status,503);
  assert.equal((await send(payload)).status,200);
  assert.equal((await send(payload)).status,200);
  assert.equal(db.prepare('SELECT count(*) AS n FROM analytics_events').get().n,5,'Repeated batches are deduplicated');
  let report = await (await admin()).json();
  assert.equal(report.totals.players,1); assert.equal(report.totals.sessions,1); assert.equal(report.totals.played_sessions,1);
  assert.equal(report.totals.active_ms,30000); assert.equal(report.totals.laps_completed,1); assert.equal(report.players[0].nickname,'Panu');
  assert.equal((await worker.fetch(new Request('https://service.test/api/admin/player?player='+hash(token)),env)).status,401);
  const profile = await (await admin('/api/admin/player?player='+hash(token))).json();
  assert.equal(profile.events.length,5); assert.equal(profile.events.find(e=>e.kind==='lap_complete').lap_ms,40000);
  assert.equal(profile.events[0].token,undefined);
  const second = {...payload,events:[event('play_start',{nickname:'Uusi nimi'}),event('time',{state:'sauna',ms:10000,nickname:'Uusi nimi'})]};
  assert.equal((await send(second)).status,200);
  report = await (await admin()).json();assert.equal(report.totals.players,1,'Nickname change retains browser identity');assert.equal(report.totals.sessions,1);
  assert.equal((await send({...payload,token:'c'.repeat(64),session:'d'.repeat(64)})).status,200);
  report = await (await admin()).json();assert.equal(report.totals.players,2,'Same name on another browser is independent');
  assert.equal((await send({...payload,events:[event('time',{ms:-1})]})).status,400);
  assert.equal((await send({...payload,events:[event('time',{ms:60001})]})).status,400);
  assert.equal((await send({...payload,events:[event('time',{at:now+600000,ms:100})]})).status,400);
  assert.equal((await send({...payload,meta:{...payload.meta,referrer:'https://example.com/?secret=1'}})).status,400);
  assert.equal((await send({...payload,consentAt:now-181*86400000})).status,400);
  assert.equal((await send({...payload,events:Array(41).fill(payload.events[0])})).status,400);
  assert.equal((await send({...payload,extra:'x'.repeat(40000)})).status,413);
  assert.equal((await send(payload,{Origin:'https://evil.test'})).status,403);
  const adminHTML = await (await worker.fetch(new Request('https://service.test/admin'),env)).text();
  assert.equal(adminHTML, fs.readFileSync(path.join(__dirname,'../cloudflare/admin.html'),'utf8').replace(/\r\n/g, '\n'));
  new vm.Script(adminHTML.match(/<script>([\s\S]*?)<\/script>/)[1]);
  assert(adminHTML.includes('Ylläpitoavain'));assert(!adminHTML.includes(env.ANALYTICS_ADMIN_TOKEN));
  assert.equal((await worker.fetch(new Request('https://service.test/api/analytics/me',{method:'DELETE'}),env)).status,401);
  assert.equal((await worker.fetch(new Request('https://service.test/api/analytics/me',{method:'DELETE',headers:{Authorization:'Bearer '+token}}),env)).status,200);
  assert.equal(db.prepare('SELECT count(*) AS n FROM analytics_events WHERE player_hash=?').get(hash(token)).n,0);
  assert.equal((await send(payload)).status,410,'Late beacon cannot recreate deleted profile');
  assert.equal((await admin('/api/admin/delete?player='+hash('c'.repeat(64)),env.ANALYTICS_ADMIN_TOKEN,'DELETE')).status,200);
  assert.equal(db.prepare('SELECT count(*) AS n FROM analytics_events').get().n,0);
  const fresh = {...payload,token:'e'.repeat(64),session:'f'.repeat(64),events:[event('time',{ms:1000})]};
  for(let i=0;i<30;i++) assert.equal((await send(fresh)).status,200);
  assert.equal((await send(fresh)).status,429,'Per-player abuse limit applies');
  // Cron must remove expired records even with no visitors.
  db.prepare('UPDATE analytics_events SET at=?').run(now-91*86400000);
  let scheduled; await worker.scheduled({},env,{waitUntil:p=>{scheduled=p;}}); await scheduled;
  assert.equal(db.prepare('SELECT count(*) AS n FROM analytics_events').get().n,0);
  // Report pagination is separate from full aggregate totals.
  for(let i=0;i<105;i++) db.prepare(`INSERT INTO analytics_events(player_hash,session_id,event_id,nickname,version,kind,state,input,duration_ms,lap_ms,code,at,received,metadata,consent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(i.toString(16).padStart(64,'0'),i.toString(16).padStart(64,'0'),'x','Name','v','time','driving','keyboard',100,null,'',now,now,JSON.stringify(payload.meta),now);
  report = await (await admin()).json();assert.equal(report.totals.players,105);assert.equal(report.players.length,100);assert(report.hasMore);
  const next = await (await admin('/api/admin/summary?offset=100')).json();assert.equal(next.players.length,5);assert(!next.hasMore);
  const a = client();await a.settle();assert.equal(a.requests.length,0);assert.equal(a.storage.has('lpr-analytics-token-v1'),false,'No analytics identifier before consent');
  a.node('#analytics-consent').checked=true;a.node('#analytics-consent').change();await a.settle();
  assert.equal(a.requests.length,1);assert(a.storage.has('lpr-analytics-token-v1'));
  a.app.identify('Panu');await a.settle();
  a.app.sample('driving');for(let i=0;i<30;i++)a.step();await a.app.flush();await a.settle();
  let sent=a.requests.flatMap(r=>JSON.parse(r.options.body).events);
  assert(sent.some(e=>e.type==='play_start'&&e.nickname==='Panu'));
  const driving=sent.filter(e=>e.type==='time'&&e.state==='driving').reduce((s,e)=>s+e.ms,0);assert.equal(driving,30000);
  a.document.hidden=true;for(let i=0;i<30;i++)a.step();a.document.hidden=false;
  await a.app.flush();await a.settle();sent=a.requests.flatMap(r=>JSON.parse(r.options.body).events);
  assert.equal(sent.filter(e=>e.type==='time').reduce((s,e)=>s+e.ms,0),30000,'Background time excluded');
  for(let i=0;i<125;i++){a.step();await a.settle();}await a.app.flush();await a.settle();
  sent=a.requests.flatMap(r=>JSON.parse(r.options.body).events);assert(sent.some(e=>e.type==='time'&&e.state==='idle'));
  a.node('#analytics-consent').checked=false;a.node('#analytics-consent').change();
  const count=a.requests.length;a.app.event('restart');a.step(30000);await a.app.flush();assert.equal(a.requests.length,count,'Revocation stops requests');
  await a.node('#analytics-delete').click();assert(a.requests.at(-1).url.endsWith('/api/analytics/me'));assert(!a.storage.has('lpr-analytics-token-v1'));
  const expired = new Map([['lpr-analytics-consent-v1','yes'],['lpr-analytics-consent-at-v1',String(now-181*86400000)],['lpr-analytics-token-v1','a'.repeat(64)]]);
  const b=client(expired);await b.settle();assert.equal(b.requests.length,0);assert(!expired.has('lpr-analytics-token-v1'));
  const {build}=require('../scripts/build.cjs'); const {createServer}=require('../server.js'); build();
  const server=createServer({production:true}); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try { const base='http://127.0.0.1:'+server.address().port;
    for(const name of ['analytics.js','privacy.html']) assert.equal((await fetch(base+'/'+name)).status,200);
    assert.equal((await fetch(base+'/cloudflare/worker.mjs')).status,404);
    assert.equal((await fetch(base+'/cloudflare/admin.html')).status,404);
  } finally { await new Promise(resolve=>server.close(resolve)); }
  console.log('PASS: opt-in identity, active/idle/background timing, revocation/deletion, API auth, validation, deduplication, nickname history, retention, abuse limits and report pagination');
})().catch(e=>{console.error(e);process.exitCode=1;});
