// Apollo lunar descent guidance as flown in Luminary 099 (Allan Klumpp's
// quadratic "E-guidance"), ARCHITECTURE §7. Pure functions plus one small
// state holder (`LandingGuidance`) that sequences a 2-s SERVICER guidance
// pass the way LUNLAND does.
//
// Every equation below was derived from the listing and cross-checked with
// research/src-landing.md §5–§8 (line numbers are 1-based):
//   Luminary099/LUNAR_LANDING_GUIDANCE_EQUATIONS.agc   (LLGE below)
//   Luminary099/THROTTLE_CONTROL_ROUTINES.agc          (TCR below)
//
// ---------------------------------------------------------------------------
// FRAME. Vectors are [x, y, z] in the guidance frame CG (LLGE:414-422,
// :641-682): origin at the landing site LAND, x = UNIT(LAND) (up through the
// site), y = cross-range (to the right of the direction of flight), z =
// downrange (horizontal at the site, in the direction of flight; z < 0
// while the LM is short of the site). The AGC works in stable-member (SM)
// coordinates of the landing REFSMMAT, whose axes are this frame to within
// a small rotation; the simulator does not distinguish them.
//
// The simulator flies in a vertical plane over a spherical Moon of radius
// `siteRadius` (default MOON_RADIUS). With `range` the surface arc from the
// LM to the site, phi = range / siteRadius is the central angle and
//   local up      u = [cos phi, 0, -sin phi]
//   local forward e = [sin phi, 0,  cos phi]
// so the LM's position relative to the site is RG = (R_site+alt)·u − LAND.
// Because the frame is built from the current site every pass, the lunar
// rotation (TTFINCR's LAND update, LLGE:277-322) is implicit: velocities
// are surface-relative (ANGTERM = V + R × WM, LLGE:443-448).
//
// SIMPLIFICATIONS (stated in the UI where visible):
// - Planar: cross-range components are carried but the physics never
//   creates them; CGCALC's frame re-erection (LLGE:641-682) is therefore an
//   identity and is not modelled.
// - Throttle: the AGC sends incremental pulses PIF = FC − FP (TCR:114-132)
//   weighted by FWEIGHT for the engine lag (TCR:134-185). Here the command
//   is the absolute thrust FC (what those pulses converge to); FWEIGHT is
//   not modelled.
// - No fixed-point scaling, overflow (alarm 01410) or STEERSW (no-thrust)
//   logic; the caller decides whether a pass is skipped.
// ---------------------------------------------------------------------------

import {
  FT, FPS, LBF, MOON_MU, MOON_RADIUS, rad, deg,
} from '../../util/units.js';
import { DPS, THROTTLE_LOGIC } from '../../vehicle/constants.js';

// ---------- small vector helpers ----------

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => Math.sqrt(dot(a, a));
const unit = (a) => {
  const n = norm(a);
  return n > 0 ? scale(a, 1 / n) : [0, 0, 0];
};
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const v3 = (x, z) => [x, 0, z];

export const vec = Object.freeze({ add, sub, scale, dot, cross, norm, unit });

// ---------- targets (Apollo 11 pad load) ----------

// Grumman LM Data Book Vol. II, Table LM5/4.5.1-1 "G Prelaunch Erasable Load
// (LUMINARY 99)" [NOM-A11] — research/web-trajectory-b.md §4.2 and
// research/src-landing.md §13.1. Stored by the LGC in metric doubles; the
// values here are the table's ft / ft/s / ft/s² remarks converted to SI.
// Only the z (downrange) jerk enters the guidance (TTF/8CL, LLGE:489-504);
// the starred pad words are pre-multiplied: VBRFG* = 18·VBRFG_z,
// ABRFG* = 6·ABRFG_z, JBRFG* = JBRFG_z.

// Braking phase (P63): the aim point lies ≈62 s beyond high gate.
export const BRAKING_TARGETS = Object.freeze({
  phase: 'braking',
  program: 63,
  rdg: Object.freeze(v3(171.835 * FT, -10678.596 * FT)),   // RBRFG
  vdg: Object.freeze(v3(-105.876 * FPS, -1.040 * FPS)),    // VBRFG
  adg: Object.freeze(v3(0.6241 * FT, -9.1044 * FT)),       // ABRFG (ft/s²)
  jdgZ: -0.01882677 * FT,                                   // JBRFG* (ft/s³)
  gain: 1.0,          // GAINBRAK ("NUMERO MYSTERIOSO", LLGE:666)
  tcgf: 30,           // TCGFBRAK, s
  tcgi: 900,          // TCGIBRAK, s
  tend: 62,           // TENDBRAK: P63 → P64 when TTF > −62 s (LLGE:692-709)
});

// Approach phase (P64): the aim point is 111 ft above and 27 ft short of
// the site; P64 hands over to P65 at TTF > −12 s.
export const APPROACH_TARGETS = Object.freeze({
  phase: 'approach',
  program: 64,
  rdg: Object.freeze(v3(111.085 * FT, -26.794 * FT)),      // RAPFG
  vdg: Object.freeze(v3(-4.993 * FPS, 0.248 * FPS)),       // VAPFG
  adg: Object.freeze(v3(-0.2624 * FT, -0.5120 * FT)),      // AAPFG
  jdgZ: 0.0018077200 * FT,                                  // JAPFG*
  gain: 0,            // GAINAPPR
  tcgf: 30,           // TCGFAPPR
  tcgi: 200,          // TCGIAPPR
  tend: 12,           // TENDAPPR
  deltaTtf: -110,     // DELTTFAP, added to TTF by STARTP64 (LLGE:260-263)
});

// P65 velocity-nulling target V2FG = (−3, 0, 0) ft/s with TAUVERT = 10 s
// (LLGE:893-913; pad load). Not used on Apollo 11 (P66 was flown).
export const P65_TARGET = Object.freeze({
  phase: 'vertical',
  program: 65,
  v2fg: Object.freeze([-3.0 * FPS, 0, 0]),
  tauVert: 10,
});

// Other pad loads and fixed constants used here.
export const GUIDANCE_PARAMS = Object.freeze({
  // LEADTIME −2.2 s, "a negative number" (LLGE:547; pad 3426) [NOM-A11].
  leadTime: -2.2,
  // ZOOMTIME 26 s: throttle-up and guidance start after nominal TIG
  // (BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc:394-406) [NOM-A11].
  zoomTime: 26,
  // GUIDDURN = 66440 cs, nominal guidance-start-to-landing duration; IGNALG
  // effectively starts TTF at TPIP − TLAND (THE_LUNAR_LANDING.agc:80-93,269)
  // [CODE] — used as the first TTF guess when nothing better is known.
  guidDurn: 664.40,
  // ROOTPSRS precision PRECROOT = BIT8 (2^-7 of the first guess) and its
  // "GIVE UP AFTER EIGHT PASSES" (LLGE:507-508, :1351-1354) [CODE].
  rootPrecision: 2 ** -7,
  rootMaxPasses: 8,
  // P66 rate of descent (P66VERTA/RODCOMP, LLGE:941-1113) [NOM-A11 pad]:
  rodScale: 1.0 * FPS,      // RODSCALE: 1 ft/s per ROD-switch click
  tauRod: 1.5,              // TAUROD, s
  lagTau: 0.413333,         // LAG/TAU
  minForce: 980 * LBF,      // MINFORCE
  maxForce: 6300 * LBF,     // MAXFORCE
  // LPD (COUNT'EM / REDESIG, LLGE:1174-1212, :331-408) [CODE]:
  elEach: 0.00873,          // rad, 1/2 degree per fore/aft click
  azEach: 0.03491,          // rad, 2 degrees per left/right click
  deprCrit: -0.02,          // DEPRCRIT: LOS at least ≈1.15° below horizontal
  // TREDES = |TTF| − TCGFAPPR − 4 s (two passes), limited 0..99
  // (TDISPSET, LLGE:1384-1410).
  tredesPasses: 4,
  // X-axis override inhibit and "window up" below 30,000 ft (XORCHK,
  // SERVICER.agc:914-922) [CODE].
  xorAltitude: 30000 * FT,
});

// ---------- geometry: navigated state ↔ guidance frame ----------

// nav: { alt, altRate, vHoriz, range, cross?, vCross? } — SI, surface-
// relative velocities (alt above the site sphere, range = surface arc to
// the site, positive while uprange).
// Returns { rg, vg, gravity, r, phi, u, e } in the guidance frame
// (RGVGCALC, LLGE:442-461: RGU = CG(R − LAND), VGU = CG·ANGTERM).
export function toGuidanceFrame(nav, { siteRadius = MOON_RADIUS } = {}) {
  const r = siteRadius + nav.alt;
  const phi = nav.range / siteRadius;
  const u = [Math.cos(phi), 0, -Math.sin(phi)];
  const e = [Math.sin(phi), 0, Math.cos(phi)];
  const rg = [r * u[0] - siteRadius, nav.cross || 0, r * u[2]];
  const vg = add(add(scale(u, nav.altRate), scale(e, nav.vHoriz)), [0, nav.vCross || 0, 0]);
  // Spherical-Moon gravity (MUNGRAV, SERVICER.agc:1076-1086): −μ/r² along u.
  const gravity = scale(u, -MOON_MU / (r * r));
  return { rg, vg, gravity, r, phi, u, e };
}

// Guidance-frame direction → LM local frame [up, cross, forward] and back.
// phi: central angle from the LM to the site (range / siteRadius).
export function guidanceToLocal(dir, phi) {
  const u = [Math.cos(phi), 0, -Math.sin(phi)];
  const e = [Math.sin(phi), 0, Math.cos(phi)];
  return [dot(dir, u), dir[1], dot(dir, e)];
}

export function localToGuidance(local, phi) {
  const u = [Math.cos(phi), 0, -Math.sin(phi)];
  const e = [Math.sin(phi), 0, Math.cos(phi)];
  return add(add(scale(u, local[0]), scale(e, local[2])), [0, local[1], 0]);
}

// Pitch convention used throughout the simulator: the angle of the thrust
// axis (body +X) from the local vertical, positive when the thrust points
// uprange (braking attitude) — BEN72's "pitch 55° at high gate, 16° at low
// gate" (research/web-trajectory-b.md §4.4).
export function pitchOfLocal(local) {
  return deg(Math.atan2(-local[2], local[0]));
}

export function localFromPitch(pitchDeg) {
  const p = rad(pitchDeg);
  return [Math.cos(p), 0, -Math.sin(p)];
}

// Thrust (body X) direction in the guidance frame for a given pitch.
export function thrustDirFromPitch(pitchDeg, phi) {
  return localToGuidance(localFromPitch(pitchDeg), phi);
}

// RANGEDSP = |R − LAND| (LLGE:462-463), the N68 R1 slant range.
export function slantRange(nav, opts) {
  return norm(toGuidanceFrame(nav, opts).rg);
}

// ---------- time to go (TTF/8CL + ROOTPSRS) ----------

// The z component of the target-jerk constraint (LLGE:489-504; Klumpp
// R-695 Eq. 12):
//   JTG_z·T³ + 6·ATG_z·T² + (18·VTG_z + 6·VG_z)·T + 24·(RTG_z − RG_z) = 0
// with T = TTF < 0. The AGC solves it for x = T/8 (coefficients divided by
// 64); Newton's method is invariant under that rescaling, so T is solved
// directly here with the same iteration and stopping rule as ROOTPSRS
// (LLGE:1236-1372): stop when |dx| < PRECROOT·|first guess|; after eight
// passes the root is declared bad (→ alarm 01406 in P63/P64).
export function ttfCoefficients({ rg, vg, target }) {
  return [
    24 * (target.rdg[2] - rg[2]),                 // A0
    18 * target.vdg[2] + 6 * vg[2],              // A1
    6 * target.adg[2],                           // A2
    target.jdgZ,                                 // A3
  ];
}

export function solveTtgDetailed({
  rg, vg, target, guess,
  precision = GUIDANCE_PARAMS.rootPrecision,
  maxPasses = GUIDANCE_PARAMS.rootMaxPasses,
}) {
  const [a0, a1, a2, a3] = ttfCoefficients({ rg, vg, target });
  let x = Number.isFinite(guess) ? guess : defaultGuess(target);
  const crit = Math.abs(precision * x);
  for (let pass = 0; ; pass++) {
    const f = ((a3 * x + a2) * x + a1) * x + a0;
    const df = (3 * a3 * x + 2 * a2) * x + a1;
    if (!(Math.abs(df) > 0)) return { ttg: x, passes: pass, converged: false };
    const dx = f / df;
    x -= dx;
    // "KLUMPP SAYS GIVE UP AFTER EIGHT PASSES" (LLGE:1351-1354): the check
    // comes before the counter is incremented, so a ninth correction fails.
    if (pass >= maxPasses) return { ttg: x, passes: pass + 1, converged: false };
    if (Math.abs(dx) < crit) return { ttg: x, passes: pass + 1, converged: true };
  }
}

// ARCHITECTURE §7: returns TTG (s, negative). On a bad root the last
// iterate is returned; use solveTtgDetailed to see `converged`.
export function solveTtg(args) {
  return solveTtgDetailed(args).ttg;
}

function defaultGuess(target) {
  // IGNALG starts from TPIP − TLAND (≈ −GUIDDURN at guidance start);
  // P64 from the braking TTF (≈ −62 s) plus DELTTFAP.
  return target.phase === 'approach'
    ? -BRAKING_TARGETS.tend + APPROACH_TARGETS.deltaTtf
    : -GUIDANCE_PARAMS.guidDurn;
}

// ---------- acceleration command (QUADGUID) ----------

// Published law (LLGE:533-537):
//   ACG = ADG + 6·(VDG + VG)/TTF + 12·(RDG − RG)/TTF²
// As programmed (LLGE:546-599), with the transport-lag lead LEADTIME:
//   TTF' = min(TTF − LEADTIME, 0),  r = TTF'/TTF ∈ [0, 1]
//   ACG = cA·ADG + 6·(cVD·VDG + cV·VG)/TTF + 12·cR·(RDG − RG)/TTF²
//   cV = 2r² − r, cR = 3r² − 2r, cVD = 4r² − 3r, cA = 6r² − 6r + 1
// (all 1 when r = 1). The "SAFEGUARD" forces −TTF + LEADTIME ≥ 0 (:546-551).
export function leadCoefficients(ttg, leadTime = GUIDANCE_PARAMS.leadTime) {
  const lagged = Math.min(ttg - leadTime, 0);
  const r = ttg < 0 ? (lagged / ttg) + 0 : 0;   // + 0 turns −0 into 0
  return {
    r,
    cV: 2 * r * r - r,
    cR: 3 * r * r - 2 * r,
    cVD: 4 * r * r - 3 * r,
    cA: 6 * r * r - 6 * r + 1,
  };
}

export function accelCommand({ rg, vg, target, ttg, leadTime = GUIDANCE_PARAMS.leadTime }) {
  if (!(ttg < 0)) return target.adg.slice();
  const c = leadCoefficients(ttg, leadTime);
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    out[i] = c.cA * target.adg[i]
      + (6 * (c.cVD * target.vdg[i] + c.cV * vg[i])) / ttg
      + (12 * c.cR * (target.rdg[i] - rg[i])) / (ttg * ttg);
  }
  return out;
}

// P65 (P65VERT, LLGE:901-913): ACG = (V2FG − VGU)/TAUVERT.
export function p65Accel({ vg, target = P65_TARGET }) {
  return scale(sub(target.v2fg, vg), 1 / target.tauVert);
}

// ---------- thrust command (AFCCALC) and throttle (THROTTLE) ----------

// THROTTLE's region logic with hysteresis (TCR:63-102; research
// src-landing.md §6):
//   at the fixed throttle position (FCOLD > HIGHCRIT):
//       FC ≤ LOWCRIT → "throttle recovery" into the throttleable region
//       otherwise    → stay at the stop (FCOLD := FP)
//   throttleable (FCOLD ≤ HIGHCRIT):
//       FC ≤ HIGHCRIT → command FC (FCOLD := FC)
//       otherwise     → throttle up to the stop (FCOLD := FMAXPOS)
// FLATOUT (TCR:191-198) sets FCOLD = −0, so the first pass after P63ZOOM
// stays at the stop only while the demand exceeds HIGHCRIT.
// Returns { mode: 'ftp'|'throttleable', thrust (N commanded), fcold, changed }.
export function throttleLogic({ fc, fp, fcold = 0, lowCrit = THROTTLE_LOGIC.lowCrit, highCrit = THROTTLE_LOGIC.highCrit }) {
  // FP is the measured thrust; without a measurement assume the engine is
  // where the last command put it.
  const present = Number.isFinite(fp) ? fp : (fcold > highCrit ? DPS.ftpThrust : fc);
  if (fcold > highCrit) {
    if (fc > lowCrit) {
      // NOTE 1 (TCR:104-105): FC is set to FP so PIF = 0, no change; FCOLD
      // becomes FP (TCR:87-88, :114-117).
      return { mode: 'ftp', thrust: DPS.ftpThrust, fcold: present, changed: false };
    }
    // NOTE 2 (TCR:107-112): back below 55 % — command FC.
    return { mode: 'throttleable', thrust: fc, fcold: fc, changed: true, recovery: true };
  }
  if (fc <= highCrit) return { mode: 'throttleable', thrust: fc, fcold: fc, changed: true };
  return { mode: 'ftp', thrust: DPS.ftpThrust, fcold: THROTTLE_LOGIC.fMaxPos, changed: true, throttleUp: true };
}

// AFCCALC1..AFCCLEND (LLGE:600-627):
//   UNFC = ACG − g;  /AFC/ = |UNFC| (the throttle sees the full demand)
//   amaxh = sqrt((HIGHESTF/MASS)² − a_x² − a_y²)   (0 if negative)
//   if a_z + amaxh < 0: a_z := −amaxh   — the braking (−z) component gives
//   way so the vector fits the available thrust; vertical and cross-range
//   are kept.
// thrustCommand({ acg, gravity, mass, fp?, throttleState? }) →
//   { throttle (fraction of rated), thrustDir (unit, guidance frame), unfc,
//     afc (m/s²), fc (N), limited, throttleState, mode }.
export function thrustCommand({
  acg, gravity, mass, fp, throttleState = { fcold: 0 },
  highestF = THROTTLE_LOGIC.highestF,
}) {
  const unfc = sub(acg, gravity);
  const afc = norm(unfc);
  const amax = highestF / mass;
  const amaxh2 = amax * amax - unfc[0] * unfc[0] - unfc[1] * unfc[1];
  const amaxh = amaxh2 > 0 ? Math.sqrt(amaxh2) : 0;
  let limited = false;
  if (unfc[2] + amaxh < 0) {
    unfc[2] = -amaxh;
    limited = true;
  }
  const fc = afc * mass;
  const thr = throttleLogic({ fc, fp, fcold: throttleState.fcold });
  return {
    throttle: thr.thrust / DPS.ratedThrust,
    thrustDir: unit(unfc),
    unfc,
    afc,
    fc,
    limited,
    mode: thr.mode,
    recovery: !!thr.recovery,
    throttleUp: !!thr.throttleUp,
    throttleState: { fcold: thr.fcold },
  };
}

// ---------- P66 rate of descent (RODCOMP) ----------

// VDGVERT += RODCOUNT · RODSCALE (LLGE:948-953): one click = 1 ft/s; the
// "+" (DESCENT+) direction slows the descent (LLGE:1218-1228).
export function rodClick(vdgVert, clicks, rodScale = GUIDANCE_PARAMS.rodScale) {
  return vdgVert + clicks * rodScale;
}

// The vertical channel of P66 (LLGE:1031-1094, src-landing.md §5.9):
//   /AFC/ = [(VDGVERT − ḣ)/TAUROD + |g|] / cosθ
//   /AFC/ += LAG/TAU · (|g|/cosθ − a_m)          (lag compensation; a_m =
//                                                 measured thrust accel)
//   /AFC/ = clamp(/AFC/, MINFORCE/MASS, MAXFORCE/MASS)
// cosTilt = body X · UNIT(R). Returns { afc, fc, throttle } (throttle as a
// fraction of rated thrust). P66 has no attitude channel in Luminary099
// (src-landing.md §0 item 9): the commander flies attitude.
export function rodCommand({
  hdot, vdgVert, gravity, cosTilt, mass, measuredAccel,
  params = GUIDANCE_PARAMS,
}) {
  const c = Math.max(cosTilt, 0.1);
  let afc = ((vdgVert - hdot) / params.tauRod + gravity) / c;
  if (Number.isFinite(measuredAccel)) afc += params.lagTau * (gravity / c - measuredAccel);
  afc = clamp(afc, params.minForce / mass, params.maxForce / mass);
  const fc = afc * mass;
  return { afc, fc, throttle: fc / DPS.ratedThrust };
}

// Not AGC code: a stand-in for the commander's hand controller in P66, so
// that the sandbox (and the closed-loop test) can null the horizontal
// velocity the way the crew did. It mirrors P65's velocity nulling
// (TAUVERT = 10 s, LLGE:901-913) in the horizontal axis and limits the tilt.
// Returns the pitch to hold (deg, positive = thrust uprange).
export function p66AttitudeAssist({ vHoriz, vTarget = 0, tau = P65_TARGET.tauVert, gravity, maxTilt = 20 }) {
  const ah = (vTarget - vHoriz) / tau;           // wanted horizontal accel
  return clamp(deg(Math.atan2(-ah, gravity)), -maxTilt, maxTilt);
}

// ---------- LPD (landing point designator) ----------

// LOOKANGL = arcsin(UNIT(R − LAND) · XNB), rounded to whole degrees
// (LLGE:464-480): the angle below the forward body axis at which the crew
// sees the site through the LPD reticle. bodyX: thrust axis, guidance frame.
export function lookAngle({ rg, bodyX }) {
  const s = clamp(dot(unit(rg), unit(bodyX)), -1, 1);
  return deg(Math.asin(s));
}

export function lookAngleDisplay(args) {
  return Math.floor(lookAngle(args) + 0.5);
}

// TREDES, seconds of redesignation time left (TDISPSET, LLGE:1384-1410):
// |TTF| − TCGFAPPR − 4 s, truncated, limited to 0..99; zero two passes
// before TCGFAPPR is reached.
export function tredes(ttf, tcgf = APPROACH_TARGETS.tcgf) {
  const v = Math.trunc(-ttf - tcgf - GUIDANCE_PARAMS.tredesPasses);
  return clamp(v, 0, 99);
}

// REDESIG (LLGE:335-408): rotate the line of sight by the accumulated
// clicks and intersect it with the horizontal plane through LAND:
//   u = UNIT(LAND − R); LOS' = u + AZ·YNB + EL·(YNB × u)
//   LOS'_x = min(LOS'_x, DEPRCRIT); s = (LAND − R)_x / LOS'_x
//   LAND' = |LAND| · UNIT(R + s·LOS')
// clicks: { el, az } counts (+el = stick forward = site farther, +az = right;
// research src-landing.md §7.4). bodyY: LM +Y in the guidance frame (right;
// [0,1,0] for the planar face-up LM). Returns the site's shift along the
// surface { downrange, crossrange } (m) and the new LAND in the old frame.
export function redesignate({ nav, clicks, bodyY = [0, 1, 0], siteRadius = MOON_RADIUS, params = GUIDANCE_PARAMS }) {
  const { rg } = toGuidanceFrame(nav, { siteRadius });
  const land = [siteRadius, 0, 0];
  const R = add(land, rg);
  const u = unit(sub(land, R));
  const el = (clicks.el || 0) * params.elEach;
  const az = (clicks.az || 0) * params.azEach;
  const los = add(add(u, scale(bodyY, az)), scale(cross(bodyY, u), el));
  los[0] = Math.min(los[0], params.deprCrit);
  const s = (land[0] - R[0]) / los[0];
  const p = add(R, scale(los, s));
  const newLand = scale(unit(p), siteRadius);
  return {
    land: newLand,
    downrange: siteRadius * Math.atan2(newLand[2], newLand[0]),
    crossrange: siteRadius * Math.asin(clamp(newLand[1] / siteRadius, -1, 1)),
  };
}

// The navigated state relative to a site moved by `shift` ({ downrange,
// crossrange }, m, as returned by redesignate()).
export function shiftSite(nav, shift) {
  return {
    ...nav,
    range: nav.range + (shift.downrange || 0),
    cross: (nav.cross || 0) - (shift.crossrange || 0),
  };
}

// ---------- one guidance pass (LUNLAND) ----------

const PHASES = ['braking', 'approach', 'vertical'];

// Sequencer for the 2-s landing-guidance pass (LUNLAND → GUILDRET →
// NEWPHASE/TTFINCR → PREGUIDE → WHATGUID → AFCCALC → AFTRGUID/EXTLOGIC →
// THROTTLE → displays; LLGE:117-890, src-landing.md §4). Pure apart from its
// own small state (plain data in `this.s`, copyable for snapshots).
//
//   const g = new LandingGuidance();
//   g.start({ t });                      // P63ZOOM: connect guidance (FLATOUT)
//   g.start({ t, phase: 'approach' });   // preset at high gate (STARTP64 next pass)
//   const out = g.pass(nav, t);          // each SERVICER pass (PIPA time t)
//   g.proceedP64();                      // crew PRO on flashing V06N64
//   g.addLpdClicks({ el, az });          // LPD hand-controller clicks (P64)
//                                        // → out.siteShift: give it to the
//                                        //   vehicle as commands.lpd
//   g.startP66(nav, t);                  // ATT HOLD + ROD click (GUILDENSTERN)
//   const r = g.rodPass(nav, t, clicks); // P66 vertical channel (1-s cycle)
//
// nav: { alt, altRate, vHoriz, range, cross?, vCross?, mass, thrust?
//        (measured, N), pitch? (deg, current attitude for LOOKANGL),
//        measuredAccel? (m/s², P66) } — the AGC's *navigated* state, with
//        range measured to the current (possibly redesignated) site.
// out: { phase, program, ttf, passes, converged, alarm, acg, unfc, afc, fc,
//        throttle, throttleMode, thrustDir (guidance frame), pitchCmd,
//        switchPhase (next phase name when EXTLOGIC switched), newProgram
//        (program number started at the top of this pass, e.g. 64),
//        display: { TTFDISP, RANGEDSP, VHORIZ, LOOKANGL, TREDES, HDOTDISP,
//                   HCALC, FUNNYDSP }, redesignation }.
export class LandingGuidance {
  constructor({
    siteRadius = MOON_RADIUS,
    braking = BRAKING_TARGETS,
    approach = APPROACH_TARGETS,
    vertical = P65_TARGET,
    params = GUIDANCE_PARAMS,
  } = {}) {
    this.siteRadius = siteRadius;
    this.targets = { braking, approach, vertical };
    this.params = params;
    this.s = null;
  }

  // P63ZOOM (BURN_BABY_BURN...agc:564-570): AVEGEXIT := LUNLAND, FLATOUT.
  // phase 'approach' with ttfGuess −62 starts as if P63 had just ended
  // (presets at high gate): FLPASS0 = 0, so the first pass runs NEWPHASE
  // (STARTP64: TTF += DELTTFAP, newProgram 64). With `entered: true` that
  // start routine counts as done — TTF is used as given (e.g. −172 s for
  // the approach) and no newProgram is reported. FLPASS0 = 2 after P63IGN
  // (BBB:465-469).
  start({ t, phase = 'braking', ttfGuess, entered = false } = {}) {
    const wch = PHASES.indexOf(phase);
    if (wch < 0) throw new Error(`LandingGuidance: unknown phase ${phase}`);
    const defaultTtf = phase === 'approach'
      ? -this.targets.braking.tend + (entered ? this.targets.approach.deltaTtf : 0)
      : -this.params.guidDurn;
    this.s = {
      wchPhase: wch,
      flPass0: phase === 'braking' || entered ? 2 : 0,
      ttf: Number.isFinite(ttfGuess) ? ttfGuess : defaultTtf,
      tPip: t,
      program: this.targets[phase].program,
      fcold: 0,                 // FLATOUT
      redFlag: false,           // REDFLAG (P64 redesignation enabled)
      elIncr: 0,
      azIncr: 0,
      siteShift: { downrange: 0, crossrange: 0 },
      vdgVert: null,            // P66 desired altitude rate
      rod: false,
      last: null,
    };
    return this;
  }

  get state() {
    return this.s;
  }

  get phase() {
    if (!this.s) return null;
    return this.s.rod ? 'rod' : PHASES[this.s.wchPhase];
  }

  snapshot() {
    return this.s ? JSON.parse(JSON.stringify(this.s)) : null;
  }

  restore(snap) {
    this.s = snap ? JSON.parse(JSON.stringify(snap)) : null;
  }

  proceedP64() {
    if (this.s && this.s.wchPhase === 1) this.s.redFlag = true;   // P64CEED (LLGE:874-881)
  }

  // COUNT'EM (LLGE:1174-1200) accumulates ELINCR1/AZINCR1; the caller skips
  // this in ATT HOLD and outside P64 (PITFALL, LLGE:1134-1136).
  addLpdClicks({ el = 0, az = 0 } = {}) {
    if (!this.s) return;
    this.s.elIncr += el;
    this.s.azIncr += az;
  }

  pass(nav, t) {
    const s = this.s;
    if (!s) throw new Error('LandingGuidance.pass before start()');
    const p = this.params;
    let newProgram = null;

    // GUILDRET (LLGE:224-246): TPIPOLD = TPIP, TPIP = PIPTIME1.
    const dt = t - s.tPip;
    s.tPip = t;
    let ttf = s.ttf;
    if (s.flPass0 === 0) {
      // NEWPHASE (LLGE:51-53): STARTP64 / P65START.
      if (s.wchPhase === 1) {
        ttf += this.targets.approach.deltaTtf;   // STARTP64: TTF/8TMP += DELTTFAP
        s.redFlag = false;                       // DOWNFLAG REDFLAG
        s.program = 64;
        newProgram = 64;
      } else if (s.wchPhase === 2) {
        s.program = 65;                          // P65START (LLGE:252-258)
        newProgram = 65;
      }
    }
    // TTFINCR (LLGE:288-312): TTF/8 += (TPIP − TPIPOLD)/8.
    ttf += dt;

    // REDESIG (P64 only, LLGE:335-408), before RGVGCALC. The new site is
    // used at once in this pass; later passes expect nav.range to be
    // measured to it (pass out.siteShift to the vehicle as commands.lpd).
    let redesignation = null;
    let navG = nav;
    if (s.wchPhase === 1 && s.redFlag && tredes(ttf) > 0 && (s.elIncr || s.azIncr)) {
      redesignation = redesignate({ nav, clicks: { el: s.elIncr, az: s.azIncr }, siteRadius: this.siteRadius, params: p });
      s.siteShift.downrange += redesignation.downrange;
      s.siteShift.crossrange += redesignation.crossrange;
      navG = shiftSite(nav, redesignation);
      s.elIncr = 0;
      s.azIncr = 0;
    } else if (s.wchPhase !== 1) {
      s.elIncr = 0;
      s.azIncr = 0;
    }

    // RGVGCALC (LLGE:442-480).
    const geo = toGuidanceFrame(navG, { siteRadius: this.siteRadius });
    const bodyX = Number.isFinite(nav.pitch) ? thrustDirFromPitch(nav.pitch, geo.phi) : null;

    let acg;
    let passes = 0;
    let converged = true;
    let alarm = null;
    let switchPhase = null;
    const phase = PHASES[s.wchPhase];
    if (s.wchPhase < 2) {
      // TTF/8CL + ROOTPSRS (LLGE:489-525), initial guess = current TTF.
      const target = this.targets[phase];
      const root = solveTtgDetailed({ rg: geo.rg, vg: geo.vg, target, guess: ttf, precision: p.rootPrecision, maxPasses: p.rootMaxPasses });
      passes = root.passes;
      converged = root.converged;
      if (!converged) {
        // 1406ALM: ALARM 01406 then RATESTOP — no new throttle/attitude
        // commands this pass (LLGE:1414-1416).
        alarm = 0o1406;
        s.ttf = ttf;
        s.flPass0 += 1;
        // The previous commands are repeated (the caller keeps them).
        const held = s.last && { ...s.last, recovery: false, throttleUp: false };
        return this.output({ s, phase, geo, navG, bodyX, ttf, passes, converged, alarm, newProgram, redesignation, cmd: held });
      }
      ttf = root.ttg;
      acg = accelCommand({ rg: geo.rg, vg: geo.vg, target, ttg: ttf, leadTime: p.leadTime });
    } else {
      // VERTGUID → P65VERT (LLGE:897-913).
      acg = p65Accel({ vg: geo.vg, target: this.targets.vertical });
    }

    // AFCCALC1..AFCCLEND + THROTTLE (LLGE:600-627, :822; TCR).
    const cmd = thrustCommand({
      acg, gravity: geo.gravity, mass: nav.mass, fp: nav.thrust,
      throttleState: { fcold: s.fcold },
    });
    s.fcold = cmd.throttleState.fcold;
    s.flPass0 += 1;                                 // INCR FLPASS0 (LLGE:632)

    // EXTLOGIC (LLGE:692-709): TEND + TTF/8 > 0 → next phase; this pass
    // still exits and displays as the old phase.
    if (s.wchPhase < 2 && this.targets[phase].tend + ttf > 0) {
      s.wchPhase += 1;
      s.flPass0 = 0;
      switchPhase = PHASES[s.wchPhase];
    }
    s.ttf = ttf;
    s.last = {
      acg, unfc: cmd.unfc, afc: cmd.afc, fc: cmd.fc, throttle: cmd.throttle,
      throttleMode: cmd.mode, thrustDir: cmd.thrustDir,
      pitchCmd: pitchOfLocal(guidanceToLocal(cmd.thrustDir, geo.phi)),
      recovery: cmd.recovery, throttleUp: cmd.throttleUp, limited: cmd.limited,
    };
    return this.output({ s, phase, geo, navG, bodyX, ttf, passes, converged, alarm, newProgram, redesignation, switchPhase, cmd: s.last });
  }

  // STARTP66 (LLGE:143-185): VDGVERT = HDOTDISP (hold the current sink
  // rate), FCOLD = 0, WCHPHASE = 2, REDFLAG off. The click(s) that caused
  // the entry are applied by the first rodPass.
  startP66(nav, t) {
    const s = this.s || this.start({ t, phase: 'vertical' }).s;
    s.rod = true;
    s.vdgVert = nav.altRate;
    s.fcold = 0;
    s.wchPhase = 2;
    s.flPass0 = 1;
    s.redFlag = false;
    s.program = 66;
    s.tPip = t;
    return this;
  }

  // RODCOMP (LLGE:948-1113), run every second in P66.
  rodPass(nav, t, clicks = 0) {
    const s = this.s;
    if (!s || !s.rod) throw new Error('LandingGuidance.rodPass outside P66');
    s.vdgVert = rodClick(s.vdgVert, clicks, this.params.rodScale);
    const geo = toGuidanceFrame(nav, { siteRadius: this.siteRadius });
    const g = norm(geo.gravity);
    const cosTilt = Number.isFinite(nav.pitch) ? Math.cos(rad(nav.pitch)) : 1;
    const rod = rodCommand({
      hdot: nav.altRate, vdgVert: s.vdgVert, gravity: g, cosTilt,
      mass: nav.mass, measuredAccel: nav.measuredAccel, params: this.params,
    });
    // THROTTLE +3 with the measured acceleration (LLGE:1095-1098).
    const thr = throttleLogic({ fc: rod.fc, fp: nav.thrust, fcold: s.fcold });
    s.fcold = thr.fcold;
    s.tPip = t;
    const vhoriz = Math.hypot(nav.vHoriz, nav.vCross || 0);
    s.last = { ...(s.last || {}), afc: rod.afc, fc: rod.fc, throttle: thr.thrust / DPS.ratedThrust, throttleMode: thr.mode };
    return {
      phase: 'rod',
      program: 66,
      vdgVert: s.vdgVert,
      afc: rod.afc,
      fc: rod.fc,
      throttle: thr.thrust / DPS.ratedThrust,
      throttleMode: thr.mode,
      thrustDir: null,                // attitude is the commander's (no FINDCDUW)
      display: {
        VHORIZ: vhoriz,               // N60 R1
        HDOTDISP: nav.altRate,        // N60 R2
        HCALC: nav.alt,               // N60 R3
      },
    };
  }

  output({ s, phase, geo, navG, bodyX, ttf, passes, converged, alarm, newProgram, redesignation, switchPhase = null, cmd }) {
    const look = bodyX ? lookAngle({ rg: geo.rg, bodyX }) : null;
    const tr = phase === 'approach' ? tredes(ttf, this.targets.approach.tcgf) : 0;
    return {
      phase,
      program: s.program,
      ttf,
      ttg: ttf,
      passes,
      converged,
      alarm,
      newProgram,
      switchPhase,
      redesignation,
      siteShift: { ...s.siteShift },
      acg: cmd ? cmd.acg : null,
      unfc: cmd ? cmd.unfc : null,
      afc: cmd ? cmd.afc : null,
      fc: cmd ? cmd.fc : null,
      throttle: cmd ? cmd.throttle : null,
      throttleMode: cmd ? cmd.throttleMode : null,
      recovery: cmd ? !!cmd.recovery : false,
      thrustDir: cmd ? cmd.thrustDir : null,
      pitchCmd: cmd ? cmd.pitchCmd : null,
      redFlag: s.redFlag,
      display: {
        TTFDISP: ttf,                                       // N61/N68 R2 (s)
        RANGEDSP: norm(geo.rg),                             // N68 R1 (m)
        VHORIZ: Math.hypot(geo.vg[1], geo.vg[2]),           // N60 R1 (m/s)
        LOOKANGL: look === null ? null : Math.floor(look + 0.5),   // N64 R1 D4D5 (deg)
        TREDES: tr,                                         // N64 R1 D1D2 (s)
        FUNNYDSP: look === null ? null : { tredes: tr, lookangl: Math.floor(look + 0.5) },
        HDOTDISP: navG.altRate,                             // N63/N64 R2 (m/s)
        HCALC: navG.alt,                                    // N63/N64 R3 (m)
      },
    };
  }
}
