/* Monaco-only combustion/hybrid voice; uses the existing gesture/audio graph. */
(function(root){
 // Combustion pulses are sharp, so a V6 has a dense, slowly falling overtone
 // series; the Formula Student motor's near-sine voice reads as a whistle here.
 const ENGINE_HARMONICS=[0,1,.75,.55,.45,.34,.26,.2,.15,.11,.08,.06];
 // Half-order rumble (uneven cylinder pulses) underneath the firing note.
 const RUMBLE_HARMONICS=[0,1,.5,.33,.25,.2,.14];
 root.LPRGameAudio=class MonacoF1Audio extends root.LPRGameAudio {
  update(car){
   super.update(car);if(!this.master)return;
   const ctx=this.context,now=ctx.currentTime,rpm=car.engineRpm||4000,throttle=Math.max(0,(car.throttleInput||0)*(1-(car.brakeInput||0)));
   if(!this.f1Voice){
    const wave=h=>ctx.createPeriodicWave(new Float32Array(h.length),new Float32Array(h));
    this.engine.source.setPeriodicWave(wave(ENGINE_HARMONICS));
    this.engineBass.source.setPeriodicWave(wave(RUMBLE_HARMONICS));
    this.f1Voice=true;
   }
   const driving=!this.paused&&this.enabled&&!car.crashed,load=Math.min(1,Math.max(0,(rpm-4000)/8500));
   // V6 four-stroke firing order has three firing pulses per crank revolution.
   const pitch=rpm/60*3;
   this.engine.source.frequency.setTargetAtTime(pitch,now,.03);
   this.engineBass.source.frequency.setTargetAtTime(pitch/2,now,.03);
   // On throttle the exhaust opens up (brighter, louder); lifting leaves a
   // duller overrun note rather than silence.
   this.engine.filter.frequency.setTargetAtTime(900+throttle*2200+load*900,now,.05);
   this.engineBass.filter.frequency.setTargetAtTime(500+throttle*500,now,.05);
   this.engine.gain.gain.setTargetAtTime(driving?.035+throttle*.075+load*.02:0,now,.05);
   this.engineBass.gain.gain.setTargetAtTime(driving?.04+throttle*.05:0,now,.05);
  }
 };
})(window);
