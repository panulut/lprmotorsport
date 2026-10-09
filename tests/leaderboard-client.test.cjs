const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
(async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', children: [], addEventListener() {}, append(item) { this.children.push(item); } });
    return nodes.get(id);
  };
  const storage = new Map(); const calls = []; let fail = false;
  const context = {
    window: {}, crypto: require('node:crypto').webcrypto, AbortSignal,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { querySelector: node, createElement: () => ({ textContent: '' }) },
    async fetch(url, options) {
      calls.push({ url, options });
      if (fail) throw new Error('offline');
      return { ok: true, json: async () => url.endsWith('/api/laps') ? { rank: 2, bestMs: 12346 } :
        { version: 'lut-20261009-v1', results: [{ nickname: '<script>', lap_ms: 12346 }] } };
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '../leaderboard.js'), 'utf8');
  vm.createContext(context); vm.runInContext(source, context);
  const token = storage.get('lpr-player-token');
  assert.match(token, /^[a-f0-9]{64}$/);
  await context.window.LPRLeaderboard.submit(12345.6, [3000.4, 3000.4, 6344.8]);
  assert.equal(calls.length, 0, 'No network submissions without a valid nickname');
  node('#leaderboard-name').value = 'Panu';
  await context.window.LPRLeaderboard.submit(12345.6, [3000.4, 3000.4, 6344.8]);
  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.sectors.reduce((a, b) => a + b, 0), sent.lapMs);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${token}`);
  assert.equal(node('#leaderboard-list').children[0].textContent, '<script> · 0:12.346', 'Names rendered as plain text');
  fail = true;
  await context.window.LPRLeaderboard.submit(12345.6, [3000.4, 3000.4, 6344.8]);
  assert.match(node('#leaderboard-status').textContent, /epäonnistui/);
  vm.runInContext(source, context);
  assert.equal(storage.get('lpr-player-token'), token, 'Reload preserves private identity');
  console.log('PASS: persistent player identity, nickname opt-in, rounded sectors, safe names and offline submissions');
})().catch(error => { console.error(error); process.exitCode = 1; });
