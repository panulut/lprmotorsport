/* Fictional Monaco setup. SI units. Every value is an estimate unless identified
   in tracks/F1-CAR-REFERENCE.md. Never loaded by the Skinnarila entry point. */
(function(root) {
  'use strict';
  const Math=root.LPRMath;
  if(!Math)throw Error('F1 physics requires LPRMath');
  root.LPRVehicleSpec=Object.freeze({
    // Version, scale and integration guards (SI; intended cadence 120 Hz).
    id:'lpr-f1-monaco-v2',metresPerWorldUnit:.1,gravity:9.81,maxStepSeconds:1/90,
    dynamicMinSpeed:8,maxLateralSpeed:40,maxYawRate:4,minimumForce:1,
    // Running mass, geometry and static axle balance.
    mass:800,driverMass:80,massWithoutDriver:720,
    wheelbase:3.4,trackWidth:1.525,length:5.2,width:1.9,height:.95,
    frontAxle:3.4*.54,rearAxle:3.4*.46,centreOfMassHeight:.30,
    // Tyre and wheel dimensions, shared with the visible and collision meshes.
    tyreDiameter:.705,tyreWidth:.375,frontTyreWidth:.285,rearTyreWidth:.375,
    rimDiameter:18*.0254,rimWidth:.25,rimBrand:'LPR',tyreBrand:'LPR slick',
    // Simplified hybrid power, automatic gearbox and launch map.
    drivetrain:'RWD',motorPower:735000,motorTorque:650,drivetrainEfficiency:.95,
    maxBatteryPower:735000/.95,motorInverterEfficiency:1,
    finalDriveRatio:4,gearRatios:Object.freeze([5.5,4.3,3.5,2.95,2.55,2.25,1.70,1.45]),
    idleRpm:4000,downshiftRpm:7600,shiftRpm:12000,maxMotorRpm:12500,shiftSeconds:.045,
    secondsPerMinute:60,powerSpeedFloor:2,
    launchForce:8900,launchFadeSpeed:28,launchForceSlope:250,damagePowerLoss:.65,
    // Fixed Monaco aero; drag is independent of downforce.
    airDensity:1.225,downforceArea:4.8,aeroFrontBalance:.46,dragArea:2.2,
    // Wider rears give mild limit understeer; load sensitivity is sublinear.
    roadGrip:2.5,grassGrip:.60,loadExponent:.90,referenceTyreLoad:1962,rearGripScale:1.12,
    stiffnessLoadExponent:.75,
    // Front-biased locking without ABS; EBD preserves rear trail-braking grip.
    peakBrakeForce:50000,maxBrakeG:5,brakeBias:.62,lockedGrip:.65,lockedLateralGrip:.25,
    absRearUse:.7,absRearFloor:.15,absActiveThreshold:.01,
    // Street-circuit barriers forgive more than Skinnarila's: damage starts at a
    // perpendicular 4 m/s (tyre stacks 6) and disables the car at 15 m/s (24), so
    // a brushed wall or one moderate hit no longer ends the run.
    wallDamageFreeSpeed:4,wallDisablingSpeed:15,tyreWallDamageFreeSpeed:6,tyreWallDisablingSpeed:24,
    // Lift-off deceleration loads the front gently; grass adds rolling drag.
    rollingResistance:95,grassRollingGain:2,coastBrakeForce:500,coastFadeSpeed:4,
    // Progressive combined-slip rear breakaway, not an instantaneous grip switch.
    tcReserve:.98,tcSlipLimit:.08,tcActiveForce:1,
    wheelspinExcessRange:.8,wheelspinBuildSeconds:.22,wheelspinRecoverySeconds:.30,wheelspinGripLoss:.22,
    // Axle tyre stiffness and yaw inertia. Stiffness follows each axle's load.
    yawInertia:1150,frontCorneringStiffness:190000,rearCorneringStiffness:220000,
    maxRoadWheelAngle:30*Math.PI/180,maxVisualRoadWheelAngle:30*Math.PI/180,
    // Keyboard: lock builds with hold time (a short 0.16 s soft start keeps taps
    // small), so a held key doses the corner; ~0.25 s to full lock in a hairpin,
    // ~0.4 s at speed. At speed a progressive response curve keeps short taps
    // as fine corrections: a 0.3 s tap at 220 km/h turns the car ~5° rather than
    // ~17°, which sent keyboard drivers weaving into the walls. Monotone unwind.
    keyboardSpeedRange:60,keyboardSlowRate:5,keyboardFastRate:2.5,
    keyboardInitialRate:.3,keyboardHoldRampSeconds:.16,keyboardHoldMax:1,
    // Release unwinds ~0.2 s from full lock in a hairpin and ~0.25 s at speed,
    // so a released key stops the rotation instead of carrying the car on.
    keyboardSlowReturnRate:5,keyboardFastReturnRate:4,keyboardSlowLinear:1,keyboardFastLinear:.45,
    analogSteerRate:12,rackResponse:22,rackRate:3.5,
    // Assist requests achievable yaw; feedback may not reverse the driver's sign.
    maxSteeringWheelAngle:180*Math.PI/180,assistedSteeringGrip:.91,fastSteeringGrip:.85,
    assistFadeStart:20,assistFadeRange:40,assistSpeedFloor:1.5,assistYawFeedback:.16,bodySlipSpeedFloor:.5,
    // Road-load approximation: filtered grade curvature plus individual contact
    // velocity. Bounds keep crests/kerbs modest; history advances once per step.
    roadSlopeResponseSeconds:.08,roadLoadResponseSeconds:.07,
    roadVerticalAccelerationLimit:1.3,roadContactDamping:650,roadContactLoadFraction:.06,
    // Sprung-body presentation: a stiff F1 still pitches ~1.3° at 5 g braking and
    // rolls ~1.4° at 4 g, through a lightly underdamped ~2.2 Hz spring with inertia.
    // Visual only: tyre loads remain the quasi-static transfer above.
    bodyPitchPerG:.0045,bodyRollPerG:.006,bodyMotionHz:2.2,bodyMotionDamping:.5,
    // Legacy presentation compatibility; F1 meshes use actual SI dimensions.
    suspensionType:'pushrod',bodyLengthScale:5.2/2.9*29/(14.1-.16*1.35+9.64),bodyHeightScale:.95/1.074,
    visualRoadWheelAngle(angle){return angle;},
    roadWheelAngle(angle,side){const tangent=Math.tan(angle);return Math.atan2(this.wheelbase*tangent,this.wheelbase-side*this.trackWidth*tangent/2);}
  });
})(typeof window==='object'?window:globalThis);
