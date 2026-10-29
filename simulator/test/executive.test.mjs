// Executive, Waitlist, alarms (FAILREG), restarts and the descent workload.
//
//   node --test simulator/test/executive.test.mjs
//
// The last test is the calibration report: time to the first overflow for
// each flight configuration, printed as diagnostics and checked against the
// qualitative targets (research src-executive §13, web-1202-b §1.3-§1.5).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Executive, EXEC_CONFIG, CODE_NO_VAC, CODE_NO_CORE, CODE_WAITLIST_FULL, priorityWord,
} from '../js/agc/executive.js';
import { Workload, DEFAULT_PARAMS, estimateLoad, RR_CDU, PHASES } from '../js/agc/workload.js';
import { RestartModel } from '../js/agc/restart.js';
import {
  AlarmRegisters, ALARMS_LUMINARY099, ALARMS_COMANCHE055, describeAlarm, formatAlarmCode,
} from '../js/agc/alarms.js';
import { DskyState } from '../js/agc/dsky-state.js';
import { createBus } from '../js/util/bus.js';
import { formatGET } from '../js/util/time.js';

// ---------------------------------------------------------------- helpers

// A minimal Agc stand-in wired the way ARCHITECTURE §6.9 describes.
function makeAgc({ software = 'Luminary099', t0 = 1000, params } = {}) {
  const bus = createBus();
  const agc = {
    software, bus, t: t0, mode: 63,
    nav: { vHoriz: 1000, altRate: -40, lrIncorporating: false },
    crew: { pgnsMode: 'auto' },
  };
  agc.dsky = new DskyState();
  agc.exec = new Executive({ software, bus, startT: t0 });
  agc.alarms = new AlarmRegisters({ software, dsky: agc.dsky, bus });
  agc.restart = new RestartModel(agc);
  agc.bailout = (code) => agc.restart.software(code);
  agc.exec.onOverflow = (code) => agc.bailout(code);
  agc.workload = new Workload(agc, { params });
  agc.passes = [];
  agc.program = { onServicerPass: (t) => agc.passes.push(t) };
  agc.events = [];
  bus.on('*', (e) => agc.events.push(e));
  agc.step = (t, dt) => {
    agc.t = t;
    agc.exec.step(dt, t);
    agc.workload.step(t, dt);
  };
  agc.run = (seconds, onTick) => {
    const n = Math.round(seconds / 0.01);
    for (let i = 0; i < n; i++) {
      const t = Math.round((agc.t + 0.01) * 100) / 100;
      if (onTick) onTick(t);
      agc.step(t, 0.01);
    }
  };
  // A crew keystroke as PINBALL makes it: one CHARIN job (NOVAC, PRIO30).
  agc.key = () => agc.exec.requestJob({ name: 'CHARIN', prio: 0o30, vac: false, workMs: 5, source: 'pinball' });
  return agc;
}

const alarmsOf = (agc) => agc.events.filter((e) => e.type === 'alarm').map((e) => e.payload);

function soloExec(opts = {}) {
  const exec = new Executive({ startT: 0, ...opts });
  const overflows = [];
  exec.onOverflow = (code, req) => overflows.push({ code, name: req?.name });
  return { exec, overflows };
}

// ---------------------------------------------------------------- counts

test('core set and VAC counts follow the listings', () => {
  assert.deepEqual(EXEC_CONFIG.Luminary099, { coreSets: 8, vacAreas: 5, waitlistSlots: 9 });
  assert.equal(EXEC_CONFIG.Comanche055.coreSets, 7);
  assert.equal(new Executive({ software: 'Comanche055' }).coreSets.length, 7);
  const e = new Executive({ coreSets: 8, vacAreas: 5 });
  assert.equal(e.coreSets.length, 8);
  assert.equal(e.vacs.length, 5);
});

// ---------------------------------------------------------------- overflow

test('1201 when the VAC areas run out first (FINDVAC checks VACs before core sets)', () => {
  const { exec, overflows } = soloExec();
  for (let i = 0; i < 5; i++) assert.ok(exec.requestJob({ name: 'SERVICER', prio: 0o20, vac: true, workMs: 100 }));
  assert.equal(exec.vacs.filter(Boolean).length, 5);
  assert.equal(exec.coreSets.filter(Boolean).length, 5);
  const r = exec.requestJob({ name: 'SERVICER', prio: 0o20, vac: true, workMs: 100 });
  assert.equal(r, null);
  assert.deepEqual(overflows, [{ code: CODE_NO_VAC, name: 'SERVICER' }]);
  // A NOVAC job still finds a core set.
  assert.ok(exec.requestJob({ name: 'MONDO', prio: 0o30, vac: false, workMs: 10 }));
  assert.equal(exec.snapshot().lastOverflow.code, 0o1201);
});

test('1202 when the core sets run out (NOVAC, or FINDVAC with a VAC still free)', () => {
  const { exec, overflows } = soloExec();
  for (let i = 0; i < 8; i++) assert.ok(exec.requestJob({ name: `J${i}`, prio: 0o30, vac: false, workMs: 10 }));
  assert.equal(exec.requestJob({ name: 'MONDO', prio: 0o30, vac: false, workMs: 10 }), null);
  assert.equal(exec.requestJob({ name: 'SERVICER', prio: 0o20, vac: true, workMs: 10 }), null);
  assert.deepEqual(overflows.map((o) => o.code), [CODE_NO_CORE, CODE_NO_CORE]);
  assert.equal(formatAlarmCode(overflows[0].code), '01202');
});

test('Comanche055 overflows on the eighth core set', () => {
  const { exec, overflows } = soloExec({ software: 'Comanche055' });
  for (let i = 0; i < 7; i++) assert.ok(exec.requestJob({ name: `J${i}`, prio: 0o20, workMs: 10 }));
  assert.equal(exec.requestJob({ name: 'J7', prio: 0o20, workMs: 10 }), null);
  assert.equal(overflows[0].code, 0o1202);
});

test('allocation scans core sets 0..7 and VAC areas 1..5 in order', () => {
  const { exec } = soloExec();
  const a = exec.requestJob({ name: 'A', prio: 0o20, vac: true, workMs: 10 });
  const b = exec.requestJob({ name: 'B', prio: 0o20, vac: true, workMs: 10 });
  assert.equal(a.coreSet, 0);
  assert.equal(b.coreSet, 1);
  assert.equal(a.vacIndex, 0);
  assert.equal(b.vacIndex, 1);
  const snap = exec.snapshot();
  assert.equal(snap.vacs[1].label, 'VAC2');
  assert.equal(snap.coreSets[1].job.prioOctal, '20');
});

// ---------------------------------------------------------------- scheduling

test('the highest priority runs first; finishing jobs free their core set and VAC and call onDone', () => {
  const { exec } = soloExec();
  const order = [];
  exec.requestJob({ name: 'LOW', prio: 0o20, workMs: 20, onDone: () => order.push('LOW') });
  exec.requestJob({ name: 'HIGH', prio: 0o33, workMs: 5, onDone: () => order.push('HIGH') });
  exec.requestJob({ name: 'MID', prio: 0o30, vac: true, workMs: 5, onDone: () => order.push('MID') });
  exec.step(0.1);
  assert.deepEqual(order, ['HIGH', 'MID', 'LOW']);
  assert.equal(exec.coreSets.filter(Boolean).length, 0);
  assert.equal(exec.vacs.filter(Boolean).length, 0);
  assert.equal(exec.idle, true);
});

test('equal priorities: the running job keeps the CPU; otherwise the first in scan order wins (EJ1)', () => {
  const { exec } = soloExec();
  const order = [];
  const done = (n) => () => order.push(n);
  exec.requestJob({ name: 'A', prio: 0o25, workMs: 15, onDone: done('A') });
  exec.step(0.01); // A is running in core set 0
  exec.requestJob({ name: 'B', prio: 0o25, workMs: 5, onDone: done('B') });
  exec.requestJob({ name: 'C', prio: 0o25, workMs: 5, onDone: done('C') });
  exec.step(0.1);
  assert.deepEqual(order, ['A', 'B', 'C']);
});

test('a strictly higher priority pre-empts; the running job always sits in core set 0 (CHANJOB)', () => {
  const { exec } = soloExec();
  const low = exec.requestJob({ name: 'LOW', prio: 0o20, workMs: 50 });
  exec.step(0.01);
  assert.equal(low.coreSet, 0);
  const high = exec.requestJob({ name: 'HIGH', prio: 0o30, workMs: 30 });
  assert.equal(high.coreSet, 1);
  exec.step(0.01);
  assert.equal(high.coreSet, 0, 'the new job was swapped into core set 0');
  assert.equal(low.coreSet, 1);
  assert.equal(high.state, 'RUNNING');
  assert.equal(low.state, 'READY');
});

test('the whole PRIORITY word counts: at equal priority a VAC job outranks a NOVAC job, VAC5 outranks VAC1', () => {
  const { exec } = soloExec();
  const order = [];
  const nv = exec.requestJob({ name: 'MAKEPLAY', prio: 0o20, vac: false, workMs: 5, onDone: () => order.push('MAKEPLAY') });
  const v1 = exec.requestJob({ name: 'S1', prio: 0o20, vac: true, workMs: 5, onDone: () => order.push('S1') });
  const v2 = exec.requestJob({ name: 'S2', prio: 0o20, vac: true, workMs: 5, onDone: () => order.push('S2') });
  assert.ok(priorityWord(v2) > priorityWord(v1) && priorityWord(v1) > priorityWord(nv));
  exec.step(0.05);
  // MAKEPLAY was in core set 0 first but S2 (higher word) pre-empted it.
  assert.deepEqual(order, ['S2', 'S1', 'MAKEPLAY']);
});

test('sleeping jobs keep their core set (and VAC) and wake after sleepMs; PRIOCHNG at first dispatch', () => {
  const { exec } = soloExec();
  const lrv = exec.requestJob({
    name: 'LRVJOB', prio: 0o32, vac: false, steps: [{ workMs: 1 }, { sleepMs: 500 }, { workMs: 1 }],
  });
  exec.step(0.05);
  assert.equal(lrv.state, 'SLEEPING');
  assert.equal(exec.coreSets.filter(Boolean).length, 1);
  assert.equal(exec.snapshot().coreSets.find((c) => c.job)?.job.state, 'SLEEPING');
  exec.step(0.5);
  assert.equal(lrv.dead, true);
  const mp = exec.requestJob({ name: 'MAKEPLAY', prio: 0o20, runPrio: 0o33, workMs: 30 });
  exec.step(0.01);
  assert.equal(mp.prio, 0o33);
});

test('COMP ACTY follows the executive: off in DUMMYJOB, on while a job runs', () => {
  const dsky = new DskyState();
  const exec = new Executive({ dsky });
  const seen = [];
  exec.onActivity = (on) => seen.push(on);
  exec.requestJob({ name: 'X', prio: 0o20, workMs: 25 });
  exec.step(0.01);
  assert.equal(dsky.lights.compActy, true);
  exec.step(0.05);
  assert.equal(dsky.lights.compActy, false);
  assert.deepEqual(seen, [true, false]);
});

// ---------------------------------------------------------------- time budget

test('load accounting: every contributor appears and the parts sum to 1', () => {
  const { exec } = soloExec();
  exec.setInterruptLoad('T4RUPT', 0.03);
  exec.setInterruptLoad('T5RUPT (DAP)', 0.1);
  exec.setSteal('rrCdu', 0.13);
  exec.waitlist.add(1.0, 'TASK', () => {}, { costMs: 3 });
  exec.requestJob({ name: 'SERVICER', prio: 0o20, vac: true, workMs: 300 });
  exec.requestJob({ name: 'MONDO', prio: 0o30, workMs: 35 });
  exec.step(1.5);
  const { parts, groups, total } = exec.snapshot().load;
  const sum = Object.values(parts).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `parts sum to ${sum}`);
  assert.ok(Math.abs(Object.values(groups).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  for (const k of ['T4RUPT', 'T5RUPT (DAP)', 'rrCdu', 'tasks', 'idle']) assert.ok(parts[k] > 0, `${k} present`);
  assert.ok(Math.abs(parts.rrCdu - 0.13) < 1e-6);
  assert.ok(Math.abs(total - (1 - parts.idle)) < 1e-12);
  assert.ok(exec.snapshot().history.length >= 4, 'history sampled at 4 Hz');
});

test('cycle stealing reduces throughput by exactly the stolen fraction', () => {
  const finish = (steal) => {
    const { exec } = soloExec();
    exec.setSteal('rrCdu', steal);
    let t = null;
    exec.requestJob({ name: 'J', prio: 0o20, workMs: 1000, onDone: (tt) => { t = tt; } });
    exec.step(2);
    return t;
  };
  const t0 = finish(0);
  const t13 = finish(0.13);
  assert.ok(Math.abs(t0 - 1.0) < 0.011);
  assert.ok(Math.abs(t13 - 1 / 0.87) < 0.011, `finished at ${t13}`);
  // The derivation in workload.js: 2 CDUs x 6400 pulses/s x 11.72 us.
  assert.ok(Math.abs(RR_CDU.theoreticalMax - 0.150) < 0.001);
  assert.equal(DEFAULT_PARAMS.rrCduSteal, 0.13);
});

// ---------------------------------------------------------------- waitlist

test('Waitlist: tasks run in time order; a tenth pending task is alarm 01203', () => {
  const { exec, overflows } = soloExec();
  const ran = [];
  for (let i = 9; i >= 1; i--) assert.ok(exec.waitlist.add(i * 0.1, `T${i}`, () => ran.push(i)));
  assert.equal(exec.waitlist.add(1, 'T10', () => {}), null);
  assert.equal(overflows[0].code, CODE_WAITLIST_FULL);
  exec.step(1);
  assert.deepEqual(ran, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

// ---------------------------------------------------------------- alarms

test('FAILREG fill rule: R1 first, R2 second, R3 latest with bit 15; PROG on the first alarm; RSET clears', () => {
  const dsky = new DskyState();
  const bus = createBus();
  const seen = [];
  bus.on('alarm', (a) => seen.push(a.code));
  const regs = new AlarmRegisters({ dsky, bus });
  assert.deepEqual(regs.alarm(0o1202, { t: 1 }), { first: true, slot: 0 });
  assert.equal(dsky.lights.prog, true);
  assert.deepEqual(regs.registers().map(formatAlarmCode), ['01202', '00000', '00000']);
  dsky.setLight('prog', false); // only PROGLARM on the *first* alarm relights it
  regs.alarm(0o1202, { t: 2 });
  assert.equal(dsky.lights.prog, false);
  regs.alarm(0o1201, { t: 3 });
  assert.deepEqual(regs.registers().map(formatAlarmCode), ['01202', '01202', '01201']);
  regs.alarm(0o1202, { t: 4 });
  assert.deepEqual(regs.registers().map(formatAlarmCode), ['01202', '01202', '41202']);
  regs.alarm(0o1203, { t: 5 });
  assert.equal(formatAlarmCode(regs.registers()[2]), '41203');
  assert.deepEqual(seen, [0o1202, 0o1202, 0o1201, 0o1202, 0o1203]);
  assert.deepEqual(regs.snapshot().failreg.slice(0, 2), [0o1202, 0o1202]);
  regs.reset();
  assert.deepEqual(regs.snapshot().failreg, [null, null, null]);
  assert.equal(regs.alarm(0o1201, { t: 6 }).first, true);
  assert.equal(regs.snapshot().history.length, 6);
});

test('alarm tables: classes and texts from the listings', () => {
  assert.equal(ALARMS_LUMINARY099[0o1201].text, 'EXECUTIVE OVERFLOW - NO VAC AREAS');
  assert.equal(ALARMS_LUMINARY099[0o1202].text, 'EXECUTIVE OVERFLOW - NO CORE SETS');
  assert.equal(ALARMS_LUMINARY099[0o1202].cls, 'restart');
  assert.equal(ALARMS_LUMINARY099[0o1202].line, 967);
  assert.equal(ALARMS_LUMINARY099[0o1204].cls, 'p00');
  assert.equal(ALARMS_LUMINARY099[0o501].cls, 'priority');
  assert.equal(ALARMS_LUMINARY099[0o1520].cls, 'alarm');
  assert.equal(Object.keys(ALARMS_LUMINARY099).length, 86);
  assert.equal(ALARMS_COMANCHE055[0o1202].routine, 'BAILOUT');
  assert.equal(ALARMS_COMANCHE055[0o1210].cls, 'p00');
  assert.equal(describeAlarm(0o41202).multi, true);
  assert.equal(describeAlarm(0o41202).code, 0o1202);
  assert.equal(describeAlarm(0o1202).anchor, 'exec.novac.1202');
});

// ---------------------------------------------------------------- restarts

test('software restart: alarm logged, everything flushed, protected groups re-entered, PROG kept, no RESTART lamp', () => {
  const agc = makeAgc();
  const reentered = [];
  agc.restart.protect(5, '5.3', (t) => {
    reentered.push(5);
    agc.exec.requestJob({ name: 'SERVICER', prio: 0o20, vac: true, workMs: 100 });
  });
  agc.restart.protect(3, '3.var', () => reentered.push(3));
  agc.restart.protect(4, '4.23', () => reentered.push(4));
  agc.restart.clear(4);
  let lostDone = false;
  agc.exec.requestJob({ name: 'MONDO', prio: 0o30, workMs: 50, onDone: () => { lostDone = true; } });
  agc.exec.requestJob({ name: 'MAKEPLAY', prio: 0o20, workMs: 50 });
  agc.exec.waitlist.add(1, 'MONREQ', () => { lostDone = true; });
  agc.dsky.setLight('keyRel', true);

  agc.bailout(0o1202);
  assert.deepEqual(reentered, [5, 3], 'groups re-entered in NUMGRPS order (6..1), inactive 4 skipped');
  const names = agc.exec.coreSets.filter(Boolean).map((j) => j.name).sort();
  assert.deepEqual(names, ['DSPMMJB', 'SERVICER']);
  assert.equal(agc.exec.waitlist.tasks.length, 0);
  assert.equal(agc.dsky.lights.prog, true);
  assert.equal(agc.dsky.lights.restart, false);
  assert.equal(agc.dsky.lights.keyRel, false);
  assert.deepEqual(agc.alarms.snapshot().failreg, [0o1202, null, null]);
  const r = agc.restart.snapshot();
  assert.equal(r.count, 1);
  assert.equal(r.redoctr, 0);
  assert.equal(r.lastCode, 0o1202);
  assert.equal(r.groups.length, 6);
  const types = agc.events.map((e) => e.type);
  assert.ok(types.indexOf('alarm') < types.indexOf('restart'));
  assert.equal(agc.events.find((e) => e.type === 'alarm').payload.restart, true);
  agc.run(1);
  assert.equal(lostDone, false, 'flushed jobs and tasks never complete');
  assert.equal(agc.dsky.prog, '63', 'MMDSPLAY put the major mode back');
});

test('a restart caused inside a task waits until the task is over (BAILOUT never returns)', () => {
  const agc = makeAgc();
  for (let i = 0; i < 8; i++) agc.exec.requestJob({ name: `J${i}`, prio: 0o30, workMs: 500 });
  let after = null;
  agc.exec.waitlist.add(0.05, 'T', () => {
    const r = agc.exec.requestJob({ name: 'MONDO', prio: 0o30, workMs: 5 });
    after = { r, pending: agc.restart.pending };
    agc.exec.waitlist.add(1, 'STRAY', () => {}); // would survive if the restart ran first
  });
  agc.run(0.1);
  assert.equal(after.r, null);
  assert.equal(after.pending, true);
  assert.equal(agc.restart.count, 1);
  assert.equal(agc.exec.waitlist.has('STRAY'), false, 'everything after the failed request was wiped');
  assert.equal(alarmsOf(agc).length, 1);
});

test('hardware restart (GOJAM): RESTART lamp on, REDOCTR counts, no alarm code', () => {
  const agc = makeAgc();
  agc.dsky.setLight('prog', true);
  agc.restart.hardware('V69');
  assert.equal(agc.dsky.lights.restart, true);
  assert.equal(agc.dsky.lights.prog, true, 'PROG kept (SETINFL)');
  assert.equal(agc.restart.snapshot().redoctr, 1);
  assert.equal(agc.restart.lastReason, 'V69');
  assert.equal(alarmsOf(agc).length, 0);
  agc.restart.freshStart();
  assert.equal(agc.restart.snapshot().redoctr, 0);
});

// ---------------------------------------------------------------- workload

test('workload: phases exist, SERVICER runs every 2 s and calls the program back', () => {
  for (const p of ['idle', 'prePDI', 'P63-preLR', 'P63-LR', 'P64', 'P66', 'landed', 'cmIdle', 'cmBurn', 'cmEntry']) {
    assert.ok(PHASES.includes(p));
  }
  const agc = makeAgc();
  agc.workload.setPhase('P63-preLR');
  agc.run(20.5);
  assert.ok(agc.passes.length >= 9 && agc.passes.length <= 10, `${agc.passes.length} passes`);
  const gaps = agc.passes.slice(1).map((t, i) => t - agc.passes[i]);
  for (const g of gaps) assert.ok(Math.abs(g - 2) < 0.2, `pass spacing ${g}`);
  assert.equal(alarmsOf(agc).length, 0);
  const s = agc.workload.snapshot();
  assert.equal(s.phase, 'P63-preLR');
  assert.equal(agc.restart.isProtected(5), true);
  assert.throws(() => agc.workload.setPhase('P99'));
});

test('workload: after a restart only the newest SERVICER comes back and the monitor is gone', () => {
  const agc = makeAgc();
  agc.workload.setPhase('P63-LR');
  agc.workload.setRrFault(true);
  agc.run(4);
  agc.workload.setMonitor(true);
  let restartAt = null;
  agc.bus.on('restart', (r) => { if (restartAt === null) restartAt = r.t; });
  agc.run(40, () => {
    if (restartAt !== null && agc.t === Math.round(restartAt * 100) / 100) {
      const servicers = agc.exec.coreSets.filter((j) => j && (j.name === 'SERVICER' || j.name === 'GUIDANCE'));
      assert.ok(servicers.length <= 2);
    }
  });
  assert.ok(restartAt !== null, 'the monitor overloaded the machine');
  assert.equal(agc.workload.snapshot().monitor, false, 'restart killed the monitor');
  assert.equal(agc.exec.findJobs('MONDO').length, 0);
});

test('determinism: identical runs give identical alarms', () => {
  const runOnce = () => {
    const agc = makeAgc();
    agc.workload.setPhase('P64');
    agc.workload.setDisplayFlashing(false);
    agc.workload.setLrIncorporation(true);
    agc.workload.setRrFault(true);
    agc.run(60);
    return alarmsOf(agc).map((a) => [a.t.toFixed(3), a.code]);
  };
  const a = runOnce();
  assert.ok(a.length > 0);
  assert.deepEqual(runOnce(), a);
});

test('snapshot shape (ARCHITECTURE §6.7)', () => {
  const agc = makeAgc();
  agc.workload.setPhase('P63-LR');
  agc.run(3);
  const s = agc.exec.snapshot();
  for (const k of ['coreSets', 'vacs', 'load', 'queue', 'idle', 'history', 'running', 'backlogMs', 'waitlist']) {
    assert.ok(k in s, k);
  }
  assert.equal(s.coreSets.length, 8);
  assert.equal(s.vacs.length, 5);
  assert.ok('total' in s.load && 'parts' in s.load);
  for (const c of s.coreSets) {
    assert.equal(typeof c.index, 'number');
    if (c.job) for (const k of ['id', 'name', 'prio', 'vacIndex', 'state', 'age']) assert.ok(k in c.job, k);
  }
  assert.ok(JSON.stringify(s)); // plain data
});

// ---------------------------------------------------------------- calibration

// Time to the first overflow in each configuration. Each run: the phase is
// set at t = 0; when `mon` is set, the crew keys V16N68E (7 keystrokes,
// 0.4 s apart) ending at t = 20 s and times are measured from that ENTR.
function firstOverflow({ phase, rr = true, mon = false, flash = null, incorp = false, vel = 1000, attHold = false, dur = 120, offset = 0 }) {
  const agc = makeAgc();
  agc.nav.vHoriz = vel;
  agc.workload.setLrIncorporation(incorp);
  agc.workload.setPhase(phase);
  if (flash !== null) agc.workload.setDisplayFlashing(flash);
  if (attHold) agc.workload.setAttHold(true);
  agc.workload.setRrFault(rr);
  const t0 = agc.t;
  const enter = t0 + 20 + offset;
  const keys = mon ? [...Array(7)].map((_, i) => Math.round((enter - 2.4 + i * 0.4) * 100) / 100) : [];
  let k = 0;
  agc.run(dur, (t) => {
    while (k < keys.length && t >= keys[k] - 1e-9) {
      agc.key();
      k += 1;
      if (k === keys.length) agc.workload.setMonitor(true);
    }
  });
  const ref = mon ? enter : t0;
  return alarmsOf(agc).map((a) => ({ dt: a.t - ref, code: a.code }));
}

test('calibration report: time to the first overflow per configuration', (t) => {
  const P = DEFAULT_PARAMS;
  const margins = [
    ['P63 before LR', 'P63-preLR', {}],
    ['P63 after LR', 'P63-LR', {}],
    ['P63 after LR + V16N68', 'P63-LR', { monitor: true }],
    ['P64 (flashing V06N64)', 'P64', { flashing: true, lrIncorporating: true }],
    ['P64 (after PRO)', 'P64', { lrIncorporating: true }],
    ['P66', 'P66', { lrIncorporating: true }],
  ];
  for (const [label, phase, o] of margins) {
    t.diagnostic(`margin ${label.padEnd(26)} ${(100 * (1 - estimateLoad(P, phase, o))).toFixed(1)} % (no RR fault)`);
  }

  const fmt = (list) => (list.length ? list.map((a) => `${a.dt.toFixed(1)} s ${formatAlarmCode(a.code)}`).join(', ') : 'none');
  const run = (label, cfg) => {
    const r = firstOverflow(cfg);
    t.diagnostic(`${label.padEnd(44)} ${fmt(r)}`);
    return r;
  };

  // Nominal descent: never, even with the monitor.
  for (const [label, cfg] of [
    ['no RR: P63 after LR + V16N68', { phase: 'P63-LR', rr: false, mon: true }],
    ['no RR: P64 after PRO + V16N68', { phase: 'P64', rr: false, mon: true, flash: false, incorp: true }],
    ['no RR: P64 flashing', { phase: 'P64', rr: false, flash: true, incorp: true }],
  ]) assert.equal(run(label, cfg).length, 0, label);

  // RR fault, P63 before LR and after LR without a monitor: no overflow.
  assert.equal(run('RR: P63 before LR', { phase: 'P63-preLR' }).length, 0);
  assert.equal(run('RR: P63 after LR, V06N63 only', { phase: 'P63-LR', incorp: true, vel: 500 }).length, 0);

  // RR fault + V16N68 in P63: a 1202 within seconds to tens of seconds,
  // for any phase of the keying relative to READACCS; afterwards (monitor
  // killed by the restart) no further overflow.
  for (const offset of [0, 0.5, 1.0, 1.5]) {
    const a = run(`RR: P63 + V16N68 (like 102:38:09), +${offset} s`, { phase: 'P63-LR', mon: true, offset, dur: 90 });
    assert.ok(a.length >= 1, 'overflow');
    assert.equal(a[0].code, 0o1202);
    assert.ok(a[0].dt > 3 && a[0].dt < 30, `first 1202 after ${a[0].dt} s`);
    assert.equal(a.length, 1, 'the restart shed the load');
    const b = run(`RR: P63 + V57 + V16N68 (like 102:38:51), +${offset} s`, { phase: 'P63-LR', mon: true, incorp: true, vel: 500, offset, dur: 90 });
    assert.equal(b[0].code, 0o1202);
    assert.ok(b[0].dt > 3 && b[0].dt < 30);
    assert.equal(b.length, 1);
  }

  // P64: overflows keep coming (the restart cannot shed load); 1201 while
  // the flashing V06N64 (SPVAC display jobs) holds VAC areas, 1202 after PRO.
  const fl = run('RR: P64 flashing V06N64', { phase: 'P64', flash: true, incorp: true });
  assert.ok(fl.length >= 2);
  assert.ok(fl.every((a) => a.code === 0o1201), '1201s while flashing');
  const st = run('RR: P64 after PRO', { phase: 'P64', flash: false, incorp: true });
  assert.ok(st.length >= 2);
  assert.ok(st.some((a) => a.code === 0o1202));
  assert.equal(run('RR: P64 in ATT HOLD', { phase: 'P64', flash: false, incorp: true, attHold: true }).length, 0);

  // P66: lighter — no overflow.
  assert.equal(run('RR: P66', { phase: 'P66', incorp: true }).length, 0);
  assert.equal(run('RR: P66 + V16N68', { phase: 'P66', incorp: true, mon: true }).length, 0);
});

// The Apollo 11 descent with the crew's DSKY inputs (crew timeline of
// js/demo/scenarios/crew-a11.js; MR Table 5-I for the program events), the
// RR fault on throughout. Stand-in for PINBALL: CHARIN jobs per key and
// setMonitor() at the ENTR of V16N68 / at the next crew display. The real
// end-to-end check (Simulation + programs + PINBALL) is in scenarios.test.mjs.
test('Apollo 11 descent (workload only): 1202, 1202, 1201, 1202, 1202 near the historical GETs', (t) => {
  const G = (s) => {
    const [h, m, sec] = s.split(':').map(Number);
    return h * 3600 + m * 60 + sec;
  };
  const history = [['102:38:22', 0o1202], ['102:39:02', 0o1202], ['102:42:18', 0o1201], ['102:42:43', 0o1202], ['102:42:58', 0o1202]];
  for (const phase of [0.5, 1.0]) {
    const agc = makeAgc({ t0: G('102:37:40') + phase });
    agc.nav.vHoriz = 700; // above 2000 ft/s until 102:38:50 (no LR velocity reads)
    agc.workload.setPhase('P63-LR');
    agc.workload.setRrFault(true);
    const ev = [];
    const keys = (end, n, fn) => {
      for (let i = 0; i < n; i++) ev.push({ t: G(end) - (n - 1 - i) * 0.4, fn: () => { agc.key(); if (i === n - 1 && fn) fn(); } });
    };
    keys('102:38:09', 7, () => agc.workload.setMonitor(true));     // V16N68E
    keys('102:38:27', 7, () => agc.workload.setMonitor(false));    // V05N09E
    keys('102:38:34', 1); keys('102:38:35', 1);                    // RSET, KEY REL
    keys('102:38:44', 4, () => agc.workload.setLrIncorporation(true)); // V57E
    ev.push({ t: G('102:38:50'), fn: () => { agc.nav.vHoriz = 600; } });
    keys('102:38:51', 7, () => agc.workload.setMonitor(true));     // V16N68E
    keys('102:39:08', 7, () => agc.workload.setMonitor(false));    // V05N09E
    keys('102:39:11', 1); keys('102:39:12', 1);
    ev.push({ t: G('102:41:32'), fn: () => { agc.workload.setPhase('P64'); agc.workload.setDisplayFlashing(true); } });
    ev.push({ t: G('102:41:53'), fn: () => agc.workload.setAttHold(true) });
    ev.push({ t: G('102:42:03'), fn: () => agc.workload.setAttHold(false) });
    keys('102:42:21', 7); keys('102:42:27', 1); keys('102:42:28', 1);
    keys('102:42:33', 1, () => agc.workload.setDisplayFlashing(false)); // PRO on V06N64
    keys('102:42:45', 7); keys('102:42:50', 1); keys('102:42:51', 1);
    ev.push({ t: G('102:43:13'), fn: () => agc.workload.setAttHold(true) });
    ev.push({ t: G('102:43:22'), fn: () => agc.workload.setPhase('P66') });
    ev.sort((a, b) => a.t - b.t);
    let i = 0;
    agc.run(G('102:45:40') - agc.t, (tt) => { while (i < ev.length && ev[i].t <= tt + 1e-9) ev[i++].fn(); });
    const got = alarmsOf(agc);
    t.diagnostic(`READACCS phase +${phase} s: ${got.map((a) => `${formatGET(a.t, { tenths: true })} ${formatAlarmCode(a.code)}`).join(', ')}`);
    // P64 is close to the edge (the restart there "could not shed load"):
    // the model may add one more 1202 before ATT HOLD at 102:43:13.
    assert.deepEqual(got.slice(0, 5).map((a) => a.code), history.map((h) => h[1]), 'the historical sequence of codes');
    history.forEach(([when], k) => assert.ok(Math.abs(got[k].t - G(when)) < 6, `alarm ${k + 1} at ${got[k].t - G(when)} s from history`));
    assert.ok(got.length <= 6 && got.slice(5).every((a) => a.code === 0o1202 && a.t < G('102:43:14')));
    assert.equal(got.filter((a) => a.t > G('102:43:22')).length, 0, 'none in P66');
  }
});
