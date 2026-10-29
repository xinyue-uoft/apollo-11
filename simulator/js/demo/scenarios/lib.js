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
