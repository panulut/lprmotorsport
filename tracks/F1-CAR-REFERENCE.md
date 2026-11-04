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

Pending implementation and calibration. No performance claims yet.
