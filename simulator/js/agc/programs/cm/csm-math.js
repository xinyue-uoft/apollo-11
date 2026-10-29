// Small vector / two-body helpers and Comanche 055 constants used by the
// Command Module programs. This is the *computer's* side: P40 works from the
// AGC's navigated state and its own constants, never from the truth model's
// internals (the vehicle model, js/vehicle/cm-sps.js, keeps its own copy of
// the physics on purpose).
//
// Frames: Moon-centred inertial, 3-vectors as [x, y, z] arrays, SI units.

import { FT, LBF, LB, MOON_MU } from '../../../util/units.js';

// ---------- Comanche 055 constants (cite the listing) ----------

// FENG: "SPS THRUST (20500LBS)" — the nominal thrust P40 stores in F.
// Comanche055/P40-P47.agc:57,320
export const FENG_N = 20500 * LBF;

// 2VEXHUST: "2(10338.0564 FPS)" — SPS exhaust velocity used by S40.8 TGOCALC.
// Comanche055/P40-P47.agc:1748
export const SPS_VEX = 10338.0564 * FT;

// 3MDOT comment: "3SEC MASS LOSS (63.8 LBS/SEC)" — nominal SPS mass flow.
// EMDOT itself is a pad load; we use the nominal value from this comment.
// Comanche055/P40-P47.agc:344-347; ERASABLE_ASSIGNMENTS.agc:1494
export const SPS_MDOT_NOMINAL = 63.8 * LB;

// SEC29.96 / SEC24.96 / 5SEC: the countdown chain. The integration target
// TDEC1 = TIG - 29.96 s; TIGBLNK fires 5 s earlier; TIGAVEG schedules TIG-5
// 24.96 s later; TIG-5 schedules TIG-0 5 s later.
// Comanche055/P40-P47.agc:138-141,150-157,325-326,350-353,462-465,480-483,726
export const SEC29_96 = 29.96;
export const SEC24_96 = 24.96;
export const SEC5 = 5;

// TIMEDELT: MIDTOAV1 needs TDEC1 at least 12.5 s in the future, otherwise
// alarm 1703 and TIG is slipped. Comanche055/INTEGRATION_INITIALIZATION.agc:990-1003,1081-1094
export const TIMEDELT = 12.5;

// S40.13: a burn shorter than 6 s is flown impulsively (attitude hold,
// timed cut-off); "TGO GREATER THAN 600 CS" means steering.
// Comanche055/P40-P47.agc:1949-2013
export const IMPULSIVE_LIMIT = 6;

// S40.8: "TGO LESS THAN 4 SECONDS" → S40.81 attitude hold, cut-off timed.
// Comanche055/P40-P47.agc:1718-1722,1750,1759-1770
export const FOURSEC = 4;

// S40.135: "IMPULSE FROM 7.96 SECS OF 2-JET FIRING 7.96 (199.6)COS(10) LB-SEC".
// Comanche055/P40-P47.agc:2032-2035
export const ULLAGE_IMPULSE_2JET = 7.96 * 199.6 * Math.cos(10 * Math.PI / 180) * LBF; // N·s

// CM PIPA pulse: DELV is scaled "2(+14)*5.85*10(-4) M/CS", i.e. one pulse is
// 5.85 cm/s. Comanche055/SERVICER207.agc:186
export const CM_PIPA_PULSE = 0.0585; // m/s

// SERVICER (Average-G) period: READACCS recycles every 2 s.
// Comanche055/SERVICER207.agc:47-49,82-84
export const SERVICER_PERIOD = 2;

// ---------- vectors ----------

export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vscale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vnorm = (a) => Math.sqrt(vdot(a, a));
export const vcross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function vunit(a) {
  const n = vnorm(a);
  return n > 0 ? vscale(a, 1 / n) : [0, 0, 0];
}

// Rotate v about unit axis k by angle (rad), right-handed (Rodrigues).
export function vrotate(v, k, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vadd(vadd(vscale(v, c), vscale(vcross(k, v), s)), vscale(k, vdot(k, v) * (1 - c)));
}

// ---------- two-body coast (the AGC's precision integration, simplified) ----------

function gravity(r) {
  const d = vnorm(r);
  return vscale(r, -MOON_MU / (d * d * d));
}

// Coast a state (r, v) for dt seconds (dt may be negative) under lunar
// two-body gravity with RK4 steps of at most `h` seconds. Stands in for the
// AGC's Encke integration (MIDTOAV1 / INTEGRV), which also includes
// perturbations the simulator does not model.
export function coast(r, v, dt, h = 1) {
  let R = r.slice();
  let V = v.slice();
  const n = Math.max(1, Math.ceil(Math.abs(dt) / h));
  const s = dt / n;
  for (let i = 0; i < n; i++) {
    const a1 = gravity(R);
    const r2 = vadd(R, vscale(V, s / 2)); const v2 = vadd(V, vscale(a1, s / 2)); const a2 = gravity(r2);
    const r3 = vadd(R, vscale(v2, s / 2)); const v3 = vadd(V, vscale(a2, s / 2)); const a3 = gravity(r3);
    const r4 = vadd(R, vscale(v3, s)); const v4 = vadd(V, vscale(a3, s)); const a4 = gravity(r4);
    R = vadd(R, vscale(vadd(vadd(V, vscale(v2, 2)), vadd(vscale(v3, 2), v4)), s / 6));
    V = vadd(V, vscale(vadd(vadd(a1, vscale(a2, 2)), vadd(vscale(a3, 2), a4)), s / 6));
  }
  return { r: R, v: V };
}

// Local vertical / local horizontal axes used for Noun 81 (P30 external ΔV):
// X horizontal in the direction of motion, Y = −(r × v) (minus the orbit
// normal), Z down toward the Moon's centre.
export function lvlhAxes(r, v) {
  const Z = vscale(vunit(r), -1);
  const Y = vscale(vunit(vcross(r, v)), -1);
  const X = vcross(Y, Z);
  return { X, Y, Z };
}

export function lvlhToInertial(dvLv, r, v) {
  const { X, Y, Z } = lvlhAxes(r, v);
  return vadd(vadd(vscale(X, dvLv[0]), vscale(Y, dvLv[1])), vscale(Z, dvLv[2]));
}

// Apocynthion / pericynthion altitudes of the osculating conic (m above
// `radius`); apo is null for an open (hyperbolic) orbit.
export function apsides(r, v, radius) {
  const rm = vnorm(r);
  const energy = vdot(v, v) / 2 - MOON_MU / rm;
  const h = vcross(r, v);
  const eVec = vsub(vscale(vcross(v, h), 1 / MOON_MU), vscale(r, 1 / rm));
  const e = vnorm(eVec);
  if (energy >= 0) {
    const p = vdot(h, h) / MOON_MU;
    return { apo: null, peri: p / (1 + e) - radius, ecc: e };
  }
  const a = -MOON_MU / (2 * energy);
  return { apo: a * (1 + e) - radius, peri: a * (1 - e) - radius, ecc: e };
}

// S40.1, external-ΔV branch: the impulsive ΔV (DELVSIN) is turned into the
// velocity-to-be-gained for a finite burn by rotating its in-plane part
// forward by half the angle THETAT the vehicle sweeps during the burn:
//   VGTIG = |ΔVp|·(cos(θ/2)·unit(ΔVp) + sin(θ/2)·unit(ΔVp × UP)) + (ΔV·UP)·UP
// with UP = unit(V × R), θ = (|R × V| / R²)·|ΔV|·m / F.
// Comanche055/P40-P47.agc:1203-1260 (THETACON :1298)
export function s40_1(delvsin, rTig, vTig, mass, thrust) {
  const up = vunit(vcross(vTig, rTig));
  const along = vdot(delvsin, up);
  const upPart = vscale(up, along);
  const dvp = vsub(delvsin, upPart);
  const dvpMag = vnorm(dvp);
  const rr = vnorm(rTig);
  const omega = vnorm(vcross(rTig, vTig)) / (rr * rr);
  const thetaT = omega * vnorm(delvsin) * mass / thrust;
  if (dvpMag === 0) return { vgtig: delvsin.slice(), thetaT };
  const side = vunit(vcross(dvp, up));
  const rotated = vadd(
    vscale(vunit(dvp), dvpMag * Math.cos(thetaT / 2)),
    vscale(side, dvpMag * Math.sin(thetaT / 2)),
  );
  return { vgtig: vadd(rotated, upPart), thetaT };
}
