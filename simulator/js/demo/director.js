// The demo director: plays a scenario script (ARCHITECTURE §9) against a
// Simulation — narration, crew/ground voice, crew keystrokes, deterministic
// state changes, pauses for reading — on the scenario's GET timeline.
//
// Pure logic: no DOM, no `window`. It talks to the views only through the
// bus and through `state` (which the app hands to every view each frame).
//
// Timing model
//   The director keeps its own clock `t` (GET, s). `frame(realDt)` advances
//   it by realDt × speed, but never past the next due event: the simulation
//   is stepped exactly to the event time, the event fires, and stepping
//   continues. So every event fires at its exact GET whatever the frame rate
//   or playback speed, and a replay at 60× runs the same substeps as one at
//   1× (the Simulation accumulates dt into fixed 10 ms substeps, sim.js).
//
// Seeking is "reset + fast re-simulation" (§2): going back resets the sim
// and replays every event before the target silently (actions and crew
// keystrokes still execute — they change state; narration and voice go into
// history lists instead of being announced). Going forward fast-forwards
// from the current state, which yields the same state because everything
// that changes the sim in demo mode comes from the script. Events exactly
// AT the target fire live after the seek, so jumping to a chapter plays its
// opening narration (and its hold) as if the user had arrived there.

import { createBus } from '../util/bus.js';
import { parseGET } from '../util/time.js';
import { EVENT_KINDS, MIN_SPEED, MAX_SPEED, validateScenario } from './scenario-schema.js';

export const SPEEDS = Object.freeze([0.5, 1, 2, 4, 8, 16, 32, 60]);

const EPS = 1e-9;          // s; event times are compared with this slack
const SEEK_CHUNK = 1;      // s of sim time between budget checks while seeking
const SEEK_SLICE_MS = 20;  // ms of work before a seek yields to the browser
// Computer-model bus events the director records (for the history it hands
// to the views after a seek). §6.9.1 lists what the model emits.
const CAPTURED = Object.freeze(['alarm', 'restart', 'mode', 'burn', 'oprerr']);

export function clampSpeed(x) {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, x));
}

// Default way for a long seek to yield: a macrotask, so the browser can
// paint a frame (and the progress bar) between slices.
const defaultScheduler = () => new Promise((resolve) => setTimeout(resolve, 0));
// Wall-clock time is read ONLY to slice long seeks into ~20 ms chunks. It
// never influences the simulated result (chunk boundaries do not change the
// sequence of 10 ms substeps).
const defaultNow = () => {
  const perf = globalThis.performance;
  return perf && typeof perf.now === 'function' ? perf.now() : 0;
};

function chapterTitle(value) {
  return typeof value === 'string' ? value : value?.title ?? '';
}

// Turn the scenario's events into a flat, time-sorted list of single-kind
// items. Multi-kind events (rejected by the validator, tolerated here) are
// split in EVENT_KINDS order. The sort is stable, so events with equal `at`
// keep their authored order.
export function compileEvents(scenario, onError = () => {}) {
  const items = [];
  (scenario.events || []).forEach((raw, seq) => {
    if (!raw || typeof raw !== 'object') return;
    let t;
    try {
      t = parseGET(raw.at);
    } catch (err) {
      onError(err, raw);
      return;
    }
    if (!Number.isFinite(t)) return;
    EVENT_KINDS.forEach((kind, sub) => {
      if (raw[kind] !== undefined) items.push({ t, seq, sub, kind, value: raw[kind], raw });
    });
  });
  items.sort((a, b) => a.t - b.t || a.seq - b.seq || a.sub - b.sub);
  const chapters = [];
  for (const item of items) {
    if (item.kind === 'chapter') {
      item.chapterIndex = chapters.length;
      chapters.push(Object.freeze({ title: chapterTitle(item.value), t: item.t }));
    }
  }
  return { items, chapters };
}

const emptyHistory = () => ({ narrations: [], says: [], keys: [], log: [] });

export class Director {
  // options:
  //   bus        — shared event bus (the app's)
  //   createSim  — (scenario) => Simulation
  //   scheduler  — () => Promise|void; how a long seek yields (inject a
  //                synchronous `() => {}` in tests to seek synchronously)
  //   now        — () => ms; clock used only to size seek slices
  //   sliceMs    — work per seek slice before yielding (default 20 ms)
  //   autoplay   — start playing on load (default true; scenario.autoplay wins)
  //   autoPause  — honour `hold` events (default true)
  //   strict     — rethrow errors from scenario code instead of reporting them
  constructor({
    bus, createSim, scheduler, now, sliceMs = SEEK_SLICE_MS,
    autoplay = true, autoPause = true, strict = false,
  } = {}) {
    this.bus = bus || createBus();
    this.createSim = createSim;
    this.scheduler = scheduler || defaultScheduler;
    this.now = now || defaultNow;
    this.sliceMs = sliceMs;
    this.autoplay = autoplay;
    this.autoPause = !!autoPause;
    this.strict = !!strict;

    this.scenario = null;
    this.sim = null;
    this.playing = false;
    this.speed = 1;
    this.holding = null;   // { remaining, total } in real seconds
    this.seeking = null;   // { target, from, progress }
    this.ended = false;
    this.error = null;     // { message, what, t } of the last failure

    this.chapters = [];
    this.chapterIndex = -1;

    this._t = 0;
    this._start = 0;
    this._end = 0;
    this._events = [];
    this._next = 0;
    this._history = emptyHistory();
    this._seekToken = 0;
    this._capture = null;
    this._lastFocus = null;
    this._emittedChapter = -1;
    this._dirty = false;
    this._warned = new Set();
  }

  // ---------- read-only views ----------

  get t() {
    return this._t;
  }

  get state() {
    const duration = this._end - this._start;
    const pending = this._events[this._next];
    return {
      loaded: !!this.sim,
      scenarioId: this.scenario?.id ?? null,
      playing: this.playing,
      speed: this.speed,
      speeds: SPEEDS,
      t: this._t,
      start: this._start,
      end: this._end,
      duration,
      progress: duration > 0 ? Math.min(1, Math.max(0, (this._t - this._start) / duration)) : 0,
      chapterIndex: this.chapterIndex,
      chapters: this.chapters,
      chapter: this.chapters[this.chapterIndex] ?? null,
      holding: this.holding ? { remaining: this.holding.remaining, total: this.holding.total } : null,
      seeking: this.seeking ? { target: this.seeking.target, progress: this.seeking.progress } : null,
      autoPause: this.autoPause,
      ended: this.ended,
      nextEventIn: pending ? Math.max(0, pending.t - this._t) : null,
      error: this.error,
    };
  }

  // Copies of what has happened so far in this replay (same shape as the
  // 'director:seeked' payload) — for a view that mounts late.
  history() {
    return this._historyPayload('history');
  }

  // ---------- loading ----------

  load(scenario) {
    this._seekToken += 1; // abandon any seek in flight
    this._detachCapture();
    this.scenario = scenario;
    this.sim = null;
    this.playing = false;
    this.holding = null;
    this.seeking = null;
    this.ended = false;
    this.error = null;
    this._failures = 0;
    this._emittedChapter = -1;

    try {
      const check = validateScenario(scenario);
      if (!check.ok) {
        if (this.strict) throw new Error(`Invalid scenario:\n${check.errors.join('\n')}`);
        const key = scenario?.id ?? '?';
        if (!this._warned.has(key)) {
          this._warned.add(key);
          console.warn(`[director] scenario "${key}" has problems:\n  ${check.errors.join('\n  ')}`);
        }
      }
      this._start = parseGET(scenario.start);
      this._end = parseGET(scenario.end);
      const { items, chapters } = compileEvents(scenario, (err) => this._fail(err, 'compile'));
      this._events = items;
      this.chapters = chapters;
      this.speed = clampSpeed(Number.isFinite(scenario.speed) ? scenario.speed : 1);
      this._t = this._start;
      this.sim = this.createSim(scenario);
      this._rewind();
    } catch (err) {
      this.sim = null;
      this._fail(err, 'load');
      this.bus.emit('director:loaded', { scenario, ok: false });
      this._emitState();
      return false;
    }

    this.bus.emit('director:loaded', { scenario, ok: true });
    this.bus.emit('director:seeked', this._historyPayload('load'));
    this._emitChapter(true);
    this.playing = scenario.autoplay ?? this.autoplay;
    this._fireDue(false);
    this._dirty = false;
    this._emitState();
    return true;
  }

  // Director clock back to `start` with an empty history, on a sim that is
  // in its construction state (fresh or just reset). Runs scenario.setup.
  _rewind() {
    this._t = this._start;
    this._next = 0;
    this.chapterIndex = this.chapters.length ? 0 : -1;
    this._lastFocus = null;
    this._history = emptyHistory();
    this._attachCapture();
    // The initial program was started inside the Simulation constructor /
    // reset(), before we could listen; record it as the first log line.
    const mode = this.sim?.agc?.mode;
    if (Number.isFinite(mode)) {
      this._history.log.push({ kind: 'mode', t: this._start, mode, prev: null, initial: true });
    }
    if (typeof this.scenario?.setup === 'function') {
      this._guard(() => this.scenario.setup(this.sim), 'setup');
    }
  }

  // ---------- transport ----------

  play() {
    if (!this.sim) return;
    if (this.ended || this._t >= this._end - EPS) {
      this.restart();
      return;
    }
    if (!this.playing) {
      this.playing = true;
      this._emitState();
    }
  }

  pause() {
    if (this.playing) {
      this.playing = false;
      this._emitState();
    }
  }

  toggle() {
    if (this.playing && !this.ended) this.pause();
    else this.play();
  }

  restart() {
    if (!this.sim) return Promise.resolve(false);
    this.playing = true;
    this.ended = false;
    return this.seek(this._start);
  }

  // Skip the current hold (the "Continue" button); also un-pauses.
  resume() {
    if (!this.sim) return;
    this.holding = null;
    if (this.ended) {
      this._emitState();
      return;
    }
    this.playing = true;
    this._emitState();
  }

  setSpeed(x) {
    const speed = Number(x);
    if (!Number.isFinite(speed) || speed <= 0) return this.speed;
    const clamped = clampSpeed(speed);
    if (clamped !== this.speed) {
      this.speed = clamped;
      this._emitState();
    }
    return this.speed;
  }

  // Next listed speed up (+1) or down (-1) from the current one.
  stepSpeed(direction) {
    const list = SPEEDS;
    const next = direction > 0
      ? list.find((s) => s > this.speed + EPS) ?? list[list.length - 1]
      : [...list].reverse().find((s) => s < this.speed - EPS) ?? list[0];
    return this.setSpeed(next);
  }

  setAutoPause(on) {
    this.autoPause = !!on;
    if (!this.autoPause && this.holding) this.holding = null;
    this._emitState();
  }

  nextChapter() {
    const ref = this.seeking ? this.seeking.target : this._t;
    const next = this.chapters.find((c) => c.t > ref + EPS);
    return next ? this.seek(next.t) : Promise.resolve(false);
  }

  // Like a media player's "previous": back to the start of the current
  // chapter, or to the previous chapter when we are already near its start.
  prevChapter() {
    const ref = this.seeking ? this.seeking.target : this._t;
    let i = -1;
    this.chapters.forEach((c, k) => {
      if (c.t <= ref + EPS) i = k;
    });
    if (i < 0) return this.seek(this._start);
    const into = ref - this.chapters[i].t;
    const threshold = Math.max(2, 1.5 * this.speed); // ≈ 1.5–2 s of real time
    if (into > threshold) return this.seek(this.chapters[i].t);
    return this.seek(i > 0 ? this.chapters[i - 1].t : this._start);
  }

  // ---------- the frame loop ----------

  frame(realDt) {
    if (!this.sim || this.seeking || !this.playing) return;
    let real = Number.isFinite(realDt) && realDt > 0 ? realDt : 0;

    if (!this.holding) this._fireDue(false); // e.g. events left at this instant after a skipped hold
    for (let guard = 0; guard < 100000 && this.playing && !this.seeking; guard++) {
      if (this.holding) {
        if (real <= 0) break;
        const use = Math.min(real, this.holding.remaining);
        this.holding.remaining -= use;
        real -= use;
        if (this.holding.remaining > 1e-6) break;
        this.holding = null;
        this._dirty = true;
        this._fireDue(false);
        continue;
      }
      if (this._t >= this._end - EPS) {
        this._finish();
        break;
      }
      if (real <= EPS) break;
      const pending = this._events[this._next];
      const goal = Math.max(this._t, Math.min(this._t + real * this.speed, pending ? pending.t : Infinity, this._end));
      const used = (goal - this._t) / this.speed;
      this._advanceTo(goal);
      real = Math.max(0, real - used);
      this._fireDue(false);
    }
    if (this._dirty) {
      this._dirty = false;
      this._emitState();
    }
  }

  _finish() {
    this._t = this._end;
    this.playing = false;
    this.holding = null;
    if (!this.ended) {
      this.ended = true;
      this.bus.emit('director:ended', { t: this._t, scenarioId: this.scenario?.id ?? null });
    }
    this._dirty = true;
  }

  // Step the sim up to `goal`. Returns false (and pauses) if the model threw.
  _advanceTo(goal) {
    const dt = goal - this._t;
    if (dt > 0) {
      try {
        this.sim.step(dt);
      } catch (err) {
        this.playing = false;
        this._fail(err, 'sim.step');
        return false;
      }
    }
    this._t = goal;
    return true;
  }

  // Fire every pending event whose time has come. A hold stops the batch:
  // events authored after it at the same instant wait until it ends.
  _fireDue(silent) {
    while (this._next < this._events.length) {
      const ev = this._events[this._next];
      if (ev.t > this._t + EPS) break;
      this._next += 1;
      this._fire(ev, silent);
      if (!silent && this.holding) break;
    }
  }

  _fire(ev, silent) {
    const { kind, value, raw } = ev;
    const t = ev.t;
    switch (kind) {
      case 'chapter':
        this.chapterIndex = ev.chapterIndex;
        if (!silent) {
          this._emitChapter(false);
          this._dirty = true;
        }
        break;

      case 'narrate': {
        const anchors = Array.isArray(value.anchors) ? value.anchors.filter((a) => typeof a === 'string') : [];
        const narration = {
          t,
          title: value.title ?? '',
          body: value.body ?? '',
          anchors,
          focus: value.focus ?? null,
          chapter: this.chapters[this.chapterIndex]?.title ?? null,
          chapterIndex: this.chapterIndex,
        };
        this._history.narrations.push(narration);
        if (value.focus) this._lastFocus = value.focus;
        if (!silent) {
          this.bus.emit('narrate', narration);
          if (anchors.length) this.bus.emit('source:show', { anchors, primary: anchors[0], from: 'narrate' });
          if (value.focus) this.bus.emit('focus', { panel: value.focus });
        }
        break;
      }

      case 'say': {
        const line = {
          t,
          who: value.who ?? '',
          text: value.text ?? '',
          src: value.src ?? null,
          role: value.role ?? null,
          channel: value.channel ?? null,
          note: value.note ?? null,
          alt: value.alt ?? null,
          id: value.id ?? null,
        };
        this._history.says.push(line);
        this._history.log.push({ kind: 'say', ...line });
        if (!silent) this.bus.emit('say', line);
        break;
      }

      case 'keys': {
        const entry = { t, who: raw.who ?? null, script: String(value) };
        this._history.keys.push(entry);
        this._history.log.push({ kind: 'keys', ...entry });
        const options = { source: 'crew' };
        if (Number.isFinite(raw.gapMs)) options.gapMs = raw.gapMs;
        this._guard(() => this.sim.agc.keys(entry.script, options), 'keys', ev);
        if (!silent) this.bus.emit('director:keys', entry);
        break;
      }

      case 'action':
        if (typeof value === 'function') this._guard(() => value(this.sim), 'action', ev);
        break;

      case 'hold':
        if (!silent && this.autoPause && Number.isFinite(value) && value > 0) {
          this.holding = { remaining: value, total: value };
          this.bus.emit('hold', { seconds: value, t });
          this._dirty = true;
        }
        break;

      case 'spotlight':
        if (!silent) {
          for (const target of Array.isArray(value) ? value : [value]) {
            this.bus.emit('spotlight', { target });
          }
        }
        break;

      case 'focus':
        this._lastFocus = value;
        if (!silent) this.bus.emit('focus', { panel: value });
        break;

      case 'speed':
        // A scenario hint (e.g. fast-forward a quiet coast). Applies when it
        // fires, also silently during a seek: after seeking, the speed is the
        // one the script asks for at that point (if it asked for any).
        if (Number.isFinite(value) && value > 0) {
          const s = clampSpeed(value);
          if (s !== this.speed) {
            this.speed = s;
            this._dirty = true;
          }
        }
        break;

      default:
        break;
    }
  }

  // ---------- seeking ----------

  // Returns a Promise<boolean>: true when the seek completed, false when it
  // was superseded by another seek or load. With a synchronous scheduler the
  // seek completes before seek() returns.
  seek(get) {
    if (!this.sim) return Promise.resolve(false);
    let target;
    try {
      target = parseGET(get);
    } catch {
      return Promise.resolve(false);
    }
    if (!Number.isFinite(target)) return Promise.resolve(false);
    target = Math.min(this._end, Math.max(this._start, target));

    const token = ++this._seekToken;
    this.holding = null;
    this.ended = false;
    const lastFocus = this._lastFocus;
    this.sim.setMuted?.(true);

    if (target < this._t - EPS) {
      try {
        if (typeof this.sim.reset === 'function') {
          this.sim.reset();
        } else {
          this.sim = this.createSim(this.scenario);
          this.sim.setMuted?.(true);
        }
        this._rewind();
      } catch (err) {
        this._fail(err, 'seek reset');
        this.sim.setMuted?.(false);
        this._emitState();
        return Promise.resolve(false);
      }
    }

    this.seeking = { target, from: this._t, progress: 0, lastFocus };
    this._emitState();
    return this._seekLoop(token);
  }

  _seekLoop(token) {
    let sliceStart = this.now();
    try {
      for (;;) {
        if (token !== this._seekToken) return Promise.resolve(false);
        const { target, from } = this.seeking;

        // Events strictly before the target: silently, in order.
        while (this._next < this._events.length) {
          const ev = this._events[this._next];
          if (ev.t > this._t + EPS || ev.t >= target - EPS) break;
          this._next += 1;
          this._fire(ev, true);
        }
        if (this._t >= target - EPS) break;

        const pending = this._events[this._next];
        const stop = pending && pending.t < target ? pending.t : target;
        if (!this._advanceTo(Math.min(stop, this._t + SEEK_CHUNK))) {
          this.seeking.target = this._t; // the model failed: stop here
          break;
        }
        this.seeking.progress = target > from ? Math.min(1, (this._t - from) / (target - from)) : 1;

        if (this.now() - sliceStart >= this.sliceMs) {
          const wait = this.scheduler();
          if (wait && typeof wait.then === 'function') {
            return wait.then(() => this._seekLoop(token));
          }
          sliceStart = this.now();
        }
      }
    } catch (err) {
      this._fail(err, 'seek');
    }
    if (token !== this._seekToken) return Promise.resolve(false);
    return Promise.resolve(this._finishSeek());
  }

  _finishSeek() {
    const { target, lastFocus } = this.seeking;
    this._t = target;
    this.sim.setMuted?.(false);
    this.seeking = null;
    this.bus.emit('director:seeked', this._historyPayload('seek'));
    this._emitChapter(true);
    if (this._lastFocus && this._lastFocus !== lastFocus) this.bus.emit('focus', { panel: this._lastFocus });
    this._fireDue(false); // events exactly at the target fire live
    if (this._t >= this._end - EPS && !this.holding) this._finish();
    this._dirty = false;
    this._emitState();
    return true;
  }

  // ---------- history & capture ----------

  _historyPayload(reason) {
    const h = this._history;
    return {
      reason,
      t: this._t,
      narrations: h.narrations.slice(),
      says: h.says.slice(),
      keys: h.keys.slice(),
      log: h.log.slice(),
    };
  }

  // Record the computer's own events (alarms, restarts, program changes,
  // BURNBABY steps) from the simulation's internal bus — which carries them
  // whether or not the sim is muted — so a seek can hand the transcript a
  // complete history.
  _attachCapture() {
    this._detachCapture();
    const bus = this.sim?.bus;
    if (!bus || typeof bus.on !== 'function') return;
    const offs = CAPTURED.map((type) => bus.on(type, (payload) => {
      const t = Number.isFinite(payload?.t) ? payload.t : this.sim?.t ?? this._t;
      this._history.log.push({ ...payload, kind: type, t });
    }));
    this._capture = { offs };
  }

  _detachCapture() {
    if (this._capture) for (const off of this._capture.offs) off?.();
    this._capture = null;
  }

  // ---------- plumbing ----------

  _emitChapter(force) {
    const i = this.chapterIndex;
    if (i < 0 || !this.chapters[i]) return;
    if (!force && i === this._emittedChapter) return;
    this._emittedChapter = i;
    const c = this.chapters[i];
    this.bus.emit('chapter', { index: i, title: c.title, t: c.t, count: this.chapters.length });
  }

  _emitState() {
    this.bus.emit('director:state', this.state);
  }

  _guard(fn, what, ev) {
    try {
      fn();
    } catch (err) {
      this._fail(err, what, ev);
    }
  }

  _fail(err, what, ev) {
    const message = err?.message || String(err);
    this.error = { message, what, t: this._t };
    if (this.strict) throw err;
    this._failures = (this._failures || 0) + 1;
    if (this._failures <= 5) console.error(`[director] ${what} failed at GET ${this._t.toFixed(2)} s${ev ? ` (event @${ev.raw?.at})` : ''}:`, err);
    this.bus.emit('director:error', { what, message, t: this._t, at: ev?.raw?.at ?? null });
  }
}
