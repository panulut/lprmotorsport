/* Simplified dynamic bicycle model. Distances and speeds inside this class are SI units. */
window.VehicleDynamics = class VehicleDynamics {
  constructor() {
    this.parameters = {
      metresPerWorldUnit: 0.1,
      mass: 275,                 // car and driver, kg; provisional until LPR data is available
      wheelbase: 1.63,           // m
      frontAxle: 0.81,           // centre of mass to front axle, m
      rearAxle: 0.82,            // centre of mass to rear axle, m
      yawInertia: 120,           // kg m²
      centreOfMassHeight: 0.29,  // m
      frontCorneringStiffness: 13000, // N/rad, combined front axle
      rearCorneringStiffness: 14000,  // N/rad, combined rear axle
      roadGrip: 1.55,
      grassGrip: 0.58,
      peakDriveForce: 1850,     // N
      peakPower: 60000,         // W
      peakBrakeForce: 3550,     // N
      tractionControlEnabled: true,
      maxRoadWheelAngle: 0.36,  // rad
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

  step(state, input, seconds, offroad) {
    const p = this.parameters;
    const dt = Math.min(seconds, 1 / 90);
    const gravity = 9.81;
    const throttle = Math.max(0, Math.min(1, input.gas));
    const brake = Math.max(0, Math.min(1, input.brake));
    const desiredSteer = Math.max(-1, Math.min(1, input.steer));
    const analog = !!input.analog;
    const mu = offroad ? p.grassGrip : p.roadGrip;

    // Digital buttons need a progressive steering rack; wheel input stays direct.
    const response = analog ? 8 : 2.4;
    const steerError = desiredSteer - state.steer;
    state.steer += Math.max(-response * dt, Math.min(response * dt, steerError));
    // Keyboard buttons request a turn rate. The steering rack adds a little angle
    // when the car responds less than requested, while keeping lateral demand sane.
    let targetAngle;
    if (analog) {
      const mappedSteer = input.wheel ? state.steer : Math.sign(state.steer) * Math.abs(state.steer) ** 1.5;
      targetAngle = mappedSteer * p.maxRoadWheelAngle;
    } else {
      const speed = Math.max(state.vx, 1.5);
      const yawLimit = mu * gravity * .75 / speed;
      const targetYawRate = state.steer * Math.min(speed / 20, yawLimit);
      const feedForward = Math.atan(p.wheelbase * targetYawRate / speed);
      targetAngle = feedForward + .10 * (targetYawRate - state.yawRate) - .10 * state.bodySlip;
      targetAngle = Math.max(-p.maxRoadWheelAngle, Math.min(p.maxRoadWheelAngle, targetAngle));
    }
    state.steerAngle += Math.max(-2.8 * dt, Math.min(2.8 * dt, targetAngle - state.steerAngle));

    const speed = Math.max(0, state.vx);
    const drag = 0.5 * 1.225 * p.dragArea * speed * speed;
    const rolling = p.rollingResistance * (offroad ? 3 : 1);
    const rawDriveRequest = throttle * Math.min(p.peakDriveForce, p.peakPower / Math.max(speed, 2));
    const brakeRequest = brake * p.peakBrakeForce;
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

    // Braking uses both axles. Power is provisionally sent to the rear axle.
    const frontFx = Math.max(-frontLimit, -brakeRequest * 0.58);
    const rearFx = Math.max(-rearLimit, Math.min(rearLimit, driveRequest - brakeRequest * 0.42));
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

    state.angle += state.yawRate * dt;
    const forwardX = Math.cos(state.angle), forwardY = Math.sin(state.angle);
    const worldUnitsPerMetre = 1 / p.metresPerWorldUnit;
    state.x += (state.vx * forwardX - state.vy * forwardY) * dt * worldUnitsPerMetre;
    state.y += (state.vx * forwardY + state.vy * forwardX) * dt * worldUnitsPerMetre;
    state.bodySlip = Math.atan2(state.vy, Math.max(state.vx, 0.5));
    state.speed = Math.hypot(state.vx, state.vy);
  }
};
