// CmSpsVehicle — a simple Command/Service Module model for SPS burns in
// lunar orbit: three-dimensional two-body flight about the Moon, the Service
// Propulsion System (thrust build-up, steady thrust, tail-off), propellant
// use, an attitude that slews toward the commanded thrust direction, and
// accelerometers (PIPAs) that count the sensed, non-gravitational ΔV in
// 5.85 cm/s pulses for the AGC to read.
//
// Default initial state ('loi1'): Apollo 11 approaching the Moon before the
// first Lunar Orbit Insertion burn. The approach hyperbola is defined by the
// pericynthion predicted after the first (and only) translunar midcourse
// correction: 61.5 n mi altitude, 8,334 ft/s, at 075:53:35 GET (Apollo 11
// Mission Report MSC-00171, Table 7-III).
//
// Simplifications (also stated in the UI by the views that show them):
// - Moon point-mass gravity only (no mascons, no Earth/Sun perturbations).
// - The SPS is not throttleable: thrust ramps up linearly over 0.4 s (the
//   delay Comanche allows "FOR THRUST BUILDUP", Comanche055/P40-P47.agc:551-552)
//   and tails off linearly over 1.4 s after the off command.
// - The LOI-1 thrust level and mass flow are effective values derived from
//   the flown burn (see LOI1 below), not from engine data.
// - Attitude is just the thrust axis (body +X); slews are rate-limited.
//
// Second mode ('entry'): a *scripted* Earth entry of the Command Module for
// the P61–P67 milestones — no aerodynamics, just a GET-stamped profile
// (ENTRY below) whose sourced points come from the Mission Report and the
// Entry PAD and whose in-between values are illustrative.
//
// state follows ARCHITECTURE §8 where meaningful; LM-only fields stay
// 0/false. CM extras: r, v, bodyX, pipa, pipaPulses, dvSensed, burnTime,
// propellant, orbit, gimbal; in entry mode `entry` (see entryState()).

import {
  FT, LB, LBF, NMI, G0, MOON_MU, MOON_RADIUS,
} from '../util/units.js';
import { parseGET } from '../util/time.js';

// ---------- historical data (Apollo 11, LOI-1) ----------

export const LOI1 = Object.freeze({
  // Mission Report Table 7-III (translunar maneuver summary), first midcourse
  // correction: resultant pericynthion altitude 61.5 mi (nautical), velocity
  // 8,334 ft/s, arrival time 75:53:35.
  pericynthionGET: parseGET('075:53:35'),
  pericynthionAlt: 61.5 * NMI,
  pericynthionSpeed: 8334 * FT,
  // Mission Report Table A-I (mass properties): lunar orbit insertion
  // ignition 96,061.6 lb, cutoff 72,037.6 lb.
  ignitionMass: 96061.6 * LB,
  cutoffMass: 72037.6 * LB,
  // Mission Report Table 8.6-II: ignition 75:49:50.37, cutoff 75:55:47.90,
  // duration 357.53 s. Table 7-V: velocity change 2,917.5 ft/s; resultant
  // orbit 169.7 x 60.0 mi.
  firingTime: 357.53,
  deltaV: 2917.5 * FT,
  // Section 8.11.1: SPS propellant loaded 40,803 lb. Before LOI the SPS had
  // fired twice (separation 2.93 s, MCC-1 3.13 s); Table A-I mass changes
  // (96,767.5 → 96,566.6 and 96,418.2 → 96,204.2 lb) put about 415 lb of use
  // before LOI, so ≈ 40,388 lb remained (approximate: the mass deltas also
  // contain a little RCS propellant).
  spsLoaded: 40803 * LB,
  spsAtLoi: 40388 * LB,
  // Table 8.6-II engine gimbal position for LOI (deg): initial, steady-state
  // and cutoff, pitch / yaw. Used only as a cosmetic trim history.
  gimbal: { initial: [0.97, -0.15], steady: [1.23, -0.06], cutoff: [2.03, -0.57] },
});

// Effective SPS performance during LOI-1, derived from the numbers above:
// mass flow = Δm / t, effective exhaust velocity = ΔV / ln(m0/mf), thrust =
// ṁ·ve. Result ≈ 30.5 kg/s (67.2 lb/s), ve ≈ 3,090 m/s (Isp ≈ 315 s),
// F ≈ 94,200 N (≈ 21,170 lbf). The nominal SPS thrust in Comanche is 20,500 lbf
// (FENG, Comanche055/P40-P47.agc:320); the Mission Report §8.8 explains the
// higher-than-predicted thrust on LOI (propellant-utilization valve moved to
// "increase") and the 4.5-s shorter firing.
export const LOI1_SPS = (() => {
  const mdot = (LOI1.ignitionMass - LOI1.cutoffMass) / LOI1.firingTime;
  const ve = LOI1.deltaV / Math.log(LOI1.ignitionMass / LOI1.cutoffMass);
  return Object.freeze({ mdot, ve, isp: ve / G0, thrust: mdot * ve });
})();

// SPS start/stop transients (see the header).
export const SPS_RAMP_UP = 0.4;   // s
// Tail-off over 1.4 s delivers 0.7 s worth of full thrust ≈ 2.0 m/s
// (6.6 ft/s) at the LOI-1 cut-off mass — the planned EMS residual for LOI
// was −6.6 ft/s (Mission Report Table 8.6-III) and the PAD's ΔVT − ΔVC was
// 2917.3 − 2910.8 = 6.5 ft/s (AFJ, 072:51:24).
export const SPS_TAILOFF = 1.4;   // s

// CM RCS ullage: two jets, 199.6 lbf each canted 10° (Comanche S40.135
// comment, Comanche055/P40-P47.agc:2032-2035).
export const RCS_ULLAGE_2JET = 2 * 199.6 * Math.cos(10 * Math.PI / 180) * LBF;

// PIPA pulse size of the CM IMU (Comanche055/SERVICER207.agc:186).
export const CM_PIPA_PULSE = 0.0585; // m/s

// ---------- historical data (Apollo 11 entry, scripted) ----------
//
// Sourced points (everything else is illustrative interpolation):
// - Entry interface (400,000 ft) 195:03:05.7, 36,194.4 ft/s, flight-path
//   angle −6.48°, 3.19° S 171.96° E (Mission Report Table 7-VII).
// - Entry PAD (AFJ, Evans 191:43:57, update 194:16:57): 0.05 g 28 s after EI
//   at 36,275 ft/s; EMS range to go 1,403.3 n mi; max g 6.3; VCIRC at
//   EI+2:14; skip drag levels DL max 1.54 g / min 0.84 g; skip velocities
//   VL 22,400 / 18,000 ft/s; drogues at EI+9:02; "You'll get P65, but no P66".
// - First acceleration pulse ≈ 6.5 g, second 6.0 g (Mission Report §4.19;
//   the peak is 6.56 g in §7.5 and 6.51 g in Table 7-VII) — their times are
//   not in the sources: illustrative.
// - PAO, AFJ Day 9 part 2: "Velocity; 33,000 ... 800 nautical miles high ...
//   7 minutes away from entry"; 35,578 ft/s "a minute and 45 seconds from
//   entry".
// - V ≈ 1,000 ft/s at ≈ 65,000 ft at the end of P67 (AFJ commentary).
// - Drogues 195:12:06.9, landing 195:18:35, onboard landing solution
//   13.30° N 169.15° W (Mission Report Table 7-VII, §8.6.7); main chutes
//   reported 195:13:22 (AFJ). CM mass 12,095.5 lb at entry, 11,603.7 at
//   drogues, 11,318.9 at mains, 10,873.0 at landing (Table A-I).
export const ENTRY = Object.freeze({
  eiGET: parseGET('195:03:05.7'),
  sepGET: parseGET('194:49:12.7'),
  // dt from EI (s); v ft/s (inertial); d drag deceleration (g); alt ft;
  // rdot ft/s; rollc deg (0 = lift up); src: 'sourced' | 'illustrative'.
  keyframes: [
    { dt: -1200, v: 30500, d: 0, alt: 9.5e6, rdot: -8000, rollc: 0, src: 'illustrative' },
    { dt: -420, v: 33000, d: 0, alt: 800 * 6076.12, rdot: -8500, rollc: 0, src: 'PAO: 33,000 ft/s, 800 n mi, 7 min before entry' },
    { dt: -105, v: 35578, d: 0, alt: 9.0e5, rdot: -5200, rollc: 0, src: 'PAO: 35,578 ft/s at EI−1:45' },
    { dt: 0, v: 36194.4, d: 0, alt: 400000, rdot: -4085, rollc: 0, src: 'MR Table 7-VII (EI)' },
    { dt: 28, v: 36275, d: 0.05, alt: 297431, rdot: -3200, rollc: 0, src: 'Entry PAD: 0.05 g at EI+0:28, 36,275 ft/s; 297,431 ft = N63 EMS altitude' },
    { dt: 60, v: 34600, d: 3.5, alt: 235000, rdot: -1400, rollc: 40, src: 'illustrative' },
    { dt: 85, v: 31200, d: 6.5, alt: 207000, rdot: -250, rollc: 60, src: 'MR: first pulse ≈ 6.5 g (time illustrative)' },
    { dt: 110, v: 28100, d: 5.0, alt: 198000, rdot: 200, rollc: 70, src: 'illustrative' },
    { dt: 134, v: 25900, d: 3.6, alt: 197000, rdot: 420, rollc: 60, src: 'Entry PAD: VCIRC at EI+2:14 (value illustrative)' },
    { dt: 150, v: 24700, d: 2.4, alt: 203000, rdot: 520, rollc: 20, src: 'illustrative (P65 up control starts)' },
    { dt: 195, v: 23000, d: 1.3, alt: 221000, rdot: 160, rollc: 0, src: 'illustrative (drag stays above Q7: no P66, as the Entry PAD said)' },
    { dt: 240, v: 21300, d: 1.54, alt: 213000, rdot: -420, rollc: 30, src: 'Entry PAD: skip drag level max 1.54 g (time illustrative)' },
    { dt: 300, v: 17400, d: 6.0, alt: 166000, rdot: -1100, rollc: 90, src: 'MR: second pulse 6.0 g (time illustrative)' },
    { dt: 360, v: 10200, d: 4.6, alt: 126000, rdot: -1250, rollc: 110, src: 'illustrative' },
    { dt: 430, v: 3600, d: 2.1, alt: 92000, rdot: -950, rollc: 70, src: 'illustrative' },
    { dt: 470, v: 1000, d: 1.1, alt: 65000, rdot: -780, rollc: 60, src: 'AFJ: ≈ 1,000 ft/s at ≈ 65,000 ft when P67 stops steering (time illustrative)' },
    { dt: 541.2, v: 330, d: 1.0, alt: 24000, rdot: -330, rollc: 60, src: 'MR: drogues 195:12:06.9 (altitude illustrative)' },
    { dt: 616.3, v: 170, d: 1.0, alt: 10500, rdot: -170, rollc: 60, src: 'AFJ: main chutes reported 195:13:22 (altitude illustrative)' },
    { dt: 929.3, v: 0, d: 1.0, alt: 0, rdot: 0, rollc: 60, src: 'MR: landing 195:18:35' },
  ],
  dt05g: 28,                       // s after EI (Entry PAD RET 0.05G)
  dtUpControl: 150,                // s after EI: HUNTEST finds the up-control solution (illustrative)
  dtDrogue: 541.2,                 // s after EI (195:12:06.9)
  rtgo05g: 1403.3,                 // n mi, Entry PAD EMS range to go (update 194:16:57)
  rtgoAtDrogue: 1.7,               // n mi (onboard: 1.69 mi from target)
  eiLatLon: [-3.19, 171.96],       // deg (MR Table 7-VII)
  landingLatLon: [13.30, -169.15], // deg, onboard guidance (MR Table 7-VII)
  massEntry: 12095.5 * LB,
  massDrogue: 11603.7 * LB,
  massMain: 11318.9 * LB,
  massLanding: 10873.0 * LB,
  drogueGET: parseGET('195:12:06.9'),
  mainGET: parseGET('195:13:22'),
  landingGET: parseGET('195:18:35'),
});

// Interpolated entry state at GET t (piecewise linear between keyframes —
// a display-level approximation, not a trajectory).
export function entryState(t) {
  const k = ENTRY.keyframes;
  const dt = t - ENTRY.eiGET;
  let i = 0;
  while (i < k.length - 2 && dt > k[i + 1].dt) i += 1;
  const a = k[i];
  const b = k[i + 1];
  const f = Math.max(0, Math.min(1, (dt - a.dt) / (b.dt - a.dt)));
  const lerp = (x, y) => x + (y - x) * f;
  const v = lerp(a.v, b.v);
  const d = lerp(a.d, b.d);
  const alt = lerp(a.alt, b.alt);
  const rdot = lerp(a.rdot, b.rdot);
  const rollc = lerp(a.rollc, b.rollc);
  // Range to go: the Entry PAD's EMS range at 0.05 g (1,403.3 n mi), then
  // reduced in proportion to the distance flown so that the onboard solution
  // is 1.7 n mi from the target at drogue deployment. Frozen after drogues.
  const d05 = entryDistance(ENTRY.dt05g);
  const dDrogue = entryDistance(ENTRY.dtDrogue);
  const flown = Math.min(entryDistance(dt), dDrogue);
  const scaleK = (ENTRY.rtgo05g - ENTRY.rtgoAtDrogue) / (dDrogue - d05);
  const rtgo = ENTRY.rtgo05g - (flown - d05) * scaleK;
  const frac = Math.max(0, Math.min(1, flown / dDrogue));
  const [la0, lo0] = ENTRY.eiLatLon;
  const [la1, lo1] = ENTRY.landingLatLon;
  const lon1 = lo1 < lo0 ? lo1 + 360 : lo1;
  let lon = lo0 + (lon1 - lo0) * frac;
  if (lon > 180) lon -= 360;
  return {
    dtEI: dt,
    v,                 // ft/s, inertial velocity
    g: d,              // drag deceleration in g
    alt,               // ft
    rdot,              // ft/s
    rollc,             // deg, commanded bank (0 = lift up), illustrative
    rtgo,              // n mi to the target
    lat: la0 + (la1 - la0) * frac,
    lon,
    src: f < 0.5 ? a.src : b.src,
    drogue: t >= ENTRY.drogueGET,
    mains: t >= ENTRY.mainGET,
    landed: t >= ENTRY.landingGET,
  };
}

// ∫ v dt from EI (n mi), trapezoids over the keyframes (horizontal speed ≈ v).
function entryDistance(dt) {
  const k = ENTRY.keyframes;
  let s = 0;
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i];
    const b = k[i + 1];
    if (b.dt <= 0) continue;
    const lo = Math.max(0, a.dt);
    const hi = Math.min(dt, b.dt);
    if (hi <= lo) continue;
    const va = a.v + (b.v - a.v) * ((lo - a.dt) / (b.dt - a.dt));
    const vb = a.v + (b.v - a.v) * ((hi - a.dt) / (b.dt - a.dt));
    s += ((va + vb) / 2) * (hi - lo);
  }
  return s / 6076.12;
}

const SLEW_RATE = 2 * Math.PI / 180;  // rad/s, coast attitude slews (simplified DAP)
const TVC_RATE = 1 * Math.PI / 180;   // rad/s, while the SPS is thrusting

// ---------- vector helpers ----------

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.sqrt(dot(a, a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = norm(a); return n > 0 ? scale(a, 1 / n) : [1, 0, 0]; };
const isVec = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite) && norm(a) > 0;

function gravity(r) {
  const d = norm(r);
  return scale(r, -MOON_MU / (d * d * d));
}

// Position/velocity on a hyperbola with pericynthion radius rp and speed vp,
// `dt` seconds after pericynthion. Perifocal = inertial frame: +x toward
// pericynthion, +y along the pericynthion velocity, +z orbit normal.
export function hyperbolaState(rp, vp, dt) {
  const e = rp * vp * vp / MOON_MU - 1;
  if (!(e > 1)) throw new Error('hyperbolaState: not a hyperbola');
  const A = rp / (e - 1);                 // |a|
  const n = Math.sqrt(MOON_MU / (A * A * A));
  const M = n * dt;
  let F = Math.asinh(M / e);              // starting guess
  for (let i = 0; i < 50; i++) {
    const f = e * Math.sinh(F) - F - M;
    const d = e * Math.cosh(F) - 1;
    const step = f / d;
    F -= step;
    if (Math.abs(step) < 1e-13) break;
  }
  const sq = Math.sqrt(e * e - 1);
  const Fdot = n / (e * Math.cosh(F) - 1);
  return {
    r: [A * (e - Math.cosh(F)), A * sq * Math.sinh(F), 0],
    v: [-A * Math.sinh(F) * Fdot, A * sq * Math.cosh(F) * Fdot, 0],
  };
}

function apsides(r, v) {
  const rm = norm(r);
  const energy = dot(v, v) / 2 - MOON_MU / rm;
  const h = cross(r, v);
  const e = norm(sub(scale(cross(v, h), 1 / MOON_MU), scale(r, 1 / rm)));
  if (energy >= 0) {
    return { apo: null, peri: dot(h, h) / MOON_MU / (1 + e) - MOON_RADIUS, ecc: e };
  }
  const a = -MOON_MU / (2 * energy);
  return { apo: a * (1 + e) - MOON_RADIUS, peri: a * (1 - e) - MOON_RADIUS, ecc: e };
}

// Rotate unit vector `from` toward unit vector `to` by at most `maxAngle`.
function slew(from, to, maxAngle) {
  const c = Math.max(-1, Math.min(1, dot(from, to)));
  const ang = Math.acos(c);
  if (ang <= maxAngle || ang < 1e-9) return to.slice();
  let axis = cross(from, to);
  if (norm(axis) < 1e-12) axis = Math.abs(from[0]) < 0.9 ? cross(from, [1, 0, 0]) : cross(from, [0, 1, 0]);
  const k = unit(axis);
  const s = Math.sin(maxAngle);
  const co = Math.cos(maxAngle);
  return unit(add(add(scale(from, co), scale(cross(k, from), s)), scale(k, dot(k, from) * (1 - co))));
}

// ---------- the model ----------

export class CmSpsVehicle {
  // opts: { startGET, rng, initial: 'loi1' | { r, v }, mass, propellant,
  //         thrust, mdot, attitude: [x,y,z] }
  constructor(opts = {}) {
    this.opts = { initial: 'loi1', ...opts };
    this.reset();
  }

  reset() {
    const o = this.opts;
    this.t = Number.isFinite(o.startGET) ? o.startGET : parseGET(o.startGET ?? 0);
    this.rng = o.rng || null;
    this.isLoi1 = o.initial === 'loi1' || o.initial === undefined;
    this.isEntry = o.initial === 'entry';

    if (this.isEntry) {
      this.r = [MOON_RADIUS, 0, 0];   // unused in entry mode
      this.v = [0, 0, 0];
    } else if (this.isLoi1) {
      const s = hyperbolaState(
        MOON_RADIUS + LOI1.pericynthionAlt, LOI1.pericynthionSpeed,
        this.t - LOI1.pericynthionGET,
      );
      this.r = s.r;
      this.v = s.v;
    } else if (o.initial && isVec(o.initial.r) && isVec(o.initial.v)) {
      this.r = o.initial.r.slice();
      this.v = o.initial.v.slice();
    } else {
      throw new Error('CmSpsVehicle: initial must be "loi1", "entry" or { r, v }');
    }

    this.mass = o.mass ?? (this.isEntry ? ENTRY.massEntry : LOI1.ignitionMass);
    this.propellant = o.propellant ?? (this.isEntry ? 0 : LOI1.spsAtLoi);
    this.spsLoaded = o.spsLoaded ?? LOI1.spsLoaded;
    this.thrustNominal = o.thrust ?? LOI1_SPS.thrust;
    this.mdotNominal = o.mdot ?? LOI1_SPS.mdot;

    // Thrust axis. Default: along the local horizontal, opposite to the
    // motion (roughly retrograde) — the P40 attitude maneuver (R60) or the
    // countdown fine-tunes it.
    const hz = sub(this.v, scale(unit(this.r), dot(this.v, unit(this.r))));
    this.bodyX = isVec(o.attitude) ? unit(o.attitude) : scale(unit(hz), -1);

    this.level = 0;            // SPS thrust level 0..1
    this.engineCmd = false;
    this.tailoff = SPS_TAILOFF;
    this.ullageOn = false;
    this.pipa = [0, 0, 0];     // sensed ΔV, m/s (inertial = stable member here)
    this.pipaPulses = [0, 0, 0];
    this.dvSensed = 0;
    this.burnTime = 0;
    this.downrange = 0;
    this.updateState();
  }

  // Point the thrust axis immediately (presets that start already in the
  // burn attitude, as Apollo 11 was well before LOI-1).
  setAttitude(dir) {
    if (isVec(dir)) {
      this.bodyX = unit(dir);
      this.updateState();
    }
  }

  step(dt, commands = {}, t) {
    if (!(dt > 0)) return;
    if (this.isEntry) {
      this.t = Number.isFinite(t) ? t : this.t + dt;
      this.updateState();
      return;
    }
    const cmd = commands || {};

    // Attitude: slew toward the commanded thrust direction (if any).
    if (isVec(cmd.thrustDir)) {
      const rate = this.level > 0 ? TVC_RATE : SLEW_RATE;
      this.bodyX = slew(this.bodyX, unit(cmd.thrustDir), rate * dt);
    }

    // SPS on/off with start and tail-off transients.
    const want = !!cmd.engineOn && this.propellant > 0;
    if (!want && this.engineCmd) {
      // A little shot-to-shot scatter of the tail-off impulse (±5 %, seeded),
      // so post-burn residuals are not exactly zero.
      const k = this.rng ? 1 + 0.05 * Math.max(-2, Math.min(2, this.rng.normal())) : 1;
      this.tailoff = SPS_TAILOFF * k;
      this.tailoffFrom = this.level;
    }
    this.engineCmd = want;
    if (want) this.level = Math.min(1, this.level + dt / SPS_RAMP_UP);
    else if (this.level > 0) this.level = Math.max(0, this.level - (this.tailoffFrom || 1) * dt / this.tailoff);

    this.ullageOn = !!cmd.ullage;
    const thrust = this.level * this.thrustNominal + (this.ullageOn ? RCS_ULLAGE_2JET : 0);
    const mdot = this.level * this.mdotNominal;
    const aT = thrust / this.mass;
    const accT = scale(this.bodyX, aT);

    // RK4 on (r, v) with the thrust acceleration held over the substep.
    const r0 = this.r;
    const v0 = this.v;
    const k1v = add(gravity(r0), accT); const k1r = v0;
    const r2 = add(r0, scale(k1r, dt / 2)); const v2 = add(v0, scale(k1v, dt / 2));
    const k2v = add(gravity(r2), accT); const k2r = v2;
    const r3 = add(r0, scale(k2r, dt / 2)); const v3 = add(v0, scale(k2v, dt / 2));
    const k3v = add(gravity(r3), accT); const k3r = v3;
    const r4 = add(r0, scale(k3r, dt)); const v4 = add(v0, scale(k3v, dt));
    const k4v = add(gravity(r4), accT); const k4r = v4;
    this.r = add(r0, scale(add(add(k1r, scale(k2r, 2)), add(scale(k3r, 2), k4r)), dt / 6));
    this.v = add(v0, scale(add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), dt / 6));

    // Arc length over the surface (downrange) for the trajectory views.
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(unit(r0), unit(this.r)))));
    this.downrange += ang * MOON_RADIUS;

    // Mass and propellant.
    const dm = Math.min(this.propellant, mdot * dt);
    this.propellant -= dm;
    this.mass -= dm;
    if (this.level > 0 && this.engineCmd) this.burnTime += dt;

    // Accelerometers: sensed ΔV and whole pulses.
    const dv = scale(accT, dt);
    this.pipa = add(this.pipa, dv);
    this.dvSensed += norm(dv);
    this.pipaPulses = this.pipa.map((x) => Math.trunc(x / CM_PIPA_PULSE));

    if (Number.isFinite(t)) this.t = t;
    else this.t += dt;
    this.thrustNow = thrust;
    this.updateState();
  }

  // §8 state for the scripted entry (feet → SI).
  entryVehicleState() {
    const e = entryState(this.t);
    const mass = this.t < ENTRY.drogueGET ? ENTRY.massEntry
      : this.t < ENTRY.mainGET ? ENTRY.massDrogue
        : this.t < ENTRY.landingGET ? ENTRY.massMain : ENTRY.massLanding;
    const v = e.v * FT;
    const rdot = e.rdot * FT;
    return {
      t: this.t,
      alt: e.alt * FT,
      altRate: rdot,
      vHoriz: Math.sqrt(Math.max(0, v * v - rdot * rdot)),
      vCross: 0,
      range: e.rtgo * NMI,
      downrange: (ENTRY.rtgo05g - e.rtgo) * NMI,
      mass,
      thrust: 0,
      throttle: 0,
      fuelFrac: 0,
      pitch: 0,
      yaw: 0,
      engineOn: false,
      ullage: false,
      landed: e.landed,
      contact: e.landed,
      lr: { altValid: false, velValid: false, alt: 0, altRate: 0, vHoriz: 0 },
      speed: v,
      dvSensed: 0,
      burnTime: 0,
      propellant: 0,
      orbit: null,
      gimbal: { pitch: 0, yaw: 0 },
      // Entry quantities the CM programs read (display units, scripted).
      entry: e,
    };
  }

  gimbalTrim() {
    if (!this.isLoi1) return { pitch: 0, yaw: 0 };
    // Cosmetic: interpolate the Mission Report's LOI gimbal positions over
    // the firing (initial → steady state by 10 %, → cutoff at 100 %).
    const g = LOI1.gimbal;
    const f = Math.min(1, this.burnTime / LOI1.firingTime);
    const lerp = (a, b, x) => a + (b - a) * x;
    const p = f < 0.1
      ? [lerp(g.initial[0], g.steady[0], f / 0.1), lerp(g.initial[1], g.steady[1], f / 0.1)]
      : [lerp(g.steady[0], g.cutoff[0], (f - 0.1) / 0.9), lerp(g.steady[1], g.cutoff[1], (f - 0.1) / 0.9)];
    return { pitch: p[0], yaw: p[1] };
  }

  updateState() {
    if (this.isEntry) {
      this.state = this.entryVehicleState();
      return;
    }
    const rm = norm(this.r);
    const up = scale(this.r, 1 / rm);
    const altRate = dot(this.v, up);
    const horiz = sub(this.v, scale(up, altRate));
    const normal = unit(cross(this.r, this.v));
    const bxUp = dot(this.bodyX, up);
    const bxOut = dot(this.bodyX, normal);
    const orbit = apsides(this.r, this.v);
    this.state = {
      t: this.t,
      alt: rm - MOON_RADIUS,
      altRate,
      vHoriz: norm(horiz),
      vCross: 0,
      range: 0,
      downrange: this.downrange,
      mass: this.mass,
      thrust: this.thrustNow || 0,
      throttle: this.level,
      fuelFrac: this.spsLoaded > 0 ? this.propellant / this.spsLoaded : 0,
      // Thrust-axis elevation above the local horizontal and out-of-plane
      // angle (deg) — the CM has no LM-style pitch/yaw.
      pitch: Math.asin(Math.max(-1, Math.min(1, bxUp))) * 180 / Math.PI,
      yaw: Math.asin(Math.max(-1, Math.min(1, bxOut))) * 180 / Math.PI,
      engineOn: this.engineCmd,
      ullage: this.ullageOn,
      landed: false,
      contact: false,
      lr: { altValid: false, velValid: false, alt: 0, altRate: 0, vHoriz: 0 },
      // CM extras
      r: this.r.slice(),
      v: this.v.slice(),
      speed: norm(this.v),
      bodyX: this.bodyX.slice(),
      pipa: this.pipa.slice(),
      pipaPulses: this.pipaPulses.slice(),
      pipaPulse: CM_PIPA_PULSE,
      dvSensed: this.dvSensed,
      burnTime: this.burnTime,
      propellant: this.propellant,
      orbit,
      gimbal: this.gimbalTrim(),
    };
  }
}

export default CmSpsVehicle;
