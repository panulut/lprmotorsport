const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');

(async () => {
  const worker = (await import(pathToFileURL(path.join(__dirname, '../cloudflare/worker.mjs')).href)).default;
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '../cloudflare/schema.sql'), 'utf8'));
  const env = { DB: { prepare(sql) {
    const statement = db.prepare(sql); let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return statement.get(...values); },
      async all() { return { results: statement.all(...values) }; },
      async run() { return { meta: { changes: Number(statement.run(...values).changes) } }; }
    };
  } } };
  const origin = 'https://panulut.github.io';
  const data = { version: 'lut-20261009-v1', nickname: 'Test Driver', lapMs: 40000, sectors: [10000, 10000, 20000] };
  const request = (body, token = 'a'.repeat(64), extra = {}) => new Request('https://example.com/api/laps', {
    method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body)
  });
  let response = await worker.fetch(request(data), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal((await response.json()).rank, 1);
  response = await worker.fetch(request({ ...data, lapMs: 45000, sectors: [10000, 10000, 25000] }), env);
  assert.equal((await response.json()).saved, false);
  response = await worker.fetch(request({ ...data, lapMs: 35000, sectors: [10000, 10000, 15000] }), env);
  assert.equal((await response.json()).bestMs, 35000);
  response = await worker.fetch(request(data, 'b'.repeat(64)), env);
  assert.equal((await response.json()).rank, 2);
  const board = await worker.fetch(new Request('https://example.com/api/leaderboard'), env);
  const results = (await board.json()).results;
  assert.equal(results.length, 2);
  assert.equal(results[0].lap_ms, 35000);
  assert.equal(results[0].player_hash, undefined);
  assert.equal((await worker.fetch(request({ ...data, sectors: [1, 2, 3] }), env)).status, 400);
  assert.equal((await worker.fetch(request({ ...data, version: 'old' }), env)).status, 400);
  assert.equal((await worker.fetch(request({ ...data, nickname: '<script>' }), env)).status, 400);
  assert.equal((await worker.fetch(request(null), env)).status, 400);
  assert.equal((await worker.fetch(request(data, 'bad'), env)).status, 401);
  assert.equal((await worker.fetch(request(data, 'a'.repeat(64), { Origin: 'https://other.example' }), env)).status, 403);
  assert.equal((await worker.fetch(request({ ...data, padding: 'x'.repeat(3000) }), env)).status, 413);
  const preflight = await worker.fetch(new Request('https://example.com/api/laps', { method: 'OPTIONS', headers: { Origin: origin } }), env);
  assert.equal(preflight.status, 204);
  for (let i = 0; i < 6; i++) assert.equal((await worker.fetch(request(data), env)).status, 200);
  assert.equal((await worker.fetch(request(data), env)).status, 429);
  db.close();
  console.log('PASS: real SQLite schema, personal best upsert, rank, public list, CORS, validation, body limits and submission throttling');
})().catch(error => { console.error(error); process.exitCode = 1; });
