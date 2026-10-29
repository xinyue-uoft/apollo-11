// Lunar Module "Eagle" (LM-5) and descent-engine (DPS) constants used by the
// vehicle models, the landing guidance and the historical replay.
//
// Every number carries the label of research/web-trajectory-b.md (§ "How
// each value is labeled") so that its pedigree stays visible:
//   [ACT]      actual Apollo 11 flight value (telemetry / Mission Report)
//   [NOM-A11]  Apollo 11 pre-flight / pad-loaded value
//   [GEN]      generic LM / DPS design value
//   [DER]      derived from cited values (method stated)
//   [CODE]     constant in this repository's Luminary099 listing
//   [ASSUMED]  simulator choice with no primary source (said so where used)
// Short source keys: MR = Apollo 11 Mission Report MSC-00171; BEN70 =
// Bennett TM X-58040; AER-DPS = Hammock et al. TN D-7143; PAD = Grumman LM
// Data Book "G Prelaunch Erasable Load (LUMINARY 99)"; PK = Apollo 11 press
// kit; TLB = Apollo 11 LM Timeline Book.
//
// SI internally (util/units.js); the historical unit is kept in a comment.

import { FT, FPS, LB, LBF, G0 } from '../util/units.js';

// ---------- the Moon ----------

// Sidereal rotation rate, 2π per 27.321661 days [GEN]. At the equator this
// moves the surface at 4.62 m/s (15.2 ft/s); Eagle flew east to west, so
// its speed over the ground was its inertial speed + ≈13–15 ft/s
// (research/web-trajectory-b.md §2, BEN70 Table I) [DER].
export const MOON_ROTATION_RATE = (2 * Math.PI) / (27.321661 * 86400);   // rad/s

// ---------- descent propulsion system (TRW LMDE) ----------

export const DPS = Object.freeze({
  // Design ("maximum-rated") thrust, 10,500 lbf [GEN] (AER-DPS p.7; BEN70).
  // Throttle fractions everywhere in the simulator are fractions of this
  // value, as in every source ("10 %", "57 %", "92.5 %").
  ratedThrust: 10500 * LBF,                    // 46,706 N

  // Minimum throttle: the manual throttle "nominally set at minimum ...
  // provides the lower bound" (Luminary099/THROTTLE_CONTROL_ROUTINES.agc:63-65).
  // 10 % [GEN] (BEN70; crew call "Ignition. 10 percent", ALSJ 102:33:11);
  // MR §9.8.1 measured 13 % on Apollo 11 [ACT] — we use the nominal 10 %.
  minFraction: 0.10,

  // Top of the continuously throttleable band. Sources differ: 60 % (BEN70,
  // PK), 65 % (AER-DPS: "65–92.5 % is a nonoperating region"), "11 to 65 %"
  // (Klumpp R-695) [GEN]. 65 % is used; commands between this and the fixed
  // throttle position are not flown (the LGC never asks for them, see
  // HIGHCRIT below), so the physics snaps them to the fixed position.
  maxThrottleableFraction: 0.65,

  // Fixed throttle position (FTP, the hardware stop). The flown LGC models
  // it as FMAXPOS = 3467 pulses "FMAX +4.34546769E+4" N = 9,769 lbf ≈ 93 %
  // [CODE] (Luminary099/CONTROLLED_CONSTANTS.agc:129). Real engines sat at
  // 92.5–95.5 % (BEN70 p.5); PK and Eyles quote 9,870 lbf (94 %) [NOM-A11].
  // The physics uses the LGC's own value so that the computer's model of
  // the engine and the simulated engine agree.
  ftpThrust: 4.34546769e4,                     // N
  get ftpFraction() { return this.ftpThrust / this.ratedThrust; },

  // Exhaust velocity used by the flown LGC: DPSVEX = 2955.88868 m/s
  // (Isp 301.4 s) [CODE] (CONTROLLED_CONSTANTS.agc:97; the AGC stores it
  // negative in m/cs). AER-DPS's design requirement is 305 s [GEN].
  exhaustVelocity: 2955.88868,                 // m/s
  get isp() { return this.exhaustVelocity / G0; },

  // Engine response lag THROTLAG = 20 cs [CODE] (CONTROLLED_CONSTANTS.agc:130)
  // and the throttling rate FRATE = 32 pulses per centisecond
  // (THROTTLE_CONTROL_ROUTINES.agc:143) at SCALEFAC = 0.0797959872 pulse/N
  // [CODE] (CONTROLLED_CONSTANTS.agc:131) → ≈ 40,100 N/s (≈ 86 % per s).
  throttleLag: 0.2,                            // s
  scaleFac: 0.0797959872,                      // throttle pulses per N
  get throttleRate() { return 3200 / this.scaleFac; },   // N/s
});

// The LGC's throttle-logic constants (THROTTLE_CONTROL_ROUTINES.agc).
export const THROTTLE_LOGIC = Object.freeze({
  // FMAXPOS (FMAX) and FMAXODD (FSAT) [CODE] CONTROLLED_CONSTANTS.agc:128-129.
  fMaxPos: 4.34546769e4,                       // N, 3467 pulses
  fMaxOdd: 4.81454413e4,                       // N, 3841 pulses
  // Pad-loaded hysteresis thresholds [NOM-A11] (PAD p.LM5/4.5.1-8):
  // LOWCRIT 2124.4 pulses = 5,985 lbf (≈57 %): leave the FTP ("throttle
  // recovery") when the guidance demand drops to or below it;
  // HIGHCRIT 2348.0 pulses = 6,615 lbf (≈63 %): go back to the FTP when the
  // demand rises above it.
  lowCrit: 5985 * LBF,                         // 26,623 N
  highCrit: 6615 * LBF,                        // 29,425 N
  // HIGHESTF = 4.34546769 B-12 (N): the thrust the guidance assumes is
  // available when it limits the braking component (AFCCALC,
  // LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:609-627,1466) [CODE].
  highestF: 4.34546769e4,
});

// ---------- masses and propellant ----------

export const LM = Object.freeze({
  // LM at DOI cutoff 33,401.6 lb [ACT] (MR Table A-I) minus ≈10–20 lb of RCS
  // for attitude and the 7.5-s ullage → ≈ 33,390 lb at PDI [DER].
  massAtPdi: 33390 * LB,                       // 15,145 kg
  // LM at lunar landing 16,153.2 lb [ACT] (MR Table A-I).
  massAtLanding: 16153.2 * LB,                 // 7,327 kg
  // DPS propellant loaded 18,184 lb [ACT] (MR §9.13.1). The fuel fraction
  // reported by the vehicles is "remaining / loaded", i.e. what the
  // propellant-quantity gauges show in percent (the PQGS reads at most 95 %:
  // TLB shows 95 % at ignition) [DER].
  dpsLoaded: 18184 * LB,                       // 8,248 kg
  // In the tanks at PDI: 18,184 lb loaded minus ≈ 268 lb used by DOI
  // → ≈ 17,916 lb [DER] (research §1.3).
  dpsAtPdi: 17916 * LB,                        // 8,127 kg
  // Unusable (trapped) propellant: 250.5 lb premission [NOM-A11] (BEN70
  // Table II); "about 100 lb" of the 770 lb left at cutoff [ACT] (ALSJ).
  // The physics stops the engine when usable propellant is gone.
  dpsUnusable: 100 * LB,
  // Remaining at engine cutoff: 770 lb [ACT] (MR §9.13.1).
  dpsAtCutoff: 770 * LB,
  // Low-level sensor: 5.6 % in any tank [GEN] (AER-DPS p.6). Apollo 11's
  // light latched early (≈20 s) because of slosh [ACT] (BEN72; ALSJ).
  lowLevelFraction: 0.056,
  // RCS propellant used during the powered descent ≈ 95 lb [ACT] (MR §5.3).
  // Not modelled in the physics (its thrust is negligible here).
  rcsUsedInDescent: 95 * LB,
  // Lunar-surface sensing probes extend 67 in = 5.6 ft below the footpads;
  // their contact lights LUNAR CONTACT [ACT] (research §5.2, MR).
  probeLength: (67 / 12) * FT,                 // 1.70 m
});

// ---------- landing radar ----------

export const LR = Object.freeze({
  // LGC thresholds (SERVICER.agc): altitude reads start when HCALC < 50,000 ft
  // (ALTCRIT+2 = 50KFT, :899-909, :924-932 — despite the "35KCHK" label);
  // velocity reads when ABVEL < 2,000 ft/s (2KFT/SEC, :1375-1394) [CODE];
  // LRHMAX 50,000 ft and LRVMAX 2,000 ft/s are pad loads [NOM-A11].
  lgcAltReadBelow: 50000 * FT,
  lgcVelReadBelow: 2000 * FPS,
  // Hardware "data good": Apollo 11 acquired range at ≈44,000 ft slant
  // range and velocity at ≈28,000 ft (MR §9.11) [ACT]; nominal LR altitude
  // update at 39,201 ft (BEN70 Table I) with an expected 39,000 ± 5,000 ft
  // (3σ) [NOM-A11]. The physics draws each run's acquisition altitude from
  // that distribution with the seeded rng.
  altAcqNominal: 39000 * FT,
  altAcqSigma: (5000 / 3) * FT,
  velAcqAltitude: 28000 * FT,
  // The radar can only see the ground once the LM is windows-up (yaw-around
  // done or nearly): Apollo 11 locked on while still rotating, ≈8 s before
  // the face-up yaw was complete at ≈4°/s (research §3) → within ≈40° of
  // face-up [DER].
  maxYawFromFaceUp: 40,                        // deg
  // Measurement noise: no primary source in the research — a small,
  // seeded scatter so the AGC's estimate visibly converges [ASSUMED].
  altNoiseFrac: 0.002,
  altNoiseMin: 2 * FT,
  velNoise: 0.4 * FPS,
});

// ---------- touchdown evaluation ----------

// Sandbox scoring only [ASSUMED]: the research reports give no LM landing-
// gear limits, so these are conservative simulator thresholds (Apollo 11
// touched down at 1.7 ft/s down, 2.1 ft/s lateral, negligible forward [ACT],
// MR §5.4 — well inside them).
export const TOUCHDOWN_LIMITS = Object.freeze({
  maxVertical: 10 * FPS,
  maxHorizontal: 4 * FPS,
  maxTilt: 12,                                 // deg from vertical
  hardVertical: 15 * FPS,                      // beyond this: crash
});

// ---------- attitude ----------

export const ATTITUDE = Object.freeze({
  // Attitude-rate limit while following the guidance's thrust direction.
  // No primary source in the research [ASSUMED] — a moderate 10°/s lets the
  // P64 pitch-over (≈55° → 45°, research §4.4) happen "quickly" as flown.
  pitchRate: 10,                               // deg/s
  // The face-up yaw: Apollo 11 took ≈73 s (102:36:46–102:37:59) because the
  // rate scale was at 5°/s (ALSJ); the plan was 10°/s (MR §9.6.4) and the
  // crew quoted "5 to 7" (debriefing) [ACT]. 6°/s is used [ASSUMED].
  yawRate: 6,                                  // deg/s
  // Nominal start of the yaw to windows-up: TFI 2:56 (BEN70 Table I)
  // [NOM-A11].
  yawAroundAfterIgnition: 176,                 // s
});
