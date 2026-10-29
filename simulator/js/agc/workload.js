// Workload: which recurring jobs, tasks and interrupt loads exist in each
// phase of flight, and what they cost. It drives the Executive model
// (executive.js) so that the 1201/1202 alarms of Apollo 11 *emerge* from
// load, priorities and the core-set/VAC pools rather than being scripted.
//
// What runs (Luminary099 unless noted; research src-executive §6):
// - READACCS, a Waitlist task every 2 s (SERVICER.agc:72-74, :79-139), reads
//   the PIPAs and creates the SERVICER job: CA PRIO20 / TC FINDVAC
//   (:97-100). SERVICER = Average-G navigation (+ landing-radar
//   processing) followed, through AVGEXIT, by the landing guidance
//   (LUNLAND, LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:117), throttle and
//   attitude commands, and the guidance display request at DISPEXIT
//   (:835-854). It is the lowest-priority recurring job and the longest, so
//   when time runs short it is SERVICER that has not finished when the next
//   READACCS creates another copy (Eyles; MR §16.2.5 "open loop").
// - The guidance display: REGODSPR -> GODSPRS1 creates MAKEPLAY at the
//   *user's* priority, NOVAC — or SPVAC (with a VAC area) when the display
//   is a flashing one (DISPLAY_INTERFACE_ROUTINES.agc:833-856); MAKEPLAY
//   raises itself to PRIO33 when it starts (:742-747). A flashing display
//   job then sleeps in ENDIDLE awaiting the crew; later passes find someone
//   in ENDIDLE and just end (:1185-1189).
// - R10,R11 landing analog displays: a task every 0.25 s, 8 per READACCS
//   cycle; the 8th pass is LRHTASK, which creates LRHJOB (PRIO32 NOVAC)
//   ~50 ms before the next READACCS (P70-P71.agc:36-49, SERVICER.agc:
//   664-687). LRHJOB sleeps ~95 ms holding its core set (:1533-1536);
//   LRVJOB (PRIO32 NOVAC, created by READV in SERVICER below 2000 ft/s)
//   sleeps ~500 ms (:1389-1392, :1471-1483).
// - The V16 monitor: MONREQ task every 1 s -> MONDO, NOVAC at CHRPRIO (30)
//   (PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:2373-2395).
// - 1/GYRO gyro torquing, PRIO21 NOVAC, from the IMU compensation inside
//   SERVICER (IMU_COMPENSATION_PACKAGE.agc:107-110).
// - P66: RODTASK every 1 s -> RODCOMP, PRIO22 FINDVAC
//   (LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:934-946).
// - HIGATJOB (PRIO32 FINDVAC) repositions the LR antenna near high gate
//   and sleeps until it has moved (SERVICER.agc:1611-1628, :695-712).
// - Interrupt-level load: T4RUPT (display/lamp relays, every 20 ms), the
//   DAP (T5RUPT/T6RUPT), DOWNRUPT (telemetry), ordinary counter increments
//   (PIPAs, IMU CDUs, clocks), Waitlist tasks — modelled as continuous
//   fractions plus per-task costs.
// - The rendezvous-radar CDU fault: cycle stealing, setRrFault(true).
//
// Restart protection is registered exactly where the source does it, so a
// software restart re-creates only what the phase tables say:
//   group 5: READACCS rhythm (REREADAC) and, during the navigation part of
//            a pass, the SERVICER job (SERVICER.agc:175-179: OCT 16035 =
//            5.3 + job GETABVAL at PRIO20); right after READACCS 5.4
//            (REREADAC + SERVICER, RESTART_TABLES.agc:257-263);
//   group 3: during the guidance part, the guidance as a PRIO21 FINDVAC job
//            restarting at GUILDEN ("PROTECT GUIDANCE WITH PRIO 21 JUST
//            HIGHER THAN SERVICER'S PRIORITY", LUNAR_LANDING_GUIDANCE_
//            EQUATIONS.agc:117-121), killed at DISPEXIT (:835-837);
//   group 2: the R10,R11 task chain (2.21SPOT, RESTART_TABLES.agc:155-157).
// Everything else — older SERVICER copies, the monitor, display jobs, LR
// read jobs — is simply gone after the restart (research src-executive
// §5.8, web-1202-b §2.2).
//
// COST NUMBERS ARE MODEL CALIBRATION, NOT MEASUREMENTS. No source gives the
// CPU time of individual jobs. They were chosen so that the duty-cycle
// margins match Eyles' figures (research web-1202-b §1.3): P63 before
// landing-radar data "over 15%", after LR acquisition "perhaps 13%", with
// V16N68 "10% or less", P64 "less than 10%", P66 lighter; and so that, with
// the RR CDU stealing ~13%, the Apollo 11 behaviour emerges (see
// test/executive.test.mjs "calibration report"). Tune through
// `workload.params` (deep-copied per instance, safe to edit).

// ------------------------------------------------------------------ RR CDU

// Rendezvous-radar CDU cycle stealing (MR §16.2.5, Eyles; research
// web-1202-b §1.2). With the RR mode switch in SLEW or AUTO, the RR shaft
// and trunnion CDUs counted continuously at up to 6400 pulses/s each; every
// pulse is a PINC/MINC that takes one memory cycle (11.72 us):
//   2 x 6400 /s x 11.72 us = 0.150  -> 15.0 % (theoretical maximum)
// The CDUs did not always count at the maximum rate: Grumman's worst-case
// test measured 13.36 %, and MIT assumed ~13 % at the time. Default 13 %.
export const RR_CDU = Object.freeze({
  pulsesPerSecondPerCdu: 6400,
  cdus: 2,
  memoryCycleS: 11.72e-6,
  theoreticalMax: 2 * 6400 * 11.72e-6, // 0.150
  grummanMeasuredMax: 0.1336,
  mitAssumed: 0.13,
});

export const PHASES = Object.freeze([
  'idle', 'prePDI', 'P63-preLR', 'P63-LR', 'P64', 'P66', 'landed', 'cmIdle', 'cmBurn', 'cmEntry',
]);

// Interrupt-level loads (fractions of the CPU). Calibration, see above.
const LM_COAST = { T4RUPT: 0.03, 'T5RUPT (DAP)': 0.05, T6RUPT: 0.005, DOWNRUPT: 0.02, counters: 0.01 };
const LM_POWERED = { T4RUPT: 0.03, 'T5RUPT (DAP)': 0.105, T6RUPT: 0.01, DOWNRUPT: 0.02, counters: 0.015 };
const LM_SURFACE = { T4RUPT: 0.03, DOWNRUPT: 0.02, counters: 0.01 };
const CM_COAST = { T4RUPT: 0.03, 'T5RUPT (DAP)': 0.05, T6RUPT: 0.005, DOWNRUPT: 0.02, counters: 0.01 };
const CM_TVC = { T4RUPT: 0.03, 'T5RUPT (TVC DAP)': 0.14, DOWNRUPT: 0.02, counters: 0.015 };
const CM_ENTRY = { T4RUPT: 0.03, 'T5RUPT (DAP)': 0.08, T6RUPT: 0.01, DOWNRUPT: 0.02, counters: 0.015 };

export const DEFAULT_PARAMS = Object.freeze({
  cycleS: 2.0,                     // 2SECS DEC 200 (FIXED_FIXED_CONSTANT_POOL.agc:117)
  rrCduSteal: RR_CDU.mitAssumed,   // fraction stolen while the RR fault is on
  // Waitlist task costs (ms of interrupt-level CPU per execution).
  tasks: {
    readaccsMs: 3.0,     // PIPASR, phase changes, FINDVAC SERVICER
    r10r11Ms: 2.4,       // landing analog displays, 4 per second
    r10r11PeriodS: 0.25, // OCT31 = 25 cs (P70-P71.agc:47)
    r10r11FirstS: 0.20,  // OCT24 = 20 cs (SERVICER.agc:129)
    lrhTaskMs: 0.6,
    monreqMs: 0.4,
    rodtaskMs: 0.4,
  },
  // Job costs (ms of CPU) and sleeps.
  jobs: {
    makeplayMs: 30,       // one 3-register decimal display
    flashWakeMs: 3,       // flashing display job after the crew responds
    mondoMs: 35,          // V16N68: three registers incl. min/sec, once a second
    gyroMs: 3,            // 1/GYRO
    lrhWorkMs: [2, 2],    // LRHJOB before/after its sleep
    lrhSleepMs: 95,       // "LRHJOB TO SLEEP ABOUT 95MS"
    lrvWorkMs: [3, 4],
    lrvSleepMs: 500,      // "PUT LRVJOB TO SLEEP ABOUT 500 MS"
    rodcompMs: 30,
    normlizeMs: 40,
    lastbiasMs: 8,
    higateWorkMs: [3, 25],
    higateSleepMs: 5000,  // until the antenna reaches position 2 (simplified)
    charinMs: 5,          // per keystroke (for callers that want a default)
  },
  // Per-phase configuration. navMs/guidMs: the two parts of one SERVICER
  // pass. lrConvMs: LR data conversion while LR reads are on (P63-LR+).
  // lrIncorpMs: extra when the AGC incorporates LR data (V57 permitted).
  phases: {
    idle: { avgG: false, interrupts: LM_COAST },
    prePDI: { avgG: 'keep', navMs: 520, guidMs: 0, display: false, interrupts: LM_COAST },
    'P63-preLR': {
      avgG: true, navMs: 520, guidMs: 734, display: true, r10: true, gyro: true,
      lrAlt: false, lrVel: false, interrupts: LM_POWERED,
    },
    'P63-LR': {
      avgG: true, navMs: 520, guidMs: 734, display: true, r10: true, gyro: true,
      lrAlt: true, lrVel: 'auto', lrConvMs: 56, lrIncorpMs: 10, interrupts: LM_POWERED,
    },
    P64: {
      avgG: true, navMs: 520, guidMs: 777, display: true, flashable: true, r10: true, gyro: true,
      lrAlt: true, lrVel: true, lrConvMs: 56, lrIncorpMs: 10, lpdMs: 60, attHoldSavingMs: 80,
      higate: true, interrupts: LM_POWERED,
    },
    P66: {
      avgG: true, navMs: 520, guidMs: 300, display: true, r10: true, gyro: true, rod: true,
      lrAlt: true, lrVel: true, lrConvMs: 56, lrIncorpMs: 10, interrupts: LM_POWERED,
    },
    landed: { avgG: false, interrupts: LM_SURFACE },
    cmIdle: { avgG: false, interrupts: CM_COAST },
    cmBurn: { avgG: true, navMs: 480, guidMs: 260, display: true, interrupts: CM_TVC },
    cmEntry: { avgG: true, navMs: 480, guidMs: 420, display: true, interrupts: CM_ENTRY },
  },
});

const FT = 0.3048;

export class Workload {
  constructor(agc, { params } = {}) {
    this.agc = agc;
    this.params = deepMerge(clone(DEFAULT_PARAMS), params || {});
    this.phase = 'idle';
    this.monitorOverride = null;   // setMonitor(bool)
    this.flashOverride = null;     // setDisplayFlashing(bool)
    this.lrIncorpOverride = null;  // setLrIncorporation(bool)
    this.attHoldOverride = null;   // setAttHold(bool)
    this.rrFault = false;
    this.averageG = false;
    this.passes = 0;
    this.lastPassT = null;
    this.tbase5 = null;            // time of the last READACCS (TBASE5)
    this.readaccsTask = null;
    this.r10Task = null;
    this.r10Ctr = 0;               // PIPCTR
    this.rodTask = null;
    this.monreqTask = null;
    this.flashJob = null;
    this.higateDone = false;
    this.g5 = null;                // { phase, servicer }
    this.g3 = false;
    this._wired = false;
    this._wire();
    this._applyInterrupts();
  }

  // Connect the executive to the Agc where the Agc has not done so: the
  // clock, COMP ACTY and the BAILOUT path. Harmless when already wired.
  _wire() {
    const { agc } = this;
    const exec = agc.exec;
    if (!exec || this._wired) return;
    this._wired = true;
    if (!exec.timeSource) {
      exec.timeSource = () => (typeof agc.t === 'number' ? agc.t : null);
      if (typeof agc.t === 'number' && exec.t < agc.t) exec.t = agc.t;
    }
    if (!exec.dsky && agc.dsky) exec.dsky = agc.dsky;
    if (typeof exec.onOverflow !== 'function') {
      exec.onOverflow = (code) => {
        if (typeof agc.bailout === 'function') agc.bailout(code);
        else if (agc.restart && typeof agc.restart.software === 'function') agc.restart.software(code);
      };
    }
  }

  get exec() {
    return this.agc.exec;
  }

  get cfg() {
    return this.params.phases[this.phase] || this.params.phases.idle;
  }

  // ------------------------------------------------------------- controls

  setPhase(name) {
    if (!this.params.phases[name]) {
      throw new Error(`Unknown workload phase "${name}" (known: ${Object.keys(this.params.phases).join(', ')})`);
    }
    const prev = this.phase;
    this.phase = name;
    const cfg = this.cfg;
    this._applyInterrupts();
    if (cfg.avgG === true && !this.averageG) this.startAverageG();
    if (cfg.avgG === false && this.averageG) this.stopAverageG();
    if (!cfg.r10) this._stopR10();
    if (cfg.rod) this._startRod();
    else this._stopRod();
    if (cfg.higate && !this.higateDone && prev !== name) this._higate();
    this._syncMonitor();
  }

  // Crew V16 monitor. Normally derived from PINBALL (see _monitorWanted);
  // calling this overrides the derivation (null restores it).
  setMonitor(on) {
    this.monitorOverride = on === null || on === undefined ? null : !!on;
    this._syncMonitor();
  }

  // Rendezvous-radar CDU fault (RR mode switch not in LGC): cycle stealing.
  setRrFault(on) {
    this.rrFault = !!on;
    this._applySteal();
  }

  // Force the guidance display to be treated as flashing (true), static
  // (false) or derived from the DSKY's flashing V/N (null, default).
  setDisplayFlashing(on) {
    this.flashOverride = on === null || on === undefined ? null : !!on;
  }

  // PGNS mode control in ATT HOLD (true), AUTO (false) or derived from
  // agc.crew.pgnsMode (null, default).
  setAttHold(on) {
    this.attHoldOverride = on === null || on === undefined ? null : !!on;
  }

  // Force LR data incorporation on/off (null: derived from agc.nav).
  setLrIncorporation(on) {
    this.lrIncorpOverride = on === null || on === undefined ? null : !!on;
  }

  // PREREAD (SERVICER.agc:42-74): first Average-G pass. BurnBaby calls this
  // at TIG-30; powered phases start it themselves if it is not running.
  startAverageG() {
    const exec = this.exec;
    if (!exec || this.averageG) return;
    this.averageG = true;
    const j = this.params.jobs;
    exec.requestJob({ name: 'LASTBIAS', prio: 0o21, vac: false, workMs: j.lastbiasMs, source: 'workload', anchor: 'exec.job.servicer' });
    exec.requestJob({ name: 'NORMLIZE', prio: 0o22, vac: true, workMs: j.normlizeMs, source: 'workload', anchor: 'exec.job.servicer' });
    this.tbase5 = exec.now();
    this._setG5('5.2', true);
    this._scheduleReadaccs(this.params.cycleS);
  }

  // AVEGFLAG down -> AVGEND (SERVICER.agc:141-147, :350-379).
  stopAverageG() {
    this.averageG = false;
    if (this.readaccsTask) this.exec?.waitlist.cancel(this.readaccsTask);
    this.readaccsTask = null;
    this._stopR10();
    this.g5 = null;
    this.g3 = false;
    this.agc.restart?.clearIfOwner?.(5, 'workload');
    this.agc.restart?.clearIfOwner?.(3, 'workload');
  }

  // Called by RestartModel after the executive and waitlist were flushed
  // (before the groups are re-entered).
  onRestart() {
    this.readaccsTask = null;
    this.r10Task = null;
    this.rodTask = null;
    this.monreqTask = null;
    this.flashJob = null;
    // The crew's monitor is killed (MONSAVE zeroed); an explicit override
    // set through setMonitor() is dropped as well.
    if (this.monitorOverride) this.monitorOverride = null;
  }

  onFreshStart() {
    this.onRestart();
    this.averageG = false;
    this.g5 = null;
    this.g3 = false;
    this.monitorOverride = null;
    this.phase = 'idle';
    this._applyInterrupts();
  }

  // ------------------------------------------------------------- per step

  step(t, dt) {
    this._wire();
    if (!this.exec) return;
    this._syncMonitor();
    // A flashing display job sleeping in ENDIDLE wakes when the crew has
    // responded (the display is no longer flashing).
    if (this.flashJob && !this.flashJob.dead && this.flashJob.state === 'SLEEPING' && !this._flashing()) {
      this.exec.wake(this.flashJob);
      this.flashJob = null;
    }
  }

  // ---------------------------------------------------------- READACCS

  _scheduleReadaccs(delay, at = null) {
    const exec = this.exec;
    if (this.readaccsTask) exec.waitlist.cancel(this.readaccsTask);
    this.readaccsTask = exec.waitlist.add(delay, 'READACCS', (t) => this._readaccs(t), {
      costMs: this.params.tasks.readaccsMs, key: 'tasks', at,
    });
  }

  _readaccs(t) {
    const exec = this.exec;
    this.readaccsTask = null;
    if (!this.averageG) return;
    const cfg = this.cfg;
    // PIPSDONE: 5.5 (REDO5.5 = request SERVICER again and carry on).
    this._setG5('5.5', true);
    this._requestServicer(t);
    // MUNFLAG set and group 2 idle: start R10,R11 (SERVICER.agc:111-136).
    if (cfg.r10 && !this.r10Task && !this.agc.restart?.isProtected?.(2)) {
      this.r10Ctr = 7;
      this._protectR10();
      this.r10Task = exec.waitlist.add(this.params.tasks.r10r11FirstS, 'R10,R11', (tt) => this._r10(tt), {
        costMs: this.params.tasks.r10r11Ms, key: 'tasks',
      });
    }
    // MAKEACCS -> GOREADAX: 5.4 with TBASE5 = now, READACCS in 2 s.
    this.tbase5 = t;
    this._setG5('5.4', true);
    this._scheduleReadaccs(this.params.cycleS);
  }

  _requestServicer(t, { name = 'SERVICER', prio = 0o20, guidanceOnly = false } = {}) {
    const exec = this.exec;
    const cfg = this.cfg;
    const j = this.params.jobs;
    const steps = [];
    if (!guidanceOnly) {
      const navMs = (cfg.navMs || 0) + (cfg.lrAlt ? cfg.lrConvMs || 0 : 0) + (this._lrIncorporating() ? cfg.lrIncorpMs || 0 : 0);
      steps.push({
        workMs: navMs,
        label: 'Average-G',
        // SERVICER: TC PHASCHNG OCT 16035 (5.3 + job GETABVAL).
        onStart: (tt) => {
          this._setG5('5.3', true);
          if (cfg.gyro) exec.requestJob({ name: '1/GYRO', prio: 0o21, vac: false, workMs: j.gyroMs, source: 'workload', anchor: 'exec.job.gyro' });
        },
        // MUNRETRN chain: READV when velocity reads are on.
        onEnd: (tt) => {
          if (this._lrVelocity()) {
            exec.requestJob({
              name: 'LRVJOB', prio: 0o32, vac: false, source: 'workload', anchor: 'exec.job.lrvjob',
              steps: [{ workMs: j.lrvWorkMs[0] }, { sleepMs: j.lrvSleepMs }, { workMs: j.lrvWorkMs[1] }],
            });
          }
        },
      });
    }
    if ((cfg.guidMs || 0) > 0) {
      steps.push({
        workMs: this._guidanceMs(),
        label: 'guidance',
        // LUNLAND: 5.3 (PIPA task only) + group 3 = guidance job PRIO21.
        onStart: (tt, job) => {
          job.remainingMs = this._guidanceMs();
          this._setG5('5.3', false);
          this._setG3(true);
        },
      });
    }
    if (!steps.length) steps.push({ workMs: 0 });
    return exec.requestJob({
      name, prio, vac: true, steps, source: 'workload', group: 'servicer',
      restartGroup: guidanceOnly ? 3 : 5,
      anchor: guidanceOnly ? 'exec.job.guidance' : 'exec.job.servicer',
      label: guidanceOnly ? 'guidance (restarted at GUILDEN)' : 'Average-G + guidance',
      onDone: (tt, job) => this._passComplete(tt, job),
    });
  }

  // DISPEXIT (kill group 3) + display request + ENDOFJOB.
  _passComplete(t, job) {
    this._setG3(false);
    this._setG5('5.3', false);
    this.passes += 1;
    this.lastPassT = t;
    const program = this.agc.program;
    if (program && typeof program.onServicerPass === 'function') program.onServicerPass(t);
    if (this.cfg.display) this._requestDisplay(job.prio);
    if (this.cfg.rod && !this.rodTask) this._startRod();
  }

  _requestDisplay(userPrio) {
    const exec = this.exec;
    const j = this.params.jobs;
    const flashing = this._flashing();
    if (flashing) {
      // VACDSP -> SPVAC (DISPLAY_INTERFACE_ROUTINES.agc:850-856).
      const asleep = this.flashJob && !this.flashJob.dead;
      const job = exec.requestJob({
        name: 'MAKEPLAY', prio: userPrio, runPrio: 0o33, vac: true, source: 'workload', group: 'display',
        anchor: 'exec.job.makeplay', label: 'flashing display',
        steps: asleep ? [{ workMs: j.makeplayMs }] : [{ workMs: j.makeplayMs }, { sleep: true }, { workMs: j.flashWakeMs }],
      });
      if (job && !asleep) this.flashJob = job;
    } else {
      exec.requestJob({
        name: 'MAKEPLAY', prio: userPrio, runPrio: 0o33, vac: false, source: 'workload', group: 'display',
        anchor: 'exec.job.makeplay', workMs: j.makeplayMs,
      });
    }
  }

  // ------------------------------------------------------------ R10,R11

  _r10(t) {
    const exec = this.exec;
    this.r10Task = null;
    if (!this.averageG || !this.cfg.r10) return;
    if (this.r10Ctr > 0) {
      this.r10Ctr -= 1;
      this.r10Task = exec.waitlist.add(this.params.tasks.r10r11PeriodS, 'R10,R11', (tt) => this._r10(tt), {
        costMs: this.params.tasks.r10r11Ms, key: 'tasks',
      });
      return;
    }
    // Last pass: LRHTASK (SERVICER.agc:664-687): LR altitude read job,
    // then group 2 off until the next READACCS starts the chain again.
    exec.chargeInterrupt('tasks', this.params.tasks.lrhTaskMs);
    if (this.cfg.lrAlt) {
      const j = this.params.jobs;
      exec.requestJob({
        name: 'LRHJOB', prio: 0o32, vac: false, source: 'workload', anchor: 'exec.job.lrhjob',
        steps: [{ workMs: j.lrhWorkMs[0] }, { sleepMs: j.lrhSleepMs }, { workMs: j.lrhWorkMs[1] }],
      });
    }
    this.agc.restart?.clearIfOwner?.(2, 'workload');
  }

  _protectR10() {
    this.agc.restart?.protect?.(2, '2.21', (t) => {
      // 2.21SPOT: R10,R11 in DEC 25 cs; PIPCTR (PHSPRDT2) is erasable and survives.
      if (!this.averageG || !this.cfg.r10) return;
      this.r10Task = this.exec.waitlist.add(this.params.tasks.r10r11PeriodS, 'R10,R11', (tt) => this._r10(tt), {
        costMs: this.params.tasks.r10r11Ms, key: 'tasks',
      });
    }, { label: 'R10,R11 landing analog displays', anchor: 'exec.r10r11', owner: 'workload' });
  }

  _stopR10() {
    if (this.r10Task) this.exec?.waitlist.cancel(this.r10Task);
    this.r10Task = null;
    this.agc.restart?.clearIfOwner?.(2, 'workload');
  }

  // ---------------------------------------------------------------- P66

  _startRod() {
    if (this.rodTask || !this.exec) return;
    this.rodTask = this.exec.waitlist.add(1.0, 'RODTASK', (t) => this._rodtask(t), {
      costMs: this.params.tasks.rodtaskMs, key: 'tasks',
    });
  }

  _rodtask() {
    this.rodTask = null;
    if (!this.cfg.rod) return;
    this.exec.requestJob({
      name: 'RODCOMP', prio: 0o22, vac: true, workMs: this.params.jobs.rodcompMs, source: 'workload',
      anchor: 'exec.job.rodcomp',
    });
    this._startRod();
  }

  _stopRod() {
    if (this.rodTask) this.exec?.waitlist.cancel(this.rodTask);
    this.rodTask = null;
  }

  // ------------------------------------------------------------ HIGATJOB

  _higate() {
    this.higateDone = true;
    const j = this.params.jobs;
    this.exec?.requestJob({
      name: 'HIGATJOB', prio: 0o32, vac: true, source: 'workload', anchor: 'exec.job.higatjob',
      steps: [{ workMs: j.higateWorkMs[0] }, { sleepMs: j.higateSleepMs }, { workMs: j.higateWorkMs[1] }],
    });
  }

  // ------------------------------------------------------------ monitor

  _monitorWanted() {
    if (this.monitorOverride !== null) return this.monitorOverride;
    return false;
  }

  // MONREQ every 1 s while the monitor is wanted — unless PINBALL is
  // already creating MONDO jobs itself (then this would double the load).
  _syncMonitor() {
    const exec = this.exec;
    if (!exec) return;
    const want = this._monitorWanted();
    if (want && !this.monreqTask) {
      this.monreqTask = exec.waitlist.add(1.0, 'MONREQ', (t) => this._monreq(t), {
        costMs: this.params.tasks.monreqMs, key: 'tasks',
      });
    } else if (!want && this.monreqTask) {
      exec.waitlist.cancel(this.monreqTask);
      this.monreqTask = null;
    }
  }

  _monreq(t) {
    const exec = this.exec;
    this.monreqTask = null;
    if (!this._monitorWanted()) return;
    this.monreqTask = exec.waitlist.add(1.0, 'MONREQ', (tt) => this._monreq(tt), {
      costMs: this.params.tasks.monreqMs, key: 'tasks',
    });
    const ext = exec.lastRequest.get('MONDO');
    if (ext && ext.source !== 'workload' && t - ext.t < 1.5) return;
    exec.requestJob({
      name: 'MONDO', prio: 0o30, vac: false, workMs: this.params.jobs.mondoMs, source: 'workload',
      anchor: 'exec.job.mondo',
    });
  }

  // ------------------------------------------------------- derived state

  // CPU time of the guidance part of a pass. In P64 the landing-point
  // redesignation logic runs once the crew has answered the flashing
  // V06N64 with PRO (P64CEED sets REDFLAG, LUNAR_LANDING_GUIDANCE_
  // EQUATIONS.agc:856-884) — Eyles: P64 margin "less than 10%" with the
  // redesignation logic. In attitude hold the attitude commands are not
  // generated (RATESTOP: "ARE WE IN ATTITUDE-HOLD?", :810-814), which Eyles
  // credits with "forestalling the next alarm".
  _guidanceMs() {
    const cfg = this.cfg;
    let ms = cfg.guidMs || 0;
    if (cfg.lpdMs && cfg.flashable && !this._flashing()) ms += cfg.lpdMs;
    if (cfg.attHoldSavingMs && this._attHold()) ms -= cfg.attHoldSavingMs;
    return Math.max(0, ms);
  }

  _attHold() {
    if (this.attHoldOverride !== null) return this.attHoldOverride;
    const crew = this.agc.crew;
    return !!crew && crew.pgnsMode === 'attHold';
  }

  _flashing() {
    if (!this.cfg.flashable) return false;
    if (this.flashOverride !== null) return this.flashOverride;
    return !!this.agc.dsky?.flashVerbNoun;
  }

  _lrIncorporating() {
    if (this.lrIncorpOverride !== null) return this.lrIncorpOverride;
    return !!this.agc.nav?.lrIncorporating;
  }

  // VALTCHK: velocity reads below 2000 ft/s (SERVICER.agc:1375-1394).
  _lrVelocity() {
    const v = this.cfg.lrVel;
    if (v !== 'auto') return !!v;
    const nav = this.agc.nav;
    if (!nav) return false;
    const vh = Number(nav.vHoriz);
    const vz = Number(nav.altRate);
    if (!Number.isFinite(vh)) return false;
    const speed = Math.hypot(vh, Number.isFinite(vz) ? vz : 0);
    return speed < 2000 * FT;
  }

  // ------------------------------------------------------ restart groups

  _setG5(phase, servicer) {
    this.g5 = { phase, servicer };
    const label = servicer ? `${phase} REREADAC + SERVICER job` : `${phase} REREADAC (PIPA task)`;
    this.agc.restart?.protect?.(5, phase, (t) => this._reenter5(t), {
      label, anchor: 'restart.servicer', owner: 'workload',
    });
  }

  _setG3(on) {
    if (on === this.g3) return;
    this.g3 = on;
    const r = this.agc.restart;
    if (!r) return;
    if (on) {
      r.protect?.(3, '3.var', (t) => this._requestServicer(t, { name: 'GUIDANCE', prio: 0o21, guidanceOnly: true }), {
        label: 'guidance job PRIO21 at GUILDEN', anchor: 'restart.lunland', owner: 'workload',
      });
    } else {
      r.clearIfOwner?.(3, 'workload');
    }
  }

  // Group 5 after a restart: REREADAC at TBASE5 + 2 s (or right away when
  // that is past — FINDTIME, RESTARTS_ROUTINE.agc:120-137) and the SERVICER
  // job when the phase says so.
  _reenter5(t) {
    if (!this.averageG) return;
    const g = this.g5 || { phase: '5.3', servicer: false };
    this.g3 = false; // group 3 re-entry (if any) is handled by its own callback
    if (g.phase === '5.5') {
      // Restart inside READACCS: REDO5.5 requests SERVICER and re-arms
      // READACCS from now.
      this.tbase5 = t;
      this._setG5('5.4', true);
      this._scheduleReadaccs(this.params.cycleS);
      this._requestServicer(t);
      return;
    }
    const due = (this.tbase5 ?? t) + this.params.cycleS;
    if (due > t + 0.005) this._scheduleReadaccs(0, due);
    else this._scheduleReadaccs(0.01);
    if (g.servicer) this._requestServicer(t);
  }

  // ------------------------------------------------------------ helpers

  _applyInterrupts() {
    const exec = this.exec;
    if (!exec) return;
    exec.clearInterruptLoads();
    for (const [k, f] of Object.entries(this.cfg.interrupts || {})) exec.setInterruptLoad(k, f);
    this._applySteal();
  }

  _applySteal() {
    this.exec?.setSteal('rrCdu', this.rrFault ? this.params.rrCduSteal : 0);
  }

  // Expected duty-cycle margin (1 - load) of the current configuration
  // without stealing, from the parameters (a static estimate; the
  // Executive's measured load is in exec.snapshot().load).
  estimateMargin({
    phase = this.phase, monitor = this._monitorWanted(), lrIncorporating = this._lrIncorporating(), lrVel,
    flashing = this._flashing(), attHold = this._attHold(),
  } = {}) {
    return 1 - estimateLoad(this.params, phase, { monitor, lrIncorporating, lrVel, flashing, attHold });
  }

  snapshot() {
    return {
      phase: this.phase,
      averageG: this.averageG,
      monitor: this._monitorWanted(),
      rrFault: this.rrFault,
      steal: this.rrFault ? this.params.rrCduSteal : 0,
      flashing: this._flashing(),
      passes: this.passes,
      lastPassT: this.lastPassT,
      group5: this.g5 ? this.g5.phase : null,
      group3: this.g3,
      estimatedMargin: this.estimateMargin(),
    };
  }
}

// Static duty-cycle estimate for a phase (fraction of CPU, no stealing).
export function estimateLoad(params, phase, { monitor = false, lrIncorporating = false, lrVel, flashing = false, attHold = false } = {}) {
  const cfg = params.phases[phase];
  if (!cfg) throw new Error(`Unknown phase ${phase}`);
  const T = params.cycleS;
  const j = params.jobs;
  const k = params.tasks;
  let ms = 0;
  let load = Object.values(cfg.interrupts || {}).reduce((a, b) => a + b, 0);
  if (cfg.avgG) {
    ms += k.readaccsMs;
    let guid = cfg.guidMs || 0;
    if (cfg.lpdMs && cfg.flashable && !flashing) guid += cfg.lpdMs;
    if (cfg.attHoldSavingMs && attHold) guid -= cfg.attHoldSavingMs;
    ms += (cfg.navMs || 0) + Math.max(0, guid);
    if (flashing) ms += j.flashWakeMs / 10; // the sleeping display job's eventual wake-up (amortised)
    if (cfg.lrAlt) ms += cfg.lrConvMs || 0;
    if (lrIncorporating) ms += cfg.lrIncorpMs || 0;
    if (cfg.display) ms += j.makeplayMs;
    if (cfg.gyro) ms += j.gyroMs;
    if (cfg.r10) ms += 8 * k.r10r11Ms + k.lrhTaskMs;
    if (cfg.lrAlt) ms += j.lrhWorkMs[0] + j.lrhWorkMs[1];
    const vel = lrVel === undefined ? cfg.lrVel === true : lrVel;
    if (vel) ms += j.lrvWorkMs[0] + j.lrvWorkMs[1];
    if (cfg.rod) ms += 2 * (j.rodcompMs + k.rodtaskMs);
  }
  if (monitor) ms += T * (j.mondoMs + k.monreqMs);
  load += ms / (T * 1000);
  return load;
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function deepMerge(base, extra) {
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') deepMerge(base[k], v);
    else base[k] = v;
  }
  return base;
}
