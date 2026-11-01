const assert = require('node:assert/strict');
const { createWorldFactory } = require('../verification/world.cjs');

const factory = createWorldFactory();
const physicsStepBudgetMs = 1000 / 120;

// Warm up V8 JIT compiler
{
  const { world } = factory.create({ trackIndexed: true });
  const car = world.car;
  car.x = 652.1;
  car.y = 1810;
  car.angle = -Math.PI / 2;
  world.dynamics.reset(car);
  car.speed = 15;
  car.vx = 15;
  for (let i = 0; i < 300; i++) world.step({ gas: 1, brake: 0, steer: 0 });
}

function runConeScenario() {
  const { world, campus } = factory.create({ trackIndexed: true });
  const car = world.car;
  const cone = campus.bodies.find(body => body.kind === 'cone');
  assert(cone, 'Cone collision scenario requires a cone');
  let coneContacts = 0;
  const resolveBoundsCollision = campus.resolveBoundsCollision;
  campus.resolveBoundsCollision = (state, previous, obstacles, onImpact) =>
    resolveBoundsCollision(state, previous, obstacles, contact => {
      if (contact.body?.kind === 'cone') coneContacts++;
      onImpact?.(contact);
    });
  car.x = cone.x - 60;
  car.y = cone.y;
  car.angle = 0;
  world.dynamics.reset(car);
  car.speed = 15;
  car.vx = 15;

  const stepTimes = [];
  for (let i = 0; i < 300; i++) {
    const t0 = performance.now();
    world.step({ gas: 1, brake: 0, steer: 0 });
    const dt = performance.now() - t0;
    stepTimes.push(dt);
  }

  const totalMs = stepTimes.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / stepTimes.length;
  const maxMs = Math.max(...stepTimes);
  const overBudgetSteps = stepTimes.filter(t => t > physicsStepBudgetMs).length;
  const movingBodies = campus.bodies.filter(
    b => Number.isFinite(b.mass) && (Math.abs(b.vx) + Math.abs(b.vy) + Math.abs(b.spin) > 0.001)
  );

  return {
    totalMs,
    avgMs,
    maxMs,
    steps: stepTimes.length,
    overBudgetSteps,
    coneContacts,
    movingBodiesCount: movingBodies.length,
    finalX: car.x,
    finalY: car.y,
    finalAngle: car.angle,
    campus
  };
}

function runWallSlidingScenario() {
  const { campus } = factory.create({ trackIndexed: true });
  const stepTimes = [];
  let contacts = 0;

  // Simulate 200 consecutive shallow wall-scraping contact steps
  for (let i = 0; i < 200; i++) {
    const car = {
      x: 1250 + i * 0.5,
      y: 674.5,
      angle: 0.02,
      vx: 30,
      vy: 1,
      damage: 0,
      crashed: false
    };
    const prev = { x: car.x - 0.25, y: 673.5, angle: 0.02 };
    const t0 = performance.now();
    const hit = campus.resolveBuildingCollision(car, prev, () => {
      contacts++;
    });
    const dt = performance.now() - t0;
    stepTimes.push(dt);
    assert(hit, 'Must register contact with wall');
    assert.equal(hit.body.kind, 'wall', 'Wall scenario must hit a building wall');
  }

  const totalMs = stepTimes.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / stepTimes.length;
  const maxMs = Math.max(...stepTimes);
  const overBudgetSteps = stepTimes.filter(t => t > physicsStepBudgetMs).length;

  return { totalMs, avgMs, maxMs, overBudgetSteps, contacts };
}

// 1. Cone Collision Benchmark & Regression Test
const coneResult = runConeScenario();
assert(coneResult.coneContacts > 0, 'Cone scenario must register actual cone collisions');
assert(coneResult.movingBodiesCount > 0, 'Cone collision scenario must displace dynamic bodies');
assert(
  coneResult.maxMs < 15.0,
  `Cone collision max step (${coneResult.maxMs.toFixed(2)}ms) exceeded 15.0ms limit`
);
assert(
  coneResult.overBudgetSteps <= 2,
  `Cone collisions exceeded the ${physicsStepBudgetMs.toFixed(2)}ms physics-step budget ${coneResult.overBudgetSteps} times`
);
assert(
  coneResult.avgMs < 4.0,
  `Cone collision average step (${coneResult.avgMs.toFixed(2)}ms) exceeded 4ms limit`
);

// 2. Wall Sliding Benchmark & Regression Test
const wallResult = runWallSlidingScenario();
assert.equal(wallResult.contacts, 200, 'All 200 shallow approach steps must make contact');
assert(
  wallResult.avgMs < 1.0,
  `Wall sliding average step (${wallResult.avgMs.toFixed(2)}ms) exceeded 1.0ms limit`
);
assert(
  wallResult.maxMs < 6.0,
  `Wall sliding max step (${wallResult.maxMs.toFixed(2)}ms) exceeded 6.0ms limit`
);

// 3. Bit-for-bit determinism verification
const run1 = runConeScenario();
const run2 = runConeScenario();
assert.equal(run1.finalX, run2.finalX, 'Cone scenario final car x must match bit-for-bit');
assert.equal(run1.finalY, run2.finalY, 'Cone scenario final car y must match bit-for-bit');
assert.equal(run1.finalAngle, run2.finalAngle, 'Cone scenario final car angle must match bit-for-bit');
assert.equal(run1.coneContacts, run2.coneContacts, 'Cone collision count must match');
assert.equal(run1.movingBodiesCount, run2.movingBodiesCount, 'Moving bodies count must match');

for (let i = 0; i < run1.campus.bodies.length; i++) {
  const b1 = run1.campus.bodies[i], b2 = run2.campus.bodies[i];
  assert.equal(b1.x, b2.x, `Body ${i} x position mismatch`);
  assert.equal(b1.y, b2.y, `Body ${i} y position mismatch`);
  assert.equal(b1.vx, b2.vx, `Body ${i} vx mismatch`);
  assert.equal(b1.vy, b2.vy, `Body ${i} vy mismatch`);
  assert.equal(b1.angle, b2.angle, `Body ${i} angle mismatch`);
}

console.log(
  `PASS: collision performance: cone impacts (${coneResult.coneContacts} contacts, avg ${coneResult.avgMs.toFixed(2)}ms, max ${coneResult.maxMs.toFixed(2)}ms, ${coneResult.overBudgetSteps}/${coneResult.steps} steps over ${physicsStepBudgetMs.toFixed(2)}ms) and sustained wall sliding (${wallResult.contacts} contacts, avg ${wallResult.avgMs.toFixed(2)}ms, max ${wallResult.maxMs.toFixed(2)}ms, ${wallResult.overBudgetSteps} steps over budget)`
);
