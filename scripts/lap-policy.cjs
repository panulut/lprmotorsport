// Conservative review thresholds, not proof that a driver completed a lap.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
module.exports = function lapPolicy() {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const window = {};
  new Function('window', 'module', read('shared/vehicle-spec.js') + '\n' + read('campus.js'))(window, undefined);
  const { track, road } = window.LPRCampus, spec = window.LPRVehicleSpec;
  // These are the existing gate ranges in game.js. Include the full road width
  // at both ends and a 10% speed margin; use chord distances, not road length.
  const game = read('game.js');
  for (const expression of ['nearest.index > 55 && nearest.index < 85',
    'nearest.index > 115 && nearest.index < 145', 'nearest.index > 175 && nearest.index < 205',
    'nearest.index < 5 || nearest.index > 235']) {
    if (!game.includes(expression)) throw Error('Lap gates changed: update review policy');
  }
  if (!read('vehicle.js').includes('Math.max(-14, Math.min(14,')) throw Error('Lateral speed bound changed');
  const gates = [track.filter((_,i) => i < 5 || i > 235), track.filter((_,i) => i > 55 && i < 85),
    track.filter((_,i) => i > 115 && i < 145), track.filter((_,i) => i > 175 && i < 205)];
  const distance = (a,b) => Math.max(0, Math.min(...a.flatMap(p => b.map(q => Math.hypot(p.x-q.x,p.y-q.y)))) - 2*road.halfWidth) * spec.metresPerWorldUnit;
  const maxSpeed = 1.1 * Math.hypot(spec.maxMotorRpm * 2*Math.PI/60 / spec.finalDriveRatio * spec.tyreDiameter/2, 14);
  return { minSectorMs: [distance(gates[0],gates[1]),distance(gates[1],gates[2]),
    distance(gates[2],gates[3])+distance(gates[3],gates[0])].map(d => Math.floor(d/maxSpeed*1000)),
    recordRatio: 0.9, timingToleranceMs: 2000, supersededGraceMs: 5000 };
};
