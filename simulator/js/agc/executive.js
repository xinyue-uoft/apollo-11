// The Executive and the Waitlist: a time-budget model of how the AGC shared
// its one processor between jobs, tasks, interrupts and counter increments.
//
// This is a behavioural model, not an instruction-level emulation. What it
// keeps from Luminary099/EXECUTIVE.agc and WAITLIST.agc, because the 1201/
// 1202 story depends on it:
//
// - A fixed pool of CORE SETS (8 in Luminary099, 7 in Comanche055) and
//   VAC AREAS (5). A job always holds one core set until ENDOFJOB; a job
//   created with FINDVAC/SPVAC (it runs interpretive code) also holds a VAC
//   area. Sleeping jobs keep both.
//   Luminary099/ERASABLE_ASSIGNMENTS.agc:374-383 (8 sets x 12 words, the
//   "(84D)" header and the "SEVEN SETS OF ELEVEN" comment at
//   EXECUTIVE.agc:157 are stale), :432-443 (VAC1USE..VAC5USE).
// - Allocation order and alarm codes: FINDVAC2 scans VAC1USE..VAC5USE first
//   and bails out with 01201 (EXECUTIVE.agc:133-147); then NOVAC2/NOVAC3/
//   NEXTCORE scan core sets 0..7 and bail out with 01202 (:155-208). So a
//   VAC job can raise either code, a NOVAC job only 1202.
// - Priority scheduling (bigger octal number = more urgent). The running
//   job always sits in core set 0: CHANJOB swaps core set 0 with the chosen
//   set (:214-255). A new job pre-empts only if strictly higher than the
//   running one (SETLOC, :189-199). After ENDOFJOB/JOBSLEEP, EJSCAN looks at
//   sets 1..7 and EJ1 keeps the FIRST of equal values (:388-450).
//   Both comparisons use the WHOLE PRIORITY word: priority in bits 10-14
//   plus, in the low 9 bits, the job's work-area address — its VAC area for
//   FINDVAC jobs (VACFOUND "ADS NEWPRIO", :149-153), FAKEPRET for NOVAC jobs
//   (:38-39, :126). FAKEPRET (MPAC-36D) lies below VAC1 < VAC2 < ... < VAC5
//   in erasable (ERASABLE_ASSIGNMENTS.agc:376-443), so at equal priority a
//   VAC job outranks a NOVAC job and a job in a higher-numbered VAC area
//   outranks one in a lower. A new SERVICER copy given VAC2 while the old
//   one holds VAC1 therefore pre-empts it — this is how unfinished SERVICER
//   "stubs" pile up when the machine is overloaded, and why a NOVAC display
//   job created at SERVICER's priority waits behind every SERVICER copy.
// - DUMMYJOB: when nothing is runnable the COMP ACTY lamp goes off
//   (:464-469); it comes back on when a job is dispatched (:299-301, :483).
// - Cycle stealing: every counter increment (PINC/MINC) takes one 11.72 us
//   memory cycle away from whatever is running. This is how the rendezvous-
//   radar CDUs ate ~13-15% of the machine on Apollo 11 (see workload.js).
// - The Waitlist: at most 9 pending tasks (WAITLIST.agc:59-62), overflow is
//   alarm 01203 via BAILOUT1 (:334-336); tasks run under interrupt and
//   cost CPU time before any job gets the processor.
//
// Simplifications (deliberate): time advances in slices of at most 10 ms;
// each job is a list of steps of CPU work ("workMs") and sleeps; job
// switches are immediate (real jobs test NEWJOB every few hundred
// microseconds — the interpreter between every instruction, INTERPRETER.agc:
// 74-84); interrupt work is a continuous fraction plus discrete task costs.

export const EXEC_CONFIG = Object.freeze({
  // Luminary099/EXECUTIVE.agc:162 NO.CORES DEC 7 -> 8 sets (loop 7..0);
  // FRESH_START_AND_RESTART.agc:507-529 frees 8 PRIORITY words and 5 VACs.
  Luminary099: Object.freeze({ coreSets: 8, vacAreas: 5, waitlistSlots: 9 }),
  // Comanche055/EXECUTIVE.agc:161 NO.CORES DEC 6 -> 7 sets;
  // Comanche055/ERASABLE_ASSIGNMENTS.agc:1627 "SEVEN SETS OF 12 REGISTERS",
  // :1725-1736 five VAC areas.
  Comanche055: Object.freeze({ coreSets: 7, vacAreas: 5, waitlistSlots: 9 }),
});

export const CODE_NO_VAC = 0o1201;      // EXECUTIVE.agc:147
export const CODE_NO_CORE = 0o1202;     // EXECUTIVE.agc:208
export const CODE_WAITLIST_FULL = 0o1203; // WAITLIST.agc:336
export const CODE_BAD_DELAY = 0o1204;   // WAITLIST.agc:559-563 (POODOO)

export const MEMORY_CYCLE_S = 11.71875e-6; // 12 pulses of the 1.024 MHz clock

// Load-accounting groups used by the Executive view's stacked bar.
export const LOAD_GROUPS = Object.freeze([
  'servicer', 'display', 'monitor', 'lr', 'keys', 'other', 'interrupts', 'steal', 'idle',
]);

// Which group a job belongs to when the requester does not say.
const JOB_GROUP = {
  SERVICER: 'servicer', GUIDANCE: 'servicer', NORMLIZE: 'servicer', LASTBIAS: 'servicer',
  RODCOMP: 'servicer', '1/GYRO': 'servicer', STEERING: 'servicer',
  MAKEPLAY: 'display', DSPMMJB: 'display', INITDSP: 'display', CLOKJOB: 'display',
  MONDO: 'monitor',
  LRHJOB: 'lr', LRVJOB: 'lr', HIGATJOB: 'lr',
  CHARIN: 'keys', PROCKEY: 'keys',
};

const WINDOW_S = 1.0;      // sliding window for the load breakdown
const BUCKET_S = 0.05;     // accounting bucket
const BUCKETS = Math.round(WINDOW_S / BUCKET_S);
const HISTORY_DT = 0.25;   // history sample period (4 Hz)
const HISTORY_LEN = 480;   // 120 s
const MAX_SLICE = 0.01;    // s
const EPS = 1e-7;

export function octal(n, digits = 2) {
  return Math.abs(n).toString(8).padStart(digits, '0');
}

// ------------------------------------------------------------------------
// Waitlist
// ------------------------------------------------------------------------

// Timer-driven tasks (T3RUPT). Tasks run with interrupts inhibited, must be
// short, and are the usual way jobs get created on a schedule (READACCS ->
// SERVICER, MONREQ -> MONDO, RODTASK -> RODCOMP).
export class Waitlist {
  constructor(exec, { slots = 9 } = {}) {
    this.exec = exec;
    this.slots = slots;
    this.tasks = [];       // sorted by due time
    this._seq = 0;
  }

  // CA DELTAT / TC WAITLIST / 2CADR task (WAITLIST.agc:64-69, :129-138).
  // `delay` in seconds; rounded to whole centiseconds like TIME3.
  // Returns the task, or null when it could not be scheduled.
  add(delay, name, fn, { costMs = 0, key = 'tasks', anchor = null, at = null } = {}) {
    const exec = this.exec;
    if (exec.restartPending) return null;
    const base = exec.now();
    let due;
    if (at !== null) {
      due = at;
    } else {
      const cs = Math.round(delay * 100);
      if (!(cs >= 1)) {
        // WAITLIST/VARDELAY/FIXDELAY with zero or negative delta-t:
        // POODOO 01204 (WAITLIST.agc:559-563).
        exec._abort(CODE_BAD_DELAY, { name, kind: 'task' });
        return null;
      }
      due = base + cs / 100;
    }
    if (this.tasks.length >= this.slots) {
      // NO ROOM IN THE INN (WAITLIST.agc:334-336).
      exec._overflow(CODE_WAITLIST_FULL, { name, kind: 'task' });
      return null;
    }
    const task = { id: ++this._seq, name, due, fn, costMs, key, anchor };
    let i = this.tasks.length;
    while (i > 0 && this.tasks[i - 1].due > due + EPS) i--;
    this.tasks.splice(i, 0, task);
    return task;
  }

  cancel(task) {
    const i = this.tasks.indexOf(task);
    if (i >= 0) this.tasks.splice(i, 1);
  }

  // STARTSB2 re-initialises LST1/LST2 (FRESH_START_AND_RESTART.agc:475-505).
  flush() {
    this.tasks.length = 0;
  }

  has(name) {
    return this.tasks.some((t) => t.name === name);
  }

  snapshot(now) {
    return this.tasks.map((t) => ({ id: t.id, name: t.name, dueIn: Math.max(0, t.due - now) }));
  }
}

// ------------------------------------------------------------------------
// Executive
// ------------------------------------------------------------------------

export class Executive {
  // `coreSets`/`vacAreas` default to Luminary099 (8/5). `software` picks the
  // counts from EXEC_CONFIG when the explicit counts are not given.
  // Optional: `dsky` (drives the COMP ACTY lamp), `startT` (GET of the
  // internal clock), `timeSource` (() => GET; see step()).
  constructor({
    coreSets, vacAreas, bus = null, software = 'Luminary099', dsky = null,
    startT = 0, timeSource = null, waitlistSlots,
  } = {}) {
    const cfg = EXEC_CONFIG[software] || EXEC_CONFIG.Luminary099;
    this.software = software;
    this.bus = bus;
    this.dsky = dsky;
    this.timeSource = timeSource;
    this.coreSetCount = coreSets ?? cfg.coreSets;
    this.vacCount = vacAreas ?? cfg.vacAreas;
    this.coreSets = new Array(this.coreSetCount).fill(null);
    this.vacs = new Array(this.vacCount).fill(null);
    this.waitlist = new Waitlist(this, { slots: waitlistSlots ?? cfg.waitlistSlots });

    // Hooks wired by the Agc (see ARCHITECTURE §6.9):
    this.onOverflow = null;   // (code, request) => void   — BAILOUT path (1201/1202/1203)
    this.onAbort = null;      // (code, request) => void   — POODOO path (1204)
    this.onActivity = null;   // (active:boolean, t) => void — COMP ACTY lamp

    this.t = startT;
    this._now = null;         // time inside a slice / callback
    this._depth = 0;          // callback nesting (see atSafePoint)
    this._deferred = [];
    this.restartPending = false;

    this.steal = new Map();       // key -> fraction of memory cycles stolen
    this.interrupts = new Map();  // key -> fraction of time in interrupt code
    this.debts = [];              // [{ key, ms }] discrete interrupt work (tasks, restart)

    this._jobSeq = 0;
    this.idle = true;
    this.active = false;          // COMP ACTY
    this.lastRequest = new Map(); // name -> { t, source }
    this.lastOverflow = null;
    this.overflows = [];          // recent overflow records (for the view)
    this.stats = { requested: 0, completed: 0, overflows: 0, maxCoreSets: 0, maxVacs: 0 };

    this._initAccounting();
  }

  static forSoftware(software, opts = {}) {
    return new Executive({ ...opts, software });
  }

  // ---------------------------------------------------------------- time

  // Current GET as seen by the model: inside a slice or callback it is the
  // time of that event; otherwise the end of the last step.
  now() {
    if (this._now !== null) return this._now;
    if (this.timeSource) {
      const t = this.timeSource();
      if (typeof t === 'number' && Number.isFinite(t)) return Math.max(t, this.t);
    }
    return this.t;
  }

  // ------------------------------------------------------------ requests

  // NOVAC / FINDVAC / SPVAC. See the file header for the order of the
  // searches and the codes. Returns the job, or null on overflow (after
  // calling this.onOverflow(code, request)) or while a restart is pending.
  //
  // request = {
  //   name, prio (octal number, e.g. 0o20), vac (FINDVAC/SPVAC if true),
  //   workMs  (CPU time of a one-step job), or
  //   steps: [{ workMs, label?, onEnd?(t, job) } | { sleepMs } | { sleep: true }],
  //   runPrio (PRIOCHNG at first dispatch, e.g. MAKEPLAY raises itself to 33),
  //   restartGroup, anchor, group (load-bar group), source, onDone(t, job)
  // }
  requestJob(request) {
    if (this.restartPending) return null;
    const req = request || {};
    const name = String(req.name || 'JOB');
    const prio = clampPrio(req.prio ?? 0o20);
    const t = this.now();
    this.stats.requested += 1;
    this.lastRequest.set(name, { t, source: req.source || null });

    // FINDVAC2: VAC1USE..VAC5USE in order; else 01201.
    let vacIndex = null;
    if (req.vac) {
      vacIndex = this.vacs.indexOf(null);
      if (vacIndex < 0) {
        this._overflow(CODE_NO_VAC, req);
        return null;
      }
    }
    // NOVAC2/NOVAC3/NEXTCORE: core sets 0..7; else 01202. (If FINDVAC had
    // reserved a VAC and then no core set is found, that VAC is leaked in
    // the real code; the restart frees everything anyway.)
    const setIndex = this.coreSets.indexOf(null);
    if (setIndex < 0) {
      this._overflow(CODE_NO_CORE, req);
      return null;
    }

    const steps = normaliseSteps(req);
    const job = {
      id: ++this._jobSeq,
      name,
      prio,
      basePrio: prio,
      runPrio: req.runPrio ?? null,
      vac: !!req.vac,
      vacIndex,
      coreSet: setIndex,
      steps,
      stepIndex: 0,
      remainingMs: steps[0].workMs ?? 0,
      wakeAt: null,
      state: 'READY',
      created: t,
      started: null,
      workDoneMs: 0,
      workTotalMs: steps.reduce((s, x) => s + (x.workMs || 0), 0),
      restartGroup: req.restartGroup ?? null,
      anchor: req.anchor ?? null,
      group: req.group || JOB_GROUP[name] || 'other',
      source: req.source || null,
      onDone: req.onDone || null,
      label: req.label || null,
      dead: false,
    };
    this.coreSets[setIndex] = job;
    if (vacIndex !== null) this.vacs[vacIndex] = job;
    if (steps[0].sleep || steps[0].sleepMs) this._enterSleep(job, t);
    this._noteUsage();
    return job;
  }

  // JOBWAKE for a job sleeping with `{ sleep: true }` (or early wake).
  wake(job) {
    if (!job || job.dead || job.state !== 'SLEEPING') return false;
    this._advanceStep(job, this.now());
    return true;
  }

  // Remove a job without running it (not an AGC operation; used by tests
  // and by models that cancel something they own).
  kill(job) {
    if (!job || job.dead) return;
    this._free(job);
  }

  findJobs(name) {
    return this.coreSets.filter((j) => j && j.name === name);
  }

  // ---------------------------------------------------- stealing & interrupts

  // Fraction of memory cycles stolen by counter increments, e.g.
  // setSteal('rrCdu', 0.13). 0 removes the key.
  setSteal(key, fraction) {
    const f = clamp01(fraction);
    if (f > 0) this.steal.set(key, f);
    else this.steal.delete(key);
  }

  // Continuous interrupt load (T4RUPT, DAP T5RUPT/T6RUPT, DOWNRUPT, ...).
  setInterruptLoad(key, fraction) {
    const f = clamp01(fraction);
    if (f > 0) this.interrupts.set(key, f);
    else this.interrupts.delete(key);
  }

  clearInterruptLoads() {
    this.interrupts.clear();
  }

  // Discrete interrupt-level work (a waitlist task, the restart code):
  // paid before any job gets the processor again.
  chargeInterrupt(key, ms) {
    if (ms > 0) this.debts.push({ key, ms });
  }

  // ------------------------------------------------------------- restart

  // Run `fn` at the next safe point. BAILOUT never returns to its caller in
  // the real machine; here the caller does return, so the restart model
  // defers the destructive part until the current task/job callback has
  // finished — then wipes whatever that callback did afterwards.
  atSafePoint(fn) {
    if (this._depth > 0) this._deferred.push(fn);
    else fn();
  }

  // Drop every job (and, by default, every waitlist task): STARTSB2,
  // FRESH_START_AND_RESTART.agc:475-529. Stealing and the continuous
  // interrupt loads are hardware/phase properties and are kept.
  flush({ waitlist = true } = {}) {
    for (let i = 0; i < this.coreSets.length; i++) {
      const job = this.coreSets[i];
      if (job) job.dead = true;
      this.coreSets[i] = null;
    }
    this.vacs.fill(null);
    this.debts.length = 0;
    if (waitlist) this.waitlist.flush();
    this._setActive(false, this.now());
  }

  // ---------------------------------------------------------------- step

  // Advance dt seconds. `tEnd` (GET at the end of the step) is optional:
  // when omitted, the clock comes from `timeSource()` if that is ahead of
  // the internal clock, else it is simply advanced by dt.
  step(dt, tEnd) {
    if (!(dt > 0)) return;
    let end = typeof tEnd === 'number' ? tEnd : null;
    if (end === null && this.timeSource) {
      const ts = this.timeSource();
      if (typeof ts === 'number' && ts > this.t + dt * 0.5) end = ts;
    }
    if (end === null || end <= this.t) end = this.t + dt;
    let t0 = end - dt;
    if (t0 < this.t - EPS || t0 > this.t + EPS) t0 = Math.max(this.t, end - dt);
    const span = end - t0;
    const n = Math.max(1, Math.ceil(span / MAX_SLICE - 1e-9));
    for (let i = 0; i < n; i++) {
      const a = t0 + (span * i) / n;
      const b = i === n - 1 ? end : t0 + (span * (i + 1)) / n;
      this._slice(a, b);
    }
    this.t = end;
  }

  _slice(t0, t1) {
    const dt = t1 - t0;
    const dtMs = dt * 1000;
    this._now = t0;

    // Timed wake-ups (radar reads finishing etc.).
    for (const job of this.coreSets) {
      if (job && job.state === 'SLEEPING' && job.wakeAt !== null && job.wakeAt <= t1 + EPS) {
        this._now = Math.max(t0, job.wakeAt);
        this._advanceStep(job, this._now);
      }
    }

    // Waitlist tasks due in this slice run first (T3RUPT inhibits jobs).
    const wl = this.waitlist.tasks;
    let guard = 0;
    while (wl.length && wl[0].due <= t1 + EPS && guard++ < 64) {
      const task = wl.shift();
      this._now = task.due;
      if (task.costMs > 0) this.chargeInterrupt(task.key, task.costMs);
      this._call(task.fn, task.due, task);
    }
    this._now = t0;

    // Memory cycles stolen by counters, then continuous interrupt load.
    let stealF = 0;
    for (const f of this.steal.values()) stealF += f;
    stealF = Math.min(1, stealF);
    let intF = 0;
    for (const f of this.interrupts.values()) intF += f;
    intF = Math.min(1 - stealF, intF);
    if (stealF > 0) {
      for (const [k, f] of this.steal) this._account(k, 'steal', (dtMs * stealF * f) / sumValues(this.steal));
    }
    if (intF > 0) {
      const tot = sumValues(this.interrupts);
      for (const [k, f] of this.interrupts) this._account(k, 'interrupts', (dtMs * intF * f) / tot);
    }
    let avail = dtMs * (1 - stealF - intF);

    // Discrete interrupt work first (it may also appear mid-slice, e.g. the
    // restart code after a job request overflowed), then jobs, highest
    // priority first.
    let ran = false;
    let iter = 0;
    while (avail > EPS && iter++ < 256) {
      if (this.debts.length) {
        const d = this.debts[0];
        const pay = Math.min(avail, d.ms);
        this._account(d.key, 'interrupts', pay);
        d.ms -= pay;
        avail -= pay;
        if (d.ms <= EPS) this.debts.shift();
        continue;
      }
      const job = this._dispatch(t0 + dt * (1 - avail / dtMs));
      if (!job) break;
      ran = true;
      const use = Math.min(avail, job.remainingMs);
      job.remainingMs -= use;
      job.workDoneMs += use;
      avail -= use;
      this._account(job.name, job.group, use);
      if (job.remainingMs <= EPS) {
        const tNow = t0 + dt * (1 - avail / dtMs);
        this._advanceStep(job, tNow);
      }
    }
    if (avail > 0) this._account('idle', 'idle', avail);

    // DUMMYJOB = nothing runnable at the end of the slice. COMP ACTY shows
    // whether a job had the processor during the slice.
    this.idle = !this._hasRunnable();
    this._setActive(ran || !this.idle, t1);
    this._now = null;
    this._tickAccounting(t1, dt);
  }

  // Choose the job that owns the processor now (and put it in core set 0).
  _dispatch(tNow) {
    const sets = this.coreSets;
    const cur = sets[0];
    const curRunnable = cur && (cur.state === 'READY' || cur.state === 'RUNNING');
    // Best among sets 1..n: strictly higher replaces (EJ1), so the first of
    // equal PRIORITY words in scan order wins.
    let best = -1;
    for (let i = 1; i < sets.length; i++) {
      const j = sets[i];
      if (!j || j.state === 'SLEEPING') continue;
      if (best < 0 || priorityWord(j) > priorityWord(sets[best])) best = i;
    }
    if (curRunnable && (best < 0 || priorityWord(sets[best]) <= priorityWord(cur))) {
      this._start(cur, tNow);
      return cur;
    }
    if (best < 0) return null; // DUMMYJOB
    // CHANJOB: swap core set 0 with the chosen set. A pre-empted running
    // job, a sleeping job or a free set goes to the chosen job's old place.
    const chosen = sets[best];
    sets[best] = cur || null;
    sets[0] = chosen;
    if (cur) {
      cur.coreSet = best;
      if (cur.state === 'RUNNING') cur.state = 'READY';
    }
    chosen.coreSet = 0;
    this._start(chosen, tNow);
    return chosen;
  }

  _start(job, tNow) {
    if (job.started === null) {
      job.started = tNow;
      // PRIOCHNG at the head of the job (MAKEPLAY: "RAISE PRIORITY FOR FAST
      // JOBS AFTER WAKE", DISPLAY_INTERFACE_ROUTINES.agc:742-747).
      if (job.runPrio !== null) job.prio = clampPrio(job.runPrio);
      const s = job.steps[job.stepIndex];
      if (s && s.onStart) this._call(s.onStart, tNow, job);
    }
    job.state = 'RUNNING';
  }

  // Finish the current step and move to the next (or end the job).
  _advanceStep(job, tNow) {
    if (job.dead) return;
    const step = job.steps[job.stepIndex];
    if (job.state === 'SLEEPING') {
      job.state = 'READY';
      job.prio = Math.abs(job.prio);
      job.wakeAt = null;
    } else if (step && step.onEnd) {
      this._call(step.onEnd, tNow, job);
      if (job.dead) return;
    }
    job.stepIndex += 1;
    const next = job.steps[job.stepIndex];
    if (!next) {
      this._finish(job, tNow);
      return;
    }
    if (next.sleep || next.sleepMs) {
      this._enterSleep(job, tNow);
    } else {
      job.remainingMs = next.workMs || 0;
      if (next.onStart) this._call(next.onStart, tNow, job);
      if (job.remainingMs <= EPS && !job.dead) this._advanceStep(job, tNow);
    }
  }

  // JOBSLEEP: keeps the core set (and VAC), priority shown negative
  // (EXECUTIVE.agc:281-283 "NNZ PRIORITY SHOWS JOB ASLEEP").
  _enterSleep(job, tNow) {
    const s = job.steps[job.stepIndex];
    job.state = 'SLEEPING';
    job.remainingMs = 0;
    job.wakeAt = s.sleepMs ? tNow + s.sleepMs / 1000 : null;
  }

  // ENDOFJOB / ENDJOB1: release the core set and the VAC area (:371-386).
  _finish(job, tNow) {
    this._free(job);
    this.stats.completed += 1;
    if (job.onDone) this._call(job.onDone, tNow, job);
  }

  _free(job) {
    job.dead = true;
    if (this.coreSets[job.coreSet] === job) this.coreSets[job.coreSet] = null;
    else {
      const i = this.coreSets.indexOf(job);
      if (i >= 0) this.coreSets[i] = null;
    }
    if (job.vacIndex !== null && this.vacs[job.vacIndex] === job) this.vacs[job.vacIndex] = null;
  }

  _hasRunnable() {
    return this.coreSets.some((j) => j && j.state !== 'SLEEPING');
  }

  _call(fn, t, arg) {
    if (typeof fn !== 'function') return;
    const prev = this._now;
    this._now = t;
    this._depth += 1;
    try {
      fn(t, arg);
    } finally {
      this._depth -= 1;
      this._now = prev;
    }
    if (this._depth === 0 && this._deferred.length) {
      const list = this._deferred.splice(0);
      const p = this._now;
      this._now = t;
      for (const f of list) f();
      this._now = p;
    }
  }

  _overflow(code, req) {
    const t = this.now();
    const rec = {
      t, code, name: req?.name || null, prio: req?.prio ?? null, vac: !!req?.vac,
      kind: req?.kind || 'job', coreSetsUsed: this.coreSets.filter(Boolean).length,
      vacsUsed: this.vacs.filter(Boolean).length,
    };
    this.lastOverflow = rec;
    this.overflows.push(rec);
    if (this.overflows.length > 20) this.overflows.shift();
    this.stats.overflows += 1;
    if (typeof this.onOverflow === 'function') this.onOverflow(code, req);
  }

  _abort(code, req) {
    if (typeof this.onAbort === 'function') this.onAbort(code, req);
    else if (typeof this.onOverflow === 'function') this.onOverflow(code, req);
  }

  _setActive(active, t) {
    if (active === this.active) return;
    this.active = active;
    if (this.dsky && typeof this.dsky.setLight === 'function') this.dsky.setLight('compActy', active);
    if (typeof this.onActivity === 'function') this.onActivity(active, t);
  }

  _noteUsage() {
    const c = this.coreSets.filter(Boolean).length;
    const v = this.vacs.filter(Boolean).length;
    if (c > this.stats.maxCoreSets) this.stats.maxCoreSets = c;
    if (v > this.stats.maxVacs) this.stats.maxVacs = v;
  }

  // ------------------------------------------------------------ accounting

  _initAccounting() {
    this._keys = new Map();     // contributor -> index
    this._keyNames = [];
    this._keyGroups = [];
    this._cap = 32;
    this._buckets = [];         // completed buckets: { dt, v: Float64Array }
    this._cur = { dt: 0, v: new Float64Array(this._cap) };
    this._sum = new Float64Array(this._cap);
    this._sumDt = 0;
    this._history = [];
    this._historySnap = [];
    this._historyDirty = false;
    this._nextHistoryT = null;
  }

  _keyIndex(key, group) {
    let i = this._keys.get(key);
    if (i === undefined) {
      i = this._keyNames.length;
      if (i >= this._cap) this._grow();
      this._keys.set(key, i);
      this._keyNames.push(key);
      this._keyGroups.push(group);
    }
    return i;
  }

  _grow() {
    const cap = this._cap * 2;
    const grow = (a) => {
      const b = new Float64Array(cap);
      b.set(a);
      return b;
    };
    this._sum = grow(this._sum);
    this._cur.v = grow(this._cur.v);
    for (const b of this._buckets) b.v = grow(b.v);
    this._cap = cap;
  }

  _account(key, group, ms) {
    if (!(ms > 0)) return;
    const i = this._keyIndex(key, group);
    this._cur.v[i] += ms;
  }

  _tickAccounting(t1, dt) {
    const cur = this._cur;
    cur.dt += dt;
    if (cur.dt >= BUCKET_S - 1e-9) {
      this._buckets.push(cur);
      for (let i = 0; i < this._keyNames.length; i++) this._sum[i] += cur.v[i];
      this._sumDt += cur.dt;
      while (this._buckets.length > BUCKETS) {
        const old = this._buckets.shift();
        for (let i = 0; i < this._keyNames.length; i++) this._sum[i] -= old.v[i];
        this._sumDt -= old.dt;
      }
      this._cur = { dt: 0, v: new Float64Array(this._cap) };
    }
    if (this._nextHistoryT === null) this._nextHistoryT = t1 + HISTORY_DT;
    if (t1 >= this._nextHistoryT - 1e-9) {
      this._nextHistoryT += HISTORY_DT;
      if (t1 > this._nextHistoryT) this._nextHistoryT = t1 + HISTORY_DT;
      this._history.push({ t: t1, total: this._busyFraction() });
      if (this._history.length > HISTORY_LEN) this._history.shift();
      this._historyDirty = true;
    }
  }

  _windowTotals() {
    const n = this._keyNames.length;
    const v = new Float64Array(n);
    let totalMs = 0;
    for (let i = 0; i < n; i++) {
      v[i] = this._sum[i] + this._cur.v[i];
      totalMs += v[i];
    }
    return { v, totalMs };
  }

  _busyFraction() {
    const { v, totalMs } = this._windowTotals();
    if (!(totalMs > 0)) return 0;
    const idle = this._keys.has('idle') ? v[this._keys.get('idle')] : 0;
    return 1 - idle / totalMs;
  }

  // Load over the last second: { total, parts, groups }. Every contributor
  // (job name, interrupt key, steal key, 'idle') appears in `parts`; the
  // parts sum to 1 (when any time has been simulated).
  load() {
    const { v, totalMs } = this._windowTotals();
    const parts = {};
    const groups = {};
    for (const g of LOAD_GROUPS) groups[g] = 0;
    if (totalMs > 0) {
      for (let i = 0; i < v.length; i++) {
        if (!(v[i] > 0)) continue;
        const f = v[i] / totalMs;
        parts[this._keyNames[i]] = f;
        const g = this._keyGroups[i] || 'other';
        groups[g] = (groups[g] || 0) + f;
      }
    }
    const total = totalMs > 0 ? 1 - (parts.idle || 0) : 0;
    return { total, parts, groups, windowS: Math.min(WINDOW_S, this._sumDt + this._cur.dt) };
  }

  // ------------------------------------------------------------- snapshot

  snapshot() {
    const now = this.now();
    const jobView = (job) => job && {
      id: job.id,
      name: job.name,
      prio: job.prio,
      prioOctal: octal(job.prio),
      vacIndex: job.vacIndex,
      state: job.state,
      age: Math.max(0, now - job.created),
      progress: job.workTotalMs > 0 ? Math.min(1, job.workDoneMs / job.workTotalMs) : 1,
      remainingMs: remainingWork(job),
      group: job.group,
      anchor: job.anchor,
      label: job.label,
      restartGroup: job.restartGroup,
    };
    const coreSets = this.coreSets.map((job, index) => ({ index, job: jobView(job) }));
    const vacs = this.vacs.map((job, index) => ({
      index, label: `VAC${index + 1}`, job: job ? { id: job.id, name: job.name, coreSet: job.coreSet } : null,
    }));
    const queue = this.coreSets
      .filter((j) => j && j.state !== 'SLEEPING')
      .sort((a, b) => priorityWord(b) - priorityWord(a) || a.coreSet - b.coreSet)
      .map((j) => ({ id: j.id, name: j.name, prio: j.prio, coreSet: j.coreSet }));
    const r = this.coreSets[0];
    const running = r && r.state === 'RUNNING' ? { id: r.id, name: r.name, prio: r.prio, coreSet: 0 } : null;
    if (this._historyDirty) {
      this._historySnap = this._history.slice();
      this._historyDirty = false;
    }
    let backlogMs = 0;
    for (const j of this.coreSets) if (j) backlogMs += remainingWork(j);
    return {
      t: now,
      software: this.software,
      coreSetCount: this.coreSetCount,
      vacCount: this.vacCount,
      coreSets,
      vacs,
      load: this.load(),
      queue,
      idle: this.idle,
      active: this.active,
      running,
      history: this._historySnap,
      steal: Object.fromEntries(this.steal),
      interrupts: Object.fromEntries(this.interrupts),
      backlogMs,
      coreSetsUsed: this.coreSets.filter(Boolean).length,
      vacsUsed: this.vacs.filter(Boolean).length,
      lastOverflow: this.lastOverflow,
      overflows: this.overflows.slice(),
      stats: { ...this.stats },
      waitlist: this.waitlist.snapshot(now),
      waitlistSlots: this.waitlist.slots,
      restartPending: this.restartPending,
    };
  }
}

// ------------------------------------------------------------------ helpers

function normaliseSteps(req) {
  if (Array.isArray(req.steps) && req.steps.length) {
    return req.steps.map((s) => ({ ...s }));
  }
  return [{ workMs: Math.max(0, Number(req.workMs) || 0) }];
}

// The comparison value of a PRIORITY register: priority level in the high
// bits, work-area address in the low 9 bits — modelled by its order only
// (NOVAC/FAKEPRET = 0 < VAC1 = 1 < ... < VAC5 = 5).
export function priorityWord(job) {
  return job.prio * 512 + (job.vacIndex === null ? 0 : job.vacIndex + 1);
}

function remainingWork(job) {
  let ms = job.state === 'SLEEPING' ? 0 : job.remainingMs;
  for (let i = job.stepIndex + 1; i < job.steps.length; i++) ms += job.steps[i].workMs || 0;
  return ms;
}

function clampPrio(p) {
  const n = Math.round(Number(p));
  if (!Number.isFinite(n)) return 0o20;
  return Math.max(0, Math.min(0o37, n));
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function sumValues(map) {
  let s = 0;
  for (const v of map.values()) s += v;
  return s;
}
