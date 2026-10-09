/* Simplified dynamic bicycle model. Distances and speeds inside this class are SI units. */
window.VehicleDynamics = class VehicleDynamics {
  constructor() {
    this.parameters = {
      metresPerWorldUnit: 0.1,
      mass: 275,                 // car and driver, kg; provisional until LPR data is available
      wheelbase: 1.63,           // m
      frontAxle: 0.81,           // centre of mass to front axle, m
      rearAxle: 0.82,            // centre of mass to rear axle, m
      trackWidth: 1.2,           // m, provisional tire contact spacing
      yawInertia: 120,           // kg m²
      centreOfMassHeight: 0.29,  // m
      frontCorneringStiffness: 13000, // N/rad, combined front axle
      rearCorneringStiffness: 14000,  // N/rad, combined rear axle
      roadGrip: 1.55,
      grassGrip: 0.58,
      peakDriveForce: 1850,     // N
      peakPower: 60000,         // W
      peakBrakeForce: 3550,     // N
      coastBrakeForce: 420,     // N, game-tuned lift-off braking with stable axle distribution
      tractionControlEnabled: true,
      maxRoadWheelAngle: 0.36,  // rad
      assistedSteeringGrip: 0.9, // fraction of available grip requested at full assisted steering
      dragArea: 0.75,           // CdA, m²
      rollingResistance: 45     // N
    };
  }

  reset(state) {
    state.vx = 0;
    state.vy = 0;
    state.yawRate = 0;
    state.steerAngle = 0;
    state.steer = 0;
    state.lateralG = 0;
    state.longitudinalG = 0;
    state.bodySlip = 0;
    state.tireUse = 0;
    state.torqueScale = 1;
    state.tcActive = false;
    state.speed = 0;
  }

  applyImpact(state, normal) {
    const cos=Math.cos(state.angle), sin=Math.sin(state.angle);
    const worldVx=state.vx*cos-state.vy*sin;
    const worldVy=state.vx*sin+state.vy*cos;
    const normalVelocity=worldVx*normal.x+worldVy*normal.y;
    const impactSpeed=Math.max(0,-normalVelocity);
    // Provisional game damage: energy scales with speed squared. A perpendicular
    // 8 m/s impact disables this lightweight car; parking nudges cause no damage.
    const damage=Math.max(0,impactSpeed**2-2**2)/(8**2-2**2);
    state.damage=Math.min(1,(state.damage || 0)+damage);
    state.crashed=state.damage>=1;
    state.impactSpeed=impactSpeed;
    state.impactEnergy=.5*this.parameters.mass*impactSpeed**2;
    state.impactSide=normal.x*(-sin)+normal.y*cos;
    const vx=(worldVx-normalVelocity*normal.x)*.9;
    const vy=(worldVy-normalVelocity*normal.y)*.9;
    state.vx=state.crashed?0:vx*cos+vy*sin;
    state.vy=state.crashed?0:-vx*sin+vy*cos;
    state.yawRate=0;
    state.speed=Math.hypot(state.vx,state.vy);
    state.bodySlip=Math.atan2(state.vy,Math.max(state.vx,.5));
    state.lateralG=state.longitudinalG=0;
    state.tcActive=false;
    return damage;
  }

  step(state, input, seconds, grassContact) {
    if(state.crashed) return;
    const p = this.parameters;
    const dt = Math.min(seconds, 1 / 90);
    const gravity = 9.81;
    const gas = Math.max(0, Math.min(1, input.gas));
    const throttle = gas*(1-.65*(state.damage || 0));
    const brake = Math.max(0, Math.min(1, input.brake));
    const desiredSteer = Math.max(-1, Math.min(1, input.steer));
    const analog = !!input.analog;
    const grassFraction = Math.max(0, Math.min(1, Number(grassContact) || 0));
    const mu = p.roadGrip + (p.grassGrip - p.roadGrip) * grassFraction;

    // Build lock quickly in tight turns, more gently at speed. Releasing a key
    // or correcting the other way should not leave the old turn held for .4 s.
    const steeringSpeed = Math.max(0, state.vx);
    const speedBlend = Math.min(1, steeringSpeed / 20);
    const reversing = desiredSteer * state.steer < 0;
    const centering = desiredSteer === 0 || reversing;
    const response = analog ? 8 : centering ? 6 : 3.6 - 1.6 * speedBlend;
    // First unwind to centre before building lock in the opposite direction.
    const steerTarget = !analog && reversing ? 0 : desiredSteer;
    const steerChange = steerTarget - state.steer;
    state.steer += Math.max(-response * dt, Math.min(response * dt, steerChange));
    // Keyboard buttons request a turn rate. The steering rack adds a little angle
    // when the car responds less than requested, while keeping lateral demand sane.
    let targetAngle;
    let assistedYawRate = 0;
    if (analog) {
      const mappedSteer = input.wheel ? state.steer : Math.sign(state.steer) * Math.abs(state.steer) ** 1.5;
      targetAngle = mappedSteer * p.maxRoadWheelAngle;
    } else {
      const speed = Math.max(state.vx, 1.5);
      const yawLimit = mu * gravity * p.assistedSteeringGrip / speed;
      // Use the full rack at low speed (about a 4.3 m radius), then reduce
      // steering demand as speed rises to stay within the lateral grip budget.
      const fullLockYawRate = speed * Math.tan(p.maxRoadWheelAngle) / p.wheelbase;
      const targetYawRate = state.steer * Math.min(fullLockYawRate, yawLimit);
      assistedYawRate = targetYawRate;
      // The geometric angle alone underestimates the lock needed when the
      // front tires develop slip. Compensate the front/rear stiffness balance.
      const understeer = p.mass / p.wheelbase *
        (p.rearAxle / p.frontCorneringStiffness - p.frontAxle / p.rearCorneringStiffness);
      const feedForward = Math.atan(p.wheelbase * targetYawRate / speed) + understeer * speed * targetYawRate;
      // Fade the assistance with the requested turn so releasing the keys
      // centres the rack rather than generating an automatic opposite turn.
      const assistance = Math.abs(state.steer);
      targetAngle = feedForward + assistance * .18 * (targetYawRate - state.yawRate);
      targetAngle = Math.max(-p.maxRoadWheelAngle, Math.min(p.maxRoadWheelAngle, targetAngle));
    }
    const rackChange = (targetAngle - state.steerAngle) * (analog ? 1 : 1 - Math.exp(-18 * dt));
    state.steerAngle += Math.max(-2.8 * dt, Math.min(2.8 * dt, rackChange));

    const speed = Math.max(0, state.vx);
    const drag = 0.5 * 1.225 * p.dragArea * speed * speed;
    const rolling = p.rollingResistance * (1 + 2 * grassFraction);
    const rawDriveRequest = throttle * Math.min(p.peakDriveForce, p.peakPower / Math.max(speed, 2));
    // Lift-off braking fades near rest and with pedal input. Use the same
    // grip-aware axle distribution as the brakes rather than unloading and
    // locking the driven rear axle in a corner. This is a gameplay assist.
    const coastBrake = (1 - gas) * p.coastBrakeForce * Math.min(1, speed / 4);
    const brakeRequest = brake * p.peakBrakeForce + (1 - brake) * coastBrake;
    const wheelbase = p.wheelbase;
    // With no wheel-speed measurements, this is a tire-capacity torque limiter rather
    // than a calibrated slip-ratio controller. It leaves lateral grip in reserve.
    const previousTransfer = p.mass * state.longitudinalG * gravity * p.centreOfMassHeight / wheelbase;
    const estimatedRearLoad = Math.max(100, p.mass * gravity * p.frontAxle / wheelbase + previousTransfer);
    const estimatedRearLimit = mu * estimatedRearLoad;
    const rearSlipAngle = speed >= 1.5 ? Math.atan2(state.vy - p.rearAxle * state.yawRate, speed) : 0;
    const predictedAy = speed * speed * Math.tan(state.steerAngle) / wheelbase;
    const predictedRearFy = p.mass * predictedAy * p.frontAxle / wheelbase;
    const lateralDemand = Math.max(Math.abs(p.rearCorneringStiffness * rearSlipAngle), Math.abs(predictedRearFy) * .65);
    const lateralReserve = Math.min(estimatedRearLimit, lateralDemand);
    const availableDrive = Math.sqrt(Math.max(0, estimatedRearLimit ** 2 - lateralReserve ** 2)) * .95;
    const targetScale = p.tractionControlEnabled && rawDriveRequest > 1 ? Math.min(1, availableDrive / rawDriveRequest) : 1;
    const changeRate = targetScale < state.torqueScale ? 12 : 2.5;
    state.torqueScale += Math.max(-changeRate * dt, Math.min(changeRate * dt, targetScale - state.torqueScale));
    state.tcActive = p.tractionControlEnabled && throttle > .1 && state.torqueScale < .97;
    const driveRequest = rawDriveRequest * state.torqueScale;
    const estimatedAx = (driveRequest - brakeRequest - drag - rolling) / p.mass;
    const transfer = p.mass * estimatedAx * p.centreOfMassHeight / wheelbase;
    const frontLoad = Math.max(100, p.mass * gravity * p.rearAxle / wheelbase - transfer);
    const rearLoad = Math.max(100, p.mass * gravity * p.frontAxle / wheelbase + transfer);
    const frontLimit = mu * frontLoad;
    const rearLimit = mu * rearLoad;

    // Move brake bias forward as braking unloads the rear axle. Reserve rear
    // lateral grip in corners so braking does not remove the stabilizing force.
    const frontBrakeBias = Math.max(.65, Math.min(.90, frontLoad / (frontLoad + rearLoad) + .10));
    const rearBrakeReserve = Math.min(rearLimit * .95, lateralDemand);
    const rearBrakeCapacity = Math.sqrt(Math.max(0, rearLimit ** 2 - rearBrakeReserve ** 2));
    const frontFx = Math.max(-frontLimit, -brakeRequest * frontBrakeBias);
    const rearBrakeForce = Math.min(brakeRequest * (1 - frontBrakeBias), rearBrakeCapacity);
    // Power is provisionally sent to the rear axle.
    const rearFx = Math.max(-rearLimit, Math.min(rearLimit, driveRequest - rearBrakeForce));
    const frontLateralCapacity = Math.sqrt(Math.max(0, frontLimit * frontLimit - frontFx * frontFx));
    const rearLateralCapacity = Math.sqrt(Math.max(0, rearLimit * rearLimit - rearFx * rearFx));

    if (speed < 1.5) {
      const ax = (frontFx + rearFx - drag - rolling) / p.mass;
      state.vx = Math.max(0, Math.min(36, state.vx + ax * dt));
      state.vy *= Math.max(0, 1 - 6 * dt);
      state.yawRate = state.vx * Math.tan(state.steerAngle) / wheelbase;
      state.lateralG = state.vx * state.yawRate / gravity;
      state.longitudinalG = ax / gravity;
      state.tireUse = Math.min(1, Math.abs(state.lateralG) / mu);
    } else {
      const alphaFront = Math.atan2(state.vy + p.frontAxle * state.yawRate, speed) - state.steerAngle;
      const alphaRear = Math.atan2(state.vy - p.rearAxle * state.yawRate, speed);
      const frontFy = -frontLateralCapacity * Math.tanh(p.frontCorneringStiffness * alphaFront / Math.max(frontLateralCapacity, 1));
      const rearFy = -rearLateralCapacity * Math.tanh(p.rearCorneringStiffness * alphaRear / Math.max(rearLateralCapacity, 1));
      const vxDot = (frontFx + rearFx - frontFy * Math.sin(state.steerAngle) - drag - rolling) / p.mass + state.vy * state.yawRate;
      const vyDot = (frontFy * Math.cos(state.steerAngle) + rearFy) / p.mass - state.vx * state.yawRate;
      const yawDot = (p.frontAxle * frontFy * Math.cos(state.steerAngle) - p.rearAxle * rearFy) / p.yawInertia;
      state.vx = Math.max(0, Math.min(36, state.vx + vxDot * dt));
      state.vy = Math.max(-14, Math.min(14, state.vy + vyDot * dt));
      state.yawRate = Math.max(-3, Math.min(3, state.yawRate + yawDot * dt));
      state.lateralG = (frontFy + rearFy) / (p.mass * gravity);
      state.longitudinalG = (frontFx + rearFx - drag - rolling) / (p.mass * gravity);
      state.tireUse = Math.max(Math.hypot(frontFx, frontFy) / Math.max(frontLimit, 1), Math.hypot(rearFx, rearFy) / Math.max(rearLimit, 1));
    }

    // Assisted controls also stabilize the car near the tire limit. This game
    // assist keeps the extra steering authority from becoming a spin; wheels
    // retain the unassisted tire model. Yaw stays within the surface grip limit.
    if (!analog && speed >= 1.5) {
      const stability = 1 - Math.exp(-(5 + 3 * (1 - gas)) * dt);
      state.yawRate += (assistedYawRate - state.yawRate) * stability;
      const surfaceYawLimit = mu * gravity / Math.max(state.vx, 1.5);
      state.yawRate = Math.max(-surfaceYawLimit, Math.min(surfaceYawLimit, state.yawRate));
      const slipLimit = Math.max(1, state.vx) * (.08 + .04 * gas);
      const limitedVy = Math.max(-slipLimit, Math.min(slipLimit, state.vy));
      state.vy += (limitedVy - state.vy) * stability;
    }

    state.angle += state.yawRate * dt;
    const forwardX = Math.cos(state.angle), forwardY = Math.sin(state.angle);
    const worldUnitsPerMetre = 1 / p.metresPerWorldUnit;
    state.x += (state.vx * forwardX - state.vy * forwardY) * dt * worldUnitsPerMetre;
    state.y += (state.vx * forwardY + state.vy * forwardX) * dt * worldUnitsPerMetre;
    state.bodySlip = Math.atan2(state.vy, Math.max(state.vx, 0.5));
    state.speed = Math.hypot(state.vx, state.vy);
  }
};
