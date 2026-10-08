const tiltText = text => window.LPRI18n?.t(text) ?? text;
/* Screen-relative tilt, independent of portrait/landscape orientation. */
window.LPRTiltSteering = class LPRTiltSteering {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.enabled = false;
    this.center = null;
    this.target = 0;
    this.value = 0;
    this.lastSample = 0;
    this.onOrientation = event => this.sample(event);
  }

  async enable() {
    if (!window.isSecureContext) throw new Error(tiltText("Kallistusohjaus tarvitsee HTTPS-yhteyden."));
    const sensor = window.DeviceOrientationEvent;
    if (!sensor) throw new Error(tiltText("Laite ei tue kallistusohjausta."));
    if (typeof sensor.requestPermission === 'function' && await sensor.requestPermission() !== 'granted') {
      throw new Error(tiltText("Liikeanturien lupaa ei my\u00f6nnetty. Voit k\u00e4ytt\u00e4\u00e4 kosketusohjausta."));
    }
    this.enabled = true;
    this.recenter();
    window.addEventListener('deviceorientation', this.onOrientation);
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      if (this.enabled && this.center === null) {
        this.disable();
        this.onStatus(tiltText("Liikeanturista ei tullut tietoa. Kosketusohjaus on k\u00e4yt\u00f6ss\u00e4."));
      }
    }, 4000);
  }

  disable() {
    this.enabled = false;
    this.target = this.value = 0;
    clearTimeout(this.timeout);
    window.removeEventListener('deviceorientation', this.onOrientation);
  }

  recenter() {
    this.center = null;
    this.target = this.value = 0;
    this.lastSample = 0;
  }

  sample(event) {
    if (!this.enabled || document.hidden || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    const radians = Math.PI / 180;
    const beta = event.beta * radians;
    const gamma = event.gamma * radians;
    const rotation = (window.screen.orientation?.angle ?? window.orientation ?? 0) * radians;
    const x = Math.cos(beta) * Math.sin(gamma);
    const y = Math.sin(beta);
    const z = Math.cos(beta) * Math.cos(gamma);
    const across = x * Math.cos(rotation) + y * Math.sin(rotation);
    const down = y * Math.cos(rotation) - x * Math.sin(rotation);
    const angle = Math.atan2(across, Math.hypot(down, z)) / radians;
    if (this.center === null) {
      this.center = angle;
      this.onStatus(tiltText("Kallistusohjaus k\u00e4yt\u00f6ss\u00e4. Kallista vasemmalle tai oikealle."));
    }
    const delta = angle - this.center;
    this.target = Math.sign(delta) * Math.min(1, Math.max(0, Math.abs(delta) - 2) / 23);
    this.lastSample = performance.now();
  }

  read(dt) {
    if (!this.enabled || performance.now() - this.lastSample > 1000) {
      this.value = 0;
      return 0;
    }
    this.value += (this.target - this.value) * (1 - Math.exp(-dt * 12));
    return this.value;
  }
};
