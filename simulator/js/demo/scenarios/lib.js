// Small helpers shared by the scenario scripts. Pure data builders: no DOM,
// no wall clock, nothing random — a scenario must replay identically every
// time the director seeks (ARCHITECTURE §9.2).

import { parseGET, formatGET } from '../../util/time.js';
import { parseKeys } from '../../util/keys.js';
import { sayEvent } from '../../data/transcript-a11.js';

// Default gap between scripted keystrokes (PINBALL `pressScript` default,
// ARCHITECTURE §6.3). A crew member keying V16N68E takes ~2.4 s this way.
export const KEY_GAP_MS = 400;

// GET string with tenths, e.g. 102:38:06.6 (parseGET accepts it).
export function get(seconds) {
  return formatGET(seconds, { tenths: true });
}

// A `say` event quoting transcript-a11.js by id.
export function say(id, opts) {
  return sayEvent(id, opts);
}

// A `keys` event timed so that its LAST key (normally ENTR) lands at `endAt`.
// The research gives the GET at which a verb/noun appeared on the DSKY
// (downlink), i.e. when ENTR was pressed, so we back-time the first key.
export function keysEndingAt(endAt, script, who, { gapMs = KEY_GAP_MS } = {}) {
  const n = parseKeys(script).length;
  const start = parseGET(endAt) - ((n - 1) * gapMs) / 1000;
  return { at: get(start), keys: script, who, gapMs };
}

// Crew-station control (ARCHITECTURE §11.3) as a deterministic action.
export function crew(at, name, value, note) {
  const action = (sim) => sim.agc.crewInput(name, value);
  action.label = note || `${name} → ${JSON.stringify(value)}`;
  return { at, action };
}

// The rendezvous-radar CDU cycle stealing that caused the alarms. On Apollo
// 11 the RR mode switch was in AUTO TRACK from 102:10:16 and in SLEW from
// 102:35:38; both positions let the RR CDUs count and steal memory cycles
// (Mission Report §16.2.5; web-1202-b §1). So every LM replay of the
// descent starts with it on. An `action` (not `setup`) so that it is
// re-applied when the director seeks (seek = reset + replay of actions).
export function rrFaultOn(at) {
  return crew(at, 'rrFault', true, 'RR mode switch out of LGC: RR CDUs steal memory cycles');
}

// Apollo 11's PDI ignition time (Mission Report Table 9.6-V). From it
// follows the 2-second rhythm of navigation for the whole descent: the
// TIG-30 task runs PREREAD at TIG − 29.9 s (D29.9SEC, BURN_BABY_BURN--
// MASTER_IGNITION_ROUTINE.agc:292-343), which schedules READACCS 2 s later
// and READACCS re-arms itself every 2 s (SERVICER.agc:72-74).
export const TIG_A11 = parseGET('102:33:05.01');
export const READACCS_EPOCH = TIG_A11 - 29.9; // 102:32:35.11

// A scenario that starts in mid-burn makes the computer model start its
// Average-G cycle at the scenario's first instant (READACCS 2 s later). So
// that every scenario puts SERVICER on the same 2-s grid as the real flight —
// and the Executive model therefore sees the same load at the same instants
// whichever scenario you watch — mid-burn scenarios start at the last grid
// point at or before the GET they want. Returns "hhh:mm:ss.ss".
export function alignedStart(approx) {
  const t = parseGET(approx);
  const k = Math.floor((t - READACCS_EPOCH) / 2 + 1e-9);
  const s = Math.round((READACCS_EPOCH + 2 * k) * 100) / 100;
  const whole = Math.floor(s);
  const frac = Math.round((s - whole) * 100);
  return `${formatGET(whole)}.${String(frac).padStart(2, '0')}`;
}

// Executive-load calibration for the Apollo 11 replays (passed to the
// computer model as `agcOptions.workload.params`, i.e. merged over
// DEFAULT_PARAMS in js/agc/workload.js). COST NUMBERS ARE CALIBRATION, NOT
// MEASUREMENTS — no source gives the CPU time of a job. Starting from the
// model's defaults, three P64 costs were swept (guidance pass, LPD
// redesignation logic, display job) so that the five program alarms emerge
// from the load model as close to the Mission Report times as the model's
// 2-second SERVICER rhythm allows, with the crew inputs of crew-a11.js:
//   1202 102:38:23.1 (+1.1 s)   1202 102:39:03.1 (+1.1 s)
//   1201 102:42:17.1 (−0.9 s)   1202 102:42:43.1 (+0.1 s)
//   1202 102:42:55.1 (−2.9 s: the model refills its core sets in 12 s after
//        the fourth restart; the flight took 15 s — see docs/SOURCES.md)
// The values stay within a few ms of the defaults; neighbouring values give
// the same alarm times (checked by sweeping; not a knife-edge fit).
export const A11_WORKLOAD_PARAMS = Object.freeze({
  phases: { P64: { guidMs: 759, lpdMs: 1 } },
  jobs: { makeplayMs: 35, flashWakeMs: 3 },
});
export const A11_AGC_OPTIONS = Object.freeze({ workload: { params: A11_WORKLOAD_PARAMS } });

// Stable sort by GET so scenario files can be written in story order.
export function sortEvents(events) {
  return events
    .map((e, i) => ({ e, i, t: parseGET(e.at) }))
    .sort((a, b) => (a.t - b.t) || (a.i - b.i))
    .map(({ e }) => e);
}

// Final assembly of a scenario object (§9.1): events sorted, frozen ids.
export function defineScenario(def) {
  return { ...def, events: sortEvents(def.events) };
}

// The five Executive-overflow alarms of the Apollo 11 descent, at the
// telemetry ("computer determined") times of Mission Report Table 5-I,
// confirmed by Cherry's DSKY log and Tillman's memo (web-1202-b §4).
export const HISTORICAL_ALARMS = Object.freeze([
  { t: '102:38:22', code: 0o1202, phase: 'P63' },
  { t: '102:39:02', code: 0o1202, phase: 'P63' },
  { t: '102:42:18', code: 0o1201, phase: 'P64' },
  { t: '102:42:43', code: 0o1202, phase: 'P64' },
  { t: '102:42:58', code: 0o1202, phase: 'P64' },
]);

export function alarmsWithin(start, end) {
  const a = parseGET(start);
  const b = parseGET(end);
  return HISTORICAL_ALARMS.filter((x) => {
    const t = parseGET(x.t);
    return t >= a && t <= b;
  });
}
