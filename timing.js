// Compare lap time only against a fully recorded, revision-matched trace. Sector
// times are exact at the split gates but cannot stand in for position telemetry.
window.LPRLapTiming = class {
  static validSectors(value) {
    return Array.isArray(value) && value.length === 3 && value.every(n => Number.isFinite(n) && n > 0)
      ? value.slice() : null;
  }
  static referenceRecord(record, lapTime, sectors, trace, revision) {
    const validSectors = window.LPRLapTiming.validSectors(sectors);
    if (!validSectors || !Number.isFinite(lapTime) || Math.abs(validSectors.reduce((sum, value) => sum + value, 0) - lapTime) > 25) return null;
    const validTrace = revision === window.LPRDrivingRevision
      ? window.LPRLapTiming.validSamples(trace, lapTime, 10) : null;
    if (!validTrace) return null;
    return {
      ...(record && typeof record === 'object' ? record : {}),
      referenceTrace: validTrace,
      referenceLapTime: Math.round(lapTime),
      referenceRevision: revision
    };
  }
  static validSamples(value, lapTime, minLength = 2) {
    // Verified driving advances at 120 Hz. The supported 600 s replay envelope
    // therefore needs at most 72,001 samples plus the lap-origin sample.
    // Continuous Delta requires a real mini-sector trace, not a few points
    // connected by broad interpolation across the lap.
    if (!Number.isFinite(lapTime) || lapTime <= 0 || !Array.isArray(value) || value.length < Math.max(minLength, 100) || value.length > 72002) return null;
    let priorProgress = -1, priorElapsed = -1;
    for (const sample of value) {
      if (!Array.isArray(sample) || sample.length !== 2) return null;
      const [progress, elapsed] = sample;
      if (!Number.isFinite(progress) || !Number.isFinite(elapsed) || progress < 0 || progress > 1 || elapsed < 0 ||
          progress <= priorProgress || elapsed < priorElapsed) return null;
      priorProgress = progress;
      priorElapsed = elapsed;
    }
    for (let index = 1; index < value.length; index++) {
      if (value[index][0] - value[index - 1][0] > 0.025) return null;
    }
    if (value[0][0] > 0.002 || value[0][1] > 2 || value.at(-1)[0] < 0.998 ||
        (Number.isFinite(lapTime) && Math.abs(value.at(-1)[1] - lapTime) > 20)) return null;
    return value.map(sample => [sample[0], sample[1]]);
  }
  static validCheckpointProgress(checkpoints, sectors, fallbackProgress = null) {
    const total = Array.isArray(sectors) ? sectors.reduce((sum, value) => sum + value, 0) : 0;
    const validProgress = value => Array.isArray(value) && value.length === 4 && value[0] === 0 && value[3] === 1 &&
      value.every(Number.isFinite) && value.every((position, index) => index === 0 || position > value[index - 1]);
    if (Array.isArray(checkpoints) && checkpoints.length === 4 && checkpoints.every(row => Array.isArray(row) && row.length === 2)) {
      const positions = checkpoints.map(row => row[0]);
      const elapsed = checkpoints.map(row => row[1]);
      const expected = [0, sectors?.[0], (sectors?.[0] || 0) + (sectors?.[1] || 0), total];
      const validElapsed = elapsed.every((time, index) => Number.isFinite(time) && Math.abs(time - expected[index]) <= 25 &&
        (index === 0 || time > elapsed[index - 1]));
      if (validProgress(positions) && validElapsed) return positions;
    }
    return validProgress(fallbackProgress) ? fallbackProgress.slice() : null;
  }
  constructor(best = null, checkpoints = null, trace = null, traceRevision = null, traceLapTime = null, traceIsPersonalBest = true, fallbackProgress = null) {
    this.best = window.LPRLapTiming.validSectors(best);
    this.bestFromDemo = false;
    this.bestProgress = window.LPRLapTiming.validCheckpointProgress(checkpoints, this.best, fallbackProgress);
    const expectedLapTime = Number.isFinite(traceLapTime) ? traceLapTime : this.best?.reduce((sum, value) => sum + value, 0);
    this.bestTrace = traceRevision === window.LPRDrivingRevision
      ? window.LPRLapTiming.validSamples(trace, expectedLapTime, 10) : null;
    this.traceIsPersonalBest = !!this.bestTrace && traceIsPersonalBest;
    this.referenceLapTime = this.bestTrace ? expectedLapTime : null;
    this.reset();
  }
  setBest(sectors, checkpoints = null, trace = null, traceRevision = null, traceLapTime = null, fallbackProgress = null) {
    this.best = window.LPRLapTiming.validSectors(sectors);
    this.bestFromDemo = false;
    this.bestProgress = window.LPRLapTiming.validCheckpointProgress(checkpoints, this.best, fallbackProgress);
    const expectedLapTime = Number.isFinite(traceLapTime) ? traceLapTime : this.best?.reduce((sum, value) => sum + value, 0);
    const validTrace = traceRevision === window.LPRDrivingRevision
      ? window.LPRLapTiming.validSamples(trace, expectedLapTime, 10) : null;
    if (validTrace) {
      this.bestTrace = validTrace;
      this.referenceLapTime = expectedLapTime;
      this.traceIsPersonalBest = true;
    } else if (this.bestTrace) this.traceIsPersonalBest = false;
  }
  setReferenceTrace(trace, revision, lapTime, isPersonalBest = false) {
    if (trace === null) {
      this.bestTrace = null;
      this.referenceLapTime = null;
      this.traceIsPersonalBest = false;
      return true;
    }
    const validTrace = revision === window.LPRDrivingRevision
      ? window.LPRLapTiming.validSamples(trace, lapTime, 10) : null;
    if (!validTrace) return false;
    this.bestTrace = validTrace;
    this.referenceLapTime = lapTime;
    this.traceIsPersonalBest = !!isPersonalBest;
    return true;
  }
  reset() {
    this.sectors = [];
    this.elapsed = 0;
    this.trace = [[0, 0]];
    this.checkpoints = [[0, 0]];
    this.traceValid = true;
    this.checkpointsValid = true;
    this.lastCaptureAt = -Infinity;
    this.liveHighWater = 0;
    this.liveSuspendedAt = null;
    this.lapBestTrace = this.bestTrace?.map(sample => sample.slice()) || null;
    this.lapBestTraceTime = this.lapBestTrace ? this.referenceLapTime : null;
    this.lapBestTraceIsPersonalBest = !!this.lapBestTrace && this.traceIsPersonalBest;
    this.lapBestSectors = this.best ? this.best.slice() : null;
    this.lapBestProgress = this.lapBestSectors && this.bestProgress ? this.bestProgress.slice() : null;
    this.lapLiveProgress = this.lapBestProgress?.slice() || null;
  }
  invalidateTrace() { this.traceValid = false; }
  capture(elapsed, progress, now, force = false) {
    if (!Number.isFinite(elapsed) || elapsed < 0 || !Number.isFinite(progress) || progress < 0 || progress > 1) return false;
    const p = Math.round(progress * 1e6) / 1e6;
    const prior = this.trace.at(-1);
    if (p < prior[0] - 0.001) this.traceValid = false;
    if (!this.traceValid) return false;
    // Capture each game update. UI events are throttled separately; sparse
    // 100 ms samples make the same-position comparison visibly stepwise.
    if (!force && !Number.isFinite(now)) return false;
    if (p < prior[0]) return false;
    const time = Math.round(elapsed);
    if (p - prior[0] < 0.00005) return false;
    this.trace.push([p, time]);
    this.lastCaptureAt = Number.isFinite(now) ? now : this.lastCaptureAt + 100;
    return true;
  }
  split(elapsed, progress = null, now = null) {
    if (this.sectors.length >= 3 || !Number.isFinite(elapsed) || elapsed <= this.elapsed) return null;
    const index = this.sectors.length;
    const time = elapsed - this.elapsed;
    const p = Number.isFinite(progress) ? progress : (index + 1) / 3;
    if (p > 1 || p < 0) return null;
    if (p > this.checkpoints.at(-1)[0]) {
      this.capture(elapsed, p, now, true);
      this.checkpoints.push([Math.round(p * 1e6) / 1e6, Math.round(elapsed)]);
    } else {
      this.traceValid = false;
      this.checkpointsValid = false;
    }
    const exactBaselineElapsed = this.lapBestSectors
      ? this.lapBestSectors.slice(0, index + 1).reduce((sum, value) => sum + value, 0) : null;
    if (this.lapLiveProgress && index < 2) {
      const previous = this.lapLiveProgress[index];
      const next = this.lapLiveProgress[index + 2];
      if (p > previous && p < next) this.lapLiveProgress[index + 1] = p;
    }
    this.sectors.push(time);
    this.elapsed = elapsed;
    // Keep split readouts on the same baseline as continuous Delta. Sector
    // totals are the boundary-only fallback when the lap has no dense trace.
    const lapDelta = this.lapBestTrace ? this.deltaAt(elapsed, p)
      : Number.isFinite(exactBaselineElapsed) ? elapsed - exactBaselineElapsed : null;
    return { sector: index + 1, time, delta: this.best ? time - this.best[index] : null,
      lapDelta: Number.isFinite(lapDelta) ? Math.round(lapDelta) : null, elapsed, progress: p };
  }
  deltaAt(elapsed, progress) {
    if (!Number.isFinite(elapsed) || !Number.isFinite(progress) || progress < 0 || progress > 1) return null;
    if (!this.lapBestTrace) return null;
    const samples = this.lapBestTrace;
    let low = 0, high = samples.length - 1;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (samples[middle][0] <= progress) low = middle;
      else high = middle;
    }
    const start = samples[low], end = samples[high];
    const span = end[0] - start[0];
    const ratio = span > 0 ? (progress - start[0]) / span : 0;
    return elapsed - (start[1] + (end[1] - start[1]) * ratio);
  }
  liveDelta(elapsed, progress) {
    if (!this.lapBestTrace || !Number.isFinite(elapsed) || !Number.isFinite(progress) || progress < 0 || progress > 1) return null;
    if (progress < this.liveHighWater - 0.001) {
      this.liveSuspendedAt = this.liveHighWater;
      return null;
    }
    if (this.liveSuspendedAt !== null) {
      if (progress < this.liveSuspendedAt) return null;
      this.liveSuspendedAt = null;
    }
    this.liveHighWater = Math.max(this.liveHighWater, progress);
    return this.deltaAt(elapsed, progress);
  }
  completeTrace() {
    const samples = window.LPRLapTiming.validSamples(this.trace, this.elapsed, 10);
    const checkpoints = window.LPRLapTiming.validCheckpointProgress(this.checkpoints, this.sectors);
    const sectorTotal = this.sectors.reduce((sum, value) => sum + value, 0);
    return this.traceValid && this.checkpointsValid && this.sectors.length === 3 && checkpoints &&
      Math.abs(sectorTotal - this.elapsed) <= 25 && samples ? samples : null;
  }
};
