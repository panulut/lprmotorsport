/* First-party gameplay analytics. No requests or identifiers before consent. */
(() => {
  'use strict';
  const endpoint = 'https://lpr-leaderboard.panu-musakka.workers.dev';
  const version = 'lut-20261011-v3';
  const key = 'lpr-analytics-consent-v1', tokenKey = 'lpr-analytics-token-v1';
  const id = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
  const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const consentAt = 'lpr-analytics-consent-at-v1';
  const consentAge = Date.now() - Number(read(consentAt));
  const freshConsent = consentAge >= 0 && consentAge < 180 * 86400000;
  if (!freshConsent) { try { localStorage.removeItem(tokenKey); } catch {} }
  const consent = document.querySelector('#analytics-consent');
  const status = document.querySelector('#analytics-status');
  const remove = document.querySelector('#analytics-delete');
  let enabled = false, token, session, nickname = '', queue = [], sending = false;
  let state = 'menu', input = 'unknown', last = performance.now(), lastInput = last, focused = document.hasFocus();
  let buckets = {}, lastFlush = last, started = false;
  const metadata = () => {
    const ua = navigator.userAgent;
    let referrer = ''; try { referrer = new URL(document.referrer).hostname; } catch {}
    return {
      device: /Mobi|Android/i.test(ua) ? 'mobile' : 'desktop',
      browser: /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'other',
      os: /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'other',
      width: Math.min(10000, screen.width), height: Math.min(10000, screen.height),
      language: navigator.language.slice(0, 20), referrer: referrer.slice(0, 200)
    };
  };
  let meta;
  function event(type, details = {}) {
    if (!enabled || queue.length >= 300) return;
    queue.push({ id: id(), at: Date.now(), type, state, input, nickname, ...details });
  }
  function tick() {
    const now = performance.now();
    // Never charge a suspended browser's timer gap to active play.
    const dt = Math.max(0, Math.min(now - last, 2000)); last = now;
    if (!enabled || document.hidden || !focused) return;
    const active = now - lastInput < 120000;
    const category = active ? state : 'idle';
    buckets[category] = (buckets[category] || 0) + dt;
  }
  function collect() {
    tick();
    for (const [state, ms] of Object.entries(buckets)) if (ms >= 1) event('time', { state, ms: Math.round(ms) });
    buckets = {};
  }
  async function flush(beacon = false) {
    if (!enabled) return;
    collect();
    if (!queue.length) return;
    const events = queue.slice(0, 40);
    const body = JSON.stringify({ token, session, version, consentAt: Number(read(consentAt)) || Date.now(), meta, events });
    // Keep events until acknowledgement. A beacon and a retry share event IDs.
    if (beacon) { try { navigator.sendBeacon(endpoint + '/api/analytics/events', new Blob([body], { type: 'application/json' })); } catch {} return; }
    if (sending) return;
    sending = true;
    try {
      const response = await fetch(endpoint + '/api/analytics/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(10000) });
      if (response.status === 410) {
        enabled = false; consent.checked = false; window.LPRLeaderboard?.consentChanged?.(); write(key, 'no'); queue = []; buckets = {};
      }
      if (response.ok) { const ids = new Set(events.map(e => e.id)); queue = queue.filter(e => !ids.has(e.id)); }
    } catch {} finally { sending = false; }
  }
  function enable() {
    if (enabled) return;
    token = read(tokenKey);
    if (!/^[a-f0-9]{64}$/.test(token || '')) { token = id(); write(tokenKey, token); }
    session = id(); meta = metadata(); enabled = true; last = lastInput = performance.now();
    event('session_start');
    if (started) event('play_start');
    void flush();
  }
  consent.checked = read(key) === 'yes' && freshConsent;
  if (consent.checked) enable();
  consent.addEventListener('change', () => {
    write(key, consent.checked ? 'yes' : 'no');
    write(consentAt, String(Date.now()));
    if (consent.checked) enable();
    else { enabled = false; queue = []; buckets = {}; }
  });
  remove.addEventListener('click', async () => {
    enabled = false; consent.checked = false; window.LPRLeaderboard?.consentChanged?.(); write(key, 'no'); queue = []; buckets = {};
    const saved = token || read(tokenKey);
    if (!saved) { status.textContent = english() ? 'No analytics profile on this browser.' : 'Tässä selaimessa ei ole analytiikkaprofiilia.'; return; }
    remove.disabled = true; consent.disabled = true;
    // Wait for an in-flight upload before deletion so it cannot recreate the profile.
    const wait = () => new Promise(resolve => setTimeout(resolve, 100));
    while (sending) await wait();
    try {
      const r = await fetch(endpoint + '/api/analytics/me', { method: 'DELETE', headers: { Authorization: 'Bearer ' + saved }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw Error();
      try { localStorage.removeItem(tokenKey); } catch {} token = null;
      status.textContent = english() ? 'Analytics deleted. Public lap results are separate.' : 'Analytiikkatiedot poistettu. Julkiset kierrostulokset ovat erillisiä.';
    } catch { status.textContent = english() ? 'Deletion failed. Collection is off; please retry.' : 'Poisto epäonnistui. Keräys on pois päältä; yritä uudelleen.'; }
    finally { remove.disabled = false; consent.disabled = false; }
  });
  function english() { return document.documentElement.lang === 'en'; }
  function translate() {
    document.querySelector('#analytics-label').textContent = english() ? 'I accept the collection of nickname-linked gameplay and usage data to improve the game (required to play)' : 'Hyväksyn nimimerkkiini yhdistettyjen peli- ja käyttötietojen keräämisen pelin kehittämiseksi (pelaamisen edellytys)';
    document.querySelector('#analytics-info').textContent = english() ? 'The game developer can see your sessions, activity, lap times, device/browser categories and referring site. Stored for 90 days. No IP addresses or precise location are stored in your profile. You must accept collection before playing. You can withdraw here at any time; driving then stops. This browser identifies your profile; it is not a verified identity.' : 'Pelin kehittäjä näkee pelikerrat, tekemiset, kierrosajat, laite- ja selainluokan sekä tulosivuston. Säilytys 90 päivää. Profiiliin ei tallenneta IP-osoitetta tai tarkkaa sijaintia. Tietojen kerääminen on hyväksyttävä ennen pelaamista. Voit perua suostumuksen tästä milloin tahansa, jolloin ajo keskeytyy. Profiili tunnistaa tämän selaimen, ei varmennettua henkilöä.';
    remove.textContent = english() ? 'Delete my analytics' : 'Poista analytiikkatietoni';
  }
  translate(); new MutationObserver(translate).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  for (const type of ['keydown', 'pointerdown', 'pointermove', 'wheel']) window.addEventListener(type, e => {
    // Only activity timing and input category are kept, never keys or coordinates.
    tick(); lastInput = performance.now();
    input = type === 'keydown' ? 'keyboard' : e.pointerType === 'touch' ? 'touch' : 'mouse';
  }, { passive: true });
  window.addEventListener('storage', e => {
    if ((e.key === key && e.newValue !== 'yes') || (e.key === tokenKey && !e.newValue) || e.key === null) {
      enabled = false; consent.checked = false; window.LPRLeaderboard?.consentChanged?.(); queue = []; buckets = {};
    }
  });
  window.addEventListener('blur', () => { tick(); focused = false; void flush(true); });
  window.addEventListener('focus', () => { focused = true; last = lastInput = performance.now(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) void flush(true); last = performance.now(); });
  window.addEventListener('pagehide', () => { event('page_hide'); void flush(true); });
  window.addEventListener('pageshow', () => { last = performance.now(); });
  // Fixed error codes only: never send URLs, stack traces or user-provided text.
  window.addEventListener('error', () => event('error', { code: 'runtime' }));
  window.addEventListener('unhandledrejection', () => event('error', { code: 'promise' }));
  setInterval(() => { tick(); if (performance.now() - lastFlush >= 30000) { lastFlush = performance.now(); void flush(); } }, 1000);
  window.LPRAnalytics = {
    identify(name) { nickname = name; started = true; event('play_start'); void flush(); },
    event,
    sample(next, gamepadActive = false, controlActive = false) {
      tick();
      if (state !== next) { state = next; event('state_change'); }
      if (controlActive) lastInput = performance.now();
      if (gamepadActive) { lastInput = performance.now(); input = 'gamepad'; }
    },
    flush
  };
})();
