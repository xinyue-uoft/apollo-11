// Source anchors used by the demo scenarios (js/demo/scenarios/*.js) that
// no other anchor file defines: the famous comments, the tables and the
// exact lines a narration card points at. Every range below was checked by
// hand against the listing in this repository (1-based line numbers); where
// `label` is given, line `start` begins with that label in the AGC label
// column (enforced by test/anchors.test.mjs).
//
// Prefix `scn.` keeps these ids clear of the per-owner prefixes (`exec.`,
// `burn.`, `p63.` ...) so that the merge in anchors/index.js can never see a
// duplicate id, even while the other anchor files are still being written.

const BBB = 'Luminary099/BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc';
const LLGE = 'Luminary099/LUNAR_LANDING_GUIDANCE_EQUATIONS.agc';
const TLL = 'Luminary099/THE_LUNAR_LANDING.agc';
const PIN = 'Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc';
const AOI = 'Luminary099/ASSEMBLY_AND_OPERATION_INFORMATION.agc';
const FSR = 'Luminary099/FRESH_START_AND_RESTART.agc';

export const ANCHORS = {
  // ---------- BURN, BABY, BURN (master ignition routine) ----------
  'scn.burn.p63table': {
    file: BBB, label: 'P63TABLE', start: 127, end: 140,
    title: 'P63TABLE: the row of the WHICH table used for PDI',
  },
  'scn.burn.tig35': {
    file: BBB, label: 'TIG-35', start: 250, end: 273,
    title: 'TIG−35 s: blank the DSKY for 5 s (Average-G is starting)',
  },
  'scn.burn.blank': {
    file: BBB, label: 'BLANKDEX', start: 784, end: 788,
    title: '“The DSKY is blanked for 5 seconds at TIG-35”',
  },
  'scn.burn.tig30': {
    file: BBB, label: 'TIG-30', start: 292, end: 315,
    title: 'TIG−30 s: countdown display back, ullage scheduled',
  },
  'scn.burn.ullage': {
    file: BBB, label: 'ULLGTASK', start: 347, end: 350,
    title: 'ULLGTASK: ullage on at TIG−7.5 s',
  },
  'scn.burn.tig5': {
    file: BBB, label: 'TIG-5', start: 354, end: 386,
    title: 'TIG−5 s: ask the crew to enable the engine (V99)',
  },
  'scn.burn.v99': {
    file: BBB, label: 'VB99DEX', start: 768, end: 781,
    title: 'V99Nxx: the “please enable engine” display',
  },
  'scn.burn.proceed': {
    file: BBB, label: '*PROCEED', start: 816, end: 819,
    title: 'PRO on V99: the astronaut okays ignition',
  },
  'scn.burn.tig0': {
    file: BBB, label: 'TIG-0', start: 390, end: 412,
    title: 'TIG: schedule the throttle-up, check for the crew’s PRO',
  },
  'scn.burn.ignition': {
    file: BBB, label: 'IGNITION', start: 414, end: 440,
    title: 'IGNITION: ENGINE ON (channel 11 bit 13)',
  },
  'scn.burn.p63ign': {
    file: BBB, label: 'P63IGN', start: 442, end: 471,
    title: 'P63IGN: burn displays on, countdown clock “assassinated”',
  },
  'scn.burn.zoom': {
    file: BBB, label: 'P63ZOOM', start: 564, end: 584,
    title: 'P63ZOOM: connect landing guidance and throttle up (TIG+26 s)',
  },
  'scn.throttle.flatout': {
    file: 'Luminary099/THROTTLE_CONTROL_ROUTINES.agc', label: 'FLATOUT', start: 191, end: 198,
    title: 'FLATOUT: command 4096 pulses — full throttle',
  },
  'scn.throttle.region': {
    file: 'Luminary099/THROTTLE_CONTROL_ROUTINES.agc', start: 63, end: 112,
    title: 'Throttle logic: 10 %–94 % region and throttle recovery',
  },

  // ---------- P63 / P64 / P66 / P68 ----------
  'scn.p63.entry': {
    file: TLL, label: 'P63LM', start: 40, end: 73,
    title: 'P63LM and FLAGORGY (“Dionysian flag waving”)',
  },
  'scn.guid.tables': {
    file: LLGE, start: 36, end: 101,
    title: 'Landing flight-sequence tables (braking, approach, vertical)',
  },
  'scn.guid.lunland': {
    file: LLGE, label: 'LUNLAND', start: 117, end: 121,
    title: 'LUNLAND: restart protection for navigation and guidance',
  },
  'scn.guid.ttf8': {
    file: LLGE, label: 'TTF/8CL', start: 489, end: 500,
    title: 'TTF/8: the time-to-go cubic of the quadratic guidance',
  },
  'scn.guid.quadguid': {
    file: LLGE, start: 540, end: 600,
    title: 'QUADGUID: the acceleration command',
  },
  'scn.guid.dispexit': {
    file: LLGE, label: 'DISPEXIT', start: 835, end: 854,
    title: 'DISPEXIT: guidance displays (V06N63) on every pass',
  },
  'scn.guid.startp64': {
    file: LLGE, label: 'STARTP64', start: 260, end: 271,
    title: 'STARTP64: switch to the approach phase',
  },
  'scn.guid.p64disps': {
    file: LLGE, label: 'P64DISPS', start: 856, end: 885,
    title: 'P64DISPS: flashing V06N64 until PRO, then redesignation',
  },
  'scn.guid.redesmon': {
    file: LLGE, label: 'REDESMON', start: 1155, end: 1212,
    title: 'REDESMON / COUNT’EM: LPD clicks — ½° per click fore/aft, 2° left/right',
  },
  'scn.guid.guilden': {
    file: LLGE, label: 'GUILDEN', start: 134, end: 214,
    title: 'GUILDENSTERN (R13): attitude hold + ROD click → P66',
  },
  'scn.guid.p66': {
    file: LLGE, label: 'RODTASK', start: 934, end: 953,
    title: 'P66: RODTASK / RODCOMP every second, each click → new sink rate',
  },
  'scn.guid.vertdisp': {
    file: LLGE, label: 'VERTDISP', start: 889, end: 890,
    title: 'VERTDISP: V06N60 in P65/P66/P67',
  },
  'scn.p68.landjunk': {
    file: TLL, label: 'LANDJUNK', start: 286, end: 322,
    title: 'P68: “Astronaut: now look where you ended up”',
  },

  // ---------- SERVICER, V57, nouns ----------
  'scn.servicer.readaccs': {
    file: 'Luminary099/SERVICER.agc', label: 'READACCS', start: 79, end: 104,
    title: 'READACCS: every 2 s, read the PIPAs and start SERVICER (PRIO 20, FINDVAC)',
  },
  'scn.servicer.job': {
    file: 'Luminary099/SERVICER.agc', label: 'SERVICER', start: 175, end: 182,
    title: 'SERVICER: restart-protected Average-G pass',
  },
  'scn.verb.v57': {
    file: 'Luminary099/EXTENDED_VERBS.agc', label: 'LRON', start: 431, end: 435,
    title: 'V57 (LRON): permit landing-radar updates',
  },
  'scn.noun.n68': {
    file: AOI, start: 423, end: 425,
    title: 'Noun 68: slant range, time to go, LR alt − computed alt (ΔH)',
  },
  'scn.noun.list.landing': {
    file: AOI, start: 399, end: 425,
    title: 'Nouns 60–68 of the landing programs',
  },

  'scn.lr.lites': {
    file: 'Luminary099/P20-P25.agc', label: 'R12LITES', start: 5115, end: 5180,
    title: 'R12LITES: the DSKY’s ALT and VEL lamps (no good radar data)',
  },
  'scn.lr.35kchk': {
    file: 'Luminary099/SERVICER.agc', label: 'ALTCRIT', start: 899, end: 932,
    title: '“35KCHK” really tests 50,000 ft: start reading the landing radar',
  },

  // ---------- Executive, alarms, restarts ----------
  'scn.exec.coresets': {
    file: 'Luminary099/ERASABLE_ASSIGNMENTS.agc', start: 373, end: 383,
    title: 'Core sets: eight sets of 12 registers',
  },
  'scn.exec.vacareas': {
    file: 'Luminary099/ERASABLE_ASSIGNMENTS.agc', start: 430, end: 443,
    title: 'FAILREG and the five VAC areas',
  },
  'scn.exec.1201': {
    file: 'Luminary099/EXECUTIVE.agc', label: 'FINDVAC2', start: 133, end: 147,
    title: 'FINDVAC2: no VAC area free → BAILOUT1, OCT 1201',
  },
  'scn.exec.1202': {
    file: 'Luminary099/EXECUTIVE.agc', label: 'NEXTCORE', start: 201, end: 208,
    title: 'NEXTCORE: all core sets busy → BAILOUT1, OCT 1202',
  },
  'scn.exec.novac2': {
    file: 'Luminary099/EXECUTIVE.agc', label: 'NOVAC2', start: 155, end: 208,
    title: 'NOVAC2: the core-set search (8 sets)',
  },
  'scn.alarm.list': {
    file: AOI, start: 966, end: 968,
    title: 'Alarm list: 1201, 1202, 1203',
  },
  'scn.alarm.bailout1': {
    file: 'Luminary099/ALARM_AND_ABORT.agc', label: 'BAILOUT1', start: 189, end: 196,
    title: 'BAILOUT1: record the code, then a software restart',
  },
  'scn.alarm.failreg': {
    file: 'Luminary099/ALARM_AND_ABORT.agc', start: 63, end: 99,
    title: 'CHKFAIL / PROGLARM / MULTFAIL: FAILREG and the PROG light',
  },
  'scn.restart.enema': {
    file: FSR, label: 'ENEMA', start: 281, end: 288,
    title: 'ENEMA: the software-restart entry',
  },
  'scn.restart.killmon': {
    file: FSR, start: 531, end: 562,
    title: 'STARTSB2: blank the DSKY, “KILL MONITOR”, kill interface displays',
  },
  'scn.restart.goprog3': {
    file: FSR, label: 'GOPROG3', start: 290, end: 350,
    title: 'GOPROG3: re-start every active restart group from its phase',
  },
  'scn.restart.tables5': {
    file: 'Luminary099/RESTART_TABLES.agc', start: 249, end: 278,
    title: 'Restart tables, group 5: READACCS / SERVICER re-created',
  },

  // ---------- PINBALL (keyboard & display) ----------
  'scn.pinball.keyrupt': {
    file: 'Luminary099/KEYRUPT_UPRUPT.agc', label: 'KEYRUPT1', start: 35, end: 55,
    title: 'KEYRUPT1: every keystroke becomes a CHARIN job',
  },
  'scn.pinball.charin': {
    file: PIN, label: 'CHARIN', start: 463, end: 500,
    title: 'CHARIN: PINBALL decodes the key',
  },
  'scn.pinball.monitor': {
    file: PIN, label: 'MONITOR', start: 2333, end: 2395,
    title: 'MONITOR / MONREQ: a V16 display re-runs every second',
  },
  'scn.pinball.lamptest': {
    file: PIN, label: 'VBTSTLTS', start: 3623, end: 3659,
    title: 'VBTSTLTS (V35): turn on every light for 5 s',
  },
  'scn.pinball.rset': {
    file: PIN, label: 'ERROR', start: 3732, end: 3787,
    title: 'ERROR (RSET): clear PROG, OPR ERR and FAILREG',
  },
  'scn.pinball.keyrel': {
    file: PIN, label: 'VBRELDSP', start: 2918, end: 2931,
    title: 'VBRELDSP (KEY REL): give the DSKY back to the program',
  },
  'scn.pinball.verbtab': {
    file: PIN, label: 'VERBTAB', start: 986, end: 1027,
    title: 'VERBTAB: one entry per verb; spares go to GODSPALM',
  },
  'scn.pinball.oprerr': {
    file: PIN, label: 'DSPALARM', start: 2732, end: 2745,
    title: 'DSPALARM / CHARALRM: illegal entry → OPR ERR',
  },
  'scn.pinball.falton': {
    file: PIN, label: 'FALTON', start: 3426, end: 3429,
    title: 'FALTON: turn on the OPERATOR ERROR light (channel 11 bit 7)',
  },
  'scn.pinball.v37': {
    file: PIN, label: 'MMCHANG', start: 2777, end: 2796,
    title: 'MMCHANG (V37): read the new program number',
  },
  'scn.v37.table': {
    file: FSR, label: 'FCADRMM1', start: 1063, end: 1075,
    title: 'Programs V37 may select (P68 = LANDJUNK, P63 = P63LM)',
  },
  'scn.burn.v06n61': {
    file: BBB, start: 752, end: 758,
    title: 'Flashing V06N61: “reset his event timer to agree with TIG”',
  },
  'scn.display.vacdsp': {
    file: 'Luminary099/DISPLAY_INTERFACE_ROUTINES.agc', label: 'GODSPRS1', start: 833, end: 856,
    title: '“Is this a flashing R display? Yes, make DSPLAY job a VAC”',
  },
  'scn.pinball.nouns': {
    file: 'Luminary099/PINBALL_NOUN_TABLES.agc', start: 714, end: 731,
    title: 'Noun tables: where N60–N65 get their numbers (ECADRs)',
  },
};
