// The Agc composition root (ARCHITECTURE §6.9): construction with the real
// DSKY, PINBALL, Executive, Workload, Restart and Alarm modules, the
// snapshot shape (§6.9.1), major modes, V37, keys, crew inputs, the
// BAILOUT / fresh-start / hardware-restart paths.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agc } from '../js/agc/agc.js';
import { Simulation } from '../js/sim.js';
import { createBus } from '../js/util/bus.js';
import { parseGET } from '../js/util/time.js';
import { TRACKS } from '../js/data/tracks.js';
import { PROGRAMS_LUMINARY099, PROGRAMS_COMANCHE055, V37_LUMINARY099 } from '../js/agc/programs/index.js';
import { PRESETS } from '../js/data/presets.js';

function sim(opts = {}) {
  return new Simulation({ software: 'Luminary099', vehicle: 'static', startGET: '102:10:00', initialProgram: 0, ...opts });
}

function collect(bus, types) {
  const out = [];
  for (const type of types) bus.on(type, (p) => out.push({ type, ...p }));
  return out;
}

const dskyText = (d) => `P${d.prog} V${d.verb} N${d.noun}${d.flashVerbNoun ? '*' : ''} ${d.r.map((r) => r.sign + r.digits).join(' ')}`;

test('constructs with every documented member (static and replay vehicles)', () => {
  for (const vehicle of ['static', 'replay']) {
    const s = sim({ vehicle, replayTrack: TRACKS.apollo11Descent, startGET: '102:37:40', initialProgram: 63 });
    const agc = s.agc;
    for (const k of ['dsky', 'pinball', 'exec', 'restart', 'alarms', 'workload', 'nav', 'erasable', 'flags', 'program']) {
      assert.ok(agc[k], `agc.${k} (${vehicle})`);
    }
    assert.equal(agc.mode, 63);
    assert.equal(agc.software, 'Luminary099');
    assert.equal(agc.t, parseGET('102:37:40'));
    for (const fn of ['setMajorMode', 'changeProgram', 'startProgram', 'vehicleCommands', 'key', 'keys', 'crewInput', 'freshStart', 'hardwareRestart', 'step', 'snapshot', 'alarm', 'bailout', 'poodoo']) {
      assert.equal(typeof agc[fn], 'function', fn);
    }
    s.step(5);
    const snap = s.snapshot().agc;
    for (const k of ['software', 'mode', 'programName', 'dsky', 'exec', 'alarms', 'restart', 'erasable', 'nav', 'burn', 'guidance', 'crew', 'flags']) {
      assert.ok(k in snap, `snapshot.${k}`);
    }
    assert.equal(snap.programName, 'BRAKING PHASE');
    assert.deepEqual(Object.keys(snap.alarms).filter((k) => ['failreg', 'last', 'history'].includes(k)).sort(), ['failreg', 'history', 'last']);
    assert.ok(Array.isArray(snap.restart.groups) && snap.restart.groups.length === 6);
    for (const k of ['alt', 'altRate', 'vHoriz', 'range', 'lrIncorporating']) assert.ok(k in snap.nav, `nav.${k}`);
    for (const k of ['rodRate', 'pgnsMode', 'rrFault', 'lpdClicks']) assert.ok(k in snap.crew, `crew.${k}`);
    assert.ok(snap.burn && Array.isArray(snap.burn.events), 'burn snapshot while P63 is burning');
    assert.ok(snap.guidance && snap.guidance.phase === 'braking', 'guidance snapshot');
    assert.equal(snap.dsky.prog, '63');
    // The snapshot is a copy.
    snap.erasable.HCALC = -1;
    assert.notEqual(s.agc.erasable.HCALC, -1);
  }
});

test('setMajorMode shows PROG and emits mode; startProgram does no V37 checks', () => {
  const bus = createBus();
  const ev = collect(bus, ['mode']);
  const agc = new Agc({ bus, startGET: 1000 });
  agc.setMajorMode(12);
  assert.equal(agc.dsky.prog, '12');
  assert.equal(ev.at(-1).mode, 12);
  agc.startProgram(64, { initial: true });   // not V37-selectable, still allowed here
  assert.equal(agc.mode, 64);
  assert.equal(agc.dsky.prog, '64');
  assert.equal(ev.at(-1).prev, 12);
});

test('keys(): one key per gap of simulated time, first key now, each emits "key"', () => {
  const s = sim();
  const keys = collect(s.outBus, ['key']);
  s.agc.keys('V16N36E', { source: 'crew', gapMs: 400 });
  assert.equal(keys.length, 1);
  s.step(2.41);
  assert.equal(keys.length, 7);
  const t0 = keys[0].t;
  keys.forEach((k, i) => assert.ok(Math.abs(k.t - (t0 + 0.4 * i)) < 0.011, `key ${i} at +${(k.t - t0).toFixed(2)}`));
  assert.deepEqual(keys.map((k) => k.key), ['VERB', '1', '6', 'NOUN', '3', '6', 'ENTR']);
  assert.ok(keys.every((k) => k.source === 'crew'));
  s.agc.key('RSET');
  assert.equal(keys.at(-1).source, 'user');
  s.step(1.5);
  assert.equal(s.agc.dsky.verb, '16');
  assert.equal(s.agc.dsky.noun, '36');
});

test('V37: legal programs from the listing, illegal ones OPR ERR', () => {
  assert.ok(V37_LUMINARY099.includes(63) && V37_LUMINARY099.includes(68) && V37_LUMINARY099.includes(0));
  assert.ok(!V37_LUMINARY099.includes(64) && !V37_LUMINARY099.includes(66) && !V37_LUMINARY099.includes(99));
  const s = sim();
  const ev = collect(s.outBus, ['oprerr', 'mode']);
  assert.equal(s.agc.changeProgram(99), false);
  assert.equal(s.agc.dsky.lights.oprErr, true);
  assert.ok(ev.some((e) => e.type === 'oprerr'));
  s.agc.key('RSET');
  s.step(0.5);
  assert.equal(s.agc.dsky.lights.oprErr, false);
  // Keyed: V37E66E → OPR ERR (P66 is entered by the guidance only).
  s.agc.keys('V37E66E', { gapMs: 300 });
  s.step(3);
  assert.equal(s.agc.mode, 0);
  assert.equal(s.agc.dsky.lights.oprErr, true);
});

test('V37E63E from P00 starts P63', () => {
  const s = sim();
  assert.equal(s.agc.mode, 0);
  s.agc.keys('V37E63E', { gapMs: 300 });
  s.step(3);
  assert.equal(s.agc.mode, 63);
  assert.equal(s.agc.dsky.prog, '63');
  assert.equal(s.agc.program.constructor.number, 63);
  assert.equal(s.agc.flags.LRBYPASS, false, 'FLAGORGY clears LRBYPASS');
  assert.equal(s.agc.flags.MUNFLAG, true, 'FLAGORGY sets MUNFLAG');
  assert.equal(s.agc.workload.phase, 'prePDI');
});

test('unmodelled V37 programs take the major mode and idle', () => {
  const s = sim();
  s.agc.keys('V37E52E', { gapMs: 300 });
  s.step(3);
  assert.equal(s.agc.mode, 52);
  const snap = s.snapshot().agc;
  assert.equal(snap.programName, 'IMU REALIGN');
  assert.equal(snap.programModelled, false);
  assert.ok(PROGRAMS_LUMINARY099[52]);
});

test('NODOFLAG: V37 to anything but P00 gives alarm 01520, no program change', () => {
  const s = sim();
  const ev = collect(s.outBus, ['alarm']);
  s.agc.flags.NODOFLAG = true;
  assert.equal(s.agc.changeProgram(63), null);
  assert.equal(s.agc.mode, 0);
  assert.equal(ev.at(-1).code, 0o1520);
  assert.equal(s.agc.dsky.lights.prog, true);
  assert.equal(s.agc.changeProgram(0), true);
});

test('crew inputs: RR fault steals cycles, ROD clicks count, PGNS mode, unknown ignored', () => {
  const s = sim();
  const agc = s.agc;
  agc.crewInput('rrFault', true);
  assert.equal(agc.crew.rrFault, true);
  assert.ok(agc.exec.steal.get('rrCdu') > 0.1, 'RR CDU cycle stealing ≈13 %');
  agc.crewInput('rrFault', false);
  assert.equal(agc.exec.steal.has('rrCdu'), false);
  agc.crewInput('rodClick', 1);
  agc.crewInput('rodClick', -1);
  agc.crewInput('rodClick', 1);
  assert.equal(agc.erasable.RODCOUNT, 1);
  agc.crewInput('pgnsMode', 'attHold');
  assert.equal(agc.snapshot().crew.pgnsMode, 'attHold');
  agc.crewInput('lpd', { dx: 1, dy: -2 });
  assert.deepEqual(agc.snapshot().crew.lpdClicks, { dx: 1, dy: -2 });
  assert.doesNotThrow(() => agc.crewInput('noSuchControl', 3));
  agc.crewInput('engineStop', true);
  assert.equal(agc.vehicleCommands().engineOn, false);
});

test('Executive overflow → BAILOUT: FAILREG, PROG lamp (not RESTART), software restart', () => {
  const s = sim();
  const ev = collect(s.outBus, ['alarm', 'restart']);
  for (let i = 0; i < 12; i++) s.agc.exec.requestJob({ name: `FILL${i}`, prio: 0o05, vac: false, workMs: 60000 });
  s.step(0.1);
  const alarm = ev.find((e) => e.type === 'alarm');
  assert.equal(alarm.code, 0o1202);
  assert.ok(ev.some((e) => e.type === 'restart'));
  assert.equal(s.agc.restart.count, 1);
  assert.equal(s.agc.dsky.lights.prog, true);
  assert.equal(s.agc.dsky.lights.restart, false, 'a software restart does not light RESTART');
  assert.deepEqual(s.snapshot().agc.alarms.failreg, [0o1202, null, null]);
  assert.equal(s.agc.exec.coreSets.filter((j) => j && j.name.startsWith('FILL')).length, 0, 'jobs flushed');
});

test('COMP ACTY follows the Executive', () => {
  const s = sim();
  s.step(0.5);
  assert.equal(s.agc.dsky.lights.compActy, false);
  s.agc.exec.requestJob({ name: 'BUSY', prio: 0o20, workMs: 300 });
  s.step(0.05);
  assert.equal(s.agc.dsky.lights.compActy, true);
  s.step(0.5);
  assert.equal(s.agc.dsky.lights.compActy, false);
});

test('V36 fresh start: blank DSKY, PROG blank, FAILREG zeroed, groups gone', () => {
  const s = sim({ startGET: '102:37:40', vehicle: 'replay', replayTrack: TRACKS.apollo11Descent, initialProgram: 63 });
  s.step(3);
  s.agc.alarm(0o1202);
  s.agc.keys('V36E', { gapMs: 300 });
  s.step(2);
  const d = s.agc.dsky.snapshot();
  assert.equal(s.agc.mode, null);
  assert.equal(d.prog, '  ');
  assert.equal(d.verb, '  ');
  assert.equal(d.lights.prog, false);
  assert.deepEqual(s.snapshot().agc.alarms.failreg, [null, null, null]);
  assert.ok(s.agc.restart.snapshot().groups.every((g) => !g.active));
  assert.equal(s.agc.workload.averageG, false);
  assert.equal(s.agc.flags.LRBYPASS, true);
  // V37E00E then selects P00.
  s.agc.keys('V37E00E', { gapMs: 300 });
  s.step(3);
  assert.equal(s.agc.mode, 0);
  assert.equal(s.agc.dsky.prog, '00');
});

test('hardware restart (V69): RESTART lamp, mode kept', () => {
  const s = sim();
  s.agc.keys('V69E', { gapMs: 300 });
  s.step(2);
  assert.equal(s.agc.dsky.lights.restart, true);
  assert.equal(s.agc.mode, 0);
  assert.equal(s.agc.dsky.prog, '00');
  assert.ok(s.agc.restart.snapshot().redoctr >= 1);
});

test('vehicleCommands() has the documented shape', () => {
  const s = sim();
  const c = s.agc.vehicleCommands();
  for (const k of ['throttle', 'thrustDir', 'engineOn', 'ullage', 'rod', 'lpd']) assert.ok(k in c, k);
  assert.equal(c.engineOn, false);
});

test('Comanche055: CM programs, 7 core sets, P40 burn snapshot', () => {
  const s = new Simulation({ software: 'Comanche055', vehicle: 'cmSps', startGET: '075:40:00', initialProgram: 0, vehicleOptions: { initial: 'loi1' } });
  assert.equal(s.agc.exec.coreSetCount, 7);
  assert.equal(s.agc.mode, 0);
  assert.ok(PROGRAMS_COMANCHE055[40]);
  s.agc.keys('V37E40E', { gapMs: 300 });
  s.step(3);
  assert.equal(s.agc.mode, 40);
  const cm = PRESETS.find((p) => p.id === 'cm-loi1');
  assert.ok(cm, 'CM presets merged into PRESETS');
  const s2 = new Simulation({ software: cm.software, vehicle: cm.vehicle, startGET: cm.startGET, initialProgram: cm.initialProgram ?? null, vehicleOptions: cm.vehicleOptions || {} });
  cm.setup(s2);
  s2.step(2);
  const burn = s2.snapshot().agc.burn;
  assert.ok(burn && burn.program === 40 && Array.isArray(burn.events), 'snapshot.burn from the CM program');
});

test('every preset constructs and runs for 5 s', () => {
  for (const p of PRESETS) {
    const s = new Simulation({
      software: p.software, vehicle: p.vehicle || 'static', startGET: p.startGET,
      replayTrack: p.track ? TRACKS[p.track] : null, initialProgram: p.initialProgram ?? null,
      vehicleOptions: p.vehicleOptions || {}, agcOptions: p.agcOptions || {},
    });
    if (typeof p.setup === 'function') p.setup(s);
    s.step(5);
    const snap = s.snapshot();
    assert.ok(snap.agc && snap.agc.dsky, p.id);
    assert.ok(typeof p.description === 'string' && p.description.length > 80, `${p.id} has tips`);
  }
});

test('deterministic: two runs give the same snapshot', () => {
  const run = () => {
    const s = sim({ vehicle: 'replay', replayTrack: TRACKS.apollo11Descent, startGET: '102:37:40', initialProgram: 63 });
    s.agc.crewInput('rrFault', true);
    s.step(10);
    s.agc.keys('V16N68E');
    s.step(30);
    const a = s.snapshot().agc;
    return JSON.stringify({ dsky: a.dsky, erasable: a.erasable, alarms: a.alarms.history, restart: a.restart.count });
  };
  assert.equal(run(), run());
});
