// Major-mode program tables (ARCHITECTURE §6.10): number → class.
//
// PROGRAMS_LUMINARY099 holds the Lunar Module programs the simulator models
// (P00, P63-P66, P68) plus, for every other program the V37 table of the
// listing accepts, a placeholder that takes the major mode and idles (the
// UI marks it "not modelled"). V37_* are the programs V37 accepts:
// Luminary099 PREMM1 (FRESH_START_AND_RESTART.agc:1116-1146, 30 entries,
// NOV37MM DEC 29) plus P00 (always, :756-758) and P70/P71 (special-cased,
// :748-754); Comanche055 PREMM1 (Comanche055/FRESH_START_AND_RESTART.agc:
// 1311-1344) plus P00. P64-P67 are not selectable: the guidance starts them.

import { unmodelledProgram } from './lm/common.js';
import P00 from './lm/p00.js';
import P63 from './lm/p63.js';
import P64 from './lm/p64.js';
import P65 from './lm/p65.js';
import P66 from './lm/p66.js';
import P68 from './lm/p68.js';
import { PROGRAMS_COMANCHE055 as CM_MODELLED } from './cm/index.js';

export const V37_LUMINARY099 = Object.freeze([
  0, 6, 12, 20, 21, 22, 25, 30, 31, 32, 33, 34, 35, 38, 39, 40, 41, 42, 47,
  51, 52, 57, 63, 68, 70, 71, 72, 73, 74, 75, 76, 78, 79,
]);

export const V37_COMANCHE055 = Object.freeze([
  0, 1, 6, 17, 20, 21, 22, 23, 30, 31, 32, 33, 34, 35, 37, 38, 39, 40, 41,
  47, 51, 52, 53, 54, 61, 62, 72, 73, 74, 75, 76, 77, 78, 79,
]);

// Program names (research src-pinball.md §4.18: source headers, otherwise
// the LM Operations Handbook program list).
export const PROGRAM_NAMES_LUMINARY099 = Object.freeze({
  0: 'LGC IDLING', 6: 'PGNCS POWER DOWN', 12: 'POWERED ASCENT', 20: 'RENDEZVOUS NAVIGATION',
  21: 'GROUND TRACK DETERMINATION', 22: 'LUNAR SURFACE NAVIGATION', 25: 'PREFERRED TRACKING ATTITUDE',
  30: 'EXTERNAL DELTA-V', 31: 'GENERAL LAMBERT AIMPOINT GUIDANCE', 32: 'COELLIPTIC SEQUENCE INITIATION',
  33: 'CONSTANT DELTA ALTITUDE', 34: 'TRANSFER PHASE INITIATION', 35: 'TRANSFER PHASE MIDCOURSE',
  38: 'STABLE ORBIT RENDEZVOUS', 39: 'STABLE ORBIT MIDCOURSE', 40: 'DPS THRUSTING', 41: 'RCS THRUSTING',
  42: 'APS THRUSTING', 47: 'THRUST MONITOR', 51: 'IMU ORIENTATION DETERMINATION', 52: 'IMU REALIGN',
  57: 'LUNAR SURFACE ALIGN', 63: 'BRAKING PHASE', 64: 'APPROACH PHASE', 65: 'LANDING PHASE (AUTO)',
  66: 'LANDING PHASE (ROD)', 67: 'LANDING PHASE (MANUAL)', 68: 'LANDING CONFIRMATION',
  70: 'DPS ABORT', 71: 'APS ABORT', 72: 'CSM CSI TARGETING', 73: 'CSM CDH TARGETING',
  74: 'CSM TPI TARGETING', 75: 'CSM TPM TARGETING', 76: 'TARGET DELTA-V',
  78: 'STABLE ORBIT RENDEZVOUS (OTHER VEHICLE)', 79: 'STABLE ORBIT MIDCOURSE (OTHER VEHICLE)',
});

function withPlaceholders(modelled, v37, names, software) {
  const out = { ...modelled };
  for (const n of v37) {
    if (!out[n]) out[n] = unmodelledProgram(n, names[n] || `PROGRAM ${String(n).padStart(2, '0')}`, software);
  }
  return Object.freeze(out);
}

export const PROGRAMS_LUMINARY099 = withPlaceholders(
  { 0: P00, 63: P63, 64: P64, 65: P65, 66: P66, 68: P68 },
  V37_LUMINARY099, PROGRAM_NAMES_LUMINARY099, 'Luminary099',
);

export const PROGRAMS_COMANCHE055 = withPlaceholders(CM_MODELLED || {}, V37_COMANCHE055, {}, 'Comanche055');

export function programTable(software = 'Luminary099') {
  return software === 'Comanche055' ? PROGRAMS_COMANCHE055 : PROGRAMS_LUMINARY099;
}

export function v37Table(software = 'Luminary099') {
  return software === 'Comanche055' ? V37_COMANCHE055 : V37_LUMINARY099;
}

export { P00, P63, P64, P65, P66, P68 };
