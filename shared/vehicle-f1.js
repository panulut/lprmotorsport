/* Deterministic 120 Hz Monaco-only bicycle dynamics. The legacy dynamics are
   inherited only for reset/impact APIs; no legacy parameters are mutated. */
(function(root){
  'use strict';
  const Math=root.LPRMath,spec=root.LPRVehicleSpec;
  if(!Math||spec.id!=='lpr-f1-monaco-v2')throw Error('F1 spec/LPRMath missing');
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),g=spec.gravity;
  root.VehicleDynamics=class MonacoF1Dynamics extends root.VehicleDynamics {
    constructor(){
      super();Object.assign(this.parameters,spec,{peakPower:spec.motorPower*spec.drivetrainEfficiency,
        maxSpeed:spec.maxMotorRpm*2*Math.PI/spec.secondsPerMinute/(spec.finalDriveRatio*spec.gearRatios[spec.gearRatios.length-1])*spec.tyreDiameter/2,
        tractionControlEnabled:true});
      this.aids={tc:true,abs:true,steering:true,...root.LPRF1Aids?.value};
    }
    reset(s){super.reset(s);s.gear=1;s.engineRpm=spec.idleRpm;s.shiftRemaining=0;s.absActive=false;s.downforce=0;s.frontAeroLoad=0;s.rearAeroLoad=0;s.f1=true;s.tcEnabled=this.aids?.tc??true;
      s.steerHold=0;s.rearSlip=0;s.bodyPitch=0;s.bodyPitchRate=0;s.bodyRoll=0;s.bodyRollRate=0;s.frontLocked=false;s.rearLocked=false;
      s.roadLoadScale=1;s.roadVerticalAcceleration=0;s.roadFilteredSlope=null;s.roadLoadHeights=null;s.roadContactLoads=[0,0,0,0];
    }
    // Update road history exactly once per physics tick. Presentation and bot
    // capacity queries may call stepSuspension repeatedly without changing it.
    sampleRoadLoads(s,dt){
      const p=this.parameters,h=s.roadHeights||[0,0,0,0];
      const slope=s.terrainSlope?.forward??((h[0]+h[1]-h[2]-h[3])/(2*p.wheelbase));
      if(s.roadFilteredSlope===null||!s.roadLoadHeights){
        s.roadFilteredSlope=slope;s.roadLoadHeights=h.slice();return;
      }
      const old=s.roadFilteredSlope;
      s.roadFilteredSlope+=(slope-old)*(1-Math.exp(-dt/p.roadSlopeResponseSeconds));
      const acceleration=clamp(s.vx*(s.roadFilteredSlope-old)/dt,-p.roadVerticalAccelerationLimit,p.roadVerticalAccelerationLimit);
      const blend=1-Math.exp(-dt/p.roadLoadResponseSeconds);
      s.roadVerticalAcceleration+=(acceleration-s.roadVerticalAcceleration)*blend;
      s.roadLoadScale=1+s.roadVerticalAcceleration/g;
      const velocities=h.map((v,i)=>(v-s.roadLoadHeights[i])/dt),mean=velocities.reduce((a,b)=>a+b,0)/4;
      const bound=p.mass*g/4*p.roadContactLoadFraction;
      const contact=velocities.map(v=>(v-mean)*p.roadContactDamping);
      const contactScale=Math.min(1,bound/Math.max(p.minimumForce,...contact.map(v=>Math.abs(v))));
      s.roadContactLoads=contact.map((v,i)=>s.roadContactLoads[i]+(v*contactScale-s.roadContactLoads[i])*blend);
      s.roadLoadHeights=h.slice();
    }
    // Quasi-static four-corner loads: terrain height, longitudinal/lateral weight
    // transfer and aero axle balance. No tyre temperatures, wear or wheel hop.
    stepSuspension(s,dt){
      const p=this.parameters,b=s.suspension||this.createSuspension(s),h=s.roadHeights||[0,0,0,0];
      const aero=.5*p.airDensity*p.downforceArea*s.vx*s.vx;
      const transfer=p.mass*(s.longitudinalG||0)*g*p.centreOfMassHeight/p.wheelbase;
      const front=clamp(p.mass*g*s.roadLoadScale*p.rearAxle/p.wheelbase-transfer,0,p.mass*g*s.roadLoadScale)+aero*p.aeroFrontBalance;
      const rear=p.mass*g*s.roadLoadScale-front+aero;
      const lateral=p.mass*(s.lateralG||0)*g*p.centreOfMassHeight/p.trackWidth;
      for(let i=0;i<4;i++){
        const share=i<2?p.aeroFrontBalance:1-p.aeroFrontBalance;
        const axle=i<2?front:rear,shift=clamp(lateral*share,-axle/2,axle/2);
        b.wheels[i].load=Math.max(0,axle/2+(i%2?shift:-shift)+s.roadContactLoads[i]);
        b.wheels[i].road=h[i];b.wheels[i].z=h[i];b.wheels[i].travel=0;
      }
      b.heave=((h[0]+h[1])*p.rearAxle+(h[2]+h[3])*p.frontAxle)/(2*p.wheelbase);
      // Terrain attitude plus the sprung body's own pitch (nose down under braking)
      // and roll (outward in a corner), integrated once per tick in stepBody.
      b.pitch=((h[0]+h[1]-h[2]-h[3])/2)/p.wheelbase+(s.bodyPitch||0);
      b.roll=(h[1]+h[3]-h[0]-h[2])/(2*p.trackWidth)+(s.bodyRoll||0);
      s.downforce=aero;s.frontAeroLoad=aero*p.aeroFrontBalance;s.rearAeroLoad=aero*(1-p.aeroFrontBalance);
    }
    // Second-order spring-damper toward the g-load attitude (semi-implicit
    // Euler, stable at the 120 Hz cadence), so the body has inertia and settles.
    stepBody(s,dt){
      const p=this.parameters,w=2*Math.PI*p.bodyMotionHz,z=p.bodyMotionDamping;
      for(const [k,r,target] of [['bodyPitch','bodyPitchRate',(s.longitudinalG||0)*p.bodyPitchPerG],['bodyRoll','bodyRollRate',(s.lateralG||0)*p.bodyRollPerG]]){
        s[r]+=(w*w*(target-s[k])-2*z*w*s[r])*dt;s[k]+=s[r]*dt;
      }
    }
    // Same impulse and wall-friction response as the legacy car, with Monaco's
    // more forgiving damage thresholds (see wallDamageFreeSpeed in the spec).
    applyImpact(state,normal,impactMaterial,contact){
      const p=this.parameters,cos=Math.cos(state.angle),sin=Math.sin(state.angle);
      const worldVx=state.vx*cos-state.vy*sin,worldVy=state.vx*sin+state.vy*cos;
      const normalVelocity=worldVx*normal.x+worldVy*normal.y;
      const impactSpeed=contact?.impulse!==undefined?contact.impulse/p.mass:Math.max(0,-normalVelocity);
      const tyres=impactMaterial==='tyres',free=tyres?p.tyreWallDamageFreeSpeed:p.wallDamageFreeSpeed,disabling=tyres?p.tyreWallDisablingSpeed:p.wallDisablingSpeed;
      const damage=Math.max(0,impactSpeed*impactSpeed-free*free)/(disabling*disabling-free*free);
      state.damage=Math.min(1,(state.damage||0)+damage);state.crashed=state.damage>=1;
      state.impactSpeed=impactSpeed;state.impactEnergy=.5*p.mass*impactSpeed*impactSpeed;state.impactSide=normal.x*(-sin)+normal.y*cos;
      const tangentVx=worldVx-normalVelocity*normal.x,tangentVy=worldVy-normalVelocity*normal.y;
      const retention=Math.max(0,1-.15*impactSpeed/Math.max(Math.hypot(tangentVx,tangentVy),1e-12));
      const remainingNormal=normalVelocity+impactSpeed;
      const vx=tangentVx*retention+remainingNormal*normal.x,vy=tangentVy*retention+remainingNormal*normal.y;
      state.vx=state.crashed?0:vx*cos+vy*sin;state.vy=state.crashed?0:-vx*sin+vy*cos;
      state.yawRate=0;state.speed=Math.hypot(state.vx,state.vy);state.bodySlip=Math.atan2(state.vy,Math.max(state.vx,.5));
      state.lateralG=state.longitudinalG=0;state.tcActive=false;
      return damage;
    }
    capacities(s,grass=0){
      const p=this.parameters,mu=p.roadGrip+(p.grassGrip-p.roadGrip)*clamp(grass,0,1);
      return [0,2].map(i=>(i?p.rearGripScale:1)*s.suspension.wheels.slice(i,i+2).reduce((sum,w)=>sum+mu*p.referenceTyreLoad*Math.pow(Math.max(0,w.load)/p.referenceTyreLoad,p.loadExponent),0));
    }
    step(s,input,seconds,grass=0){
      if(s.crashed||seconds<=0)return;
      const p=this.parameters,dt=clamp(seconds,0,p.maxStepSeconds),speed=Math.max(0,s.vx);
      const tc=input.tc??this.aids.tc,abs=input.abs??this.aids.abs,assisted=(input.steeringAssist??this.aids.steering)&&!input.wheel;
      s.tcEnabled=tc;this.parameters.tractionControlEnabled=tc;
      this.sampleRoadLoads(s,dt);this.stepSuspension(s,dt);
      const [frontLimit,rearLimit]=this.capacities(s,grass),capacity=frontLimit+rearLimit;
      const gas=clamp(input.gas||0,0,1),brake=clamp(input.brake||0,0,1);
      const throttle=gas*(1-brake)*(1-p.damagePowerLoss*(s.damage||0));
      // Keys build lock progressively, like a driver's hands winding on: a tap is a
      // small correction, a held key accelerates, and lock builds more slowly at speed.
      // Reversing first unwinds to centre, as the Formula Student car does.
      const steer=clamp(input.steer||0,-1,1),reversing=steer*s.steer<0,centering=steer===0||reversing;
      s.steerHold=input.analog||centering?0:Math.min(p.keyboardHoldMax,(s.steerHold||0)+dt);
      const speedBlend=clamp(speed/p.keyboardSpeedRange,0,1);
      const rate=input.analog?p.analogSteerRate:centering?p.keyboardSlowReturnRate+(p.keyboardFastReturnRate-p.keyboardSlowReturnRate)*speedBlend:
        (p.keyboardSlowRate+(p.keyboardFastRate-p.keyboardSlowRate)*speedBlend)*Math.min(1,p.keyboardInitialRate+s.steerHold/p.keyboardHoldRampSeconds);
      s.steer+=clamp((!input.analog&&reversing?0:steer)-s.steer,-rate*dt,rate*dt);
      const linear=p.keyboardSlowLinear+(p.keyboardFastLinear-p.keyboardSlowLinear)*speedBlend;
      const demand=input.analog?s.steer:s.steer*(linear+(1-linear)*Math.abs(s.steer));
      let target=demand*p.maxRoadWheelAngle;
      if(assisted){
        const v=Math.max(speed,p.assistSpeedFloor),desired=demand*Math.min(v*Math.tan(p.maxRoadWheelAngle)/p.wheelbase,Math.min(frontLimit/p.aeroFrontBalance,rearLimit/(1-p.aeroFrontBalance))/p.mass*(p.assistedSteeringGrip+(p.fastSteeringGrip-p.assistedSteeringGrip)*clamp((speed-p.assistFadeStart)/p.assistFadeRange,0,1))/v);
        const stiffnessScale=Math.max(1,Math.pow((p.mass*g+s.downforce)/(p.mass*g),p.stiffnessLoadExponent));
        const under=p.mass/p.wheelbase/stiffnessScale*(p.rearAxle/p.frontCorneringStiffness-p.frontAxle/p.rearCorneringStiffness);
        target=clamp(Math.atan(p.wheelbase*desired/v)+under*v*desired+Math.abs(demand)*p.assistYawFeedback*(desired-s.yawRate),-p.maxRoadWheelAngle,p.maxRoadWheelAngle);
      }
      // Neither yaw feedback nor key release can request opposite lock. The
      // physical rack may unwind only toward zero until the key changes sign.
      target=demand>0?clamp(target,0,p.maxRoadWheelAngle):demand<0?clamp(target,-p.maxRoadWheelAngle,0):0;
      if(centering&&!input.analog)target=clamp(target,Math.min(0,s.steerAngle),Math.max(0,s.steerAngle));
      s.steerAngle+=clamp((target-s.steerAngle)*(1-Math.exp(-p.rackResponse*dt)),-p.rackRate*dt,p.rackRate*dt);
      // The exponential rack never quite reaches zero; snap a microradian residue.
      if(target===0&&Math.abs(s.steerAngle)<1e-6)s.steerAngle=0;
      const rpmFor=gear=>speed/(p.tyreDiameter/2)*p.finalDriveRatio*p.gearRatios[gear-1]*p.secondsPerMinute/(2*Math.PI);
      s.shiftRemaining=Math.max(0,s.shiftRemaining-dt);
      if(!s.shiftRemaining&&s.gear<p.gearRatios.length&&rpmFor(s.gear)>p.shiftRpm){s.gear++;s.shiftRemaining=p.shiftSeconds;}
      if(!s.shiftRemaining&&s.gear>1&&rpmFor(s.gear)<p.downshiftRpm){s.gear--;s.shiftRemaining=p.shiftSeconds;}
      s.engineRpm=clamp(rpmFor(s.gear),p.idleRpm,p.maxMotorRpm);
      const gearForce=p.motorTorque*p.finalDriveRatio*p.gearRatios[s.gear-1]*p.drivetrainEfficiency/(p.tyreDiameter/2);
      const launch=p.launchForce+(Math.max(0,speed-p.launchFadeSpeed)*p.launchForceSlope);
      const rawDrive=s.shiftRemaining?0:throttle*Math.min(gearForce,p.peakPower/Math.max(speed,p.powerSpeedFloor),launch);
      const axleLoads=[0,2].map(i=>s.suspension.wheels[i].load+s.suspension.wheels[i+1].load);
      const frontStiffness=p.frontCorneringStiffness*Math.pow(axleLoads[0]/(p.mass*g*p.rearAxle/p.wheelbase),p.stiffnessLoadExponent);
      const rearStiffness=p.rearCorneringStiffness*Math.pow(axleLoads[1]/(p.mass*g*p.frontAxle/p.wheelbase),p.stiffnessLoadExponent);
      const rearAlpha=speed>=p.dynamicMinSpeed?Math.atan2(s.vy-p.rearAxle*s.yawRate,speed):0;
      const rearDemand=rearLimit*Math.abs(Math.tanh(rearStiffness*rearAlpha/Math.max(rearLimit,p.minimumForce)));
      const residual=Math.sqrt(Math.max(0,rearLimit*rearLimit-rearDemand*rearDemand));
      const excess=clamp((rawDrive/Math.max(residual,p.minimumForce)-1)/p.wheelspinExcessRange,0,1);
      const slipTarget=tc?excess*p.tcSlipLimit:excess;
      const slipTime=slipTarget>s.rearSlip?p.wheelspinBuildSeconds:p.wheelspinRecoverySeconds;
      s.rearSlip+=(slipTarget-s.rearSlip)*(1-Math.exp(-dt/slipTime));
      const rearGrip=rearLimit*(1-p.wheelspinGripLoss*s.rearSlip);
      const available=Math.sqrt(Math.max(0,rearGrip*rearGrip-Math.min(rearDemand,rearGrip)**2))*p.tcReserve;
      const drive=tc?Math.min(rawDrive,available):Math.min(rawDrive,rearGrip);
      s.tcActive=tc&&rawDrive>available+p.tcActiveForce;s.torqueScale=rawDrive>0?drive/rawDrive:1;
      const drag=.5*p.airDensity*p.dragArea*speed*speed,rolling=p.rollingResistance*(1+p.grassRollingGain*grass);
      const brakeRequest=Math.min(brake*p.peakBrakeForce,p.mass*g*p.maxBrakeG)+(1-gas)*(1-brake)*p.coastBrakeForce*Math.min(1,speed/p.coastFadeSpeed);
      // ABS (with EBD) keeps the rears below the friction left after their cornering
      // demand, so they keep side grip under trail braking; the fronts take the rest.
      // A small floor keeps the car slowing in a limit corner instead of coasting.
      const rearRoom=Math.max(Math.sqrt(Math.max(0,rearGrip*rearGrip-rearDemand*rearDemand))*p.absRearUse,rearGrip*p.absRearFloor);
      const absRear=Math.min(brakeRequest*rearGrip/Math.max(capacity,p.minimumForce),rearRoom);
      const requests=abs?[brakeRequest-absRear,absRear]:[brakeRequest*p.brakeBias,brakeRequest*(1-p.brakeBias)];
      const locks=[!abs&&requests[0]>frontLimit,!abs&&requests[1]>rearGrip];
      s.frontLocked=locks[0];s.rearLocked=locks[1];
      const limits=[frontLimit*(locks[0]?p.lockedGrip:1),rearGrip*(locks[1]?p.lockedGrip:1)];
      let fx=[-Math.min(requests[0],limits[0]),drive-Math.min(requests[1],limits[1])];
      s.absActive=abs&&brake>p.absActiveThreshold&&brakeRequest>capacity;
      let fy=[0,0];
      if(speed>=p.dynamicMinSpeed){
        const alpha=Math.atan2(s.vy+p.frontAxle*s.yawRate,speed)-s.steerAngle;
        fy=[-limits[0]*Math.tanh(frontStiffness*alpha/Math.max(limits[0],p.minimumForce)),
          -limits[1]*Math.tanh(rearStiffness*rearAlpha/Math.max(limits[1],p.minimumForce))];
        for(let i=0;i<2;i++){if(locks[i])fy[i]*=p.lockedLateralGrip;const scale=Math.min(1,limits[i]/Math.max(p.minimumForce,Math.hypot(fx[i],fy[i])));fx[i]*=scale;fy[i]*=scale;}
      }
      const c=Math.cos(s.steerAngle),sn=Math.sin(s.steerAngle),frontFx=fx[0]*c-fy[0]*sn,frontFy=fx[0]*sn+fy[0]*c;
      const grade=s.terrainSlope||{forward:0,right:0},gradeG=g/Math.sqrt(1+grade.forward*grade.forward+grade.right*grade.right);
      const ax=(frontFx+fx[1]-drag-rolling)/p.mass,ay=(frontFy+fy[1])/p.mass;
      s.vx=clamp(s.vx+(ax+s.vy*s.yawRate-grade.forward*gradeG)*dt,0,p.maxSpeed);
      if(speed<p.dynamicMinSpeed){s.yawRate=s.vx*Math.tan(s.steerAngle)/p.wheelbase;s.vy=p.rearAxle*s.yawRate;}
      else{s.vy=clamp(s.vy+(ay-speed*s.yawRate-grade.right*gradeG)*dt,-p.maxLateralSpeed,p.maxLateralSpeed);s.yawRate=clamp(s.yawRate+(p.frontAxle*frontFy-p.rearAxle*fy[1])/p.yawInertia*dt,-p.maxYawRate,p.maxYawRate);}
      s.longitudinalG=ax/g;s.lateralG=speed<p.dynamicMinSpeed?s.vx*s.yawRate/g:ay/g;s.tireUse=Math.max(...fx.map((v,i)=>Math.hypot(v,fy[i])/Math.max(limits[i],p.minimumForce)));
      s.angle+=s.yawRate*dt;const ca=Math.cos(s.angle),sa=Math.sin(s.angle);
      s.x+=(s.vx*ca-s.vy*sa)*dt/p.metresPerWorldUnit;s.y+=(s.vx*sa+s.vy*ca)*dt/p.metresPerWorldUnit;
      s.speed=Math.hypot(s.vx,s.vy);s.bodySlip=Math.atan2(s.vy,Math.max(s.vx,p.bodySlipSpeedFloor));
      this.stepBody(s,dt);this.stepSuspension(s,dt);
    }
  };
})(window);
