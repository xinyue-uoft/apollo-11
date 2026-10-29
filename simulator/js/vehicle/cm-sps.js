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
// state follows ARCHITECTURE §8 where meaningful; LM-only fields stay
// 0/false. CM extras: r, v, bodyX, pipa, pipaPulses, dvSensed, burnTime,
// propellant, orbit, gimbal.

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

    if (this.isLoi1) {
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
      throw new Error('CmSpsVehicle: initial must be "loi1" or { r, v }');
    }

    this.mass = o.mass ?? LOI1.ignitionMass;
    this.propellant = o.propellant ?? LOI1.spsAtLoi;
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
    const cmd = commands || {};

    // Attitude: slew toward the commanded thrust direction (if any).
    if (isVec(cmd.thrustDir)) {
      const rate = this.level > 0 ? TVC_RATE : SLEW_RATE;
      this.bodyX = slew(this.bodyX, unit(cmd.thrustDir), rate * dt);
    }

    // SPS on/off with start and tail-off transients.
    const want = !!cmd.engineOn && this.propellant > 0;
    if (want && !this.engineCmd) this.level = Math.max(this.level, 0);
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
