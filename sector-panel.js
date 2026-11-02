(() => {
  'use strict';
  const shell = document.querySelector('.game-shell');
  const lapPanel = document.querySelector('#lap-panel');
  const lapTime = document.querySelector('#lap-time');
  const lapCount = document.querySelector('#lap-count');
  if (!shell || !lapPanel || !lapTime || !lapCount) return;

  const t = text => window.LPRI18n?.t(text) ?? text;
  const panel = document.createElement('aside');
  panel.id = 'sector-panel';
  panel.className = 'sector-panel';
  panel.setAttribute('aria-label', t('Sektorit, kierrosaika ja ero omaan parhaaseen'));
  panel.innerHTML = `
    <div class="sector-panel-sectors" role="group" aria-label="${t('Sektorit')}">
      ${[1, 2, 3].map(number => `<div class="sector-chip" data-sector="${number}" data-state="idle" role="group" aria-label="S${number}"><span class="sector-chip-label">S${number}</span><span class="sector-chip-time">--:--.---</span></div>`).join('')}
    </div>
    <div class="sector-panel-clock">
      <span class="sector-panel-lap"><span class="sector-panel-label">${t('Kierros')}</span> <strong id="sector-lap-number">1</strong></span>
      <div class="sector-panel-time"><span class="sector-panel-label">${t('Kierrosaika')}</span><strong id="sector-current-time">--:--.---</strong></div>
    </div>
    <div class="sector-panel-last-lap sector-panel-delta" data-state="neutral" hidden><span class="sector-panel-label">${t('Viimeisin kierros')}</span><strong id="sector-last-lap" aria-live="off">--:--.---</strong></div>
    <div class="sector-panel-delta" data-state="neutral"><span class="sector-panel-label" aria-label="${t('Ero omaan parhaaseen')}">${t('Ero')}</span><strong id="sector-delta" aria-live="off">—</strong></div>`;
  lapPanel.after(panel);

  const chips = [1, 2, 3].map(number => panel.querySelector(`[data-sector="${number}"]`));
  const clock = panel.querySelector('#sector-current-time');
  const lapNumber = panel.querySelector('#sector-lap-number');
  const deltaValue = panel.querySelector('#sector-delta');
  const deltaRow = deltaValue.closest('.sector-panel-delta');
  const lastLapRow = panel.querySelector('.sector-panel-last-lap');
  const lastLapValue = panel.querySelector('#sector-last-lap');
  const format = ms => {
    if (!Number.isFinite(ms) || ms < 0) return '--:--.---';
    const whole = Math.floor(ms);
    return `${String(Math.floor(whole / 60000)).padStart(2, '0')}:${String(Math.floor(whole / 1000) % 60).padStart(2, '0')}.${String(whole % 1000).padStart(3, '0')}`;
  };
  const validBaseline = value => Array.isArray(value) && value.length === 3 && value.every(n => Number.isFinite(n) && n > 0) ? value : null;
  let lapStarted = false;
  let currentReference = 'none';
  let currentBest = null;
  let lastSplits = [null, null, null];

  function setReference(reference = 'none') {
    currentReference = ['personal-best', 'reference-lap'].includes(reference) ? reference : 'none';
    const regionLabel = currentReference === 'none'
      ? (window.LPRI18n?.language === 'en' ? 'No reference lap yet' : 'Vertailukierrosta ei vielä ole')
      : currentReference === 'reference-lap'
      ? t('Sektorit, kierrosaika ja ero vertailukierrokseen')
      : t('Sektorit, kierrosaika ja ero omaan parhaaseen');
    if (panel.getAttribute('aria-label') !== regionLabel) panel.setAttribute('aria-label', regionLabel);
    const label = panel.querySelector('.sector-panel-delta:not(.sector-panel-last-lap) .sector-panel-label');
    if (!label) return;
    const accessible = currentReference === 'reference-lap' ? t('Ero vertailukierrokseen') : currentReference === 'none' ? regionLabel : t('Ero omaan parhaaseen');
    const visible = t('Ero');
    if (label.textContent !== visible) label.textContent = visible;
    if (label.getAttribute('aria-label') !== accessible) label.setAttribute('aria-label', accessible);
  }

  function syncTime() {
    clock.textContent = lapStarted ? (lapTime.textContent.trim() || '--:--.---') : '--:--.---';
    lapNumber.textContent = lapCount.textContent.trim() || '1';
  }
  function setDelta(value) {
    const state = value === null ? 'neutral' : value < 0 ? 'faster' : value > 0 ? 'slower' : 'even';
    if (deltaRow.dataset.state !== state) deltaRow.dataset.state = state;
    let text;
    if (value === null) {
      text = '—';
    } else {
      const seconds = (Math.abs(value) / 1000).toFixed(3);
      text = value < 0 ? `−${seconds}` : value > 0 ? `+${seconds}` : `0.000`;
    }
    if (deltaValue.textContent !== text) deltaValue.textContent = text;
  }
  function setChip(index, split) {
    const chip = chips[index];
    if (!split) {
      chip.dataset.state = 'idle';
      chip.querySelector('.sector-chip-time').textContent = '--:--.---';
      chip.setAttribute('aria-label', t('Sektori {number}, ei vielä aikaa').replace('{number}', String(index + 1)));
      return;
    }
    const trackRecords = validBaseline(split.trackRecords);
    const personal = validBaseline(split.best) || currentBest;
    const sectorRecord = trackRecords?.[index];
    const state = Number.isFinite(sectorRecord) && split.time <= sectorRecord ? 'track-record'
      : Number.isFinite(personal?.[index]) && split.time <= personal[index] ? 'personal-best'
      : Number.isFinite(personal?.[index]) ? 'slower' : 'unknown';
    chip.dataset.state = state;
    chip.querySelector('.sector-chip-time').textContent = format(split.time);
    const stateLabel = state === 'track-record' ? t('Radan sektoriaikaennätys')
      : state === 'personal-best' ? t('Oma paras sektoriaika')
      : state === 'slower' ? t('Hitaampi kuin oma paras') : t('Vertailuaikaa ei ole');
    chip.setAttribute('aria-label', `${t('Sektori')} ${index + 1}: ${format(split.time)} · ${stateLabel}`);
  }
  function reset(detail = {}) {
    const { best = null, reference = 'none' } = detail;
    lapStarted = false;
    currentBest = validBaseline(best);
    setReference(reference);
    lastSplits = [null, null, null];
    syncTime();
    chips.forEach((_, index) => setChip(index, null));
    setDelta(null);
    // Restart only the current attempt; keep the last completed lap visible.
  }
  function start({ best = null, reference = 'none' } = {}) {
    lapStarted = true;
    currentBest = validBaseline(best) || currentBest;
    setReference(reference);
    lastSplits = [null, null, null];
    chips.forEach((_, index) => setChip(index, null));
    syncTime();
    setDelta(null);
  }
  document.addEventListener('lpr-sector-lap-reset', event => reset(event.detail || {}));
  document.addEventListener('lpr-sector-lap-started', event => start(event.detail || {}));
  document.addEventListener('lpr-sector-lap-completed', event => {
    const duration = event.detail?.lapTime;
    if (!Number.isFinite(duration) || duration <= 0) return;
    lastLapValue.textContent = format(duration);
    lastLapRow.hidden = false;
  });
  document.addEventListener('lpr-sector-split', event => {
    const split = event.detail || {};
    const index = split.sector - 1;
    if (!Number.isInteger(index) || index < 0 || index > 2 || !Number.isFinite(split.time) || split.time <= 0) return;
    lapStarted = true;
    currentBest = validBaseline(split.best) || currentBest;
    lastSplits[index] = split;
    setChip(index, split);
    syncTime();
    setDelta(Number.isFinite(split.delta) ? split.delta : null);
  });
  document.addEventListener('lpr-sector-live-delta', event => {
    const detail = event.detail || {};
    setDelta(Number.isFinite(detail.delta) ? detail.delta : null);
  });
  const observer = new MutationObserver(syncTime);
  observer.observe(lapTime, { childList: true, characterData: true, subtree: true });
  observer.observe(lapCount, { childList: true, characterData: true, subtree: true });
  window.addEventListener('lpr-language-changed', () => {
    const label = lastLapRow.querySelector('.sector-panel-label');
    if (label) label.textContent = t('Viimeisin kierros');
  });
  syncTime();

  function positionPanel() {
    if (window.matchMedia('(max-width: 650px)').matches) {
      const shellRect = shell.getBoundingClientRect();
      const lapRect = lapPanel.getBoundingClientRect();
      panel.style.left = '8px';
      panel.style.right = '8px';
      panel.style.width = 'auto';
      panel.style.top = `${Math.ceil(lapRect.bottom - shellRect.top + 8)}px`;
    } else {
      panel.style.left = 'auto';
      panel.style.right = '12px';
      panel.style.width = '';
      panel.style.top = '12px';
    }
  }
  const resizeObserver = new ResizeObserver(positionPanel);
  resizeObserver.observe(shell);
  resizeObserver.observe(lapPanel);
  window.addEventListener('resize', positionPanel);
  positionPanel();
})();
