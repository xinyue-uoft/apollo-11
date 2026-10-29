// Shared plumbing for the Comanche 055 (Command Module) programs: a tiny
// task list standing in for the WAITLIST, the display helper that talks to
// PINBALL, crew-response routing, and defensive access to the parts of the
// `agc` surface owned by other modules (ARCHITECTURE §6).

// A per-program WAITLIST: tasks run at (or after) their due time, in time
// order and, for equal times, in the order they were scheduled. Pure and
// deterministic; driven by the program's step(t).
export class TaskList {
  constructor() {
    this.tasks = [];
    this.seq = 0;
  }

  at(t, name, fn) {
    this.tasks.push({ t, name, fn, seq: this.seq++ });
    this.tasks.sort((a, b) => a.t - b.t || a.seq - b.seq);
  }

  cancel(name) {
    this.tasks = this.tasks.filter((k) => k.name !== name);
  }

  has(name) {
    return this.tasks.some((k) => k.name === name);
  }

  next(name) {
    return this.tasks.find((k) => k.name === name) || null;
  }

  clear() {
    this.tasks = [];
  }

  // Run every task due at or before t (tasks scheduled while running that
  // are already due run in the same call).
  run(t) {
    let guard = 0;
    while (this.tasks.length && this.tasks[0].t <= t + 1e-9) {
      const task = this.tasks.shift();
      task.fn(task.t);
      if (++guard > 10000) throw new Error('TaskList: runaway task chain');
    }
  }
}

// Crew responses to a flashing display. Each flashing display installs one
// pending response; the first PRO / V34 / ENTER (or V32) answers it. The
// same key may reach us twice (PINBALL's display callback and the program's
// onProceed()), so a second answer in the same instant is ignored.
export class ResponseRouter {
  constructor() {
    this.pending = null;
    this.lastT = null;
  }

  install(id, handlers) {
    this.pending = { id, handlers };
  }

  clear() {
    this.pending = null;
  }

  // kind: 'proceed' | 'terminate' | 'enter'
  answer(kind, t, id = null) {
    const p = this.pending;
    if (!p) return false;
    if (id !== null && p.id !== id) return false;
    if (t !== undefined && t === this.lastT) return false;
    const fn = p.handlers[kind];
    if (!fn) return false;
    this.pending = null;
    this.lastT = t;
    fn();
    return true;
  }
}

// Ask PINBALL for a display (GODSP / GOFLASH / GOPERF / REFLASH / CLOCPLAY).
// `flash` displays route their responses through `router`.
export function showDisplay(program, { verb, noun, flash = false, id = null, handlers = null, source = null }) {
  const agc = program.agc;
  program.display = { verb, noun, flash };
  let opts = { verb, noun, flash, source };
  if (flash && handlers) {
    const key = id || `${verb}/${noun}`;
    program.router.install(key, handlers);
    const answer = (kind) => () => program.router.answer(kind, agc.t, key);
    opts = {
      ...opts,
      onProceed: answer('proceed'),
      onTerminate: answer('terminate'),
      onEnter: answer('enter'),
      onRecycle: answer('enter'),
    };
  } else if (!flash) {
    program.router.clear();
  }
  agc.pinball?.showDisplay?.(opts);
}

export function setPhase(agc, name) {
  agc.workload?.setPhase?.(name);
}

export function setFlag(agc, name, on) {
  if (agc.flags && typeof agc.flags === 'object') agc.flags[name] = !!on;
}

export function setErasable(agc, name, value) {
  if (agc.erasable && typeof agc.erasable === 'object') agc.erasable[name] = value;
}

export function vehicleState(agc) {
  return agc.vehicle?.state || null;
}

// Restart protection (PHASCHNG): agc.restart.protect(group, phase, reenter).
// Phases are passed as the octal phase number of the source, e.g. 0o21 for
// "4.21" (group 4, phase 21).
export function protect(agc, group, phase, reenter) {
  agc.restart?.protect?.(group, phase, reenter);
}

export function unprotect(agc, group) {
  agc.restart?.clear?.(group);
}

export function emitBus(agc, type, payload) {
  agc.bus?.emit?.(type, payload);
}
