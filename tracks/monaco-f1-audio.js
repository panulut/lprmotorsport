/* Monaco-only combustion/hybrid voice; uses the existing gesture/audio graph. */
(function(root){
 root.LPRGameAudio=class MonacoF1Audio extends root.LPRGameAudio {
  update(car){
   super.update(car);if(!this.master)return;
   const now=this.context.currentTime,rpm=car.engineRpm||4000,throttle=car.throttleInput||0;
   // V6 four-stroke firing order has three firing pulses per crank revolution.
   const pitch=rpm/60*3;
   this.engine.source.frequency.setTargetAtTime(pitch,now,.045);
   this.engineBass.source.frequency.setTargetAtTime(pitch/3,now,.045);
   this.engine.filter.frequency.setTargetAtTime(1400+throttle*1400,now,.08);
  }
 };
})(window);
