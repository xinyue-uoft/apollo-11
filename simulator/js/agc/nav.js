// The AGC's navigated state: what the computer *believes* about the LM,
// as opposed to the truth in the vehicle model. SERVICER updates it once
// per 2-s pass (Average-G: SERVICER.agc:175-241, MUNRVG :1041-1086), the
// landing radar corrects it (R12 inside SERVICER, MUNRETRN :717-783), and
// guidance and the DSKY nouns use it — so the computer flies, and shows, its
// own estimate.
//
// Model (a simplification of the real 9-state Average-G + radar filter,
// stated in the UI as such):
// - The estimate equals the vehicle's state except for an altitude error
//   `errAlt` (estimate − truth). Before the radar is allowed to correct it
//   the error grows with the altitude lost since ignition (`errPerFt`),
//   so the displayed altitude falls whenever the LM descends. The defaults
//   reproduce Apollo 11: 595 ft at PDI (the first N63 read 49,971 ft, Eyles
//   via research web-timeline-b.md §2, against the reconstructed 49,376 ft,
//   MR Table 5-III — the track's altitude) and DELTAH = −2,884 ft at TFI
//   304 s when Aldrin keyed V16N68 (Cherry's DSKY log, research
//   web-1202-b.md §4; voice "Delta-H is minus 2,900" at 102:38:11). On the
//   real flight that difference came from the PDI state error (MR §5.2)
//   and the terrain; the model keeps one calibrated number (MODEL
//   CALIBRATION, not a navigation filter). HDOTDISP shows the true rate.
// - Landing-radar processing follows SERVICER (research src-landing.md
//   §10): LR altitude reads once the computed altitude is below 50,000 ft
//   (35KCHK uses ALTCRIT+2 = 50KFT despite its name, SERVICER.agc:899-932);
//   velocity reads below 2,000 ft/s (VALTCHK, :1375-1394); data must be good
//   on two consecutive reads (STILBADH/STILBADV); DELTAH = LR altitude −
//   HCALC (POSUPDAT, :1110-1142, shown in N68 R3); after high gate a
//   reasonableness test |DELTAH| < DELQFIX + HCALC/8 (:1145-1162); only with
//   V57 (LRINH set, EXTENDED_VERBS.agc:431-434) is the estimate corrected,
//   with weight W = LRWH·(1 − HCALC/LRHMAX) (:1164-1204; LRWH 0.35,
//   LRHMAX 50,000 ft pad loads); velocity updates (VELUPDAT :1212-1372,
//   weights LRWV 0.3 · (1 − V/LRVMAX), LRWVF 0.2 below 200 ft/s, LRWVFF 0.1
//   in P65-P67) shrink the error growth `errPerFt`.
// - The ALT / VEL lamps (R12LITES, P20-P25.agc:5115-5180): steady on while
//   reads are requested but the data are not good; the "flashing" state for
//   unreasonable data is not modelled.
// - DVTOTAL (N62 R3) accumulates |ΔV| each pass (MOONSPOT, SERVICER.agc:
//   219-233); ABVEL is the inertial speed (:1061-1062).

import { FT, FPS, NMI } from '../util/units.js';
import { MOON_ROTATION_RATE } from '../vehicle/constants.js';
import { slantRange } from './guidance/landing-guidance.js';

export const NAV_MODEL = Object.freeze({
  // Estimate error at TIG and its growth per foot of altitude lost until
  // incorporated (see header; model calibration): 595 ft at PDI, 2,884 ft
  // at 102:38:09 when the track is at 33,147 ft (49,376 ft at PDI).
  errAltAtTig: 595 * FT,
  errPerFt: (2884 - 595) / (49376 - 33147),
  altAtTig: 49376 * FT,        // BET altitude at PDI, MR Table 5-III (mid-flight starts)
  // Pad loads (LM Data Book, research src-landing.md §13.1) and SERVICER
  // constants (§13.2).
  lrhmax: 50000 * FT,          // LRHMAX
  lrwh: 0.35,                  // LRWH
  readLrBelow: 50000 * FT,     // ALTCRIT + 2 = 50KFT
  xorBelow: 30000 * FT,        // XORCHK: X-axis override inhibited below 30,000 ft
  readVelBelow: 2000 * FPS,    // 2KFT/SEC
  lrvmax: 2000 * FPS,          // LRVMAX
  lrvf: 200 * FPS,             // LRVF
  lrwv: 0.3,                   // LRWVZ/Y/X
  lrwvf: 0.2,                  // LRWVFZ/Y/X
  lrwvff: 0.1,                 // LRWVFF (P65, P66, P67)
  delqfix: 200 * FT,           // DELQFIX
  goodReads: 2,                // STILBADH / STILBADV
  deltaHInit: 99999 * FT,      // 99999CON "FOR V16N68 DISPLAY" (THE_LUNAR_LANDING.agc:267)
});

export class NavState {
  constructor(agc, options = {}) {
    this.agc = agc;
    this.model = { ...NAV_MODEL, ...(options || {}) };
    this.reset();
  }

  reset() {
    this.t = null;              // PIPTIME of the estimate (s GET)
    this.alt = 0;
    this.altRate = 0;
    this.vHoriz = 0;
    this.vCross = 0;
    this.range = 0;
    this.vInertial = 0;
    this.mass = 0;
    this.thrust = 0;
    this.pitch = null;
    this.errAlt = 0;
    this.errPerFt = 0;          // error growth per unit of altitude lost
    this.growFrom = null;       // GET from which errAlt grows (ignition)
    this.truthAlt = null;       // the truth at the last update
    this.readLr = false;        // READLR
    this.readVel = false;       // READVEL
    this.xor = false;           // XORFLG
    this.pastHighGate = false;  // PSTHIGAT
    this.goodH = 0;
    this.goodV = 0;
    this.deltaH = null;         // m (null until the first good LR read)
    this.lrIncorporating = false;
    this.velIncorporating = false;
    this.lastIncorporation = null;
    this.passes = 0;
  }

  // Start the error model for a burn igniting at `tig` (P63). `at`: the
  // present time, for a start in mid-flight (presets / scenarios); with
  // `incorporated` the radar is assumed to have corrected the estimate.
  arm({ tig, at = null, incorporated = false } = {}) {
    const m = this.model;
    this.growFrom = tig;
    this.errPerFt = m.errPerFt;
    this.errAlt = m.errAltAtTig;
    this.truthAlt = null;
    if (at !== null && at > tig) {
      if (incorporated) {
        this.errAlt = 0;
        this.errPerFt = 0;
      } else {
        const alt = this.truth().alt;
        this.errAlt += m.errPerFt * Math.max(0, m.altAtTig - alt);
        this.truthAlt = alt;
      }
    }
    if (this.agc.erasable) this.agc.erasable.DELTAH = toFt(m.deltaHInit);
  }

  // Error growth from the truth's altitude change since the last update.
  grow(t, alt) {
    if (this.growFrom !== null && t >= this.growFrom && this.truthAlt !== null && alt < this.truthAlt) {
      this.errAlt += this.errPerFt * (this.truthAlt - alt);
    }
    if (this.growFrom === null || t >= this.growFrom) this.truthAlt = alt;
  }

  // The vehicle's state (truth) in SI, plus the inertial speed.
  truth() {
    const s = this.agc.vehicle?.state || {};
    const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
    const alt = num(s.alt);
    const vHoriz = num(s.vHoriz);
    const altRate = num(s.altRate);
    let vInertial = s.vInertial;
    if (!Number.isFinite(vInertial)) {
      // Surface-relative → inertial: the descent orbit is retrograde w.r.t.
      // lunar rotation, so inertial ≈ relative − ω·r (research
      // web-trajectory-b.md §2: inertial + 13-15 ft/s = relative).
      const r = 1737400 + alt;
      vInertial = Math.hypot(vHoriz - MOON_ROTATION_RATE * r, altRate);
    }
    return {
      alt, altRate, vHoriz, vCross: num(s.vCross), range: num(s.range),
      vInertial, mass: num(s.mass), thrust: num(s.thrust), pitch: Number.isFinite(s.pitch) ? s.pitch : null,
      lr: s.lr || null, landed: !!s.landed, engineOn: !!s.engineOn,
    };
  }

  // One SERVICER pass at time t (navigation part of the job).
  servicerPass(t) {
    const m = this.model;
    const agc = this.agc;
    const flags = agc.flags || {};
    const e = agc.erasable;
    const tr = this.truth();
    const dt = this.t === null ? 0 : Math.max(0, t - this.t);
    this.passes += 1;

    this.grow(t, tr.alt);

    // MOONSPOT: DVTOTAL += |ΔV| (ft/s on the DSKY); the RCS ullage is not
    // counted (the model has no PIPA reading of it).
    if (dt > 0 && tr.engineOn && tr.thrust > 0 && tr.mass > 0) {
      e.DVTOTAL = (Number.isFinite(e.DVTOTAL) ? e.DVTOTAL : 0) + toFps((tr.thrust / tr.mass) * dt);
    }

    this.t = t;
    this.altRate = tr.altRate;
    this.vHoriz = tr.vHoriz;
    this.vCross = tr.vCross;
    this.range = tr.range;
    this.vInertial = tr.vInertial;
    this.mass = tr.mass;
    this.thrust = tr.thrust;
    this.pitch = tr.pitch;
    this.alt = tr.alt + this.errAlt;

    this.lrIncorporating = false;
    this.velIncorporating = false;
    if (!flags.LRBYPASS) this.radar(tr, flags);

    this.publish();
    return this;
  }

  // Extrapolate the estimate to time t without a new SERVICER pass (P66's
  // RODCOMP projects ḣ and h to its own sample time, LLGE:1001-1030; CALLT-35
  // initialises ABVEL, BBB:242-245). No radar processing, no DVTOTAL.
  refresh(t) {
    const tr = this.truth();
    this.grow(t, tr.alt);
    this.t = t;
    this.altRate = tr.altRate;
    this.vHoriz = tr.vHoriz;
    this.vCross = tr.vCross;
    this.range = tr.range;
    this.vInertial = tr.vInertial;
    this.mass = tr.mass;
    this.thrust = tr.thrust;
    this.pitch = tr.pitch;
    this.alt = tr.alt + this.errAlt;
    this.publish();
    return this;
  }

  // R12 (MUNRETRN) for this pass.
  radar(tr, flags) {
    const m = this.model;
    const agc = this.agc;
    const lr = tr.lr || {};
    // 35KCHK / XORCHK.
    if (!this.readLr && this.alt <= m.readLrBelow) this.readLr = true;
    if (!this.xor && this.alt <= m.xorBelow) {
      this.xor = true;
      flags.XOVINFLG = true;
    }
    // Altitude (LRHJOB once per cycle, POSUPDAT).
    if (this.readLr) {
      if (lr.altValid && Number.isFinite(lr.alt)) this.goodH += 1;
      else this.goodH = 0;
      if (this.goodH >= m.goodReads) {
        const deltaH = lr.alt - this.alt;
        this.deltaH = deltaH;
        const reasonable = !this.pastHighGate || Math.abs(deltaH) < m.delqfix + this.alt / 8;
        if (reasonable && flags.LRINH && this.alt < m.lrhmax) {
          const w = m.lrwh * (1 - Math.max(0, this.alt) / m.lrhmax);
          this.errAlt += w * deltaH;
          this.alt = tr.alt + this.errAlt;
          this.lrIncorporating = true;
          this.lastIncorporation = { t: this.t, weight: w, deltaH };
        }
      }
    }
    // Velocity (VALTCHK → LRVJOB, VELUPDAT).
    if (!this.readVel && this.readLr && this.vInertial < m.readVelBelow) this.readVel = true;
    if (this.readVel) {
      if (lr.velValid) this.goodV += 1;
      else this.goodV = 0;
      if (this.goodV >= m.goodReads && flags.LRINH) {
        const v = this.vInertial;
        let w;
        if ((agc.mode ?? 0) > 64) w = m.lrwvff;
        else if (v < m.lrvf) w = m.lrwvf;
        else if (v > m.lrvmax) w = 0;
        else w = m.lrwv * (1 - v / m.lrvmax);
        this.errPerFt *= 1 - w;
        this.velIncorporating = w > 0;
      }
    }
    // R12LITES: lamps on while the data are requested but not good.
    if (agc.dsky && !agc.dsky.lampTest) {
      agc.dsky.setLight('alt', this.readLr && this.goodH === 0);
      agc.dsky.setLight('vel', this.readLr && (!this.readVel || this.goodV === 0));
    }
  }

  // The display quantities SERVICER leaves in erasable (display units).
  publish() {
    const e = this.agc.erasable;
    e.HCALC = toFt(this.alt);
    e.HCALC1 = e.HCALC;
    e.HDOTDISP = toFps(this.altRate);
    e.ALTRATE = e.HDOTDISP;
    e.ABVEL = toFps(this.vInertial);
    e.VHORIZ = toFps(Math.hypot(this.vHoriz, this.vCross));
    e.FORVEL = toFps(this.vHoriz);
    e.RANGEDSP = slantRange(this.guidanceNav()) / NMI;
    if (this.deltaH !== null) e.DELTAH = toFt(this.deltaH);
  }

  // The navigated state in the form landing-guidance.js expects (SI).
  guidanceNav(extra = {}) {
    return {
      alt: this.alt,
      altRate: this.altRate,
      vHoriz: this.vHoriz,
      vCross: this.vCross,
      range: this.range,
      mass: this.mass,
      thrust: this.thrust,
      pitch: Number.isFinite(this.pitch) ? this.pitch : undefined,
      ...extra,
    };
  }

  snapshot() {
    return {
      t: this.t,
      alt: this.alt,
      altRate: this.altRate,
      vHoriz: this.vHoriz,
      range: this.range,
      vInertial: this.vInertial,
      errAlt: this.errAlt,
      errPerFt: this.errPerFt,
      deltaH: this.deltaH,
      readLr: this.readLr,
      readVel: this.readVel,
      lrIncorporating: this.lrIncorporating,
      velIncorporating: this.velIncorporating,
      pastHighGate: this.pastHighGate,
    };
  }
}

function toFt(m) {
  return m / FT;
}

function toFps(v) {
  return v / FPS;
}
