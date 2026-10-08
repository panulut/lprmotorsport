(() => {
  'use strict';

  const canvas = document.querySelector('#track');
  const ui = {
    lap: document.querySelector('#lap-count'),
    time: document.querySelector('#lap-time'),
    best: document.querySelector('#best-time'),
    speed: document.querySelector('#speed'),
    lateralG: document.querySelector('#lateral-g'),
    grip: document.querySelector('#grip-state'),
    tc: document.querySelector('#tc-status'),
    notice: document.querySelector('#notice'),
    input: document.querySelector('#input-status'),
    device: document.querySelector('#device-status'),
    calibration: document.querySelector('#calibration-status'),
    dialog: document.querySelector('#settings-dialog')
  };
  const WORLD = { width: 1200, height: 800 };
  const ROAD_HALF = 27;
  const POINTS = 240;
  const track = Array.from({ length: POINTS }, (_, i) => {
    const t = i * Math.PI * 2 / POINTS;
    return { x: 600 + 355 * Math.cos(t) + Math.cos(3 * t + .4), y: 402 + 345 * Math.sin(t) };
  });
  const renderer = new LPRRenderer3D(canvas, document.querySelector('#cockpit'), track);
  const dynamics = new VehicleDynamics();
  const startAngle = Math.atan2(track[1].y - track[0].y, track[1].x - track[0].x);
  const held = { left: false, right: false, gas: false, brake: false };
  const captures = {};
  const keyboard = new Set();
  const touchPointers = new Map();
  const steeringPad = document.querySelector("#steering-pad");
  let steeringPointer = null;
  let touchSteer = 0;
  let suspendedAt = null;
  let activePad = null;
  let calibration = null;
  let best = Number(localStorage.getItem('lpr-best-time-v4')) || 0;
  let car;
  let lastFrame = performance.now();
  let lastDeviceUpdate = 0;
  let noticeTimeout = 0;

  function reset() {
    clearInput();
    car = { x: track[0].x, y: track[0].y, angle: startAngle, speed: 0, lap: 1, lapStart: 0, stage: 0, started: false, offroad: false };
    dynamics.reset(car);
    ui.lap.textContent = '1';
    ui.time.textContent = '00:00.000';
    ui.speed.textContent = '0';
    ui.lateralG.textContent = '0.0 G';
    ui.grip.textContent = 'PITO OK';
    ui.tc.textContent = 'TC PÄÄLLÄ';
    showNotice('Paina kaasua ja lähde ajamaan!', 0);
  }

  function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor(ms / 1000) % 60;
    const thousandths = Math.floor(ms % 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(thousandths).padStart(3, '0')}`;
  }

  function showNotice(message, duration) {
    ui.notice.textContent = message;
    ui.notice.classList.remove('hidden');
    clearTimeout(noticeTimeout);
    if (duration) noticeTimeout = setTimeout(() => ui.notice.classList.add('hidden'), duration);
  }

  function resize() {
    renderer.resize();
  }

  function currentPad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    return Array.from(pads).find(Boolean) || null;
  }

  function snapshot(pad) {
    return { axes: Array.from(pad.axes), buttons: Array.from(pad.buttons, b => b.value) };
  }

  function strongestChange(from, to) {
    let result = null;
    for (const type of ['axes', 'buttons']) {
      const length = Math.min(from[type].length, to[type].length);
      for (let index = 0; index < length; index++) {
        const change = Math.abs(to[type][index] - from[type][index]);
        if (!result || change > result.change) result = { type, index, change };
      }
    }
    return result && result.change > .12 ? result : null;
  }

  function valueOf(pad, mapping) {
    if (!mapping) return 0;
    if (mapping.type === 'axes') return pad.axes[mapping.index] ?? 0;
    return pad.buttons[mapping.index]?.value ?? 0;
  }

  function saveCalibration() {
    if (!['center', 'left', 'right', 'released', 'gas', 'brake'].every(name => captures[name])) return;
    const wheel = strongestChange(captures.left, captures.right);
    const gas = strongestChange(captures.released, captures.gas);
    const brake = strongestChange(captures.released, captures.brake);
    if (!wheel || !gas || !brake) {
      ui.calibration.textContent = 'Liike ei erottunut. Tarkista laite ja tallenna asennot uudelleen.';
      return;
    }
    const wheelKey = wheel.type;
    calibration = {
      id: activePad.id,
      wheel: { type: wheelKey, index: wheel.index, center: captures.center[wheelKey][wheel.index], left: captures.left[wheelKey][wheel.index], right: captures.right[wheelKey][wheel.index] },
      gas: { type: gas.type, index: gas.index, released: captures.released[gas.type][gas.index], pressed: captures.gas[gas.type][gas.index] },
      brake: { type: brake.type, index: brake.index, released: captures.released[brake.type][brake.index], pressed: captures.brake[brake.type][brake.index] }
    };
    localStorage.setItem(`lpr-controller-${activePad.id}`, JSON.stringify(calibration));
    ui.calibration.textContent = 'Kalibrointi valmis. Voit sulkea ikkunan ja ajaa.';
    ui.input.textContent = 'RATTI JA POLKIMET';
  }

  function readPedal(pad, mapping) {
    const range = mapping.pressed - mapping.released;
    if (Math.abs(range) < .1) return 0;
    return Math.max(0, Math.min(1, (valueOf(pad, mapping) - mapping.released) / range));
  }

  function padInput(pad) {
    if (!pad) return { steer: 0, gas: 0, brake: 0 };
    if (calibration && calibration.id === pad.id) {
      const w = calibration.wheel;
      const raw = valueOf(pad, w);
      const extent = raw < w.center ? w.left - w.center : w.right - w.center;
      // Either side may have the opposite numeric direction on a particular wheel.
      let steer;
      if ((w.left < w.center && raw < w.center) || (w.left > w.center && raw > w.center)) {
        steer = -(raw - w.center) / (w.left - w.center);
      } else {
        steer = (raw - w.center) / (w.right - w.center);
      }
      if (!Number.isFinite(steer) || !Number.isFinite(extent)) steer = 0;
      return { steer: Math.max(-1, Math.min(1, steer)), gas: readPedal(pad, calibration.gas), brake: readPedal(pad, calibration.brake) };
    }
    if (pad.mapping === 'standard') return { steer: pad.axes[0] || 0, gas: pad.buttons[7]?.value || 0, brake: pad.buttons[6]?.value || 0 };
    return { steer: 0, gas: 0, brake: 0 };
  }

  function readInput() {
    const pad = currentPad();
    if (pad && (!activePad || activePad.id !== pad.id)) {
      activePad = pad;
      try { calibration = JSON.parse(localStorage.getItem(`lpr-controller-${pad.id}`)); } catch { calibration = null; }
    } else if (!pad) {
      activePad = null;
      calibration = null;
    }
    const device = padInput(pad);
    const local = held.left || held.right || held.gas || held.brake || steeringPointer !== null || touchSteer !== 0;
    const steer = held.left || held.right ? (held.right ? 1 : 0) - (held.left ? 1 : 0) : touchSteer;
    return local ? { steer, gas: held.gas ? 1 : 0, brake: held.brake ? 1 : 0, analog: false, wheel: false } : { ...device, analog: !!pad, wheel: !!calibration };
  }

  function nearestTrack(x, y) {
    let bestDist = Infinity;
    let index = 0;
    for (let i = 0; i < POINTS; i++) {
      const a = track[i];
      const b = track[(i + 1) % POINTS];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
      const distance = (x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2;
      if (distance < bestDist) { bestDist = distance; index = i; }
    }
    return { index, distance: Math.sqrt(bestDist) };
  }

  function update(dt, now) {
    const input = readInput();
    if (now - lastDeviceUpdate > 1000) {
      ui.device.textContent = activePad ? `Yhdistetty: ${activePad.id} · ${activePad.axes.length} akselia, ${activePad.buttons.length} painiketta` : 'Odotetaan ohjainta… Käännä rattia tai paina sen painiketta.';
      ui.input.textContent = activePad ? calibration ? 'RATTI JA POLKIMET' : activePad.mapping === 'standard' ? 'PELIOHJAIN' : 'OHJAIN · KALIBROI' : 'KOSKETUS / NÄPPÄIMISTÖ';
      lastDeviceUpdate = now;
    }
    if (ui.dialog.open) {
      if (car.started) car.lapStart += dt * 1000;
      return;
    }
    input.steer = Math.abs(input.steer) < .04 ? 0 : input.steer;
    if (!car.started && input.gas > .08) {
      car.started = true;
      car.lapStart = now;
      ui.notice.classList.add('hidden');
    }
    const proximity = nearestTrack(car.x, car.y);
    car.offroad = proximity.distance > ROAD_HALF - 7;
    const steps = Math.max(1, Math.ceil(dt * 90));
    for (let i = 0; i < steps; i++) dynamics.step(car, input, dt / steps, car.offroad);
    const boundedX = Math.max(12, Math.min(WORLD.width - 12, car.x));
    const boundedY = Math.max(12, Math.min(WORLD.height - 12, car.y));
    if (boundedX !== car.x || boundedY !== car.y) { car.vx = 0; car.vy = 0; }
    car.x = boundedX;
    car.y = boundedY;

    const nearest = nearestTrack(car.x, car.y);
    car.offroad = nearest.distance > ROAD_HALF - 7;
    if (nearest.distance < ROAD_HALF && car.speed > 2.2) {
      if (car.stage === 0 && nearest.index > 55 && nearest.index < 85) car.stage = 1;
      else if (car.stage === 1 && nearest.index > 115 && nearest.index < 145) car.stage = 2;
      else if (car.stage === 2 && nearest.index > 175 && nearest.index < 205) car.stage = 3;
      else if (car.stage === 3 && (nearest.index < 5 || nearest.index > 235)) {
        const lapTime = now - car.lapStart;
        if (lapTime > 5000) {
          if (!best || lapTime < best) {
            best = lapTime;
            localStorage.setItem('lpr-best-time-v4', String(best));
            ui.best.textContent = formatTime(best);
            showNotice(`UUSI ENNÄTYS · ${formatTime(lapTime)}`, 3500);
          } else showNotice(`KIERROS · ${formatTime(lapTime)}`, 2500);
          car.lap++;
          car.lapStart = now;
          car.stage = 0;
          ui.lap.textContent = String(car.lap);
        }
      }
    }
    if (car.started) ui.time.textContent = formatTime(now - car.lapStart);
    ui.speed.textContent = String(Math.round(car.speed * 3.6));
    ui.lateralG.textContent = `${Math.abs(car.lateralG).toFixed(1)} G`;
    ui.grip.textContent = car.offroad ? 'RADAN ULKOPUOLELLA' : (car.tireUse > .97 || Math.abs(car.bodySlip) > .12) ? 'PITO RAJALLA' : 'PITO OK';
    ui.tc.textContent = car.tcActive ? 'TC RAJOITTAA TEHOA' : 'TC PÄÄLLÄ';
  }

  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, .05);
    lastFrame = now;
    if (!document.hidden) update(dt, now);
    renderer.render(car, now);
    requestAnimationFrame(frame);
  }

  const keyMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake' };
  function syncHeld() {
    for (const name of Object.keys(held)) {
      held[name] = [...keyboard].some(code => keyMap[code] === name) || [...touchPointers.values()].includes(name);
      document.querySelector(`[data-control="${name}"]`).classList.toggle('active', held[name]);
    }
  }
  function setSteer(value) {
    touchSteer = Math.max(-1, Math.min(1, value));
    steeringPad.style.setProperty('--steer-offset', `${touchSteer * Math.max(0, steeringPad.clientWidth / 2 - 30)}px`);
    steeringPad.setAttribute('aria-valuenow', String(Math.round(touchSteer * 100)));
  }
  function clearInput() {
    keyboard.clear();
    touchPointers.clear();
    steeringPointer = null;
    setSteer(0);
    steeringPad.classList.remove('active');
    syncHeld();
  }
  window.addEventListener('keydown', event => {
    if (!keyMap[event.code] || ui.dialog.open || event.target === steeringPad) return;
    event.preventDefault(); keyboard.add(event.code); syncHeld();
  });
  window.addEventListener('keyup', event => {
    if (!keyMap[event.code]) return;
    event.preventDefault(); keyboard.delete(event.code); syncHeld();
  });
  window.addEventListener('blur', clearInput);
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
  function moveSteering(event) {
    const bounds = steeringPad.getBoundingClientRect();
    const value = (event.clientX - bounds.left - bounds.width / 2) / Math.max(1, bounds.width / 2 - 30);
    setSteer(Math.abs(value) < .06 ? 0 : value);
  }
  steeringPad.addEventListener('pointerdown', event => {
    if (steeringPointer !== null || ui.dialog.open) return;
    event.preventDefault(); steeringPointer = event.pointerId;
    steeringPad.setPointerCapture(event.pointerId); steeringPad.classList.add('active'); moveSteering(event);
  });
  steeringPad.addEventListener('pointermove', event => {
    if (event.pointerId === steeringPointer) { event.preventDefault(); moveSteering(event); }
  });
  const releaseSteering = event => {
    if (event.pointerId !== steeringPointer) return;
    steeringPointer = null; setSteer(0); steeringPad.classList.remove('active');
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) steeringPad.addEventListener(type, releaseSteering);
  steeringPad.addEventListener('contextmenu', event => event.preventDefault());
  steeringPad.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) return;
    event.preventDefault();
    setSteer(event.code === 'Home' ? 0 : event.code === 'End' ? 1 : touchSteer + (event.code === 'ArrowLeft' ? -.1 : .1));
  });
  steeringPad.addEventListener('keyup', () => setSteer(0));
  steeringPad.addEventListener('blur', () => { if (steeringPointer === null) setSteer(0); });
  document.addEventListener('visibilitychange', () => {
    clearInput();
    if (document.hidden) suspendedAt = performance.now();
    else if (suspendedAt !== null) {
      const now = performance.now();
      if (car.started) car.lapStart += now - suspendedAt;
      lastFrame = now; suspendedAt = null;
    }
  });
  window.addEventListener('resize', clearInput);
  document.querySelector('#restart-button').addEventListener('click', reset);
  document.querySelector('#settings-button').addEventListener('click', () => { clearInput(); ui.dialog.showModal(); });
  document.querySelector('#close-settings').addEventListener('click', () => ui.dialog.close());
  document.querySelectorAll('[data-capture]').forEach(button => button.addEventListener('click', () => {
    const pad = currentPad();
    if (!pad) { ui.calibration.textContent = 'Ohjainta ei näy. Paina ratin painiketta ja yritä uudelleen.'; return; }
    if (activePad?.id !== pad.id) activePad = pad;
    captures[button.dataset.capture] = snapshot(pad);
    button.classList.add('saved');
    button.textContent = 'Tallennettu ✓';
    ui.calibration.textContent = `Tallennettu: ${button.parentElement.querySelector('strong').textContent.toLowerCase()}.`;
    saveCalibration();
  }));
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(document.querySelector('.game-shell'));
  window.addEventListener('gamepadconnected', event => {
    activePad = event.gamepad;
    try { calibration = JSON.parse(localStorage.getItem(`lpr-controller-${activePad.id}`)); } catch { calibration = null; }
    ui.device.textContent = `Yhdistetty: ${event.gamepad.id}`;
  });
  window.addEventListener('gamepaddisconnected', () => { activePad = null; calibration = null; });

  ui.best.textContent = best ? formatTime(best) : '--:--.---';
  reset();
  resize();
  requestAnimationFrame(frame);
})();

