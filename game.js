(() => {
  'use strict';
  const t = (text, values) => window.LPRI18n?.t(text, values) ?? text;

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
  const WORLD = LPRCampus.bounds;
  const ROAD_HALF = 27;
  const KERB_OUTER = 33;
  const SHOULDER_OUTER = 35;
  const track = LPRCampus.track;
  const POINTS = track.length;
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
  let best = Number(localStorage.getItem('lpr-best-time-lut-v1')) || 0;
  let car;
  let lastFrame = performance.now();
  let lastDeviceUpdate = 0;
  let noticeTimeout = 0;
  const saleEnter = document.querySelector('#sale-enter');
  const saunaEnter = document.querySelector('#sauna-enter');
  const saunaSteam = document.querySelector('#sauna-steam');
  const saunaSeat = document.querySelector('#sauna-seat');
  const saunaHint = document.querySelector('#sauna-hint');
  const saunaSound = document.querySelector('#sauna-sound');
  const saunaDialogue = document.querySelector('#sauna-dialogue');
  const saunaLife = new LPRSaunaLife(text => {
    saunaDialogue.textContent = t(text);
    saunaDialogue.hidden = !text;
  });
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

  function toggleSale() {
    if(car.crashed) return;
    if(ui.dialog.open || car.sauna || (!car.sale && (!nearSale() || Math.abs(car.speed)>.5))) return;
    clearInput();
    stopLooking();
    car.sale=!car.sale;
    if(car.sale) {
      dynamics.reset(car);
      car.saleX=35; car.saleZ=130;
      car.saunaYaw=-Math.PI/2; car.saunaPitch=0;
      ui.speed.textContent='0';
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

  function updateSaunaUI() {
    saleEnter.disabled = car.crashed || ui.dialog.open || car.sauna || (!car.sale && (!nearSale() || Math.abs(car.speed)>.5));
    saleEnter.hidden = saleEnter.disabled;
    saleEnter.textContent = car.sale ? t('Palaa autoon (E)') : t('Mene Saleen (E)');
    saunaEnter.disabled = car.crashed || ui.dialog.open || car.sale || !car.sauna && (!nearSauna() || Math.abs(car.speed) > .5);
    saunaEnter.hidden = saunaEnter.disabled;
    saunaEnter.textContent = car.sauna ? t("Palaa autoon (E)") : t("Mene saunaan (E)");
    updateSteamTarget();
    saunaSeat.hidden = !car.sauna;
    saunaSound.hidden = !car.sauna;
    saunaHint.textContent = car.sauna ? t("W/S: eteen/taakse, A/D: sivuille. Klikkaa n\u00e4kym\u00e4\u00e4 ja katsele hiirell\u00e4 (Esc vapauttaa). Kosketuksella katsele vet\u00e4m\u00e4ll\u00e4. Valitse \u00e4mp\u00e4ri tai kauha heitt\u00e4\u00e4ksesi l\u00f6yly\u00e4.") : nearSauna() ? t("Pys\u00e4hdy saunapakun viereen ja tule l\u00f6ylyihin.") : '';
    if(car.sale) saunaHint.textContent=t('Salessa: klikkaa n\u00e4kym\u00e4\u00e4 ja katsele hiirell\u00e4 (Esc vapauttaa). Kosketuksella katsele vet\u00e4m\u00e4ll\u00e4. W/S: eteen/taakse, A/D: sivuille. Palaa autoon: E.');
    else if(nearSale()) saunaHint.textContent=t('Pysähdy Salen ovelle ja mene sisään painikkeella tai E-näppäimellä.');
    canvas.classList.toggle('sauna-view', !!(car.sauna || car.sale));
    document.querySelector('#track').setAttribute('aria-label', car.sale ? t("Sale Skinnarilan sisätila") : car.sauna ? t("Saunapakun lauteet ja kiuas") : t("3D-n\u00e4kym\u00e4 kuljettajan paikalta"));
  }

  function toggleSauna() {
    if(car.crashed) return;
    if (car.sale || ui.dialog.open || (!car.sauna && (!nearSauna() || Math.abs(car.speed) > .5))) return;
    clearInput();
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

  function reset() {
    clearInput();
    saunaLife.leave();
    car = { x: track[0].x, y: track[0].y, angle: startAngle, speed: 0, lap: 1, lapStart: 0, stage: 0, started: false, offroad: false, damage:0, crashed:false };
    dynamics.reset(car);
    dynamics.parameters.tractionControlEnabled=true;
    car.tcEnabled=true;
    car.wheelPage=0;
    car.wheelDim=false;
    car.lapElapsedMs=0;
    car.throttleInput=0;
    car.brakeInput=0;
    updateWheelControls();
    updateSaunaUI();
    ui.lap.textContent = '1';
    ui.time.textContent = '00:00.000';
    ui.speed.textContent = '0';
    ui.lateralG.textContent = '0.0 G';
    ui.grip.textContent = t("PITO OK");
    ui.tc.textContent = t("TC P\u00c4\u00c4LL\u00c4");
    showNotice(t("Paina kaasua ja l\u00e4hde ajamaan!"), 0);
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
      ui.calibration.textContent = t("Liike ei erottunut. Tarkista laite ja tallenna asennot uudelleen.");
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
    ui.calibration.textContent = t("Kalibrointi valmis. Voit sulkea ikkunan ja ajaa.");
    ui.input.textContent = t("RATTI JA POLKIMET");
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
    const steer = held.left || held.right ? (held.right ? 1 : 0) - (held.left ? 1 : 0) : steeringPointer !== null || touchSteer !== 0 ? touchSteer : 0;
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

  function grassContact(state) {
    const p = dynamics.parameters;
    const scale = 1 / p.metresPerWorldUnit;
    const forwardX = Math.cos(state.angle), forwardY = Math.sin(state.angle);
    let total = 0;
    let kerbTires = 0;
    // Sample each tire rather than switching the whole car to grass at its centre.
    for (const axle of [p.frontAxle, -p.rearAxle]) {
      for (const side of [-p.trackWidth / 2, p.trackWidth / 2]) {
        const x = state.x + (axle * forwardX - side * forwardY) * scale;
        const y = state.y + (axle * forwardY + side * forwardX) * scale;
        const distance = nearestTrack(x, y).distance;
        if (distance >= ROAD_HALF && distance <= KERB_OUTER) kerbTires++;
        const blend = Math.max(0, Math.min(1, (distance - KERB_OUTER) / (SHOULDER_OUTER - KERB_OUTER)));
        total += blend * blend * (3 - 2 * blend);
      }
    }
    state.kerbFraction = kerbTires / 4;
    return total / 4;
  }

  function update(dt, now) {
    const input = readInput();
    if(car.crashed) {
      car.throttleInput=0;
      car.brakeInput=0;
      showNotice(t("Auto hajosi! Aloita uudelleen."),0);
      return;
    }
    if (now - lastDeviceUpdate > 1000) {
      ui.device.textContent = activePad ? t("deviceDetails", { device: activePad.id, axes: activePad.axes.length, buttons: activePad.buttons.length }) : t("Odotetaan ohjainta\u2026 K\u00e4\u00e4nn\u00e4 rattia tai paina sen painiketta.");
      ui.input.textContent = activePad ? calibration ? t("RATTI JA POLKIMET") : activePad.mapping === 'standard' ? t("PELIOHJAIN") : t("OHJAIN \u00b7 KALIBROI") : t("KOSKETUS / N\u00c4PP\u00c4IMIST\u00d6");
      lastDeviceUpdate = now;
    }
    if (ui.dialog.open || car.sauna || car.sale) {
      if (car.started) car.lapStart += dt * 1000;
      if (car.sauna && !ui.dialog.open) {
        saunaLife.update(dt,car,now);
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
    for (let i = 0; i < steps; i++) {
      car.grassFraction = grassContact(car);
      const previous = { x:car.x, y:car.y };
      dynamics.step(car, input, dt / steps, car.grassFraction);
      const collision=window.LPRCampus.resolveObstacleCollision(car, previous);
      if(collision) {
        const damage=dynamics.applyImpact(car,collision.normal);
        if(damage>0) showNotice(t("Auto vaurioitui."),2500);
        if(car.crashed) {
          car.crashedAt=now;
          showNotice(t("Auto hajosi! Aloita uudelleen."),0);
          break;
        }
      }
    }
    const boundedX = Math.max(12, Math.min(WORLD.width - 12, car.x));
    const boundedY = Math.max(12, Math.min(WORLD.height - 12, car.y));
    if (boundedX !== car.x || boundedY !== car.y) { car.vx = 0; car.vy = 0; }
    car.x = boundedX;
    car.y = boundedY;

    const nearest = nearestTrack(car.x, car.y);
    car.grassFraction = grassContact(car);
    car.offroad = car.grassFraction > .5;
    if (!car.crashed && nearest.distance < ROAD_HALF && car.speed > 2.2) {
      if (car.stage === 0 && nearest.index > 55 && nearest.index < 85) car.stage = 1;
      else if (car.stage === 1 && nearest.index > 115 && nearest.index < 145) car.stage = 2;
      else if (car.stage === 2 && nearest.index > 175 && nearest.index < 205) car.stage = 3;
      else if (car.stage === 3 && (nearest.index < 5 || nearest.index > 235)) {
        const lapTime = now - car.lapStart;
        if (lapTime > 5000) {
          if (!best || lapTime < best) {
            best = lapTime;
            localStorage.setItem('lpr-best-time-lut-v1', String(best));
            ui.best.textContent = formatTime(best);
            showNotice(t("record", { time: formatTime(lapTime) }), 3500);
          } else showNotice(t("lapResult", { time: formatTime(lapTime) }), 2500);
          car.lap++;
          car.lapStart = now;
          car.stage = 0;
          ui.lap.textContent = String(car.lap);
        }
      }
    }
    if (car.started) ui.time.textContent = formatTime(now - car.lapStart);
    car.lapElapsedMs=car.started ? Math.max(0,now-car.lapStart) : 0;
    car.throttleInput=input.gas;
    car.brakeInput=input.brake;
    ui.speed.textContent = String(Math.round(car.speed * 3.6));
    ui.lateralG.textContent = `${Math.abs(car.lateralG).toFixed(1)} G`;
    ui.grip.textContent = car.damage>0 ? `${t("VAURIO")} ${Math.round(car.damage*100)} %` : car.offroad ? t("RADAN ULKOPUOLELLA") : (car.tireUse > .97 || Math.abs(car.bodySlip) > .12) ? t("PITO RAJALLA") : t("PITO OK");
    ui.tc.textContent = car.tcActive ? t("TC RAJOITTAA TEHOA") : t(car.tcEnabled ? "TC P\u00c4\u00c4LL\u00c4" : "TC POIS");
    updateSaunaUI();
  }

  let lastPresentation = null;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { lastPresentation = null; return; }
    // High-refresh desktop displays should not rebuild all geometry at 144–240 Hz.
    const interval = 1000 / 60;
    const elapsed = lastPresentation === null ? interval : now - lastPresentation;
    if (elapsed < interval - .01) return;
    lastPresentation = now - (elapsed >= interval ? elapsed % interval : 0);
    const dt = Math.min((now - lastFrame) / 1000, .05);
    lastFrame = now;
    if (!document.hidden) update(dt, now);
    if (!document.hidden) updateSteamTarget();
    renderer.render(car, now);
  }

  const keyMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake' };
  function updateWheelControls() {
    document.querySelector('#wheel-page').textContent=t(car.wheelPage===1 ? 'Ratti: pito (P)' : 'Ratti: nopeus (P)');
    document.querySelector('#wheel-dim').setAttribute('aria-pressed',String(car.wheelDim));
    document.querySelector('#wheel-tc').setAttribute('aria-pressed',String(car.tcEnabled));
  }
  function operateWheel(action) {
    if(ui.dialog.open || car.sauna || car.sale || car.crashed) return;
    if(action==='page') car.wheelPage=car.wheelPage===1 ? 0 : 1;
    else if(action==='brightness') car.wheelDim=!car.wheelDim;
    else if(action==='tc') {
      car.tcEnabled=!car.tcEnabled;
      dynamics.parameters.tractionControlEnabled=car.tcEnabled;
      if(!car.tcEnabled) { car.tcActive=false; car.torqueScale=1; }
      ui.tc.textContent=t(car.tcEnabled ? 'TC P\u00c4\u00c4LL\u00c4' : 'TC POIS');
    }
    updateWheelControls();
  }
  for(const [id,action] of [['#wheel-page','page'],['#wheel-dim','brightness'],['#wheel-tc','tc']]) {
    document.querySelector(id).addEventListener('click',()=>operateWheel(action));
  }
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
  function setSteer(value) {
    touchSteer = Math.max(-1, Math.min(1, value));
    steeringPad.style.setProperty('--steer-offset', `${touchSteer * Math.max(0, steeringPad.clientWidth / 2 - 30)}px`);
    steeringPad.setAttribute('aria-valuenow', String(Math.round(touchSteer * 100)));
  }
  function clearInput() {
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    stopLooking();
    saunaHoverPosition=null;
    saunaSteamSelected=false;
    keyboard.clear();
    touchPointers.clear();
    steeringPointer = null;
    setSteer(0);
    steeringPad.classList.remove('active');
    syncHeld();
  }
  window.addEventListener('keydown', event => {
    if (!ui.dialog.open && !event.repeat && !['BUTTON','INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) {
      if (event.code === 'KeyE') {
        event.preventDefault();
        if (car.sale || (!car.sauna && nearSale())) toggleSale();
        else toggleSauna();
        return;
      }
      if (event.code === 'KeyF' && car.sauna) { event.preventDefault(); switchSaunaSeat(); return; }
      if (event.code === 'Space' && car.sauna) { event.preventDefault(); throwSteam(); return; }
    }
    if (!keyMap[event.code] || ui.dialog.open || event.target === steeringPad) return;
    event.preventDefault(); keyboard.add(event.code); syncHeld();
  });
  window.addEventListener('keyup', event => {
    if (!keyMap[event.code]) return;
    event.preventDefault(); keyboard.delete(event.code); syncHeld();
  });
  window.addEventListener('blur', clearInput);
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
    if(document.hidden) saunaLife.stopSound();
    if (document.hidden) suspendedAt = performance.now();
    else if (suspendedAt !== null) {
      const now = performance.now();
      if (car.started) car.lapStart += now - suspendedAt;
      lastFrame = now; suspendedAt = null;
    }
  });
  window.addEventListener('resize', clearInput);
  document.querySelector('#restart-button').addEventListener('click', reset);
  saleEnter.addEventListener('click', toggleSale);
  saunaEnter.addEventListener('click', toggleSauna);
  saunaSteam.addEventListener('click', throwSteam);
  saunaSeat.addEventListener('click', switchSaunaSeat);
  saunaSound.addEventListener('click', () => {
    saunaLife.setSound(!saunaLife.sound);
    saunaSound.setAttribute('aria-pressed', String(saunaLife.sound));
    saunaSound.textContent = saunaLife.sound ? t("Saunan \u00e4\u00e4net: p\u00e4\u00e4ll\u00e4") : t("Saunan \u00e4\u00e4net: pois");
  });
  document.querySelector('#settings-button').addEventListener('click', () => { clearInput(); saunaLife.stopSound(); ui.dialog.showModal(); });
  document.querySelector('#close-settings').addEventListener('click', () => ui.dialog.close());
  document.querySelectorAll('[data-capture]').forEach(button => button.addEventListener('click', () => {
    const pad = currentPad();
    if (!pad) { ui.calibration.textContent = t("Ohjainta ei n\u00e4y. Paina ratin painiketta ja yrit\u00e4 uudelleen."); return; }
    if (activePad?.id !== pad.id) activePad = pad;
    captures[button.dataset.capture] = snapshot(pad);
    button.classList.add('saved');
    button.textContent = t("Tallennettu \u2713");
    ui.calibration.textContent = t("savedPosition", { position: button.parentElement.querySelector("strong").textContent.toLowerCase() });
    saveCalibration();
  }));
  window.addEventListener('resize', resize);
  const landscapeDriving = window.matchMedia('(pointer:coarse) and (orientation:landscape), (max-width:900px) and (max-height:500px) and (orientation:landscape)');
  landscapeDriving.addEventListener('change', event => {
    if (event.matches && ui.dialog.open) ui.dialog.close();
  });
  new ResizeObserver(resize).observe(document.querySelector('.game-shell'));
  window.addEventListener('gamepadconnected', event => {
    activePad = event.gamepad;
    try { calibration = JSON.parse(localStorage.getItem(`lpr-controller-${activePad.id}`)); } catch { calibration = null; }
    ui.device.textContent = t("connected", { device: event.gamepad.id });
  });
  window.addEventListener('gamepaddisconnected', () => { activePad = null; calibration = null; });

  ui.best.textContent = best ? formatTime(best) : '--:--.---';
  reset();
  resize();
  requestAnimationFrame(frame);
})();

