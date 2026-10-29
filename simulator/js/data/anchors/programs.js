// Source anchors owned by the Lunar Module programs (engineer D): the
// master ignition routine BURNBABY, SERVICER (Average-G and the landing
// radar), P63-P68, the landing guidance and the throttle routines
// (ARCHITECTURE §10; prefixes burn. servicer. p63. p64. p65. p66. p68.
// guid. throttle. lr.). Every range was checked against this repository's
// Luminary099 listing (1-based lines; `label`, when given, begins line
// `start`). Research: src-ignition.md §18, src-landing.md §17.

const BBB = 'Luminary099/BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc';
const SRV = 'Luminary099/SERVICER.agc';
const TLL = 'Luminary099/THE_LUNAR_LANDING.agc';
const LLGE = 'Luminary099/LUNAR_LANDING_GUIDANCE_EQUATIONS.agc';
const THR = 'Luminary099/THROTTLE_CONTROL_ROUTINES.agc';

export const ANCHORS = {
  // ---------- BURNBABY: the master ignition routine ----------

  'burn.header': {
    file: BBB, start: 53, end: 72,
    title: 'BURNBABY header: one routine for P12, P40, P42, P61 and P63, driven by tables',
    note: 'Everything “between the pre-ignition time check … and TIG + 26 seconds”; the user program puts the address of its table in WHICH and jumps to BURNBABY — “there is no return”.',
  },
  'burn.which': {
    file: BBB, start: 58, end: 62,
    title: 'Variations among programs live in tables indexed by the register WHICH',
  },
  'burn.tables': {
    file: BBB, start: 68, end: 153,
    title: 'The ignition tables (NOLI SE TANGERE): P12, P40, P41, P42, P63 and abort rows',
    note: 'The (0)…(14) offsets in the comments are octal: (11) is the tenth word of a row.',
  },
  'burn.p63table': {
    file: BBB, label: 'P63TABLE', start: 127, end: 140,
    title: 'P63TABLE: V06N62 countdown, ullage DEC 2240 cs after TIG-30, P63IGN at ignition',
  },
  'burn.p40table': {
    file: BBB, label: 'P40TABLE', start: 88, end: 102,
    title: 'P40TABLE: V06N40 countdown, STEERING before ignition, GOPOST on ENTER',
  },
  'burn.entry': {
    file: BBB, label: 'BURNBABY', start: 159, end: 179,
    title: 'BURNBABY: restart group 4, DVTOTAL zeroed, P40AUTO mode check, engine-off pre-arm, INDEX WHICH',
  },
  'burn.burnbaby': {
    file: BBB, label: 'BURNBABY', start: 159, end: 246,
    title: 'BURNBABY up to CALLT-35: integrate the state to TIG-29.9 s, then set up the TIG-35 task',
  },
  'burn.integrate': {
    file: BBB, label: 'P41SPOT', start: 188, end: 220,
    title: 'Integrate the LM state to TDEC1 = TIG − 29.9 s (alarm 1703 and TIG slipped if too late)',
  },
  'burn.callt35': {
    file: BBB, label: 'CALLT-35', start: 222, end: 246,
    title: 'CALLT-35: LONGCALL the TIG-35 task; P63 starts the V06N62 countdown',
  },
  'burn.tig35': {
    file: BBB, label: 'TIG-35', start: 250, end: 263,
    title: 'TIG-35: schedule TIG-30 in 5 s and blank the DSKY',
  },
  'burn.tig30': {
    file: BBB, label: 'TIG-30', start: 292, end: 315,
    title: 'TIG-30: TIG-5 in 24.9 s, countdown back on, ullage task in table (6) centiseconds',
  },
  'burn.ullgnot': {
    file: BBB, label: 'ULLGNOT', start: 321, end: 343,
    title: 'ULLGNOT: AVEGEXIT from table (7), restart 4.2, PREREAD starts Average-G',
  },
  'burn.ullgtask': {
    file: BBB, label: 'ULLGTASK', start: 347, end: 350,
    title: 'ULLGTASK: ullage on — “THIS COMES AT TIG-7.5 OR TIG-3.5”',
  },
  'burn.tig5': {
    file: BBB, label: 'TIG-5', start: 354, end: 386,
    title: 'TIG-5: TIG-0 in 5 s, IGNFLAG and ASTNFLAG cleared, DISPCHNG asks for V99',
  },
  'burn.tig0': {
    file: BBB, label: 'TIG-0', start: 390, end: 412,
    title: 'TIG-0: P63 schedules the throttle-up ZOOMTIME after nominal TIG; has the astronaut said PRO?',
  },
  'burn.ignition': {
    file: BBB, label: 'IGNITION', start: 414, end: 440,
    title: 'IGNITION: ENGINE ON (channel 11 bit 13), TEVENT, TIG := TIME2 + TGO',
  },
  'burn.p63ign': {
    file: BBB, label: 'P63IGN', start: 442, end: 471,
    title: 'P63IGN: V06N63 each pass, kill the countdown clock, enable aborts and R10, WCHPHASE = 0',
  },
  'burn.dvmoncon': {
    file: BBB, label: 'DVMONCON', start: 520, end: 540,
    title: 'DVMONCON: connect the ΔV monitor, ullage off 0.5 s after light-up, WAITABIT kills group 4',
  },
  'burn.zoom': {
    file: BBB, label: 'P63ZOOM', start: 564, end: 584,
    title: 'P63ZOOM: connect LUNLAND to SERVICER and FLATOUT — throttle up to maximum',
  },
  'burn.comfail': {
    file: BBB, label: 'COMFAIL', start: 595, end: 645,
    title: 'COMFAIL: thrust failure — flashing V97 “perform engine fail procedure”',
  },
  'burn.ullage': {
    file: BBB, label: 'NOULLAGE', start: 660, end: 670,
    title: 'NOULLAGE / ONULLAGE: the DAP’s ullage bit (+X RCS translation)',
  },
  'burn.stclok': {
    file: BBB, label: 'STCLOK1', start: 674, end: 703,
    title: 'STCLOK: start the countdown clock in step with the whole seconds before TIG',
  },
  'burn.cloktask': {
    file: BBB, label: 'CLOKTASK', start: 705, end: 739,
    title: 'CLOKTASK / CLOKJOB: once a second, TTOGO = TIME2 − TIG and the display chosen by DISPDEX',
  },
  'burn.dispdex': {
    file: BBB, label: 'VB97DEX', start: 741, end: 788,
    title: 'The DISPDEX displays: V97 engine fail, V06N61, the V06Nxx countdown, V99 and the blank',
  },
  'burn.v99': {
    file: BBB, label: 'VB99DEX', start: 768, end: 781,
    title: 'V99Nxx flashing: “THIS IS THE PLEASE ENABLE ENGINE DISPLAY; IT IS INITIATED AT TIG-5 SEC.”',
  },
  'burn.blank': {
    file: BBB, label: 'BLANKDEX', start: 784, end: 788,
    title: '“THE DSKY IS BLANKED FOR 5 SECONDS AT TIG-35 TO INDICATE THAT AVERAGE G IS STARTING.”',
    note: 'CLEANDSP ends in ENDRET’s “BLANK EVERYTHING EXCEPT MM” (CLEANEND → JAMTERM → ENDRET, DISPLAY_INTERFACE_ROUTINES.agc:1171-1176, 1272-1273): the program number stays lit.',
  },
  'burn.responses': {
    file: BBB, label: 'STOPCLOK', start: 790, end: 877,
    title: 'Crew responses: terminate (STOPCLOK), PRO (*PROCEED → IGNITE), ENTER (table entry 3)',
  },
  'burn.proceed': {
    file: BBB, label: '*PROCEED', start: 816, end: 819,
    title: '*PROCEED: the astronaut has okayed ignition (ASTNFLAG)',
  },
  'burn.ignite': {
    file: BBB, label: 'IGNITE', start: 860, end: 877,
    title: 'IGNITE: PRO after TIG ignites at once (restart 4.23); before TIG the countdown returns',
  },
  'burn.constants': {
    file: BBB, label: 'D29.9SEC', start: 956, end: 960,
    title: 'D29.9SEC, S24.9SEC, 4.9SEC: the timing constants of the ignition sequence',
  },

  // ---------- SERVICER: Average-G navigation, every 2 seconds ----------

  'servicer.preread': {
    file: SRV, label: 'PREREAD', start: 42, end: 74,
    title: 'PREREAD: the first Average-G pass (LASTBIAS, NORMLIZE, READACCS in 2 s)',
  },
  'servicer.readaccs': {
    file: SRV, label: 'READACCS', start: 79, end: 139,
    title: 'READACCS: every 2 s read the accelerometers and create SERVICER (PRIO20, FINDVAC)',
  },
  'servicer.job': {
    file: SRV, label: 'SERVICER', start: 175, end: 241,
    title: 'SERVICER: ΔV, mass, DVTOTAL and the Average-G state update',
  },
  'servicer.dvmon': {
    file: SRV, label: 'DVMON', start: 262, end: 330,
    title: 'DVMON: is the engine really thrusting? then SERVOUT jumps to the guidance (AVGEXIT)',
  },
  'servicer.servexit': {
    file: SRV, label: 'SERVEXIT', start: 441, end: 444,
    title: 'SERVEXIT: the do-nothing guidance exit used before ignition',
  },
  'servicer.munrvg': {
    file: SRV, label: 'MUNRVG', start: 1041, end: 1086,
    title: 'MUNRVG: the lunar Average-G integrator — HCALC = |R| − /LAND/, HDOTDISP, ABVEL',
  },

  // ---------- landing radar (R12, inside SERVICER) ----------

  'lr.munretrn': {
    file: SRV, label: 'MUNRETRN', start: 717, end: 783,
    title: 'MUNRETRN: the landing-radar decision chain of every SERVICER pass',
  },
  'lr.altcrit': {
    file: SRV, label: 'ALTCRIT', start: 899, end: 932,
    title: 'ALTCRIT / XORCHK / 35KCHK: LR altitude reads below 50,000 ft (despite the label)',
  },
  'lr.lrhtask': {
    file: SRV, label: 'LRHTASK', start: 664, end: 687,
    title: 'LRHTASK: one LR altitude read job per 2-s cycle, just before READACCS',
  },
  'lr.deltah': {
    file: SRV, label: 'POSUPDAT', start: 1110, end: 1142,
    title: 'POSUPDAT: DELTAH = LR altitude − computed altitude (N68 R3)',
  },
  'lr.incorporate': {
    file: SRV, label: 'NOREASON', start: 1164, end: 1204,
    title: 'Altitude update: only if V57 permitted it; weight LRWH·(1 − HCALC/LRHMAX)',
  },
  'lr.velupdat': {
    file: SRV, label: 'VELUPDAT', start: 1212, end: 1372,
    title: 'VELUPDAT: one LR velocity beam per pass, weighted by speed',
  },
  'lr.valtchk': {
    file: SRV, label: 'VALTCHK', start: 1375, end: 1394,
    title: 'VALTCHK: LR velocity reads start below 2,000 ft/s',
  },
  'lr.v57': {
    file: 'Luminary099/EXTENDED_VERBS.agc', label: 'LRON', start: 431, end: 439,
    title: 'V57 LRON: “PERMIT INCORPORATION OF LR DATA” (and V58 LROFF)',
  },
  'lr.lites': {
    file: 'Luminary099/P20-P25.agc', label: 'R12LITES', start: 5115, end: 5180,
    title: 'R12LITES: the ALT and VEL lamps (on = data fail, flashing = unreasonable data)',
  },

  // ---------- P63: braking phase ----------

  'p63.entry': {
    file: TLL, label: 'P63LM', start: 40, end: 73,
    title: 'P63LM and FLAGORGY: WHICH = P63TABLE, ΔV monitor, LRBYPASS cleared, MUNFLAG set',
  },
  'p63.ignalg': {
    file: TLL, label: 'IGNALG', start: 77, end: 119,
    title: 'IGNALG: the ignition algorithm — start from TLAND − 664.4 s and run the guidance ahead',
  },
  'p63.tig': {
    file: TLL, label: 'DDUMGOOD', start: 187, end: 201,
    title: 'DDUMGOOD: TIG = TDEC1 − ZOOMTIME (guidance starts at throttle-up, 26 s after TIG)',
  },
  'p63.astnclok': {
    file: TLL, label: 'IGNALGRT', start: 204, end: 210,
    title: 'ASTNCLOK: flashing V06N61 — set the event timer to TIG',
  },
  'p63.r51r60': {
    file: TLL, label: 'ASTNRET', start: 212, end: 237,
    title: 'ASTNRET: fine-align option (V50N25 00014), then R60 to the burn attitude (V50N18)',
  },
  'p63.lrpos': {
    file: TLL, label: 'P63SPOT3', start: 239, end: 255,
    title: 'P63SPOT3/4: LR antenna position check (V50N25 00500), then BURNBABY',
  },
  'p63.disps': {
    file: LLGE, label: 'P63DISPS', start: 850, end: 854,
    title: 'P63DISPS: V06N63 — velocity, altitude rate, altitude — after every guidance pass',
  },
  'p63.extlogic': {
    file: LLGE, label: 'EXTLOGIC', start: 692, end: 709,
    title: 'EXTLOGIC: switch to the approach phase when TENDBRAK + TTF/8 > 0 (TTF > −62 s)',
  },

  // ---------- landing guidance (every 2-s SERVICER pass) ----------

  'guid.tables': {
    file: LLGE, start: 40, end: 99,
    title: 'The guidance phase tables, indexed by WCHPHASE (IGNALG, P63, P64, vertical)',
  },
  'guid.lunland': {
    file: LLGE, label: 'LUNLAND', start: 117, end: 121,
    title: 'LUNLAND: group 5 keeps the PIPA task, group 3 protects the guidance at PRIO21',
  },
  'guid.guildenstern': {
    file: LLGE, label: 'GUILDEN', start: 134, end: 216,
    title: 'GUILDENSTERN (R13): manual throttle → P67; attitude hold plus a ROD click → P66',
  },
  'guid.guildret': {
    file: LLGE, label: 'GUILDRET', start: 224, end: 246,
    title: 'GUILDRET: ROD clicks outside attitude hold are discarded; new phase starts on FLPASS0 = 0',
  },
  'guid.ttfincr': {
    file: LLGE, label: 'TTFINCR', start: 288, end: 329,
    title: 'TTFINCR: advance TTF/8 by the pass interval, rotate the landing site with the Moon',
  },
  'guid.rgvgcalc': {
    file: LLGE, label: 'RGVGCALC', start: 442, end: 483,
    title: 'RGVGCALC: state in guidance coordinates, RANGEDSP, VHORIZ and the LPD angle LOOKANGL',
  },
  'guid.ttf8cl': {
    file: LLGE, label: 'TTF/8CL', start: 489, end: 525,
    title: 'TTF/8CL: the time-to-go cubic of the jerk target, solved by Newton iteration (ROOTPSRS)',
  },
  'guid.quadguid': {
    file: LLGE, label: 'QUADGUID', start: 546, end: 599,
    title: 'QUADGUID: ACG = ADG + 6(VDG + VG)/TTF + 12(RDG − RG)/TTF², with transport-lag lead',
  },
  'guid.afccalc': {
    file: LLGE, label: 'AFCCALC1', start: 600, end: 635,
    title: 'AFCCALC: thrust acceleration = ACG − g, limited to what the engine can give',
  },
  'guid.cgcalc': {
    file: LLGE, label: 'CGCALC', start: 641, end: 682,
    title: 'CGCALC: erect the guidance frame through the landing site',
  },
  'guid.exits': {
    file: LLGE, label: 'EXBRAK', start: 741, end: 797,
    title: 'EXBRAK / EXNORM: window commands — face up in P63, toward the site in P64',
  },
  'guid.steer': {
    file: LLGE, label: 'STEER?', start: 799, end: 827,
    title: 'STEER? / GDUMP1: throttle and attitude commands (not when the engine is off or in overflow)',
  },
  'guid.dispexit': {
    file: LLGE, label: 'DISPEXIT', start: 835, end: 890,
    title: 'DISPEXIT: kill group 3 — “DISPLAYS WILL BE RESTORED BY NEXT GUIDANCE CYCLE” — then V06N63/64/60',
  },
  'guid.tdispset': {
    file: LLGE, label: 'TDISPSET', start: 1384, end: 1416,
    title: 'TDISPSET: TTFDISP and TREDES (seconds of redesignation left) for the displays',
  },
  'guid.fastchng': {
    file: LLGE, label: 'FASTCHNG', start: 1423, end: 1429,
    title: 'FASTCHNG: a cheap restart waypoint inside the guidance',
  },

  // ---------- P64: approach phase ----------

  'p64.entry': {
    file: LLGE, label: 'STARTP64', start: 260, end: 268,
    title: 'STARTP64: PROG 64, TTF/8 += DELTTFAP (−110 s), hand-controller interrupt on, REDFLAG off',
  },
  'p64.disps': {
    file: LLGE, label: 'P64DISPS', start: 856, end: 886,
    title: 'P64DISPS: flashing V06N64 until PRO (P64CEED permits redesignation), then static',
  },
  'p64.redesig': {
    file: LLGE, label: 'REDESIG', start: 335, end: 408,
    title: 'REDESIG: move the landing site along the redesignated line of sight',
  },
  'p64.pitfall': {
    file: LLGE, label: 'PITFALL', start: 1130, end: 1172,
    title: 'PITFALL / REDESMON: catch one deflection-and-return of the hand controller',
  },
  'p64.countem': {
    file: LLGE, label: "COUNT'EM", start: 1174, end: 1212,
    title: 'COUNT\'EM: each click = 0.5° fore/aft (ELEACH) or 2° left/right (AZEACH); ignored in ATT HOLD',
  },

  // ---------- P65: automatic vertical descent ----------

  'p65.entry': {
    file: LLGE, label: 'P65START', start: 252, end: 258,
    title: 'P65START: PROG 65 when TTF > −12 s (TENDAPPR)',
  },
  'p65.vertguid': {
    file: LLGE, label: 'VERTGUID', start: 897, end: 913,
    title: 'P65VERT: ACG = (V2FG − VGU) / TAUVERT — descend at 3 ft/s, null the horizontal velocity',
  },

  // ---------- P66: rate of descent ----------

  'p66.entry': {
    file: LLGE, label: 'STARTP66', start: 143, end: 185,
    title: 'STARTP66: PROG 66, desired altitude rate = present altitude rate (VDGVERT = HDOTDISP)',
  },
  'p66.p66now': {
    file: LLGE, label: 'STABL?', start: 194, end: 216,
    title: 'STABL? / P66NOW?: attitude hold and a ROD switch click select P66',
  },
  'p66.rodtask': {
    file: LLGE, label: 'RODTASK', start: 934, end: 946,
    title: 'RODTASK / P66VERTA: RODCOMP every second (PRIO22, FINDVAC)',
  },
  'p66.rodcomp': {
    file: LLGE, label: 'RODCOMP', start: 948, end: 1000,
    title: 'RODCOMP: VDGVERT += RODCOUNT × RODSCAL1 (1 ft/s per click)',
  },
  'p66.law': {
    file: LLGE, label: 'ITRPNT1', start: 1001, end: 1048,
    title: 'RODCOMP: extrapolate ḣ and h, then thrust = ((VDGVERT − ḣ)/TAUROD + g)/cos θ',
  },
  'p66.descbits': {
    file: LLGE, label: 'DESCBITS', start: 1223, end: 1228,
    title: 'DESCBITS: the ROD switch — DESCENT+ slows the descent, DESCENT− speeds it',
  },
  'p66.vertdisp': {
    file: LLGE, label: 'VERTDISP', start: 889, end: 890,
    title: 'VERTDISP: V06N60 — horizontal velocity (magnitude), altitude rate, altitude',
    note: 'Noun 60 R1 is VHORIZ, the magnitude of the horizontal velocity, cross-range included (VHORCOMP, :1100-1110); the forward and lateral components (FORVEL, LATVEL) drive the cross-pointer meter, not the DSKY.',
  },

  // ---------- P68: landing confirmation ----------

  'p68.entry': {
    file: TLL, label: 'LANDJUNK', start: 286, end: 334,
    title: 'P68 LANDJUNK: SURFFLAG, aborts off, the landing site := where we are, flashing V06N43',
  },

  // ---------- throttle ----------

  'throttle.routine': {
    file: THR, label: 'THROTTLE', start: 37, end: 61,
    title: 'THROTTLE: present thrust FP from ΔV and mass, desired thrust FC from the guidance',
  },
  'throttle.regions': {
    file: THR, label: 'WHERETO', start: 67, end: 112,
    title: 'WHERETO: the fixed-throttle region and “throttle recovery” below LOWCRIT',
  },
  'throttle.out': {
    file: THR, label: 'DOPIF', start: 114, end: 132,
    title: 'DOPIF / DOIT: thrust pulses to the THRUST counter, channel 14 bit 4',
  },
  'throttle.flatout': {
    file: THR, label: 'FLATOUT', start: 191, end: 198,
    title: 'FLATOUT: 4096 pulses — more than the throttle can take: the hardware stop',
  },
};
