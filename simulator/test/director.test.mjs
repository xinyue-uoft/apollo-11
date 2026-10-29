// Director (demo player), scenario validator and narration sanitiser.
// Run: node --test simulator/test/director.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../js/util/bus.js';
import { parseGET } from '../js/util/time.js';
import { Director, SPEEDS, compileEvents, readingTime, READ_MAX } from '../js/demo/director.js';
import { validateScenario } from '../js/demo/scenario-schema.js';
import { sanitizeHtml, findDisallowedMarkup, formatOctal } from '../js/ui/html.js';

// ---------- fixtures ----------

// A stand-in for Simulation: records every step and keystroke script, has an
// internal bus like the real one (computer events go there), and supports
// reset/setMuted.
class FakeSim {
  constructor(scenario, journal) {
    this.t0 = parseGET(scenario.start);
    this.journal = journal;
    this.resets = 0;
    this.muted = false;
    this.reset();
    this.resets = 0;
  }

  reset() {
    this.resets += 1;
    this.t = this.t0;
    this.steps = [];
    this.bus = createBus();
    const sim = this;
    this.agc = {
      mode: 63,
      keys(script, options) {
        sim.journal.push({ what: 'keys', t: sim.t, script, source: options.source, gapMs: options.gapMs });
      },
    };
  }

  setMuted(muted) {
    this.muted = !!muted;
  }

  step(dt) {
    this.steps.push(dt);
    this.t += dt;
  }
}

const T0 = '102:38:00';
const at = (s) => parseGET(T0) + s;
const g = (s) => {
  // seconds after T0 → "hhh:mm:ss.s"
  const t = at(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
};

function tinyScenario(extra = {}) {
  return {
    id: 'tiny',
    title: 'Tiny',
    summary: 'A tiny test scenario.',
    software: 'Luminary099',
    vehicle: 'static',
    start: g(0),
    end: g(60),
    initialProgram: 63,
    events: [
      { at: g(0), chapter: 'One' },
      { at: g(0), narrate: { title: 'Hello', body: 'First <b>card</b>.', anchors: ['exec.novac'] } },
      { at: g(2.5), action: (sim) => sim.journal.push({ what: 'action', id: 'a1', t: sim.t }) },
      { at: g(5), keys: 'V16N68E', who: 'Aldrin' },
      { at: g(10), say: { who: 'Armstrong', text: 'Program alarm.', src: 'ALSJ' } },
      { at: g(10), hold: 3 },
      { at: g(10), action: (sim) => sim.journal.push({ what: 'action', id: 'a2', t: sim.t }) },
      { at: g(20), chapter: 'Two' },
      { at: g(20), narrate: { title: 'Second', body: 'More.', focus: 'exec' } },
      { at: g(31), say: { who: 'Duke', text: 'We\'re Go on that alarm.' } },
      { at: g(40), chapter: 'Three' },
      { at: g(45.25), action: (sim) => sim.journal.push({ what: 'action', id: 'a3', t: sim.t }) },
      { at: g(50), spotlight: 'dsky.light.prog' },
    ],
    ...extra,
  };
}

function makeDirector(options = {}) {
  const bus = createBus();
  const journal = [];
  const emitted = [];
  bus.on('*', ({ type, payload }) => emitted.push({ type, payload }));
  const sims = [];
  const d = new Director({
    bus,
    createSim: (scenario) => {
      const sim = new FakeSim(scenario, journal);
      sims.push(sim);
      return sim;
    },
    scheduler: () => {}, // synchronous seeks
    autoplay: false,
    ...options,
  });
  return { d, bus, journal, emitted, sims };
}

const ofType = (emitted, type) => emitted.filter((e) => e.type === type).map((e) => e.payload);
const actions = (journal) => journal.filter((j) => j.what === 'action').map((j) => j.id);

function playToEnd(d, dt) {
  for (let i = 0; i < 100000 && !d.ended; i++) d.frame(typeof dt === 'function' ? dt(i) : dt);
}

// ---------- director ----------

test('load builds the sim, fires start events and announces the first chapter', () => {
  const { d, emitted, sims } = makeDirector();
  assert.equal(d.load(tinyScenario()), true);
  assert.equal(sims.length, 1);
  assert.equal(d.state.t, at(0));
  assert.equal(d.state.start, at(0));
  assert.equal(d.state.end, at(60));
  assert.deepEqual(d.state.chapters.map((c) => c.title), ['One', 'Two', 'Three']);
  assert.equal(d.state.chapterIndex, 0);
  assert.equal(d.state.playing, false);
  const types = emitted.map((e) => e.type);
  assert.ok(types.includes('director:loaded'));
  assert.ok(types.includes('director:state'));
  assert.equal(ofType(emitted, 'chapter').length, 1, 'chapter 0 announced exactly once');
  assert.equal(ofType(emitted, 'chapter')[0].title, 'One');
  assert.equal(ofType(emitted, 'narrate').length, 1, 'narration at start fires on load');
  assert.deepEqual(ofType(emitted, 'source:show')[0].anchors, ['exec.novac']);
});

test('events fire once, in order, at exact times whatever the frame size', () => {
  const runs = [0.016, 0.37, 7, (i) => [0.01, 0.2, 1.3, 0.05][i % 4]].map((dt) => {
    const { d, journal, emitted } = makeDirector({ autoPause: false });
    d.load(tinyScenario());
    d.setSpeed(4);
    d.play();
    playToEnd(d, dt);
    return { d, journal, emitted };
  });
  for (const { d, journal, emitted } of runs) {
    assert.deepEqual(actions(journal), ['a1', 'a2', 'a3']);
    const times = journal.filter((j) => j.what === 'action').map((j) => j.t);
    assert.ok(Math.abs(times[0] - at(2.5)) < 1e-6, `a1 at ${times[0] - at(0)}`);
    assert.ok(Math.abs(times[1] - at(10)) < 1e-6);
    assert.ok(Math.abs(times[2] - at(45.25)) < 1e-6);
    const keys = journal.filter((j) => j.what === 'keys');
    assert.equal(keys.length, 1);
    assert.equal(keys[0].script, 'V16N68E');
    assert.equal(keys[0].source, 'crew');
    assert.ok(Math.abs(keys[0].t - at(5)) < 1e-6);
    assert.deepEqual(ofType(emitted, 'say').map((s) => s.text), ['Program alarm.', 'We\'re Go on that alarm.']);
    assert.equal(ofType(emitted, 'say')[0].t, at(10));
    assert.deepEqual(ofType(emitted, 'chapter').map((c) => c.index), [0, 1, 2]);
    assert.equal(ofType(emitted, 'narrate').length, 2);
    assert.deepEqual(ofType(emitted, 'focus'), [{ panel: 'exec' }]);
    assert.deepEqual(ofType(emitted, 'spotlight'), [{ target: 'dsky.light.prog' }]);
    assert.equal(ofType(emitted, 'director:keys')[0].who, 'Aldrin');
    // ended exactly at `end`
    assert.equal(d.state.t, at(60));
    assert.equal(d.state.playing, false);
    assert.equal(d.state.ended, true);
    assert.equal(ofType(emitted, 'director:ended').length, 1);
  }
});

test('the sim is stepped exactly to event times and never past end', () => {
  const { d, sims } = makeDirector({ autoPause: false });
  d.load(tinyScenario());
  d.setSpeed(60);
  d.play();
  playToEnd(d, 0.1);
  const sim = sims[0];
  const total = sim.steps.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 60) < 1e-6, `stepped ${total} s`);
  assert.ok(sim.steps.every((s) => s > 0));
  d.frame(0.1); // after the end: nothing
  assert.ok(Math.abs(sim.steps.reduce((a, b) => a + b, 0) - 60) < 1e-6);
});

test('hold pauses the clock only with auto-pause; resume() skips it', () => {
  // auto-pause on
  {
    const { d, journal, emitted } = makeDirector();
    d.load(tinyScenario());
    d.play();
    d.frame(10); // reaches the hold at +10 and stops there
    assert.equal(d.state.t, at(10));
    assert.ok(d.state.holding, 'holding');
    assert.equal(d.state.holding.total, 3);
    assert.deepEqual(actions(journal), ['a1'], 'event after the hold at the same instant waits');
    assert.equal(ofType(emitted, 'hold').length, 1);
    d.frame(1);
    assert.equal(d.state.t, at(10), 'clock frozen while holding');
    assert.ok(Math.abs(d.state.holding.remaining - 2) < 1e-9);
    d.pause();
    d.frame(5);
    assert.ok(Math.abs(d.state.holding.remaining - 2) < 1e-9, 'countdown frozen while paused');
    d.play();
    d.frame(2.5); // 2 s finish the hold, 0.5 s advance the clock
    assert.equal(d.state.holding, null);
    assert.deepEqual(actions(journal), ['a1', 'a2']);
    assert.ok(Math.abs(d.state.t - at(10.5)) < 1e-9);
  }
  // resume() skips
  {
    const { d, journal } = makeDirector();
    d.load(tinyScenario());
    d.play();
    d.frame(10);
    assert.ok(d.state.holding);
    d.resume();
    assert.equal(d.state.holding, null);
    d.frame(0.016);
    assert.deepEqual(actions(journal), ['a1', 'a2']);
  }
  // auto-pause off: no hold at all
  {
    const { d, emitted } = makeDirector({ autoPause: false });
    d.load(tinyScenario());
    d.play();
    d.frame(12);
    assert.equal(d.state.holding, null);
    assert.equal(d.state.t, at(12));
    assert.equal(ofType(emitted, 'hold').length, 0);
  }
  // turning auto-pause off releases a hold in progress
  {
    const { d } = makeDirector();
    d.load(tinyScenario());
    d.play();
    d.frame(10);
    d.setAutoPause(false);
    assert.equal(d.state.holding, null);
    assert.equal(d.state.autoPause, false);
  }
});

test('seek is deterministic: same actions, same keys, history rebuilt', () => {
  // Reference: watch straight through to +47.
  const ref = makeDirector({ autoPause: false });
  ref.d.load(tinyScenario());
  ref.d.play();
  for (let i = 0; i < 470; i++) ref.d.frame(0.1);
  assert.ok(Math.abs(ref.d.state.t - at(47)) < 1e-6);

  // Same point by a forward seek from the start.
  const fwd = makeDirector({ autoPause: false });
  fwd.d.load(tinyScenario());
  const seeked = [];
  fwd.bus.on('director:seeked', (p) => seeked.push(p));
  fwd.d.seek(g(47));
  assert.equal(fwd.d.state.t, at(47));
  assert.equal(fwd.d.state.seeking, null);
  assert.deepEqual(actions(fwd.journal), actions(ref.journal));
  assert.deepEqual(fwd.journal.filter((j) => j.what === 'keys').map((k) => k.script), ['V16N68E']);
  assert.equal(fwd.sims[0].muted, false, 'unmuted after the seek');
  const last = seeked.at(-1);
  assert.deepEqual(last.narrations.map((n) => n.title), ['Hello', 'Second']);
  assert.deepEqual(last.says.map((s) => s.who), ['Armstrong', 'Duke']);
  assert.deepEqual(last.keys.map((k) => k.script), ['V16N68E']);
  assert.equal(last.log[0].kind, 'mode', 'log starts with the initial program');
  assert.equal(fwd.d.state.chapterIndex, 2);
  // silent: no live narrate/say emitted for the skipped part
  assert.equal(ofType(fwd.emitted, 'say').length, 0);
  assert.equal(ofType(fwd.emitted, 'narrate').length, 1, 'only the load-time narration was live');

  // Backward seek: reset + replay; then play on to the end.
  fwd.d.seek(g(12));
  assert.equal(fwd.sims[0].resets, 1, 'sim.reset() used');
  assert.equal(fwd.d.state.t, at(12));
  assert.deepEqual(actions(fwd.journal), ['a1', 'a2', 'a3', 'a1', 'a2'], 'replayed actions re-execute');
  const back = seeked.at(-1);
  assert.deepEqual(back.narrations.map((n) => n.title), ['Hello']);
  assert.deepEqual(back.says.map((s) => s.text), ['Program alarm.']);
  assert.equal(fwd.d.state.chapterIndex, 0);
  assert.equal(ofType(fwd.emitted, 'chapter').at(-1).title, 'One');

  // Computer events from the sim's internal bus are captured into the log.
  fwd.sims[0].bus.emit('alarm', { code: 0o1202, t: at(12), text: 'Executive overflow', restart: true });
  fwd.d.seek(g(13));
  const withAlarm = seeked.at(-1).log.filter((l) => l.kind === 'alarm');
  assert.equal(withAlarm.length, 1);
  assert.equal(withAlarm[0].code, 0o1202);
});

test('events exactly at the seek target fire live (chapter jumps play their opening)', () => {
  const { d, emitted } = makeDirector();
  d.load(tinyScenario());
  const before = ofType(emitted, 'narrate').length;
  d.seek(g(20));
  const narr = ofType(emitted, 'narrate');
  assert.equal(narr.length, before + 1);
  assert.equal(narr.at(-1).title, 'Second');
  assert.equal(ofType(emitted, 'focus').at(-1).panel, 'exec');
});

test('chapter navigation', () => {
  const { d } = makeDirector({ autoPause: false });
  d.load(tinyScenario());
  d.nextChapter();
  assert.equal(d.state.t, at(20));
  assert.equal(d.state.chapterIndex, 1);
  d.nextChapter();
  assert.equal(d.state.t, at(40));
  assert.equal(d.state.chapterIndex, 2);
  d.nextChapter(); // no further chapter: stays
  assert.equal(d.state.t, at(40));
  d.prevChapter(); // at the very start of chapter 3 → chapter 2
  assert.equal(d.state.t, at(20));
  d.play();
  d.frame(10); // 10 s into chapter 2
  assert.equal(d.state.t, at(30));
  d.prevChapter(); // well into it → back to its start
  assert.equal(d.state.t, at(20));
  d.prevChapter();
  assert.equal(d.state.t, at(0));
  d.prevChapter(); // stays at the start
  assert.equal(d.state.t, at(0));
});

test('end handling: play at the end restarts', () => {
  const { d, emitted } = makeDirector({ autoPause: false });
  d.load(tinyScenario());
  d.seek(g(59));
  d.play();
  d.frame(2);
  assert.equal(d.state.t, at(60));
  assert.equal(d.state.ended, true);
  assert.equal(d.state.playing, false);
  assert.equal(ofType(emitted, 'director:ended').length, 1);
  d.play(); // restart from the top
  assert.equal(d.state.t, at(0));
  assert.equal(d.state.playing, true);
  assert.equal(d.state.ended, false);
});

test('speed clamping, stepping and scenario speed hints', () => {
  const { d } = makeDirector({ autoPause: false });
  d.load(tinyScenario({ speed: 8 }));
  assert.equal(d.state.speed, 8, 'scenario default speed');
  assert.equal(d.setSpeed(1000), 60);
  assert.equal(d.setSpeed(0.01), 0.5);
  assert.equal(d.setSpeed(Number.NaN), 0.5, 'NaN ignored');
  assert.equal(d.setSpeed(-3), 0.5, 'negative ignored');
  assert.equal(d.setSpeed(3), 3);
  assert.equal(d.stepSpeed(+1), 4);
  assert.equal(d.stepSpeed(-1), 2);
  d.setSpeed(60);
  assert.equal(d.stepSpeed(+1), 60);
  d.setSpeed(0.5);
  assert.equal(d.stepSpeed(-1), 0.5);
  assert.deepEqual([...SPEEDS], [0.5, 1, 2, 4, 8, 16, 32, 60]);

  // `speed` events change the speed when they fire, and after a seek the
  // speed is the one the script asks for at that point.
  const s = tinyScenario();
  s.events.splice(3, 0, { at: g(4), speed: 32 });
  const { d: d2 } = makeDirector({ autoPause: false });
  d2.load(s);
  d2.setSpeed(2);
  d2.play();
  d2.frame(1); // 2 s
  assert.equal(d2.state.speed, 2);
  d2.frame(1.5); // crosses +4
  assert.equal(d2.state.speed, 32);
  d2.setSpeed(1);
  d2.seek(g(2)); // before the hint: user speed kept
  assert.equal(d2.state.speed, 1);
  d2.seek(g(30)); // past the hint
  assert.equal(d2.state.speed, 32);
});

test('seeking back drops a speed set by a later hint; a user speed is kept', () => {
  const s = tinyScenario({ speed: 4 });
  s.events.splice(9, 0, { at: g(25), speed: 16 });
  const { d } = makeDirector({ autoPause: false });
  d.load(s);
  d.seek(g(30));
  assert.equal(d.state.speed, 16, 'the hint applies after a forward seek past it');
  d.seek(g(20)); // back to chapter 2, before the hint
  assert.equal(d.state.t, at(20));
  assert.equal(d.state.speed, 4, 'the scenario speed, not the hint\'s');
  d.seek(g(40));
  assert.equal(d.state.speed, 16);
  d.restart();
  assert.equal(d.state.speed, 4, 'restart ("Watch again") plays at the scenario speed');

  // A speed the user picks is theirs: kept when seeking back.
  d.setSpeed(2);
  d.seek(g(10));
  assert.equal(d.state.speed, 2);
  d.seek(g(30));
  assert.equal(d.state.speed, 16, 'hints still apply on the way forward');
  d.setSpeed(8); // chosen after the hint
  d.seek(g(5));
  assert.equal(d.state.speed, 8);
});

test('a seek superseding a running seek still switches to the panel the target needs', async () => {
  const bus = createBus();
  const focus = [];
  bus.on('focus', (p) => focus.push(p.panel));
  let clock = 0;
  const pending = [];
  const d = new Director({
    bus,
    createSim: (sc) => new FakeSim(sc, []),
    autoplay: false,
    autoPause: false,
    now: () => (clock += 7),
    sliceMs: 20,
    scheduler: () => new Promise((resolve) => pending.push(resolve)),
  });
  d.load(tinyScenario());
  const p1 = d.seek(g(50));
  // let the first replay get past the narration at +20 (focus: exec)
  while (d.t < at(25) && pending.length) {
    pending.shift()();
    await new Promise((r) => setImmediate(r));
  }
  assert.ok(d.state.seeking && d.t >= at(25), 'first seek still running past +20');
  assert.deepEqual(focus, [], 'nothing announced yet');
  const p2 = d.seek(g(30));
  while (pending.length) {
    pending.shift()();
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(await p1, false);
  assert.equal(await p2, true);
  assert.equal(d.state.t, at(30));
  assert.deepEqual(focus, ['exec'], 'the focus the views were never told about is sent');
});

test('cancelSeek abandons a running seek without announcing anything', async () => {
  const bus = createBus();
  const emitted = [];
  bus.on('*', ({ type }) => emitted.push(type));
  let clock = 0;
  const pending = [];
  const sims = [];
  const d = new Director({
    bus,
    createSim: (sc) => {
      const sim = new FakeSim(sc, []);
      sims.push(sim);
      return sim;
    },
    autoplay: false,
    autoPause: false,
    now: () => (clock += 7),
    sliceMs: 20,
    scheduler: () => new Promise((resolve) => pending.push(resolve)),
  });
  d.load(tinyScenario());
  d.cancelSeek(); // no seek: nothing happens
  const p = d.seek(g(50));
  assert.ok(d.state.seeking);
  assert.equal(sims[0].muted, true);
  d.cancelSeek();
  assert.equal(d.state.seeking, null);
  assert.equal(sims[0].muted, false, 'unmuted');
  const before = emitted.length;
  while (pending.length) {
    pending.shift()();
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(await p, false);
  const after = emitted.slice(before);
  for (const type of ['director:seeked', 'chapter', 'focus', 'narrate', 'say']) {
    assert.ok(!after.includes(type), `no ${type} after the cancel`);
  }
});

// ---------- reading holds (auto-pause) ----------

test('readingTime: 200 words a minute plus 3 s, markup ignored, capped', () => {
  assert.equal(readingTime({ title: '', body: '' }), 3);
  // 2 + 8 words, tags and character references are not words
  const t = readingTime({ title: 'Two words', body: '<p>one <b>two</b> three&nbsp;four</p><ul><li>five six seven eight</li></ul>' });
  assert.ok(Math.abs(t - (3 + 10 * 0.3)) < 1e-9, `got ${t}`);
  assert.equal(readingTime({ title: 'x', body: 'word '.repeat(1000) }), READ_MAX);
  assert.equal(readingTime(null), 3);
});

// Alpha (11 words: 6.3 s to read) is followed 10 s later by Beta; at 4×
// that is 2.5 s of real time.
function readScenario() {
  return tinyScenario({
    events: [
      { at: g(0), chapter: 'One' },
      { at: g(0), narrate: { title: 'Alpha', body: 'one two three four five six seven eight nine ten' } },
      { at: g(4), action: (sim) => sim.journal.push({ what: 'action', id: 'a1', t: sim.t }) },
      { at: g(10), chapter: 'Two' },
      { at: g(10), narrate: { title: 'Beta', body: 'b' } },
      { at: g(10), action: (sim) => sim.journal.push({ what: 'action', id: 'a2', t: sim.t }) },
      { at: g(12), hold: 2 },
      { at: g(30), narrate: { title: 'Gamma', body: 'g' } },
      { at: g(40), action: (sim) => sim.journal.push({ what: 'action', id: 'a3', t: sim.t }) },
    ],
  });
}

test('auto-pause holds the next explanation until the card on screen has been read', () => {
  const { d, journal, emitted, sims } = makeDirector();
  d.load(readScenario());
  d.setSpeed(4);
  d.play();
  d.frame(2.5); // reaches +10
  assert.equal(d.state.t, at(10));
  assert.ok(d.state.holding, 'reading hold');
  assert.equal(d.state.holding.reason, 'reading');
  assert.ok(Math.abs(d.state.holding.total - (6.3 - 2.5)) < 1e-9, `hold ${d.state.holding.total}`);
  assert.equal(d.state.chapterIndex, 0, 'the chapter changes together with the card');
  assert.deepEqual(ofType(emitted, 'narrate').map((n) => n.title), ['Alpha']);
  assert.deepEqual(actions(journal), ['a1'], 'events at the held instant wait');
  assert.deepEqual(ofType(emitted, 'hold').map((h) => h.reason), ['reading']);
  const stepped = sims[0].steps.reduce((a, b) => a + b, 0);
  d.frame(3);
  assert.equal(d.state.t, at(10), 'clock frozen');
  assert.equal(sims[0].steps.reduce((a, b) => a + b, 0), stepped, 'the sim is not stepped while holding');
  d.frame(0.8); // 0.8 s finishes the hold, nothing left over
  assert.equal(d.state.holding, null);
  assert.deepEqual(ofType(emitted, 'narrate').map((n) => n.title), ['Alpha', 'Beta']);
  assert.equal(d.state.chapterIndex, 1);
  assert.deepEqual(actions(journal), ['a1', 'a2']);
  // Beta (2 words, 3.6 s) gets the 2-s script hold at +12 (a minimum) and
  // then 4.5 s more before Gamma: no reading hold there.
  d.frame(0.5);
  assert.equal(d.state.holding.reason, 'script');
  playToEnd(d, 0.25);
  assert.deepEqual(ofType(emitted, 'hold').map((h) => h.reason), ['reading', 'script']);
  assert.deepEqual(actions(journal), ['a1', 'a2', 'a3']);
});

test('reading holds: none without auto-pause; paused time and Continue count as read', () => {
  {
    const { d, emitted } = makeDirector({ autoPause: false });
    d.load(readScenario());
    d.setSpeed(4);
    d.play();
    d.frame(2.5);
    assert.equal(d.state.holding, null);
    assert.equal(ofType(emitted, 'narrate').length, 2);
  }
  {
    const { d, emitted } = makeDirector();
    d.load(readScenario());
    d.setSpeed(4);
    d.frame(5); // not playing yet: the card is on screen all the same
    d.play();
    d.frame(2.5);
    assert.equal(d.state.holding, null, '5 s paused + 2.5 s playing ≥ 6.3 s');
    assert.equal(ofType(emitted, 'narrate').length, 2);
  }
  {
    const { d, emitted } = makeDirector();
    d.load(readScenario());
    d.setSpeed(4);
    d.play();
    d.frame(2.5);
    assert.equal(d.state.holding.reason, 'reading');
    d.resume(); // Continue
    d.frame(0.016);
    assert.equal(ofType(emitted, 'narrate').length, 2, 'Continue shows the next card at once');
  }
  {
    // Continue on a script hold also marks the card as read.
    const s = readScenario();
    s.events.splice(2, 0, { at: g(1), hold: 5 });
    const { d, emitted } = makeDirector();
    d.load(s);
    d.setSpeed(4);
    d.play();
    d.frame(0.25); // reaches the script hold at +1
    assert.equal(d.state.holding.reason, 'script');
    d.resume();
    d.frame(2.25); // on to +10
    assert.equal(d.state.holding, null, 'no reading hold after Continue');
    assert.equal(ofType(emitted, 'narrate').length, 2);
  }
});

test('reading holds do not change what is simulated, nor depend on the frame size', () => {
  const run = (autoPause, dt) => {
    const { d, journal, emitted, sims } = makeDirector({ autoPause });
    d.load(readScenario());
    d.setSpeed(8);
    d.play();
    playToEnd(d, dt);
    return {
      events: journal.map((j) => `${j.what}:${j.id ?? j.script}@${(j.t - at(0)).toFixed(9)}`),
      stepped: sims[0].steps.reduce((a, b) => a + b, 0),
      holds: ofType(emitted, 'hold').map((h) => `${h.reason}@${(h.t - at(0)).toFixed(6)}:${h.seconds.toFixed(9)}`),
    };
  };
  const ref = run(false, 0.016);
  for (const dt of [0.016, 0.1, 0.37, 2]) {
    const on = run(true, dt);
    assert.deepEqual(on.events, ref.events, `same actions and keystrokes at the same GETs (frame ${dt})`);
    assert.ok(Math.abs(on.stepped - 60) < 1e-6);
    assert.deepEqual(on.holds, run(true, 0.016).holds, `same holds whatever the frame size (${dt})`);
    assert.ok(on.holds.some((h) => h.startsWith('reading@10.0')), on.holds.join(' '));
  }
});

test('reading holds after a seek: the explanation at the target shows at once, the card shown gets its time', () => {
  const { d, emitted } = makeDirector();
  d.load(readScenario());
  d.setSpeed(4);
  d.play();
  d.frame(1); // Alpha up for 1 s
  d.seek(g(10)); // straight to Beta: no hold before it
  assert.equal(d.state.holding, null);
  assert.equal(ofType(emitted, 'narrate').at(-1).title, 'Beta');

  // Seek to the middle of Alpha's window: Alpha (from the history) is the
  // card on screen and gets its full reading time before Beta.
  d.seek(g(5));
  assert.equal(d.state.t, at(5));
  d.frame(1.25); // reaches +10 after 1.25 s
  assert.equal(d.state.t, at(10));
  assert.equal(d.state.holding?.reason, 'reading');
  assert.ok(Math.abs(d.state.holding.total - (6.3 - 1.25)) < 1e-9);

  // Seeks within the same card keep the time it has already had, also
  // when one interrupts its reading hold: 1.25 + 2 + 1 s so far.
  d.seek(g(2));
  d.frame(2); // +2 → +10, into the reading hold
  assert.equal(d.state.holding?.reason, 'reading');
  d.seek(g(6)); // still Alpha's card
  d.frame(1); // +6 → +10
  assert.ok(Math.abs(d.state.holding.total - (6.3 - 4.25)) < 1e-9, `hold ${d.state.holding?.total}`);
  d.frame(2.05);
  assert.equal(d.state.holding, null);
  assert.equal(ofType(emitted, 'narrate').at(-1).title, 'Beta');
});

test('reading holds leave the replay deterministic with the real simulation', async () => {
  const { Simulation } = await import('../js/sim.js');
  const { SCENARIOS } = await import('../js/demo/scenarios/index.js');
  const { TRACKS } = await import('../js/data/tracks.js');
  const scenario = SCENARIOS.find((s) => s.id === 'p64-approach');
  const play = (autoPause, dt, viaSeek = false) => {
    const bus = createBus();
    let holds = 0;
    bus.on('hold', () => { holds += 1; });
    const d = new Director({
      bus,
      scheduler: () => {},
      autoplay: false,
      autoPause,
      createSim: (s) => new Simulation({
        software: s.software, vehicle: s.vehicle || 'static', startGET: s.start,
        replayTrack: s.track ? TRACKS[s.track] : null, initialProgram: s.initialProgram ?? null,
        vehicleOptions: s.vehicleOptions || {}, agcOptions: s.agcOptions || {}, bus,
      }),
    });
    d.load(scenario);
    if (viaSeek) d.seek(d.state.end);
    else {
      d.play();
      for (let i = 0; i < 1e6 && !d.ended; i++) d.frame(dt);
    }
    return { snap: d.sim.snapshot(), holds };
  };
  const held = play(true, 1 / 30);
  assert.ok(held.holds > 0, 'auto-pause held the replay');
  const free = play(false, 0.25);
  assert.deepEqual(held.snap, free.snap, 'same final state with and without holds');
  assert.deepEqual(play(false, 0, true).snap, held.snap, 'and the same as seeking to the end');
});

test('long seeks run in slices through the injected scheduler and can be superseded', async () => {
  const bus = createBus();
  const journal = [];
  let clock = 0;
  const pending = [];
  const d = new Director({
    bus,
    createSim: (sc) => new FakeSim(sc, journal),
    autoplay: false,
    autoPause: false,
    now: () => (clock += 7), // every check "costs" 7 ms
    sliceMs: 20,
    scheduler: () => new Promise((resolve) => pending.push(resolve)),
  });
  d.load(tinyScenario());
  const p = d.seek(g(50));
  assert.ok(d.state.seeking, 'still seeking after the first slice');
  const progress1 = d.state.seeking.progress;
  assert.ok(progress1 > 0 && progress1 < 1, `progress ${progress1}`);
  d.frame(1); // frames do nothing while seeking
  assert.ok(d.state.seeking);
  // supersede with another seek
  const p2 = d.seek(g(30));
  while (pending.length) {
    pending.shift()();
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(await p, false, 'first seek superseded');
  assert.equal(await p2, true);
  assert.equal(d.state.seeking, null);
  assert.equal(d.state.t, at(30));
  assert.deepEqual(actions(journal), ['a1', 'a2']);
});

test('errors in scenario code are reported, not thrown (unless strict)', () => {
  const s = tinyScenario();
  s.events.splice(2, 0, { at: g(1), action: () => { throw new Error('boom'); } });
  const { d, emitted } = makeDirector({ autoPause: false });
  const errorLog = console.error;
  console.error = () => {};
  try {
    d.load(s);
    d.play();
    d.frame(3);
  } finally {
    console.error = errorLog;
  }
  assert.equal(ofType(emitted, 'director:error').length, 1);
  assert.match(d.state.error.message, /boom/);
  assert.ok(Math.abs(d.state.t - at(3)) < 1e-9, 'kept playing');

  const strict = makeDirector({ autoPause: false, strict: true });
  strict.d.load(s);
  strict.d.play();
  assert.throws(() => strict.d.frame(3), /boom/);
});

test('compileEvents is a stable sort and numbers chapters', () => {
  const { items, chapters } = compileEvents({
    events: [
      { at: '100:00:05', say: { who: 'A', text: 'second' } },
      { at: '100:00:01', chapter: 'c1' },
      { at: '100:00:05', say: { who: 'A', text: 'third' } },
      { at: '100:00:01', say: { who: 'A', text: 'first' } },
    ],
  });
  assert.deepEqual(items.map((i) => i.value.text ?? i.value), ['c1', 'first', 'second', 'third']);
  assert.deepEqual(chapters, [{ title: 'c1', t: parseGET('100:00:01') }]);
});

// ---------- validator ----------

test('validateScenario accepts a good scenario', () => {
  const r = validateScenario(tinyScenario());
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('validateScenario reports shape, ordering, range, keys, anchors and markup problems', () => {
  const bad = tinyScenario({
    software: 'Luminary131',
    events: [
      { at: g(0), chapter: '' },
      { at: g(5), say: { who: 'Armstrong', text: 'x' } },
      { at: g(3), keys: 'V16X68E' },                                   // unsorted + bad key
      { at: g(70), hold: 2 },                                          // after end
      { at: g(71), narrate: { title: 't', body: '<a href="x">y</a><script>z</script>', anchors: [42] } },
      { at: g(72), narate: { title: 't', body: 'b' } },                // typo kind
      { at: g(73), say: { who: 'A', text: 'b' }, hold: 1 },            // two kinds
      { at: 'soon', focus: 'exec' },
      { at: g(74), focus: 'dashboard' },
      { at: g(75), speed: 100 },
      { at: g(76), hold: 0 },
    ],
  });
  const { ok, errors } = validateScenario(bad);
  assert.equal(ok, false);
  const has = (re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}\n${errors.join('\n')}`);
  has(/software must be one of/);
  has(/chapter must be a non-empty/);
  has(/sorted/);
  has(/Unknown key "X"/);
  has(/after the scenario end/);
  has(/sanitiser strips: <a>, <script>/);
  has(/anchors\[0\] must be an anchor id string/);
  has(/unknown key\(s\) "narate"/);
  has(/several kinds/);
  has(/at must be a GET/);
  has(/focus must be one of/);
  has(/speed must be a number/);
  has(/hold must be a number/);
  assert.equal(validateScenario(null).ok, false);
  assert.equal(validateScenario({ ...tinyScenario(), events: [] }).ok, false);
});

// ---------- sanitiser ----------

test('sanitiser keeps the whitelist and strips scripts, attributes and handlers', () => {
  assert.equal(sanitizeHtml('<b>bold</b> <i>it</i> <code>TC</code>'), '<b>bold</b> <i>it</i> <code>TC</code>');
  assert.equal(sanitizeHtml('<p>a<br>b<br/>c</p>'), '<p>a<br>b<br>c</p>');
  assert.equal(sanitizeHtml('<ul><li>one<li>two</ul>'), '<ul><li>one<li>two</li></li></ul>');
  assert.equal(sanitizeHtml('<script>alert(1)</script>ok'), 'ok');
  assert.equal(sanitizeHtml('<SCRIPT type="x">alert(1)</SCRIPT >ok'), 'ok');
  assert.equal(sanitizeHtml('<style>b{}</style><b>x</b>'), '<b>x</b>');
  assert.equal(sanitizeHtml('<b onclick="alert(1)" class="hi">x</b>'), '<b class="hi">x</b>');
  assert.equal(sanitizeHtml('<span class="a&quot; onmouseover=&quot;x" >y</span>'), '<span class="aquot onmouseoverquotx">y</span>');
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>'), '');
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">link</a>'), 'link');
  assert.equal(sanitizeHtml('<iframe src="x">inner</iframe>after'), 'after');
  assert.equal(sanitizeHtml('<b title="a>b">t</b>'), '<b>t</b>');
  assert.equal(sanitizeHtml('<!-- hidden -->x<!doctype html>'), 'x');
  assert.equal(sanitizeHtml('altitude < 500 ft & falling > fast'), 'altitude &lt; 500 ft &amp; falling &gt; fast');
  assert.equal(sanitizeHtml('&amp; &#8211; &nbsp; &bogus'), '&amp; &#8211; &nbsp; &amp;bogus');
  assert.equal(sanitizeHtml('<b><i>unclosed'), '<b><i>unclosed</i></b>');
  assert.equal(sanitizeHtml('</b>stray'), 'stray');
  assert.equal(sanitizeHtml('<scr<script>ipt>alert(1)</script>'), 'ipt&gt;alert(1)');
  assert.equal(sanitizeHtml('<kbd>PRO</kbd><strong>s</strong><em>e</em><ol><li>x</li></ol>'),
    '<kbd>PRO</kbd><strong>s</strong><em>e</em><ol><li>x</li></ol>');
  assert.equal(sanitizeHtml(null), '');
  assert.deepEqual(findDisallowedMarkup('<b>ok</b><span class="x">ok</span>'), []);
  assert.deepEqual(findDisallowedMarkup('<a href="x">y</a><span style="c">z</span>'), ['<a>', '<span style>']);
});

test('alarm codes display as five octal digits', () => {
  assert.equal(formatOctal(0o1202), '01202');
  assert.equal(formatOctal(0o1201), '01201');
  assert.equal(formatOctal(0o500), '00500');
});

// ---------- views import without a DOM ----------

test('demo view modules import in Node (no top-level DOM use)', async () => {
  const modules = await Promise.all([
    import('../js/ui/controls-view.js'),
    import('../js/ui/narration-view.js'),
    import('../js/ui/transcript-view.js'),
    import('../js/ui/timeline-view.js'),
  ]);
  assert.equal(typeof modules[0].mountControls, 'function');
  assert.equal(typeof modules[1].mountNarration, 'function');
  assert.equal(typeof modules[2].mountTranscript, 'function');
  assert.equal(typeof modules[3].mountTimeline, 'function');
  const { groupKeys } = modules[2];
  assert.deepEqual(groupKeys(['VERB', '1', '6', 'NOUN', '6', '8', 'ENTR']), ['VERB', '16', 'NOUN', '68', 'ENTR']);
  assert.deepEqual(groupKeys(['VERB', '2', '1', 'ENTR', '+', '1', '2', 'ENTR']), ['VERB', '21', 'ENTR', '+12', 'ENTR']);
});
