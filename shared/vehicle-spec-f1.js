/* Fictional Monaco setup. SI units. Every value is an estimate unless identified
   in tracks/F1-CAR-REFERENCE.md. Never loaded by the Skinnarila entry point. */
(function(root) {
  'use strict';
  const Math=root.LPRMath;
  if(!Math)throw Error('F1 physics requires LPRMath');
  root.LPRVehicleSpec=Object.freeze({
    id:'lpr-f1-monaco-v1',metresPerWorldUnit:.1,
    mass:800,driverMass:80,massWithoutDriver:720,
    wheelbase:3.4,trackWidth:1.525,length:5.2,width:1.9,height:.95,
    frontAxle:3.4*.54,rearAxle:3.4*.46,centreOfMassHeight:.30,
    tyreDiameter:.705,tyreWidth:.375,frontTyreWidth:.285,rearTyreWidth:.375,
    rimDiameter:18*.0254,rimWidth:.25,rimBrand:'LPR',tyreBrand:'LPR slick',
    drivetrain:'RWD',motorPower:735000,motorTorque:650,drivetrainEfficiency:.95,
    maxBatteryPower:735000/.95,motorInverterEfficiency:1,
    finalDriveRatio:4,gearRatios:Object.freeze([5.5,4.3,3.5,2.95,2.55,2.25,1.70,1.45]),
    idleRpm:4000,shiftRpm:12000,maxMotorRpm:12500,shiftSeconds:.045,
    launchForce:8900,launchFadeSpeed:28,launchForceSlope:250,
    airDensity:1.225,downforceArea:4.8,aeroFrontBalance:.46,dragArea:2.2,
    roadGrip:2.2,grassGrip:.60,loadExponent:.90,referenceTyreLoad:1962,
    peakBrakeForce:50000,maxBrakeG:5,brakeBias:.57,lockedGrip:.65,
    rollingResistance:95,coastBrakeForce:180,
    yawInertia:1150,frontCorneringStiffness:190000,rearCorneringStiffness:220000,
    maxRoadWheelAngle:30*Math.PI/180,maxVisualRoadWheelAngle:30*Math.PI/180,
    maxSteeringWheelAngle:180*Math.PI/180,assistedSteeringGrip:.91,fastSteeringGrip:.80,
    suspensionType:'pushrod',bodyLengthScale:5.2/2.9*29/(14.1-.16*1.35+9.64),bodyHeightScale:.95/1.074,
    visualRoadWheelAngle(angle){return angle;},
    roadWheelAngle(angle,side){const tangent=Math.tan(angle);return Math.atan2(this.wheelbase*tangent,this.wheelbase-side*this.trackWidth*tangent/2);}
  });
})(typeof window==='object'?window:globalThis);
