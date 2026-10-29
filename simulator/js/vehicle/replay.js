// ReplayVehicle — the vehicle state read off a historical track
// (js/data/apollo11-descent.js) at the simulation's GET. It ignores the
// AGC's commands: in a replay the computer model watches the flown
// trajectory instead of flying it.
//
// Interpolation (createTrackModel):
//   alt       cubic Hermite through (alt, altRate) at every keyframe, so the
//             reported altRate is exactly d(alt)/dt (the keyframes carry a
//             fitted, self-consistent rate — see SOURCE_NOTES there)
//   vHoriz, range   monotone cubic (Fritsch–Carlson): no overshoot between
//             callouts
//   throttle, fuel, mass, pitch, yaw, vCross   piecewise linear (throttle
//             steps are given as two keyframes ≈1 s apart, the DPS slew)
//   engineOn, ullage, landing-radar data good, contact, landed   intervals
// Before the first / after the last keyframe the end values are held.
//
// state: ARCHITECTURE §8 plus extras (SI): vInertial, throttleCmd,
// propellant (kg), lowLevel, depleted, touchdown, phi.

import { FT, FPS, MOON_RADIUS } from '../util/units.js';
import { parseGET } from '../util/time.js';
import { LM, LR, DPS, MOON_ROTATION_RATE } from './constants.js';

// ---------- interpolation helpers ----------

function search(ts, t) {
  // index i with ts[i] <= t < ts[i+1] (clamped to [0, n-2])
  let lo = 0;
  let hi = ts.length - 1;
  if (t <= ts[0]) return 0;
  if (t >= ts[hi]) return hi - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid; else hi = mid;
  }
  return lo;
}

function hermite(ts, ys, ms, t) {
  const n = ts.length;
  if (t <= ts[0]) return { y: ys[0], dy: ms[0] };
  if (t >= ts[n - 1]) return { y: ys[n - 1], dy: ms[n - 1] };
  const i = search(ts, t);
  const h = ts[i + 1] - ts[i];
  const s = (t - ts[i]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  const y = (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * ms[i]
    + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * ms[i + 1];
  const dy = ((6 * s2 - 6 * s) * ys[i] + (3 * s2 - 4 * s + 1) * h * ms[i]
    + (-6 * s2 + 6 * s) * ys[i + 1] + (3 * s2 - 2 * s) * h * ms[i + 1]) / h;
  return { y, dy };
}

// Fritsch–Carlson slopes for a monotone piecewise cubic.
function monotoneSlopes(ts, ys) {
  const n = ts.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (ts[i + 1] - ts[i] || 1e-9));
  const m = new Array(n);
  m[0] = d[0] ?? 0;
  m[n - 1] = d[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const h0 = ts[i] - ts[i - 1];
      const h1 = ts[i + 1] - ts[i];
      const w1 = 2 * h1 + h0;
      const w2 = h1 + 2 * h0;
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return m;
}

function linear(ts, ys, t) {
  const n = ts.length;
  if (!n) return 0;
  if (t <= ts[0]) return ys[0];
  if (t >= ts[n - 1]) return ys[n - 1];
  const i = search(ts, t);
  const h = ts[i + 1] - ts[i];
  return h > 0 ? ys[i] + (ys[i + 1] - ys[i]) * ((t - ts[i]) / h) : ys[i + 1];
}

function inIntervals(list, t) {
  for (const [a, b] of list) if (t >= a && (b === null || t < b)) return true;
  return false;
}

// ---------- track model ----------

const MODELS = new WeakMap();

// Build (once per track object) the interpolating model of a track.
// model.sample(t) → SI values at GET t (s).
export function createTrackModel(track) {
  if (!track || !Array.isArray(track.keyframes) || track.keyframes.length < 2) {
    throw new Error('createTrackModel: track needs at least two keyframes');
  }
  if (MODELS.has(track)) return MODELS.get(track);
  const kf = track.keyframes;
  const ts = kf.map((k) => parseGET(k.t));
  for (let i = 1; i < ts.length; i++) {
    if (!(ts[i] > ts[i - 1])) throw new Error(`createTrackModel: keyframe ${kf[i].t} is not after ${kf[i - 1].t}`);
  }
  const col = (name) => kf.map((k) => k[name]);
  const alt = col('alt');
  const altRate = kf.map((k, i) => k.altRate);
  // Missing rates fall back to monotone slopes.
  const fcAlt = monotoneSlopes(ts, alt);
  const altSlopes = altRate.map((r, i) => (Number.isFinite(r) ? r : fcAlt[i]));
  const vh = col('vHoriz');
  const vhSlopes = monotoneSlopes(ts, vh);
  const range = col('range');
  const rangeSlopes = monotoneSlopes(ts, range);
  const throttle = col('throttle');
  const fuel = col('fuel');
  const mass = col('mass');
  const pitch = col('pitch');
  const yawT = (track.yaw || []).map(([t]) => parseGET(t));
  const yawV = (track.yaw || []).map(([, v]) => v);
  const vcT = (track.vCross || []).map(([t]) => parseGET(t));
  const vcV = (track.vCross || []).map(([, v]) => v);
  const iv = {};
  for (const [name, list] of Object.entries(track.intervals || {})) {
    iv[name] = list.map(([a, b]) => [parseGET(a), b === null ? null : parseGET(b)]);
  }
  const lowLevelT = (track.milestones || []).find((m) => m.id === 'low-level');
  const lowLevelGET = lowLevelT ? parseGET(lowLevelT.t) : Infinity;

  const model = {
    track,
    t0: ts[0],
    t1: ts[ts.length - 1],
    times: ts,
    sample(t) {
      const a = hermite(ts, alt, altSlopes, t);
      const landed = iv.landed ? inIntervals(iv.landed, t) : false;
      const altFt = landed ? 0 : Math.max(0, a.y);
      const rateFt = landed ? 0 : a.dy;
      const vhFt = Math.max(0, hermite(ts, vh, vhSlopes, t).y);
      const engineOn = iv.engineOn ? inIntervals(iv.engineOn, t) : linear(ts, throttle, t) > 0;
      const yaw = yawT.length ? linear(yawT, yawV, t) : 0;
      const vCross = vcT.length ? linear(vcT, vcV, t) : 0;
      const thr = Math.max(0, linear(ts, throttle, t)) / 100;
      return {
        alt: altFt * FT,
        altRate: rateFt * FPS,
        vHoriz: vhFt * FPS,
        vCross: vCross * FPS,
        range: hermite(ts, range, rangeSlopes, t).y * FT,
        throttle: thr,
        fuelFrac: linear(ts, fuel, t) / 100,
        mass: linear(ts, mass, t),
        pitch: linear(ts, pitch, t),
        yaw,
        engineOn,
        ullage: iv.ullage ? inIntervals(iv.ullage, t) : false,
        lrAlt: iv.lrAlt ? inIntervals(iv.lrAlt, t) : false,
        lrVel: iv.lrVel ? inIntervals(iv.lrVel, t) : false,
        contact: iv.contact ? inIntervals(iv.contact, t) : false,
        landed,
        lowLevel: t >= lowLevelGET,
      };
    },
  };
  MODELS.set(track, model);
  return model;
}

// ---------- the provider ----------

const LR_SAMPLE_PERIOD = 0.25; // s, as in landing-radar.js [ASSUMED]

export class ReplayVehicle {
  // opts: { track (required), startGET, rng (optional: radar noise) }
  constructor(opts = {}) {
    if (!opts.track) throw new Error('ReplayVehicle: a track is required (data/tracks.js)');
    this.opts = opts;
    this.model = createTrackModel(opts.track);
    this.reset();
  }

  reset() {
    const o = this.opts;
    this.t = parseGET(o.startGET ?? this.model.t0);
    this.rng = o.rng && typeof o.rng.fork === 'function' ? o.rng.fork('lr') : (o.rng || null);
    this.sinceSample = Infinity;
    this.noise = { alt: 0, altRate: 0, vHoriz: 0 };
    this.startRange = this.model.sample(this.t).range;
    this.touchdown = null;
    this.state = {};
    this.update(0);
  }

  // Commands are ignored (the replay is the flown trajectory).
  step(dt, _commands, t) {
    if (!(dt > 0)) return;
    this.t = Number.isFinite(t) ? t : this.t + dt;
    this.update(dt);
  }

  update(dt) {
    const s = this.model.sample(this.t);
    this.sinceSample += dt;
    if (this.rng && this.sinceSample >= LR_SAMPLE_PERIOD) {
      this.sinceSample = 0;
      this.noise.alt = this.rng.normal(0, Math.max(LR.altNoiseMin, LR.altNoiseFrac * s.alt));
      this.noise.altRate = this.rng.normal(0, LR.velNoise);
      this.noise.vHoriz = this.rng.normal(0, LR.velNoise);
    }
    const r = MOON_RADIUS + s.alt;
    const vInertialH = s.vHoriz - MOON_ROTATION_RATE * r;
    if (s.landed && !this.touchdown) {
      const td = this.opts.track.touchdownGET ?? this.t;
      const at = this.model.sample(td);
      this.touchdown = { t: td, vVert: at.altRate, vHoriz: at.vHoriz, tilt: Math.abs(at.pitch), verdict: 'safe', ok: true };
    }
    if (!s.landed) this.touchdown = null;
    const st = this.state;
    st.t = this.t;
    st.alt = s.alt;
    st.altRate = s.altRate;
    st.vHoriz = s.vHoriz;
    st.vCross = s.vCross;
    st.range = s.range;
    st.downrange = this.startRange - s.range;
    st.mass = s.mass;
    st.throttle = s.throttle;
    st.throttleCmd = s.throttle;
    st.thrust = s.throttle * DPS.ratedThrust;
    st.fuelFrac = s.fuelFrac;
    st.propellant = s.fuelFrac * LM.dpsLoaded;
    st.pitch = s.pitch;
    st.yaw = s.yaw;
    st.engineOn = s.engineOn;
    st.ullage = s.ullage;
    st.landed = s.landed;
    st.contact = s.contact;
    st.lowLevel = s.lowLevel;
    st.depleted = false;
    st.touchdown = this.touchdown ? { ...this.touchdown } : null;
    st.vInertial = Math.hypot(vInertialH, s.altRate);
    st.phi = s.range / MOON_RADIUS;
    st.lr = {
      altValid: s.lrAlt,
      velValid: s.lrVel,
      alt: s.lrAlt ? Math.max(0, s.alt + this.noise.alt) : null,
      altRate: s.lrVel ? s.altRate + this.noise.altRate : null,
      vHoriz: s.lrVel ? Math.max(0, s.vHoriz + this.noise.vHoriz) : null,
    };
  }
}
