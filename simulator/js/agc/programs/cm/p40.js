// P40 — SPS THRUSTING (Comanche 055, "P40CSM"). A behavioural model of the
// Command Module's main-engine burn program, following the listing step by
// step: P40CSM → S40.1 (velocity to be gained) → R60CSM attitude maneuver →
// V50N25 R1=00204 gimbal-trim option → CLOKTASK countdown on V06N40 →
// TIGBLNK (TIG−35, DSKY blank) → TIGAVEG (TIG−30, Average-G) → TIG-5
// (V99N40 "please enable engine") → TIG-0 / IGNITION (SPSON) → TVC →
// STEERING every 2 s (S40.8) → S40.81 / ENGINOFF → POSTBURN V16N40 →
// TIGNOW V16N85 (residuals) → POST41 → GOTOPOOH.
//
// Unlike the LM's table-driven BURNBABY, Comanche's P40 runs its own
// countdown (research/src-ignition.md §15). Differences worth knowing:
// - TIG−35/TIG−30 come from TDEC1 = TIG − 29.96 s, so the blank starts at
//   TIG−34.96 and Average-G at TIG−29.96 (Comanche055/P40-P47.agc:138-157,350-361,456-474).
// - The countdown clock is not aligned to TIG: CLOKTASK starts 1 cs after the
//   gimbal-trim delay and repeats every second (:127-130,870-907).
// - There is no automatic ullage: the crew fly +X translation with the
//   hand controller when the PAD calls for it (S40.13 only checks CHAN31
//   bit 7; Apollo 11's LOI-1 PAD said "No ullage"). The computer turns the
//   RCS jets off 2 s after ignition (DOSTRULL/ULAGEOFF, :582-606).
// - Ignition waits for PRO on V99N40; a PRO after TIG lights the engine
//   immediately (V99P/ENDV99PI, :984-1004).
// - For an external-ΔV burn the velocity to be gained is fixed in inertial
//   space and only reduced by the measured ΔV each 2 s (UPDATEVG → S40.8 with
//   XDELVFLG, :744-777,1646-1660), so the burn is flown at a constant
//   inertial attitude. TIG is overwritten with the predicted cut-off time
//   (TGOCALC "STODL TIG", :1714-1716), which is why N40 R1 counts *up* from
//   ignition until steering starts and then counts *down* to cut-off.
//
// Simulator simplifications (labelled in comments below): no IMU/CDU model
// (the thrust axis is read from the vehicle), cross-product steering is
// replaced by "point the thrust along VG", S40.8's TGO series is replaced by
// the closed rocket-equation form, the Executive's job latency is zero, the
// navigated state equals the truth, and pad-loaded constants whose flight
// values are not in this repository are estimates (PAD_LOADS).

import { FT, LB, LBF, NMI, toFps } from '../../../util/units.js';
import { parseGET } from '../../../util/time.js';
import {
  FENG_N, SPS_VEX, SPS_MDOT_NOMINAL, SEC29_96, SEC24_96, SEC5, TIMEDELT,
  IMPULSIVE_LIMIT, FOURSEC, ULLAGE_IMPULSE_2JET, CM_PIPA_PULSE, SERVICER_PERIOD,
  vsub, vscale, vdot, vnorm, vunit, vcross, coast, lvlhToInertial, apsides, s40_1,
} from './csm-math.js';
import {
  TaskList, ResponseRouter, showDisplay, setPhase, setFlag, setErasable,
  vehicleState, protect, unprotect, emitBus,
} from './cm-common.js';

// ---------- Apollo 11 LOI-1 maneuver PAD ----------
// Read up by CAPCOM Bruce McCandless at 072:51:24 GET and read back by
// Armstrong at 072:53:54 (Apollo Flight Journal, Apollo 11 Day 4 part 1,
// https://apollojournals.org/afj/ap11fj/11day4-approach.html):
// "LOI-1, SPS/G&N: 62710, plus 0.98, minus 0.19, GET ignition 075:49:49.65;
//  minus 2889.7, minus 0394.4, minus 0068.6; roll 358, pitch 226, 347;
//  0169.2, plus 00610; 2917.3, 6:02, 2910.8; ... No ullage. ... The values
//  which you would see on Noun 42 prior to LOI burn are HA, plus 431.3;
//  HP, minus 128.2."
export const LOI1_PAD = Object.freeze({
  purpose: 'LOI-1',
  system: 'SPS/G&N',
  weight: 62710,                   // lb, N47 R1 (CSM weight)
  pitchTrim: 0.98,                 // deg, N48
  yawTrim: -0.19,                  // deg, N48
  tig: '075:49:49.65',             // N33
  dvLv: [-2889.7, -394.4, -68.6],  // ft/s, N81 (local vertical frame)
  attitude: [358, 226, 347],       // deg, IMU gimbal angles roll/pitch/yaw
  ha: 169.2,                       // n mi, N44 apocynthion after the burn
  hp: 61.0,                        // n mi, N44 pericynthion after the burn
  dvt: 2917.3,                     // ft/s, total
  burnTime: 362,                   // s ("6:02")
  dvc: 2910.8,                     // ft/s, EMS counter setting
  ullage: null,                    // "No ullage"
  n42: { ha: 431.3, hp: -128.2 },  // n mi, N42 before the burn (P30 conic)
  src: 'AFJ Apollo 11 Day 4 part 1, 072:51:24 / 072:53:54 GET',
});

// LM weight for the docked burn (N47 R2): the Mission Report's LOI-ignition
// total of 96,061.6 lb (Table A-I) minus the PAD CSM weight. Derived.
export const LOI1_LM_WEIGHT = 96061.6 - LOI1_PAD.weight;

// Pad-loaded erasables P40 needs whose Apollo 11 values are not in this
// repository. Estimates, labelled as such.
export const PAD_LOADS = Object.freeze({
  // ETDECAY (ERASABLE_ASSIGNMENTS.agc:2791): engine tail-off allowance in
  // the TGO computation. −0.70 s equals the 6.6 ft/s planned LOI-1 tail-off
  // (Mission Report Table 8.6-III) at full thrust — matches cm-sps.js.
  ETDECAY: -0.70,
  // DVTHRESH (ERASABLE_ASSIGNMENTS.agc:2086): "DELTA VTHRESHOLD FOR LOW
  // THRUST". Assumed 1.5 m/s per 2-s pass (full SPS thrust gives ≈ 4–6 m/s).
  DVTHRESH: 1.5,
  // EMDOT (ERASABLE_ASSIGNMENTS.agc:1494): SPS flow rate; nominal 63.8 lb/s
  // from the 3MDOT comment (P40-P47.agc:344).
  EMDOT: SPS_MDOT_NOMINAL,
});

// Load an external-ΔV maneuver into erasable memory the way P30 (or the
// ground uplink) would before P40: TIG (N33), ΔV in local-vertical axes
// (N81), weights (N47), trims (N48), PAD attitude (N22/N18 display), and the
// N42/N44 values. Display units (ft/s, lb, deg, n mi, s of GET).
export function loadExternalDeltaV(agc, pad = LOI1_PAD) {
  const tig = parseGET(pad.tig);
  setErasable(agc, 'TIG', tig);
  setErasable(agc, 'NOMTIG', tig);
  setErasable(agc, 'DELVLVC', pad.dvLv.slice());
  setErasable(agc, 'CSMMASS', pad.weight);
  setErasable(agc, 'LEMMASS', pad === LOI1_PAD ? LOI1_LM_WEIGHT : (pad.lmWeight ?? 0));
  setErasable(agc, 'PACTOFF', pad.pitchTrim);
  setErasable(agc, 'YACTOFF', pad.yawTrim);
  setErasable(agc, 'THETAD', pad.attitude.slice());
  if (pad.n42) {
    setErasable(agc, 'HAPO', pad.n42.ha);
    setErasable(agc, 'HPER', pad.n42.hp);
  }
  setErasable(agc, 'HAPOX', pad.ha);
  setErasable(agc, 'HPERX', pad.hp);
  setErasable(agc, 'VGDISP', vnorm(pad.dvLv));
  setFlag(agc, 'XDELVFLG', true);           // external ΔV, not Lambert aimpoint
  setFlag(agc, 'CSMDOCKD', pad.docked ?? pad === LOI1_PAD);
}

// Restart phase numbers (octal, as in the PHASCHNG/NEWPHASE operands).
const PH = {
  P40SSV: 0o23,     // 4.23 = P40S/SV (PRIO12)          P40-P47.agc:124-126
  TIGBLNK: 0o21,    // 4.21 = TIGBLNK                    :159-160
  TIGAVEG: 0o37,    // 4.37 = TIGAVEG (500CS)            :363-365
  TIG5: 0o6,        // 4.6  = TIG-5 (2496CS)             :467-469
  TIG0: 0o7,        // 4.7  = TIG-0 (500CS)              :488-490
  IGNITION: 0o61,   // 4.61 = IGNITION                   :515-516
  DOTVCON: 0o3,     // 4.3  = DOTVCON (40CS)             :546-548
  DOSTRULL: 0o5,    // 4.5  = DOSTRULL (160 CS)          :572-574
  DOSPSOFF: 0o63,   // 4.63 = DOSPSOFF                   :652-654
  DOTVCRCS: 0o27,   // 4.27 = DOTVCRCS (250 CS)          :656-658
  POSTBURN: 0o35,   // 4.35 = POSTBURN (NOVAC, PRIO12)   :673-674
  TIGNOW: 0o24,     // 4.24-type display restart (TYPE C, :192-194)
  CLOCK: 0o3,       // 6.3  = CLOKTASK (100CS)           :289,563-566
  ENGINOFF: 0o15,   // 3.15 = ENGINOFF (TGO+1)           :859-861
  S4013: 0o3,       // 3.3  = S40.13                     :488-490
};

const NV = { V06N40: 'V06N40', NONE: 0, V99: 'V99', V97: 'V97', V06N85B: 'V06N85B' };

const ftps = (mps) => toFps(mps);

export default class P40 {
  static number = 40;
  static name = 'SPS THRUSTING';
  static anchor = 'cm.p40.entry';

  constructor(agc) {
    this.agc = agc;
    this.tasks = new TaskList();
    this.router = new ResponseRouter();
    this.display = null;
    this.stage = 'idle';
    this.engineOn = false;
    this.engineInhibit = false;   // crew "engineStop" (ΔV thrust switches off)
    this.ullage = false;          // crew +X translation (THC) for ullage
    this.thrustDir = null;        // inertial unit vector or null (hold)
    this.nvword = NV.NONE;
    this.events = [];
    this.burnPhase = 'pre';
    this.vg = null;
    this.vgPrev = null;
    this.tgo = null;
    this.tig0 = null;             // TIG of the countdown (may be slipped)
    this.tIgnition = null;
    this.tCutoff = null;
    this.lastPulses = null;
    this.lastPass = null;
    this.flags = {};
    this.restartT = null;
    this.burn = { snapshot: () => this.burnSnapshot() };
  }

  get t() {
    return this.agc.t ?? vehicleState(this.agc)?.t ?? 0;
  }

  // ---------------- lifecycle ----------------

  enter() {
    const agc = this.agc;
    setPhase(agc, 'cmIdle');
    // P40CSM: ENG2FLAG off (SPS, not RCS); CSTEER = 0 for an external ΔV
    // burn; F = FENG ("SET UP THRUST FOR P40 20,000 LBS"); NOMTIG = TIG.
    // Comanche055/P40-P47.agc:46-60
    if (!Number.isFinite(agc.erasable?.TIG)) {
      // Simulator convenience: with no maneuver loaded (no P30 run), use the
      // Apollo 11 LOI-1 PAD.
      loadExternalDeltaV(agc, LOI1_PAD);
    }
    this.setF('ENG2FLAG', false);
    this.setF('XDELVFLG', agc.flags?.XDELVFLG ?? true);
    this.F = FENG_N;
    setErasable(agc, 'NOMTIG', agc.erasable.TIG);
    // R02BOTH (IMU status check, :63-64) — the simulator's IMU is always good.
    this.s40_1();
    this.r60();
  }

  exit() {
    this.redisplay = null;
    // V37 (or POST41 → P00): "THE ENGINE IS TURNED OFF AND THE DAP IS
    // INITIALIZED FOR COAST" (FRESH_START_AND_RESTART.agc:739-747).
    this.engineOn = false;
    this.thrustDir = null;
    this.tasks.clear();
    this.router.clear();
    this.setF('TIMRFLAG', false);
    for (const g of [3, 4, 6]) unprotect(this.agc, g);
  }

  step(t) {
    this.tasks.run(t);
  }

  vehicleCommands() {
    return {
      throttle: this.engineOn ? 1 : 0,
      thrustDir: this.thrustDir,
      engineOn: this.engineOn && !this.engineInhibit,
      ullage: this.ullage,
      rod: 0,
      lpd: null,
    };
  }

  get commands() {
    return this.vehicleCommands();
  }

  // PINBALL responses that reach the program instead of a display callback.
  onProceed() { return this.router.answer('proceed', this.agc.t); }
  onTerminate() { return this.router.answer('terminate', this.agc.t); }
  onEnter() { return this.router.answer('enter', this.agc.t); }
  onRecycle() { return this.router.answer('enter', this.agc.t); }

  // Crew-station controls the CM uses (§11.3 names where they exist).
  onCrewInput(name, value) {
    if (name === 'engineStop') this.engineInhibit = value === undefined ? true : !!value;
    else if (name === 'ullage') this.ullage = !!value;
  }

  // Restart re-entry for protected groups: tasks and jobs in this model are
  // kept (they are all restart-protected in the listing), the displays are
  // rebuilt — a software restart blanks the DSKY (ENEMA).
  reenter() {
    if (this.restartT === this.t) return;
    this.restartT = this.t;
    if (this.stage === 'countdown' || this.stage === 'burn') this.clockJob();
    else if (this.redisplay) this.redisplay();
  }

  // ---------------- helpers ----------------

  setF(name, on) {
    this.flags[name] = !!on;
    setFlag(this.agc, name, on);
  }

  er(name, value) {
    setErasable(this.agc, name, value);
  }

  prot(group, phase) {
    protect(this.agc, group, phase, (...a) => this.reenter(group, ...a));
  }

  totalMassKg() {
    const e = this.agc.erasable || {};
    return ((e.CSMMASS || 0) + (e.LEMMASS || 0)) * LB;
  }

  navState() {
    // The AGC's navigated state. Simplification: it equals the truth.
    const s = vehicleState(this.agc);
    return s && s.r && s.v ? { r: s.r, v: s.v, t: this.t } : null;
  }

  readPulses() {
    const s = vehicleState(this.agc);
    return s && s.pipaPulses ? s.pipaPulses.slice() : [0, 0, 0];
  }

  // ---------------- P40CSM / S40.1 / R60 / gimbal option ----------------

  // S40.1: velocity to be gained at ignition from the external ΔV.
  // Comanche055/P40-P47.agc:66-70,1203-1260
  s40_1() {
    const agc = this.agc;
    const tig = agc.erasable.TIG;
    const dvLvFps = agc.erasable.DELVLVC || LOI1_PAD.dvLv;
    const dvLv = dvLvFps.map((x) => x * FT);
    const nav = this.navState();
    if (nav) {
      const at = coast(nav.r, nav.v, tig - this.t);
      this.rTig = at.r;
      this.vTig = at.v;
      const delvsin = lvlhToInertial(dvLv, at.r, at.v);
      const { vgtig, thetaT } = s40_1(delvsin, at.r, at.v, this.totalMassKg(), this.F);
      this.vgtig = vgtig;
      this.thetaT = thetaT;
    } else {
      // No vehicle state (e.g. a static vehicle): keep the magnitude only.
      this.vgtig = [vnorm(dvLv), 0, 0];
      this.thetaT = 0;
    }
    this.ut = vunit(this.vgtig);
    this.vg = this.vgtig.slice();
    this.vgPrev = this.vgtig.slice();
  }

  // R60CSM: V50N18 "please perform auto maneuver"; PRO maneuvers (V06N18
  // while moving, then V50N18 again); ENTER finishes R60.
  // Comanche055/R60_62.agc:42-99
  r60() {
    this.stage = 'r60';
    this.redisplay = () => showDisplay(this, {
      verb: 50, noun: 18, flash: true, id: 'R60',
      source: 'cm.r60.toball',
      handlers: {
        proceed: () => this.r60Maneuver(),
        enter: () => this.p40ttog(),
        terminate: () => this.goToPooh(),
      },
    });
    this.redisplay();
  }

  r60Maneuver() {
    this.stage = 'r60-maneuver';
    this.thrustDir = this.ut.slice();
    // TOBALLC: non-flashing V06N18 while the DAP maneuvers (STARTMNV), then
    // back to TOBALL (flashing V50N18). The maneuver length comes from the
    // vehicle's attitude error (simulator DAP: 2°/s; minimum 1 s).
    const s = vehicleState(this.agc);
    const err = s && s.bodyX ? Math.acos(Math.max(-1, Math.min(1, vdot(s.bodyX, this.ut)))) : 0;
    const dur = Math.max(1, err / (2 * Math.PI / 180) + 1);
    this.redisplay = () => showDisplay(this, { verb: 6, noun: 18, source: 'cm.r60.toball' });
    this.redisplay();
    this.tasks.at(this.t + dur, 'R60DONE', () => this.r60());
  }

  // P40TTOG: NVWORD1 = V06N40, VGDISP = |VGTIG|, DVTOTAL = 0,
  // AVEGEXIT = STEERING. Then P40GMB: GOPERF1 V50N25 R1=00204
  // ("PERFORM SPS GIMBAL TRIM", ASSEMBLY_AND_OPERATION_INFORMATION.agc:978).
  // Comanche055/P40-P47.agc:85-105,329
  p40ttog({ display = true } = {}) {
    this.tasks.cancel('R60DONE');
    this.thrustDir = this.ut.slice();     // the DAP holds the burn attitude
    this.nvword = NV.V06N40;
    this.er('VGDISP', ftps(vnorm(this.vgtig)));
    this.er('DVTOTAL', 0);
    this.avegexit = 'STEERING';
    this.setF('TIMRFLAG', true);          // "ALLOW CLOCKTASK" (:79-80)
    this.stage = 'gimbal';
    this.er('DSPTEM1', 0o204);            // V50N25 R1 checklist code (octal)
    if (!display) return;
    this.redisplay = () => showDisplay(this, {
      verb: 50, noun: 25, flash: true, id: 'P40GMB',
      source: 'cm.p40.gimbal',
      handlers: {
        terminate: () => this.post41(),                 // TCF POST41 # V34
        proceed: () => this.trimDelay(18, true),        // TCF TST,TRIM # V33
        enter: () => this.trimDelay(5, false),          // TRIMONLY
      },
    });
    this.redisplay();
  }

  // TST,TRIM / TRIMONLY: S40.6 gimbal drive test (0,+2,−2,0° in pitch then
  // yaw, 2 s apart) and/or trim to PACTOFF/YACTOFF, then DELAYJOB 18 s
  // (test + trim) or 5 s (trim only). Comanche055/P40-P47.agc:106-123,348-349,2087-2179
  trimDelay(seconds, driveTest) {
    this.stage = 'trim';
    this.gimbalTest = driveTest;
    this.redisplay = null;
    this.tasks.at(this.t + seconds, 'P40S/RS', () => this.startCountdown());
  }

  // P40S/RS + P40S/SV: start CLOKTASK in 1 cs; integrate the state vector to
  // TDEC1 = TIG − 29.96 s (MIDTOAV1), slipping TIG with alarm 1703 when
  // there is not enough time; LONGCALL TIGBLNK five seconds before PREREAD.
  // Comanche055/P40-P47.agc:124-173; INTEGRATION_INITIALIZATION.agc:990-1092
  startCountdown({ clockAt = null } = {}) {
    const agc = this.agc;
    this.stage = 'countdown';
    this.prot(6, PH.CLOCK);
    this.prot(4, PH.P40SSV);
    this.tasks.at(clockAt ?? this.t + 0.01, 'CLOKTASK', () => this.clokTask());

    let tig = agc.erasable.TIG;
    const tdec1 = tig - SEC29_96;
    if (tdec1 < this.t + TIMEDELT) {
      // NOTIME: "INSUFFICIENT TIME FOR INTEGRATION -- TIG WILL BE SLIPPED".
      agc.alarm?.(0o1703);
      const piptime1 = this.t + TIMEDELT;
      tig = piptime1 + SEC29_96;                  // P40SNEWM (:167-173)
      this.er('TIG', tig);
    }
    this.tig0 = tig;
    this.buildEvents(tig);
    // P40SET: P40TMP = (PIPTIME1 − now) − 5 s → LONGCALL TIGBLNK.
    this.tasks.at(tig - SEC29_96 - SEC5, 'TIGBLNK', () => this.tigBlnk());
    this.prot(4, PH.TIGBLNK);
  }

  // ---------------- the countdown clock ----------------

  // CLOKTASK / CLOCKON / CLOCKJOB: every second while TIMRFLAG is set,
  // TTOGO = TIME2 − TIG, then the display chosen by NVWORD1:
  // >0 its V/N (NOFLASH), +0 nothing, <0 V99 flash (ENGREQST), −0 V97 flash
  // (FAILDSP). Comanche055/P40-P47.agc:870-955
  clokTask() {
    if (!this.flags.TIMRFLAG) return;           // PHASCHNG OCT 6 → kill
    this.tasks.at(this.t + 1, 'CLOKTASK', () => this.clokTask());
    this.clockJob();
  }

  clockJob() {
    const tig = this.agc.erasable.TIG;
    if (Number.isFinite(tig)) this.er('TTOGO', this.t - tig);
    this.redisplay = () => this.clockDisplay();
    this.clockDisplay();
  }

  clockDisplay() {
    switch (this.nvword) {
      case NV.V06N40:
        showDisplay(this, { verb: 6, noun: 40, source: 'cm.p40.clockjob' });
        break;
      case NV.V99:
        showDisplay(this, {
          verb: 99, noun: 40, flash: true, id: 'V99',
          source: 'cm.p40.engreqst',
          handlers: {
            terminate: () => this.v99t(),
            proceed: () => this.v99p(),
            enter: () => this.v99e(),
          },
        });
        break;
      case NV.V97:
        showDisplay(this, {
          verb: 97, noun: 40, flash: true, id: 'V97',
          source: 'cm.p40.faildsp',
          handlers: {
            terminate: () => this.v97t(),
            proceed: () => this.v97p(),
            enter: () => this.v97e(),
          },
        });
        break;
      default:
        break;                                  // +0: ENDOFJOB, no display
    }
  }

  // ---------------- TIG−35 … TIG ----------------

  // TIGBLNK: TIGAVEG in 5 s; NVWORD1 = 0; P40BLNKR job → CLEANDSP. The DSKY
  // stays dark until the first CLOCKJOB after TIGAVEG restores V06N40.
  // Comanche055/P40-P47.agc:350-366,163-165
  tigBlnk() {
    this.markEvent('tigblnk');
    this.tasks.at(this.t + SEC5, 'TIGAVEG', () => this.tigAveg());
    this.nvword = NV.NONE;
    const tick = this.tasks.next('CLOKTASK');
    let until = this.t + SEC5;
    if (tick) until = tick.t + Math.ceil(Math.max(0, this.t + SEC5 - tick.t) - 1e-9);
    this.agc.pinball?.blankFor?.(Math.max(0.01, until - this.t));
    this.redisplay = null;
    this.prot(4, PH.TIGAVEG);
  }

  // TIGAVEG ("TIG-30"): NVWORD1 = V06N40 ("UNBLANK DISPLAY"); TIG-5 in
  // 24.96 s; PRECHECK → PREREAD: Average-G starts — DVTOTAL cleared, PIPAs
  // read, READACCS every 2 s from now. Comanche055/P40-P47.agc:456-474;
  // SERVICER207.agc:228-280
  tigAveg() {
    this.markEvent('tigaveg');
    this.burnPhase = 'avg-g';
    this.nvword = NV.V06N40;
    this.tasks.at(this.t + SEC24_96, 'TIG-5', () => this.tig5());
    this.prot(4, PH.TIG5);
    // PREREAD
    this.setF('AVEGFLAG', true);
    this.setF('V37FLAG', true);
    this.er('DVTOTAL', 0);
    this.lastPulses = this.readPulses();
    this.lastPass = this.t;
    setPhase(this.agc, 'cmBurn');
    this.tasks.at(this.t + SERVICER_PERIOD, 'READACCS', () => this.readAccs());
  }

  // TIG-5: TIG-0 in 5 s; NVWORD1 = −BIT9 ("WILL CAUSE V99 FLASH"); start
  // the S40.13 TIMEBURN job. Comanche055/P40-P47.agc:480-497
  tig5() {
    this.markEvent('tig5');
    this.burnPhase = 'v99';
    this.tasks.at(this.t + SEC5, 'TIG-0', () => this.tig0Task());
    this.prot(4, PH.TIG0);
    this.prot(3, PH.S4013);
    this.nvword = NV.V99;
    this.s40_13();
  }

  // S40.13 TIMEBURN: will the burn be long enough to steer? Burn time at
  // nominal thrust from the rocket equation (the listing uses pad-loaded
  // impulse constants K1VAL..K3VAL); with +X translation on, VG is first
  // reduced by the impulse of 7.96 s of 2-jet ullage. < 6 s → IMPULSW
  // (attitude hold, timed cut-off). Comanche055/P40-P47.agc:1949-2035
  s40_13() {
    let vg = vnorm(this.vg);
    const m = this.totalMassKg() || 1;
    if (this.ullage) vg = Math.max(0, vg - ULLAGE_IMPULSE_2JET / m);
    const ve = SPS_VEX;
    const t = (m * ve / this.F) * (1 - Math.exp(-vg / ve));
    this.burnEstimate = t;
    if (t < IMPULSIVE_LIMIT) {
      this.setF('IMPULSW', true);
      this.tgo = t;
    } else {
      this.setF('IMPULSW', false);                 // S40.133 "WILL STEER VEHICLE"
    }
    this.updateEventTimes();
    unprotect(this.agc, 3);                        // S40.134 "KILL GROUP 3"
  }

  // TIG-0: set IGNFLAG; if ASTNFLAG (crew PRO on V99) clear the V99 and go
  // to IGNITION, else wait for V99P. Comanche055/P40-P47.agc:503-516
  tig0Task() {
    this.setF('IGNFLAG', true);
    if (!this.flags.ASTNFLAG) return;              // "WAIT FOR V99P"
    this.nvword = NV.V06N40;
    this.ignition();
  }

  // V99P: ASTNFLAG; if TIG-0 already came, ignite in 1 cs; otherwise clear
  // the flash and wait for TIG-0. Comanche055/P40-P47.agc:984-1004
  // The DSKY returns to V06N40 on the next CLOCKJOB (≤ 1 s later).
  v99p() {
    if (this.flags.ASTNFLAG) return;               // "THIS MUST BE A RESTART ENTRY"
    this.setF('ASTNFLAG', true);
    const rel = this.t - this.tig0;
    this.events.push({ id: 'v99p', label: 'Crew PRO on V99N40 (ASTNFLAG)', rel, t: this.t, done: true, anchor: 'cm.p40.v99p' });
    emitBus(this.agc, 'burn', { id: 'v99p', label: 'Crew PRO on V99N40', t: this.t, rel });
    this.nvword = NV.V06N40;
    if (this.flags.IGNFLAG) this.tasks.at(this.t + 0.01, 'IGNITION', () => this.ignition());
  }

  // V99T (V34): TVCZAP, POST41 → GOTOPOOH. Comanche055/P40-P47.agc:977-982
  v99t() {
    this.tvcZap();
    this.post41();
  }

  // V99E (ENTER): "V99N40 ENTERS HERE ON A P40 BYPASS SPS" → P40RCS:
  // V16N85 for an RCS burn of the velocity to be gained.
  // Comanche055/P40-P47.agc:182-188,968-974
  v99e() {
    this.tvcZap();
    this.p40rcs();
  }

  // ---------------- ignition and the burn ----------------

  // IGNITION / SPSON: TEVENT, ENGONFLG, channel 11 (DSALMOUT) bit 13 = SPS
  // engine on. IMPULCHK → IMPLBURN or PREPTVC: 0.4 s thrust build-up, TVC
  // DAP on (DOTVCON), 1.6 s later DOSTRULL: steering on (STEERSW) and RCS
  // ullage jets off (ULAGEOFF). Comanche055/P40-P47.agc:518-606
  ignition() {
    this.markEvent('ignition');
    this.burnPhase = 'ignition';
    this.stage = 'burn';
    this.tIgnition = this.t;
    this.er('TEVENT', this.t);
    this.setF('ENGONFLG', true);
    this.engineOn = true;
    this.prot(4, PH.IGNITION);
    this.thrustDir = vunit(this.vg);
    if (this.flags.IMPULSW) {
      this.implBurn();
    } else {
      this.setF('STRULLSW', true);
    }
    this.tasks.at(this.t + 0.4, 'DOTVCON', () => {
      this.markEvent('tvc');
      this.prot(4, PH.DOSTRULL);
      this.tasks.at(this.t + 1.6, 'DOSTRULL', () => this.doStrull());
    });
    this.prot(4, PH.DOTVCON);
  }

  doStrull() {
    if (this.flags.STRULLSW) {
      this.markEvent('steer');
      this.setF('STEERSW', true);                  // STEERULL
      this.burnPhase = 'burning';
    }
    this.ullage = false;                           // ULAGEOFF: CHAN5 = 0
    unprotect(this.agc, 4);                        // "KILL GROUP 4"
  }

  // IMPLBURN: TIG = TIME2 + TGO for R1 of V06N40; ENGINOFF in TGO.
  // Comanche055/P40-P47.agc:608-644
  implBurn() {
    this.setF('STRULLSW', false);
    const tgo = Math.max(0.01, this.tgo ?? 0.01);
    this.er('TIG', this.t + tgo);
    this.prot(3, PH.ENGINOFF);
    this.tasks.at(this.t + tgo, 'ENGINOFF', () => this.enginOff());
    this.setF('IMPULSW', false);
    this.burnPhase = 'burning';
    this.updateEventTimes(tgo);
  }

  // READACCS (every 2 s): PIPASR reads and clears the PIPA counters; the
  // SERVICER job compensates them, adds |DELV| to DVTOTAL, runs Average-G
  // and exits through AVEGEXIT (STEERING / CALCN85 / SERVEXIT).
  // Comanche055/SERVICER207.agc:285-301,447-508
  readAccs() {
    if (!this.flags.AVEGFLAG) return;
    this.tasks.at(this.t + SERVICER_PERIOD, 'READACCS', () => this.readAccs());
    const now = this.readPulses();
    const prev = this.lastPulses || now;
    const delv = vscale(vsub(now, prev), CM_PIPA_PULSE);
    this.lastPulses = now;
    const pguide = this.t - (this.lastPass ?? this.t - SERVICER_PERIOD);
    this.lastPass = this.t;
    this.delvref = delv;
    // DVTOTUP: DVTOTAL += |DELV|.
    this.er('DVTOTAL', (this.agc.erasable.DVTOTAL || 0) + ftps(vnorm(delv)));
    // Mass bookkeeping (TVCMASSPROP decrements CSMMASS by EMDOT while the
    // SPS is on — simplified to once per pass).
    if (this.engineOn) {
      const used = PAD_LOADS.EMDOT * pguide / LB;
      this.er('CSMMASS', Math.max(0, (this.agc.erasable.CSMMASS || 0) - used));
    }
    this.servicerPass(pguide);
  }

  servicerPass(pguide) {
    switch (this.avegexit) {
      case 'STEERING': this.steering(pguide); break;
      case 'CALCN85': this.calcN85(pguide); break;
      default: break;                               // SERVEXIT
    }
  }

  // STEERING: UPDATEVG (S40.8); if IMPULSW is set with the engine on, the
  // cut-off is now due within 4 s: WAITLIST ENGINOFF at TIG − TIME2.
  // Comanche055/P40-P47.agc:819-864
  steering(pguide) {
    this.s40_8(pguide);
    if (this.flags.IMPULSW && this.engineOn) {
      const tig = this.agc.erasable.TIG;
      const dt = Math.max(0.01, tig - this.t);
      this.prot(3, PH.ENGINOFF);
      this.tasks.cancel('ENGINOFF');
      this.tasks.at(this.t + dt, 'ENGINOFF', () => this.enginOff());
      this.setF('IMPULSW', false);                  // "ENGINOFF IS NOW SET UP"
      this.markEvent('tgo4');
      this.updateEventTimes(dt);
    }
  }

  // S40.8: VG = VGPREV − DELVREF (external ΔV: no b-vector term);
  // VGDISP = |VG|; with STEERSW: low-thrust check (R40 → V97), "VG
  // increasing" alarm 1407, TGO, TIG = PIPTIME + TGO, and below 4 s the
  // S40.81 attitude hold. Comanche055/P40-P47.agc:1646-1786
  s40_8(pguide) {
    const delv = this.delvref || [0, 0, 0];
    this.vg = vsub(this.vgPrev, delv);
    this.vgPrev = this.vg.slice();
    this.er('VGDISP', ftps(vnorm(this.vg)));
    if (!this.flags.STEERSW) return;

    const dvMag = vnorm(delv);
    if (dvMag < PAD_LOADS.DVTHRESH) {
      if (this.flags.IDLEFAIL) return;             // one bypass after V97P
      this.loThrust();
      return;
    }
    // INCRSVG: "ANGLE SHOULD BE GREATER THAN PI/2" between −DELVREF and VG,
    // i.e. the measured ΔV must point along VG; otherwise alarm 01407
    // "VG INCREASING" and no TGO this pass (:1687-1693,1771-1776).
    if (vdot(delv, this.vg) < 0) {
      this.agc.alarm?.(0o1407);
      return;
    }
    // TGOCALC (simplified closed form; the listing uses a series in VG/VEX
    // with the measured thrust acceleration and the tail-off ETDECAY).
    const accel = dvMag / Math.max(pguide, 0.01);
    const vgm = vnorm(this.vg);
    const tgo = (SPS_VEX / accel) * (1 - Math.exp(-vgm / SPS_VEX)) + PAD_LOADS.ETDECAY;
    this.tgo = tgo;
    this.er('TGO', tgo);
    this.er('TIG', this.lastPass + tgo);           // STODL TIG
    this.updateEventTimes(tgo);
    if (tgo - FOURSEC < 0) {
      // S40.81: IMPULSW for the engine-off call, attitude hold, STEERSW off.
      this.setF('IMPULSW', true);
      this.setF('STEERSW', false);
      return;
    }
    // XPRODUCT: steer the thrust toward VG (simulator: point along VG).
    this.thrustDir = vunit(this.vg);
  }

  // LOTHRUST: "THRUST FAILURE (LO-OR-NO) INDICATED" → TVC attitude hold,
  // NVWORD1 = −0 (V97 flash on the next CLOCKJOB), steering off.
  // Comanche055/P40-P47.agc:1778-1797
  loThrust() {
    this.nvword = NV.V97;
    this.setF('STEERSW', false);
    this.burnPhase = 'burning';
    emitBus(this.agc, 'burn', { id: 'v97', label: 'Low thrust: V97N40 engine-fail display', t: this.t, rel: this.t - this.tig0 });
  }

  // ENGINOFF → SPSOFF: TEVENT, ENGONFLG off, channel 11 bit 13 off (and
  // the S-IVB cut-off backup bit); 2.5 s for tail-off; DOTVCRCS: RCS DAP,
  // MASSPROP, TVCZAP (clock off); POSTBURN job. Comanche055/P40-P47.agc:647-720
  enginOff() {
    this.markEvent('cutoff');
    this.burnPhase = 'cutoff';
    this.spsOff();
    this.tCutoff = this.t;
    unprotect(this.agc, 3);
    this.prot(4, PH.DOTVCRCS);
    this.tasks.at(this.t + 2.5, 'DOTVCRCS', () => {
      this.tvcZap();
      this.prot(4, PH.POSTBURN);
      this.postBurn();
    });
  }

  spsOff() {
    this.er('TEVENT', this.t);
    this.setF('ENGONFLG', false);
    this.engineOn = false;
  }

  // TVCZAP: NVWORD1 = 0, TIMRFLAG off (stops CLOKTASK). :732-742
  tvcZap() {
    this.nvword = NV.NONE;
    this.setF('TIMRFLAG', false);
    this.tasks.cancel('CLOKTASK');
    unprotect(this.agc, 6);
  }

  // POSTBURN: flashing V16N40 (final TTOGO, VG, ΔV). V34 → POST41,
  // PRO → P40RCS (residuals), V32 → redisplay. Comanche055/P40-P47.agc:176-181
  postBurn() {
    this.markEvent('postburn');
    this.burnPhase = 'done';
    this.stage = 'postburn';
    this.redisplay = () => showDisplay(this, {
      verb: 16, noun: 40, flash: true, id: 'POSTBURN',
      source: 'cm.p40.postburn',
      handlers: {
        terminate: () => this.post41(),
        proceed: () => this.p40rcs(),
        enter: () => this.postBurn(),
      },
    });
    this.redisplay();
  }

  // P40RCS: AVEGEXIT = CALCN85 (VG and VG in body axes every 2 s), wait 2 s
  // for the first CALCN85, SETMINDB, then TIGNOW: flashing V16N85.
  // Comanche055/P40-P47.agc:182-200,302-319
  p40rcs() {
    this.avegexit = 'CALCN85';
    this.stage = 'n85';
    this.redisplay = null;
    this.tasks.at(this.t + 2, 'TIGNOW', () => this.tigNow());
  }

  tigNow() {
    this.prot(4, PH.TIGNOW);
    this.redisplay = () => showDisplay(this, {
      verb: 16, noun: 85, flash: true, id: 'TIGNOW',
      source: 'cm.p40.tignow',
      handlers: {
        terminate: () => this.post41(),
        proceed: () => this.post41(),
        enter: () => this.tigNow(),
      },
    });
    this.redisplay();
  }

  // CALCN85: UPDATEVG, then VGBODY = VG in body axes (P40CNV85 / S41.1).
  // Body axes: X = thrust axis; Z = the component of "down" normal to X;
  // Y = Z × X (simulator convention — no CDU/IMU model).
  calcN85() {
    if (this.delvref) this.s40_8(SERVICER_PERIOD);
    const s = vehicleState(this.agc);
    const x = s && s.bodyX ? s.bodyX : (this.ut || [1, 0, 0]);
    const down = s && s.r ? vscale(vunit(s.r), -1) : [0, 0, -1];
    let z = vsub(down, vscale(x, vdot(down, x)));
    z = vnorm(z) > 1e-9 ? vunit(z) : [0, 0, 1];
    const y = vcross(z, x);
    const vg = this.vg || [0, 0, 0];
    this.er('VGBODY', [ftps(vdot(vg, x)), ftps(vdot(vg, y)), ftps(vdot(vg, z))]);
  }

  // POST41: AVEGEXIT = SERVEXIT (Average-G keeps running), then GOTOPOOH.
  // Comanche055/P40-P47.agc:202-205
  post41() {
    this.avegexit = 'SERVEXIT';
    this.goToPooh();
  }

  // GOTOPOOH → GOP00FIX: flash V37 N99 until the crew selects a new program
  // with V37 (every response just re-flashes). The major mode stays 40.
  // Comanche055/FRESH_START_AND_RESTART.agc:713-733
  goToPooh() {
    this.stage = 'pooh';
    this.engineOn = false;
    this.tasks.cancel('R60DONE');
    this.tasks.cancel('P40S/RS');
    this.tasks.cancel('TIGNOW');
    if (this.nvword !== NV.NONE || this.flags.TIMRFLAG) this.tvcZap();
    for (const g of [3, 4]) unprotect(this.agc, g);
    this.redisplay = () => showDisplay(this, {
      verb: 37, noun: 99, flash: true, id: 'GOP00FIX',
      source: 'cm.p00.gotopooh',
      handlers: {
        terminate: () => this.redisplay(),
        proceed: () => this.redisplay(),
        enter: () => this.redisplay(),
      },
    });
    this.redisplay();
  }

  // ---------------- engine-fail (V97) responses ----------------

  // V97T: kill the clock; SPSOFF; 2.5 s tail-off; RCS DAP; V99T job.
  // Comanche055/P40-P47.agc:1007-1040
  v97t() {
    this.tvcZap();
    this.spsOff();
    this.tasks.at(this.t + 2.5, 'V97TRCS', () => this.v99t());
  }

  // V97P: redisplay V06N40, IDLEFAIL (one R40 bypass) and STEERSW on;
  // 2 s later R40ENABL clears IDLEFAIL. Comanche055/P40-P47.agc:1043-1072
  v97p() {
    this.nvword = NV.V06N40;
    this.setF('IDLEFAIL', true);
    this.setF('STEERSW', true);
    this.tasks.at(this.t + 2, 'R40ENABL', () => this.setF('IDLEFAIL', false));
  }

  // V97E: R1 forced to 59X59, SPSOFF, 2.5 s, gimbal re-trim, RCS DAP,
  // QUICKIGN (ASTNFLAG off, IGNFLAG on), 0.3 s, V99FLASH + S40.13 — so the
  // next PRO re-ignites immediately. Comanche055/P40-P47.agc:1075-1135
  v97e() {
    this.er('TIG', this.t - 99 * 60);              // "FORCE R1 OF V06N40 TO READ 59X59"
    this.nvword = NV.V06N40;
    this.spsOff();
    this.tasks.at(this.t + 2.5, 'V97E40.6', () => {
      this.setF('ASTNFLAG', false);
      this.setF('IGNFLAG', true);
      this.tasks.at(this.t + 0.3, 'V99FLASH', () => {
        this.nvword = NV.V99;                      // "WAIT FOR CLOCKJOB (IMMEDIATE)"
        this.burnPhase = 'v99';
        this.s40_13();
        this.clockJob();
      });
    });
  }

  // ---------------- burn timeline for snapshot.burn ----------------

  buildEvents(tig) {
    const est = this.estimateBurnTime();
    const ev = (id, label, rel, anchor) => ({ id, label, rel, t: tig + rel, done: false, anchor });
    this.events = [
      ev('tigblnk', 'TIG−35: DSKY blanked (TIGBLNK)', -SEC29_96 - SEC5, 'cm.p40.tigblnk'),
      ev('tigaveg', 'TIG−30: Average-G starts, V06N40 returns (TIGAVEG)', -SEC29_96, 'cm.p40.tigaveg'),
      ev('tig5', 'TIG−5: V99N40 flashes — please enable engine', -SEC5, 'cm.p40.tig5'),
      ev('ignition', 'Ignition: SPS on, channel 11 bit 13', 0, 'cm.p40.ignition'),
      ev('tvc', 'TIG+0.4: thrust built up, TVC autopilot on', 0.4, 'cm.p40.dotvcon'),
      ev('steer', 'TIG+2: steering on, ullage jets off', 2, 'cm.p40.dostrull'),
      ev('tgo4', 'TGO < 4 s: attitude hold, cut-off timed (S40.81)', est - FOURSEC, 'cm.p40.s4081'),
      ev('cutoff', 'Cut-off: ENGINOFF / SPSOFF', est, 'cm.p40.enginoff'),
      ev('postburn', 'V16N40 flashes: burn summary (POSTBURN)', est + 2.5, 'cm.p40.postburn'),
    ];
  }

  estimateBurnTime() {
    const m = this.totalMassKg() || 1;
    const vg = vnorm(this.vg || [0, 0, 0]);
    return (m * SPS_VEX / (this.F || FENG_N)) * (1 - Math.exp(-vg / SPS_VEX));
  }

  // Move the not-yet-done cut-off events to the latest TGO estimate.
  updateEventTimes(tgoFromNow = null) {
    if (!this.events.length || this.tig0 === null) return;
    let cut;
    if (tgoFromNow !== null) cut = this.t + tgoFromNow;
    else if (this.burnEstimate) cut = this.tig0 + this.burnEstimate;
    else return;
    for (const e of this.events) {
      if (e.done) continue;
      if (e.id === 'cutoff') { e.t = cut; e.rel = cut - this.tig0; }
      if (e.id === 'tgo4') { e.t = Math.max(this.t, cut - FOURSEC); e.rel = e.t - this.tig0; }
      if (e.id === 'postburn') { e.t = cut + 2.5; e.rel = cut + 2.5 - this.tig0; }
    }
  }

  markEvent(id) {
    const e = this.events.find((x) => x.id === id);
    if (e) {
      e.done = true;
      e.t = this.t;
      e.rel = this.tig0 === null ? 0 : this.t - this.tig0;
    }
    if (e || id) {
      emitBus(this.agc, 'burn', {
        id, label: e ? e.label : id, t: this.t, rel: this.tig0 === null ? 0 : this.t - this.tig0,
      });
    }
  }

  burnSnapshot() {
    if (this.tig0 === null) return null;
    return {
      program: 40,
      tig: this.tig0,
      tMinusTig: this.t - this.tig0,
      phase: this.burnPhase,
      events: this.events.map((e) => ({ ...e })),
    };
  }

  // Extra CM detail for views/tests (beyond §6.9.1).
  snapshot() {
    const e = this.agc.erasable || {};
    return {
      stage: this.stage,
      nvword: this.nvword,
      engineOn: this.engineOn,
      vg: this.vg ? ftps(vnorm(this.vg)) : null,          // ft/s
      tgo: this.tgo,
      tig: this.tig0,
      tIgnition: this.tIgnition,
      tCutoff: this.tCutoff,
      burnEstimate: this.burnEstimate ?? this.estimateBurnTime(),
      dvTotal: e.DVTOTAL ?? 0,                            // ft/s
      thetaT: this.thetaT,
      flags: { ...this.flags },
    };
  }

  // ---------------- presets / scenarios ----------------

  // Jump straight to a later stage, as if the crew had already answered
  // the earlier displays (deterministic scenario/preset set-up):
  //   'gimbal'    — R60 finished, V50N25 R1=00204 flashing
  //   'countdown' — gimbal trim done, CLOKTASK running on V06N40
  skipTo(stage, { clockAt = null } = {}) {
    this.tasks.cancel('R60DONE');
    this.router.clear();
    this.thrustDir = this.ut.slice();
    if (stage === 'gimbal') {
      this.p40ttog();
      return;
    }
    if (stage === 'countdown') {
      this.p40ttog({ display: false });
      this.trimDelay(0, false);
      this.tasks.cancel('P40S/RS');
      this.startCountdown({ clockAt });
      return;
    }
    throw new Error(`P40.skipTo: unknown stage "${stage}"`);
  }
}

// Burn-direction helper for presets (the S40.1 thrust direction for the
// loaded maneuver, as the vehicle should be pointed before TIG).
export function burnDirection(agc) {
  const p = new P40(agc);
  if (!Number.isFinite(agc.erasable?.TIG)) loadExternalDeltaV(agc);
  p.F = FENG_N;
  p.s40_1();
  return p.ut;
}

// Exposed for tests and the instruments view.
export const P40_CONSTANTS = Object.freeze({
  FENG_N, SPS_VEX, SEC29_96, SEC24_96, SEC5, TIMEDELT, IMPULSIVE_LIMIT, FOURSEC,
  CM_PIPA_PULSE, SERVICER_PERIOD, NMI, LBF,
});

// Re-export for convenience.
export { apsides };
