const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: { LPRDrivingRevision: 'test-revision' } };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../timing.js'), 'utf8'), context);
const Timing = context.window.LPRLapTiming;
const timing = new Timing([10000, 12000, 18000]);
assert.equal(timing.split(9000).delta, -1000);
const second = timing.split(22000);
assert.equal(second.time, 13000);
assert.equal(second.delta, 1000);
const last = timing.split(40000);
assert.equal(last.sector, 3);
assert.equal(last.time, 18000);
assert.equal(last.delta, 0);
assert.equal(timing.split(41000), null);
timing.reset();
assert.equal(timing.split(0), null);
assert.equal(timing.split(10000).sector, 1);
assert.equal(timing.split(9999), null);
assert.equal(new Timing().split(10000).delta, null);
assert.equal(new Timing([1, -2, 3]).best, null);

const denseTrace = Array.from({length: 101}, (_, index) => [index / 100, index * 10]);
const fallbackProgress = [0, .25, .7, 1];
const dense = new Timing([300, 300, 400], [[0, 0], [.3, 300], [.6, 600], [1, 1000]], denseTrace, 'test-revision');
assert.ok(dense.bestTrace, 'current-revision dense PB trace becomes the live reference');
assert.equal(dense.deltaAt(450, .45), 0);
const traceAndSectorBaselineDiffer = new Timing([250, 250, 500], null,
  Array.from({length: 101}, (_, index) => [index / 100, index * 11]), 'test-revision', 1100);
assert.equal(traceAndSectorBaselineDiffer.split(400, .3).lapDelta, 70,
  'when a dense reference exists, split Delta stays on that trace rather than disagreeing with unrelated sector totals');
const nearZeroTrace = new Timing([300, 300, 400], null, denseTrace, 'test-revision', 1000);
assert.equal(nearZeroTrace.split(300.2, .3).lapDelta, 0,
  'sub-millisecond split noise is normalized like live Delta instead of leaving a signed zero');
const denseTraceWins = new Timing([300, 300, 400], null, denseTrace, 'test-revision', 1000, true, fallbackProgress);
assert.equal(denseTraceWins.deltaAt(450, .45), 0, 'a dense PB trace takes priority over the sector estimate');
assert.equal(dense.liveDelta(500, .4), 100);
assert.equal(dense.liveDelta(390, .3), null, 'reverse progress clears the displayed comparison');
assert.equal(dense.liveDelta(450, .35), null, 'reverse comparison remains suspended until forward progress catches up');
assert.equal(dense.liveDelta(500, .4), 100, 'comparison resumes when forward progress reaches the prior high-water mark');
const slowerTrace = denseTrace.map(([progress, elapsed]) => [progress, elapsed * 2]);
dense.setBest([600, 600, 800], null, slowerTrace, 'test-revision');
assert.equal(dense.liveDelta(600, .4), 200, 'a saved PB does not change the current lap reference mid-lap');
dense.reset();
assert.equal(dense.liveDelta(600, .4), -200, 'the next lap snapshots the new dense PB trace');
const wrongRevision = new Timing([300, 300, 400], null, denseTrace, 'old-revision');
assert.equal(wrongRevision.bestTrace, null, 'a trace from another track revision is not a live reference');
assert.equal(wrongRevision.liveDelta(500, .4), null);
assert.equal(Timing.validSamples(denseTrace, undefined), null, 'a stored reference must include its lap time');
assert.equal(new Timing(null, null, denseTrace, 'test-revision').bestTrace, null, 'a trace without a verifiable duration is rejected');

const captured = new Timing();
for (let index = 1; index <= 100; index++) {
  const progress = index / 100, elapsed = index * 900, now = index * 16;
  if (index === 30 || index === 60 || index === 100) captured.split(elapsed, progress, now);
  else captured.capture(elapsed, progress, now);
}
assert.equal(captured.completeTrace().length, 101, 'each actual game update is retained in a dense clean trace');
const verifiedTrace = new Timing();
for (let index = 1; index <= 10140; index++) {
  const progress = index / 10140;
  const elapsed = progress <= .3 ? 28100 * progress / .3
    : progress <= .6 ? 28100 + 27982 * (progress - .3) / .3
      : 56082 + 28426 * (progress - .6) / .4;
  if (index === 3042) verifiedTrace.split(elapsed, .3, index * 1000 / 120);
  else if (index === 6084) verifiedTrace.split(elapsed, .6, index * 1000 / 120);
  else if (index === 10140) verifiedTrace.split(elapsed, 1, index * 1000 / 120);
  else verifiedTrace.capture(elapsed, progress, index * 1000 / 120);
}
assert.equal(verifiedTrace.completeTrace().length, 10141, 'an 84.5 s 120 Hz verified lap fits the persisted trace limit');
const partial = new Timing();
partial.capture(100, .1, 100);
assert.equal(partial.completeTrace(), null, 'partial laps cannot be promoted as a PB trace');
const interrupted = new Timing();
for (let index = 1; index <= 3; index++) interrupted.capture(index * 100, index / 10, index * 100);
interrupted.invalidateTrace();
for (let index = 4; index <= 10; index++) interrupted.capture(index * 100, index / 10, index * 100);
interrupted.split(300, .3);
interrupted.split(600, .6);
interrupted.split(1000, 1);
assert.equal(interrupted.completeTrace(), null, 'an interrupted or off-track trace is never promoted as dense');
const noisy = new Timing();
assert.equal(noisy.split(100, .3).sector, 1);
assert.equal(noisy.split(220, .29).sector, 2, 'noisy position samples do not discard an authoritative split');
assert.equal(noisy.completeTrace(), null, 'non-monotone trace samples cannot be promoted');
const stationary = new Timing();
stationary.capture(100, 0, 100);
assert.equal(stationary.trace[0][0], 0, 'the lap origin remains anchored while stationary');
assert.equal(stationary.trace[0][1], 0, 'the lap origin time remains anchored while stationary');

const legacyPb = [28000, 28000, 28000];
const firstRealLap = new Timing(legacyPb);
for (let index = 1; index <= 300; index++) {
  const progress = index / 300, elapsed = index * 300, now = index * 100;
  if ([90, 180, 300].includes(index)) firstRealLap.split(elapsed, progress, now);
  else firstRealLap.capture(elapsed, progress, now);
}
const realTrace = firstRealLap.completeTrace();
assert.ok(realTrace, 'a completed driven lap yields the dense reference trace');
const legacyRecord = { lapTime: 84000, sectors: legacyPb, revision: 'test-revision' };
const savedReference = Timing.referenceRecord(legacyRecord, 90000, [27000, 27000, 36000], realTrace, 'test-revision');
assert.equal(savedReference.lapTime, 84000, 'persisting a slower reference lap leaves the real PB time unchanged');
assert.deepEqual(savedReference.sectors, legacyPb, 'persisting a slower reference lap leaves PB sectors unchanged');
assert.equal(firstRealLap.setReferenceTrace(savedReference.referenceTrace, savedReference.referenceRevision, savedReference.referenceLapTime), true);
assert.deepEqual(firstRealLap.best, legacyPb, 'establishing a comparison lap does not replace the older numeric PB');
assert.equal(firstRealLap.traceIsPersonalBest, false, 'the initial comparison lap is not mislabeled as the PB');
firstRealLap.reset();
assert.equal(firstRealLap.liveDelta(39000, .4), 3000, 'the next lap compares elapsed time at matching progress');
const reloadedReference = new Timing(savedReference.sectors, null, savedReference.referenceTrace,
  savedReference.referenceRevision, savedReference.referenceLapTime, false);
assert.equal(reloadedReference.liveDelta(39000, .4), 3000, 'the reference trace remains usable after reload');
const betterTrace = realTrace.map(([progress, elapsed]) => [progress, elapsed * 8 / 9]);
reloadedReference.setBest([24000, 24000, 32000], null, betterTrace, 'test-revision', 80000);
reloadedReference.reset();
assert.equal(reloadedReference.traceIsPersonalBest, true, 'an accepted PB trace replaces the reference lap');
assert.equal(reloadedReference.liveDelta(39000, .4), 39000 - 32000);

const sparse = new Timing([300, 300, 400], null, null, 'test-revision', null, true, fallbackProgress);
assert.equal(sparse.bestTrace, null);
assert.equal(sparse.deltaAt(300, .25), null, 'sector-only data does not synthesize position telemetry');
assert.equal(sparse.deltaAt(600, .7), null, 'sector-only PB data cannot produce a live delta');
assert.equal(sparse.deltaAt(450, .475), null, 'without a recorded trace the continuous comparison stays unavailable');
assert.equal(sparse.liveDelta(460, .475), null, 'sector fallback is never presented as a live delta');
const tooSparseTrace = Array.from({length: 11}, (_, index) => [index / 10, index * 100]);
assert.equal(new Timing([300, 300, 400], null, tooSparseTrace, 'test-revision', 1000).bestTrace, null,
  'a handful of lap-wide samples cannot masquerade as dense mini-sector telemetry');
assert.equal(new Timing().liveDelta(1000, .5), null, 'no recorded trace leaves delta blank');
const sparseSplit = sparse.split(400, .25);
assert.equal(sparseSplit.delta, 100, 'sector chip comparison remains exact for split times');
assert.equal(sparseSplit.lapDelta, 100, 'split events carry the exact cumulative PB delta');
const shiftedGates = new Timing([300, 300, 400], null, null, 'test-revision', null, true, fallbackProgress);
assert.equal(shiftedGates.split(330, .3).lapDelta, 30, 'a split boundary reports exact cumulative PB delta even when the gate crossing progress differs');
assert.equal(shiftedGates.deltaAt(400, .35), null, 'split anchors do not synthesize continuous position data');
assert.equal(shiftedGates.split(640, .72).lapDelta, 40, 'later split boundary uses the exact cumulative PB sector time');
const slowerReference = denseTrace.map(([progress, elapsed]) => [progress, elapsed * 2]);
const pbSectorsTakePriority = new Timing([300, 300, 400], null, slowerReference, 'test-revision', 2000, false, fallbackProgress);
assert.equal(pbSectorsTakePriority.deltaAt(450, .4), -350, 'a dense trace is the only source for continuous position comparison');
const savedSectors = [[0, 0], [.25, 300], [.7, 600], [1, 1000]];
const loaded = new Timing([300, 300, 400], savedSectors, null, 'test-revision');
assert.equal(loaded.liveDelta(450, .475), null, 'saved sector checkpoints without a trace cannot produce a live delta');
loaded.setBest([330, 330, 440], null, null, 'test-revision', 1100, fallbackProgress);
assert.equal(loaded.liveDelta(460, .475), null, 'a numeric PB update does not fabricate position data');
loaded.reset();
assert.equal(loaded.liveDelta(573, .475), null, 'numeric split times remain exact-only without a recorded trace');
const demoOnly = new Timing([300, 300, 400], null, null, 'test-revision', null, true, fallbackProgress);
demoOnly.bestFromDemo = true;
demoOnly.reset();
assert.equal(demoOnly.liveDelta(460, .475), null, 'demo PB sectors do not synthesize a continuous delta');
console.log('PASS: split timing, trace-only position delta, revision/lap snapshots, invalid traces, reverse suspension and reset');
