(() => {
  'use strict';
  const endpoint = 'https://lpr-leaderboard.panu-musakka.workers.dev';
  const version = 'lut-20261011-v3';
  const protocol = 'timed-v1';
  const t = (text, values) => window.LPRI18n?.t(text, values) ?? text;
  const nickname = document.querySelector('#leaderboard-name');
  const status = document.querySelector('#leaderboard-status');
  const list = document.querySelector('#leaderboard-list');
  const format = ms => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, '0')}`;
  const dialog = document.querySelector('#settings-dialog');
  const startForm = document.querySelector('#leaderboard-start-form');
  const consent = document.querySelector('#analytics-consent');
  const startButton = document.querySelector('#leaderboard-start');
  const closeButton = document.querySelector('#close-settings');
  const validName = name => /^[\p{L}\p{N} _.-]{1,24}$/u.test(name);
  const validToken = value => /^[a-f0-9]{64}$/.test(value ?? '');
  const newToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
  let token, activeName = '', rememberedName = '', legacyToken;
  let pending = [], sending = null;
  let activeLap = null;
  const pendingKey = () => `lpr-pending-laps:${token}`;
  function savePending() {
    try { localStorage.setItem(pendingKey(), JSON.stringify(pending)); } catch {}
  }
  try {
    rememberedName = localStorage.getItem('lpr-nickname') ?? '';
    nickname.value = rememberedName;
    legacyToken = localStorage.getItem('lpr-player-token');
  } catch {}
  function chooseIdentity(name) {
    // A shared phone can have several drivers; changing names must not submit
    // one person's lap under another person's identity.
    const key = `lpr-player-token:${name.normalize('NFC').toLowerCase()}`;
    let saved;
    try { saved = localStorage.getItem(key); } catch {}
    const identity = validToken(saved) ? saved
      : name === rememberedName && validToken(legacyToken) ? legacyToken : newToken();
    try {
      localStorage.setItem(key, identity);
      localStorage.setItem('lpr-player-token', identity);
      localStorage.setItem('lpr-nickname', name);
    } catch {}
    return identity;
  }
  nickname.addEventListener('input', () => nickname.setCustomValidity(''));
  startForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!consent.checked) {
      consent.setCustomValidity(t('Hyväksy nimimerkkiin yhdistettyjen peli- ja käyttötietojen kerääminen ennen pelaamista.'));
      consent.reportValidity();return;
    }
    const name = activeName || nickname.value.trim().normalize('NFC');
    if (!validName(name)) {
      nickname.setCustomValidity(t('Kirjoita 1–24 merkin nimimerkki. Käytä kirjaimia, numeroita, välilyöntiä, pistettä, viivaa tai alaviivaa.'));
      nickname.reportValidity();
      return;
    }
    token = chooseIdentity(name);
    activeName = name;
    window.LPRAnalytics?.identify(name);
    try {
      const saved = JSON.parse(localStorage.getItem(pendingKey()) ?? '[]');
      if (Array.isArray(saved)) pending = saved.filter(lap => lap?.version === version && lap.protocol === protocol &&
        typeof lap.nickname === 'string' && lap.nickname.normalize('NFC').toLowerCase() === name.toLowerCase() &&
        validToken(lap.lapId) && Number.isSafeInteger(lap.lapMs) && lap.lapMs > 5000 &&
        Array.isArray(lap.sectors) && lap.sectors.length === 3 && lap.sectors.every(n => Number.isSafeInteger(n) && n > 0) &&
        lap.sectors.reduce((a, b) => a + b, 0) === lap.lapMs);
    } catch {}
    nickname.value = name;
    nickname.readOnly = true;
    startButton.hidden = true;
    closeButton.hidden = false;
    dialog.classList.remove('session-start');
    dialog.close();
    flushPending();
  });
  dialog.addEventListener('cancel', event => { if (!activeName || !consent.checked) event.preventDefault(); });
  consent.addEventListener('change',()=>window.LPRLeaderboard.consentChanged());
  async function api(path, options) {
    const response = await fetch(endpoint + path, { ...options, signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      const error = new Error(`Leaderboard HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  async function refresh() {
    list.textContent = t('Ladataan tuloslistaa…');
    list.setAttribute('aria-busy', 'true');
    try {
      const data = await api('/api/leaderboard');
      if (data.version !== version || !Array.isArray(data.results)) throw new Error('Invalid leaderboard');
      list.textContent = '';
      const results = data.results.slice(0, 10);
      for (const row of results) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'standing-name';
        name.textContent = row.nickname;
        name.title = row.nickname;
        const time = document.createElement('span');
        time.className = 'standing-time';
        time.textContent = ` · ${format(row.lap_ms)}`;
        item.append(name, time);
        list.append(item);
      }
      if (!data.results.length) list.textContent = t('Ei vielä tuloksia.');
      return true;
    } catch {
      list.textContent = t('Tuloslista ei ole juuri nyt saatavilla.');
      return false;
    } finally { list.setAttribute('aria-busy', 'false'); }
  }
  async function flushPending() {
    if (sending) return sending;
    if (!token || !pending.length) return;
    sending = (async () => {
      try {
        do {
          while (pending.length) {
            const lap = pending[0];
            status.textContent = t('Lähetetään kierrosaikaa…');
            let result;
            try {
              result = await api('/api/laps', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(lap)
              });
            } catch (error) {
              if ([400,401,403,404,409,410,413,415,422,428].includes(error.status)) {
                pending.shift(); savePending();
                status.textContent = t('Kierrosta ei hyväksytty verkkotuloslistalle. Paikallinen aika säilyy.');
                continue;
              }
              throw error;
            }
            if (result.mode !== 'laps') {
              status.textContent = t('Verkkotuloslista ei vielä tue useita kierroksia samalta kuljettajalta.');
              return;
            }
            if (result.protection !== protocol || result.lapMs !== lap.lapMs) throw new Error('Invalid lap response');
            if (result.moderation === 'quarantined' || result.moderation === 'hidden') {
              pending.shift(); savePending();
              status.textContent = t('Kierros odottaa ylläpidon tarkistusta eikä näy vielä tuloslistalla.');
              continue;
            }
            if (result.moderation !== 'approved' || !Number.isSafeInteger(result.rank) || result.rank < 1) throw new Error('Invalid lap response');
            pending.shift();
            savePending();
            // The server decides whether this is a new record. A cached list may be stale.
            if (result.record === true && result.rank === 1) window.LPRRaceEffects?.celebrate(lap.lapMs);
            status.textContent = t('lapRank', { time: format(lap.lapMs), rank: result.rank });
            }
            await refresh();
          } while (pending.length);
        } catch {
          status.textContent = t('Kierrosaika odottaa lähetystä. Lähetystä yritetään uudelleen automaattisesti.');
        }
      })();
      try { await sending; } finally { sending = null; }
    }
    setInterval(()=>{
      if(!document.hidden&&dialog.open)void (async()=>{await flushPending();await refresh();})();
    },15000);
    window.addEventListener('online', flushPending);
    window.LPRLeaderboard = {
      get identity() { return activeName && token && consent.checked ? {nickname:activeName,token} : null; },
      consentChanged() {
        consent.setCustomValidity('');
        if(activeName && !consent.checked){
          window.LPRVerifiedDriving?.cancel('Ajo keskeytetty: peli- ja käyttötietojen keräämisen suostumus on peruttu.');
          window.LPRLeaderboard.beginSession();
        }
      },
      refresh,
      cancelLap() { activeLap = null; },
      startLap() {
        if (!token || !activeName) return Promise.resolve(null);
        const lap = { requestId: newToken(), nickname: activeName };
        activeLap = lap;
        lap.ticket = api('/api/laps/start', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ version, nickname: lap.nickname, requestId: lap.requestId })
        }).then(data => {
          if (data.mode !== protocol || !validToken(data.lapId)) throw new Error('Invalid lap start');
          return data.lapId;
        }).catch(() => null);
        return lap.ticket;
      },
      get requiresName() { return !activeName || !consent.checked; },
      beginSession() {
        if (activeName && consent.checked) return;
        // The last name is a suggestion, never an automatic login: each page
        // load requires an explicit confirmation before any driving can start.
        dialog.classList.add('session-start');
        closeButton.hidden = true;
        startButton.hidden = false;
        if (!dialog.open) dialog.showModal();
        refresh();
      },
      async submit(lapMs, sectors) {
        const started = activeLap;
        activeLap = null;
        const name = activeName;
        if (!token || !validName(name)) {
          status.textContent = t('Valitse nimimerkki tuloslistasta ennen seuraavaa kierrosta.');
          return;
        }
        if (!Number.isFinite(lapMs) || lapMs <= 5000 || !Array.isArray(sectors) || sectors.length !== 3 ||
            !sectors.every(n => Number.isFinite(n) && n > 0)) return;
        const rounded = sectors.map(Math.round);
        const elapsed = Math.round(lapMs);
        rounded[2] += elapsed - rounded.reduce((a, b) => a + b, 0);
        if (!rounded.every(n => Number.isSafeInteger(n) && n > 0) || !Number.isSafeInteger(elapsed) || elapsed <= 5000) return;
        const lapId = started && await started.ticket;
        if (!lapId || started.nickname !== name) {
          status.textContent = t('Kierros tallentui vain paikallisesti: verkkokierroksen aloitusta ei vahvistettu.');
          return;
        }
        pending.push({ version, protocol, nickname: name, lapId, lapMs: elapsed, sectors: rounded });
        savePending();
        await flushPending();
      }
    };
    window.LPRLeaderboard.beginSession();
  })();
