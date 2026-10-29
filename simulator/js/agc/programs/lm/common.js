// Shared plumbing for the Luminary 099 (Lunar Module) programs: the base
// class with waitlist/job/display helpers that talk to the Executive and
// PINBALL through the documented `agc` surface (ARCHITECTURE §6), the
// crew-response router for flashing displays, and GOTOPOOH.
//
// Programs schedule their WAITLIST tasks and Executive jobs on the real
// executive model (js/agc/executive.js), so that they cost CPU time, can be
// starved by an overload, and are flushed by a software restart exactly as
// on the machine; restart-protected work is re-created from the restart
// groups (PHASCHNG) the way the listing does it.

import { FT, FPS, NMI } from '../../../util/units.js';

export const toFt = (m) => m / FT;
export const toFps = (mps) => mps / FPS;
export const toNmi = (m) => m / NMI;

// 'physics' | 'replay' | 'static' | 'cmSps' | 'unknown' — what the vehicle
// model is, so a program knows whether its commands fly the LM (physics)
// or only its displays matter (replay: the historical track ignores them).
export function vehicleKind(agc) {
  const v = agc.vehicle;
  if (!v) return 'static';
  if (typeof v.kind === 'string') return v.kind;
  const name = v.constructor?.name || '';
  if (name === 'LmPhysics') return 'physics';
  if (name === 'ReplayVehicle') return 'replay';
  if (name === 'StaticVehicle') return 'static';
  if (name === 'CmSpsVehicle') return 'cmSps';
  return 'unknown';
}

// Crew responses to a flashing display (PINBALL "ENDIDLE" returns,
// Luminary099/DISPLAY_INTERFACE_ROUTINES.agc:84-86: V34 terminate = L+1,
// V33/PRO proceed = L+2, ENTER/V32 recycle = L+3). One response is pending
// per flashing display; the first answer wins. The same key may reach us
// twice in one instant (PINBALL's display callback and the program's
// onProceed()), so a second answer at the same time is ignored.
export class ResponseRouter {
  constructor() {
    this.pending = null;
    this.lastT = null;
    this.lastKind = null;
  }

  install(id, handlers) {
    this.pending = { id, handlers };
  }

  clear() {
    this.pending = null;
  }

  get id() {
    return this.pending ? this.pending.id : null;
  }

  // kind: 'proceed' | 'terminate' | 'enter'
  answer(kind, t) {
    if (t !== undefined && t === this.lastT && kind === this.lastKind) return false;
    const p = this.pending;
    if (!p) return false;
    const fn = p.handlers[kind];
    if (!fn) return false;
    this.pending = null;
    this.lastT = t;
    this.lastKind = kind;
    fn();
    return true;
  }
}

// Base class of the LM programs (ARCHITECTURE §6.10). Subclasses set the
// statics `number`, `name` (the listing's title), `anchor`.
export class LmProgram {
  constructor(agc) {
    this.agc = agc;
    this.router = new ResponseRouter();
    this.tasks = new Map();      // name -> waitlist task
    this.active = false;
  }

  get t() {
    return this.agc.t;
  }

  get exec() {
    return this.agc.exec;
  }

  enter() {
    this.active = true;
  }

  step() {}

  exit() {
    this.active = false;
    this.cancelAll();
    this.router.clear();
  }

  // ---------- Executive and Waitlist ----------

  // WAITLIST / TWIDDLE / LONGCALL a task at absolute GET `at` (the model
  // keeps absolute due times, which is what TBASEn + delta-t amount to).
  // A task already due runs at the next slice. Returns the task or null
  // (waitlist full → 1203 → restart, or a restart in progress).
  schedule(name, at, fn, { costMs = 0.3 } = {}) {
    const exec = this.exec;
    if (!exec) return null;
    this.cancel(name);
    const due = Math.max(at, exec.now());
    const task = exec.waitlist.add(0, name, (t) => {
      if (this.tasks.get(name) === task) this.tasks.delete(name);
      if (!this.active) return;
      fn(t);
    }, { at: due, costMs, key: 'tasks' });
    if (task) this.tasks.set(name, task);
    return task;
  }

  // KILLTASK (BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc:965-1000).
  cancel(name) {
    const task = this.tasks.get(name);
    if (task) {
      this.exec?.waitlist.cancel(task);
      this.tasks.delete(name);
    }
  }

  cancelAll() {
    for (const task of this.tasks.values()) this.exec?.waitlist.cancel(task);
    this.tasks.clear();
  }

  // After a software restart the waitlist was emptied: drop the handles of
  // tasks that are no longer on it (re-created ones stay).
  forgetTasks() {
    const wl = this.exec?.waitlist;
    for (const [name, task] of [...this.tasks]) {
      if (!wl || !wl.tasks.includes(task)) this.tasks.delete(name);
    }
  }

  hasTask(name) {
    const task = this.tasks.get(name);
    return !!task && !!this.exec?.waitlist.tasks.includes(task);
  }

  // NOVAC / FINDVAC a job; `onDone(t)` runs when the job ends (ENDOFJOB).
  job(name, { prio, vac = false, workMs = 5, anchor = null, label = null, onDone = null } = {}) {
    const exec = this.exec;
    if (!exec) {
      if (onDone) onDone(this.t);
      return null;
    }
    return exec.requestJob({
      name, prio, vac, workMs, anchor, label, source: 'program',
      onDone: onDone ? (t) => { if (this.active) onDone(t); } : null,
    });
  }

  // PHASCHNG: register a restart point (ARCHITECTURE §6.8).
  protect(group, phase, reenter, { label = '', anchor = null } = {}) {
    this.agc.restart?.protect?.(group, phase, (t, info) => {
      if (this.active) reenter(t, info);
    }, { label, anchor, owner: 'lm' });
  }

  unprotect(group) {
    this.agc.restart?.clearIfOwner?.(group, 'lm');
  }

  // ---------- displays ----------

  // GODSP / REGODSP: a static program display. `extra`: further PINBALL
  // request fields (checklist, displayVerb, blank).
  show(verb, noun, { source = null, priority = false, ...extra } = {}) {
    this.router.clear();
    this.agc.pinball?.showDisplay?.({ ...extra, verb, noun, flash: false, priority, source });
  }

  // GOFLASH / REFLASH / CLOCPLAY: a flashing display awaiting a response.
  // handlers: { proceed, terminate, enter }.
  flash(verb, noun, handlers, { id = null, source = null, priority = false, ...extra } = {}) {
    const key = id || `V${verb}N${noun}`;
    this.router.install(key, handlers);
    const answer = (kind) => () => this.router.answer(kind, this.agc.t);
    this.agc.pinball?.showDisplay?.({
      ...extra, verb, noun, flash: true, priority, source,
      onProceed: answer('proceed'),
      onTerminate: answer('terminate'),
      onEnter: answer('enter'),
      onRecycle: answer('enter'),
    });
  }

  // GOTOPOOH (Luminary099/FRESH_START_AND_RESTART.agc:642-671): flashing V37
  // (noun 99) asking for a new program; every response flashes it again.
  // The major mode stays what it was until the crew selects a program.
  goToPooh() {
    this.cancelAll();
    this.unprotect(4);
    this.protect(4, '4.33', () => this.goToPooh(), { label: 'GOP00FIX (flashing V37)', anchor: 'src.gotopooh' });
    this.stage = 'pooh';
    const again = () => this.goToPooh();
    this.flash(37, 99, { proceed: again, terminate: again, enter: again }, { id: 'GOP00FIX', source: 'src.gotopooh' });
  }

  // PINBALL responses that reach the program instead of a display callback.
  onProceed() { return this.router.answer('proceed', this.agc.t); }
  onTerminate() { return this.router.answer('terminate', this.agc.t); }
  onEnter() { return this.router.answer('enter', this.agc.t); }
  onRecycle() { return this.router.answer('enter', this.agc.t); }

  // ---------- helpers ----------

  setPhase(name) {
    try {
      this.agc.workload?.setPhase?.(name);
    } catch (err) {
      // An unknown phase in an older/newer workload model must not stop the
      // program; the load model just stays where it was.
      if (typeof console !== 'undefined') console.warn(err.message);
    }
  }

  setErasable(values) {
    Object.assign(this.agc.erasable, values);
  }

  vehicleCommands() {
    return null;
  }

  snapshot() {
    return { stage: this.stage || null };
  }
}

// A program that is in the V37 list of the listing but not modelled by the
// simulator: it takes the major mode (PROG digits) and then idles, so the
// keying works as on the real DSKY. The UI says "not modelled".
export function unmodelledProgram(number, name, software = 'Luminary099') {
  return class Unmodelled extends LmProgram {
    static number = number;
    static name = name;
    static anchor = software === 'Comanche055' ? 'src.cmc.log-sections' : 'src.lum.log-sections';
    static modelled = false;

    enter() {
      super.enter();
      this.stage = 'not modelled';
      this.setPhase(software === 'Comanche055' ? 'cmIdle' : 'idle');
    }
  };
}
