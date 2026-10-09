// Paste this entire module into the Cloudflare Worker editor. Bind D1 as DB.
const VERSION = 'lut-20261009-v1';
const ORIGINS = new Set(['https://panulut.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000']);
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !ORIGINS.has(origin)) return reply({ error: 'Origin denied' }, 403);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    }
    const url = new URL(request.url);
    if (url.pathname === '/' && request.method === 'GET') return reply({ service: 'LPR leaderboard', version: VERSION });
    try {
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT nickname, lap_ms, sector1, sector2, sector3 FROM best_laps WHERE version = ? ORDER BY lap_ms, updated_at, player_hash LIMIT 20').bind(VERSION).all();
        return reply({ version: VERSION, results });
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
      if (data?.version !== VERSION || !/^[\p{L}\p{N} _.-]{1,24}$/u.test(nickname) ||
          !Number.isInteger(data.lapMs) || data.lapMs <= 5000 || data.lapMs > 3600000 ||
          !Array.isArray(sectors) || sectors.length !== 3 || !sectors.every(n => Number.isInteger(n) && n > 0) ||
          sectors.reduce((a, b) => a + b, 0) !== data.lapMs) return reply({ error: 'Invalid lap' }, 400);
      const now = Math.floor(Date.now() / 1000);
      const ip = await hash(request.headers.get('CF-Connecting-IP') ?? 'unknown');
      await env.DB.prepare('DELETE FROM submission_limits WHERE expires < ?').bind(now).run();
      const limit = await env.DB.prepare(`INSERT INTO submission_limits(ip_hash, expires, attempts) VALUES (?, ?, 1)
        ON CONFLICT(ip_hash) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`).bind(ip, now + 60).first();
      if (limit.attempts > 10) return reply({ error: 'Too many submissions; retry later' }, 429);
      const player = await hash(token);
      const result = await env.DB.prepare(`INSERT INTO best_laps(version, player_hash, nickname, lap_ms, sector1, sector2, sector3)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(version, player_hash) DO UPDATE SET
        nickname = excluded.nickname, lap_ms = excluded.lap_ms, sector1 = excluded.sector1,
        sector2 = excluded.sector2, sector3 = excluded.sector3, updated_at = CURRENT_TIMESTAMP
        WHERE excluded.lap_ms < best_laps.lap_ms`).bind(VERSION, player, nickname, data.lapMs, ...sectors).run();
      const personal = await env.DB.prepare('SELECT lap_ms FROM best_laps WHERE version = ? AND player_hash = ?').bind(VERSION, player).first();
      const rank = await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM best_laps WHERE version = ? AND lap_ms < ?').bind(VERSION, personal.lap_ms).first();
      return reply({ saved: result.meta.changes > 0, bestMs: personal.lap_ms, rank: rank.rank });
    } catch (error) {
      console.error('Leaderboard database operation failed', error);
      return reply({ error: 'Leaderboard unavailable' }, 503);
    }
  }
};
