// The Apollo 11 powered descent as a GET-stamped track for the replay
// vehicle (js/vehicle/replay.js), the trajectory view and the physics
// presets (LmPhysics / stateFromTrack). Historical units are kept here
// (ft, ft/s, %, deg; mass in kg); replay.js converts to SI.
//
// Every number comes from research/web-trajectory-b.md (numbers) and
// research/web-timeline-b.md (times and callouts); their labels are kept:
//   [ACT] flown value (telemetry, postflight reconstruction, Mission Report)
//   [ACT-crew] crew/DSKY callout from the transcript (time ±2 s, see below)
//   [NOM-A11] Apollo 11 pre-flight / pad-loaded value
//   [DER] derived here from cited values (method in SOURCE_NOTES)
// Source keys: MR = Apollo 11 Mission Report MSC-00171 (Table 5-I event
// times, Tables 5-III/9.6-V, §5.3–5.4, §9.8, §9.11, Fig. 5-2/5-3);
// TRW = TRW Note 70-FMT-819 Fig. 7-39 (reconstructed altitude above the
// landing-site radius, 10-s digitisation); TLB = Apollo 11 LM Timeline
// Book p.9; BEN70 = Bennett TM X-58040 (Table I, Figs. 21-22); BEN72 = TN
// D-6846 Fig. 9; ALSJ = Apollo Lunar Surface Journal; ONB = onboard voice
// transcription; PAD = LM Data Book prelaunch erasable load (Luminary 99).
//
// WHAT "ALTITUDE" MEANS HERE. `alt` is the height of the footpads above the
// local surface — what the landing radar measured and what the DSKY showed
// once the radar data were incorporated (V57, 102:38:45; ΔH converged within
// ≈30 s, MR §5.3). It differs from TRW's altitude above the landing-site
// radius by the terrain under the LM: 7,129 ft on the DSKY at P64 (MR) vs
// ≈6,570 ft above the site radius (TRW) — research §5.1, §8. Before the
// radar was incorporated the computer's own altitude was ≈2,900 ft too high
// (ΔH −2,900 at 102:38:11, ALSJ); that is a navigation error the AGC model
// adds (js/agc/nav.js), not part of this track. 102:45:39.9 is the landing
// itself: "Landing on the surface occurred at 102:45:39.9 … Body rate
// transients (motions after first footpad touchdown) … indicate that the
// right and the forward landing gear touched almost simultaneously" (MR
// §5.4), with the engine still running until cutoff at 102:45:41.4 ("engine
// shutdown occurring almost simultaneously with touchdown", MR §3;
// Armstrong: "We actually had the engine running until touchdown", ALSJ).
// So the footpads reach alt 0 at 102:45:39.9, and the lunar contact light
// (probes 67 in below the footpads) came on earlier, at ≈102:45:36.6 [DER:
// where this track passes 5.6 ft at ≈1.6 ft/s]; Aldrin's "Contact Light" at
// 102:45:40 is the voice, a few seconds behind the lamp.
//
// WHAT "RANGE" MEANS HERE. `range` is the distance along the surface to the
// point the computer was steering for (its landing site LAND, the automatic
// aim point), positive while uprange. Eagle landed ≈1,100 ft beyond it
// (manual flying, BEN70 p.23, MR §5.3) and ≈6.6 km beyond the *planned*
// site in lunar map coordinates, almost all of it the ≈21,000-ft PDI
// navigation error that shifted the computer's aim point itself (MR §5.2,
// Table 5-IV; research §3.1) — see SITES.
//
// Timing rule (web-timeline-b.md): computer events use Mission Report
// times; voice callouts lag them by 0–13 s. The callouts below use ALSJ
// voice times unless noted.

import { parseGET } from '../util/time.js';

// ---------- what each segment of the keyframe table is based on ----------

export const SOURCE_NOTES = Object.freeze({
  coast: 'Descent-orbit coast [DER]: Keplerian flight integrated backward from the PDI state '
    + '(alt 49,376 ft BET [ACT, MR Table 5-III]; altitude rate −2.2 ft/s and 5,559.7 ft/s inertial, '
    + 'the first N63 after ignition [ACT, Eyles via web-timeline-b]) with the Moon of util/units.js. '
    + 'It implies a 58.7 × 8.1 nmi descent orbit (PGNCS 57.2 × 9.1, MR Table 7-V 58.5 × 7.8 nmi, research §2) and '
    + 'the PGNCS "50,000 ft" event at 102:32:55 to within the PGNCS 580-ft bias. Pitch: the PDI '
    + 'attitude held since the R60 manoeuvre (≈102:12:13, ALSJ) [DER from the braking-phase fit].',
  braking: 'P63 braking phase. Altitude/rate [DER]: one least-squares fit (piecewise-linear rate, '
    + '10-s grid) through PDI 49,376 ft [ACT BET], the TLB nominal heights shifted by a blend '
    + '(+576 ft at PDI → −1,140 ft at TFI 5:00, quadratic in time) [NOM-A11 → DER], TRW 102:38:05–'
    + '102:42:50 [ACT, ±150 ft] plus the terrain offset under the LM (0 at 102:39:00 rising to '
    + '+555 ft at P64, the DSKY−TRW difference at 102:41:32) [DER], MR P64 7,129 ft / −125 ft/s '
    + '[ACT]. Residuals ≤ 130 ft. Horizontal velocity [DER]: integrated from the PDI state with the '
    + 'LGC engine model (10 % for the 26-s trim, FMAXPOS 9,769 lbf to 102:39:31, then 58 %), the '
    + 'LGC mass flow (DPSVEX) and the fitted altitude profile; it matches the TLB/BEN70 nominal '
    + 'inertial velocities within 50 ft/s (+15 ft/s lunar rotation, research §2). Throttle: 10 % '
    + '[ACT-crew; MR §9.8.1 measured 13 %], FTP from 102:33:30.36 (P63ZOOM at nominal TIG '
    + '102:33:04.36 + ZOOMTIME 26 s [PAD/CODE]; crew report 102:33:31 [ACT]), throttle recovery '
    + '102:39:31 [ACT MR] to 58 % [DER: KLUMPP ≈57 % design, chosen so the integrated velocity '
    + 'meets BEN70 high gate]. Pitch (thrust axis from local vertical) [DER] from the vertical '
    + 'acceleration the altitude profile needs and the thrust: 92° → 70° at FTP, ≈57° after '
    + 'throttle-down (ALSJ ≈59° at 102:40:13; BEN72 55° at high gate).',
  approach: 'P64 approach phase. Altitude/rate [DER]: the same fit through TRW + terrain offset and '
    + 'the DSKY callouts (CALLOUTS). Horizontal velocity [DER]: the approach-target polynomial '
    + 'ż(T) = VTG + ATG·T + JTG·T²/2 + S·T³/6 (PAD targets, research §4.2) with the snap S fitted to '
    + 'the MR high-gate range 26,000 ft at T = −168 s — it reproduces BEN72 Fig. 9 tick spacing and '
    + 'the 68 ft/s low-gate speed (BEN70). Throttle and pitch [DER] from the kinematics and the '
    + 'mass (8-s moving average): ≈57 % / 52° at P64 falling to ≈32 % / 16° at 600 ft.',
  manual: 'Manual phase: ATT HOLD at 102:43:13 [ACT MR] and P66 from 102:43:22 [ACT MR]. '
    + 'Altitude/rate [DER]: the same fit through the P66 callouts (residuals ≤ 10 ft). Forward '
    + 'velocity: the callouts [ACT-crew] joined by a monotone cubic. Pitch [DER] from the forward '
    + 'deceleration: ≈5° while overflying the boulder field, ≈16° to slow down near 102:43:55 '
    + '(ALSJ: "pitch ~5–6°", "back to ~16°"). Throttle [DER] ≈26–30 % (AER-DPS: ≈26 % ± 7.5 % over '
    + 'the last 140 s [ACT]).',
  touchdown: 'Footpads on the surface 102:45:39.9 at 1.7 ft/s down, 2.1 ft/s to the left, negligible '
    + 'forward velocity [ACT MR §5.4]; the last 18 s of the altitude fit are lowered smoothly (≤ 5.6 ft, '
    + 'rate change ≤ 0.5 ft/s) from 102:45:22 so that alt reaches 0 there with that rate [DER]. Lunar '
    + 'contact light (67-in probes) ≈102:45:36.6, where the track passes 5.6 ft [DER]. Engine still '
    + 'running on the surface until cutoff 102:45:41.4 [ACT MR Table 9.6-V; MR §3; Armstrong in ALSJ]. '
    + 'At rest ≈102:45:40.2 [DER: MR §5.4 postflight simulation, footpads penetrated 2.5–3.5 in, struts '
    + 'stroked < 1 in, slide-out 1–3 in — a few tenths of a second at 1.7 ft/s]. Range: the P66-phase '
    + 'drift correction (see range) now ends at 102:45:39.9 [DER].',
  surface: 'On the surface. LM mass at landing 16,153.2 lb [ACT MR Table A-I]; 770 lb of DPS '
    + 'propellant left at cutoff [ACT MR §9.13.1].',
  fuel: 'Fuel % = DPS propellant remaining / 18,184 lb loaded [DER]: 17,916 lb at PDI (loaded '
    + 'minus ≈268 lb for DOI) and 770 lb at cutoff [ACT MR §9.13.1]; in between, the LGC engine '
    + 'model\'s mass flow (its total, 17,161 lb, differs from the actual 17,146 lb by 0.1 %, scaled '
    + 'to match). Mass = 15,145 kg at PDI [DER] − DPS use − 95 lb RCS [ACT MR §5.3] → 7,331 kg at '
    + 'contact (MR Table A-I: 7,327.0 kg at landing). The crew\'s gauge callouts — "Eight percent" '
    + '(102:44:00) and "Five percent" (102:44:45) — read 1–2 % lower than this tank average '
    + '(single gauges; they differed by up to 3 % at landing, AER-DPS p.27).',
  range: 'Range to the computer\'s aim point [DER]: the horizontal velocity integrated backward '
    + 'from the footpads at 102:45:39.9 (−1,100 ft, i.e. beyond the aim point, BEN70 p.23/MR §5.3) and '
    + 'corrected linearly onto two anchors: 26,000 ft at P64 (MR Fig. 5-2, −346 ft) and 1,900 ft at P66 '
    + '(BEN70 Fig. 22, +374 ft, tapering to 0 at the footpads). PDI comes out at 261.7 nmi (research: '
    + '≈260 nmi; TLB integration 261 nmi).',
});

// ---------- keyframes ----------

// Yaw: 0 = windows down (face down, as at PDI), 180 = windows up. Face-up
// yaw "Rolling over" 102:36:46 (ALSJ) — slow, because the rate scale was
// left at 5°/s until ≈102:37:03 (ALSJ/Fjeld; debriefing) — and complete at
// 102:37:59 (MR Table 5-I) [ACT times, DER shape: radar lock-on 102:37:51
// came "while rotating at ~4°/s"].
export const YAW = Object.freeze([
  ['102:36:46', 0], ['102:37:03', 25], ['102:37:59', 180],
]);

// Lateral velocity (positive = to the crew's right): 2.1 ft/s to the left
// at touchdown [ACT MR §5.4]; not recorded before (taken as 0) [DER];
// stopped by the footpads within a few tenths of a second (1–3 in of
// slide-out, MR §5.4) [DER].
export const VCROSS = Object.freeze([
  ['102:45:25', 0], ['102:45:39.9', -2.1], ['102:45:40.2', 0],
]);

// Discrete states as [start, end) intervals (end null = to the end).
export const INTERVALS = Object.freeze({
  // DPS ignition 102:33:05.01, computer cutoff 102:45:41.40 [ACT MR Table 9.6-V].
  engineOn: [['102:33:05.01', '102:45:41.4']],
  // Propellant-settling RCS firing from 102:32:58 [ACT MR Table 5-I] to
  // TIG + 0.5 s (ULLAGOFF, BURN_BABY_BURN...agc:530-540) [CODE].
  ullage: [['102:32:58', '102:33:05.51']],
  // Landing-radar "data good": range at 102:37:51 [ACT MR Table 5-I];
  // velocity ≈28,000 ft [ACT MR §9.11] → 102:38:48 on this track [DER]; both
  // lost 102:44:11–21 and 102:44:59–45:03 [ACT MR Table 5-I].
  lrAlt: [['102:37:51', '102:44:11'], ['102:44:21', '102:44:59'], ['102:45:03', null]],
  lrVel: [['102:38:48', '102:44:11'], ['102:44:21', '102:44:59'], ['102:45:03', null]],
  // Lunar contact light ≈102:45:36.6 [DER, see the header]; `landed` = at
  // rest on the surface, ≈0.3 s after the footpads touched at 102:45:39.9
  // (SOURCE_NOTES.touchdown) — the engine runs on to 102:45:41.4.
  contact: [['102:45:36.6', null]],
  landed: [['102:45:40.2', null]],
});

function k(t, alt, altRate, vHoriz, range, throttle, fuel, mass, pitch, source) {
  return Object.freeze({ t, alt, altRate, vHoriz, range, throttle, fuel, mass, pitch, source });
}

// t (GET), alt (ft), altRate (ft/s), vHoriz (ft/s, surface-relative),
// range (ft to the aim point), throttle (% of 10,500 lbf), fuel (% of
// loaded), mass (kg), pitch (deg), source (key of SOURCE_NOTES).
// Generated once from the cited data with the fits described in
// SOURCE_NOTES (the generator is not part of the simulator); the engine-on
// state, yaw, lateral velocity, radar and contact states come from YAW,
// VCROSS and INTERVALS.
export const KEYFRAMES = Object.freeze([
  k('102:10:05.01', 162759.5, -136.93, 5467.8, 9111777, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:11:05.01', 154603.9, -134.85, 5475.4, 8792373, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:12:05.01', 146585.9, -132.34, 5482.8, 8472088, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:13:05.01', 138731.1, -129.41, 5490.2, 8150934, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:14:05.01', 131064.9, -126.06, 5497.3, 7828928, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:15:05.01', 123611.9, -122.3, 5504.3, 7506088, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:16:05.01', 116396.6, -118.14, 5511.1, 7182436, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:17:05.01', 109442.7, -113.59, 5517.7, 6857996, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:18:05.01', 102773.3, -108.66, 5524, 6532797, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:19:05.01', 96410.6, -103.37, 5530, 6206869, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:20:05.01', 90375.9, -97.73, 5535.7, 5880244, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:20:53', 85799.1, -92.98, 5540.1, 5618522, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:21:05.01', 84689.8, -91.76, 5541.2, 5552959, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:22:05.01', 79371.5, -85.47, 5546.2, 5225053, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:23:05.01', 74439.1, -78.89, 5550.9, 4896566, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:24:05.01', 69909.8, -72.04, 5555.3, 4567542, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:25:05.01', 65799.1, -64.94, 5559.2, 4238026, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:26:05.01', 62121.2, -57.62, 5562.7, 3908065, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:27:05.01', 58889, -50.09, 5565.8, 3577710, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:28:05.01', 56113.9, -42.39, 5568.5, 3247011, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:29:05.01', 53805.4, -34.54, 5570.7, 2916020, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:30:05.01', 51971.8, -26.57, 5572.5, 2584792, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:31:05.01', 50619.4, -18.5, 5573.8, 2253380, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:32:05.01', 49753.2, -10.37, 5574.6, 1921841, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:32:58', 49394.8, -3.16, 5575, 1628976, 0, 98.53, 15145, 91.6, 'coast'),
  k('102:33:05.01', 49376, -2.2, 5575, 1590231, 10, 98.53, 15145, 91.6, 'braking'),
  k('102:33:15.01', 49345.4, -3.92, 5565.5, 1535005, 10, 98.33, 15129, 91.6, 'braking'),
  k('102:33:25.01', 49297.1, -5.75, 5555.9, 1479875, 10, 98.14, 15113, 91.6, 'braking'),
  k('102:33:30.36', 49263.4, -6.83, 5550.7, 1450420, 10, 98.04, 15104, 91.6, 'braking'),
  k('102:33:31.36', 49256.5, -7.04, 5541.7, 1444921, 93, 97.86, 15089, 91.6, 'braking'),
  k('102:33:35.01', 49229.5, -7.77, 5507.2, 1424929, 93, 97.21, 15035, 91.3, 'braking'),
  k('102:33:45.01', 49140.5, -10.01, 5412, 1370799, 93, 95.43, 14888, 90.4, 'braking'),
  k('102:33:55.01', 49028.2, -12.45, 5315.9, 1317617, 93, 93.65, 14740, 89.4, 'braking'),
  k('102:34:05.01', 48890.5, -15.09, 5218.9, 1265390, 93, 91.87, 14593, 88.5, 'braking'),
  k('102:34:15.01', 48725.5, -17.91, 5120.9, 1214129, 93, 90.09, 14446, 87.6, 'braking'),
  k('102:34:25.01', 48531.5, -20.88, 5022.1, 1163843, 93, 88.31, 14298, 86.7, 'braking'),
  k('102:34:35.01', 48307.2, -23.98, 4922.3, 1114539, 93, 86.53, 14151, 85.8, 'braking'),
  k('102:34:45.01', 48051.3, -27.2, 4821.6, 1066227, 93, 84.75, 14003, 85, 'braking'),
  k('102:34:55.01', 47762.5, -30.55, 4720, 1018916, 93, 82.97, 13856, 84.1, 'braking'),
  k('102:35:05.01', 47439.6, -34.04, 4617.5, 972615, 93, 81.18, 13708, 83.4, 'braking'),
  k('102:35:15.01', 47080.7, -37.74, 4514, 927333, 93, 79.4, 13561, 82.7, 'braking'),
  k('102:35:25.01', 46683.6, -41.69, 4409.6, 883078, 93, 77.62, 13413, 82, 'braking'),
  k('102:35:35.01', 46245.5, -45.92, 4304.2, 839860, 93, 75.84, 13266, 81.4, 'braking'),
  k('102:35:45.01', 45763.6, -50.45, 4197.9, 797689, 93, 74.06, 13118, 80.8, 'braking'),
  k('102:35:55.01', 45235, -55.27, 4090.5, 756574, 93, 72.28, 12971, 80.2, 'braking'),
  k('102:36:05.01', 44656.9, -60.35, 3982.2, 716526, 93, 70.5, 12824, 79.7, 'braking'),
  k('102:36:15.01', 44026.9, -65.65, 3872.8, 677554, 93, 68.72, 12676, 79.1, 'braking'),
  k('102:36:25.01', 43343.1, -71.1, 3762.3, 639668, 93, 66.94, 12529, 78.5, 'braking'),
  k('102:36:35.01', 42604.5, -76.62, 3650.8, 602879, 93, 65.16, 12381, 78, 'braking'),
  k('102:36:45.01', 41810.8, -82.12, 3538.2, 567197, 93, 63.38, 12234, 77.4, 'braking'),
  k('102:36:55.01', 40962.7, -87.49, 3424.6, 532633, 93, 61.6, 12086, 76.7, 'braking'),
  k('102:37:05.01', 40062, -92.65, 3309.8, 499197, 93, 59.82, 11939, 76.1, 'braking'),
  k('102:37:15.01', 39111, -97.53, 3194, 466901, 93, 58.03, 11791, 75.5, 'braking'),
  k('102:37:25.01', 38112.7, -102.14, 3077, 435756, 93, 56.25, 11644, 75, 'braking'),
  k('102:37:35.01', 37068.9, -106.63, 2958.8, 405773, 93, 54.47, 11496, 74.6, 'braking'),
  k('102:37:45.01', 35979.3, -111.29, 2839.3, 376966, 93, 52.69, 11349, 74.4, 'braking'),
  k('102:37:55.01', 34839.7, -116.64, 2718.2, 349349, 93, 50.91, 11202, 74.4, 'braking'),
  k('102:38:05.01', 33642, -122.9, 2595.5, 322938, 93, 49.13, 11054, 74.3, 'braking'),
  k('102:38:15.01', 32382.5, -129, 2471.3, 297749, 93, 47.35, 10907, 73.6, 'braking'),
  k('102:38:25.01', 31069.2, -133.66, 2346.1, 273794, 93, 45.57, 10759, 72.5, 'braking'),
  k('102:38:35.01', 29721.1, -135.96, 2220, 251083, 93, 43.79, 10612, 71.1, 'braking'),
  k('102:38:45.01', 28364.1, -135.43, 2093.2, 229625, 93, 42.01, 10464, 69.8, 'braking'),
  k('102:38:55.01', 27025.3, -132.33, 1965.7, 209427, 93, 40.23, 10317, 68.6, 'braking'),
  k('102:39:05.01', 25728.4, -127.06, 1837.2, 190499, 93, 38.45, 10169, 67.9, 'braking'),
  k('102:39:15.01', 24488.1, -120.99, 1707.2, 172853, 93, 36.66, 10022, 67.9, 'braking'),
  k('102:39:25.01', 23303.1, -116, 1574.7, 156510, 93, 34.88, 9874, 68.8, 'braking'),
  k('102:39:31', 22610.7, -114.82, 1493.6, 147342, 93, 33.82, 9786, 55.7, 'braking'),
  k('102:39:32', 22495.9, -114.62, 1486.1, 145858, 58, 33.71, 9777, 55.7, 'braking'),
  k('102:39:35.01', 22153, -114.03, 1463.6, 141451, 58, 33.37, 9749, 57.1, 'braking'),
  k('102:39:45.01', 21004.5, -115.65, 1386, 127255, 58, 32.26, 9657, 59.3, 'braking'),
  k('102:39:55.01', 19829.1, -119.43, 1306.3, 113841, 58, 31.15, 9565, 60.4, 'braking'),
  k('102:40:05.01', 18612.1, -123.98, 1225.4, 101224, 58, 30.04, 9473, 60.6, 'braking'),
  k('102:40:15.01', 17351, -128.22, 1143.7, 89415, 58, 28.93, 9381, 60.2, 'braking'),
  k('102:40:25.01', 16052.3, -131.52, 1061.8, 78419, 58, 27.82, 9289, 59.6, 'braking'),
  k('102:40:35.01', 14726, -133.73, 979.6, 68239, 58, 26.71, 9197, 59, 'braking'),
  k('102:40:45.01', 13382, -135.08, 896.9, 58879, 58, 25.6, 9104, 58.6, 'braking'),
  k('102:40:55.01', 12027.8, -135.75, 813.6, 50345, 58, 24.49, 9012, 58.3, 'braking'),
  k('102:41:05.01', 10671.4, -135.52, 729.9, 42642, 58, 23.38, 8920, 57.6, 'braking'),
  k('102:41:15.01', 9325.6, -133.65, 646.2, 35773, 58, 22.27, 8828, 56.4, 'braking'),
  k('102:41:25.01', 8011.4, -129.18, 563, 29735, 58, 21.16, 8736, 54.9, 'braking'),
  k('102:41:30', 7374.2, -125.69, 521.9, 27027, 58, 20.61, 8690, 53.6, 'braking'),
  k('102:41:32', 7124.6, -123.98, 523.1, 26000, 57.3, 20.39, 8671, 52.2, 'approach'),
  k('102:41:34', 6878.3, -122.27, 506.9, 24984, 56.9, 20.17, 8653, 51.8, 'approach'),
  k('102:41:38', 6397.1, -118.32, 475.7, 23048, 56, 19.73, 8617, 50.4, 'approach'),
  k('102:41:42', 5932.7, -113.91, 445.8, 21234, 54.7, 19.31, 8582, 48.6, 'approach'),
  k('102:41:46', 5486.6, -109.13, 417.3, 19536, 53.4, 18.9, 8548, 46.9, 'approach'),
  k('102:41:50', 5060.2, -104.08, 390.1, 17949, 52.1, 18.49, 8514, 45.3, 'approach'),
  k('102:41:54', 4654.2, -98.88, 364.2, 16468, 50.8, 18.1, 8481, 43.7, 'approach'),
  k('102:41:58', 4269.3, -93.58, 339.5, 15088, 49.6, 17.71, 8449, 42.2, 'approach'),
  k('102:42:02', 3905.8, -88.19, 316.1, 13805, 48.4, 17.34, 8418, 40.7, 'approach'),
  k('102:42:06', 3563.8, -82.77, 293.8, 12612, 47.2, 16.97, 8388, 39.2, 'approach'),
  k('102:42:10', 3243.5, -77.38, 272.6, 11507, 46, 16.62, 8358, 37.8, 'approach'),
  k('102:42:14', 2944.5, -72.13, 252.6, 10484, 44.8, 16.27, 8329, 36.4, 'approach'),
  k('102:42:18', 2666.1, -67.07, 233.7, 9538, 43.6, 15.93, 8301, 35.1, 'approach'),
  k('102:42:22', 2407.6, -62.2, 215.8, 8666, 42.5, 15.6, 8274, 33.7, 'approach'),
  k('102:42:26', 2168.2, -57.5, 198.9, 7864, 41.4, 15.28, 8247, 32.3, 'approach'),
  k('102:42:30', 1947.3, -52.95, 182.9, 7127, 40.4, 14.97, 8221, 30.9, 'approach'),
  k('102:42:34', 1744.3, -48.54, 168, 6452, 39.5, 14.66, 8196, 29.5, 'approach'),
  k('102:42:38', 1558.7, -44.26, 153.9, 5835, 38.7, 14.36, 8171, 28.1, 'approach'),
  k('102:42:42', 1389.9, -40.13, 140.7, 5272, 37.8, 14.07, 8146, 26.7, 'approach'),
  k('102:42:46', 1237.3, -36.18, 128.4, 4760, 37, 13.78, 8123, 25.4, 'approach'),
  k('102:42:50', 1100, -32.46, 116.9, 4296, 36.2, 13.5, 8099, 24.1, 'approach'),
  k('102:42:54', 977, -29.02, 106.1, 3877, 35.3, 13.23, 8076, 22.9, 'approach'),
  k('102:42:58', 867.2, -25.89, 96.1, 3499, 34.5, 12.96, 8054, 21.6, 'approach'),
  k('102:43:02', 769.3, -23.04, 86.8, 3160, 33.8, 12.7, 8032, 20.4, 'approach'),
  k('102:43:06', 682.4, -20.42, 78.2, 2856, 33.1, 12.45, 8011, 19.1, 'approach'),
  k('102:43:10', 605.7, -17.94, 70.3, 2585, 32.5, 12.19, 7990, 16.4, 'approach'),
  k('102:43:13', 554.6, -16.11, 64.7, 2403, 31.8, 12.01, 7975, 11.2, 'manual'),
  k('102:43:14', 538.8, -15.51, 64.2, 2345, 31.6, 11.95, 7970, 9.6, 'manual'),
  k('102:43:18', 481.6, -13.12, 62.1, 2118, 30.9, 11.71, 7950, 4.9, 'manual'),
  k('102:43:22', 433.7, -10.81, 60.1, 1900, 30.7, 11.47, 7930, 5, 'manual'),
  k('102:43:26', 394.9, -8.61, 58, 1653, 30.4, 11.24, 7910, 5, 'manual'),
  k('102:43:30', 364.5, -6.6, 56, 1415, 29.9, 11.01, 7891, 4.8, 'manual'),
  k('102:43:34', 341.1, -5.06, 54.1, 1183, 29.2, 10.78, 7872, 5, 'manual'),
  k('102:43:38', 322.7, -4.14, 52.1, 960, 28.5, 10.56, 7854, 5.6, 'manual'),
  k('102:43:42', 307.4, -3.54, 49.8, 745, 28.3, 10.34, 7836, 6.6, 'manual'),
  k('102:43:46', 294.2, -3.03, 47, 541, 28.4, 10.13, 7818, 9, 'manual'),
  k('102:43:50', 283.3, -2.44, 42.8, 350, 28.6, 9.91, 7799, 12.7, 'manual'),
  k('102:43:54', 274.5, -1.95, 37.1, 179, 28.7, 9.69, 7781, 15.5, 'manual'),
  k('102:43:58', 267.2, -1.73, 30.8, 31, 28.3, 9.47, 7763, 16.1, 'manual'),
  k('102:44:02', 260.2, -1.76, 24.8, -90, 27.7, 9.26, 7745, 14.4, 'manual'),
  k('102:44:06', 252.6, -2.02, 19.9, -190, 27.1, 9.05, 7727, 11, 'manual'),
  k('102:44:10', 243.8, -2.41, 16.6, -273, 26.6, 8.84, 7710, 8.1, 'manual'),
  k('102:44:14', 233.1, -2.93, 13.9, -345, 26.3, 8.64, 7693, 5.9, 'manual'),
  k('102:44:18', 220.1, -3.56, 12.3, -408, 26, 8.44, 7676, 3.7, 'manual'),
  k('102:44:22', 204.4, -4.28, 11.2, -466, 25.9, 8.24, 7660, 2.9, 'manual'),
  k('102:44:26', 185.9, -4.98, 10.2, -520, 26.1, 8.04, 7643, 2.7, 'manual'),
  k('102:44:30', 165.2, -5.36, 9.3, -569, 26.5, 7.84, 7626, 1.7, 'manual'),
  k('102:44:34', 144.1, -5.21, 9, -616, 27, 7.63, 7609, 0.4, 'manual'),
  k('102:44:38', 124.4, -4.63, 9, -664, 27.4, 7.43, 7592, 0, 'manual'),
  k('102:44:42', 107.5, -3.82, 9, -711, 27.5, 7.22, 7574, 0.1, 'manual'),
  k('102:44:46', 94, -2.91, 8.9, -757, 27.6, 7, 7557, 1.8, 'manual'),
  k('102:44:50', 84.2, -1.99, 7.6, -801, 27.4, 6.79, 7539, 3.8, 'manual'),
  k('102:44:54', 77.6, -1.33, 6, -839, 26.9, 6.59, 7522, 4, 'manual'),
  k('102:44:58', 72.6, -1.16, 4.6, -871, 26.3, 6.38, 7505, 3.9, 'manual'),
  k('102:45:02', 67.5, -1.37, 3.1, -898, 25.9, 6.18, 7488, 3.3, 'manual'),
  k('102:45:06', 61.3, -1.77, 2.1, -919, 25.7, 5.99, 7471, 1.4, 'manual'),
  k('102:45:10', 53.5, -2.11, 2.1, -938, 25.8, 5.79, 7455, -0.6, 'manual'),
  k('102:45:14', 44.8, -2.24, 2.6, -958, 26, 5.59, 7438, -1.6, 'manual'),
  k('102:45:18', 36.1, -2.11, 3.3, -980, 26.3, 5.39, 7422, -1.7, 'manual'),
  k('102:45:22', 28.5, -1.71, 3.8, -1006, 26.4, 5.19, 7405, -0.9, 'manual'),
  k('102:45:26', 21.9, -1.55, 4, -1033, 26.2, 4.99, 7388, 0.8, 'manual'),
  k('102:45:30', 15.7, -1.49, 3.2, -1058, 25.9, 4.79, 7371, 2.7, 'manual'),
  k('102:45:34', 9.6, -1.54, 2, -1079, 25.5, 4.59, 7355, 3.6, 'manual'),
  k('102:45:38', 3.2, -1.66, 0.6, -1095, 25.3, 4.4, 7339, 2.9, 'manual'),
  k('102:45:39.9', 0, -1.68, 0, -1100, 25.3, 4.31, 7331, 2.6, 'touchdown'),
  k('102:45:41.4', 0, 0, 0, -1100, 25.3, 4.23, 7325, 2.6, 'touchdown'),
  k('102:45:41.9', 0, 0, 0, -1100, 0, 4.23, 7325, 2.6, 'touchdown'),
  k('102:46:00', 0, 0, 0, -1100, 0, 4.23, 7325, 2.6, 'surface'),
  k('102:50:00', 0, 0, 0, -1100, 0, 4.23, 7325, 2.6, 'surface'),
]);

// ---------- milestones (for the trajectory and timeline views) ----------

// { t, id, label, source, kind, major? } — kind: 'event' | 'program' |
// 'alarm' | 'radar' | 'crew'. Computer and vehicle events at Mission Report
// times (research/web-timeline-b.md "Timing rule").
function ms(t, id, label, source, kind, major = false) {
  return Object.freeze({ t, get: parseGET(t), id, label, source, kind, major });
}

export const MILESTONES = Object.freeze([
  // Keyed behind the Moon: only the onboard tape has it ("Okay, we ready to
  // go to P63?" 102:10:32, "Yes." 102:10:36 — AFJ/ONB); the keying second
  // is not recorded (web-timeline-b.md D27).
  ms('102:10:36', 'p63', 'P63 selected (V37E63E, approx.)', 'AFJ/ONB onboard tape (approximate)', 'program'),
  ms('102:20:53', 'lr-on', 'Landing radar on', 'MR Table 5-I', 'radar'),
  ms('102:32:58', 'ullage', 'Ullage (RCS settling) starts', 'MR Table 5-I', 'event'),
  ms('102:33:05.01', 'pdi', 'PDI — DPS ignition', 'MR Table 9.6-V', 'event', true),
  ms('102:33:31', 'throttle-up', 'Throttle up (fixed throttle position)', 'MR Table 5-I (crew report)', 'event', true),
  ms('102:36:46', 'yaw-start', 'Yaw to windows-up begins', 'ALSJ ("Rolling over"); MR "in process" 102:36:57', 'crew'),
  ms('102:37:51', 'lr-data-good', 'Landing radar data good', 'MR Table 5-I', 'radar', true),
  ms('102:37:59', 'yaw-done', 'Windows-up yaw complete', 'MR Table 5-I', 'crew'),
  ms('102:38:22', 'alarm-1202-1', 'Program alarm 1202', 'MR Table 5-I', 'alarm', true),
  ms('102:38:45', 'lr-updates', 'Radar updates enabled (V57)', 'MR Table 5-I', 'radar'),
  ms('102:38:50', 'lr-velocity', 'Below 30,000 ft; radar velocity updates', 'MR Table 5-I', 'radar'),
  ms('102:39:02', 'alarm-1202-2', 'Program alarm 1202', 'MR Table 5-I', 'alarm', true),
  ms('102:39:31', 'throttle-down', 'Throttle down (throttle recovery)', 'MR Table 5-I, §5.3', 'event', true),
  ms('102:41:32', 'p64', 'P64 — high gate', 'MR Table 5-I, §5.3', 'program', true),
  ms('102:41:37', 'lr-pos2', 'Landing radar to position 2', 'MR Table 5-I', 'radar'),
  ms('102:42:18', 'alarm-1201', 'Program alarm 1201', 'MR Table 5-I', 'alarm', true),
  ms('102:42:19', 'lr-low-scale', 'Radar low scale (< 2,500 ft)', 'MR Table 5-I', 'radar'),
  ms('102:42:43', 'alarm-1202-3', 'Program alarm 1202', 'MR Table 5-I', 'alarm', true),
  ms('102:42:58', 'alarm-1202-4', 'Program alarm 1202', 'MR Table 5-I', 'alarm', true),
  ms('102:43:09', 'redesignation', 'Landing point redesignation', 'MR Table 5-I', 'crew'),
  ms('102:43:13', 'att-hold', 'Manual attitude control (ATT HOLD)', 'MR Table 5-I, §5.3', 'crew', true),
  ms('102:43:22', 'p66', 'P66 — rate of descent', 'MR Table 5-I', 'program', true),
  ms('102:44:11', 'lr-dropout-1', 'Radar data lost (ALT/VEL lights)', 'MR Table 5-I', 'radar'),
  ms('102:44:21', 'lr-regain-1', 'Radar data good again', 'MR Table 5-I', 'radar'),
  ms('102:44:28', 'low-level', 'Low-level (quantity) light', 'MR Table 5-I (§9.8.3: 102:44:30.4)', 'event', true),
  ms('102:44:59', 'lr-dropout-2', 'Radar data lost (ALT/VEL lights)', 'MR Table 5-I', 'radar'),
  ms('102:45:03', 'lr-regain-2', 'Radar data good again', 'MR Table 5-I', 'radar'),
  ms('102:45:36.6', 'contact-light', 'Lunar contact light (≈102:45:37, derived)', 'Derived: 67-in probes at ≈1.6 ft/s before the MR §5.4 touchdown; Aldrin calls it at 102:45:40 (ALSJ)', 'event'),
  ms('102:45:39.9', 'touchdown', 'Touchdown (MR §5.4)', 'MR §5.4', 'event', true),
  ms('102:45:41.4', 'engine-off', 'Engine cutoff', 'MR Table 9.6-V', 'event'),
]);
export const milestones = MILESTONES;

// ---------- DSKY readings called out by the crew [ACT-crew] ----------

// From research/web-trajectory-b.md §5.2 (ALSJ, as transcribed there): the
// DSKY N63/N64/N60 altitude (ft), altitude rate (ft/s), horizontal velocity
// (ft/s; Noun 60 R1 is VHORIZ, the magnitude, which Aldrin called "N
// forward") and LPD angle (deg). `check: false` marks entries the replay does
// not try to match: their time or meaning is doubtful (research §9 and
// web-timeline-b.md D21). Voice runs ≈±2 s around the display in P64/P66.
function co(t, quote, { alt = null, altRate = null, vHoriz = null, lpd = null, check = true, note = null } = {}) {
  return Object.freeze({ t, get: parseGET(t), quote, alt, altRate, vHoriz, lpd, check, note });
}

export const CALLOUTS = Object.freeze([
  co('102:41:10', 'You\'re at 7000…', { alt: 7000, check: false, note: 'Aldrin; 22 s before the MR P64 altitude of 7,129 ft — meaning unclear' }),
  co('102:41:51', '5000. 100 feet per second is good.', { alt: 5000, altRate: -100 }),
  co('102:42:13', '3000 at 70', { alt: 3000, altRate: -70 }),
  co('102:42:24', '2000 at 50', { alt: 2000, altRate: -50, check: false, note: 'about 5 s early against TRW and the neighbouring calls; ONB "2050" at 102:42:22' }),
  co('102:42:33', 'LPD … 47 degrees', { lpd: 47, note: '±3 s' }),
  co('102:42:51', '1000 at 30 is good', { alt: 1000, altRate: -30, note: 'ALSJ merges it into 102:42:37; ONB places it at 102:42:51 (used)' }),
  co('102:43:01', '35 degrees. 750. Coming down at 23.', { alt: 750, altRate: -23, lpd: 35 }),
  co('102:43:07', '700 feet, 21 down, 33 degrees', { alt: 700, altRate: -21, lpd: 33 }),
  co('102:43:11', '600 feet, down at 19', { alt: 600, altRate: -19 }),
  co('102:43:16', '540 feet, down at … (LPD) 30 … down at 15', { alt: 540, altRate: -15, lpd: 30, note: 'whether "30" is an LPD angle is uncertain' }),
  co('102:43:26', '400 feet, down at 9. 58 forward.', { alt: 400, altRate: -9, vHoriz: 58 }),
  co('102:43:33', '350 feet, down at 4', { alt: 350, altRate: -4 }),
  co('102:43:35', '330, three and a half down', { alt: 330, altRate: -3.5, check: false, note: 'TEC/ONB differ ("…one-half down", "330 - 6-1/2 down")' }),
  co('102:43:46', '300 feet, down 3½, 47 forward', { alt: 300, altRate: -3.5, vHoriz: 47 }),
  co('102:43:52', '1½ down … 270', { alt: 270, altRate: -1.5 }),
  co('102:44:07', '250, down at 2½, 19 forward', { alt: 250, altRate: -2.5, vHoriz: 19 }),
  co('102:44:16', '3½ down, 220 feet, 13 forward', { alt: 220, altRate: -3.5, vHoriz: 13 }),
  co('102:44:23', '11 forward', { vHoriz: 11 }),
  co('102:44:24', '200 feet, 4½ down', { alt: 200, altRate: -4.5 }),
  co('102:44:26', '5½ down', { altRate: -5.5 }),
  co('102:44:31', '160 feet, 6½ down', { alt: 160, altRate: -6.5 }),
  co('102:44:33', '5½ down, 9 forward', { altRate: -5.5, vHoriz: 9 }),
  co('102:44:40', '120 feet', { alt: 120 }),
  co('102:44:45', '100 feet, 3½ down, 9 forward. Five percent. Quantity light.', { alt: 100, altRate: -3.5, vHoriz: 9 }),
  co('102:44:54', '75 feet … down a half, 6 forward', { alt: 75, altRate: -0.5, vHoriz: 6 }),
  co('102:45:08', '60 feet, down 2½ … 2 forward', { alt: 60, altRate: -2.5, vHoriz: 2 }),
  co('102:45:17', '40 feet, down 2½. Picking up some dust.', { alt: 40, altRate: -2.5 }),
  co('102:45:21', '30 feet, 2½ down', { alt: 30, altRate: -2.5 }),
  co('102:45:25', '4 forward … 20 feet, down a half', { alt: 20, altRate: -0.5, vHoriz: 4 }),
  co('102:45:40', 'Contact Light', { alt: 5.6, check: false, note: 'a panel light, not a DSKY reading: the 67-in (5.6 ft) probes touched at ≈102:45:36.6 [DER]; the call came a few seconds later, the footpads touched at 102:45:39.9 (MR §5.4)' }),
]);

// ---------- sites and range checks ----------

export const SITES = Object.freeze({
  // The computer's landing site LAND (the automatic aim point): range 0.
  aimPoint: Object.freeze({ range: 0, label: 'Computer\'s landing site (aim point)' }),
  // Where Eagle landed: ≈1,100 ft beyond the automatic aim point [ACT
  // BEN70 p.23; MR §5.3] (and 400 ft cross-range, not modelled).
  landed: Object.freeze({ range: -1100, label: 'Tranquility Base (Eagle)' }),
  // The planned site in lunar map coordinates: Eagle came down ≈6.6 km
  // (21,650 ft) long of it (MR §5.3, Table 5-IV; ALSJ) — so it lay ≈20,550 ft
  // uprange of the computer's aim point, shifted by the PDI navigation
  // error [DER]. Shown only as an annotation: the computer never knew.
  planned: Object.freeze({ range: 20550, label: 'Planned site (map coordinates)' }),
});

// Quoted ranges the derived `range` column is checked against (tests).
export const RANGE_ANCHORS = Object.freeze([
  Object.freeze({ t: '102:33:05.01', range: 260 * 6076.12, tol: 3 * 6076.12, source: 'MR §5.1/Fig. 5-2; BEN70 p.6; PK: ≈260 nmi' }),
  Object.freeze({ t: '102:41:32', range: 26000, tol: 200, source: 'MR Fig. 5-2 (high gate ≈26,000 ft to the automatic landing point)' }),
  Object.freeze({ t: '102:43:22', range: 1900, tol: 200, source: 'BEN70 Fig. 22 (P66 ≈1,900 ft before the aim point)' }),
  Object.freeze({ t: '102:45:39.9', range: -1100, tol: 50, source: 'BEN70 p.23; MR §5.3 (≈1,100 ft beyond the aim point)' }),
]);

// ---------- the track ----------

export const APOLLO11_DESCENT = Object.freeze({
  id: 'apollo11Descent',
  title: 'Apollo 11 powered descent (LM-5 Eagle, Luminary 099)',
  units: Object.freeze({
    alt: 'ft', altRate: 'ft/s', vHoriz: 'ft/s', vCross: 'ft/s', range: 'ft',
    throttle: '%', fuel: '%', mass: 'kg', pitch: 'deg', yaw: 'deg',
  }),
  startGET: parseGET(KEYFRAMES[0].t),
  endGET: parseGET(KEYFRAMES[KEYFRAMES.length - 1].t),
  pdiGET: parseGET('102:33:05.01'),            // MR Table 9.6-V
  zoomGET: parseGET('102:33:30.36'),           // PAD TIG 102:33:04.36 + ZOOMTIME
  throttleDownGET: parseGET('102:39:31'),      // MR Table 5-I
  p64GET: parseGET('102:41:32'),               // MR Table 5-I
  p66GET: parseGET('102:43:22'),               // MR Table 5-I
  contactLightGET: parseGET('102:45:36.6'),    // [DER] probes touch (see the header)
  touchdownGET: parseGET('102:45:39.9'),       // MR §5.4: footpads on the surface
  engineOffGET: parseGET('102:45:41.4'),       // MR Table 9.6-V
  footpadsGET: parseGET('102:45:39.9'),        // MR §5.4 (= touchdownGET)
  restGET: parseGET('102:45:40.2'),            // [DER] at rest: `landed` from here
  keyframes: KEYFRAMES,
  yaw: YAW,
  vCross: VCROSS,
  intervals: INTERVALS,
  milestones: MILESTONES,
  callouts: CALLOUTS,
  sites: SITES,
  rangeAnchors: RANGE_ANCHORS,
  sources: SOURCE_NOTES,
});

export default APOLLO11_DESCENT;
