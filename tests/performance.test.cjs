const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const context = { window: { LPRVehicleSpec: require('../shared/vehicle-spec.js'),  devicePixelRatio: 2, matchMedia: () => ({ matches: false }) } };
vm.createContext(context);
vm.runInContext(read('renderer3d.js'), context);
const renderer = Object.create(context.window.LPRRenderer3D.prototype);
for (const [width, height, mobile] of [[1920, 1080, false], [3840, 2160, false], [390, 700, true]]) {
  context.window.matchMedia = () => ({ matches: mobile });
  renderer.canvas = { getBoundingClientRect: () => ({ width, height }) };
  renderer.cockpitCanvas = {};
  renderer.cockpit = { setTransform() {} };
  renderer.gl = { viewport() {} };
  renderer.resize();
  assert(renderer.canvas.width * renderer.canvas.height <= (mobile ? 1000000 : 1200000) * 1.003);
  assert.equal(renderer.width, width);
  assert.equal(renderer.height, height);
  assert.equal(renderer.cockpitCanvas.width, renderer.canvas.width);
}
const source = read('game.js');
const frameSource = source.slice(source.indexOf('  let lastPresentation = null;'), source.indexOf('  const keyMap ='));
for (const refresh of [60, 120, 144, 240]) {
  let renders = 0, simulated = 0;
  const frameContext = { window: {}, document: { hidden: false }, lastFrame: 0, car: {},
    requestAnimationFrame() {}, update(dt) { simulated += dt; }, updateSteamTarget() {},
    syncAudio() {}, audio: { update() {} }, renderDriveHud() {},
    renderer: { render() { renders++; } } };
  vm.createContext(frameContext);
  vm.runInContext(frameSource, frameContext);
  for (let i = 0; i <= refresh; i++) frameContext.frame(i * 1000 / refresh);
  assert(renders >= 60 && renders <= 62, `${refresh} Hz: ${renders} renders`);
  assert(Math.abs(simulated - 1) < .02, 'Physics keeps real elapsed time');
  frameContext.document.hidden = true;
  const before = renders;
  frameContext.frame(2000);
  assert.equal(renders, before, 'Hidden tabs do not render');
}
{
  // Long frames must not silently slow the verified simulation down against the server clock.
  let simulated = 0, steps = 0, maxStepsPerFrame = 0;
  const frameContext = { window: {}, document: { hidden: false }, lastFrame: 0, car: {},
    requestAnimationFrame() {}, update(dt) { simulated += dt; steps++; }, updateSteamTarget() {},
    syncAudio() {}, audio: { update() {} }, renderDriveHud() {},
    renderer: { render() {} } };
  vm.createContext(frameContext);
  vm.runInContext(frameSource, frameContext);
  const frame = now => { const before = steps; frameContext.frame(now); maxStepsPerFrame = Math.max(maxStepsPerFrame, steps - before); };
  let now = 0;
  // 20 s at 60 Hz with a 250 ms hitch every second (headless Chrome showed 150–250 ms maxima).
  for (let second = 0; second < 20; second++) {
    for (let i = 0; i < 45; i++) frame(now += 1000 / 60);
    frame(now += 250);
  }
  for (let i = 0; i < 60; i++) frame(now += 1000 / 60);
  assert(Math.abs(simulated - now / 1000) < .05, `Hitches are caught up: simulated ${simulated.toFixed(3)} s of ${(now / 1000).toFixed(3)} s`);
  assert(maxStepsPerFrame <= 24, 'Catch-up stays bounded per frame');
  // A single multi-second stall drops only the time beyond the backlog limit.
  const beforeStall = simulated;
  frame(now += 5000);
  for (let i = 0; i < 120; i++) frame(now += 1000 / 60);
  const recovered = simulated - beforeStall;
  assert(Math.abs(recovered - 3) < .05, `Long stalls keep at most one second of backlog: ${recovered.toFixed(3)} s`);
  // A device rendering at 8 fps still keeps real time (24 steps per frame covers 5 fps).
  const beforeSlow = simulated, slowStart = now;
  for (let i = 0; i < 80; i++) frame(now += 125);
  assert(Math.abs((simulated - beforeSlow) - (now - slowStart) / 1000) < .02, 'Slow devices keep real elapsed time');
}
console.log('Rendering budget and refresh-rate checks passed');
