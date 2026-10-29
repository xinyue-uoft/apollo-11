// Verb tables of Luminary099 (LM) and Comanche055 (CM) — ARCHITECTURE §6.4.
//
// Names are the verb list of the assembly notes, verbatim
// (Luminary099/ASSEMBLY_AND_OPERATION_INFORMATION.agc:161-269,
// Comanche055/ASSEMBLY_AND_OPERATION_INFORMATION.agc:138-246). The handler
// is the routine PINBALL dispatches to: regular verbs 00-39 through VERBTAB
// (Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:986-1027,
// Comanche055/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:939-980), extended verbs
// 40-99 through LST2FAN (Luminary099/EXTENDED_VERBS.agc:51-113,
// Comanche055/EXTENDED_VERBS.agc:53-115). Where the assembly notes and the
// fan disagree, the fan is what the computer does (Comanche055 V67 is
// blank in the notes but the fan has "V67 W MATRIX MONITOR"; V79 is listed
// as R35 but the fan has "ALM/END # V79 SPARE").
//
// kind:
//   'spare'     GODSPALM / DSPALARM / ALM/END: keying it lights OPR ERR
//   'display'   V01-V07                  'monitor'  V11-V17 (1 s refresh)
//   'load'      V21-V25                  'regular'  V27, V30-V37
//   'please'    GOLOADLV extended verbs (pasted by programs; ENTR answers)
//   'extended'  any other extended verb
// impl: true when pinball.js models what the verb does; false = "valid but
// not modelled": the DSKY shows the verb and noun as keyed, the display
// system is released as for every extended verb (VERBFAN does RELDSP,
// PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:970-980), nothing else happens.
// For display/monitor verbs `octal` and `comps` (which components, 1-based)
// describe the data shown; `monitorOf` gives the display verb of a monitor
// (MONDO converts V1x to V0x, :2410-2414).

const SPARE = (handler = 'GODSPALM') => ({ name: '(spare)', kind: 'spare', handler, impl: true });

function regularVerbs(names) {
  return {
    0: { name: names[0], kind: 'spare', handler: 'GODSPALM', impl: true },
    1: { name: names[1], kind: 'display', handler: 'DSPA', octal: true, comps: [1], impl: true },
    2: { name: names[2], kind: 'display', handler: 'DSPB', octal: true, comps: [2], impl: true },
    3: { name: names[3], kind: 'display', handler: 'DSPC', octal: true, comps: [3], impl: true },
    4: { name: names[4], kind: 'display', handler: 'DSPAB', octal: true, comps: [1, 2], impl: true },
    5: { name: names[5], kind: 'display', handler: 'DSPABC', octal: true, comps: [1, 2, 3], impl: true },
    6: { name: names[6], kind: 'display', handler: 'DECDSP', octal: false, comps: 'all', impl: true },
    7: { name: names[7], kind: 'display', handler: 'DSPDPDEC', octal: false, comps: [1], dp: true, impl: true },
    8: SPARE(), 9: SPARE(), 10: SPARE('DSPALARM'),
    11: { name: names[11], kind: 'monitor', handler: 'MONITOR', monitorOf: 1, impl: true },
    12: { name: names[12], kind: 'monitor', handler: 'MONITOR', monitorOf: 2, impl: true },
    13: { name: names[13], kind: 'monitor', handler: 'MONITOR', monitorOf: 3, impl: true },
    14: { name: names[14], kind: 'monitor', handler: 'MONITOR', monitorOf: 4, impl: true },
    15: { name: names[15], kind: 'monitor', handler: 'MONITOR', monitorOf: 5, impl: true },
    16: { name: names[16], kind: 'monitor', handler: 'MONITOR', monitorOf: 6, impl: true },
    17: { name: names[17], kind: 'monitor', handler: 'MONITOR', monitorOf: 7, impl: true },
    18: SPARE(), 19: SPARE(), 20: SPARE(),
    21: { name: names[21], kind: 'load', handler: 'ALOAD', comps: [1], impl: true },
    22: { name: names[22], kind: 'load', handler: 'BLOAD', comps: [2], impl: true },
    23: { name: names[23], kind: 'load', handler: 'CLOAD', comps: [3], impl: true },
    24: { name: names[24], kind: 'load', handler: 'ABLOAD', comps: [1, 2], impl: true },
    25: { name: names[25], kind: 'load', handler: 'ABCLOAD', comps: [1, 2, 3], impl: true },
    26: SPARE(),
    // V27 needs the fixed-memory image, which the model does not have.
    27: { name: names[27], kind: 'regular', handler: 'DSPFMEM', impl: false },
    28: SPARE(), 29: SPARE(),
    30: { name: names[30], kind: 'regular', handler: 'VBRQEXEC', impl: false },
    31: { name: names[31], kind: 'regular', handler: 'VBRQWAIT', impl: false },
    32: { name: names[32], kind: 'regular', handler: 'VBRESEQ', impl: true },
    33: { name: names[33], kind: 'regular', handler: 'VBPROC', impl: true },
    34: { name: names[34], kind: 'regular', handler: 'VBTERM', impl: true },
    35: { name: names[35], kind: 'regular', handler: 'VBTSTLTS', impl: true },
    36: { name: names[36], kind: 'regular', handler: 'SLAP1', impl: true },
    37: { name: names[37], kind: 'regular', handler: 'MMCHANG', impl: true },
    38: SPARE(), 39: SPARE(),
  };
}

const REGULAR_NAMES = {
  0: 'NOT IN USE',
  1: 'DISPLAY OCTAL COMP 1 IN R1',
  2: 'DISPLAY OCTAL COMP 2 IN R1',
  3: 'DISPLAY OCTAL COMP 3 IN R1',
  4: 'DISPLAY OCTAL COMP 1,2 IN R1,R2',
  5: 'DISPLAY OCTAL COMP 1,2,3 IN R1,R2,R3',
  6: 'DISPLAY DECIMAL IN R1 OR R1,R2 OR R1,R2,R3',
  7: 'DISPLAY DP DECIMAL IN R1,R2 (TEST ONLY)',
  11: 'MONITOR OCTAL COMP 1 IN R1',
  12: 'MONITOR OCTAL COMP 2 IN R1',
  13: 'MONITOR OCTAL COMP 3 IN R1',
  14: 'MONITOR OCTAL COMP 1,2 IN R1,R2',
  15: 'MONITOR OCTAL COMP 1,2,3 IN R1,R2,R3',
  16: 'MONITOR DECIMAL IN R1 OR R1,R2 OR R1,R2,R3',
  17: 'MONITOR DP DECIMAL IN R1,R2 (TEST ONLY)',
  21: 'LOAD COMPONENT 1 INTO R1',
  22: 'LOAD COMPONENT 2 INTO R2',
  23: 'LOAD COMPONENT 3 INTO R3',
  24: 'LOAD COMPONENT 1,2, INTO R1,R2',
  25: 'LOAD COMPONENT 1,2,3 INTO R1,R2,R3',
  27: 'DISPLAY FIXED MEMORY',
  30: 'REQUEST EXECUTIVE',
  31: 'REQUEST WAITLIST',
  32: 'RECYCLE PROGRAM',
  33: 'PROCEED WITHOUT DSKY INPUTS',
  34: 'TERMINATE FUNCTION',
  35: 'TEST LIGHTS',
  36: 'REQUEST FRESH START',
  37: 'CHANGE PROGRAM (MAJOR MODE)',
};

const ext = (name, handler, extra = {}) => ({ name, kind: 'extended', handler, impl: false, ...extra });
const please = (name) => ({ name, kind: 'please', handler: 'GOLOADLV', impl: true });
const spareExt = () => ({ name: '(spare)', kind: 'spare', handler: 'ALM/END', impl: true });

// Luminary099/EXTENDED_VERBS.agc:51-113 (fan) and AOI :207-269 (names).
const EXT_LUMINARY099 = {
  40: ext('ZERO CDU-S', 'VBZERO'),
  41: ext('COARSE ALIGN CDU-S', 'VBCOARK'),
  42: ext('FINE ALIGN IMU', 'IMUFINEK'),
  43: ext('LOAD IMU ATT ERROR METERS', 'IMUATTCK'),
  44: ext('TERMINATE RR CONTINUOUS DESIGNATE (V41N72 OPTION 2)', 'RRDESEND'),
  45: spareExt(), 46: spareExt(),
  47: ext('INITIALIZE AGS (R47)', 'V47TXACT'),
  48: ext('REQUEST DAP DATA LOAD ROUTINE (R03)', 'DAPDISP'),
  49: ext('REQUEST CREW DEFINED MANEUVER ROUTINE (R62)', 'CREWMANU'),
  50: please('PLEASE PERFORM'),
  51: spareExt(),
  52: please('MARK X-RETICLE'),
  53: please('MARK Y-RETICLE'),
  54: please('MARK X OR Y-RETICLE'),
  55: ext('INCREMENT AGC TIME (DECIMAL)', 'ALINTIME'),
  56: ext('TERMINATE TRACKING (P20 + P25)', 'TRMTRACK'),
  // LRON / LROFF: UPFLAG / DOWNFLAG LRINH, then GOPIN
  // (Luminary099/EXTENDED_VERBS.agc:431-439).
  57: ext('PERMIT LANDING RADAR UPDATES', 'LRON', { impl: true, flag: { LRINH: true } }),
  58: ext('INHIBIT LANDING RADAR UPDATES', 'LROFF', { impl: true, flag: { LRINH: false } }),
  59: spareExt(),
  60: ext('COMMAND LR TO POSITON 2.', 'LRPOS2K'),
  61: ext('DISPLAY DAP FOLLOWING ATTITUDE ERRORS.', 'DAPATTER'),
  62: ext('DISPLAY TOTAL ATTITUDE ERRORS WITH RESPECT TO NOUN 22.', 'TOTATTER'),
  63: ext('SAMPLE RADAR ONCE PER SECOND (R04).', 'R04'),
  64: ext('REQUEST S-BAND ANTENNA ROUTINE (R05).', 'VB64'),
  65: ext('DISABLE U AND V JET FIRINGS DURING DPS BURNS.', 'SNUFFOUT'),
  66: ext('VEHICLES ARE ATTACHED.  MOVE THIS VEHICLE STATE TO OTHER VEHICLE.', 'ATTACHED'),
  67: ext('DISPLAY W MATRIX', 'V67'),
  68: spareExt(),
  // VERB69 TC VERB69: a TC to itself trips the hardware TC trap -> GOJAM
  // (Luminary099/EXTENDED_VERBS.agc:81; research src-executive §8.2).
  69: ext('CAUSE RESTART', 'VERB69', { impl: true }),
  70: ext('UPDATE LIFTOFF TIME', 'V70UPDAT'),
  71: ext('UNIVERSAL UPDATE-BLOCK ADR', 'V71UPDAT'),
  72: ext('UNIVERSAL UPDATE-SINGLE ADR', 'V72UPDAT'),
  73: ext('UPDATE AGC TIME (OCTAL)', 'V73UPDAT'),
  74: ext('INITIALIZE ERASABLE DUMP VIA DOWNLINK', 'DNEDUMP'),
  75: ext('ENABLE U AND V JET FIRINGS DURING DPS BURNS.', 'OUTSNUFF'),
  76: ext('MINIMUM IMPUSE COMMAND MODE.', 'MINIMP'),
  77: ext('RATE COMMAND AND ATTITUDE HOLD MODE', 'NOMINIMP'),
  78: ext('LR SPURIOUS RETURN TEST START (R77)', 'R77'),
  79: ext('LR SPURIOUS RETURN TEST STOP', 'R77END'),
  80: ext('UPDATE LEM STATE VECTOR', 'LEMVEC'),
  81: ext('UPDATE CSM STATE VECTOR', 'CSMVEC'),
  82: ext('REQUEST ORBIT PARAM DISPLAY (R30)', 'V82PERF'),
  83: ext('REQUEST REND  PARAM DISPLAY (R31)', 'V83PERF'),
  84: spareExt(),
  85: ext('DISPLAY RR LOS AZ AND ELEV', 'VERB85'),
  86: spareExt(), 87: spareExt(), 88: spareExt(),
  89: ext('REQUEST RENDEZVOUS FINAL ATTITUDE ROUTINE (R63)', 'V89PERF'),
  90: ext('REQUEST RENDEZVOUS OUT OF PLANE DISPLAY ROUTINE (R36)', 'V90PERF'),
  91: ext('DISPLAY BANK SUM', 'GOSHOSUM'),
  92: ext('OPERATE IMU PERFORMANCE TEST (P07)', 'SYSTEST'),
  93: ext('ENABLE W MATRIX INITIALIZATION', 'WMATRXNG'),
  94: spareExt(),
  95: ext('NO UPDATE OF EITHER STATE VECTOR (P20 OR P22)', 'UPDATOFF'),
  96: ext('INTERRUPT INTEGRATION AND GO TO P00', 'VERB96'),
  97: please('PERFORM ENGINE FAIL PROCEDURE'),
  98: spareExt(),
  99: please('PLEASE ENABLE ENGINE'),
};

// Comanche055/EXTENDED_VERBS.agc:53-115 (fan) and AOI :185-246 (names).
const EXT_COMANCHE055 = {
  40: ext('ZERO CDU-S', 'VBZERO'),
  41: ext('COARSE ALIGN CDU-S', 'VBCOARK'),
  42: ext('FINE ALIGN IMU-S', 'IMUFINEK'),
  43: ext('LOAD IMU ATT ERROR METERS', 'IMUATTCK'),
  44: ext('SET   SURFACE FLAG', 'SETSURF'),
  45: ext('RESET SURFACE FLAG', 'RESTSRF'),
  46: ext('ESTABLISH G+C CONTROL', 'STABLISH'),
  47: ext('MOVE LM STATE VECTOR INTO CM STATE VECTOR.', 'LMTOCMSV'),
  48: ext('REQUEST DAP DATA LOAD ROUTINE (R03)', 'DAPDISP'),
  49: ext('REQUEST CREW DEFINED MANEUVER ROUTINE (R62)', 'CREWMANU'),
  50: please('PLEASE PERFORM'),
  51: please('PLEASE MARK'),
  52: ext('MARK ON OFFSET LANDING SITE', 'V52'),
  53: please('PLEASE PERFORM ALTERNATE LOS MARK'),
  54: ext('REQUEST RENDEZVOUS BACKUP SIGHTING MARK ROUTINE (R23)', 'GOTOR23'),
  55: ext('INCREMENT AGC TIME (DECIMAL)', 'ALINTIME'),
  56: ext('TERMINATE TRACKING (P20 + P25)', 'TRACKTRM'),
  57: ext('REQUEST RENDEZVOUS SIGHTING MARK ROUTINE (R21)', 'GOTOR21'),
  58: ext('RESET STICK FLAG', 'ENATMA'),
  59: please('PLEASE CALIBRATE'),
  60: ext('SET ASTRONAUT TOTAL ATTITUDE (N17) TO PRESENT ATTITUDE', 'V60'),
  61: ext('DISPLAY DAP ATTITUDE ERROR', 'V61'),
  62: ext('DISPLAY TOTAL ATTITUDE ERROR (WRT N22 (THETAD))', 'V62'),
  63: ext('DISPLAY TOTAL ASTRONAUT ATTITUDE ERROR (WRT N17 (CPHIX))', 'V63'),
  64: ext('REQUEST S-BAND ANTENNA ROUTINE', 'VB64'),
  65: ext('OPTICAL VERIFICATION OF PRELAUNCH ALIGNMENT', 'CKOPTVB'),
  66: ext('VEHICLES ARE ATTACHED.  MOVE THIS VEHICLE STATE TO OTHER VEHICLE.', 'ATTACHED'),
  67: ext('W MATRIX MONITOR', 'V67'),
  68: ext('CSM STROKE TEST ON', 'STROKON'),
  69: ext('CAUSE RESTART', 'VERB69', { impl: true }),
  70: ext('UPDATE LIFTOFF TIME', 'V70UPDAT'),
  71: ext('UNIVERSAL UPDATE-BLOCK  ADR', 'V71UPDAT'),
  72: ext('UNIVERSAL UPDATE-SINGLE ADR', 'V72UPDAT'),
  73: ext('UPDATE AGC TIME (OCTAL)', 'V73UPDAT'),
  74: ext('INITIALIZE ERASABLE DUMP VIA DOWNLINK', 'DNEDUMP'),
  75: ext('BACKUP LIFTOFF', 'LFTFLGON'),
  76: ext('SET PREFERRED ATTITUDE FLAG', 'SETPRFLG'),
  77: ext('RESET PREFERRED ATTITUDE FLAG', 'RESETPRF'),
  78: ext('UPDATE PRELAUNCH AZIMUTH', 'CHAZFOGC'),
  79: spareExt(),
  80: ext('UPDATE LEM STATE VECTOR', 'LEMVEC'),
  81: ext('UPDATE CSM STATE VECTOR', 'CSMVEC'),
  82: ext('REQUEST ORBIT PARAM DISPLAY (R30)', 'V82PERF'),
  83: ext('REQUEST REND  PARAM DISPLAY (R31)', 'V83PERF'),
  84: spareExt(),
  85: ext('REQUEST RENDEZVOUS PARAMETER DISPLAY NO. 2 (R34)', 'V85PERF'),
  86: ext('REJECT RENDEZVOUS BACKUP SIGHTING MARK', 'V86PERF'),
  87: ext('SET VHF RANGE FLAG', 'SETVHFLG'),
  88: ext('RESET VHF RANGE FLAG', 'RESETVHF'),
  89: ext('REQUEST RENDEZVOUS FINAL ATTITUDE ROUTINE (R63)', 'V89PERF'),
  90: ext('REQUEST RENDEZVOUS OUT OF PLANE DISPLAY ROUTINE (R36)', 'V90PERF'),
  91: ext('DISPLAY BANK SUM', 'GOSHOSUM'),
  92: ext('OPERATE IMU PERFORMANCE TEST (P07)', 'SYSTEST'),
  93: ext('ENABLE W MATRIX INITIALIZATION', 'WMATRXNG'),
  94: ext('PERFORM CYSLUNAR ATTITUDE MANEUVER (P23)', 'VERB94'),
  95: spareExt(),
  96: ext('TERMINATE INTEGRATION AND GO TO P00', 'VERB96'),
  97: please('PERFORM ENGINE FAIL PROCEDURE'),
  98: spareExt(),
  99: please('PLEASE ENABLE ENGINE'),
};

// Source anchor of each handler (data/anchors/pinball.js); Comanche055
// anchors carry a `cmc.` infix. Handlers not listed point at the table.
const HANDLER_ANCHOR = {
  DSPA: 'display', DSPB: 'display', DSPC: 'display', DSPAB: 'display', DSPABC: 'display',
  DECDSP: 'decdsp', DSPDPDEC: 'decdsp', MONITOR: 'monitor',
  ALOAD: 'load', BLOAD: 'load', CLOAD: 'load', ABLOAD: 'load', ABCLOAD: 'load',
  VBRESEQ: 'vbproc', VBPROC: 'vbproc', VBTERM: 'vbproc',
  VBTSTLTS: 'v35', SLAP1: 'v36', MMCHANG: 'v37', VERB69: 'v69',
  LRON: 'v57', LROFF: 'v57', GOLOADLV: 'goloadlv', 'ALM/END': 'almend',
};

function build(regular, extended, software) {
  const table = {};
  const reg = regularVerbs(REGULAR_NAMES);
  const prefix = software === 'Comanche055' ? 'verb.cmc.' : 'verb.';
  for (let v = 0; v <= 99; v++) {
    const entry = v < 40 ? reg[v] : extended[v];
    if (!entry) throw new Error(`${software}: verb ${v} missing from the table`);
    const a = HANDLER_ANCHOR[entry.handler] || (v < 40 ? 'verbtab' : 'lst2fan');
    table[v] = Object.freeze({ verb: v, ...entry, anchor: prefix + a });
  }
  return Object.freeze(table);
}

export const VERBS_LUMINARY099 = build(REGULAR_NAMES, EXT_LUMINARY099, 'Luminary099');
export const VERBS_COMANCHE055 = build(REGULAR_NAMES, EXT_COMANCHE055, 'Comanche055');

// The programs V37 accepts: the PREMM1 table plus P00 (always) and, in
// Luminary099, the special-cased P70/P71 (Luminary099/FRESH_START_AND_RESTART.agc:
// 748-758, 1116-1146, NOV37MM DEC 29 at :1152 = 30 entries;
// Comanche055/FRESH_START_AND_RESTART.agc:862-892, 1311-1344). Anything
// else gives V37NONO: TC FALTON (Luminary099 :978, Comanche055 :1056).
export const V37_PROGRAMS_LUMINARY099 = Object.freeze([
  0, 6, 12, 20, 21, 22, 25, 30, 31, 32, 33, 34, 35, 38, 39, 40, 41, 42, 47,
  51, 52, 57, 63, 68, 70, 71, 72, 73, 74, 75, 76, 78, 79,
]);
export const V37_PROGRAMS_COMANCHE055 = Object.freeze([
  0, 1, 6, 17, 20, 21, 22, 23, 30, 31, 32, 33, 34, 35, 37, 38, 39, 40, 41, 47,
  51, 52, 53, 54, 61, 62, 72, 73, 74, 75, 76, 77, 78, 79,
]);

export function verbTable(software = 'Luminary099') {
  return software === 'Comanche055' ? VERBS_COMANCHE055 : VERBS_LUMINARY099;
}

export function v37Programs(software = 'Luminary099') {
  return software === 'Comanche055' ? V37_PROGRAMS_COMANCHE055 : V37_PROGRAMS_LUMINARY099;
}

// Verbs from LOWVERB (28) up make no noun test (ENTPAS0,
// Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:901, :909-911); from
// LST2CON (40) up they are extended verbs (:970-980).
export const LOWVERB = 28;
export const FIRST_EXTENDED_VERB = 40;

// Verbs a program pastes into the VERB lights after its display ("PLEASE"
// verbs, GOLOADLV in the fan). V50 for GOPERF, V97/V99 for CLOCPLAY
// (DISPLAY_INTERFACE_ROUTINES.agc:808-833, 1125-1145).
export function isPleaseVerb(verb, software = 'Luminary099') {
  return verbTable(software)[verb]?.kind === 'please';
}
