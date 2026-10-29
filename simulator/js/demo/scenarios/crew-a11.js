// What the Apollo 11 crew did with the LGC during the descent — keystrokes
// on the DSKY and the few crew-station controls the simulator models — as
// one shared schedule, so every scenario that covers a stretch of the
// descent replays the same inputs (and the Executive model sees the same
// load). Scenarios pull the slice they need with `crewEvents(start, end)`.
//
// Times are the GET at which the entry took effect on the DSKY (ENTR or PRO
// pressed). Sources (see docs/SOURCES.md):
//   CHERRY — G. W. Cherry (MIT/IL), "Exegesis of the 1201 and 1202 Alarms",
//            4 Aug 1969, DSKY event log in seconds from ignition (TFI),
//            converted with TIG = 102:33:05 (research web-1202-b §4);
//   MR     — Apollo 11 Mission Report, Table 5-I event times;
//   EYLES  — D. Eyles, "Tales from the Lunar Module Guidance Computer" (2004);
//   ONB    — onboard voice transcription.
// `basis: 'record'` = the keying (and its time) is documented;
// `basis: 'inferred'` = the keying is implied by the record but its time is
// not, so the time is illustrative (marked so in the narration too).

import { keysEndingAt, crew } from './lib.js';
import { parseGET } from '../../util/time.js';

export const CREW_A11 = Object.freeze([
  // --- ignition ---
  { at: '102:33:02.5', keys: 'P', who: 'Aldrin', basis: 'inferred',
    why: 'PRO on the flashing V99N62. Eyles: "Now he keyed PROCEED". The flash starts at TIG−5 (102:33:00) and ignition was on time at 102:33:05.01, so PRO came in between; ONB has "Proceed" at 102:33:02.' },

  // --- P63: the two 1202s ---
  { at: '102:38:09', keys: 'V16N68E', who: 'Aldrin', basis: 'record',
    why: 'CHERRY TFI 304 (ΔH −2884 ft on the DSKY); Aldrin calls "Delta-H is minus 2,900" at 102:38:11.' },
  { at: '102:38:27', keys: 'V05N09E', who: 'Aldrin', basis: 'record',
    why: 'CHERRY TFI 322: V05N09E, R1 = 1202.' },
  { at: '102:38:34', keys: 'R', who: 'Aldrin', basis: 'inferred',
    why: 'RSET to clear PROG and FAILREG. The logs prove FAILREG was cleared before the 1201 (V05N09 then showed R1 = 1201); when exactly is not recorded.' },
  { at: '102:38:35', keys: 'K', who: 'Aldrin', basis: 'inferred',
    why: 'KEY REL to give the DSKY back to the guidance display (V06N63).' },
  { at: '102:38:44', keys: 'V57E', who: 'Aldrin', basis: 'record',
    why: 'CHERRY TFI 338 (102:38:43); MR "Enable radar updates" 102:38:45; EYLES "Aldrin keyed in Verb 57".' },
  { at: '102:38:51', keys: 'V16N68E', who: 'Aldrin', basis: 'record',
    why: 'CHERRY TFI 346; EYLES: Aldrin re-keyed V16N68 and saw ΔH ≈ 900 ft.' },
  { at: '102:39:08', keys: 'V05N09E', who: 'Aldrin', basis: 'inferred',
    why: 'EYLES: Aldrin read the second code with V05N09 (time not recorded; before his 102:39:14 report).' },
  { at: '102:39:11', keys: 'R', who: 'Aldrin', basis: 'inferred', why: 'RSET (see above).' },
  { at: '102:39:12', keys: 'K', who: 'Aldrin', basis: 'inferred', why: 'KEY REL back to V06N63.' },

  // --- P64 ---
  { ...crew('102:41:53', 'pgnsMode', 'attHold', 'PGNS mode control → ATT HOLD (handling check)'), basis: 'record',
    why: 'MR Table 5-I: attitude hold 102:41:53 – 102:42:03; Armstrong "Going to check my attitude control".' },
  { ...crew('102:42:03', 'pgnsMode', 'auto', 'PGNS mode control → AUTO'), basis: 'record', why: 'MR Table 5-I.' },
  { at: '102:42:21', keys: 'V05N09E', who: 'Aldrin', basis: 'record',
    why: 'CHERRY TFI 556: V05N09E, R1 = 1201.' },
  { at: '102:42:27', keys: 'R', who: 'Aldrin', basis: 'inferred',
    why: 'RSET: at TFI 580 V05N09 showed R1 = 1202, so FAILREG had been cleared after the 1201.' },
  { at: '102:42:28', keys: 'K', who: 'Aldrin', basis: 'inferred', why: 'KEY REL back to the flashing V06N64.' },
  { at: '102:42:33', keys: 'P', who: 'Aldrin', basis: 'record',
    why: 'CHERRY TFI 568 "PRO to FLV06N64" — the crew enabled LPD redesignation only now, after the 1201 (the debriefing remembers "very shortly" after P64).' },
  { at: '102:42:45', keys: 'V05N09E', who: 'Aldrin', basis: 'record',
    why: 'CHERRY TFI 580: V05N09E, R1 = 1202.' },
  { at: '102:42:50', keys: 'R', who: 'Aldrin', basis: 'inferred', why: 'RSET (illustrative).' },
  { at: '102:42:51', keys: 'K', who: 'Aldrin', basis: 'inferred', why: 'KEY REL back to V06N64.' },
  { ...crew('102:43:13', 'pgnsMode', 'attHold', 'PGNS mode control → ATT HOLD (manual takeover)'), basis: 'record',
    why: 'MR Table 5-I 102:43:13 ("approximately 600 feet"); EYLES 102:43:08.' },

  // --- P66 ---
  { ...crew('102:43:22', 'rodClick', 1, 'ROD switch clicked → P66'), basis: 'record',
    why: 'MR Table 5-I: P66 at 102:43:22. In ATT HOLD, a click of the ROD switch selects P66 (GUILDENSTERN P66NOW?). Click direction not recorded; +1 = one ft/s less sink (EYLES).' },
  { ...crew('102:45:41.4', 'engineStop', true, 'ENGINE STOP pushed'), basis: 'record',
    why: 'MR Table 9.6-V: cutoff 102:45:41.40; ONB 102:45:41 Armstrong "SHUTDOWN".' },
  { at: '102:46:50', keys: 'V37E68E', who: 'Aldrin', basis: 'inferred',
    why: 'P68 (landing confirmation) is reached only through V37 (FRESH_START_AND_RESTART.agc FCADRMM1 table). The keying time is not recorded; Aldrin quotes Noun 43 at 102:48:10.' },
]);

// Scenario events for every crew input with start ≤ t ≤ end. Keystroke
// scripts are back-timed so that their last key lands on the recorded time.
export function crewEvents(start, end) {
  const a = parseGET(start);
  const b = parseGET(end);
  const out = [];
  for (const c of CREW_A11) {
    const t = parseGET(c.at);
    if (t < a || t > b) continue;
    if (c.keys) {
      const ev = keysEndingAt(c.at, c.keys, c.who);
      if (parseGET(ev.at) < a) continue; // would start before the scenario
      out.push(ev);
    } else {
      out.push({ at: c.at, action: c.action });
    }
  }
  return out;
}
