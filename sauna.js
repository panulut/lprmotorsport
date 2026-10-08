/* Local sauna scene: timed social actions, guest turnover and optional sound. */
window.LPRSaunaLife = class LPRSaunaLife {
  constructor(onLine) {
    this.onLine = onLine;
    this.sound = false;
    this.audio = null;
    this.notes = [];
    this.names = ['Aino', 'Arjun', 'Mei', 'Elias', 'Lin', 'Veera', 'Ravi', 'Sofia', 'Antti', 'Jia', 'Isha', 'Oskari'];
    this.lines = [
      { speaker: 0, kind: 'talk', text: 'Onpa hyvät löylyt. Miten teidän ajokierros meni?' },
      { speaker: 5, kind: 'talk', text: 'Ensimmäinen mutka yllätti, mutta seuraava kierros meni jo paremmin!' },
      { speaker: 2, kind: 'story', text: 'Kerran rakennettiin saunaa koko yö. Aamulla huomattiin, että ovi puuttui.' },
      { speaker: 6, kind: 'laugh', text: 'Siinä taisi olla vähän turhankin hyvä ilmanvaihto!' },
      { speaker: 4, kind: 'sing', text: '♪ Lauteilla lämmin, ilta on nuori, löylyssä lepää teekkarin huoli! ♪' },
      { speaker: 1, kind: 'talk', text: 'Vettä väliin, niin jaksaa vielä yhden löylyn.' },
      { speaker: 7, kind: 'story', text: 'Meidän tiimi korjasi auton yhdellä nippusiteellä. Se oli koko päivän tärkein osa.' },
      { speaker: 3, kind: 'laugh', text: 'Nippuside on kyllä insinöörin paras kaveri!' },
      { speaker: 6, kind: 'sing', text: '♪ Kiukaan kivet, lämmin puu, kaverin kanssa nauru kuuluu! ♪' },
      { speaker: 0, kind: 'talk', text: 'Käydään kohta pihalla vilvoittelemassa.' }
    ];
    this.reset();
  }

  reset() {
    this.stopSound();
    this.time = 0;
    this.nextLine = 2;
    this.lineIndex = 0;
    this.nextSteam = 18;
    this.line = null;
    this.wasDoorOpen = false;
    this.doorShoutIndex = 0;
    this.heat = 0;
    this.lastHeatReaction = -Infinity;
    this.heatReactionIndex = 0;
    this.nextHeatExit = 0;
    this.guests = [];
    let index = 0;
    for (const side of [-1, 1]) for (const x of [1981, 1991, 1996, 2001]) {
      this.guests.push({ index, side, x, z: side * 8, name: this.names[index++], generation: 0 });
    }
    this.onLine('');
  }

  enter() { this.reset(); }
  leave() { this.stopSound(); this.onLine(''); }

  say(guest, text, kind = 'talk', duration = 5) {
    if (kind !== 'heat' && this.line?.kind === 'heat' && this.time < this.line.until) return;
    // Let the door reaction finish before normal sauna chatter resumes.
    if (kind !== 'door' && kind !== 'heat' && this.line?.kind === 'door' && this.time < this.line.until) return;
    this.line = { speaker: guest.index, text, kind, until: this.time + duration };
    this.onLine(`${guest.name}: ${text}`);
    if (this.sound) {
      if (kind === 'sing') this.sing();
      else this.speak(text, guest.index, kind === 'door');
    }
  }

  update(dt, car, now) {
    this.time += dt;
    this.heat = Math.max(0, this.heat - dt * .16);
    if (this.line && this.time > this.line.until) { this.line = null; this.onLine(''); }
    const doorOpen = this.doorOpen();
    if (doorOpen !== this.wasDoorOpen) {
      const seated = this.guests.filter(guest => {
        const pose = this.pose(guest.index);
        return pose.visible && !pose.walking && !pose.standing;
      });
      const guest = seated[this.doorShoutIndex % seated.length];
      if (guest) {
        const text = doorOpen
          ? ['Ovi kiinni!', 'Kenellä jäi häntä oven väliin?'][this.doorShoutIndex++ % 2]
          : 'Turkasen tulimmainen, nyt se ovi kiinni!';
        this.say(guest, text, 'door', 4);
        this.nextLine = Math.max(this.nextLine, this.time + 5);
      }
      this.wasDoorOpen = doorOpen;
    }
    if (this.time >= this.nextLine) {
      const line = this.lines[this.lineIndex++ % this.lines.length];
      const guest = this.guests[line.speaker];
      if (!this.pose(guest.index).walking && this.pose(guest.index).visible) this.say(guest, line.text, line.kind);
      this.nextLine += 7;
    }
    if (this.time >= this.nextSteam) {
      // The guest beside the current bucket really reaches for the same ladle.
      const guest = this.guests[car.saunaSide === 1 ? 5 : 1];
      if (now - car.steamAt >= 1500 && !this.pose(guest.index).walking && this.pose(guest.index).visible) {
        car.steamAt = now;
        car.steamActor = guest.index;
        this.say(guest, 'Heitän vähän lisää löylyä!', 'steam', 3);
        this.registerSteam(guest.index);
      }
      this.nextSteam += 27;
    }
    for (const guest of this.guests) {
      if (guest.heatExit !== undefined && this.time >= guest.heatExit) {
        if (this.time >= guest.heatExit + 16) {
          delete guest.heatExit;
          // A cooling break returns the same guest, rather than replacing them.
          guest.regularStart = this.time + 24 + guest.index * 18;
          guest.regularGeneration = guest.generation;
          delete guest.departure;
          this.say(guest, 'Jo helpotti! Nyt voisi ottaa vähän rauhallisemmat löylyt.', 'talk', 3);
        } else continue;
      }
      const start = guest.regularStart ?? (32 + guest.index * 18);
      const cycle = Math.floor((this.time - start) / 160);
      const phase = this.time - start - cycle * 160;
      if(cycle>=0 && phase<1 && guest.departure !== cycle) {
        guest.departure=cycle;
        this.say(guest,'Käyn vähän pihalla vilvoittelemassa. Nähdään kohta!', 'talk', 3);
      }
      const nextGeneration = (guest.regularGeneration || 0) + cycle + 1;
      if (cycle >= 0 && phase >= 9 && guest.generation < nextGeneration) {
        guest.generation = nextGeneration;
        guest.name = this.names[(guest.index + guest.generation * 3) % this.names.length];
        this.say(guest,'Moi! Vieläkö lauteilla on tilaa?', 'talk', 3);
      }
    }
  }

  registerSteam(actor = 'player') {
    this.heat = Math.min(10, this.heat + 1.2);
    if (this.heat < 3 || this.time - this.lastHeatReaction < 3) return;
    const seated = this.guests.filter(guest => {
      const pose = this.pose(guest.index);
      return guest.index !== actor && pose.visible && !pose.walking && !pose.standing && guest.heatExit === undefined;
    });
    if (!seated.length) return;
    const guest = seated[this.heatReactionIndex++ % seated.length];
    const text = this.heat >= 7.5 ? 'Ei hitto, ei tällaisia löylyjä kestä'
      : this.heat >= 5.5 ? 'Ai saakeli, kun on kuuma' : 'Huh huh, nyt on kyllä kunnon löylyt';
    this.say(guest, text, 'heat', 4);
    this.lastHeatReaction = this.time;
    this.nextLine = Math.max(this.nextLine, this.time + 5);
    if (this.heat >= 7.5 && this.time >= this.nextHeatExit &&
      !this.guests.some(other => { const pose = this.pose(other.index); return pose.walking || pose.standing; })) {
      // Finish the complaint, then use the existing stairs/door walking route.
      guest.heatExit = this.time + 4;
      this.nextHeatExit = this.time + 22;
    }
  }

  pose(index) {
    const guest = this.guests[index], start = guest.regularStart ?? (32 + index * 18);
    const phase = guest.heatExit !== undefined && this.time >= guest.heatExit
      ? this.time - guest.heatExit
      : this.time < start ? -1 : (this.time - start) % 160;
    const walkPath = [
      [guest.x, 4.5, guest.side * 3.05],
      [guest.x, 4.5, guest.side * .55],
      [2005.5, 4.5, guest.side * .55],
      [2007.8, 3.33, guest.side * .55],
      [2010.1, 2.17, guest.side * .55],
      [2012.4, 1, guest.side * .55],
      [2015.5, 1, 6], [2015.5, 1, 16], [2015.5, 0, 21]
    ];
    const pathPoint = progress => {
      const lengths = walkPath.slice(1).map((p, i) => Math.hypot(...p.map((v, axis) => v - walkPath[i][axis])));
      let distance = Math.max(0, Math.min(1, progress)) * lengths.reduce((a, b) => a + b, 0);
      for (let i = 0; i < lengths.length; i++) {
        if (distance <= lengths[i] || i === lengths.length - 1) {
          const t = Math.min(1, distance / lengths[i]);
          const a = walkPath[i], b = walkPath[i + 1];
          const point=a.map((v, axis) => v + (b[axis] - v) * t);
          point[1]=this.floorAt(point[0],point[2]);
          return { point, yaw: Math.atan2(b[0] - a[0], -(b[2] - a[2])) };
        }
        distance -= lengths[i];
      }
    };
    let standing = 0, walking = false, visible = true, position = [guest.x, 0, guest.z], yaw = guest.side === -1 ? Math.PI : 0;
    if (phase >= 0 && phase < 1) {
      standing = phase;
      position = [guest.x, 0, guest.z + (guest.side * 3.05 - guest.z) * phase];
    } else if (phase >= 1 && phase < 7) {
      standing = 1; walking = true;
      const step = pathPoint((phase - 1) / 6);
      position = [step.point[0], step.point[1] - 4.5, step.point[2]]; yaw = step.yaw;
    } else if (phase >= 7 && phase < 9) visible = false;
    else if (phase >= 9 && phase < 15) {
      standing = 1; walking = true;
      const step = pathPoint(1 - (phase - 9) / 6);
      position = [step.point[0], step.point[1] - 4.5, step.point[2]]; yaw = step.yaw + Math.PI;
    } else if (phase >= 15 && phase < 16) {
      standing = 16 - phase;
      position = [guest.x, 0, guest.side * 3.05 + (guest.z - guest.side * 3.05) * (phase - 15)];
    }
    const speaking = this.line?.speaker === index && this.time < this.line.until;
    const singing = this.line?.kind === 'sing' && !walking && this.time < this.line.until;
    const drinkPhase = (this.time + index * 3.7) % (19 + index % 3);
    const sip = !standing && !speaking && !singing && drinkPhase > 3 && drinkPhase < 6 ? Math.sin((drinkPhase - 3) / 3 * Math.PI) : 0;
    return { ...guest, position, yaw, standing, walking, visible, sip, speaking, singing,
      gesture: speaking || singing ? .5 + .5 * Math.sin(this.time * 3 + index) : 0,
      headTurn: walking ? 0 : Math.sin(this.time * .65 + index) * .18,
      breath: Math.sin(this.time * 1.7 + index) * .06, phase };
  }

  doorOpen() { return this.guests.some(g => { const phase = this.pose(g.index).phase; return phase > 4 && phase < 11; }); }

  canWalk(x,z) {
    // Stay within the cabin and clear of the stove and bench guard rails.
    if (x < 1980 || x > 2019 || z < -12 || z > 12) return false;
    if (x > 2010 && z < -2) return false;
    if (Math.abs(x - 2006) < 2 && Math.abs(z) > 3) return false;
    return true;
  }

  floorAt(x,z) {
    if(x<2007.8) return 4.5;
    if(x<2010.1) return 1+7/3;
    if(x<2012.4) return 1+3.5/3;
    if(z>=10.5 && z<=13.5) return 2.5;
    if(z>=17.5 && z<=20.5) return -1;
    return z>20.5 ? 0 : 1;
  }

  setSound(enabled) {
    this.sound = enabled;
    if (!enabled) { this.stopSound(); return; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      if (!this.audio) this.audio = new AudioContext();
      this.audio.resume().catch(() => {});
    }
  }

  speak(text, index, shout = false) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    window.speechSynthesis.cancel();
    const speech = new window.SpeechSynthesisUtterance(window.LPRI18n?.t(text) ?? text);
    speech.lang = window.LPRI18n?.language === 'en' ? 'en-GB' : 'fi-FI'; speech.rate = .95; speech.pitch = .85 + (index % 4) * .12; speech.volume = .65;
    if (shout) { speech.volume = 1; speech.rate = 1.08; speech.pitch += .15; }
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith(window.LPRI18n?.language ?? 'fi'));
    if (voice) speech.voice = voice;
    window.speechSynthesis.speak(speech);
  }

  sing() {
    this.stopSound();
    if (!this.audio) return;
    // Original short sauna melody, with three softly hummed harmony voices.
    const melody = [261.63, 329.63, 392, 392, 349.23, 329.63, 293.66, 261.63];
    const start = this.audio.currentTime;
    melody.forEach((frequency, i) => {
      for (const ratio of [1, .5, 1.25]) {
        const oscillator = this.audio.createOscillator(), gain = this.audio.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency * ratio;
        gain.gain.setValueAtTime(0, start + i * .48);
        gain.gain.linearRampToValueAtTime(.035, start + i * .48 + .06);
        gain.gain.linearRampToValueAtTime(0, start + i * .48 + .44);
        oscillator.connect(gain); gain.connect(this.audio.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.notes = this.notes.filter(n => n !== oscillator); };
        oscillator.start(start + i * .48); oscillator.stop(start + i * .48 + .46); this.notes.push(oscillator);
      }
    });
  }

  stopSound() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    for (const note of this.notes || []) { try { note.stop(); } catch {} }
    this.notes = [];
  }
};
