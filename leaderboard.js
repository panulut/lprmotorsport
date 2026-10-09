(() => {
  'use strict';
  const endpoint = 'https://lpr-leaderboard.panu-musakka.workers.dev';
  const version = 'lut-20261009-v1';
  const t = text => window.LPRI18n?.t(text) ?? text;
  const nickname = document.querySelector('#leaderboard-name');
  const status = document.querySelector('#leaderboard-status');
  const list = document.querySelector('#leaderboard-list');
  const format = ms => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, '0')}`;
  let token;
  try {
    nickname.value = localStorage.getItem('lpr-nickname') ?? '';
    token = localStorage.getItem('lpr-player-token');
    if (!/^[a-f0-9]{64}$/.test(token ?? '')) {
      token = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('lpr-player-token', token);
    }
  } catch { status.textContent = t('Verkkotulokset tarvitsevat selaimen tallennustilan.'); }
  nickname.addEventListener('change', () => {
    try { localStorage.setItem('lpr-nickname', nickname.value.trim()); } catch {}
  });
  async function api(path, options) {
    const response = await fetch(endpoint + path, { ...options, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Leaderboard HTTP ${response.status}`);
    return response.json();
  }
  async function refresh() {
    list.textContent = '';
    try {
      const data = await api('/api/leaderboard');
      if (data.version !== version || !Array.isArray(data.results)) throw new Error('Invalid leaderboard');
      for (const row of data.results) {
        const item = document.createElement('li');
        item.textContent = `${row.nickname} · ${format(row.lap_ms)}`;
        list.append(item);
      }
      if (!data.results.length) list.textContent = t('Ei vielä tuloksia.');
      return true;
    } catch {
      list.textContent = t('Tuloslista ei ole juuri nyt saatavilla.');
      return false;
    }
  }
  document.querySelector('#leaderboard-refresh').addEventListener('click', refresh);
  window.LPRLeaderboard = {
    refresh,
    async submit(lapMs, sectors) {
      const name = nickname.value.trim();
      if (!token || !/^[\p{L}\p{N} _.-]{1,24}$/u.test(name)) {
        status.textContent = t('Valitse nimimerkki tuloslistasta ennen seuraavaa kierrosta.');
        return;
      }
      try {
        status.textContent = t('Lähetetään kierrosaikaa…');
        const rounded = sectors.map(Math.round);
        const elapsed = Math.round(lapMs);
        rounded[2] += elapsed - rounded.reduce((a, b) => a + b, 0);
        const result = await api('/api/laps', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ version, nickname: name, lapMs: elapsed, sectors: rounded })
        });
        status.textContent = `${t('Oma sijoitus')}: ${result.rank} · ${t('Paras')}: ${format(result.bestMs)}`;
        await refresh();
      } catch { status.textContent = t('Tuloksen lähetys epäonnistui. Oma aika säilyy selaimessa.'); }
    }
  };
})();
