// Source anchors for the Command Module (Comanche 055) chapter — owner: the
// CM programs (js/agc/programs/cm/). Prefix `cm.`. Every range was checked
// against the listing in this repository (1-based lines; `label` begins
// line `start`).

const P40 = 'Comanche055/P40-P47.agc';
const SERV = 'Comanche055/SERVICER207.agc';
const INFO = 'Comanche055/ASSEMBLY_AND_OPERATION_INFORMATION.agc';
const FRESH = 'Comanche055/FRESH_START_AND_RESTART.agc';
const P6X = 'Comanche055/P61-P67.agc';
const RC = 'Comanche055/REENTRY_CONTROL.agc';

export const ANCHORS = {
  // ---------------- P40: set-up ----------------
  'cm.p40.header': {
    file: P40, start: 36, end: 64,
    title: 'P40CSM — the SPS thrusting program begins',
    note: 'F = FENG (20,500 lb); the original TIG is kept as NOMTIG; R02 IMU status check.',
  },
  'cm.p40.entry': {
    file: P40, label: 'P40CSM', start: 46, end: 64,
    title: 'P40CSM: external ΔV or aimpoint, nominal thrust, NOMTIG',
  },
  'cm.p40.pva': {
    file: P40, label: 'P40PVA', start: 66, end: 83,
    title: 'S40.1 velocity to be gained, preferred attitude, R60 maneuver',
  },
  'cm.p40.ttog': {
    file: P40, label: 'P40TTOG', start: 85, end: 99,
    title: 'Countdown display set up: V06N40, VGDISP, DVTOTAL, AVEGEXIT = STEERING',
  },
  'cm.p40.gimbal': {
    file: P40, label: 'P40GMB', start: 101, end: 123,
    title: 'V50N25 R1=00204 — gimbal drive test and trim (PRO) or trim only (ENTER)',
  },
  'cm.p40.countdown': {
    file: P40, label: 'P40S/RS', start: 127, end: 173,
    title: 'Start CLOKTASK, integrate to TIG−29.96 s, LONGCALL TIGBLNK (TIG slipped if late)',
  },
  'cm.p40.postburn': {
    file: P40, label: 'POSTBURN', start: 176, end: 181,
    title: 'POSTBURN: flashing V16N40 after cut-off',
  },
  'cm.p40.rcs': {
    file: P40, label: 'P40RCS', start: 182, end: 200,
    title: 'P40RCS / TIGNOW: residuals on flashing V16N85',
  },
  'cm.p40.tignow': {
    file: P40, label: 'TIGNOW', start: 192, end: 200,
    title: 'TIGNOW: V16N85 — velocity to be gained in body axes',
  },
  'cm.p40.post41': {
    file: P40, label: 'POST41', start: 202, end: 205,
    title: 'POST41: Average-G exits to SERVEXIT, GOTOPOOH',
  },
  'cm.p40.calcn85': {
    file: P40, label: 'CALCN85', start: 313, end: 319,
    title: 'CALCN85: update VG and VG (body) every 2 s after the burn',
  },
  'cm.p40.feng': {
    file: P40, label: 'FENG', start: 320, end: 337,
    title: 'Constants: SPS thrust 20,500 lb, SEC24.96, SEC29.96, V06N40/V16N40',
  },
  // ---------------- P40: countdown ----------------
  'cm.p40.tigblnk': {
    file: P40, label: 'TIGBLNK', start: 350, end: 366,
    title: 'TIG−35: blank the DSKY, TIGAVEG in five seconds',
  },
  'cm.p40.tigaveg': {
    file: P40, label: 'TIGAVEG', start: 456, end: 474,
    title: 'TIG−30: unblank, TIG−5 in 24.96 s, start Average-G (PREREAD)',
  },
  'cm.p40.tig5': {
    file: P40, label: 'TIG-5', start: 480, end: 497,
    title: 'TIG−5: "WILL CAUSE V99 FLASH", start S40.13',
  },
  'cm.p40.tig0': {
    file: P40, label: 'TIG-0', start: 503, end: 516,
    title: 'TIG−0: ignition only if the crew has answered V99 with PRO',
  },
  'cm.p40.ignition': {
    file: P40, label: 'IGNITION', start: 518, end: 548,
    title: 'IGNITION / SPSON: channel 11 bit 13 turns the SPS on',
  },
  'cm.p40.spson': {
    file: P40, label: 'SPSON', start: 526, end: 528,
    title: 'SPSON: CAF BIT13 / WOR DSALMOUT — "TURN ON SPS ENGINE"',
  },
  'cm.p40.dotvcon': {
    file: P40, start: 546, end: 583,
    title: '0.4 s for thrust build-up, then the TVC autopilot takes over',
  },
  'cm.p40.dostrull': {
    file: P40, label: 'DOSTRULL', start: 585, end: 606,
    title: 'TIG+2 s: steering on (STEERSW), ullage jets off (channel 5 zeroed)',
  },
  'cm.p40.implburn': {
    file: P40, label: 'IMPLBURN', start: 608, end: 644,
    title: 'IMPLBURN: short burns are timed — ENGINOFF in TGO',
  },
  'cm.p40.enginoff': {
    file: P40, label: 'ENGINOFF', start: 647, end: 680,
    title: 'ENGINOFF: SPS off, 2.5 s for tail-off, RCS autopilot, POSTBURN',
  },
  'cm.p40.spsoff': {
    file: P40, label: 'SPSOFF', start: 683, end: 695,
    title: 'SPSOFF: TEVENT, ENGONFLG off, channel 11 bit 13 off',
  },
  'cm.p40.tvczap': {
    file: P40, label: 'TVCZAP', start: 732, end: 742,
    title: 'TVCZAP: stop the countdown clock (TIMRFLAG off)',
  },
  'cm.p40.updatevg': {
    file: P40, label: 'UPDATEVG', start: 744, end: 777,
    title: 'UPDATEVG: external ΔV burns go straight to S40.8',
  },
  'cm.p40.steering': {
    file: P40, label: 'STEERING', start: 819, end: 864,
    title: 'STEERING: every 2 s; when TGO < 4 s, WAITLIST ENGINOFF',
  },
  'cm.p40.clock': {
    file: P40, label: 'CLOKTASK', start: 870, end: 907,
    title: 'CLOKTASK: every second, TTOGO = TIME2 − TIG',
  },
  'cm.p40.clockjob': {
    file: P40, label: 'CLOCKJOB', start: 926, end: 955,
    title: 'CLOCKJOB: NVWORD1 selects V06N40, nothing, V99 or V97',
  },
  'cm.p40.faildsp': {
    file: P40, label: 'FAILDSP', start: 939, end: 944,
    title: 'FAILDSP: flashing V97N40 — perform engine fail procedure',
  },
  'cm.p40.engreqst': {
    file: P40, label: 'ENGREQST', start: 946, end: 951,
    title: 'ENGREQST: flashing V99N40 — please enable engine',
  },
  'cm.p40.v99e': {
    file: P40, label: 'V99E', start: 968, end: 974,
    title: 'V99 ENTER: bypass the SPS (RCS burn, V16N85)',
  },
  'cm.p40.v99t': {
    file: P40, label: 'V99T', start: 977, end: 982,
    title: 'V99 V34: terminate',
  },
  'cm.p40.v99p': {
    file: P40, label: 'V99P', start: 984, end: 1004,
    title: 'V99 PRO: ASTNFLAG — ignite now if TIG has passed, else at TIG',
  },
  'cm.p40.v97t': {
    file: P40, label: 'V97T', start: 1007, end: 1040,
    title: 'V97 V34: shut down and terminate',
  },
  'cm.p40.v97p': {
    file: P40, label: 'V97P', start: 1043, end: 1072,
    title: 'V97 PRO: continue (one low-thrust check bypassed)',
  },
  'cm.p40.v97e': {
    file: P40, label: 'V97E', start: 1075, end: 1135,
    title: 'V97 ENTER: shut down, re-trim and recycle to V99 for a re-ignition',
  },
  'cm.p40.s401': {
    file: P40, label: 'S40.1', start: 1203, end: 1260,
    title: 'S40.1: rotate the impulsive ΔV by half the burn arc (THETAT/2)',
  },
  'cm.p40.s408': {
    file: P40, label: 'S40.8', start: 1646, end: 1722,
    title: 'S40.8: VG = VGPREV − ΔV measured; TGO; TIG = PIPTIME + TGO',
  },
  'cm.p40.tgocalc': {
    file: P40, label: 'TGOCALC', start: 1687, end: 1722,
    title: 'TGOCALC: time to go from VG, exhaust velocity and tail-off',
  },
  'cm.p40.s4081': {
    file: P40, label: 'S40.81', start: 1759, end: 1770,
    title: 'S40.81: TGO < 4 s — attitude hold, set up the engine-off call',
  },
  'cm.p40.incrsvg': {
    file: P40, label: 'INCRSVG', start: 1771, end: 1776,
    title: 'INCRSVG: alarm 01407, VG increasing',
  },
  'cm.p40.lothrust': {
    file: P40, label: 'LOTHRUST', start: 1778, end: 1797,
    title: 'LOTHRUST: thrust failure detected — set up the V97 flash',
  },
  'cm.p40.s4013': {
    file: P40, label: 'S40.13', start: 1949, end: 2013,
    title: 'S40.13 TIMEBURN: steer, or a short timed burn?',
  },
  'cm.p40.ullage': {
    file: P40, label: 'S40.135', start: 2032, end: 2035,
    title: 'S40.135: impulse of 7.96 s of 2-jet RCS ullage',
  },
  'cm.p40.s406': {
    file: P40, label: 'S40.6', start: 2102, end: 2179,
    title: 'S40.6: SPS gimbal drive test and gimbal trim',
  },
  // ---------------- R60, SERVICER, P00, integration ----------------
  'cm.r60.toball': {
    file: 'Comanche055/R60_62.agc', label: 'R60CSM', start: 42, end: 99,
    title: 'R60CSM: V50N18 "please perform auto maneuver"',
  },
  'cm.servicer.preread': {
    file: SERV, label: 'PREREAD', start: 228, end: 280,
    title: 'PREREAD: Average-G starts, DVTOTAL cleared, READACCS in 2 s',
  },
  'cm.servicer.readaccs': {
    file: SERV, label: 'READACCS', start: 285, end: 380,
    title: 'READACCS: read the PIPAs every 2 s, start the SERVICER job',
  },
  'cm.servicer.servicer': {
    file: SERV, label: 'SERVICER', start: 447, end: 508,
    title: 'SERVICER: PIPA checks, DVTOTAL += |ΔV|, Average-G, exit via AVGEXIT',
  },
  'cm.integration.midtoav1': {
    file: 'Comanche055/INTEGRATION_INITIALIZATION.agc', label: 'MIDTOAV1', start: 990, end: 1003,
    title: 'MIDTOAV1: integrate to TDEC1 — is there still time?',
  },
  'cm.integration.notime': {
    file: 'Comanche055/INTEGRATION_INITIALIZATION.agc', label: 'NOTIME', start: 1081, end: 1094,
    title: 'NOTIME: alarm 1703, "TIG WILL BE SLIPPED"',
  },
  'cm.p00.gotopooh': {
    file: FRESH, label: 'GOTOPOOH', start: 713, end: 733,
    title: 'GOTOPOOH: flash V37 until the crew selects a new program',
  },
  'cm.p00.pooh': {
    file: FRESH, label: 'POOH', start: 953, end: 998,
    title: 'POOH: P00, the CMC idling program',
  },
  'cm.exec.coresets': {
    file: 'Comanche055/EXECUTIVE.agc', label: 'NOVAC2', start: 154, end: 162,
    title: 'Comanche: NO.CORES DEC 6 — seven core sets',
  },
  // ---------------- entry: P61–P67 ----------------
  'cm.p61': {
    file: P6X, start: 36, end: 92,
    title: 'P61: calculate and display EMS initialization data (flashing V06N61)',
  },
  'cm.p61.n60': {
    file: P6X, label: 'P61.1', start: 122, end: 150,
    title: 'P61: flashing V06N60 (GMAX, VPRED, GAMMAEI) and V06N63 (RTGO, VIO, TTE)',
  },
  'cm.p62': {
    file: P6X, start: 155, end: 213,
    title: 'P62: CM/SM separation request (V50N25 00041), entry DAP on',
  },
  'cm.p62.n61': {
    file: P6X, label: 'P62.1', start: 215, end: 275,
    title: 'P62: V06N61, roll per HEADSUP, maneuver to entry attitude, WAKEP62 → P63',
  },
  'cm.p63': {
    file: P6X, start: 284, end: 329,
    title: 'P63: initialize entry, hold attitude, sense 0.05 g (V06N64)',
  },
  'cm.p64': {
    file: P6X, start: 341, end: 372,
    title: 'P64: entry guidance from 0.05 g; P65 or P67 next (V06N74)',
  },
  'cm.p65': {
    file: P6X, start: 375, end: 420,
    title: 'P65: up control — flashing V16N69 (roll, drag level, exit velocity)',
  },
  'cm.p66': {
    file: P6X, start: 423, end: 443,
    title: 'P66: ballistic phase — hold trim until drag builds up again',
  },
  'cm.p67': {
    file: P6X, start: 445, end: 471,
    title: 'P67: final phase until 1,000 ft/s (V06N66)',
  },
  'cm.p67.1': {
    file: P6X, label: 'P67.1', start: 477, end: 497,
    title: 'P67.1: flashing V16N67 — range to go, latitude, longitude; then GOTOPOOH',
  },
  'cm.entry.sequence': {
    file: RC, start: 166, end: 199,
    title: 'Entry phases: INITROLL → HUNTEST → UPCONTRL → KEP2 → PREDICT3 → P67.1',
  },
  'cm.entry.05g': {
    file: RC, start: 300, end: 323,
    title: 'TARGETNG: is drag above 0.05 g? (.05GSW)',
  },
  'cm.entry.initroll': {
    file: RC, label: 'INITROLL', start: 395, end: 433,
    title: 'INITROLL: P64; below 27,000 ft/s go straight to the final phase',
  },
  'cm.entry.huntest': {
    file: RC, label: 'HUNTEST', start: 493, end: 539,
    title: 'HUNTEST: look for an up-control solution',
  },
  'cm.entry.upcontrl': {
    file: RC, label: 'UPCONTRL', start: 873, end: 899,
    title: 'UPCONTRL: drag below Q7 → Kepler (P66); falling below VL + 500 ft/s → final phase (P67)',
  },
  'cm.entry.kep2': {
    file: RC, label: 'KEP', start: 1089, end: 1128,
    title: 'KEP / KEP2: ballistic phase until drag exceeds Q7F + KDMIN',
  },
  'cm.entry.predict3': {
    file: RC, label: 'PREDICT3', start: 1130, end: 1139,
    title: 'PREDICT3: final phase — stop steering below VQUIT (1,000 ft/s)',
  },
  'cm.entry.steeroff': {
    file: RC, label: 'STEEROFF', start: 1328, end: 1349,
    title: 'STEEROFF: start P67.1, the final display',
  },
  'cm.entry.overnout': {
    file: RC, label: 'OVERNOUT', start: 1310, end: 1324,
    title: 'OVERNOUT: "ALL ENTRY DISPLAYS ARE DONE HERE"',
  },
  'cm.entry.constants': {
    file: RC, label: 'Q7FKDMIN', start: 1503, end: 1588,
    title: 'Entry constants: Q7F, VQUIT, .05G, VFINAL1 …',
  },
  // ---------------- operating information ----------------
  'cm.info.verbs': {
    file: INFO, start: 245, end: 247,
    title: 'Verbs 97 "PERFORM ENGINE FAIL PROCEDURE" and 99 "PLEASE ENABLE ENGINE"',
  },
  'cm.info.noun40': {
    file: INFO, start: 339, end: 341,
    title: 'Noun 40: time from ignition/cutoff, VG, ΔV accumulated',
  },
  'cm.info.noun85': {
    file: INFO, start: 445, end: 445,
    title: 'Noun 85: VG (body)',
  },
  'cm.info.checklist204': {
    file: INFO, start: 974, end: 978,
    title: 'Checklist codes 00041 SWITCH CM/SM SEPARATION TO UP … 00204 PERFORM SPS GIMBAL TRIM',
  },
  'cm.info.alarms': {
    file: INFO, start: 941, end: 952,
    title: 'Alarms 01407 VG increasing … 01703 TIG slipped',
  },
  'cm.nountab.40': {
    file: 'Comanche055/PINBALL_NOUN_TABLES.agc', label: 'IDADDTAB', start: 608, end: 610,
    title: 'Noun 40 registers: TTOGO, VGDISP, DVTOTAL',
  },
};
