// Agc — the composition root of the computer model (ARCHITECTURE §6.9).
//
// It wires together what the other modules model:
//   dsky      DskyState: what the display shows (dsky-state.js)
//   pinball   PINBALL GAME: keyboard and display software (pinball.js)
//   exec      the Executive and Waitlist, a time-budget model (executive.js)
//   workload  which recurring jobs/tasks/interrupt loads exist (workload.js)
//   restart   restart groups, software and hardware restarts (restart.js)
//   alarms    FAILREG and the alarm table (alarms.js)
//   nav       the AGC's navigated state, its estimate vs truth (nav.js)
//   program   the current major-mode program (programs/)
// and offers the surface the programs, PINBALL and the UI use: major mode,
// V37, keys, crew-station controls, erasable display quantities, flags,
// vehicle commands and the snapshot every view reads (§6.9.1).
//
// Wiring that matters for the 1202 story: the Executive's overflow (no
// core set / no VAC area) calls agc.bailout → RestartModel.software (the
// BAILOUT → ENEMA → GOPROG3 path), the Executive drives COMP ACTY, and
// SERVICER's completion (workload.js) calls program.onServicerPass, so
// guidance and displays run — or freeze — on the real 2-second rhythm.

import { createBus } from '../util/bus.js';
import { parseKeys } from '../util/keys.js';
import { parseGET } from '../util/time.js';
import { DskyState } from './dsky-state.js';
import { Pinball } from './pinball.js';
import { Executive } from './executive.js';
import { Workload } from './workload.js';
import { RestartModel } from './restart.js';
import { AlarmRegisters, describeAlarm } from './alarms.js';
import { NavState } from './nav.js';
import { programTable, v37Table, PROGRAM_NAMES_LUMINARY099 } from './programs/index.js';
import { unmodelledProgram } from './programs/lm/common.js';

export const SOFTWARE = Object.freeze(['Luminary099', 'Comanche055']);

const DEFAULT_KEY_GAP_MS = 400;   // ARCHITECTURE §6.3 pressScript default

// Flag bits the model uses, at their fresh-start values (FRESH_START_AND_
// RESTART.agc: LRBYPASS set at :614; everything else down).
const FRESH_FLAGS = Object.freeze({
  LRBYPASS: true,   // FLGWRD11 b15: bypass all LR processing
  LRINH: false,     // FLGWRD11 b8: set = LR updates permitted (V57)
  MUNFLAG: false,   // lunar Average-G (set by P63, FLAGORGY)
  REDFLAG: false,   // LPD redesignation permitted (P64 after PRO)
  NOTHROTL: false,
  XOVINFLG: false,  // X-axis override inhibited (below 30,000 ft)
  SURFFLAG: false,  // on the lunar surface (P68)
  APSFLAG: false,
  LETABORT: false,
});

export class Agc {
  constructor({
    software = 'Luminary099', bus = null, rng = null, vehicle = null, startGET = 0, ...options
  } = {}) {
    if (!SOFTWARE.includes(software)) throw new Error(`Unknown software "${software}" (${SOFTWARE.join(', ')})`);
    this.software = software;
    this.bus = bus || createBus();
    this.rng = rng;
    this.vehicle = vehicle;
    this.options = options;
    this.t = parseGET(startGET);

    this.mode = null;            // MODREG; null = −0 (blank PROG digits)
    this.program = null;
    this.landing = null;         // shared LM landing state (programs/lm/landing.js)
    this.erasable = {};
    this.flags = { ...FRESH_FLAGS, ...(options.flags || {}) };
    this.crew = {
      pgnsMode: options.pgnsMode === 'attHold' ? 'attHold' : 'auto',
      rrFault: false,
      engineStop: false,
      abort: false,
      rodClicks: 0,
      lpdClicks: { dx: 0, dy: 0 },
    };
    if (options.tig !== undefined && options.tig !== null) this.erasable.TIG = parseGET(options.tig);

    this.dsky = new DskyState();
    this.alarms = new AlarmRegisters({ software, dsky: this.dsky, bus: this.bus, now: () => this.t });
    this.exec = new Executive({
      software, bus: this.bus, dsky: this.dsky, startT: this.t, timeSource: () => this.t,
    });
    this.exec.onOverflow = (code) => this.bailout(code);   // 1201 / 1202 / 1203
    this.exec.onAbort = (code) => this.poodoo(code);       // 1204
    this._hookJobs();
    this.restart = new RestartModel(this, options.restart || {});
    this.workload = new Workload(this, { params: options.workload?.params ?? options.workloadParams });
    this.nav = new NavState(this, options.nav || {});
    this.pinball = new Pinball(this);

    this._keyQueue = [];
    this._cmd = { throttle: 0, thrustDir: null, engineOn: false, ullage: false, rod: 0, lpd: null };

    // After every software/hardware restart the program re-syncs what the
    // flush took away beyond its restart groups (e.g. waitlist handles).
    this.bus.on('restart', (info) => {
      if (info && info.fresh) return;
      this.program?.onRestart?.(this.t, info);
    });

    if (options.rrFault) this.crewInput('rrFault', true);
  }

  // RODCOMP is created by the load model (workload.js, RODTASK every 1 s);
  // P66's logic must run when that job runs, so give the job an onDone hook
  // that calls program.onRodcomp(t). (Contract note in the report: a hook
  // in workload.js would be cleaner.)
  _hookJobs() {
    const exec = this.exec;
    const original = exec.requestJob.bind(exec);
    exec.requestJob = (req) => {
      if (req && req.name === 'RODCOMP' && typeof req.onDone !== 'function') {
        req = { ...req, onDone: (t) => this.program?.onRodcomp?.(t) };
      }
      return original(req);
    };
  }

  // ---------- major modes ----------

  get programName() {
    return this.program?.constructor?.name ?? '';
  }

  // MMDSPLAY via NEWMODEX (PHASE_TABLE_MAINTENANCE.agc:44-75): MODREG and
  // the PROG digits; the display itself is the DSPMMJB job (PRIO30 NOVAC).
  setMajorMode(n) {
    const prev = this.mode;
    this.mode = n === null || n === undefined ? null : Number(n);
    this.dsky.setProg(this.mode === null ? '  ' : String(this.mode).padStart(2, '0'));
    if (this._started && this.exec && !this.exec.restartPending) {
      this.exec.requestJob({ name: 'DSPMMJB', prio: 0o30, vac: false, workMs: 2, group: 'display', source: 'agc' });
    }
    this.bus.emit('mode', { mode: this.mode, prev, t: this.t, name: this.programName });
  }

  // Start program n directly — scenario set-up ({ initial: true }: restore
  // the program's state at the present GET) and the automatic transitions
  // (P63 → P64 → P65/P66). No V37 checks.
  startProgram(n, { initial = false } = {}) {
    const num = Number(n);
    let Cls = programTable(this.software)[num];
    if (!Cls) {
      const name = this.software === 'Luminary099' ? PROGRAM_NAMES_LUMINARY099[num] : null;
      Cls = unmodelledProgram(num, name || `PROGRAM ${String(num).padStart(2, '0')}`, this.software);
    }
    const old = this.program;
    if (old) old.exit?.({ next: num });
    const p = new Cls(this);
    this.program = p;
    this.setMajorMode(num);
    p.enter?.({ initial });
    this._started = true;
    return p;
  }

  // The V37 path (PINBALL calls this after V37 Enter nn Enter;
  // FRESH_START_AND_RESTART.agc:739-1022): a program not in the listing's
  // V37 table is OPR ERR (V37NONO → FALTON); otherwise Average-G is stopped
  // (ISSERVON), the R00 clean-up runs (landing-radar bypass, groups 1, 3,
  // 5, 6 killed — V37KLEAN; group 4 too for P00 — P00KLEAN) and the new
  // program starts. Returns true when accepted.
  changeProgram(n) {
    const num = Number(n);
    if (!Number.isInteger(num) || !v37Table(this.software).includes(num)) {
      if (typeof this.pinball.operatorError === 'function') this.pinball.operatorError('V37: no such program');
      else {
        this.dsky.setLight('oprErr', true);
        this.bus.emit('oprerr', { t: this.t, reason: `V37: P${String(n).padStart(2, '0')} is not in the V37 table` });
      }
      return false;
    }
    if (this.workload.averageG) this.workload.stopAverageG();
    if (this.software === 'Luminary099') {
      // R00: "CAF LRBYBIT / TS FLGWRD11" (all R12 flags, LRINH included),
      // MUNFLAG and XOVINFLG down (:830-845).
      Object.assign(this.flags, { LRBYPASS: true, LRINH: false, MUNFLAG: false, XOVINFLG: false });
    }
    for (const g of [1, 3, 4, 5, 6]) this.restart.clear(g);
    this.startProgram(num);
    return true;
  }

  // ---------- keys ----------

  // One DSKY key. source: 'user' (the person at the keyboard) or 'crew'
  // (scenario keystrokes) — emitted as 'key' so the DSKY view can animate it.
  key(key, { source = 'user' } = {}) {
    this.bus.emit('key', { key, t: this.t, source });
    this.pinball.press(key);
  }

  // A keystroke script ('V16N68E'), one key every gapMs of simulated time;
  // the first key is pressed now.
  keys(script, { source = 'crew', gapMs = DEFAULT_KEY_GAP_MS } = {}) {
    const list = parseKeys(script);
    const gap = Math.max(0, Number(gapMs) || 0) / 1000;
    const q = this._keyQueue;
    let at = q.length ? Math.max(this.t, q[q.length - 1].at + gap) : this.t;
    for (const key of list) {
      q.push({ key, at, source });
      at += gap;
    }
    this._drainKeys(this.t);
  }

  _drainKeys(t) {
    const q = this._keyQueue;
    while (q.length && q[0].at <= t + 1e-9) {
      const { key, source } = q.shift();
      this.key(key, { source });
    }
  }

  // ---------- crew-station controls (ARCHITECTURE §11.3) ----------

  crewInput(name, value) {
    const c = this.crew;
    switch (name) {
      case 'rodClick': {
        // DESCBITS: each click of the ROD switch counts RODCOUNT ±1
        // (LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:1218-1228); GUILDENSTERN and
        // RODCOMP decide what it means.
        const n = Math.trunc(Number(value) || 0);
        if (!n) return;
        this.erasable.RODCOUNT = (this.erasable.RODCOUNT || 0) + n;
        c.rodClicks += n;
        break;
      }
      case 'lpd': {
        const dx = Math.trunc(Number(value?.dx) || 0);
        const dy = Math.trunc(Number(value?.dy) || 0);
        c.lpdClicks = { dx: c.lpdClicks.dx + dx, dy: c.lpdClicks.dy + dy };
        this.program?.onCrewInput?.('lpd', { dx, dy });
        this.bus.emit('crew', { name, value: { dx, dy }, t: this.t });
        return;
      }
      case 'pgnsMode':
        c.pgnsMode = value === 'attHold' ? 'attHold' : 'auto';
        break;
      case 'engineStop':
        c.engineStop = value === undefined ? true : !!value;
        break;
      case 'rrFault':
        c.rrFault = !!value;
        this.workload.setRrFault(c.rrFault);
        break;
      case 'abort':
        // ABORT / ABORT STAGE select P70/P71 in the real LGC — not modelled.
        c.abort = value === undefined ? true : !!value;
        break;
      default:
        if (typeof this.program?.onCrewInput !== 'function') return;
    }
    this.program?.onCrewInput?.(name, value);
    this.bus.emit('crew', { name, value, t: this.t });
  }

  // ---------- alarms and restarts ----------

  // ALARM (non-abortive): FAILREG, PROG lamp on the first one, 'alarm'.
  alarm(code) {
    return this.alarms.alarm(code, { t: this.t, restart: false });
  }

  // BAILOUT: alarm + software restart (restart.js).
  bailout(code) {
    this.restart.software(code);
  }

  // POODOO: alarm, groups killed, restart into P00.
  poodoo(code) {
    this.restart.poodoo(code);
  }

  // V36 fresh start (SLAP1, FRESH_START_AND_RESTART.agc:38-178): every job,
  // task and restart group gone, FAILREG zeroed, lamps off except GIMBAL
  // LOCK and NO ATT, DSKY blank, MODREG = −0 (blank PROG digits).
  freshStart() {
    const prev = this.mode;
    this._keyQueue.length = 0;
    this.program?.exit?.({ next: null });
    if (this.landing) {
      this.landing.teardown();
      this.landing = null;
    }
    this.restart.freshStart();
    if (typeof this.pinball.onRestart === 'function') this.pinball.onRestart({ hardware: true, fresh: true });
    const keep = { gimbalLock: this.dsky.lights.gimbalLock, noAtt: this.dsky.lights.noAtt };
    this.dsky.clearAll();
    this.dsky.setLights(keep);
    Object.assign(this.flags, FRESH_FLAGS);
    const P00 = programTable(this.software)[0];
    this.program = P00 ? new P00(this) : null;
    this.program?.enter?.({ initial: true, fresh: true });
    this.mode = null;
    this.dsky.setProg('  ');
    this.bus.emit('mode', { mode: null, prev, t: this.t, name: '' });
    this.bus.emit('restart', { t: this.t, reason: 'V36 fresh start', code: null, hardware: false, fresh: true });
  }

  // GOJAM path (e.g. V69): RESTART lamp, GOPROG.
  hardwareRestart(cause = 'hardware restart') {
    this.restart.hardware(cause);
  }

  // ---------- simulation ----------

  // Commands for the vehicle, read every substep before vehicle.step.
  vehicleCommands() {
    const c = this.program?.vehicleCommands?.() || null;
    const out = this._cmd;
    out.throttle = c && Number.isFinite(c.throttle) ? c.throttle : 0;
    out.thrustDir = c?.thrustDir ?? null;
    out.engineOn = !!c?.engineOn && !this.crew.engineStop;
    out.ullage = !!c?.ullage;
    out.rod = c?.rod ?? 0;
    out.lpd = c?.lpd ?? null;
    out.pitch = c?.pitch;
    out.yaw = c?.yaw;
    return out;
  }

  step(t, dt) {
    this.t = t;
    this._started = true;
    this._drainKeys(t);
    this.program?.step?.(t, dt);
    this.pinball.step(dt);
    this.workload.step(t, dt);
    this.exec.step(dt, t);
  }

  // ARCHITECTURE §6.9.1.
  snapshot() {
    const p = this.program;
    const C = p?.constructor;
    const L = this.landing;
    let burn = null;
    if (p) {
      if (typeof p.burnSnapshot === 'function') burn = p.burnSnapshot();
      else if (p.burn && typeof p.burn.snapshot === 'function') burn = p.burn.snapshot();
    }
    const last = this.alarms.last;
    return {
      software: this.software,
      t: this.t,
      mode: this.mode,
      programName: this.mode === null ? '' : (C?.name ?? ''),
      programModelled: C ? C.modelled !== false : true,
      dsky: this.dsky.snapshot(),
      exec: this.exec.snapshot(),
      alarms: {
        ...this.alarms.snapshot(),
        lastInfo: last ? describeAlarm(last.code, this.software) : null,
      },
      restart: this.restart.snapshot(),
      erasable: { ...this.erasable },
      nav: this.nav.snapshot(),
      burn,
      guidance: typeof p?.guidanceSnapshot === 'function' ? p.guidanceSnapshot() : null,
      crew: {
        rodRate: L && L.mode === 66 ? L.vdgVert : null,
        pgnsMode: this.crew.pgnsMode,
        rrFault: this.crew.rrFault,
        lpdClicks: { ...this.crew.lpdClicks },
        engineStop: this.crew.engineStop,
        abort: this.crew.abort,
        rodClicks: this.crew.rodClicks,
      },
      flags: { ...this.flags },
      workload: this.workload.snapshot(),
      program: typeof p?.snapshot === 'function' ? p.snapshot() : null,
    };
  }
}
