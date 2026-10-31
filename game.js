(() => {
  'use strict';
  const t = (text, values) => window.LPRI18n?.t(text, values) ?? text;

  const canvas = document.querySelector('#track');
  const ui = {
    lap: document.querySelector('#lap-count'),
    time: document.querySelector('#lap-time'),
    speed: document.querySelector('#speed'),
    lateralG: document.querySelector('#lateral-g'),
    grip: document.querySelector('#grip-state'),
    tc: document.querySelector('#tc-status'),
    notice: document.querySelector('#notice'),
    noticeMessage: document.querySelector('.notice-message'),
    crashNotice: document.querySelector('.crash-notice'),
    crashTitle: document.querySelector('.crash-notice-title'),
    crashDetail: document.querySelector('.crash-notice-detail'),
    crashIconUse: document.querySelector('.crash-notice-icon use'),
    crashKeyboard: document.querySelector('.crash-notice-keyboard'),
    crashInstructionBefore: document.querySelector('.crash-notice-instruction-before'),
    crashInstructionAfter: document.querySelector('.crash-notice-instruction-after'),
    crashRestart: document.querySelector('.crash-notice-restart'),
    input: document.querySelector('#input-status'),
    dialog: document.querySelector('#settings-dialog')
  };
  const driveHud = {
    speed: document.querySelector('#drive-speed-value'),
    meters: [...document.querySelectorAll('.drive-input-meter')]
  };
  const driveHudReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const driveHudInput = { target: [0, 0], visual: [0, 0], lastFrame: performance.now() };
  function updateDriveHud(speed, brake = 0, throttle = 0) {
    if (!driveHud.speed) return;
    driveHud.speed.textContent = String(Math.round(speed * 3.6));
    [throttle, brake].forEach((input, meterIndex) => {
      const meter = driveHud.meters[meterIndex];
      if (!meter) return;
      const value = Math.round(Math.max(0, Math.min(1, Number(input) || 0)) * 100);
      driveHudInput.target[meterIndex] = value / 100;
      meter.setAttribute('aria-valuenow', String(value));
    });
  }
  function renderDriveHud(now) {
    const frameTime = Number.isFinite(now) ? now : performance.now();
    const elapsed = Math.max(0, Math.min(64, frameTime - driveHudInput.lastFrame));
    driveHudInput.lastFrame = frameTime;
    const blend = driveHudReducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / 80);
    driveHud.meters.forEach((meter, meterIndex) => {
      const target = driveHudInput.target[meterIndex] || 0;
      let value = driveHudReducedMotion.matches
        ? target
        : driveHudInput.visual[meterIndex] + (target - driveHudInput.visual[meterIndex]) * blend;
      if (Math.abs(target - value) < 0.003) value = target;
      driveHudInput.visual[meterIndex] = value;
      meter.style?.setProperty('--input-level', `${Math.max(0, Math.min(1, value)) * 100}%`);
      const lit = Math.ceil(value * 10);
      meter.querySelectorAll('.drive-input-segment').forEach((segment, index) => {
        segment.classList.toggle('is-active', index >= 10 - lit);
      });
    });
  }
  const WORLD = LPRCampus.bounds;
  const { halfWidth: ROAD_HALF, kerbOuter: KERB_OUTER, shoulderOuter: SHOULDER_OUTER } = LPRCampus.road;
  const track = LPRCampus.track;
  const POINTS = track.length;
  const trackDistances=[0];
  for(let i=0;i<POINTS;i++) trackDistances.push(trackDistances[i]+Math.hypot(
    track[(i+1)%POINTS].x-track[i].x,track[(i+1)%POINTS].y-track[i].y));
  const trackLength=trackDistances[POINTS];
  // Legacy split detection is centered on track indices 70 and 130. Stored
  // PBs carry the exact progress sampled at their gates; these landmarks are
  // the geometry-based fallback for older sector-only records.
  const defaultSectorProgress = [0, trackDistances[70] / trackLength, trackDistances[130] / trackLength, 1];
  const renderer = new LPRRenderer3D(canvas, document.querySelector('#cockpit'), track);
  const dynamics = new VehicleDynamics();
  const audio = new LPRGameAudio();
  const soundButton = document.querySelector('#sound-button');
  let audioFocused = true;
  function updateSoundButton() {
    const label = t(audio.enabled ? 'Äänet: päällä' : 'Äänet: pois');
    soundButton.setAttribute('aria-label', label);
    soundButton.setAttribute('title', label);
    soundButton.querySelector('.ph-icon use')?.setAttribute('href', `assets/phosphor-icons.svg?v=phosphor-regular-2.1.1#${audio.enabled ? 'speaker-high' : 'speaker-slash'}`);
    soundButton.setAttribute('aria-pressed', String(audio.enabled));
    const state = soundButton.querySelector('.sidebar-setting-value');
    if (state) state.textContent = window.LPRI18n?.language === 'en' ? (audio.enabled ? 'On' : 'Off') : (audio.enabled ? 'Päällä' : 'Pois');
  }
  function syncAudio() {
    const paused = document.hidden || !audioFocused || (ui.dialog.open && !window.LPRSpectator?.active);
    if (audio.paused !== paused) audio.setPaused(paused);
    const muted = paused || !audio.enabled;
    if (muted && !saunaLife.muted) saunaLife.stopSound();
    saunaLife.muted = muted;
  }
  const startAngle = LPRCampus.launchPosition.angle;
  const held = { left: false, right: false, gas: false, brake: false };
  const keyboard = new Set();
  const touchPointers = new Map();
  let activePad = null;
  let best = Number(localStorage.getItem('lpr-best-time-lut-20261011-v3')) || 0;
  let storedSectors = null;
  try { storedSectors = JSON.parse(localStorage.getItem('lpr-best-sectors-lut-20261011-v3')); } catch {}
  if (!storedSectors || storedSectors.lapTime !== best || storedSectors.revision !== window.LPRDrivingRevision) best = 0;
  let demoBest = 0;
  const storedBestSectorsCandidate = window.LPRLapTiming.validSectors(storedSectors?.sectors);
  const storedBestSectors = storedSectors?.lapTime === best && best > 0 && storedBestSectorsCandidate &&
    Math.abs(storedSectors.sectors.reduce((sum, value) => sum + value, 0) - best) <= 25
      ? storedSectors.sectors : null;
  const storedPBTrace = storedSectors?.lapTime === best && storedSectors?.revision === window.LPRDrivingRevision
    ? window.LPRLapTiming.validSamples(storedSectors.trace, best, 10) : null;
  const storedReferenceTrace = storedSectors && storedSectors.referenceRevision === window.LPRDrivingRevision
    ? window.LPRLapTiming.validSamples(storedSectors.referenceTrace, storedSectors.referenceLapTime, 10) : null;
  const storedTraceIsPersonalBest = Array.isArray(storedPBTrace);
  const storedTrace = storedPBTrace || storedReferenceTrace;
  const storedTraceTime = storedPBTrace ? best : storedSectors?.referenceLapTime;
  const timing = new LPRLapTiming(storedBestSectors,
    storedBestSectors ? storedSectors.checkpoints : null, storedTrace,
    storedPBTrace ? storedSectors?.revision : storedSectors?.referenceRevision,
    storedTraceTime, storedTraceIsPersonalBest, defaultSectorProgress);
  let localReferenceSnapshot = null;
  function rememberLocalReference() {
    localReferenceSnapshot = {
      trace: timing.bestTrace?.map(sample => sample.slice()) || null,
      lapTime: timing.referenceLapTime,
      isPersonalBest: timing.traceIsPersonalBest,
      sectors: timing.best?.slice() || null,
      progress: timing.bestProgress?.slice() || null,
      fromDemo: timing.bestFromDemo
    };
  }
  rememberLocalReference();
  const sectorUI = document.querySelector('#sector-time');
  let sectorPanelInvalid = false;
  const emitSectorPanel = (name, detail) => document.dispatchEvent(new CustomEvent(`lpr-sector-${name}`, { detail }));
  function emitLapCompleted(lapMs, personalBest = false, verifiedPending = false) {
    const time = Math.round(lapMs), nickname = window.LPRLeaderboard?.identity?.nickname || null;
    const detail = { lapMs: time, lapTime: time, nickname, personalBest: !!personalBest, verifiedPending: !!verifiedPending };
    document.dispatchEvent(new CustomEvent('lpr-lap-completed', { detail }));
    document.dispatchEvent(new CustomEvent('lpr-sector-lap-completed', { detail }));
  }
  const sectorBaseline = () => timing.best ? timing.best.slice() : null;
  const pendingVerifiedPB = new Map();
  function referenceLapTime() {
    return timing.lapBestTraceTime || best || demoBest || 0;
  }
  function promotePersonalBest(lapTime, sectors, checkpoints, trace, serverAccepted = false) {
    const personalBestThreshold = best || demoBest;
    if (!Array.isArray(sectors) || sectors.length !== 3 || (!serverAccepted && personalBestThreshold && lapTime >= personalBestThreshold)) return false;
    best = Math.round(lapTime);
    const total = sectors.reduce((sum, value) => sum + value, 0);
    const denseTrace = window.LPRLapTiming.validSamples(trace, lapTime || total, 10);
    const previousReference = !denseTrace && timing.bestTrace ? {
      referenceTrace: timing.bestTrace,
      referenceLapTime: timing.referenceLapTime,
      referenceRevision: window.LPRDrivingRevision
    } : null;
    timing.setBest(sectors, checkpoints, denseTrace, window.LPRDrivingRevision, lapTime || total, defaultSectorProgress);
    rememberLocalReference();
    localStorage.setItem('lpr-best-time-lut-20261011-v3', String(best));
    localStorage.setItem('lpr-best-sectors-lut-20261011-v3', JSON.stringify({
      lapTime: best, sectors: timing.best, revision: window.LPRDrivingRevision,
      ...(denseTrace ? { trace: denseTrace } : previousReference || {})
    }));
    return true;
  }
  function persistReferenceLap(lapTime, sectors, trace) {
    if (timing.bestTrace && (timing.traceIsPersonalBest || lapTime >= timing.referenceLapTime)) return false;
    const hasPersonalBestSectors = !!best && !!timing.best && !timing.bestFromDemo;
    const hasDemoSectors = !hasPersonalBestSectors && timing.bestFromDemo && !!demoBest && !!timing.best;
    const record = window.LPRLapTiming.referenceRecord({
      lapTime: hasPersonalBestSectors ? best : hasDemoSectors ? demoBest : Math.round(lapTime),
      sectors: hasPersonalBestSectors || hasDemoSectors ? timing.best : sectors,
      revision: hasPersonalBestSectors ? (storedSectors?.revision || window.LPRDrivingRevision) : window.LPRDrivingRevision,
      ...((hasPersonalBestSectors ? storedSectors?.checkpoints : hasDemoSectors ? null : timing.checkpoints) ?
        { checkpoints: hasPersonalBestSectors ? storedSectors.checkpoints : timing.checkpoints } : {})
    }, lapTime, sectors, trace, window.LPRDrivingRevision);
    if (!record || !timing.setReferenceTrace(trace, window.LPRDrivingRevision, lapTime)) return false;
    rememberLocalReference();
    localStorage.setItem('lpr-best-sectors-lut-20261011-v3', JSON.stringify(record));
    return true;
  }
  let lastLiveDeltaAt = 0, lastLiveDelta = undefined;
  function resetLiveDelta() { lastLiveDeltaAt = 0; lastLiveDelta = undefined; }
  function syncLiveDelta(elapsed, progress, now) {
    if (progress !== null) timing.capture(elapsed, progress, now);
    else timing.invalidateTrace();
    // Sector-only references have no honest same-position comparison between
    // gates. Keep the last exact cumulative split delta visible until the next
    // gate instead of clearing it with a periodic null live update.
    if (!timing.lapBestTrace) return;
    if (now - lastLiveDeltaAt < 75) return;
    lastLiveDeltaAt = now;
    const delta = progress === null ? null : timing.liveDelta(elapsed, progress);
    const value = delta === null ? null : Math.round(delta);
    if (value === lastLiveDelta) return;
    lastLiveDelta = value;
    emitSectorPanel('live-delta', { delta: value, source: 'mini-sector' });
  }
  const demoSectorBaseline = fixture => {
    const localPreview = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    const sectors = fixture?.sectors;
    if (!localPreview || !window.LPRVerificationConfig?.demo || fixture?.revision !== window.LPRDrivingRevision || fixture?.series !== 'human' || !Number.isSafeInteger(fixture?.lapMs) || best || timing.best || timing.sectors.length || !Array.isArray(sectors) || sectors.length !== 3 || !sectors.every(time => Number.isSafeInteger(time) && time > 0) || sectors.reduce((sum, time) => sum + time, 0) !== fixture.lapMs) return;
    demoBest = fixture.lapMs;
    timing.best = sectors.slice();
    timing.bestFromDemo = true;
    timing.bestProgress = window.LPRLapTiming.validCheckpointProgress(null, timing.best, defaultSectorProgress);
    timing.bestTrace = null;
    resetSectorPanel();
    rememberLocalReference();
  };
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    window.LPRSetDemoSectorBaseline = demoSectorBaseline;
    if (window.LPRDemoSectorBaseline) demoSectorBaseline(window.LPRDemoSectorBaseline);
  }
  let officialReferenceKey = '';
  function verifiedReplayTrace(recording, lapMs) {
    if (recording?.format !== 'lpr-replay-v1' || recording.sceneRevision !== window.LPRDrivingRevision || recording.hz !== 120 ||
      !Number.isFinite(lapMs) || !Array.isArray(recording.track) || recording.track.length !== track.length ||
      !recording.track.every((point, index) => Array.isArray(point) && point.length === 2 &&
        Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0] - track[index].x) < .00002 &&
        Math.abs(point[1] - track[index].y) < .00002) || !Array.isArray(recording.frames) ||
      recording.frames.length < 10 || recording.frames.length > 12002 || !Number.isSafeInteger(recording.startTick) ||
      !Number.isSafeInteger(recording.endTick) || recording.endTick <= recording.startTick ||
      Math.abs((recording.endTick - recording.startTick) * 1000 / 120 - lapMs) > 10) return null;
    const frames = recording.frames;
    if (frames[0]?.[0] !== recording.startTick || frames.at(-1)?.[0] !== recording.endTick) return null;
    const trace = [[0, 0]];
    let previousProgress = 0, previousTick = recording.startTick - 1;
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index];
      if (!Array.isArray(frame) || (frame.length !== 6 && frame.length !== 7) ||
        !frame.slice(0, 6).every(Number.isFinite) || !Number.isSafeInteger(frame[0]) ||
        frame[0] <= previousTick || frame[0] > recording.endTick) return null;
      previousTick = frame[0];
      const nearest = nearestTrack(frame[1], frame[2]);
      if (nearest.distance >= ROAD_HALF) return null;
      let progress = nearest.along / trackLength;
      if (index === 0 && progress > .98) progress = 0;
      if (index === frames.length - 1 && progress < .02) progress = 1;
      if (index === 0 && progress > .01) return null;
      if (progress < previousProgress - .001) return null;
      if (progress > previousProgress + .00005) {
        trace.push([progress, (frame[0] - recording.startTick) * 1000 / 120]);
        previousProgress = progress;
      }
    }
    if (trace.at(-1)[0] < .998) return null;
    return window.LPRLapTiming.validSamples(trace, lapMs, 10);
  }
  function clearVerifiedReference() {
    if (!officialReferenceKey) return;
    officialReferenceKey = '';
    timing.setReferenceTrace(null, null, null);
    timing.best = localReferenceSnapshot.sectors?.slice() || null;
    timing.bestProgress = localReferenceSnapshot.progress?.slice() || null;
    timing.bestFromDemo = localReferenceSnapshot.fromDemo;
    if (localReferenceSnapshot.trace) timing.setReferenceTrace(localReferenceSnapshot.trace,
      window.LPRDrivingRevision, localReferenceSnapshot.lapTime, localReferenceSnapshot.isPersonalBest);
    const activeLap = !!car?.lapTimingArmed || !!drivingWorld?.result().started;
    if (activeLap) {
      timing.lapBestTrace = null;
      timing.lapBestTraceTime = null;
      timing.lapBestTraceIsPersonalBest = false;
      timing.liveHighWater = 0;
      timing.liveSuspendedAt = null;
      resetLiveDelta();
      emitSectorPanel('live-delta', { delta: null });
    } else resetSectorPanel();
  }
  document.addEventListener('lpr-verified-reference-clear', clearVerifiedReference);
  function acceptVerifiedReference(detail) {
    const identity = window.LPRLeaderboard?.identity;
    if (!identity?.token || detail.identityToken !== identity.token || detail.series !== (identity.series === 'bot' ? 'bot' : 'human')) return;
    const sectors = window.LPRLapTiming.validSectors(detail.sectors);
    if (!sectors || !Number.isFinite(detail.lapMs) || Math.abs(sectors.reduce((sum, value) => sum + value, 0) - detail.lapMs) > 25) return;
    const trace = detail.recording ? verifiedReplayTrace(detail.recording, detail.lapMs) : null;
    if (trace) {
      // A stored dense trace stays in place unless this official lap is faster.
      if (timing.bestTrace && timing.referenceLapTime <= detail.lapMs) return;
      timing.setBest(sectors, null, trace, window.LPRDrivingRevision, detail.lapMs, defaultSectorProgress);
    } else if (!timing.bestTrace) {
      // Older laps have sector times and no position samples. Use those exact
      // gates until a dense reference exists, and never replace a faster local PB.
      const localMs = timing.best && !timing.bestFromDemo ? timing.best.reduce((sum, value) => sum + value, 0) : Infinity;
      if (localMs <= detail.lapMs + 25) return;
      timing.setBest(sectors, null, null, null, detail.lapMs, defaultSectorProgress);
    } else return;
    officialReferenceKey = `${detail.identityToken}:${detail.series}`;
    const activeLap = !!car?.lapTimingArmed || !!drivingWorld?.result().started;
    if (!activeLap) resetSectorPanel();
  }
  window.LPRAcceptVerifiedReference = acceptVerifiedReference;
  document.addEventListener('lpr-verified-reference-replay', event => acceptVerifiedReference(event.detail || {}));
  if (window.LPRPendingVerifiedReference) {
    const pendingReference = window.LPRPendingVerifiedReference;
    delete window.LPRPendingVerifiedReference;
    acceptVerifiedReference(pendingReference);
  }
  function startSectorPanel() {
    timing.reset();
    sectorPanelInvalid = false;
    resetLiveDelta();
    const reference = timing.lapBestTrace ? (timing.lapBestTraceIsPersonalBest ? 'personal-best' : 'reference-lap') : 'none';
    emitSectorPanel('lap-started', { best: sectorBaseline(), reference });
  }
  function resetSectorPanel() {
    timing.reset();
    sectorPanelInvalid = false;
    resetLiveDelta();
    const reference = timing.lapBestTrace ? (timing.lapBestTraceIsPersonalBest ? 'personal-best' : 'reference-lap') : 'none';
    emitSectorPanel('lap-reset', { best: sectorBaseline(), reference });
  }
  function invalidateSectorPanel() {
    if (sectorPanelInvalid) return;
    sectorPanelInvalid = true;
    timing.reset();
    emitSectorPanel('lap-reset', { best: sectorBaseline(), invalid: true });
  }

  let sectorTimeout = 0;
  function showSector(elapsed, progress, now) {
    const result = timing.split(elapsed, progress, now);
    if (!result) return;
    emitSectorPanel('split', {
      sector: result.sector,
      time: result.time,
      sectorDelta: result.delta,
      elapsed: timing.elapsed,
      progress: result.progress,
      delta: result.lapDelta,
      deltaSource: timing.lapBestTrace ? 'mini-sector' : result.lapDelta !== null ? 'sector-boundary' : null,
      best: sectorBaseline()
    });
    const difference = result.delta === null ? '' : ` (${result.delta > 0 ? '+' : result.delta < 0 ? '-' : ''}${(Math.abs(result.delta) / 1000).toFixed(3)} s)`;
    sectorUI.textContent = `S${result.sector} · ${formatTime(result.time)}${difference}`;
    clearTimeout(sectorTimeout);
    sectorUI.hidden = false;
    sectorTimeout = setTimeout(() => { sectorUI.hidden = true; }, 3000);
    sectorUI.classList.toggle('faster', result.delta !== null && result.delta < 0);
    sectorUI.classList.toggle('slower', result.delta !== null && result.delta > 0);
  }
  const tcPreferenceKey = 'lpr-traction-control';
  let tractionControlEnabled = true;
  try { tractionControlEnabled = localStorage.getItem(tcPreferenceKey) !== 'false'; } catch {}
  let car;
  let drivingWorld = null;
  let lastFrame = performance.now();
  let lastDeviceUpdate = 0;
  let noticeTimeout = 0;
  let noticePriority = 0;
  const saleEnter = document.querySelector('#sale-enter');
  const saunaEnter = document.querySelector('#sauna-enter');
  const poolEnter = document.querySelector('#pool-enter');
  const saunaSteam = document.querySelector('#sauna-steam');
  const saunaSeat = document.querySelector('#sauna-seat');
  const saunaHint = document.querySelector('#sauna-hint');
  const saunaSound = document.querySelector('#sauna-sound');
  const saunaDialogue = document.querySelector('#sauna-dialogue');
  const saunaLife = new LPRSaunaLife(text => {
    saunaDialogue.textContent = t(text);
    saunaDialogue.hidden = !text;
  });
  saunaLife.onSteam = () => audio.steam();
  soundButton.addEventListener('click', () => {
    audio.setEnabled(!audio.enabled);
    syncAudio();
    if (audio.enabled && saunaLife.sound) saunaLife.setSound(true);
    updateSoundButton();
  });
  for (const event of ['pointerdown', 'keydown']) {
    document.addEventListener(event, () => { syncAudio(); audio.unlock(); }, { capture: true });
  }
  window.addEventListener('blur', () => { audioFocused = false; syncAudio(); });
  window.addEventListener('focus', () => { audioFocused = true; syncAudio(); audio.unlock(); });
  updateSoundButton();
  syncAudio();
  let saunaLookPointer = null;
  let saunaHoverPosition = null;
  let saunaSteamSelected = false;
  function updateSteamTarget() {
    if (document.pointerLockElement === canvas) {
      const rect = canvas.getBoundingClientRect();
      saunaHoverPosition = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
    }
    const hovered=car.sauna && !ui.dialog.open && !saunaLookPointer && saunaHoverPosition &&
      renderer.saunaSteamTarget(car,saunaHoverPosition.x,saunaHoverPosition.y,performance.now());
    // Keep the revealed action available while moving from the prop to its button.
    if (hovered) saunaSteamSelected=true;
    saunaSteam.hidden = !car.sauna || ui.dialog.open;
    canvas.classList.toggle('steam-target', !!hovered);
  }

  function lookAround(yaw, pitch) {
    car.saunaYaw = Math.atan2(Math.sin((car.saunaYaw || 0) + yaw), Math.cos((car.saunaYaw || 0) + yaw));
    car.saunaPitch = Math.max(-1.15, Math.min(1.15, (car.saunaPitch ?? -.12) + pitch));
  }

  canvas.addEventListener('pointerdown', event => {
    if(!ui.dialog.open && event.button===0 && !(car.sauna || car.sale)) {
      const action=renderer.steeringWheelActionAt(car,event.clientX,event.clientY);
      if(action) { event.preventDefault(); operateWheel(action); return; }
    }
    if (!(car.sauna || car.sale) || ui.dialog.open || saunaLookPointer || event.button !== 0) return;
    event.preventDefault();
    if (event.pointerType === 'mouse' && canvas.requestPointerLock) {
      if (document.pointerLockElement === canvas) {
        if (car.sauna && saunaSteamSelected) throwSteam();
      } else {
        try {
          const request = canvas.requestPointerLock();
          request?.catch(() => {});
        } catch {}
      }
      return;
    }
    saunaLookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX:event.clientX, startY:event.clientY, dragged:false };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('looking');
  });
  canvas.addEventListener('pointermove', event => {
    if (document.pointerLockElement === canvas) return;
    if (!saunaLookPointer) {
      saunaHoverPosition = event.pointerType === 'touch' ? null : {x:event.clientX,y:event.clientY};
      updateSteamTarget();
      return;
    }
    if (!saunaLookPointer || event.pointerId !== saunaLookPointer.id || !(car.sauna || car.sale) || ui.dialog.open) return;
    event.preventDefault();
    const sensitivity = Math.PI / Math.max(240, canvas.clientWidth);
    if(Math.hypot(event.clientX-saunaLookPointer.startX,event.clientY-saunaLookPointer.startY)>6) saunaLookPointer.dragged=true;
    if (!saunaLookPointer.dragged) return;
    lookAround(-(event.clientX - saunaLookPointer.x) * sensitivity, (event.clientY - saunaLookPointer.y) * sensitivity);
    saunaLookPointer.x = event.clientX;
    saunaLookPointer.y = event.clientY;
  });
  document.addEventListener('mousemove', event => {
    if (document.pointerLockElement !== canvas || !(car.sauna || car.sale) || ui.dialog.open) return;
    lookAround(event.movementX * .0025, -event.movementY * .0025);
    updateSteamTarget();
  });
  document.addEventListener('pointerlockchange', () => {
    stopLooking();
    canvas.classList.toggle('looking', document.pointerLockElement === canvas);
    if (document.pointerLockElement !== canvas) saunaHoverPosition = null;
    updateSteamTarget();
  });
  function stopLooking() {
    const pointer = saunaLookPointer;
    saunaLookPointer = null;
    canvas.classList.remove('looking');
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => {
      if (event.pointerId !== saunaLookPointer?.id) return;
      if(type==='pointerup' && !saunaLookPointer.dragged && car.sauna && !ui.dialog.open) {
        saunaSteamSelected=renderer.saunaSteamTarget(car,event.clientX,event.clientY,performance.now());
        if(saunaSteamSelected) saunaHint.textContent=t("Heit\u00e4 l\u00f6yly\u00e4 kauhalla: valitse painike tai paina v\u00e4lily\u00f6nti\u00e4.");
      }
      stopLooking();
      updateSteamTarget();
    });
  }
  canvas.addEventListener('pointerleave', event => {
    if(event.relatedTarget===saunaSteam) return;
    saunaHoverPosition=null;
    updateSteamTarget();
  });

  function nearSale() {
    const entrance=window.LPRSale?.entrance;
    return !!entrance && Math.hypot(car.x-entrance.x,car.y-entrance.y)<40;
  }

  function toggleSale(force = false) {
    if(car.crashed) return;
    const canEnterDirectly = !car.sauna && !car.pool && !ui.dialog.open && (force || (!car.sale && nearSale() && Math.abs(car.speed) <= .5));
    if(!canEnterDirectly && !(car.sale && !car.sauna && !car.pool && !ui.dialog.open)) return;
    clearInput();
    stopLooking();
    car.pool = false;
    car.sale=!car.sale;
    if(car.sale) {
      dynamics.reset(car);
      car.saleX=35; car.saleZ=130;
      car.saunaYaw=-Math.PI/2; car.saunaPitch=0;
      ui.speed.textContent='0';
      updateDriveHud(0);
      ui.lateralG.textContent='0.0 G';
      ui.grip.textContent=t('KAUPPATAUKO');
      ui.tc.textContent=t('AUTO PARKISSA');
    }
    ui.notice.classList.add('hidden');
    updateSaunaUI();
  }

  function nearSauna() {
    return Math.hypot(car.x-renderer.saunaStop.x,car.y-renderer.saunaStop.y) < 40;
  }

  function nearPool() {
    const pool = renderer.poolStop || { x: renderer.saunaStop.x - 36, y: renderer.saunaStop.y + 18 };
    return Math.hypot(car.x-pool.x,car.y-pool.y) < 42;
  }

  function updateSaunaUI() {
    saleEnter.disabled = car.crashed || ui.dialog.open || car.sauna || car.pool;
    saleEnter.hidden = !car.sale && !nearSale() || saleEnter.disabled;
    saleEnter.textContent = car.sale ? t('Palaa autoon (E)') : t('Mene Saleen (E)');
    saunaEnter.disabled = car.crashed || ui.dialog.open || car.sale || car.pool || !car.sauna && (!nearSauna() || Math.abs(car.speed) > .5);
    saunaEnter.hidden = saunaEnter.disabled;
    saunaEnter.textContent = car.sauna ? t("Palaa autoon (E)") : t("Mene saunaan (E)");
    poolEnter.disabled = car.crashed || ui.dialog.open || car.sale || car.sauna || !car.pool && (!nearPool() || Math.abs(car.speed) > .5);
    poolEnter.hidden = poolEnter.disabled;
    poolEnter.textContent = car.pool ? t("Palaa autoon (E)") : t("Mene paljuun (E)");
    updateSteamTarget();
    saunaSeat.hidden = !car.sauna;
    saunaSound.hidden = !car.sauna;
    saunaHint.textContent = car.sauna ? t("W/S: eteen/taakse, A/D: sivuille. Klikkaa n\u00e4kym\u00e4\u00e4 ja katsele hiirell\u00e4 (Esc vapauttaa). Kosketuksella katsele vet\u00e4m\u00e4ll\u00e4. Valitse \u00e4mp\u00e4ri tai kauha heitt\u00e4\u00e4ksesi l\u00f6yly\u00e4.") : car.pool ? t("Paljussa: katsele ympärilläsi ja rauhoitu. Palaa autoon painikkeella tai E:llä.") : nearPool() ? t("Pys\u00e4hdy paljun vieress\u00e4 ja mene paljuun.") : nearSauna() ? t("Pys\u00e4hdy saunapakun viereen ja tule l\u00f6ylyihin.") : '';
    if(car.sale) saunaHint.textContent=t('Salessa: klikkaa n\u00e4kym\u00e4\u00e4 ja katsele hiirell\u00e4 (Esc vapauttaa). Kosketuksella katsele vet\u00e4m\u00e4ll\u00e4. W/S: eteen/taakse, A/D: sivuille. Palaa autoon: E.');
    else if(nearSale()) saunaHint.textContent=t('Pysähdy Salen ovelle ja mene sisään painikkeella tai E-näppäimellä.');
    canvas.classList.toggle('sauna-view', !!(car.sauna || car.sale || car.pool));
    document.querySelector('#track').setAttribute('aria-label', car.sale ? t("Sale Skinnarilan sisätila") : car.pool ? t("Paljun lähellä oleva vedenpinta") : car.sauna ? t("Saunapakun lauteet ja kiuas") : t("3D-n\u00e4kym\u00e4 kuljettajan paikalta"));
  }

  function togglePool() {
    if(car.crashed) return;
    if (car.sale || car.sauna || ui.dialog.open || (!car.pool && (!nearPool() || Math.abs(car.speed) > .5))) return;
    clearInput();
    car.sauna = false;
    car.pool = !car.pool;
    if (car.pool) {
      dynamics.reset(car);
      car.saunaYaw = 0;
      car.saunaPitch = -.12;
      car.saunaSide = -1;
      car.poolX = renderer.poolStop?.x ?? renderer.saunaStop.x;
      car.poolZ = renderer.poolStop?.y ?? renderer.saunaStop.y;
      ui.speed.textContent = '0';
      updateDriveHud(0);
      ui.lateralG.textContent = '0.0 G';
      ui.grip.textContent = t('PALJUTAUKO');
      ui.tc.textContent = t('AUTO PARKISSA');
    }
    ui.notice.classList.add('hidden');
    updateSaunaUI();
  }

  function toggleSauna() {
    if(car.crashed) return;
    if (car.sale || car.pool || ui.dialog.open || (!car.sauna && (!nearSauna() || Math.abs(car.speed) > .5))) return;
    clearInput();
    car.pool = false;
    car.sauna = !car.sauna;
    if (car.sauna) {
      dynamics.reset(car);
      car.steamAt = -10000;
      car.saunaYaw = 0;
      car.saunaPitch = -.12;
      car.saunaSide = -1;
      car.saunaX = 1986; car.saunaZ = -6;
      car.steamActor = 'player';
      car.saunaLife = saunaLife;
      saunaLife.enter();
      ui.speed.textContent = '0';
      updateDriveHud(0);
      ui.lateralG.textContent = '0.0 G';
      ui.grip.textContent = t("SAUNATAUKO");
      ui.tc.textContent = t("AUTO PARKISSA");
    } else saunaLife.leave();
    ui.notice.classList.add('hidden');
    updateSaunaUI();
  }

  function switchSaunaSeat() {
    if (!car.sauna || ui.dialog.open) return;
    clearInput();
    car.saunaSide = -(car.saunaSide || -1);
    car.saunaX = 1986; car.saunaZ = car.saunaSide * 6;
    // Finish any ladle movement before moving its bucket to the opposite seat.
    car.steamAt = -10000;
    car.steamActor = 'player';
    // Turn towards the stove from the new seat, then allow free looking again.
    const stoveDistanceZ = -8 - car.saunaSide*6;
    car.saunaYaw = Math.atan2(stoveDistanceZ,30);
    car.saunaPitch = Math.atan2(-8,Math.hypot(30,stoveDistanceZ));
    showNotice(t("Siirryit vastakkaiselle lauteelle."), 1800);
  }

  function throwSteam() {
    if (!car.sauna || ui.dialog.open) return;
    const now = performance.now();
    if (now - car.steamAt < 900) return;
    car.steamAt = now;
    car.steamActor = 'player';
    saunaLife.registerSteam();
    showNotice(t("Tsssss\u2026 Hyv\u00e4t l\u00f6ylyt!"), 2000);
  }

  function reset({verified=false}={}) {
    if(!verified && window.LPRVerifiedDriving && window.LPRLeaderboard?.identity){
      void window.LPRVerifiedDriving.start({replace:true});return;
    }
    if(!verified) window.LPRVerifiedDriving?.cancel();
    const lapNumber = car?.lap || 1;
    drivingWorld=null;
    window.LPRLeaderboard?.cancelLap?.();
    if (car) window.LPRAnalytics?.event('restart');
    window.LPRCampus.resetObstacles();
    audio.stopEffects();
    timing.reset();
    clearTimeout(sectorTimeout);
    sectorUI.hidden = true;
    resetSectorPanel();
    window.LPRRaceEffects?.clear();
    clearInput();
    saunaLife.leave();
    car = { x: LPRCampus.launchPosition.x, y: LPRCampus.launchPosition.y, angle: startAngle, speed: 0, lap: lapNumber, lapStart: 0, lapTimingArmed:false, stage: 0, started: false, offroad: false, damage:0, crashed:false, pool:false, poolX:0, poolZ:0 };
    dynamics.reset(car);
    dynamics.parameters.tractionControlEnabled=tractionControlEnabled;
    car.tcEnabled=tractionControlEnabled;
    car.wheelPage=0;
    car.wheelDim=false;
    car.lapElapsedMs=0;
    car.throttleInput=0;
    car.brakeInput=0;
    updateWheelControls();
    updateSaunaUI();
    ui.lap.textContent = String(lapNumber);
    ui.time.textContent = '00:00.000';
    ui.speed.textContent = '0';
    updateDriveHud(0);
    ui.lateralG.textContent = '0.0 G';
    ui.grip.textContent = t("PITO OK");
    ui.tc.textContent = t("TC P\u00c4\u00c4LL\u00c4");
    clearNotice();
  }

  function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor(ms / 1000) % 60;
    const thousandths = Math.floor(ms % 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(thousandths).padStart(3, '0')}`;
  }

  function showNotice(message, duration) {
    if (!acceptNoticePriority(0)) return;
    ui.notice.classList.remove('notice-crashed');
    ui.notice.classList.remove('notice-event');
    document.querySelector('.game-shell').classList.remove('notice-priority');
    ui.crashNotice.hidden = true;
    ui.noticeMessage.hidden = false;
    ui.noticeMessage.textContent = message;
    ui.notice.classList.remove('hidden');
    clearTimeout(noticeTimeout);
    positionNotice();
    if (duration) noticeTimeout = setTimeout(hideNotice, duration);
  }

  function acceptNoticePriority(priority) {
    if (!ui.notice.classList.contains('hidden') && priority < noticePriority) return false;
    noticePriority = priority;
    return true;
  }

  function clearNotice() {
    clearTimeout(noticeTimeout);
    noticePriority = 0;
    document.querySelector('.game-shell').classList.remove('notice-priority');
    document.querySelector('.game-shell').classList.remove('notice-priority-sector');
    ui.notice.classList.remove('notice-crashed');
    ui.notice.classList.remove('notice-event');
    ui.noticeMessage.hidden = false;
    ui.noticeMessage.textContent = '';
    ui.crashNotice.hidden = true;
    ui.notice.classList.add('hidden');
  }

  function hideNotice() {
    noticePriority = 0;
    ui.notice.classList.add('hidden');
    document.querySelector('.game-shell').classList.remove('notice-priority');
    document.querySelector('.game-shell').classList.remove('notice-priority-sector');
  }

  function showCrashNotice() {
    if (ui.notice.classList.contains('notice-crashed') && !ui.notice.classList.contains('hidden')) return;
    window.LPRVerifiedDriving?.cancel();
    const instruction = t('Paina R käynnistääksesi uudelleen');
    const keyIndex = instruction.indexOf('R');
    ui.crashInstructionBefore.textContent = instruction.slice(0, keyIndex).trim();
    ui.crashInstructionAfter.textContent = instruction.slice(keyIndex + 1).trim();
    ui.crashRestart.textContent = t('Aloita uudelleen');
    showEventNotice('crash');
  }

  function showEventNotice(kind, lapMs = null) {
    const noticeKinds = {
      crash: { priority: 3, title: 'Auto hajosi', icon: 'warning' },
      'track-record': { priority: 2, title: 'Uusi rataennätys!', icon: 'trophy' },
      'personal-best': { priority: 1, title: 'Uusi oma ennätys', icon: 'medal' },
      damage: { priority: 0, title: 'Auto vaurioitui.', icon: 'warning' },
      lap: { priority: 0, title: 'Uusi kierros', icon: 'arrow-counter-clockwise' }
    };
    const variant = noticeKinds[kind];
    if (!variant || !acceptNoticePriority(variant.priority)) return false;
    clearTimeout(noticeTimeout);
    const isCrash = kind === 'crash';
    ui.noticeMessage.hidden = true;
    ui.crashNotice.hidden = false;
    ui.crashNotice.dataset.kind = kind;
    ui.crashTitle.textContent = t(variant.title);
    ui.crashIconUse.setAttribute('href', `assets/phosphor-icons.svg?v=phosphor-regular-2.1.1#${variant.icon}`);
    ui.crashDetail.hidden = isCrash || !Number.isFinite(lapMs);
    ui.crashDetail.textContent = Number.isFinite(lapMs) ? formatTime(lapMs) : '';
    ui.crashKeyboard.hidden = !isCrash;
    ui.crashRestart.hidden = !isCrash;
    document.querySelector('.game-shell').classList.remove('notice-priority');
    ui.notice.classList.remove('notice-event', 'notice-crashed');
    ui.notice.classList.add(isCrash ? 'notice-crashed' : 'notice-event');
    ui.notice.classList.remove('hidden');
    positionNotice();
    if (!isCrash) noticeTimeout = setTimeout(hideNotice, 3500);
    return true;
  }

  document.addEventListener('lpr-track-record', event => {
    const lapMs = event.detail?.lapMs;
    if (Number.isSafeInteger(lapMs) && lapMs > 5000) showEventNotice('track-record', lapMs);
  });

  const noticeShell = document.querySelector('.game-shell');
  const noticeBlockerSelectors = [
    '.lap-panel', '.sector-panel', '.daily-race-hud', '.verification-state', '.hud',
    '.drive-telemetry', '.telemetry', '.game-footer', '.controls', '.sidebar-settings', '#drive-settings-panel',
    '.sauna-actions', '.sauna-dialogue', '.start-lights', '.sector-time'
  ];
  function positionNotice() {
    if (!noticeShell || typeof noticeShell.getBoundingClientRect !== 'function' || typeof ui.notice.getBoundingClientRect !== 'function' || ui.notice.classList.contains('hidden')) return;
    if (ui.notice.classList.contains('notice-crashed')) {
      ui.notice.style.cssText = '';
      return;
    }
    noticeShell.classList.remove('notice-priority-sector');
    noticeShell.classList.remove('notice-priority');
    const shell = noticeShell.getBoundingClientRect();
    const card = ui.notice.getBoundingClientRect();
    if (!shell.width || !shell.height || !card.width || !card.height) return;
    const margin = 8, gap = 10;
    const width = Math.min(card.width, shell.width - margin * 2);
    const height = Math.min(card.height, shell.height - margin * 2);
    const x = Math.max(margin, (shell.width - width) / 2);
    const blockers = (ignoreDrive, ignoreSector) => noticeBlockerSelectors.flatMap(selector => {
      if (ignoreDrive && selector === '.drive-telemetry') return [];
      if (ignoreSector && selector === '.sector-panel') return [];
      const element = document.querySelector(selector);
      if (!element || element === ui.notice || element.hidden) return [];
      const style = window.getComputedStyle?.(element);
      if (style?.display === 'none' || style?.visibility === 'hidden') return [];
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || rect.right <= shell.left || rect.left >= shell.right || rect.bottom <= shell.top || rect.top >= shell.bottom) return [];
      return [{left:rect.left-shell.left,right:rect.right-shell.left,top:rect.top-shell.top,bottom:rect.bottom-shell.top}];
    });
    function choose(blockingRects) {
      const upperBottom = blockingRects.reduce((bottom, rect) => (rect.top + rect.bottom) / 2 < shell.height * .5 ? Math.max(bottom, rect.bottom) : bottom, margin);
      const ideal = Math.min(shell.height-height-margin, upperBottom+gap);
      for (let distance = 0; distance <= shell.height; distance += 4) {
        for (const top of distance === 0 ? [ideal] : [ideal+distance, ideal-distance]) {
          if (top < margin || top+height > shell.height-margin) continue;
          const overlaps = blockingRects.some(rect => x < rect.right+gap && x+width > rect.left-gap && top < rect.bottom+gap && top+height > rect.top-gap);
          if (!overlaps) return Math.round(top);
        }
      }
      return null;
    }
    let top = choose(blockers(false, false));
    if (top === null) {
      noticeShell.classList.add('notice-priority');
      top = choose(blockers(true, false));
    }
    if (top === null) {
      noticeShell.classList.add('notice-priority-sector');
      top = choose(blockers(true, true));
    }
    if (top === null) top = Math.max(margin, Math.min(shell.height-height-margin, (shell.height-height)/2));
    ui.notice.style.left = `${Math.round(x)}px`;
    ui.notice.style.right = 'auto';
    ui.notice.style.top = `${top}px`;
    ui.notice.style.bottom = 'auto';
    ui.notice.style.transform = 'none';
  }
  if (typeof ResizeObserver === 'function') {
    const noticeLayoutObserver = new ResizeObserver(positionNotice);
    for (const element of [noticeShell, ...noticeBlockerSelectors.map(selector => document.querySelector(selector)).filter(Boolean)]) noticeLayoutObserver.observe(element);
  }

  function resize() {
    renderer.resize();
    positionNotice();
  }

  function currentPad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    return Array.from(pads).find(Boolean) || null;
  }

  function padInput(pad) {
    if (!pad) return { steer: 0, gas: 0, brake: 0 };
    if (pad.mapping === 'standard') return { steer: pad.axes[0] || 0, gas: pad.buttons[7]?.value || 0, brake: pad.buttons[6]?.value || 0 };
    return { steer: 0, gas: 0, brake: 0 };
  }

  function readInput() {
    if(window.LPRChat?.typing||document.activeElement?.closest?.('#guest-register-form'))return {steer:0,gas:0,brake:0,analog:false,wheel:false};
    const pad = currentPad();
    if (pad && (!activePad || activePad.id !== pad.id)) {
      activePad = pad;
    } else if (!pad) {
      activePad = null;
    }
    const device = padInput(pad);
    const local = held.left || held.right || held.gas || held.brake;
    const steer = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    return local ? { steer, gas: held.gas ? 1 : 0, brake: held.brake ? 1 : 0, analog: false, wheel: false } : { ...device, analog: !!pad, wheel: false };
  }

  function nearestTrack(x, y) {
    let bestDist = Infinity;
    let index = 0;
    let along = 0;
    for (let i = 0; i < POINTS; i++) {
      const a = track[i];
      const b = track[(i + 1) % POINTS];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
      const distance = (x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2;
      if (distance < bestDist) {
        bestDist = distance; index = i;
        along=trackDistances[i]+t*(trackDistances[i+1]-trackDistances[i]);
      }
    }
    return { index, distance: Math.sqrt(bestDist), along };
  }

  function grassContact(state) {
    const p = dynamics.parameters;
    const scale = 1 / p.metresPerWorldUnit;
    const forwardX = Math.cos(state.angle), forwardY = Math.sin(state.angle);
    let total = 0;
    let kerbTires = 0;
    const heights=[];
    // Sample each tire rather than switching the whole car to grass at its centre.
    for (const axle of [p.frontAxle, -p.rearAxle]) {
      for (const side of [-p.trackWidth / 2, p.trackWidth / 2]) {
        const x = state.x + (axle * forwardX - side * forwardY) * scale;
        const y = state.y + (axle * forwardY + side * forwardX) * scale;
        const contact = nearestTrack(x, y);
        const distance = contact.distance;
        const loop=trackDistances[POINTS];
        const ribAlong=contact.along*(Math.round(loop*p.metresPerWorldUnit/.45)*.45)/(loop*p.metresPerWorldUnit);
        heights.push((window.LPRTrackObjects?.terrain?.heightAt(x,y)||0)*p.metresPerWorldUnit+
          dynamics.kerbHeight(distance,ribAlong,LPRCampus.road));
        if (distance >= ROAD_HALF && distance <= KERB_OUTER) kerbTires++;
        const blend = window.LPRTrackObjects?.onAsphalt(x,y) ? 0 :
          Math.max(0, Math.min(1, (distance - KERB_OUTER) / (SHOULDER_OUTER - KERB_OUTER)));
        total += blend * blend * (3 - 2 * blend);
      }
    }
    state.kerbFraction = kerbTires / 4;
    state.roadHeights = heights;
    const slope=window.LPRTrackObjects?.terrain?.sample(state.x,state.y);
    state.terrainSlope={forward:slope?slope.dx*forwardX+slope.dy*forwardY:0,
      right:slope?-slope.dx*forwardY+slope.dy*forwardX:0};
    return total / 4;
  }

  function update(dt, now, wallNow = now) {
    if (car.crashed) { showCrashNotice(); return; }
    if(window.LPRVerifiedDriving?.waitingForStart)return;
    if(window.LPRVerifiedDriving?.active && (ui.dialog.open || car.sauna || car.sale || car.pool || car.crashed))window.LPRVerifiedDriving.cancel();
    if(drivingWorld && !ui.dialog.open && !car.sauna && !car.sale && !car.pool){
      updateDriving(now);return;
    }
    const physicsNow = now;
    // Keep timed-v1 wall-clock scoring until the server replay protocol replaces it.
    now = wallNow;
    if(!ui.dialog.open) {
      renderer.updatePeople(physicsNow);
      window.LPRCampus.stepObstacles(dt,car,contact=>{
        dynamics.applyImpact(car,contact.normal,contact.impactMaterial,contact);
        audio.impact(car.impactSpeed);
      });
    }
    const input = readInput();
    if(car.crashed) {
      car.throttleInput=0;
      car.brakeInput=0;
      showCrashNotice();
      return;
    }
    if (now - lastDeviceUpdate > 1000) {
      ui.input.textContent = activePad ? activePad.mapping === 'standard' ? t("PELIOHJAIN") : t("KOSKETUS / N\u00c4PP\u00c4IMIST\u00d6") : t("KOSKETUS / N\u00c4PP\u00c4IMIST\u00d6");
      lastDeviceUpdate = now;
    }
    if (ui.dialog.open || car.sauna || car.sale || car.pool) {
      if (car.lapTimingArmed) {
        car.lapElapsedMs = Math.max(0, now - car.lapStart);
        ui.time.textContent = formatTime(car.lapElapsedMs);
        syncLiveDelta(car.lapElapsedMs, null, now);
      }
      if (car.sauna && !ui.dialog.open) {
        saunaLife.update(dt,car,wallNow);
      }
      if ((car.sauna || car.sale) && !ui.dialog.open) {
        const forward = input.gas - input.brake;
        const sideways = input.steer;
        const scale = dt * (car.sale ? 22 : 10) / Math.max(1, Math.hypot(forward, sideways));
        const yaw = car.saunaYaw || 0;
        const dx = (Math.cos(yaw) * forward - Math.sin(yaw) * sideways) * scale;
        const dz = (Math.sin(yaw) * forward + Math.cos(yaw) * sideways) * scale;
        if (car.sale) {
          if (window.LPRSale.canWalk(car.saleX + dx, car.saleZ)) car.saleX += dx;
          if (window.LPRSale.canWalk(car.saleX, car.saleZ + dz)) car.saleZ += dz;
        } else {
          if (saunaLife.canWalk(car.saunaX + dx, car.saunaZ)) car.saunaX += dx;
          if (saunaLife.canWalk(car.saunaX, car.saunaZ + dz)) car.saunaZ += dz;
        }
      }
      return;
    }
    input.steer = Math.abs(input.steer) < .04 ? 0 : input.steer;
    if (!car.started && input.gas > .08) {
      car.started = true;
      car.lapStart = now;
      ui.notice.classList.add('hidden');
    }
    const steps = Math.max(1, Math.ceil(dt * 90));
    let crossedFinishLine = false;
    for (let i = 0; i < steps; i++) {
      car.grassFraction = grassContact(car);
      const previous = { x:car.x, y:car.y, angle:car.angle };
      dynamics.step(car, input, dt / steps, car.grassFraction);
      const collision=window.LPRCampus.resolveObstacleCollision(car, previous, contact=>{
        const damage=dynamics.applyImpact(car,contact.normal,contact.impactMaterial,contact);
        audio.impact(car.impactSpeed);
        if(damage>0) showEventNotice('damage');
      });
      crossedFinishLine ||= window.LPRCampus.crossesFinishLine(previous,car);
      if(collision && car.crashed) {
        car.crashedAt=now;
        showCrashNotice();
        break;
      }
    }
    const boundedX = Math.max(12, Math.min(WORLD.width - 12, car.x));
    const boundedY = Math.max(12, Math.min(WORLD.height - 12, car.y));
    if (boundedX !== car.x || boundedY !== car.y) { car.vx = 0; car.vy = 0; }
    car.x = boundedX;
    car.y = boundedY;

    const nearest = nearestTrack(car.x, car.y);
    const lapProgress = trackLength > 0 ? Math.max(0, Math.min(1, nearest.along / trackLength)) : null;
    car.grassFraction = grassContact(car);
    car.offroad = car.grassFraction > .5;
    let completedLap = false;
    if (car.crashed) return;
    if (!car.crashed && nearest.distance < ROAD_HALF && car.speed > 2.2) {
      if (!car.lapTimingArmed && crossedFinishLine) {
        car.lapTimingArmed=true;
        car.lapStart=now;
        car.stage=0;
        timing.reset();
        startSectorPanel();
        window.LPRAnalytics?.event('lap_start');
        if(!window.LPRVerifiedDriving) window.LPRLeaderboard?.startLap?.();
      }
      else if (car.lapTimingArmed && car.stage === 0 && nearest.index > 55 && nearest.index < 85) {
        car.stage = 1;
        showSector(now - car.lapStart, lapProgress, now);
      }
      else if (car.lapTimingArmed && car.stage === 1 && nearest.index > 115 && nearest.index < 145) {
        car.stage = 2;
        showSector(now - car.lapStart, lapProgress, now);
      }
      else if (car.lapTimingArmed && car.stage === 2 && nearest.index > 175 && nearest.index < 205) car.stage = 3;
      else if (car.lapTimingArmed && car.stage === 3 && crossedFinishLine) {
        const lapTime = now - car.lapStart;
        if (lapTime > 5000) {
          window.LPRAnalytics?.event('lap_complete', { lapMs: Math.round(lapTime) });
          audio.lap(!referenceLapTime() || lapTime < referenceLapTime());
          showSector(lapTime, 1, now);
          if (!window.LPRVerifiedDriving && timing.sectors.length === 3) window.LPRLeaderboard?.submit(lapTime, timing.sectors.slice());
          const trace = timing.completeTrace();
          const promoted = (!referenceLapTime() || lapTime < referenceLapTime()) &&
            promotePersonalBest(lapTime, timing.sectors.slice(), timing.checkpoints.slice(), trace);
          if (!promoted) persistReferenceLap(lapTime, timing.sectors.slice(), trace);
          emitLapCompleted(lapTime,promoted,false);
          if (promoted) {
            showEventNotice('personal-best', lapTime);
          } else showEventNotice('lap', lapTime);
          car.lap++;
          window.LPRAnalytics?.event('lap_start');
          if(!window.LPRVerifiedDriving) window.LPRLeaderboard?.startLap?.();
          car.lapStart = now;
          car.stage = 0;
          timing.reset();
          startSectorPanel();
          completedLap = true;
          ui.lap.textContent = String(car.lap);
        }
      }
    }
    if (car.lapTimingArmed) ui.time.textContent = formatTime(now - car.lapStart);
    car.lapElapsedMs=car.lapTimingArmed ? Math.max(0,now-car.lapStart) : 0;
    if (car.lapTimingArmed && !completedLap) {
      const onTrack = nearest.distance < ROAD_HALF && !car.crashed && !sectorPanelInvalid;
      syncLiveDelta(car.lapElapsedMs, onTrack ? lapProgress : null, now);
    }
    car.throttleInput=input.gas;
    car.brakeInput=input.brake;
    ui.speed.textContent = String(Math.round(car.speed * 3.6));
    updateDriveHud(car.speed, car.brakeInput, car.throttleInput);
    ui.lateralG.textContent = `${Math.abs(car.lateralG).toFixed(1)} G`;
    ui.grip.textContent = car.damage>0 ? `${t("VAURIO")} ${Math.round(car.damage*100)} %` : car.offroad ? t("RADAN ULKOPUOLELLA") : (car.tireUse > .97 || Math.abs(car.bodySlip) > .12) ? t("PITO RAJALLA") : t("PITO OK");
    ui.tc.textContent = car.tcActive ? t("TC RAJOITTAA TEHOA") : t(car.tcEnabled ? "TC P\u00c4\u00c4LL\u00c4" : "TC POIS");
    updateSaunaUI();
  }

  function updateDriving(now) {
    if(car.crashed){window.LPRVerifiedDriving.cancel();showCrashNotice();return;}
    const input=readInput();input.steer=Math.abs(input.steer)<.04?0:input.steer;input.tc=car.tcEnabled;
    const event=drivingWorld.step(input),result=drivingWorld.result();
    if(car.crashed){window.LPRVerifiedDriving.cancel();showCrashNotice();return;}
    const nearest=nearestTrack(car.x,car.y);
    const lapProgress=trackLength>0?Math.max(0,Math.min(1,nearest.along/trackLength)):null;
    renderer.peopleTime=result.ticks*1000/120;
    window.LPRVerifiedDriving.step(input,result,event);
    car.stage=result.stage;car.lap=result.lap;
    car.started=result.started;
    car.lapElapsedMs=result.started?(result.ticks-result.lapStartTick)*1000/120:0;
    if(event.started)startSectorPanel();
    if(event.split!==null)showSector(event.split*1000/120,event.completed?1:lapProgress,now);
    if(event.completed){
      const lapMs=event.completed.lapTicks*1000/120;
      let verifiedPending=false;
      const trace=timing.completeTrace();
      if(timing.sectors.length===3&&(!referenceLapTime()||lapMs<referenceLapTime())){
        const key=Math.round(lapMs),queue=pendingVerifiedPB.get(key)||[];
        queue.push({lapMs,sectors:timing.sectors.slice(),checkpoints:timing.checkpoints.slice(),trace});
        pendingVerifiedPB.set(key,queue);
        while(pendingVerifiedPB.size>5)pendingVerifiedPB.delete(pendingVerifiedPB.keys().next().value);
        verifiedPending=true;
      }
      persistReferenceLap(lapMs, timing.sectors.slice(), timing.completeTrace());
      emitLapCompleted(lapMs,false,verifiedPending);
      window.LPRAnalytics?.event('lap_complete',{lapMs:Math.round(lapMs)});
      audio.lap(false);timing.reset();startSectorPanel();ui.lap.textContent=String(car.lap);
      showEventNotice('lap', lapMs);
      // Do not reset a flying lap after verification was lost: stay in practice until the player explicitly restarts.
    } else if(result.started) syncLiveDelta(car.lapElapsedMs,nearest.distance<ROAD_HALF&&!car.crashed?lapProgress:null,now);
    car.throttleInput=input.gas;car.brakeInput=input.brake;
    ui.time.textContent=formatTime(car.lapElapsedMs);
    ui.speed.textContent=String(Math.round(car.speed*3.6));
    updateDriveHud(car.speed, car.brakeInput, car.throttleInput);
    ui.lateralG.textContent=`${Math.abs(car.lateralG).toFixed(1)} G`;
    ui.grip.textContent=car.damage>0?`${t("VAURIO")} ${Math.round(car.damage*100)} %`:car.offroad?t("RADAN ULKOPUOLELLA"):t("PITO OK");
    ui.tc.textContent=car.tcActive?t("TC RAJOITTAA TEHOA"):t(car.tcEnabled?"TC PÄÄLLÄ":"TC POIS");
    updateSaunaUI();
  }
  window.LPRVerifiedDriving?.attach({prepare(){reset({verified:true});ui.notice.classList.add('hidden');},start(){
    reset({verified:true});
    drivingWorld=window.LPRDriving.create({car,dynamics,onImpact:(contact,damage)=>{audio.impact(car.impactSpeed);if(damage>0)showEventNotice('damage');}});
    dynamics.parameters.tractionControlEnabled=tractionControlEnabled;
    car.tcEnabled=tractionControlEnabled;
    updateWheelControls();
    car.started=false;car.lapTimingArmed=false;car.lapStart=0;
    accumulator=0;lastFrame=performance.now();
    ui.dialog.close();ui.notice.classList.add('hidden');
  },saved(lapMs){
    const key=Math.round(lapMs),queue=pendingVerifiedPB.get(key),candidate=queue?.shift();
    if(queue&&!queue.length)pendingVerifiedPB.delete(key);
    const promoted=candidate?promotePersonalBest(candidate.lapMs,candidate.sectors,candidate.checkpoints,candidate.trace,true):false;
    if(promoted)showEventNotice('personal-best',lapMs);
    else showEventNotice('lap', lapMs);
  }});

  let lastPresentation = null;
  // Fixed physics step; existing timed-v1 scoring remains on the wall clock.
  const STEP = 1 / 120, STEP_MS = 1000 / 120;
  let simTick = 0, accumulator = 0;
  function resetSpectatorPresentation(){
    clearInput();accumulator=0;lastFrame=performance.now();lastPresentation=null;
    renderer.visualSteering=null;renderer.lastWheelFrame=0;
    audio.stopEffects();
  }
  window.LPRSpectator?.attach({
    begin(){
      window.LPRVerifiedDriving?.cancel(null);resetSpectatorPresentation();
      ui.notice.classList.add('hidden');sectorUI.hidden=true;
      window.LPRRaceEffects?.clear();
      document.querySelector('#verification-state').textContent='';
      saunaLife.stopSound();syncAudio();audio.unlock();resize();
    },
    switchDriver:resetSpectatorPresentation,
    end(){
      resetSpectatorPresentation();syncAudio();resize();
      ui.lap.textContent=String(car.lap);ui.time.textContent=formatTime(car.lapElapsedMs||0);
      ui.speed.textContent=String(Math.round(car.speed*3.6));
      updateDriveHud(car.speed, car.brakeInput, car.throttleInput);
    }
  });
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { lastPresentation = null; return; }
    // High-refresh desktop displays should not rebuild all geometry at 144–240 Hz.
    const interval = 1000 / 60;
    const elapsed = lastPresentation === null ? interval : now - lastPresentation;
    if (elapsed < interval - .01) return;
    lastPresentation = now - (elapsed >= interval ? elapsed % interval : 0);
    if (car.crashed && !window.LPRSpectator?.active) {
      lastFrame = now;
      accumulator = 0;
      showCrashNotice();
      audio.setPaused(true);
      return;
    }
    renderDriveHud(now);
    if(window.LPRSpectator?.active){
      // Spectating uses this exact renderer, camera, resolution and game HUD.
      // Never simulate local inputs or submit laps while watching another driver.
      lastFrame=now;accumulator=0;
      const remote=window.LPRSpectator.presentation(now);
      if(remote){
        const observed=remote.car;
        ui.lap.textContent=String(observed.lap);ui.time.textContent=formatTime(observed.lapElapsedMs);
        ui.speed.textContent=String(Math.round(observed.speed*3.6));
        updateDriveHud(observed.speed, observed.brakeInput, observed.throttleInput);
        ui.lateralG.textContent=`${Math.abs(observed.lateralG).toFixed(1)} G`;
        ui.grip.textContent=observed.damage>0?`${t('VAURIO')} ${Math.round(observed.damage*100)} %`:observed.offroad?t('RADAN ULKOPUOLELLA'):t('PITO OK');
        ui.tc.textContent=observed.tcActive?t('TC RAJOITTAA TEHOA'):t(observed.tcEnabled?'TC PÄÄLLÄ':'TC POIS');
        renderer.updatePeople(remote.time);renderer.render(observed,remote.time);
        syncAudio();audio.update(observed);
      }else audio.setPaused(true);
      window.LPRAnalytics?.sample('menu',false,false);
      return;
    }
    accumulator += Math.min((now - lastFrame) / 1000, .1);
    lastFrame = now;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      simTick++;
      update(STEP, simTick * STEP_MS, now);
    }
    window.LPRAnalytics?.sample(ui.dialog.open ? 'menu' : car.crashed ? 'crashed' : car.sale ? 'shop' : car.sauna ? 'sauna' : car.pool ? 'pool' : 'driving', !!activePad && (activePad.axes.some(v => Math.abs(v) > .1) || activePad.buttons.some(b => b.pressed)), held.left || held.right || held.gas || held.brake);
    syncAudio();
    audio.update(car);
    if (!document.hidden) updateSteamTarget();
    renderer.render(car, now);
  }

  const keyMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake' };
  function updateWheelControls() {
    const page = document.querySelector('#wheel-page');
    const dim = document.querySelector('#wheel-dim');
    const tc = document.querySelector('#wheel-tc');
    const english = window.LPRI18n?.language === 'en';
    const pageState = page?.querySelector('.sidebar-setting-value');
    const dimState = dim?.querySelector('.sidebar-setting-value');
    const tcState = tc?.querySelector('.sidebar-setting-value');
    if (pageState) pageState.textContent = english ? (car.wheelPage === 1 ? 'Grip' : 'Speed') : (car.wheelPage === 1 ? 'Pito' : 'Nopeus');
    if (dimState) dimState.textContent = english ? (car.wheelDim ? 'On' : 'Off') : (car.wheelDim ? 'Päällä' : 'Pois');
    if (tcState) tcState.textContent = english ? (car.tcEnabled ? 'On' : 'Off') : (car.tcEnabled ? 'Päällä' : 'Pois');
    page?.setAttribute('aria-label', english ? `Display: ${car.wheelPage === 1 ? 'grip' : 'speed'}` : `Näyttö: ${car.wheelPage === 1 ? 'pito' : 'nopeus'}`);
    dim?.setAttribute('aria-label', english ? `Display dimming: ${car.wheelDim ? 'on' : 'off'}` : `Näytön himmennys: ${car.wheelDim ? 'päällä' : 'pois'}`);
    tc?.setAttribute('aria-label', english ? `Traction control: ${car.tcEnabled ? 'on' : 'off'}` : `Luistonesto: ${car.tcEnabled ? 'päällä' : 'pois'}`);
    dim?.setAttribute('aria-pressed',String(car.wheelDim));
    tc?.setAttribute('aria-pressed',String(car.tcEnabled));
  }
  function operateWheel(action) {
    if(ui.dialog.open || car.sauna || car.sale || car.crashed) return;
    if(action==='page') car.wheelPage=car.wheelPage===1 ? 0 : 1;
    else if(action==='brightness') car.wheelDim=!car.wheelDim;
    else if(action==='tc') {
      tractionControlEnabled = !car.tcEnabled;
      car.tcEnabled = tractionControlEnabled;
      try { localStorage.setItem(tcPreferenceKey, String(tractionControlEnabled)); } catch {}
      dynamics.parameters.tractionControlEnabled=car.tcEnabled;
      if(!car.tcEnabled) { car.tcActive=false; car.torqueScale=1; }
      ui.tc.textContent=t(car.tcEnabled ? 'TC P\u00c4\u00c4LL\u00c4' : 'TC POIS');
    }
    updateWheelControls();
  }
  for(const [id,action] of [['#wheel-page','page'],['#wheel-dim','brightness'],['#wheel-tc','tc']]) {
    document.querySelector(id).addEventListener('click',()=>operateWheel(action));
  }
  window.addEventListener('lpr-language-changed', () => { updateWheelControls(); updateSoundButton(); });
  window.addEventListener('keydown',event=>{
    const action={KeyP:'page',KeyB:'brightness',KeyT:'tc'}[event.code];
    if(!action || event.repeat || event.ctrlKey || event.altKey || event.metaKey || ui.dialog.open || car.sauna || car.sale) return;
    if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(event.target?.tagName) || event.target?.isContentEditable) return;
    event.preventDefault();operateWheel(action);
  });
  function syncHeld() {
    for (const name of Object.keys(held)) {
      held[name] = [...keyboard].some(code => keyMap[code] === name) || [...touchPointers.values()].includes(name);
      document.querySelector(`[data-control="${name}"]`).classList.toggle('active', held[name]);
    }
  }
  function clearInput() {
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    stopLooking();
    saunaHoverPosition=null;
    saunaSteamSelected=false;
    keyboard.clear();
    touchPointers.clear();
    syncHeld();
  }
  window.addEventListener('keydown', event => {
    if(event.code==='KeyR'){
      const target=event.target;
      if(event.repeat||event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||ui.dialog.open||
         ['INPUT','SELECT','TEXTAREA'].includes(target?.tagName)||target?.isContentEditable)return;
      event.preventDefault();document.querySelector('#restart-button').click();return;
    }
    if (!['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) && !event.target.isContentEditable) {
      document.documentElement.classList.add('keyboard-active');
    }
    if (!ui.dialog.open && !event.repeat && !['BUTTON','INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) {
      if (event.code === 'KeyE') {
        event.preventDefault();
        if (car.sale) toggleSale(true);
        else if (car.pool) togglePool();
        else if (!car.sauna && nearSale()) toggleSale();
        else if (!car.sauna && nearPool()) togglePool();
        else toggleSauna();
        return;
      }
      if (event.code === 'KeyF' && car.sauna) { event.preventDefault(); switchSaunaSeat(); return; }
      if (event.code === 'Space' && car.sauna) { event.preventDefault(); throwSteam(); return; }
    }
    if (!keyMap[event.code] || ui.dialog.open) return;
    event.preventDefault(); keyboard.add(event.code); syncHeld();
  });
  window.addEventListener('keyup', event => {
    if (!keyMap[event.code]) return;
    event.preventDefault(); keyboard.delete(event.code); syncHeld();
  });
  window.addEventListener('blur', clearInput);
  window.addEventListener('lpr-chat-focus', clearInput);
  // Older iOS Safari versions also emit proprietary pinch gesture events.
  // Restrict the fallback to gameplay so settings retain normal touch behavior.
  const gameSurface = document.querySelector('.app');
  const preventGameZoom = event => {
    if (!ui.dialog.open && event.cancelable) event.preventDefault();
  };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    gameSurface.addEventListener(type, preventGameZoom, { passive: false });
  }
  for (const type of ['touchstart', 'touchmove']) {
    gameSurface.addEventListener(type, event => {
      if (event.touches.length > 1) preventGameZoom(event);
    }, { passive: false });
  }

  document.querySelectorAll('[data-control]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      if (ui.dialog.open) return;
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      touchPointers.set(event.pointerId, button.dataset.control); syncHeld();
    });
    const release = event => { touchPointers.delete(event.pointerId); syncHeld(); };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    button.addEventListener('contextmenu', event => event.preventDefault());
  });
  document.addEventListener('visibilitychange', () => {
    syncAudio();
    clearInput();
    if(document.hidden) saunaLife.stopSound();
    // Hidden time is not simulated; timed-v1 scoring still includes wall-clock time away.
    if (!document.hidden) { lastFrame = performance.now(); accumulator = 0; }
  });
  window.addEventListener('resize', clearInput);
  document.querySelector('#restart-button').addEventListener('click', reset);
  ui.crashRestart.addEventListener('click', () => document.querySelector('#restart-button').click());
  saleEnter.addEventListener('click', () => toggleSale(true));
  saunaEnter.addEventListener('click', toggleSauna);
  poolEnter.addEventListener('click', togglePool);
  saunaSteam.addEventListener('click', throwSteam);
  saunaSeat.addEventListener('click', switchSaunaSeat);
  saunaSound.addEventListener('click', () => {
    saunaLife.setSound(!saunaLife.sound);
    saunaSound.setAttribute('aria-pressed', String(saunaLife.sound));
    saunaSound.textContent = saunaLife.sound ? t("Saunan \u00e4\u00e4net: p\u00e4\u00e4ll\u00e4") : t("Saunan \u00e4\u00e4net: pois");
  });
  function openLeaderboard() {
    if (car) window.LPRAnalytics?.event('leaderboard_open');
    window.LPRVerifiedDriving?.cancel();
    clearInput(); saunaLife.stopSound(); ui.dialog.showModal(); syncAudio();
  }
  ui.dialog.addEventListener('close', () => { syncAudio(); audio.unlock(); });
  document.querySelector('#leaderboard-button').addEventListener('click', () => {
    openLeaderboard();
    ui.dialog.scrollTop = 0;
    window.LPRLeaderboard?.refresh();
    void window.LPRVerifiedDriving?.refresh();
  });
  document.querySelector('#leaderboard-drive')?.addEventListener('click', () => {
    if(window.LPRLeaderboard?.requiresName || window.LPRSpectator?.active)return;
    ui.dialog.classList.remove('lobby-ready');
    document.querySelector('#close-settings').hidden=false;
    ui.dialog.close();
    reset();
  });
  document.querySelector('#close-settings').addEventListener('click', () => {
    if (!window.LPRLeaderboard?.requiresName && !ui.dialog.classList.contains('lobby-ready')) ui.dialog.close();
  });
  window.addEventListener('resize', resize);
  const landscapeDriving = window.matchMedia('(pointer:coarse) and (orientation:landscape), (max-width:900px) and (max-height:500px) and (orientation:landscape)');
  landscapeDriving.addEventListener('change', event => {
    if (event.matches && ui.dialog.open && !window.LPRLeaderboard?.requiresName && !ui.dialog.classList.contains('lobby-ready') && !window.LPRSpectator?.active) ui.dialog.close();
  });
  new ResizeObserver(resize).observe(document.querySelector('.game-shell'));
  window.addEventListener('gamepadconnected', event => {
    activePad = event.gamepad;
  });
  window.addEventListener('gamepaddisconnected', () => { activePad = null; });

  reset();
  openTestScene(window.location.search);
  resize();
  requestAnimationFrame(frame);

  function openTestScene(search) {
    const scene = new URLSearchParams(search).get('test-scene');
    const stop = scene === 'sale' ? window.LPRSale?.entrance
      : scene === 'sauna' ? renderer.saunaStop
      : scene === 'pool' ? renderer.poolStop : null;
    if (!stop) return;
    car.x = stop.x;
    car.y = stop.y;
    if (scene === 'sale') toggleSale(true);
    else if (scene === 'sauna') toggleSauna();
    else togglePool();
  }
})();
