const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../vehicle.js'), 'utf8'), context);

function corner(speed, steer, extraInput = {}) {
  const dynamics = new context.window.VehicleDynamics();
  const state = { x: 0, y: 0, angle: 0 };
  dynamics.reset(state);
  for (let frame = 0; frame < 450; frame++) {
    // Hold the test speed to isolate steering from acceleration and drag.
    state.vx = speed;
    dynamics.step(state, { steer, gas: 0, brake: 0, ...extraInput }, 1 / 90, 0);
    for (const value of [state.x, state.y, state.vx, state.vy, state.yawRate]) {
      assert(Number.isFinite(value), 'Cornering must remain finite');
    }
  }
  return { state, radius: Math.abs(state.vx / state.yawRate) };
}

for (const speed of [1, 3, 5]) {
  const left = corner(speed, -1);
  const right = corner(speed, 1);
  assert(right.radius > 3.5 && right.radius < 6,
    `Full steering at ${speed * 3.6} km/h must negotiate a tight corner`);
  assert(left.state.yawRate < 0 && right.state.yawRate > 0);
  assert(Math.abs(left.radius - right.radius) < .01, 'Both directions must turn equally');
}

assert(corner(3, .5).radius > corner(3, 1).radius * 1.7,
  'Partial touch or tilt input must request a gentler turn');
const fast = corner(15, 1);
assert(fast.radius > 15, 'Steering must soften at higher speed');
assert(Math.abs(fast.state.lateralG) < 1.3, 'High-speed cornering must retain the grip budget');
const wheel = corner(3, 1, { analog: true, wheel: true });
assert.equal(wheel.state.steerAngle, .36, 'Calibrated wheel input must retain direct full lock');

console.log('PASS: tight low-speed turns, symmetric steering, partial input, speed limiting and wheel input');
