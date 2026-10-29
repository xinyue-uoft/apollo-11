// The lunar landing software of Luminary 099 — P63, P64, P65 and P66 share
// one set of erasable state in the real machine (WCHPHASE, TTF/8, LAND,
// REDFLAG, VDGVERT ...), so the simulator keeps it in one object,
// `LunarLanding` (agc.landing), and the major-mode programs P63-P66 are
// thin views of it (LandingMode below). Sources: Luminary099/
// THE_LUNAR_LANDING.agc (TLL), LUNAR_LANDING_GUIDANCE_EQUATIONS.agc (LLGE),
// BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc (BBB); research
// src-landing.md, src-ignition.md.
//
// One SERVICER pass (every 2 s; workload.js creates the job, its onDone
// calls agc.program.onServicerPass) does here what the job does on the
// machine: navigation (nav.js), then the guidance exit AVGEXIT selected by
// the burn: SERVEXIT before ignition (nothing), P63DISPS −2 during the 26-s
// trim (V06N63 only), LUNLAND after P63ZOOM: GUILDENSTERN (R13) → the
// guidance of the current phase → throttle/attitude commands → DISPEXIT
// (V06N63 / V06N64 / V06N60). Because everything happens in the SERVICER
// job, a starved SERVICER freezes guidance and displays — as it did.
//
// Vehicle kinds: with the physics LM, the guidance law of
// js/agc/guidance/landing-guidance.js flies the vehicle on the AGC's
// estimate. With the historical replay the vehicle ignores the commands;
// the displayed guidance quantities are then derived from the replayed
// state and the Apollo 11 event times (P64 at 102:41:32, MR Table 5-I).

import { parseGET } from '../../../util/time.js';
import { FT, FPS, NMI } from '../../../util/units.js';
import { DPS } from '../../../vehicle/constants.js';
import {
  LandingGuidance, BRAKING_TARGETS, APPROACH_TARGETS, GUIDANCE_PARAMS,
  toGuidanceFrame, thrustDirFromPitch, lookAngle, tredes, p66AttitudeAssist,
} from '../../guidance/landing-guidance.js';
import { LmProgram, vehicleKind, toFt, toFps } from './common.js';
import { BurnBaby, IGNITION_TABLES, DISPDEX, BURN_TIMING, TIG_APOLLO11 } from './burnbaby.js';

export const LANDING_MODES = Object.freeze([63, 64, 65, 66]);

// Apollo 11 times used to synchronise the replay (MR Table 5-I unless
// noted; research web-timeline-b.md, web-trajectory-b.md §3).
export const APOLLO11_LANDING = Object.freeze({
  tig: TIG_APOLLO11,                          // 102:33:05.01 (MR Table 9.6-V)
  lrDataGood: parseGET('102:37:51'),
  v57: parseGET('102:38:45'),                 // "Enable radar updates"
  p64: parseGET('102:41:32'),                 // high gate, 7,129 ft
  p64Proceed: parseGET('102:42:33'),          // CHERRY TFI 568 "PRO to FLV06N64"
  p66: parseGET('102:43:22'),
  touchdown: parseGET('102:45:39.9'),         // MR §5.4
  // N61 R1 at P63 selection: Aldrin "Need to compare a TIG time. 09:50"
  // (ONB ≈102:11:07, research web-timeline-b.md §2) — the braking-phase
  // time to go IGNALG computed; used as the N61 value in the model.
  n61Ttf: -(9 * 60 + 50),
  // R60 burn attitude from the PDI PAD: R 182, P 287, Y 0 (ONB 102:12:13
  // "180, 287, 0" / PAD per research web-timeline-b.md §2).
  burnAttitude: Object.freeze([182, 287, 0]),
  // Onboard (PGNCS) landing-site solution, MR Table 5-IV.
  pgncsLanding: Object.freeze({ lat: 0.649, long: 23.46 }),
});

// Job priorities/costs of the pre-ignition chain. Priorities from the
// listing (the V37 job runs at PRIO13: PREMM1 "PRIO 13",
// FRESH_START_AND_RESTART.agc:1116-1146; ASTNRET PRIO13 FINDVAC, BBB:805-814);
// CPU costs are model estimates.
const JOBS = Object.freeze({
  P63LM: { prio: 0o13, vac: true, workMs: 2500 },     // P63LM + IGNALG iterations
  ASTNRET: { prio: 0o13, vac: true, workMs: 60 },
  R51: { prio: 0o13, vac: true, workMs: 40 },
});

const R60_MANEUVER_S = 6;       // simulated KALCMANU time to the burn attitude [ASSUMED]
const CREW_ENGINE_STOP_S = 1.5; // touchdown 102:45:39.9 → cutoff 102:45:41.4 (MR)

export class LunarLanding extends LmProgram {
  constructor(agc) {
    super(agc);
    this.active = true;
    this.kind = vehicleKind(agc);
    this.physics = this.kind === 'physics';
    this.burn = new BurnBaby(this, IGNITION_TABLES.P63TABLE);
    this.guidance = this.physics ? new LandingGuidance() : null;
    this.mode = 63;
    this.stage = 'p63';
    this.connected = false;       // AVEGEXIT = LUNLAND (after P63ZOOM)
    this.phaseName = null;        // 'braking' | 'approach' | 'vertical' | 'rod'
    this.ttf = null;              // s, target-referenced time to go (negative)
    this.redFlag = false;         // REDFLAG: LPD redesignation permitted
    this.tredes = 0;
    this.lookAngle = null;
    this.vdgVert = null;          // m/s, P66 desired altitude rate
    this.tP64 = null;
    this.tP66 = null;
    this.tZoom = null;
    this.lastPass = null;
    this.engineStopped = false;
    this.landedAt = null;
    this.lpdClicks = { el: 0, az: 0 };
    this.siteShift = { downrange: 0, crossrange: 0 };
    this.cmd = { engineOn: false, throttle: 0, thrustDir: null, pitch: undefined, ullage: false, rod: 0, lpd: null };
    this.lastOut = null;
    this.r60Done = false;
  }

  get nav() {
    return this.agc.nav;
  }

  get crew() {
    return this.agc.crew;
  }

  // ---------- start ----------

  // A program's entry. mode: 63-66; initial: scenario/preset set-up at the
  // present GET (restore the state of an Apollo 11-like descent).
  begin(mode, { initial = false } = {}) {
    this.mode = mode;
    if (mode === 63 && !initial) this.startP63();
    else this.restoreAt(this.t, mode);
  }

  // The TIG this burn uses: given by the preset/scenario (agcOptions.tig or
  // erasable TIG), else Apollo 11's when it is reachable, else 10 minutes
  // from now (IGNALG's answer is not modelled for arbitrary states).
  chooseTig(now, { strict = false } = {}) {
    const opt = this.agc.options?.tig;
    if (opt !== undefined && opt !== null) return parseGET(opt);
    const e = this.agc.erasable.TIG;
    if (Number.isFinite(e) && (strict || e > now)) return e;
    if (strict) return TIG_APOLLO11;
    const lead = TIG_APOLLO11 - now;
    if (lead >= 60 && lead <= 3600) return TIG_APOLLO11;
    return now + 600;
  }

  // FLAGORGY "DIONYSIAN FLAG WAVING" (TLL:64-73) and P63LM's set-up (:40-62).
  flagOrgy() {
    const f = this.agc.flags;
    f.NOTHROTL = false;
    f.REDFLAG = false;
    f.LRBYPASS = false;
    f.MUNFLAG = true;
    f.P25FLAG = false;
    f.RNDVZFLG = false;
    this.agc.erasable.WCHPHASE = -1;
    this.agc.erasable.RODCOUNT = 0;
  }

  // ---------- P63 selected with V37: P63LM → IGNALG → V06N61 → R51 → R60 → BURNBABY ----------

  startP63() {
    this.stage = 'p63lm';
    this.protect(4, '4.24', () => this.redoStage(), { label: 'P63LM', anchor: 'p63.entry' });
    this.flagOrgy();
    this.setPhase('prePDI');
    this.nav.reset();
    this.agc.erasable.DELTAH = 99999;
    this.job('P63LM', { ...JOBS.P63LM, anchor: 'p63.ignalg', label: 'P63LM / IGNALG', onDone: (t) => this.ignalgDone(t) });
  }

  // DDUMGOOD (TLL:187-201): TIG = TDEC1 − ZOOMTIME; OUTOFPLN for N61 R3.
  ignalgDone(t) {
    const tig = this.chooseTig(t);
    this.agc.erasable.TIG = tig;
    this.agc.erasable.TTFDISP = APOLLO11_LANDING.n61Ttf;
    this.agc.erasable.OUTOFPLN = 0;       // planar model: no cross-range
    this.nav.arm({ tig });
    // IGNALGRT / ASTNCLOK (TLL:204-210): flashing V06N61 on the clock.
    this.stage = 'v06n61';
    this.protect(4, '4.24', () => this.redoStage(), { label: 'IGNALGRT (V06N61)', anchor: 'p63.astnclok' });
    this.burn.tig = tig;
    this.burn.startClock(-DISPDEX.ASTNDEX, tig);
  }

  // CLOKJOB with DISPDEX = −ASTNDEX (BBB:752-758): flashing V06N61, "USED BY
  // THE CREW IN P63 TO RESET HIS EVENT TIMER TO AGREE WITH TIG".
  onAstnClock() {
    this.flash(6, 61, {
      proceed: () => this.astnRetn(),
      terminate: () => this.burn.stopClok(),
      // V32E: the flight code's `TCF -6` here branches to COMFAIL2
      // (src-ignition.md §17.5) — not modelled: the display is re-shown.
      enter: () => this.onAstnClock(),
    }, { id: 'V06N61', source: 'p63.astnclok' });
  }

  // ASTNRETN (BBB:805-814): clock keeps running without a display; ASTNRET.
  astnRetn() {
    this.burn.dispdex = 0;
    this.stage = 'r51';
    this.protect(4, '4.24', () => this.redoStage(), { label: 'ASTNRETN', anchor: 'burn.responses' });
    this.job('ASTNRET', { ...JOBS.ASTNRET, anchor: 'p63.r51r60', onDone: () => this.r51() });
  }

  // R51P63 (TLL:212-216): flashing V50N25 R1 = 00014, fine-align option.
  r51() {
    this.stage = 'r51';
    this.flash(50, 25, {
      // PRO = fine alignment with the AOT (R51); not modelled — the IMU is
      // treated as aligned and P63 continues.
      proceed: () => this.job('R51', { ...JOBS.R51, anchor: 'p63.r51r60', onDone: () => this.r60() }),
      enter: () => this.r60(),
      terminate: () => this.terminate(),
    }, { id: 'R51', source: 'p63.r51r60', checklist: 0o14 });
  }

  // P63SPOT2 → R60LEM (R60_62.agc, TOBALLA): V06N18 then flashing V50N18
  // "please perform auto maneuver"; PRO maneuvers (static V06N18), ENTER
  // ends R60.
  r60() {
    this.stage = 'r60';
    const [r, p, y] = APOLLO11_LANDING.burnAttitude;
    Object.assign(this.agc.erasable, { FDAIX: r, FDAIY: p, FDAIZ: y });
    this.flash(50, 18, {
      proceed: () => this.r60Maneuver(),
      enter: () => this.r60End(),
      terminate: () => this.terminate(),
    }, { id: 'R60', source: 'p63.r51r60' });
  }

  r60Maneuver() {
    this.stage = 'r60-maneuver';
    this.show(6, 18, { source: 'p63.r51r60' });
    this.schedule('R60MANU', this.t + R60_MANEUVER_S, () => {
      this.r60Done = true;
      this.r60();
    });
  }

  // ENDMANU1 → P63SPOT3/4: LR antenna position check (taken as already in
  // position 1 — the V50N25 00500 prompt is not modelled), SETPOS1, and
  // "OFF TO SEE THE WIZARD..." — BURNBABY.
  r60End() {
    this.cancel('R60MANU');
    this.stage = 'burnbaby';
    this.burn.arm(this.agc.erasable.TIG);
  }

  terminate() {
    this.burn.stopClok();
  }

  // A software restart while in the pre-ignition dialog: group 4 (4.24)
  // brings back the current step's display.
  redoStage() {
    if (this.stage === 'v06n61' || this.stage === 'burnbaby' || this.stage === 'pooh') return;
    if (this.stage === 'r51') this.r51();
    else if (this.stage === 'r60' || this.stage === 'r60-maneuver') this.r60();
    else if (this.stage === 'p63lm') this.job('P63LM', { ...JOBS.P63LM, anchor: 'p63.ignalg', onDone: (t) => this.ignalgDone(t) });
  }

  // ---------- initial entry in mid-flight (scenarios, presets) ----------

  restoreAt(t, mode) {
    const A = APOLLO11_LANDING;
    const tig = this.chooseTig(t, { strict: true });
    this.flagOrgy();
    this.agc.erasable.TIG = tig;
    this.agc.erasable.OUTOFPLN = 0;
    this.agc.erasable.DELTAH = 99999;
    const incorporated = !!this.agc.flags.LRINH;
    this.nav.reset();
    this.nav.arm({ tig, at: t, incorporated });
    this.stage = 'burnbaby';
    this.burn.restoreAt(t, tig);
    if (t < tig) {
      this.setPhase('prePDI');
      return;
    }
    // Ignited (Apollo 11: on time).
    this.cmd.engineOn = true;
    this.cmd.throttle = 0;
    this.cmd.ullage = this.burn.flags.ULLAGE;
    if (t < tig + BURN_TIMING.ZOOMTIME) {
      this.mode = 63;
      this.setPhase(this.lrLocked() ? 'P63-LR' : 'P63-preLR');
      return;
    }
    this.connected = true;
    this.tZoom = tig + BURN_TIMING.ZOOMTIME;
    this.cmd.throttle = DPS.ftpFraction;
    this.nav.pastHighGate = mode >= 64;
    if (mode === 63) {
      this.phaseName = 'braking';
      this.setPhase(this.lrLocked() ? 'P63-LR' : 'P63-preLR');
      if (this.guidance) this.guidance.start({ t, phase: 'braking' });
    } else if (mode === 64 || mode === 65) {
      this.phaseName = mode === 64 ? 'approach' : 'vertical';
      this.tP64 = this.kind === 'replay' && t >= A.p64 ? A.p64 : t;
      this.redFlag = this.kind === 'replay' && t >= A.p64Proceed;
      this.agc.flags.REDFLAG = this.redFlag;
      this.setPhase('P64');
      if (this.guidance) {
        this.guidance.start({ t, phase: mode === 64 ? 'approach' : 'vertical', ttfGuess: -BRAKING_TARGETS.tend });
        if (mode === 64) {
          // As if STARTP64 had run: the first pass must not start P64 again.
          this.guidance.s.ttf += APPROACH_TARGETS.deltaTtf;
          this.guidance.s.flPass0 = 1;
          this.guidance.s.program = 64;
          this.guidance.s.redFlag = this.redFlag;
        }
      }
    } else if (mode === 66) {
      this.phaseName = 'rod';
      this.tP66 = t;
      this.tP64 = this.kind === 'replay' ? A.p64 : null;
      if (this.crew.pgnsMode !== 'attHold') this.crew.pgnsMode = 'attHold';
      this.setPhase('P66');
      this.nav.servicerPass(t);
      this.vdgVert = this.nav.altRate;
      if (this.guidance) this.guidance.startP66(this.nav.guidanceNav(), t);
      this.cmd.throttle = this.hoverThrottle();
    }
    this.mode = mode;
  }

  lrLocked() {
    return !!this.agc.vehicle?.state?.lr?.altValid;
  }

  hoverThrottle() {
    const s = this.agc.vehicle?.state || {};
    const m = Number.isFinite(s.mass) ? s.mass : 8000;
    return (m * 1.62) / DPS.ratedThrust;
  }

  // ---------- BurnBaby host callbacks ----------

  onCountdown(t) {
    this.nav.refresh(t);
  }

  onAverageG() {}

  engineOn() {
    const s = this.agc.vehicle?.state;
    if (s && typeof s.engineOn === 'boolean' && this.kind !== 'static') return s.engineOn && !this.engineStopped;
    return this.burn.flags.ENGONFLG && !this.engineStopped;
  }

  // IGNITION → P63IGN: V06N63 each pass (AVGEXIT = P63DISPS −2), workload
  // in the powered braking phase.
  onIgnition(t) {
    this.cmd.engineOn = true;
    this.cmd.throttle = 0;                // ENGINOF3 left THRUST at minimum
    this.agc.erasable.WCHPHASE = 0;
    this.setPhase(this.lrLocked() ? 'P63-LR' : 'P63-preLR');
    this.stage = 'trim';
  }

  // P63ZOOM: AVEGEXIT = LUNLAND, FLATOUT (THROTTLE_CONTROL_ROUTINES.agc:191-198).
  onZoom(t) {
    this.connected = true;
    this.tZoom = t;
    this.phaseName = 'braking';
    this.stage = 'braking';
    this.cmd.throttle = DPS.ftpFraction;
    if (this.guidance) this.guidance.start({ t, phase: 'braking' });
  }

  // ---------- per substep ----------

  step(t) {
    const s = this.agc.vehicle?.state || {};
    this.cmd.ullage = this.burn.flags.ULLAGE;
    if (this.agc.crew.engineStop && !this.engineStopped) this.engineStopped = true;
    // Replay: high gate at its historical time (MR Table 5-I).
    if (this.kind === 'replay' && this.mode === 63 && this.connected && t >= APOLLO11_LANDING.p64) this.startP64(t);
    if (s.landed && this.landedAt === null) this.landedAt = t;
    if (this.physics) {
      // Stand-ins for the commander (not AGC code; ARCHITECTURE §11.3 has no
      // hand controller): in P66 the attitude nulls the horizontal velocity
      // (landing-guidance.js p66AttitudeAssist); after touchdown ENGINE STOP.
      const assist = this.agc.options?.crewAssist !== false;
      if (assist && (this.mode === 66) && !s.landed) {
        this.cmd.thrustDir = null;
        this.cmd.pitch = p66AttitudeAssist({ vHoriz: s.vHoriz || 0, gravity: 1.62 });
      }
      if (assist && this.landedAt !== null && !this.engineStopped && t - this.landedAt >= CREW_ENGINE_STOP_S) {
        this.engineStopped = true;
        this.agc.crew.engineStop = true;
      }
    }
  }

  vehicleCommands() {
    const c = this.cmd;
    c.engineOn = this.burn.flags.ENGONFLG && !this.engineStopped && !this.agc.crew.engineStop;
    c.rod = this.agc.erasable.RODCOUNT || 0;
    return c;
  }

  // ---------- the SERVICER pass ----------

  onServicerPass(t) {
    if (!this.active) return;
    const dtPass = this.lastPass === null ? 2 : t - this.lastPass;
    this.lastPass = t;
    this.nav.servicerPass(t);
    if (this.mode === 63 && this.agc.workload?.phase === 'P63-preLR' && this.lrLocked()) this.setPhase('P63-LR');
    if (!this.burn.flags.ENGONFLG) return;             // SERVEXIT
    if (!this.connected) {                             // P63DISPS −2
      this.show(6, 63, { source: 'p63.disps' });
      return;
    }
    this.lunland(t, dtPass);
  }

  // LUNLAND (LLGE:117-121) → GUILDENSTERN → guidance → DISPEXIT.
  lunland(t, dtPass) {
    const e = this.agc.erasable;
    // GUILDENSTERN (R13, LLGE:134-216). Manual throttle (P67) is not
    // modelled: the throttle switch is always AUTO.
    if (this.mode !== 66) {
      if (this.crew.pgnsMode === 'attHold') {
        if ((e.RODCOUNT || 0) !== 0) {
          this.startP66(t);
          return;
        }
      } else {
        e.RODCOUNT = 0;                                // GUILDRET: clicks discarded
      }
    } else {
      this.rodComp(t);
      return;
    }
    if (this.physics) this.guidePhysics(t);
    else this.guideReplay(t, dtPass);
    this.dispexit();
  }

  // Guidance on the physics LM (landing-guidance.js LandingGuidance.pass).
  guidePhysics(t) {
    const g = this.guidance;
    if (!g.s) g.start({ t, phase: 'braking' });
    const s = this.agc.vehicle?.state || {};
    const out = g.pass(this.nav.guidanceNav({ measuredAccel: s.mass > 0 ? (s.thrust || 0) / s.mass : undefined }), t);
    this.lastOut = out;
    if (out.alarm) this.agc.alarm(out.alarm);           // 1406: bad TTF root
    if (out.newProgram === 64 && this.mode === 63) this.startP64(t, { fromGuidance: true });
    else if (out.newProgram === 65 && this.mode !== 65) this.startP65(t);
    this.ttf = out.ttf;
    this.redFlag = out.redFlag;
    this.tredes = out.display.TREDES;
    this.lookAngle = out.display.LOOKANGL;
    this.siteShift = out.siteShift;
    if (out.throttle !== null && !this.engineStopped) {
      this.cmd.throttle = out.throttle;
      // ATT HOLD: FINDCDUW does STOPRATE — no attitude commands
      // (FINDCDUW--GUIDAP_INTERFACE.agc:28-96); the LM holds attitude.
      this.cmd.thrustDir = this.crew.pgnsMode === 'attHold' ? null : out.thrustDir;
      this.cmd.pitch = undefined;
    }
    this.cmd.lpd = { ...out.siteShift };
    const d = out.display;
    const e = this.agc.erasable;
    e.TTFDISP = d.TTFDISP;
    e.RANGEDSP = d.RANGEDSP / NMI;
    e.VHORIZ = toFps(d.VHORIZ);
    this.publishLpd();
  }

  // Replay / static: the guidance quantities from the replayed state and
  // the historical phase times.
  guideReplay(t) {
    const A = APOLLO11_LANDING;
    const tig = this.burn.tigNominal ?? A.tig;
    const tP64 = this.tP64 ?? (this.kind === 'replay' ? A.p64 : tig + (A.p64 - A.tig));
    if (this.mode === 63) {
      // P63 ends when TTF > −TENDBRAK (EXTLOGIC, LLGE:692-709).
      this.ttf = (t - tP64) - BRAKING_TARGETS.tend;
    } else {
      // STARTP64: TTF/8 += DELTTFAP (−110 s) from −62 s (LLGE:260-263).
      this.ttf = -BRAKING_TARGETS.tend + APPROACH_TARGETS.deltaTtf + (t - tP64);
    }
    this.tredes = this.mode === 64 ? tredes(this.ttf) : 0;
    const nav = this.nav;
    if (Number.isFinite(nav.pitch)) {
      const geo = toGuidanceFrame(nav.guidanceNav());
      this.lookAngle = Math.floor(lookAngle({ rg: geo.rg, bodyX: thrustDirFromPitch(nav.pitch, geo.phi) }) + 0.5);
    } else {
      this.lookAngle = null;
    }
    const s = this.agc.vehicle?.state || {};
    if (Number.isFinite(s.throttle)) this.cmd.throttle = s.throttle;
    this.agc.erasable.TTFDISP = this.ttf;
    this.publishLpd();
  }

  publishLpd() {
    const e = this.agc.erasable;
    e.TREDES = this.tredes;
    e.LPDTIME = this.tredes;
    e.LOOKANGL = this.lookAngle;
    e.LPDANGLE = this.lookAngle;
  }

  // DISPEXIT (LLGE:835-890): WHATDISP of the phase.
  dispexit() {
    if (this.mode === 63) this.show(6, 63, { source: 'p63.disps' });
    else if (this.mode === 64) this.p64Disps();
    else this.show(6, 60, { source: 'p66.vertdisp' });
  }

  // P64DISPS (LLGE:856-886).
  p64Disps() {
    if (this.tredes === 0 && this.redFlag) {
      this.redFlag = false;                               // RED-OVER
      this.agc.flags.REDFLAG = false;
      if (this.guidance?.s) this.guidance.s.redFlag = false;
    }
    if (this.redFlag || this.tredes === 0) {
      this.show(6, 64, { source: 'p64.disps' });            // REDES-OK
      return;
    }
    this.flash(6, 64, {
      terminate: () => this.goToPooh(),
      proceed: () => this.p64Ceed(),
      enter: () => this.p64Disps(),
    }, { id: 'P64DISPS', source: 'p64.disps' });
  }

  // P64CEED (LLGE:874-881): ELINCR1 = AZINCR1 = 0, REDFLAG set.
  p64Ceed() {
    this.redFlag = true;
    this.agc.flags.REDFLAG = true;
    this.lpdClicks = { el: 0, az: 0 };
    this.guidance?.proceedP64();
  }

  // STARTP64 (LLGE:260-268): PROG 64, approach targets, RUPT10 on, REDFLAG off.
  startP64(t) {
    if (this.mode >= 64) return;
    this.mode = 64;
    this.tP64 = t;
    this.phaseName = 'approach';
    this.stage = 'approach';
    this.redFlag = false;
    this.agc.flags.REDFLAG = false;
    this.agc.erasable.WCHPHASE = 1;
    this.nav.pastHighGate = true;                         // PSTHIGAT (HIGATASK)
    this.agc.startProgram(64);
    this.setPhase('P64');
    if (!this.physics) {
      this.guideReplay(t);
      this.p64Disps();
    }
  }

  // P65START (LLGE:252-258).
  startP65(t) {
    this.mode = 65;
    this.phaseName = 'vertical';
    this.stage = 'vertical';
    this.redFlag = false;
    this.agc.flags.REDFLAG = false;
    this.agc.erasable.WCHPHASE = 2;
    this.agc.startProgram(65);
  }

  // STARTP66 (LLGE:143-185): VDGVERT = HDOTDISP; then VERTGUID → P66VERT
  // → P66VERTA (kill group 3, RODTASK in 1 s) → RODCOMP right away.
  startP66(t) {
    this.mode = 66;
    this.tP66 = t;
    this.phaseName = 'rod';
    this.stage = 'rod';
    this.redFlag = false;
    this.agc.flags.REDFLAG = false;
    this.agc.erasable.WCHPHASE = 2;
    this.vdgVert = this.nav.altRate;
    if (this.guidance) this.guidance.startP66(this.nav.guidanceNav(), t);
    this.agc.startProgram(66);
    this.setPhase('P66');
    this.rodComp(t);
  }

  // RODCOMP (LLGE:948-1113): fold in the ROD clicks (1 ft/s each, RODSCALE),
  // extrapolate ḣ and h, throttle for the desired altitude rate, V06N60.
  // Runs inline in the guidance pass and as the RODCOMP job every second.
  rodComp(t) {
    if (this.mode !== 66) return;
    const e = this.agc.erasable;
    const clicks = e.RODCOUNT || 0;
    e.RODCOUNT = 0;
    if (this.vdgVert === null) this.vdgVert = this.nav.altRate;
    this.vdgVert += clicks * GUIDANCE_PARAMS.rodScale;
    this.nav.refresh?.(t);
    if (this.physics && this.guidance?.s?.rod) {
      const s = this.agc.vehicle?.state || {};
      const out = this.guidance.rodPass(this.nav.guidanceNav({ measuredAccel: s.mass > 0 ? (s.thrust || 0) / s.mass : undefined }), t, clicks);
      this.guidance.s.vdgVert = this.vdgVert;
      if (!this.engineStopped) this.cmd.throttle = out.throttle;
      this.lastOut = out;
    }
    e.VDGVERT = toFps(this.vdgVert);
    this.show(6, 60, { source: 'p66.vertdisp' });
  }

  // ---------- crew inputs ----------

  // LPD hand-controller clicks: PITFALL ignores them unless MODREG = 64;
  // COUNT'EM skips them in ATT HOLD (LLGE:1134-1136, :1174-1177); REDESIG
  // uses them only with REDFLAG set and TREDES > 0 (LLGE:335-342).
  lpd({ dx = 0, dy = 0 } = {}) {
    if (this.mode !== 64) return false;
    if (this.crew.pgnsMode === 'attHold') return false;
    if (!this.redFlag || this.tredes <= 0) return false;
    this.lpdClicks.el += dy;
    this.lpdClicks.az += dx;
    this.guidance?.addLpdClicks({ el: dy, az: dx });
    return true;
  }

  // ---------- restart, exit ----------

  // After a software restart (agc 'restart'): GOPROG3 clears RODFLAG, so P66
  // "WILL RE-INITIALIZE ITSELF AND CONTINUE" (STRTP66A keeps VDGVERT —
  // FRESH_START_AND_RESTART.agc:315-317, LLGE:210-216); every ignition task
  // still to come is put back (the ZOOM's 3.3 phase may have been
  // overwritten by the guidance's own group-3 protection in the load model).
  onRestart(t) {
    this.forgetTasks();
    this.burn.reenter(t);
    if (this.stage === 'r60-maneuver') this.r60();
  }

  teardown() {
    this.cancelAll();
    for (const g of [1, 3, 4, 6]) this.unprotect(g);
    this.router.clear();
    this.cmd.engineOn = false;
    this.active = false;
  }

  // ---------- snapshots ----------

  guidanceSnapshot() {
    if (!this.burn.flags.ENGONFLG || !this.connected) return null;
    const out = this.lastOut;
    const s = this.agc.vehicle?.state || {};
    return {
      phase: this.phaseName,
      program: this.mode,
      ttg: this.ttf,
      throttleCmd: this.physics ? this.cmd.throttle : (Number.isFinite(s.throttle) ? s.throttle : null),
      throttleMode: out?.throttleMode ?? null,
      pitchCmd: this.physics ? (out?.pitchCmd ?? this.cmd.pitch ?? null) : (Number.isFinite(s.pitch) ? s.pitch : null),
      lpd: { angle: this.lookAngle, time: this.tredes, redesignation: this.redFlag },
      vdgVert: this.vdgVert,
      siteShift: { ...this.siteShift },
      attitude: this.crew.pgnsMode === 'attHold' ? 'hold' : 'auto',
      model: this.physics ? 'guidance law (physics LM)' : 'derived from the replayed trajectory',
    };
  }

  snapshot() {
    return {
      stage: this.stage,
      mode: this.mode,
      connected: this.connected,
      phase: this.phaseName,
      ttf: this.ttf,
      redFlag: this.redFlag,
      tredes: this.tredes,
      lookAngle: this.lookAngle,
      vdgVert: this.vdgVert,
      tP64: this.tP64,
      tP66: this.tP66,
      engineStopped: this.engineStopped,
      landedAt: this.landedAt,
      kind: this.kind,
    };
  }
}

// ---------- the major-mode programs P63-P66 (views of LunarLanding) ----------

export class LandingMode extends LmProgram {
  enter({ initial = false } = {}) {
    super.enter();
    const agc = this.agc;
    const n = this.constructor.number;
    let L = agc.landing;
    if (initial || !L || !L.active || (n === 63 && !initial)) {
      if (L && L.active) L.teardown();
      L = new LunarLanding(agc);
      agc.landing = L;
      this.landing = L;
      L.begin(n, { initial: initial || n !== 63 });
    } else {
      this.landing = L;
      L.mode = n;
    }
  }

  exit({ next = null } = {}) {
    super.exit();
    const L = this.landing;
    if (L && !LANDING_MODES.includes(next)) {
      L.teardown();
      if (this.agc.landing === L) this.agc.landing = null;
    }
  }

  step(t, dt) { this.landing?.step(t, dt); }
  onServicerPass(t) { this.landing?.onServicerPass(t); }
  onRodcomp(t) { this.landing?.rodComp(t); }
  onRestart(t) { this.landing?.onRestart(t); }
  vehicleCommands() { return this.landing ? this.landing.vehicleCommands() : null; }
  onProceed() { return this.landing ? this.landing.onProceed() : false; }
  onTerminate() { return this.landing ? this.landing.onTerminate() : false; }
  onEnter() { return this.landing ? this.landing.onEnter() : false; }
  onRecycle() { return this.landing ? this.landing.onRecycle() : false; }
  onCrewInput(name, value) {
    if (name === 'lpd') return this.landing?.lpd(value || {});
    return false;
  }

  get burn() { return this.landing ? this.landing.burn : null; }
  burnSnapshot() { return this.landing ? this.landing.burn.snapshot() : null; }
  guidanceSnapshot() { return this.landing ? this.landing.guidanceSnapshot() : null; }
  snapshot() { return this.landing ? this.landing.snapshot() : { stage: null }; }
}
