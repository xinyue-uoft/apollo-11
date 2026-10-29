// P61–P67 — the Command Module's entry programs (Comanche 055,
// Comanche055/P61-P67.agc and REENTRY_CONTROL.agc), modelled at a
// "milestones" level: the displays, the crew responses and the switching
// criteria of the listing are real; the entry itself is the scripted
// profile of the 'cmSps' vehicle in entry mode (js/vehicle/cm-sps.js,
// ENTRY) — there is no entry guidance or aerodynamics here.
//
//   P61  EMS initialization data: V06N61, V06N60, V06N63 (flashing)
//   P62  CM/SM separation (V50N25 R1=00041), V06N61, entry attitude (V06N22)
//   P63  entry initialization, hold attitude, sense 0.05 g (V06N64)
//   P64  post-0.05 g: constant drag / HUNTEST (V06N74); → P65 (or P67)
//   P65  up control (flashing V16N69); → P66 if drag < Q7, → P67 if
//        falling and V < VL + 500 ft/s
//   P66  ballistic (Kepler) phase (V06N22); → P67 when drag > Q7F + KDMIN
//   P67  final phase (V06N66); steering stops below 1,000 ft/s → flashing
//        V16N67 → GOTOPOOH
//
// Program names are the Colossus GSOP names (research/src-comanche.md §5).
//
// Every entry program runs its checks on the 2-second SERVICER/entry
// guidance cycle ("EACH 2 SEC", P61-P67.agc:269-275; REENTRY_CONTROL.agc
// runs from Average-G). Values read from the scripted profile stand in for
// the AGC's navigated state and PIPA-measured drag (simplification).

import { parseGET } from '../../../util/time.js';
import {
  TaskList, ResponseRouter, showDisplay, setPhase, setErasable, setVector, vehicleState,
} from './cm-common.js';

// ---------- constants from REENTRY_CONTROL.agc ----------
// Drag is scaled at 25 g = 805 ft/s² in the listing (".05G 2DEC .002 # .05/25").
export const ENTRY_CONSTANTS = Object.freeze({
  G05: 0.05,                 // g — .05G, REENTRY_CONTROL.agc:1550
  Q7F_FPSS: 6,               // ft/s² — Q7F "6/805", :1513
  Q7F_KDMIN_FPSS: 6.5,       // ft/s² — "(Q7F +KDMIN) = 6 + .5", :1503 (≈ 0.2 g)
  VFINAL1: 27000,            // ft/s — "= 27000 / 2 VS", :1588 (P64: final phase if slower)
  VQUIT: 1000,               // ft/s — "1000 /2VS", :1530 (P67: steering stops)
  C18: 500,                  // ft/s — "500/2VS", :1501 (P65 → P67 margin over VL)
  VRCONT: 700,               // ft/s — HUNTEST starts when RDOT + 700 ≥ 0, :478-491,1566
  NSEC: 21,                  // s — "NSEC DEC 2100 # 65 DEG/ 3 DEG/SEC",
                             //     CM_ENTRY_DIGITAL_AUTOPILOT.agc:612-615,701
  G_FPSS: 32.174,            // ft/s² per g (the listing's 805 ft/s² = 25 g → 32.2)
});

// ---------- Apollo 11 Entry PAD ----------
// Read up by CAPCOM Ron Evans at 191:43:57 GET, read back by Armstrong at
// 191:48:46, four items updated at 194:16:57 (Apollo Flight Journal, Day 9
// part 1, https://apollojournals.org/afj/ap11fj/26day9-approach-earth.html).
// "...latitude, plus 13.32, minus 169.17; 06.4; 36194, 6.49; range to go,
// 1404.5, 36275; 195:03:06, 00:28, DL max, 1.54, 0.84, 22400, 18000; D0
// 4.00, 02:13; 00:17, 03:51, 09:02; ... lift vector, Up. ... You'll get
// P65, but no P66." Update: "Max-g, 06.3; ... Gamma at 400k, 6.48; ...
// range to go on the EMS, 1403.3; ... Retro time for V-circular, 02:14."
export const ENTRY_PAD = Object.freeze({
  trimAttitude: [0, 152, 1],      // IMU gimbal angles at 0.05 g (roll, pitch, yaw)
  lat: 13.32,                     // N61 splash latitude (deg N)
  long: -169.17,                  // N61 splash longitude (deg E; 169.17 W)
  maxG: 6.3,                      // updated from 6.4
  v400k: 36194,                   // ft/s
  gamma400k: -6.48,               // deg (the PAD reads the magnitude; entry angle is below the horizontal)
  rtgo: 1403.3,                   // n mi EMS range to go (updated from 1404.5)
  vio: 36275,                     // ft/s at 0.05 g
  rrt: '195:03:06',               // entry interface
  ret05g: 28,                     // s from EI
  dl: [1.54, 0.84],               // g, N69 drag level max/min
  vl: [22400, 18000],             // ft/s, N69 exit velocity max/min
  d0: 4.0,                        // g, constant-drag level
  retVcirc: 134,                  // s (2:14 updated from 2:13)
  retDrogue: 542,                 // s (9:02)
  liftUp: true,                   // "lift vector, Up"
  src: 'AFJ Apollo 11 Day 9 part 1, 191:43:57 / 191:48:46 / 194:16:57 GET',
});

// N69 values P65 displays (ROLLC, DL = Q7, VL): HUNTEST computes them; the
// simulator uses the middle of the PAD's ranges (illustrative).
const P65_Q7_G = (ENTRY_PAD.dl[0] + ENTRY_PAD.dl[1]) / 2;  // 1.19 g
const P65_VL = (ENTRY_PAD.vl[0] + ENTRY_PAD.vl[1]) / 2;    // 20,200 ft/s
// P64 → P65: HUNTEST's range prediction is not modelled; switch at the
// scripted up-control time (vehicle ENTRY.dtUpControl, illustrative).
const DEFAULT_UPCONTROL_DT = 150;

// Load the Entry PAD values P61 displays (P61 computes N60/N63 from the state
// vector and the pad-loaded EMSALT; the simulator shows the PAD's numbers).
export function loadEntryPad(agc, pad = ENTRY_PAD) {
  setErasable(agc, 'LAT(SPL)', pad.lat);
  setErasable(agc, 'LNG(SPL)', pad.long);
  // P61: "CS ONE / TS HEADSUP # PRELOAD" (−1 = lift up), P61-P67.agc:74-75.
  setErasable(agc, 'HEADSUP', pad.liftUp ? -1 : 1);
  // GMAX is kept as 100·g and shown WHOLE ("GMAX 100 GMAX (-14) G,S",
  // P61-P67.agc:50): 6.3 g → +00630.
  setErasable(agc, 'GMAX', Math.round(pad.maxG * 100));
  setErasable(agc, 'VPRED', pad.v400k);
  setErasable(agc, 'GAMMAEI', pad.gamma400k);
  setErasable(agc, 'RTGO', pad.rtgo);
  setErasable(agc, 'VIO', pad.vio);
  setVector(agc, 'THETAD', pad.trimAttitude);
  setErasable(agc, 'ENTRYEI', parseGET(pad.rrt));
}

// ---------- shared base ----------

class EntryProgram {
  constructor(agc) {
    this.agc = agc;
    this.tasks = new TaskList();
    this.router = new ResponseRouter();
    this.display = null;
    this.entryDsp = false;     // ENTRYDSP flag: entry display via OVERNOUT each pass
    this.entryVN = null;       // [verb, noun]
    this.stage = 'idle';
    this.burn = { snapshot: () => null };
  }

  get t() {
    return this.agc.t ?? vehicleState(this.agc)?.t ?? 0;
  }

  enter() {
    setPhase(this.agc, 'cmEntry');
    if (!Number.isFinite(this.agc.erasable?.ENTRYEI)) loadEntryPad(this.agc);
    // Entry guidance / display passes every 2 s.
    this.tasks.at(this.t + 2, 'PASS', () => this.passTask());
    this.begin();
  }

  begin() {}

  exit() {
    this.tasks.clear();
    this.router.clear();
    this.redisplay = null;
  }

  step(t) {
    this.tasks.run(t);
  }

  vehicleCommands() {
    return { throttle: 0, thrustDir: null, engineOn: false, ullage: false, rod: 0, lpd: null };
  }

  get commands() {
    return this.vehicleCommands();
  }

  onProceed() { return this.router.answer('proceed', this.agc.t); }
  onTerminate() { return this.router.answer('terminate', this.agc.t); }
  onEnter() { return this.router.answer('enter', this.agc.t); }
  onRecycle() { return this.router.answer('enter', this.agc.t); }

  reenter() {
    if (this.redisplay) this.redisplay();
  }

  er(name, value) {
    setErasable(this.agc, name, value);
  }

  entryData() {
    return vehicleState(this.agc)?.entry || null;
  }

  passTask() {
    this.tasks.at(this.t + 2, 'PASS', () => this.passTask());
    const e = this.entryData();
    if (e) this.updateErasables(e);
    if (e) this.pass(e);
    if (this.entryDsp && this.entryVN && this.agc.program === this) {
      // OVERNOUT: "DISPLAY VIA OVERNOUT" each pass (REENTRY_CONTROL.agc:1310-1321).
      showDisplay(this, { verb: this.entryVN[0], noun: this.entryVN[1], source: 'cm.entry.overnout' });
    }
  }

  pass() {}

  // Display quantities the entry nouns read (display units).
  updateErasables(e) {
    this.er('D', e.g);                     // N64/N74 drag acceleration, g
    this.er('VMAGI', e.v);                 // N62/N64/N68/N74 inertial velocity, ft/s
    this.er('RDOT', e.rdot);               // N68 altitude rate, ft/s
    this.er('RTGON64', e.rtgo);            // N64 range to splash, n mi
    this.er('RTGON67', e.rtgo);            // N67 range to target, n mi
    this.er('ROLLC', e.rollc);             // N66/N68/N69/N74 commanded bank, deg (illustrative)
    this.er('LAT', e.lat);                 // N67 present latitude, deg
    this.er('LONG', e.lon);                // N67 present longitude, deg
    this.er('TTE', this.t - (this.agc.erasable.ENTRYEI + ENTRY_PAD.ret05g)); // N63 time from EMS alt.
    // N66 cross-range / down-range errors need the entry range predictor,
    // which is not modelled: blank registers rather than invented numbers.
    this.er('XRNGERR', null);
    this.er('DNRNGERR', null);
  }

  // NEWMODEX: the next entry program (major mode change without V37).
  next(n) {
    if (typeof this.agc.startProgram === 'function') this.agc.startProgram(n);
  }

  // GOTOPOOH → flashing V37 until the crew selects a program.
  goToPooh() {
    this.stage = 'pooh';
    this.entryDsp = false;
    this.redisplay = () => showDisplay(this, {
      verb: 37, noun: 99, flash: true, id: 'GOP00FIX', source: 'cm.p00.gotopooh',
      handlers: { terminate: () => this.redisplay(), proceed: () => this.redisplay(), enter: () => this.redisplay() },
    });
    this.redisplay();
  }

  flash(verb, noun, id, handlers, source) {
    this.redisplay = () => showDisplay(this, { verb, noun, flash: true, id, handlers, source });
    this.redisplay();
  }
}

// ---------- P61 ----------
// "TO CALCULATE AND DISPLAY EMS INITIALIZATION DATA" — flashing V06N61
// (splash point, HEADSUP), V06N60 (GMAX, VPRED, GAMMAEI), V06N63 (RTGO, VIO,
// TTE), then into P62. V34 → GOTOPOOH, ENTER → redisplay.
// Comanche055/P61-P67.agc:36-150
export class P61 extends EntryProgram {
  static number = 61;
  static name = 'ENTRY – PREPARATION';
  static anchor = 'cm.p61';

  begin() {
    this.stage = 'n61';
    this.flash(6, 61, 'P61-N61', {
      terminate: () => this.goToPooh(),
      proceed: () => this.n60(),
      enter: () => this.redisplay(),
    }, 'cm.p61');
  }

  n60() {
    this.stage = 'n60';
    this.flash(6, 60, 'P61-N60', {
      terminate: () => this.goToPooh(),
      proceed: () => this.n63(),
      enter: () => this.redisplay(),
    }, 'cm.p61.n60');
  }

  n63() {
    this.stage = 'n63';
    this.er('TTE', this.t - (this.agc.erasable.ENTRYEI + ENTRY_PAD.ret05g));
    this.flash(6, 63, 'P61-N63', {
      terminate: () => this.goToPooh(),
      proceed: () => this.next(62),           // "THEN FALL INTO P62"
      enter: () => this.n63(),                // P61.2 REDO
    }, 'cm.p61.n60');
  }
}

// ---------- P62 ----------
// "TO NOTIFY CREW WHEN GNC SYSTEM IS PREPARED FOR CM/SM SEPARATION" and "TO
// ORIENT THE CM TO THE CORRECT ATTITUDE FOR ATMOSPHERIC ENTRY": V50N25
// R1=00041 (checklist "SWITCH CM/SM SEPARATION TO UP"); PRO → entry DAP
// (CM/DAPON) → flashing V06N61; PRO → roll per HEADSUP, entry display
// V06N22 while the CM turns to the entry attitude; P63 when the maneuver
// has brought alpha within ±45° (WAKEP62). Comanche055/P61-P67.agc:155-279;
// ASSEMBLY_AND_OPERATION_INFORMATION.agc:974
export class P62 extends EntryProgram {
  static number = 62;
  static name = 'ENTRY – CM/SM SEPARATION AND PRE-ENTRY MANEUVER';
  static anchor = 'cm.p62';

  begin() {
    this.stage = 'sep';
    this.er('DSPTEM1', 0o41);                 // "CAF OCT41 # REQUEST SEPARATION"
    this.flash(50, 25, 'P62-SEP', {
      terminate: () => this.goToPooh(),
      proceed: () => this.n61(),              // +3: POSTJUMP CM/DAPON
      enter: () => this.redisplay(),          // TC -5
    }, 'cm.p62');
  }

  n61() {
    this.stage = 'n61';
    // CM/DAPON: entry DAP on and "SET NODOFLAG TO PREVENT FURTHER V 37
    // ENTRIES" (V37 to anything but P00 → alarm 1520, FRESH_START_AND_RESTART.agc:863-872).
    // CM_ENTRY_DIGITAL_AUTOPILOT.agc:167-229
    if (this.agc.flags) this.agc.flags.NODOFLAG = true;
    this.flash(6, 61, 'P62-N61', {
      terminate: () => this.redisplay(),      // TC -3
      proceed: () => this.maneuver(),         // TC +2
      enter: () => this.redisplay(),          // TC -5
    }, 'cm.p62.n61');
  }

  maneuver() {
    this.stage = 'maneuver';
    // ROLLC = 0 (lift up) for HEADSUP −1; ALFACOM = ALFAPAD; ENTRYVN = V06N22.
    this.er('ROLLC', this.agc.erasable.HEADSUP > 0 ? 180 : 0);
    this.entryVN = [6, 22];
    this.entryDsp = true;
    this.redisplay = () => showDisplay(this, { verb: 6, noun: 22, source: 'cm.p62.n61' });
    this.redisplay();
    // WAKEP62: the exo-atmospheric DAP schedules it NSEC = 21 s after the
    // angle of attack passes 45° ("65 DEG/ 3 DEG/SEC"; P61-P67.agc:256-262).
    // The time to reach 45° is illustrative here: 9 s.
    this.tasks.at(this.t + 9 + ENTRY_CONSTANTS.NSEC, 'WAKEP62', () => this.next(63));
  }
}

// ---------- P63 ----------
// "TO INITIALIZE THE ENTRY EQUATIONS", hold the entry attitude, "TO SENSE
// .05G". Entry display V06N64 (G, VI, range to splash). → P64 at 0.05 g.
// Comanche055/P61-P67.agc:280-329; REENTRY_CONTROL.agc:48,299-322
export class P63 extends EntryProgram {
  static number = 63;
  static name = 'ENTRY – INITIALIZATION';
  static anchor = 'cm.p63';

  begin() {
    this.stage = 'wait05g';
    this.entryVN = [6, 64];
    this.entryDsp = true;
    // CLEANDSP: flush the N22 display; the entry display returns on the next pass.
    this.agc.pinball?.blankFor?.(2);
    this.redisplay = () => showDisplay(this, { verb: 6, noun: 64, source: 'cm.p63' });
  }

  pass(e) {
    if (e.g > ENTRY_CONSTANTS.G05) this.next(64);   // .05GSW set: INITROLL → P64
  }
}

// ---------- P64 ----------
// "TO START ENTRY GUIDANCE AT .05G"; "SELECT FINAL PHASE P67 IF V < 27000
// FPS WHEN .2G OCCURS"; "ITERATE FOR UP-CONTROL SOLUTION P65 IF V > 27000
// FPS"; "ENTER P65 WHEN ... RANGE AS PREDICTED [IS] WITHIN 25 NM OF DESIRED
// RANGE". Entry display V06N74 (ROLLC, VI, D).
// Comanche055/P61-P67.agc:342-372; REENTRY_CONTROL.agc:395-433,493-866,1098-1121
export class P64 extends EntryProgram {
  static number = 64;
  static name = 'ENTRY – POST 0.05 G';
  static anchor = 'cm.p64';

  begin() {
    this.stage = 'initroll';
    this.entryVN = [6, 74];
    this.entryDsp = true;
    this.redisplay = () => showDisplay(this, { verb: 6, noun: 74, source: 'cm.p64' });
    this.redisplay();
    this.mode = null;
  }

  pass(e) {
    const C = ENTRY_CONSTANTS;
    if (this.mode === null) {
      // INITROLL: V − VFINAL1 negative → KEP2 (idle until 0.2 g, then P67);
      // otherwise the constant-drag controller and HUNTEST.
      this.mode = e.v < C.VFINAL1 ? 'KEP2' : 'CONSTD';
      this.stage = this.mode === 'KEP2' ? 'kep2' : 'constant-drag';
      this.hunting = false;
    }
    if (this.mode === 'KEP2') {
      if (e.g * C.G_FPSS > C.Q7F_KDMIN_FPSS) this.next(67);
      return;
    }
    // INITRL1: HUNTEST starts once RDOT + VRCONT (700 ft/s) ≥ 0; it goes to
    // P65 (GOTOUPSY) when the predicted range is within 25 n mi of the
    // target. The range prediction is not modelled: P65 comes at the
    // scripted up-control time (illustrative).
    if (!this.hunting && e.rdot + C.VRCONT >= 0) {
      this.hunting = true;
      this.stage = 'huntest';
    }
    if (this.hunting && e.dtEI >= DEFAULT_UPCONTROL_DT) this.next(65);
  }
}

// ---------- P65 ----------
// "TO CONTINUE ENTRY GUIDANCE, USING THE UP-CONTROL PHASE TO STEER TO A
// CONTROLLED EXIT CONDITION. THIS PHASE TERMINATES A) IF D < Q7 FPSS, GOTO
// TO P66. B) IF RDOT NEG, AND IF V < VL +500 FPS, GO TO P67." Flashing
// V16N69 (ROLLC, DL, VL); PRO → the entry display continues.
// Comanche055/P61-P67.agc:374-420; REENTRY_CONTROL.agc:873-900
export class P65 extends EntryProgram {
  static number = 65;
  static name = 'ENTRY – UP CONTROL';
  static anchor = 'cm.p65';

  begin() {
    this.stage = 'upcontrol';
    this.entryVN = [6, 74];
    this.entryDsp = false;                    // DOWNFLAG ENTRYDSP during the flash
    this.er('Q7', P65_Q7_G);
    this.er('VL', P65_VL);
    this.flash(16, 69, 'P65-N69', {
      terminate: () => this.redisplay(),      // TC -3 ("NODOFLAG IS SET")
      proceed: () => { this.entryDsp = true; this.redisplay = null; },   // UPFLAG ENTRYDSP
      enter: () => this.redisplay(),          // TC -5
    }, 'cm.p65');
  }

  pass(e) {
    const C = ENTRY_CONSTANTS;
    const q7 = (this.agc.erasable.Q7 ?? P65_Q7_G) * C.G_FPSS;
    const vl = this.agc.erasable.VL ?? P65_VL;
    if (e.g * C.G_FPSS < q7) { this.next(66); return; }          // → KEP (P66)
    if (e.rdot < 0 && e.v < vl + C.C18) this.next(67);            // VLTEST → PREDICT3
  }
}

// ---------- P66 ----------
// "KEEP CM ATTITUDE IN TRIM TO THE RELATIVE VELOCITY VECTOR. ENTRY GUIDANCE
// STOPS GENERATING ROLL COMMANDS UNTIL DRAG BUILDS UP TO Q7+0.5 FPSS."
// Entry display V06N22. Not entered on Apollo 11 ("You'll get P65, but no
// P66" — Entry PAD). Comanche055/P61-P67.agc:422-443; REENTRY_CONTROL.agc:1089-1121
export class P66 extends EntryProgram {
  static number = 66;
  static name = 'ENTRY – BALLISTIC';
  static anchor = 'cm.p66';

  begin() {
    this.stage = 'kepler';
    this.entryVN = [6, 22];
    this.entryDsp = true;
    this.redisplay = () => showDisplay(this, { verb: 6, noun: 22, source: 'cm.p66' });
    this.redisplay();
  }

  pass(e) {
    const C = ENTRY_CONSTANTS;
    if (e.g * C.G_FPSS > C.Q7F_KDMIN_FPSS) this.next(67);      // KEP2 → PREFINAL
  }
}

// ---------- P67 ----------
// "TO TERMINATE STEERING WHEN THE CM VELOCITY WRT EARTH = 1000 FT/SEC":
// entry display V06N66 (ROLLC, cross-range and down-range error); below
// VQUIT, STEEROFF starts P67.1: flashing V16N67 (range to go, latitude,
// longitude); any response ends entry → GOTOPOOH.
// Comanche055/P61-P67.agc:445-512; REENTRY_CONTROL.agc:1130-1349
export class P67 extends EntryProgram {
  static number = 67;
  static name = 'ENTRY – FINAL PHASE';
  static anchor = 'cm.p67';

  begin() {
    this.stage = 'final';
    this.entryVN = [6, 66];
    this.entryDsp = true;
    this.redisplay = () => showDisplay(this, { verb: 6, noun: 66, source: 'cm.p67' });
    this.redisplay();
  }

  pass(e) {
    if (this.stage !== 'final') return;
    if (e.v < ENTRY_CONSTANTS.VQUIT) this.steerOff();
  }

  steerOff() {
    this.stage = 'p67.1';
    this.entryDsp = false;
    const done = () => this.goToPooh();      // "TURN OFF ENTRY DAP" … GOTOPOOH
    this.flash(16, 67, 'P67.1', {
      terminate: done,
      proceed: done,
      enter: () => this.redisplay(),          // REDO
    }, 'cm.p67.1');
  }
}
