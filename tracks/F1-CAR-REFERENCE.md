# Monaco F1-style practice car — reference and implementation plan

This is a fictional LPR Motorsport car inspired by the 2026 dimensions and hybrid
power scale, not a homologated replica or a real team's setup. Base: Monaco
practice 20617a5. Skinnarila's spec, vehicle.js and driving revision remain unchanged.

## Sources (retrieved 2026-11-04)

- [FIA 2026 introduction](https://www.fia.com/news/new-era-competition-fia-showcases-future-focused-formula-1-regulations-2026-and-beyond):
  3400 mm wheelbase, 1900 mm width, original 768 kg minimum; approximately
  400 kW ICE and 350 kW electrical power. This announcement is a dimensional
  reference, not a claim of compliance with the latest complete regulations.
- [Honda AMR26 technical description](https://global.honda/en/F1/machine/2026_AMR26/):
  eight forward gears and carbon braking; used only as architectural reference.
- [BMW 2009 media information](https://www.press.bmwgroup.com/latin-america-caribbean/article/attachment/T0051298EN/75201):
  historical F1.08 0–100 2.75 s, 0–200 5.05 s, 300–200 in 50 m at 4.5 g.
  These are historical comparisons, not measured 2026 performance.
- [FIA Monaco 2025 speed trap](https://www.fia.com/sites/default/files/2025_08_mon_f1_r0_timing_racemaximumspeeds_v01.pdf):
  race maximum 291.5 km/h. The requested long-straight target is 280–295.
- [Brembo Monaco 2026](https://www.brembo.com/en/motorsport/formula1/2026/facts-monaco-2026):
  Sainte Devote 276–132 km/h in 91 m, peak 4 g. Requested 5 g at high speed
  is a gameplay target; a 200–0 stop is a different test and must not be
  presented as a directly equivalent real-world measurement.
- [F1 Monaco active aero explanation](https://www.formula1.com/en/latest/article/explained-why-active-aero-will-not-be-used-at-the-monaco-grand-prix.4nLtpjM9ZTUbPBQLmeAbj4):
  Monaco keeps corner aero and reduces electric deployment above 200 km/h.
  This game deliberately simplifies the hybrid to fixed combined power.

## Initial engineering targets (all tuning values are estimates unless sourced above)

| Quantity | Initial value / target | Basis |
| --- | --- | --- |
| Mass with driver | 800 kg (driver 80 kg) | Requested running mass; estimate, not minimum regulation mass |
| Wheelbase / overall width / length / height | 3.4 / 1.9 / 5.2 / 0.95 m | FIA wheelbase/width; length/height estimates |
| Axle track / front static weight | 1.55 m / 46% | Estimate |
| Tyre diameter / width front, rear | 0.705 m / 0.285, 0.375 m | Nominal presentation estimates |
| Rim diameter / width | 18 inch / 0.25 m | Estimate |
| Combined crank power / efficiency | 735 kW / 95% | Requested simplified hybrid; estimate |
| Transmission | RWD, 8 automatic gears | Honda architecture; ratios calibrated in spec |
| Operating revs | 4000 idle, 12000 shift, 12500 limit rpm | Game/audio estimate |
| Aero | 0.5 rho ClA v²; rho 1.225 kg/m³, ClA initially 7 m² | High-downforce estimate, calibrated by tests |
| Aero front balance | 46% | Estimate |
| Drag | Separate 0.5 rho CdA v², CdA initially 2.2 m² | Estimate, calibrated for 280–295 km/h |
| Tyres | Load sensitivity exponent 0.9, reference 1962 N per tyre; low-speed mu initially 2.2 | Estimate, combined-slip force budget |
| Brakes | Carbon-style force demand; cap approximately 5 g at speed | Estimate, grip-limited at low speed |
| Steering | Approximately 30° equivalent road-wheel lock | Estimate; test Fairmont and full collision sweep |
| Aids | TC, ABS, steering assist on by default; independently switchable | Gameplay; actual F1 forbids TC and ABS |
| Acceleration | 0–100 2.5–3 s; 0–200 5–6 s | Requested acceptance targets |
| Lateral acceleration | 2–2.5 g slow / 4–5 g fast | Requested acceptance targets; report test speeds |
| Bot lap | 70–75 s desired | Requested target; disclose track/controller limitations |

## Plan recorded before implementation

1. Separate spec and deterministic F1 dynamics, loaded exclusively by generated
   monaco.html. Preserve shared/vehicle-spec.js, vehicle.js and the Skinnarila
   revision inputs. Use LPRMath for every physics transcendental.
2. Build repeatable acceleration, terminal speed, braking, steady corner,
   whole main/pit collision hull, actual-input bot lap and bit-identical input
   replay tests. Record measured outputs here, including misses.
3. Add an independent F1 mesh with halo, front/rear wings, sidepods and wider tyres
   in existing LPR green/carbon colours. Keep Skinnarila renderer geometry covered.
4. Add Monaco aid controls, invalidate a lap if aids change, store aid metadata
   with each record, and isolate storage from the old Formula Student laps.
5. Run all existing suites and new tests. Report WebGL/browser/mobile/gamepad/audio
   checks actually performed, and clearly leave unperformed manual checks to Panu.

## Results

Measured locally with Node 24.22.1, 120 Hz, all aids on unless stated:

| Test | Result | Interpretation |
| --- | --- | --- |
| 0–100 km/h | 2.7417 s | In requested 2.5–3 s range |
| 0–200 km/h | 5.4667 s | In requested 5–6 s range |
| Terminal speed, 60 s straight | 286.3995 km/h, gear 8 | In requested 280–295 range; eighth-gear rev limit |
| 200–0 km/h | 46.0258 m, 1.9333 s | Synthetic full stop; not Brembo's different corner test |
| Peak braking in that stop | 4.9336 g | Includes drag; tyre limited as aero falls |
| Steady corner rig, 60 km/h | 2.0448 g | In requested slow range; longitudinal speed held externally |
| Steady corner rig, 240 km/h | 4.1541 g | In requested fast range; stable yaw, body slip below 0.1 rad |
| Downforce speed doubling | Exactly 4× force | Front 46%, rear 54%; separate drag force |
| Main route / pit hull sweeps | All clear | 960 main segments; pit centre and ±0.8 m offsets |
| Repeat input sequence | Bit-identical numeric state at every tick | Two isolated VMs, 3600 ticks; includes suspension and gear state |
| Bot, all aids on | 93.7917 s (1:33.792), zero contacts | Input-only follower; 247.62 km/h peak, 2.59 g peak, 2.65 m maximum centreline error |

On 2026-11-04 Panu clarified that the bot should establish a clean completed
lap, not chase 70–75 s. Human lap pace and handling will be calibrated from his
browser driving feedback. The slow bot is not a claim about a skilled human's
maximum pace. The regression envelope is 80–110 s and zero wall contacts.

The corner rig deliberately holds forward speed so it measures sustained tyre
forces independently of throttle skill. It does not impose lateral velocity, yaw
or pose; measured tyre-force g is checked against centripetal g. The bot never
sets pose or velocity after launch.

## Final spec values and provenance

This exhaustive serialized spec is the source of the implementation values. All
values below are **engineering/game estimates**, except the 3.4 m wheelbase and
1.9 m width inspired by the cited FIA announcement and the eight-gear RWD
architecture described above. In particular, power is a simplified constant
hybrid ceiling, mass is a requested running-mass estimate, gearing and aero are
calibration values, and no tyre manufacturer supplies these grip coefficients.
The legacy compatibility scales are unused by the new visible/collision mesh.

```json
{
  "id": "lpr-f1-monaco-v1",
  "metresPerWorldUnit": 0.1,
  "mass": 800,
  "driverMass": 80,
  "massWithoutDriver": 720,
  "wheelbase": 3.4,
  "trackWidth": 1.525,
  "length": 5.2,
  "width": 1.9,
  "height": 0.95,
  "frontAxle": 1.836,
  "rearAxle": 1.564,
  "centreOfMassHeight": 0.3,
  "tyreDiameter": 0.705,
  "tyreWidth": 0.375,
  "frontTyreWidth": 0.285,
  "rearTyreWidth": 0.375,
  "rimDiameter": 0.4572,
  "rimWidth": 0.25,
  "rimBrand": "LPR",
  "tyreBrand": "LPR slick",
  "drivetrain": "RWD",
  "motorPower": 735000,
  "motorTorque": 650,
  "drivetrainEfficiency": 0.95,
  "maxBatteryPower": 773684.2105263158,
  "motorInverterEfficiency": 1,
  "finalDriveRatio": 4,
  "gearRatios": [
    5.5,
    4.3,
    3.5,
    2.95,
    2.55,
    2.25,
    1.7,
    1.45
  ],
  "idleRpm": 4000,
  "shiftRpm": 12000,
  "maxMotorRpm": 12500,
  "shiftSeconds": 0.045,
  "launchForce": 8900,
  "launchFadeSpeed": 28,
  "launchForceSlope": 250,
  "airDensity": 1.225,
  "downforceArea": 4.8,
  "aeroFrontBalance": 0.46,
  "dragArea": 2.2,
  "roadGrip": 2.2,
  "grassGrip": 0.6,
  "loadExponent": 0.9,
  "referenceTyreLoad": 1962,
  "peakBrakeForce": 50000,
  "maxBrakeG": 5,
  "brakeBias": 0.57,
  "lockedGrip": 0.65,
  "rollingResistance": 95,
  "coastBrakeForce": 180,
  "yawInertia": 1150,
  "frontCorneringStiffness": 190000,
  "rearCorneringStiffness": 220000,
  "maxRoadWheelAngle": 0.5235987755982988,
  "maxVisualRoadWheelAngle": 0.5235987755982988,
  "maxSteeringWheelAngle": 3.141592653589793,
  "assistedSteeringGrip": 0.91,
  "fastSteeringGrip": 0.8,
  "suspensionType": "pushrod",
  "bodyLengthScale": 2.210508416935895,
  "bodyHeightScale": 0.8845437616387336
}
```

The original plan's 7 m² downforce area was reduced to **4.8 m²** after the corner
rig exceeded the requested 4–5 g fast-corner band. Steering utilisation is 0.91
at low speed, tapering to 0.80 from 20 to 60 m/s; this leaves transient grip margin.
The launch map holds 8900 N below 28 m/s and adds 250 N per m/s above that point,
subject to torque, power, gearshift and tyre limits. This is an estimated hybrid
throttle map, used to match both acceleration targets without energy simulation.

## Additional solver and presentation estimates

- Gravity 9.81 m/s²; 120 Hz intended input cadence, maximum per-call step 1/90 s.
- Below 8 m/s, kinematic bicycle motion avoids ill-conditioned low-speed slip
  angles. Above it, front/rear dynamic tyre forces integrate body velocity/yaw.
- Input response 12/s analog, 10/s recentring/reversal, 7/s keyboard turn-in;
  rack smoothing 22/s with 3.5 rad/s rate limit. Steering feedback gain 0.16 s.
- Cornering stiffness scales with total load to exponent 0.75. Tyre force uses
  a smooth tanh curve and combined longitudinal/lateral friction circles.
- TC uses 98% of estimated residual rear-axle capacity. With excess torque and
  TC off, rear grip falls to 78%. ABS off uses 57% front brake bias, locked tyre
  friction 65% and remaining lateral force 25%. These are force-capacity
  approximations, not wheel-speed/slip-ratio controllers.
- Downshift threshold 7600 rpm; shifts interrupt drive for 45 ms. Brake has
  priority over throttle; grass multiplies rolling resistance by up to three.
- Quasi-static four-corner loads include 0.30 m CG height, longitudinal and
  lateral load transfer, aero balance and local road height. No dynamic wheel
  hop, suspension bottoming, temperature, tyre wear or energy deployment.
  Display pitch/roll add 0.001 rad per g. Legacy suspension metadata (8 kg
  unsprung mass per corner, 0.7 motion ratio) remains an unused inherited
  compatibility estimate; its wheel-hop integrator is not called.
- Centre-of-mass axle distances give 46/54 static load distribution. Left/right
  load transfer uses the same axle split. All weights remain nonnegative.
- Cosmetic model coordinates, wing chords/heights, halo tube radii, sidepod
  shape, wishbones and mirrors in monaco-f1-renderer.js are authored visual
  estimates. Overall body length 5.2 m and front-wing width 1.9 m are tested;
  tyre identification bands project 1 mm beyond each sidewall.
- Collision uses four body/wing rectangles and four steered tyre rectangles in
  metres, sharing the visible 5.2 m length, 1.9 m width and axle/tyre positions.
  Conservative SAT sweeps retain static-wall sliding from the existing engine.
  No crash deformation mesh is implemented for this first F1 version.
- Audio uses V6 four-stroke firing frequency rpm/20, a lower rpm/60 layer,
  45 ms pitch response, 1400–2800 Hz low-pass. Estimated sound, not a recording.
- Palette is taken directly from the existing renderer: LPR green
  [0.035, 0.62, 0.23], carbon [0.055, 0.075, 0.065], silver and warm white.
  No real-team marks or sponsor textures.

## Verification and remaining manual checks

- All requested legacy suites pass: tools, physics, finish-gate, determinism,
  replay, verified and monaco. Other non-browser package suites were also run.
- Full Skinnarila **amenities** world generation, obstacle/people updates and
  vehicle GPU geometry run in the new integration test as well as Monaco's
  scene. This exercises the sauna/van scope where the earlier regression lived.
- Physics, collision, entry-page script ordering, build assets, aid defaults,
  separate aid-record keys and actual game PB writer metadata are tested.
- **Not tested:** real WebGL drawing, visual/mobile layout, touch driving,
  physical gamepad input, audio playback or browser-to-Node bit parity.
  This environment has no installed Chromium and its download failed. The
  existing browser-based test:admin-language suite is blocked for the same
  reason; it did not report a product assertion failure. GPU tests above use
  mocked GL calls and inspect the generated payloads, not rendered pixels.
- No cloud service was deployed and nothing was merged. The server-side
  Skinnarila revision remains
  3c5237068fcb1c7490b265c20f496b5bd0141815d542a7274518df534ed02346.
- Panu's manual browser drive is the next source for handling, hairpin lock,
  cockpit visibility, mobile controls, sound and realistic human lap-time tuning.
