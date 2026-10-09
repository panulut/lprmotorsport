// Sector comparisons always refer to one complete personal-best lap.
window.LPRLapTiming = class {
  constructor(best = null) {
    this.best = Array.isArray(best) && best.length === 3 && best.every(n => Number.isFinite(n) && n > 0) ? best : null;
    this.reset();
  }
  reset() { this.sectors = []; this.elapsed = 0; }
  split(elapsed) {
    if (this.sectors.length >= 3 || !Number.isFinite(elapsed) || elapsed <= this.elapsed) return null;
    const time = elapsed - this.elapsed;
    const index = this.sectors.length;
    this.sectors.push(time);
    this.elapsed = elapsed;
    return { sector: index + 1, time, delta: this.best ? time - this.best[index] : null };
  }
};
