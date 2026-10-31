(() => {
  'use strict';
  const endpoint = 'https://lpr-leaderboard.panu-musakka.workers.dev';
  const version = 'lut-20261024-v4';
  const protocol = 'timed-v1';
  const t = (text, values) => window.LPRI18n?.t(text, values) ?? text;
  const nickname = document.querySelector('#leaderboard-name');
  const status = document.querySelector('#leaderboard-status');
  const list = document.querySelector('#leaderboard-list');
  const format = ms => window.LPRFormatLapTime(ms);
  const dialog = document.querySelector('#settings-dialog');
  const startForm = document.querySelector('#leaderboard-start-form');
  const consent = document.querySelector('#analytics-consent');
  const startButton = document.querySelector('#leaderboard-start');
  const closeButton = document.querySelector('#close-settings');
  const validName = name => /^[\p{L}\p{N} _.-]{1,24}$/u.test(name) && !/\s\s/.test(name);
  const validToken = value => /^[a-f0-9]{64}$/.test(value ?? '');
  const newToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
  const nameKey = name => name.normalize('NFC').toLowerCase();
  const password = document.querySelector('#leaderboard-password');
  const passwordRow = [document.querySelector('#leaderboard-password-label'), password, document.querySelector('#leaderboard-password-hint')];
  const logoutButton = document.querySelector('#leaderboard-logout');
  const startLabel = document.querySelector('#leaderboard-start-label');
  const choices = document.querySelector('#leaderboard-choices');
  const accountFields = document.querySelector('#leaderboard-account-fields');
  const accountTitle = document.querySelector('#leaderboard-account-title');
  const accountEndpoint = () => window.LPRVerificationConfig?.leaderboard;
  const demoMode = window.LPRVerificationConfig?.demo === true;
  const accountDisplayName = name => demoMode && name === 'Mika Demo' ? 'Mika Laine' : name;
  const accountKey = demoMode ? 'lpr-demo-account' : 'lpr-account';
  const guestSessionKey = demoMode ? 'lpr-demo-guest-session' : 'lpr-guest-session';
  const guestNicknameKey = demoMode ? 'lpr-demo-guest-nickname' : 'lpr-guest-nickname';
  const nicknameKey = demoMode ? 'lpr-demo-nickname' : 'lpr-nickname';
  let sessionChosen = false, guestSelection = false, guestNickname = '', guestSession = null;
  const guestFields = document.querySelector('#leaderboard-guest-fields');
  const guestName = document.querySelector('#leaderboard-guest-name');
  const guestStatus = document.querySelector('#leaderboard-guest-status');
  const guestStartButton = document.querySelector('#leaderboard-guest-start');
  const driverHeading = document.querySelector('#leaderboard-driver-heading');
  const driverMainView = document.querySelector('#leaderboard-main-view');
  const driverSettingsView = document.querySelector('#leaderboard-settings-view');
  const driverSettingsOpen = document.querySelector('#leaderboard-settings-open');
  const driverSettingsBack = document.querySelector('#leaderboard-settings-back');
  let settingsOpen = false;
  let token, activeName = '', activeSeries = 'human', account = null, authMode = null, signingIn = false;
  // Account creation asks credentials first, then an explicit human/bot series choice.
  let createStep = 1, chosenSeries = null;
  const credentials = document.querySelector('#leaderboard-credentials');
  const seriesStep = document.querySelector('#leaderboard-series-step');
  const seriesName = document.querySelector('#leaderboard-series-name');
  const stepLabel = document.querySelector('#leaderboard-create-step');
  const seriesChoices = [document.querySelector('#leaderboard-series-human'), document.querySelector('#leaderboard-series-bot')];
  const seriesOf = value => value === 'bot' ? 'bot' : 'human';
  let pending = [], sending = null;
  let activeLap = null;
  const pendingKey = () => `lpr-pending-laps:${token}`;
  function savePending() {
    try { localStorage.setItem(pendingKey(), JSON.stringify(pending)); } catch {}
  }
  try {
    const saved = JSON.parse(localStorage.getItem(accountKey) ?? 'null');
    if (saved && validName(saved.nickname) && validToken(saved.token) && Number.isSafeInteger(saved.expiresAt) && saved.expiresAt > Date.now()) account = { nickname: saved.nickname, token: saved.token, expiresAt: saved.expiresAt, series: seriesOf(saved.series) };
    else localStorage.removeItem(accountKey);
    nickname.value = account?.nickname ?? localStorage.getItem(nicknameKey) ?? '';
  } catch {}
  function showAccount() {
    window.LPRChat?.identityChanged?.();
    const promotionPanel = document.querySelector('#guest-register-panel');
    if (promotionPanel) promotionPanel.hidden = !guestSession;
    if (account && account.expiresAt <= Date.now()) forget();
    // A remembered sign-in skips the password, but every page load still needs Aloita ajo.
    const remembered = !!account && account.expiresAt > Date.now();
    const showFields = !!activeName || !!authMode;
    if (driverHeading) driverHeading.hidden = !remembered || !!guestSelection || !!authMode || settingsOpen;
    if (driverMainView) driverMainView.hidden = settingsOpen;
    if (driverSettingsView) driverSettingsView.hidden = !settingsOpen;
    if (driverSettingsOpen) {
      driverSettingsOpen.hidden = false;
      driverSettingsOpen.setAttribute('aria-expanded', String(settingsOpen));
    }
    if (guestFields) guestFields.hidden = !guestSelection;
    const lobbyDrive=document.querySelector('#leaderboard-drive');
    if (lobbyDrive) {
      lobbyDrive.hidden = !dialog.open || (!sessionChosen && !remembered);
      lobbyDrive.textContent = t('Siirry radalle');
    }
    if (choices) choices.hidden = remembered || showFields || guestSelection || sessionChosen;
    if (accountFields) accountFields.hidden = !showFields || sessionChosen;
    const backButton = document.querySelector('#leaderboard-back');
    if (backButton) backButton.hidden = !!activeName;
    startButton.hidden = !showFields || !!activeName;
    nickname.disabled = !showFields;
    password.disabled = !showFields || remembered || !!activeName;
    nickname.readOnly = !!account || !!activeName;
    for (const element of passwordRow) if (element) element.hidden = !!account || !!activeName;
    if (logoutButton) logoutButton.hidden = !remembered;
    const createButton = document.querySelector('#leaderboard-create');
    if (createButton) createButton.hidden = !authMode || remembered || !!activeName || authMode === 'create';
    const createPrompt = document.querySelector('#leaderboard-create-prompt');
    if (createPrompt) createPrompt.hidden = !authMode || remembered || !!activeName || authMode === 'create';
    password.autocomplete = authMode === 'create' ? 'new-password' : 'current-password';
    const creating = authMode === 'create' && !remembered && !activeName;
    const choosingSeries = creating && createStep === 2;
    const label = remembered || activeName ? 'Aja leaderboardiin' : creating ? (choosingSeries ? 'Luo käyttäjätunnus' : 'Jatka') : 'Kirjaudu sisään';
    if (startLabel) startLabel.textContent = t(label);
    if (accountTitle) accountTitle.textContent = t(remembered || activeName ? 'Kuljettaja' : creating ? (choosingSeries ? 'Valitse sarja' : 'Luo käyttäjätunnus') : 'Kirjaudu sisään');
    if (stepLabel) { stepLabel.hidden = !creating; stepLabel.textContent = t(choosingSeries ? 'Vaihe 2/2: sarja' : 'Vaihe 1/2: nimimerkki ja salasana'); }
    if (credentials) credentials.hidden = choosingSeries;
    if (seriesStep) seriesStep.hidden = !choosingSeries;
    if (seriesName) seriesName.textContent = choosingSeries ? `${t('Nimimerkki')}: ${nickname.value.trim()}` : '';
    if (backButton) {
      const backLabel = t(choosingSeries ? 'Takaisin' : 'Takaisin valikkoon');
      backButton.setAttribute('aria-label', backLabel);
      backButton.title = backLabel;
    }
    const hint = document.querySelector('#leaderboard-password-hint');
    if (hint) hint.hidden = remembered || !!activeName || authMode !== 'create';
  }
  driverSettingsOpen?.addEventListener('click', () => {
    settingsOpen = true;
    showAccount();
    driverSettingsBack?.focus();
  });
  driverSettingsBack?.addEventListener('click', () => {
    settingsOpen = false;
    showAccount();
    driverSettingsOpen?.focus();
  });
  if (driverSettingsBack) {
    const label = t('Takaisin');
    driverSettingsBack.setAttribute('aria-label', label);
    driverSettingsBack.title = label;
  }
  driverSettingsView?.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      settingsOpen = false;
      showAccount();
      driverSettingsOpen?.focus();
    }
  });
  const syncLobbyDrive = () => {
    const button = document.querySelector('#leaderboard-drive');
    if (button) button.hidden = !dialog.open || (!sessionChosen && !(account?.expiresAt > Date.now()));
  };
  new MutationObserver(syncLobbyDrive).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  dialog.addEventListener('close', syncLobbyDrive);
  document.querySelector('#leaderboard-drive')?.addEventListener('click', () => {
    if (sessionChosen) return;
    if (!account || account.expiresAt <= Date.now()) { showAccount(); return; }
    sessionChosen = true; authMode = null; guestSelection = false; guestNickname = '';
    activeName = accountDisplayName(account.nickname); activeSeries = seriesOf(account.series); token = account.token;
    activeLap = null;
    try {
      const saved = JSON.parse(localStorage.getItem(pendingKey()) ?? '[]');
      pending = Array.isArray(saved) ? saved.filter(lap => lap?.version === version && lap.protocol === protocol &&
        lap.nickname === activeName && validToken(lap.lapId) && Number.isSafeInteger(lap.lapMs) && lap.lapMs > 5000 &&
        Array.isArray(lap.sectors) && lap.sectors.length === 3 && lap.sectors.every(n => Number.isSafeInteger(n) && n > 0) &&
        lap.sectors.reduce((a, b) => a + b, 0) === lap.lapMs) : [];
    } catch { pending = []; }
    showAccount();
    window.LPRAnalytics?.identify(activeName);
    document.dispatchEvent(new Event('lpr-lobby-ready'));
  });
  function setStep(step) {
    createStep = step;
    status.textContent = '';
    showAccount();
    if (step === 2) (seriesChoices.find(choice => choice?.checked) ?? seriesChoices[0])?.focus?.();
    else nickname.focus?.();
  }
  for (const choice of seriesChoices) choice?.addEventListener('change', () => {
    if (choice.checked) { chosenSeries = seriesOf(choice.value); status.textContent = ''; }
  });
  function chooseAuth(mode) {
    if (signingIn || guestSession) return;
    authMode = mode;
    guestSelection = false;
    guestNickname = '';
    password.value = '';
    createStep = 1; chosenSeries = null;
    for (const choice of seriesChoices) if (choice) choice.checked = false;
    nickname.setCustomValidity(''); password.setCustomValidity('');
    status.textContent = '';
    showAccount();
    if (mode) nickname.focus?.();
  }
  document.querySelector('#leaderboard-login')?.addEventListener('click', () => chooseAuth('login'));
  document.querySelector('#leaderboard-create')?.addEventListener('click', () => chooseAuth('create'));
  document.querySelector('#leaderboard-back')?.addEventListener('click', () => {
    if (authMode === 'create' && createStep === 2) setStep(1);
    else chooseAuth(null);
  });
  function forget() {
    account = null; authMode = null;
    try { localStorage.removeItem(accountKey); } catch {}
  }
  async function signIn(name, secret, create) {
    if (!accountEndpoint()) throw Object.assign(new Error('Accounts unavailable'), { status: 503 });
    const response = await fetch(accountEndpoint() + '/api/verified/account', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: name, password: secret, create, ...(create ? { series: chosenSeries } : {}) }), signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw Object.assign(new Error(`Account HTTP ${response.status}`), { status: response.status });
    const data = await response.json();
    if (!validName(data?.nickname) || nameKey(data.nickname) !== nameKey(name) || !validToken(data.token) || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now()) throw new Error('Invalid account response');
    return { nickname: data.nickname, token: data.token, expiresAt: data.expiresAt, series: seriesOf(data.series) };
  }
  const signInError = (status, name) => status === 404 ? t('Tunnusta ei löytynyt. Valitse Luo käyttäjätunnus luodaksesi uuden tunnuksen.')
    : status === 401 ? t('Väärä salasana tälle nimimerkille.')
    : status === 409 ? t('Nimimerkki on jo varattu. Kirjaudu sen salasanalla tai valitse toinen nimimerkki.')
    : status === 429 ? t('Liian monta kirjautumisyritystä. Odota hetki ja yritä uudelleen.')
    : status === 400 ? t('Tarkista nimimerkki ja salasana.')
    : t('Kirjautuminen ei onnistunut juuri nyt. Yritä uudelleen.');
  nickname.addEventListener('input', () => {
    nickname.setCustomValidity('');
    status.textContent = '';
  });
  password.addEventListener('input', () => password.setCustomValidity(''));
  logoutButton?.addEventListener('click', async () => {
    const current = account?.expiresAt > Date.now() ? account : null;
    if (!current || signingIn) return;
    signingIn = true; logoutButton.disabled = true; startButton.disabled = true;
    try {
      const response = await fetch(accountEndpoint() + '/api/verified/logout', {
        method: 'POST', headers: { Authorization: 'Bearer ' + current.token }, signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw Error('Logout failed');
      window.LPRLeaderboard.signOut();
      nickname.value = ''; password.value = ''; status.textContent = '';
      showAccount(); nickname.focus?.();
    } catch {
      status.textContent = t('Uloskirjautuminen ei onnistunut. Tarkista yhteys ja yritä uudelleen.');
    } finally { signingIn = false; logoutButton.disabled = false; startButton.disabled = false; }
  });
  showAccount();
  startForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (signingIn) return;
    if (!activeName && !authMode) return;
    const name = activeName || nickname.value.trim().normalize('NFC');
    if (!validName(name)) {
      nickname.setCustomValidity(t('Kirjoita 1–24 merkin nimimerkki. Käytä kirjaimia, numeroita, välilyöntiä, pistettä, viivaa tai alaviivaa.'));
      nickname.reportValidity();
      return;
    }
    let identity = activeName ? { nickname: activeName, token }
      : account && nameKey(account.nickname) === nameKey(name) ? account : null;
    if (!identity) {
      if ([...password.value].length < 8) {
        password.setCustomValidity(t('Kirjoita vähintään 8 merkin salasana.'));
        password.reportValidity();
        return;
      }
      const creating = authMode === 'create';
      if (creating && createStep === 1) { setStep(2); return; }
      if (creating && !chosenSeries) {
        status.textContent = t('Valitse ihmisten tai bottien sarja.');
        seriesChoices[0]?.focus?.();
        return;
      }
      signingIn = true; startButton.disabled = true;
      status.textContent = t('Kirjaudutaan…');
      try {
        identity = await signIn(name, password.value, creating);
      } catch (error) {
        // A taken or invalid nickname must be fixed on the credentials step.
        if (creating && (error.status === 409 || error.status === 400)) createStep = 1;
        status.textContent = signInError(error.status, name);
        showAccount();
        return;
      } finally { signingIn = false; startButton.disabled = false; }
      password.value = ''; authMode = null; createStep = 1; chosenSeries = null; status.textContent = '';
      account = identity;
      guestNickname = '';
      try { localStorage.setItem(accountKey, JSON.stringify(account)); localStorage.setItem(nicknameKey, account.nickname); } catch {}
    }
    sessionChosen = true;
    token = identity.token;
    if (!activeName) activeSeries = seriesOf(identity.series);
    activeName = identity.nickname;
    window.LPRAnalytics?.identify(activeName);
    try {
      const saved = JSON.parse(localStorage.getItem(pendingKey()) ?? '[]');
      if (Array.isArray(saved)) pending = saved.filter(lap => lap?.version === version && lap.protocol === protocol &&
        typeof lap.nickname === 'string' && nameKey(lap.nickname) === nameKey(activeName) &&
        validToken(lap.lapId) && Number.isSafeInteger(lap.lapMs) && lap.lapMs > 5000 &&
        Array.isArray(lap.sectors) && lap.sectors.length === 3 && lap.sectors.every(n => Number.isSafeInteger(n) && n > 0) &&
        lap.sectors.reduce((a, b) => a + b, 0) === lap.lapMs);
    } catch {}
    nickname.value = activeName;
    showAccount();
    startButton.hidden = true;
    closeButton.hidden = true;
    dialog.classList.remove('session-start');
    dialog.classList.add('lobby-ready');
    flushPending();
    // Login selects an identity, not a verified driving slot. Keep the lobby open.
    document.dispatchEvent(new Event('lpr-lobby-ready'));
  });
  document.querySelector('#leaderboard-practice')?.addEventListener('click', () => {
    if (signingIn) return;
    guestSelection = true; authMode = null; guestNickname = '';
    if (guestStatus) guestStatus.textContent = '';
    showAccount();
    guestName.value = localStorage.getItem(guestNicknameKey) || '';
    guestName.focus();
  });
  document.querySelector('#leaderboard-guest-back')?.addEventListener('click', () => {
    guestSelection = false; showAccount();
  });
  document.querySelector('#leaderboard-guest-start')?.addEventListener('click', async () => {
    if (signingIn || !guestSelection) return;
    const name = guestName.value.trim().normalize('NFC');
    if (!validName(name)) {
      guestName.setCustomValidity(t('Kirjoita 1–24 merkin nimimerkki. Käytä kirjaimia, numeroita, välilyöntiä, pistettä, viivaa tai alaviivaa.'));
      guestName.reportValidity(); return;
    }
    const series = document.querySelector('input[name="guest-series"]:checked')?.value;
    if (!['human','bot'].includes(series)) { if (guestStatus) guestStatus.textContent = t('Valitse ihmisten tai bottien sarja.'); return; }
    signingIn = true;
    if (guestStartButton) guestStartButton.disabled = true;
    if (guestStatus) guestStatus.textContent = t('Muodostetaan vierailijaistuntoa…');
    try {
      let remembered;
      try { remembered = JSON.parse(localStorage.getItem(guestSessionKey) || 'null'); } catch {}
      const resume = remembered?.nickname === name && remembered?.series === series && remembered.expiresAt > Date.now() && validToken(remembered.token);
      const response = await fetch(accountEndpoint() + '/api/verified/guest', {
        method:'POST',headers:{'Content-Type':'application/json',...(resume?{Authorization:'Bearer '+remembered.token}:{})},
        body:JSON.stringify({nickname:name,series}),signal:AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        if (response.status === 401) localStorage.removeItem(guestSessionKey);
        throw Object.assign(Error('Guest session unavailable'),{status:response.status});
      }
      const data = await response.json();
      if (!validName(data.nickname) || !validToken(data.token) || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now() || !['human','bot'].includes(data.series) || typeof data.guest !== 'boolean') throw Error('Invalid guest session');
      guestSession = data;
      try { localStorage.setItem(guestSessionKey,JSON.stringify(data)); localStorage.setItem(guestNicknameKey,name); } catch {}
    } catch (error) {
      if (guestStatus) guestStatus.textContent = window.LPRVerificationConfig?.mode === 'local' && (!error.status || [403,404].includes(error.status))
        ? 'Paikallinen kirjautumispalvelu ei vastaa. Avaa testiversio osoitteessa /?demo=1 tai käynnistä taustapalvelut.'
        : signInError(error.status,name);
      return;
    } finally { signingIn = false; if (guestStartButton) guestStartButton.disabled = false; }
    if (guestStatus) guestStatus.textContent = '';
    guestNickname = guestSession.nickname;
    activeSeries = guestSession.series;
    const resumedAccount = !guestSession.guest ? guestSession : null;
    sessionChosen = true; guestSelection = false; activeName = ''; token = guestSession.token; pending = []; activeLap = null;
    password.value = ''; authMode = null; status.textContent = '';
    window.LPRVerifiedDriving?.identityCleared?.();
    if (resumedAccount) {
      account = resumedAccount; activeName = resumedAccount.nickname; guestSession = null; guestNickname = '';
      try { localStorage.setItem(accountKey,JSON.stringify(account)); localStorage.removeItem(guestSessionKey); } catch {}
      nickname.value = activeName;
      window.LPRVerifiedDriving?.identityPromoted?.({...resumedAccount,guest:true});
    }
    window.LPRAnalytics?.identify(activeName);
    showAccount(); closeButton.hidden = true;
    dialog.classList.remove('session-start'); dialog.classList.add('lobby-ready');
    document.dispatchEvent(new Event('lpr-lobby-ready'));

  });
  document.querySelector('#guest-register-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!guestSession || signingIn) return;
    const original = guestSession;
    const result = document.querySelector('#guest-register-status');
    const name = document.querySelector('#guest-register-name').value.trim().normalize('NFC');
    const field = document.querySelector('#guest-register-password');
    const secret = field.value;
    if (!validName(name) || [...secret].length < 8 || secret.length > 128) { result.textContent = 'Tarkista nimimerkki ja salasana.'; return; }
    signingIn = true;
    try {
      const response = await fetch(accountEndpoint() + '/api/verified/account', {
        method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+original.token},
        body:JSON.stringify({nickname:name,password:secret,create:true,series:original.series}),signal:AbortSignal.timeout(15000)
      });
      if (!response.ok) throw Object.assign(Error('Registration failed'),{status:response.status});
      const data = await response.json();
      if (guestSession !== original) return;
      if (!validName(data.nickname) || data.token !== original.token || !data.claimed || data.guest) throw Error('Invalid promotion');
      account = {nickname:data.nickname,token:data.token,expiresAt:data.expiresAt,series:data.series};
      activeName = data.nickname; activeSeries = data.series; token = data.token;
      guestNickname = ''; guestSession = null; field.value = '';
      try { localStorage.setItem(accountKey,JSON.stringify(account)); localStorage.removeItem(guestSessionKey); } catch {}
      nickname.value = activeName;
      window.LPRVerifiedDriving?.identityPromoted?.(original);
      window.LPRAnalytics?.identify(activeName);
      showAccount();
      document.dispatchEvent(new Event('lpr-lap-saved'));
    } catch (error) { result.textContent = signInError(error.status,name); }
    finally { signingIn = false; }
  });
  guestName?.addEventListener('input',()=>{ guestName.setCustomValidity(''); if (guestStatus) guestStatus.textContent = ''; });
  dialog.addEventListener('cancel', event => { if (!sessionChosen || dialog.classList.contains('lobby-ready')) event.preventDefault(); });
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
    if (!list) return false; // The visible TOP 10 is now the server-verified list.
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
    if (!list) return; // Do not submit old, unverified laps from the retired leaderboard.
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
            if (result.record === true && result.rank === 1) {
              window.LPRRaceEffects?.celebrate(lap.lapMs);
              document.dispatchEvent(new CustomEvent('lpr-track-record', { detail: { lapMs: lap.lapMs } }));
            }
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
      get identity() { return guestSession ? {...guestSession,guest:true} : activeName && token ? {nickname:activeName,token,series:activeSeries} : null; },
      get accountIdentity() {
        if (!(account?.expiresAt > Date.now())) return null;
        return {nickname:accountDisplayName(account.nickname),series:account.series};
      },
      // Chat authentication is independent of choosing a verified driving session.
      get chatIdentity() {
        if (guestSession) return {...guestSession,guest:true};
        if (guestNickname) return {nickname:guestNickname,guest:true};
        if (account?.expiresAt > Date.now()) return {nickname:account.nickname,token:account.token,series:account.series};
        return null;
      },
      consentChanged() { consent.setCustomValidity(''); },
      refresh,
      cancelLap() { activeLap = null; },
      // Called when the server no longer accepts the remembered account (deleted or revoked).
      signOut(message) {
        forget();
        sessionChosen = false; activeName = ''; guestNickname = ''; guestSession = null; token = undefined; pending = [];
        try { localStorage.removeItem(guestSessionKey); } catch {}
        window.LPRVerifiedDriving?.identityCleared?.();
        dialog.classList.remove('lobby-ready');
        showAccount();
        window.LPRLeaderboard.beginSession();
        if (message) status.textContent = t(message);
      },
      startLap() {
        // The retired leaderboard must never receive the account credential.
        if (!list || !token || !activeName) return Promise.resolve(null);
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
      get requiresName() { return !sessionChosen; },
      beginSession() {
        if (sessionChosen) return;
        // The last name is a suggestion, never an automatic login: each page
        // load requires an explicit confirmation before any driving can start.
        dialog.classList.add('session-start');
        closeButton.hidden = true;
        showAccount();
        if (!dialog.open) dialog.showModal();
        refresh();
      },
      async submit(lapMs, sectors) {
        if (!list) return;
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
