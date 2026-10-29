// LmPhysics — the Lunar Module flying the powered descent: planar flight
// in an inertial frame over a spherical, rotating Moon, with the DPS engine
// (throttle limits incl. the fixed-throttle-position region, lag, mass flow
// from the exhaust velocity), a rate-limited attitude that follows the
// commanded thrust direction, the face-up yaw, propellant depletion, the
// landing radar, the contact probes and touchdown evaluation.
//
// Conventions (ARCHITECTURE §8, SI):
//   alt       height of the footpads above the surface (the site sphere) —
//             0 at touchdown; the contact light comes on at the probe
//             length, 5.6 ft (LM.probeLength)
//   altRate   radial velocity; vHoriz surface-relative horizontal velocity
//   range     surface arc to the targeted landing site (positive while
//             uprange); a redesignation moves the site by commands.lpd
//   downrange ground distance flown since this provider started
//   throttle  actual thrust / 10,500 lbf rated; pitch = thrust-axis angle
//             from the local vertical, positive when thrusting uprange;
//             yaw 0 = windows down (face down, as at PDI), 180 = windows up
// Extras beyond §8: vInertial, throttleCmd, propellant (kg), lowLevel,
// depleted, touchdown { t, vVert, vHoriz, tilt, verdict }, phi (rad).
//
// Commands (from the AGC each 10-ms substep):
//   engineOn (bool), throttle (fraction of rated; ignored when engine off),
//   thrustDir ([x,y,z] unit vector in the landing-site guidance frame —
//   what landing-guidance.js returns — or null to hold attitude),
//   pitch (deg; used when thrustDir is absent — e.g. the P66 attitude
//   stand-in), yaw (deg; optional), ullage (bool),
//   lpd ({ downrange, crossrange } m: cumulative site redesignation).
//
// Simplifications: no cross-range motion; RCS translation (ullage) and
// RCS propellant are neglected (research: ullage effect negligible); the
// surface is a smooth sphere (no terrain), so the radar altitude equals
// the true altitude.

import { MOON_MU, MOON_RADIUS, FPS, rad, deg } from '../util/units.js';
import { parseGET } from '../util/time.js';
import {
  DPS, LM, ATTITUDE, TOUCHDOWN_LIMITS, MOON_ROTATION_RATE,
} from './constants.js';
import { LandingRadar } from './landing-radar.js';
import { createTrackModel } from './replay.js';
import { APOLLO11_DESCENT } from '../data/apollo11-descent.js';
import { guidanceToLocal, pitchOfLocal } from '../agc/guidance/landing-guidance.js';

// Physics initial state from a historical track at GET `get` (string or s):
// { t, alt, altRate, vHoriz, range, mass, propellant, pitch, yaw, engineOn,
//   throttle } in SI. Presets use it to start at PDI, high gate or low gate
// consistently with the replay.
export function stateFromTrack(track = APOLLO11_DESCENT, get) {
  const model = createTrackModel(track);
  const t = parseGET(get ?? model.t0);
  const s = model.sample(t);
  return {
    t,
    alt: s.alt,
    altRate: s.altRate,
    vHoriz: s.vHoriz,
    range: s.range,
    mass: s.mass,
    propellant: s.fuelFrac * LM.dpsLoaded,
    pitch: s.pitch,
    yaw: s.yaw,
    engineOn: s.engineOn,
    throttle: s.throttle,
  };
}

// Throttle command → engine setting (fraction of rated). 10 % minimum (the
// manual throttle's lower bound, THROTTLE_CONTROL_ROUTINES.agc:63-65);
// continuously throttleable up to 65 %; anything above is the fixed
// throttle position (the hardware stop) — the 65–92.5 % region was a
// "nonoperating region" (AER-DPS p.8) that the LGC never commands.
export function engineSetting(cmd) {
  const f = Number(cmd);
  if (!(f > DPS.minFraction)) return DPS.minFraction;
  if (f > DPS.maxThrottleableFraction) return DPS.ftpFraction;
  return f;
}

export class LmPhysics {
  // opts: { startGET, rng, track (default Apollo 11), initialState
  //         (overrides the track: any subset of stateFromTrack's fields),
  //         siteRadius, autoYaw = true, lrAcqAltitude }
  constructor(opts = {}) {
    this.opts = opts;
    this.reset();
  }

  reset() {
    const o = this.opts;
    this.siteRadius = o.siteRadius || MOON_RADIUS;
    this.omega = MOON_ROTATION_RATE;
    const t0 = parseGET(o.startGET ?? 0);
    const track = o.track || APOLLO11_DESCENT;
    let init;
    try {
      init = stateFromTrack(track, t0);
    } catch {
      init = stateFromTrack(APOLLO11_DESCENT, t0);
    }
    init = { ...init, ...(o.initialState || {}) };
    if (o.initialState && Number.isFinite(o.initialState.fuelFrac) && !Number.isFinite(o.initialState.propellant)) {
      init.propellant = o.initialState.fuelFrac * LM.dpsLoaded;
    }

    this.t0 = t0;
    this.t = t0;
    const Rs = this.siteRadius;
    this.r = Rs + Math.max(0, init.alt);
    this.vr = init.altRate;
    this.vt = init.vHoriz - this.omega * this.r;      // inertial tangential
    this.theta = 0;
    this.thetaSite0 = init.range / Rs;
    this.lpdShift = 0;
    this.mass = init.mass;
    this.propellant = Math.max(0, init.propellant);
    this.pitch = Number.isFinite(init.pitch) ? init.pitch : 90;
    this.yaw = Number.isFinite(init.yaw) ? init.yaw : 0;
    this.pitchCmd = this.pitch;
    this.autoYaw = o.autoYaw !== false;

    // Engine: a running engine at the start (presets after PDI) starts at
    // its track setting.
    const on = !!init.engineOn && init.throttle > 0;
    this.throttleCmd = on ? init.throttle : 0;
    this.thrustTarget = on ? init.throttle * DPS.ratedThrust : 0;
    this.thrustInternal = this.thrustTarget;
    this.thrust = this.thrustTarget;
    this.engineCmd = on;
    // Seconds since ignition drives the automatic yaw-around; a start after
    // PDI counts from the track's PDI.
    this.ignitionT = on ? (track.pdiGET ?? APOLLO11_DESCENT.pdiGET) : null;
    this.ullage = false;
    this.landed = this.r - Rs <= 0 && Math.abs(this.vr) < 1e-6;
    this.contact = this.landed;
    this.touchdown = null;
    this.depleted = false;
    this.lowLevel = this.propellant / LM.dpsLoaded <= LM.lowLevelFraction;

    this.lr = new LandingRadar({
      rng: o.rng && typeof o.rng.fork === 'function' ? o.rng.fork('lr') : o.rng,
      acqAltitude: o.lrAcqAltitude,
    });
    this.state = {};
    this.updateState();
  }

  siteAngle(t = this.t) {
    return this.thetaSite0 - this.omega * (t - this.t0) + this.lpdShift / this.siteRadius;
  }

  step(dt, commands = {}, t) {
    if (!(dt > 0)) return;
    const cmd = commands || {};
    const Rs = this.siteRadius;

    if (cmd.lpd && Number.isFinite(cmd.lpd.downrange)) this.lpdShift = cmd.lpd.downrange;
    this.ullage = !!cmd.ullage;

    // ---- engine ----
    const usable = this.propellant - LM.dpsUnusable;
    this.depleted = usable <= 0;
    const wantOn = !!cmd.engineOn && !this.depleted;
    if (wantOn && !this.engineCmd && this.ignitionT === null) this.ignitionT = this.t;
    this.engineCmd = wantOn;
    if (wantOn) {
      if (cmd.throttle !== undefined && cmd.throttle !== null) this.throttleCmd = engineSetting(cmd.throttle);
      else if (!(this.throttleCmd > 0)) this.throttleCmd = DPS.minFraction;
      this.thrustTarget = this.throttleCmd * DPS.ratedThrust;
      // Throttle valve slews at FRATE, then the engine lags by THROTLAG.
      const maxStep = DPS.throttleRate * dt;
      this.thrustInternal += Math.max(-maxStep, Math.min(maxStep, this.thrustTarget - this.thrustInternal));
    } else {
      this.thrustTarget = 0;
      this.thrustInternal = 0;
    }
    this.thrust += (this.thrustInternal - this.thrust) * (1 - Math.exp(-dt / DPS.throttleLag));
    if (this.thrust < 1) this.thrust = 0;

    // ---- attitude ----
    const phi = this.siteAngle() - this.theta;
    if (Array.isArray(cmd.thrustDir)) {
      this.pitchCmd = pitchOfLocal(guidanceToLocal(cmd.thrustDir, phi));
    } else if (Number.isFinite(cmd.pitch)) {
      this.pitchCmd = cmd.pitch;
    }
    if (!this.landed) {
      const dp = ATTITUDE.pitchRate * dt;
      this.pitch += Math.max(-dp, Math.min(dp, this.pitchCmd - this.pitch));
      let yawTarget = this.yaw;
      if (Number.isFinite(cmd.yaw)) yawTarget = cmd.yaw;
      else if (this.autoYaw && this.ignitionT !== null
               && this.t - this.ignitionT >= ATTITUDE.yawAroundAfterIgnition) yawTarget = 180;
      const dy = ATTITUDE.yawRate * dt;
      this.yaw += Math.max(-dy, Math.min(dy, yawTarget - this.yaw));
    }

    // ---- translation (RK4, thrust and mass held over the substep) ----
    if (!this.landed) {
      const aT = this.thrust / this.mass;
      const p = rad(this.pitch);
      const aR = aT * Math.cos(p);
      const aH = -aT * Math.sin(p);
      const f = (r, vr, vt) => [vr, vt / r, (vt * vt) / r - MOON_MU / (r * r) + aR, (-vr * vt) / r + aH];
      const y0 = [this.r, this.theta, this.vr, this.vt];
      const k1 = f(y0[0], y0[2], y0[3]);
      const y1 = y0.map((v, i) => v + (dt / 2) * k1[i]);
      const k2 = f(y1[0], y1[2], y1[3]);
      const y2 = y0.map((v, i) => v + (dt / 2) * k2[i]);
      const k3 = f(y2[0], y2[2], y2[3]);
      const y3 = y0.map((v, i) => v + dt * k3[i]);
      const k4 = f(y3[0], y3[2], y3[3]);
      const y = y0.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      [this.r, this.theta, this.vr, this.vt] = y;
    }

    // ---- propellant ----
    const used = (this.thrust / DPS.exhaustVelocity) * dt;
    const burn = Math.min(used, Math.max(0, this.propellant));
    this.propellant -= burn;
    this.mass -= burn;

    this.t = Number.isFinite(t) ? t : this.t + dt;

    // ---- surface contact ----
    if (!this.landed && this.r - Rs <= 0) this.touchDown();
    this.updateState(dt);
  }

  touchDown() {
    const Rs = this.siteRadius;
    const vVert = this.vr;
    const vHoriz = this.vt + this.omega * this.r;
    const tilt = Math.abs(this.pitch);
    const L = TOUCHDOWN_LIMITS;
    let verdict = 'safe';
    if (Math.abs(vVert) > L.hardVertical) verdict = 'crash';
    else if (Math.abs(vVert) > L.maxVertical || Math.abs(vHoriz) > L.maxHorizontal || tilt > L.maxTilt) verdict = 'hard';
    this.touchdown = { t: this.t, vVert, vHoriz, tilt, verdict, ok: verdict === 'safe' };
    this.landed = true;
    this.contact = true;
    this.r = Rs;
    this.vr = 0;
    this.vt = -this.omega * Rs;        // at rest on the rotating surface
  }

  updateState(dt = 0) {
    const Rs = this.siteRadius;
    const alt = this.r - Rs;
    const vHoriz = this.vt + this.omega * this.r;
    const range = Rs * (this.siteAngle() - this.theta);
    const fuelFrac = this.propellant / LM.dpsLoaded;
    if (fuelFrac <= LM.lowLevelFraction) this.lowLevel = true;
    if (!this.landed) this.contact = alt <= LM.probeLength;
    const lr = this.lr.update({ alt, altRate: this.vr, vHoriz, yaw: this.yaw, landed: this.landed }, dt);
    const s = this.state;
    s.t = this.t;
    s.alt = alt;
    s.altRate = this.landed ? 0 : this.vr;
    s.vHoriz = this.landed ? 0 : vHoriz;
    s.vCross = 0;
    s.range = range;
    s.downrange = Rs * (this.theta + this.omega * (this.t - this.t0));
    s.mass = this.mass;
    s.thrust = this.thrust;
    s.throttle = this.thrust / DPS.ratedThrust;
    s.throttleCmd = this.engineCmd ? this.throttleCmd : 0;
    s.fuelFrac = fuelFrac;
    s.propellant = this.propellant;
    s.pitch = this.pitch;
    s.yaw = this.yaw;
    s.engineOn = this.engineCmd && this.thrust > 0;
    s.ullage = this.ullage;
    s.landed = this.landed;
    s.contact = this.contact;
    s.lowLevel = this.lowLevel;
    s.depleted = this.depleted;
    s.touchdown = this.touchdown ? { ...this.touchdown } : null;
    s.vInertial = Math.hypot(this.vr, this.vt);
    s.phi = this.siteAngle() - this.theta;
    s.lr = { ...lr };
  }
}

// Convenience for tests and presets: thrust-axis pitch in degrees for a
// guidance-frame direction at the vehicle's current position.
export function pitchForThrustDir(vehicle, dir) {
  return pitchOfLocal(guidanceToLocal(dir, vehicle.state.phi));
}

export { deg, FPS };
