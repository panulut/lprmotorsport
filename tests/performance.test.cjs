const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const context = { window: { devicePixelRatio: 2, matchMedia: () => ({ matches: false }) } };
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
  const frameContext = { document: { hidden: false }, lastFrame: 0, car: {},
    requestAnimationFrame() {}, update(dt) { simulated += dt; }, updateSteamTarget() {},
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
console.log('Rendering budget and refresh-rate checks passed');
