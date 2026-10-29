// Landing radar (LR) hardware model: the "data good" discretes the LGC
// reads (CHAN33 bit 5 altitude, bit 8 velocity — research/src-landing.md
// §10.6) and the measured altitude / velocity with a small seeded noise.
//
// What the computer then does with the data (V57 permit, the 50,000-ft and
// 2,000-ft/s read thresholds, the reasonableness tests, the ALT/VEL lamp
// logic, the weighted state update) belongs to the AGC model, not here.
//
// Acquisition (all research/web-trajectory-b.md §3 and MR §9.11):
// - altitude ("range") data good once the beams see the ground: below an
//   acquisition altitude (nominal 39,000 ft ± 5,000 ft 3σ [NOM-A11]; Apollo
//   11 locked on at ≈37,000 ft, 102:37:51 [ACT]) and only within ≈40° of
//   the windows-up attitude (Apollo 11 locked on while still yawing, ≈8 s
//   before the face-up yaw ended [ACT/DER]);
// - velocity data good below ≈28,000 ft (MR §9.11 [ACT]);
// - zero-Doppler dropouts: Apollo 11 lost data twice near the surface
//   (102:44:11–21 and 102:44:59–45:03, MR Table 5-I [ACT]) "during manual
//   maneuvering". The beam geometry that caused them is not in the research,
//   so the model only drops the velocity data when the LM is almost
//   motionless relative to the ground (every beam's Doppler ≈ 0) [ASSUMED].
//
// The radar measures the height above the local terrain. The physics flies
// over a smooth sphere, so that is its own altitude.

import { LR } from './constants.js';
import { FPS } from '../util/units.js';

const SAMPLE_PERIOD = 0.25; // s between fresh noisy samples (held between) [ASSUMED]

export class LandingRadar {
  // opts: { rng, acqAltitude?, velAcqAltitude?, powered = true }
  constructor(opts = {}) {
    this.opts = opts;
    this.reset();
  }

  reset() {
    const o = this.opts;
    this.rng = o.rng || null;
    // Each run draws its own acquisition altitude from the nominal
    // distribution (seeded, so a seek re-simulates the same radar).
    const draw = this.rng ? this.rng.normal(0, 1) : 0;
    this.acqAltitude = Number.isFinite(o.acqAltitude)
      ? o.acqAltitude
      : LR.altAcqNominal + LR.altAcqSigma * Math.max(-3, Math.min(3, draw));
    this.velAcqAltitude = Number.isFinite(o.velAcqAltitude) ? o.velAcqAltitude : LR.velAcqAltitude;
    this.powered = o.powered !== false;
    this.altLocked = false;
    this.velLocked = false;
    this.sinceSample = Infinity;
    this.noise = { alt: 0, altRate: 0, vHoriz: 0 };
    this.state = { altValid: false, velValid: false, alt: null, altRate: null, vHoriz: null };
  }

  // truth: { alt, altRate, vHoriz, yaw, landed }
  update(truth, dt) {
    const st = this.state;
    if (!this.powered) {
      this.altLocked = this.velLocked = false;
    } else {
      const faceUp = Math.abs(normYaw(truth.yaw) - 180) <= LR.maxYawFromFaceUp;
      if (!faceUp) this.altLocked = false;
      else if (truth.alt <= this.acqAltitude) this.altLocked = true;
      // Once locked the radar keeps tracking all the way down (no upper
      // re-acquisition limit is needed for a descent).
      if (!this.altLocked) this.velLocked = false;
      else if (truth.alt <= this.velAcqAltitude) this.velLocked = true;
    }
    const still = Math.abs(truth.altRate) < 0.5 * FPS && Math.abs(truth.vHoriz) < 0.5 * FPS && !truth.landed;

    this.sinceSample += dt;
    if (this.sinceSample >= SAMPLE_PERIOD) {
      this.sinceSample = 0;
      if (this.rng) {
        const sAlt = Math.max(LR.altNoiseMin, LR.altNoiseFrac * Math.max(0, truth.alt));
        this.noise.alt = this.rng.normal(0, sAlt);
        this.noise.altRate = this.rng.normal(0, LR.velNoise);
        this.noise.vHoriz = this.rng.normal(0, LR.velNoise);
      }
    }

    st.altValid = this.altLocked;
    st.velValid = this.velLocked && !still;
    st.alt = st.altValid ? Math.max(0, truth.alt + this.noise.alt) : null;
    st.altRate = st.velValid ? truth.altRate + this.noise.altRate : null;
    st.vHoriz = st.velValid ? Math.max(0, truth.vHoriz + this.noise.vHoriz) : null;
    return st;
  }

  snapshot() {
    return { ...this.state };
  }
}

function normYaw(y) {
  const v = ((Number(y) || 0) % 360 + 360) % 360;
  return v;
}
