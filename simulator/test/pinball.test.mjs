// PINBALL (js/agc/pinball.js), the verb tables (verbs.js) and the noun
// tables (nouns.js). Most tests drive Pinball through a small stand-in for
// the Agc built from the real DskyState and AlarmRegisters with a fake
// Executive that records every job request and runs the jobs at the end of
// each 10-ms step. The last tests use the real Simulation when it imports.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DskyState } from '../js/agc/dsky-state.js';
import { AlarmRegisters } from '../js/agc/alarms.js';
import { createBus } from '../js/util/bus.js';
import { Pinball, MONDEL_S, LAMP_TEST_S, CHRPRIO } from '../js/agc/pinball.js';
import { VERBS_LUMINARY099, VERBS_COMANCHE055, V37_PROGRAMS_LUMINARY099, verbTable } from '../js/agc/verbs.js';
import { NOUNS_LUMINARY099, NOUNS_COMANCHE055, erasableNames, readErasable, formatComponent } from '../js/agc/nouns.js';

const T0 = 102 * 3600 + 38 * 60;   // 102:38:00

function makeAgc({ software = 'Luminary099', mode = 63, erasable = {}, withExec = true } = {}) {
  const bus = createBus();
  const events = [];
  bus.on('*', (e) => events.push(e));
  const dsky = new DskyState();
  const requested = [];
  const queue = [];
  const agc = {
    software, t: T0, mode, erasable: { ...erasable }, flags: {}, dsky, bus, events, requested,
    alarms: new AlarmRegisters({ software, dsky, bus }),
    calls: { changeProgram: [], freshStart: 0, hardwareRestart: [], poodoo: [] },
    execFull: false,
    changeProgram(n) { this.calls.changeProgram.push(n); this.mode = n; dsky.setProg(String(n).padStart(2, '0')); return true; },
    freshStart() { this.calls.freshStart += 1; },
    hardwareRestart(c) { this.calls.hardwareRestart.push(c); this.pinball.onRestart({ hardware: true }); },
    poodoo(c) { this.calls.poodoo.push(c); },
  };
  if (withExec) {
    agc.exec = {
      requestJob(r) {
        requested.push({ ...r, t: agc.t });
        if (agc.execFull) return null;
        queue.push(r);
        return { id: requested.length, name: r.name };
      },
      now: () => agc.t,
    };
  }
  agc.pinball = new Pinball(agc);
  agc.runJobs = () => { while (queue.length) queue.shift().onDone(agc.t); };
  agc.run = (sec) => {
    const n = Math.round(sec / 0.01);
    for (let i = 0; i < n; i++) {
      agc.t = Math.round((agc.t + 0.01) * 1000) / 1000;
      agc.pinball.step(0.01, agc.t);
      agc.runJobs();
    }
  };
  // Key a script (100 ms apart) and let it finish.
  agc.keys = (script, after = 0.2) => {
    const times = agc.pinball.pressScript(script, { gapMs: 100 });
    agc.runJobs();
    agc.run(times.length * 0.1 + after);
  };
  agc.press = (key) => {
    agc.pinball.press(key);
    agc.runJobs();
    agc.run(key === 'PRO' ? 0.2 : 0.02);
  };
  return agc;
}

const regs = (agc) => agc.dsky.r.map((r) => r.sign + r.digits);
const lit = (agc, name) => agc.dsky.lights[name];

// ------------------------------------------------------------- key entry

test('VERB/NOUN: digits blank then fill; a third digit is ignored; state.entry', () => {
  const a = makeAgc();
  a.press('VERB');
  assert.equal(a.dsky.verb, '  ');
  assert.equal(a.pinball.state.entry, 'verb');
  a.press('1');
  assert.equal(a.dsky.verb, '1 ');
  a.press('6');
  a.press('3');
  assert.equal(a.dsky.verb, '16');
  a.press('NOUN');
  assert.equal(a.pinball.state.entry, 'noun');
  a.press('6');
  a.press('8');
  assert.equal(a.dsky.noun, '68');
  assert.equal(a.pinball.state.verb, 16);
  assert.equal(a.pinball.state.noun, 68);
});

test('every key costs a CHARIN job (NOVAC, CHRPRIO 30); a lost job loses the key', () => {
  const a = makeAgc();
  a.keys('V06N36E');
  const charin = a.requested.filter((r) => r.name === 'CHARIN');
  assert.equal(charin.length, 7);
  for (const r of charin) {
    assert.equal(r.prio, 0o30);
    assert.equal(r.prio, CHRPRIO);
    assert.equal(r.vac, false);
    assert.ok(r.workMs > 0 && r.workMs < 20);
    assert.equal(r.source, 'pinball');
  }
  a.execFull = true;
  a.press('VERB');
  assert.equal(a.dsky.verb, '06', 'the VERB key was lost: no core set');
  assert.equal(a.pinball.log.at(-1).type, 'lost');
});

test('PRO is sampled by T4RUPT (120 ms) and runs PROCKEY', () => {
  const a = makeAgc();
  a.t = T0 + 0.05;
  a.pinball.press('PRO');
  a.runJobs();
  assert.equal(a.requested.filter((r) => r.name === 'PROCKEY').length, 0);
  a.run(0.12);
  const pk = a.requested.filter((r) => r.name === 'PROCKEY');
  assert.equal(pk.length, 1);
  assert.ok(Math.abs(((pk[0].t / 0.12) % 1)) < 1e-6 || Math.abs(((pk[0].t / 0.12) % 1) - 1) < 1e-6);
});

test('decimal display V06N36: the AGC clock in hours / minutes / seconds', () => {
  const a = makeAgc();
  a.t = 102 * 3600 + 34 * 60 + 54.32;
  a.keys('V06N36E', 0);
  const t = a.pinball.state;
  assert.equal(t.verb, 6);
  assert.deepEqual(regs(a).slice(0, 2), ['+00102', '+00034']);
  assert.match(regs(a)[2], /^\+05(4|5)\d\d$/);
});

test('ENTR on a finished display executes the same verb/noun again', () => {
  const a = makeAgc({ erasable: { ABVEL: 5559.7, HDOTDISP: -2.2, HCALC1: 49971 } });
  a.keys('V06N63E');
  assert.deepEqual(regs(a), ['+55597', '-00022', '+49971']);
  a.erasable.HCALC1 = 49000;
  a.press('ENTR');
  assert.equal(regs(a)[2], '+49000');
});

// ------------------------------------------------------------- OPR ERR

test('illegal verbs and nouns light OPR ERR (spare verb, spare noun, octal-only noun with V06)', () => {
  for (const script of ['V08N36E', 'V00N36E', 'V06N17E', 'V06N09E', 'V05N63E', 'V45E', 'V04N36E']) {
    const a = makeAgc();
    a.keys(script);
    assert.equal(lit(a, 'oprErr'), true, script);
    assert.ok(a.events.some((e) => e.type === 'oprerr'), `${script}: 'oprerr' bus event`);
  }
  const ok = makeAgc();
  ok.keys('V06N36E');
  assert.equal(lit(ok, 'oprErr'), false);
});

test('8 or 9 in an octal load is an operator error; after a sign it is fine', () => {
  const a = makeAgc();
  a.keys('V21N25E');                        // checklist noun, R1 octal or decimal
  assert.equal(a.dsky.flashVerbNoun, true);
  a.press('8');
  assert.equal(lit(a, 'oprErr'), true);
  assert.equal(a.dsky.r[0].digits, '     ');
  const b = makeAgc();
  b.keys('V21N25E+00089E');
  assert.equal(lit(b, 'oprErr'), false);
  assert.equal(b.erasable.DSPTEM1, 89);
});

test('decimal load needs a sign and 5 digits; octal into a decimal-only noun recycles', () => {
  const a = makeAgc();
  a.keys('V25N33E+00102E+00034E+05432E');
  assert.equal(lit(a, 'oprErr'), false);
  assert.ok(Math.abs(a.erasable.TIG - (102 * 3600 + 34 * 60 + 54.32)) < 1e-6);
  assert.equal(a.dsky.verb, '23', 'ABCLOAD leaves VERBREG at 23');
  assert.equal(a.dsky.flashVerbNoun, false);

  // Fewer than 5 digits: OPR ERR, flash stays on, the operator may go on typing.
  const b = makeAgc();
  b.keys('V21N34E+102E');
  assert.equal(lit(b, 'oprErr'), true);
  assert.equal(b.dsky.flashVerbNoun, true);
  assert.equal(b.pinball.state.request, 'load');

  // No sign = octal: N33 is decimal only -> ALMCYCLE (OPR ERR, V25 starts over at R1).
  const c = makeAgc();
  c.keys('V25N33E00102E00034E05432E');
  assert.equal(lit(c, 'oprErr'), true);
  assert.equal(c.erasable.TIG, undefined);
  assert.equal(c.dsky.verb, '21');
  assert.equal(c.dsky.flashVerbNoun, true);
  assert.equal(c.pinball.state.load.register, 1);
});

test('load restrictions: V24/V25 on a NO LOAD noun; min/sec cannot be loaded; HMS needs 3 words', () => {
  const a = makeAgc();
  a.keys('V25N68E');
  assert.equal(lit(a, 'oprErr'), true);
  const b = makeAgc();
  b.keys('V22N68E+00010E');                 // R2 of N68 is TTFDISP (min/sec)
  assert.equal(lit(b, 'oprErr'), true);
  assert.equal(b.erasable.TTFDISP, undefined);
  const c = makeAgc();
  c.keys('V21N33E+00102E');                 // HMS with one component -> recycle as V25
  assert.equal(lit(c, 'oprErr'), true);
  assert.equal(c.dsky.verb, '21');
  assert.equal(c.pinball.state.load.verb, 25);
});

test('CLR blanks the register being loaded; a second CLR backs up one register', () => {
  const a = makeAgc();
  a.keys('V25N34E+00102E+000');
  assert.equal(a.dsky.verb, '22');
  assert.equal(regs(a)[1], '+000  ');
  a.press('CLR');
  assert.equal(regs(a)[1], '      ');
  assert.equal(a.dsky.verb, '22');
  a.press('CLR');
  assert.equal(a.dsky.verb, '21', 'VERBREG decremented and redisplayed');
  assert.equal(regs(a)[0], '      ');
  a.press('CLR');
  assert.equal(a.dsky.verb, '21', 'cannot back up before R1');
  // CLR in the verb field does nothing.
  const b = makeAgc();
  b.keys('V0');
  b.press('CLR');
  assert.equal(b.dsky.verb, '0 ');
  assert.equal(lit(b, 'oprErr'), false);
});

// ------------------------------------------------------------- monitor

test('V16N68E starts a 1-s monitor: one MONDO job (NOVAC, prio 30) every second', () => {
  const a = makeAgc({ erasable: { RANGEDSP: 250.3, TTFDISP: -400, DELTAH: -2884 } });
  a.keys('V16N68E', 0);
  const start = a.t;
  a.run(5.0);
  const mondo = a.requested.filter((r) => r.name === 'MONDO');
  assert.ok(mondo.length >= 5 && mondo.length <= 6, `${mondo.length} MONDO jobs in 5 s`);
  for (const r of mondo) {
    assert.equal(r.prio, 0o30);
    assert.equal(r.vac, false);
    assert.equal(r.source, 'pinball');
  }
  for (let i = 2; i < mondo.length; i++) assert.ok(Math.abs(mondo[i].t - mondo[i - 1].t - MONDEL_S) < 0.011);
  assert.ok(mondo[0].t - start < 0.05, 'first update after 1 cs');
  assert.equal(a.dsky.verb, '16', 'the monitor verb is pasted back');
  assert.deepEqual(regs(a), ['+02503', '-06 40', '-02884']);
  a.erasable.DELTAH = -900;
  a.run(1.0);
  assert.equal(regs(a)[2], '-00900');
  assert.deepEqual(a.pinball.state.monitor, { verb: 16, noun: 68, external: true });
  a.keys('V34E');
  const n = a.requested.filter((r) => r.name === 'MONDO').length;
  a.run(3);
  assert.equal(a.requested.filter((r) => r.name === 'MONDO').length, n, 'V34 ended the monitor');
  assert.equal(a.pinball.state.monitor, null);
});

test('a key suspends the monitor (KEY REL lights); KEY REL resumes it', () => {
  const a = makeAgc({ erasable: { DELTAH: -2884 } });
  a.keys('V16N68E', 1);
  a.alarms.alarm(0o1202);
  a.keys('V05N09E', 1.2);
  assert.equal(regs(a)[0], ' 01202');
  assert.equal(lit(a, 'keyRel'), true, 'MONBUSY lights KEY REL');
  a.run(2);
  assert.equal(a.dsky.verb, '05', 'monitor suspended');
  a.press('KEY REL');
  a.run(1.1);
  assert.equal(a.dsky.verb, '16');
  assert.equal(a.dsky.noun, '68');
  assert.equal(regs(a)[2], '-02884');
});

test('V05N09 after an alarm: 01202 in R1, no sign; RSET clears PROG and FAILREG', () => {
  const a = makeAgc();
  a.alarms.alarm(0o1202);
  assert.equal(lit(a, 'prog'), true);
  a.keys('V05N09E');
  assert.deepEqual(regs(a), [' 01202', ' 00000', ' 00000']);
  a.alarms.alarm(0o1202);
  a.alarms.alarm(0o1201);
  a.press('ENTR');
  assert.deepEqual(regs(a), [' 01202', ' 01202', ' 01201']);
  a.dsky.setLights({ oprErr: true, restart: true, keyRel: true });
  a.dsky.setFlash(true);
  a.press('RSET');
  assert.equal(lit(a, 'prog'), false);
  assert.equal(lit(a, 'oprErr'), false);
  assert.equal(lit(a, 'restart'), false);
  assert.equal(lit(a, 'keyRel'), true, 'RSET leaves KEY REL');
  assert.equal(a.dsky.flashVerbNoun, true, 'RSET leaves the flash');
  assert.deepEqual(a.alarms.registers(), [0, 0, 0]);
  a.press('ENTR');
  assert.deepEqual(regs(a), [' 00000', ' 00000', ' 00000']);
});

// ------------------------------------------------------------- V35

test('V35 lamp test: all lamps, 88 / +88888, V/N flash for exactly 5.00 s', () => {
  const a = makeAgc({ mode: 63 });
  a.dsky.setProg('63');
  a.keys('V35E', 0);
  const start = a.pinball.log.find((e) => e.type === 'lamp-test').t;
  const d = a.dsky.snapshot();
  assert.equal(d.lampTest, true);
  assert.equal(d.prog + d.verb + d.noun, '888888');
  assert.deepEqual(regs(a), ['+88888', '+88888', '+88888']);
  assert.equal(d.flashVerbNoun, true);
  for (const l of ['uplinkActy', 'temp', 'keyRel', 'oprErr', 'noAtt', 'gimbalLock', 'tracker', 'prog', 'alt', 'vel', 'stby', 'restart']) {
    assert.equal(d.lights[l], true, l);
  }
  assert.equal(d.lights.prioDisp, false, 'PRIO DISP is a blank window on Apollo 11');
  a.run(start + LAMP_TEST_S - a.t - 0.02);
  assert.equal(a.dsky.lampTest, true, 'still on just before 5 s');
  a.run(0.05);
  const e = a.dsky.snapshot();
  assert.equal(e.lampTest, false);
  for (const l of ['uplinkActy', 'temp', 'keyRel', 'oprErr', 'noAtt', 'gimbalLock', 'tracker', 'prog', 'alt', 'vel', 'stby', 'restart']) {
    assert.equal(e.lights[l], false, `${l} off at the end`);
  }
  assert.equal(e.flashVerbNoun, false);
  assert.equal(e.prog, '63', 'DSPMM shows the major mode again');
  assert.equal(e.verb + e.noun, '8888', 'the 8s stay until the next display');
  assert.deepEqual(regs(a), ['+88888', '+88888', '+88888']);
  const end = a.pinball.log.find((x) => x.type === 'lamp-test-end').t;
  assert.ok(Math.abs(end - start - 5.0) < 0.015, `lamp test lasted ${end - start} s`);
});

test('V35 restores lamps driven elsewhere (RESTART flip-flop, NO ATT) and ends a monitor', () => {
  const a = makeAgc({ mode: null });
  a.dsky.setLights({ restart: true, noAtt: true });
  a.keys('V16N36E', 0.5);
  a.keys('V35E', 6);
  assert.equal(lit(a, 'restart'), true);
  assert.equal(lit(a, 'noAtt'), true);
  assert.equal(a.dsky.prog, '  ', 'MODREG -0: blank PROG');
  assert.equal(a.pinball.state.monitor, null);
});

test('Comanche055 V35 works only in P00 (CHKPOOH)', () => {
  const a = makeAgc({ software: 'Comanche055', mode: 40 });
  a.keys('V35E');
  assert.equal(a.dsky.lampTest, false);
  assert.equal(lit(a, 'oprErr'), true);
  const b = makeAgc({ software: 'Comanche055', mode: 0 });
  b.keys('V35E', 0);
  assert.equal(b.dsky.lampTest, true);
  assert.equal(lit(b, 'alt'), false, 'CM TSTCON2 has no ALT/VEL');
});

// ------------------------------------------------------------- V37 / V36 / V69 / V57

test('V37E63E calls changeProgram(63); V37 shows 37 flashing with a blank noun first', () => {
  const a = makeAgc({ mode: 0 });
  a.keys('V37E', 0);
  assert.equal(a.dsky.verb, '37');
  assert.equal(a.dsky.noun, '  ');
  assert.equal(a.dsky.flashVerbNoun, true);
  a.keys('63', 0);
  assert.equal(a.dsky.noun, '63');
  a.keys('E');
  assert.deepEqual(a.calls.changeProgram, [63]);
  assert.equal(a.dsky.flashVerbNoun, false);
  assert.equal(a.dsky.prog, '63');
  assert.equal(lit(a, 'oprErr'), false);
});

test('illegal V37 program -> OPR ERR (V37NONO); one digit -> OPR ERR and V37 asked again', () => {
  const a = makeAgc({ mode: 0 });
  a.keys('V37E99E');
  assert.deepEqual(a.calls.changeProgram, []);
  assert.equal(lit(a, 'oprErr'), true);
  const b = makeAgc({ mode: 0 });
  b.keys('V37E64E');                         // P64 is entered automatically only
  assert.deepEqual(b.calls.changeProgram, []);
  assert.equal(lit(b, 'oprErr'), true);
  const c = makeAgc({ mode: 0 });
  c.keys('V37E6E');
  assert.deepEqual(c.calls.changeProgram, []);
  assert.equal(lit(c, 'oprErr'), true);
  assert.equal(c.dsky.verb, '37');
  assert.equal(c.dsky.flashVerbNoun, true);
  assert.equal(c.dsky.noun, '  ');
  c.keys('68E');
  assert.deepEqual(c.calls.changeProgram, [68]);
  for (const n of [0, 12, 63, 68, 70, 71]) assert.ok(V37_PROGRAMS_LUMINARY099.includes(n), `P${n}`);
});

test('V36 fresh start, V69 hardware restart, V57/V58 landing-radar permit', () => {
  const a = makeAgc();
  a.keys('V36E');
  assert.equal(a.calls.freshStart, 1);
  const b = makeAgc();
  b.keys('V69E');
  assert.deepEqual(b.calls.hardwareRestart, ['V69']);
  const c = makeAgc();
  c.dsky.setProg('63');
  c.keys('V57E');
  assert.equal(c.flags.LRINH, true, 'LRON: UPFLAG LRINH');
  assert.equal(c.dsky.verb + c.dsky.noun, '    ', 'GOPIN -> PINBRNCH -> ERASER');
  assert.equal(c.dsky.prog, '63', 'ERASER leaves the major mode');
  c.keys('V58E');
  assert.equal(c.flags.LRINH, false);
});

// ------------------------------------------------------------- program displays

test('a program display while the crew has the DSKY waits (KEY REL lit); KEY REL shows it', () => {
  const a = makeAgc({ erasable: { ABVEL: 5000, HDOTDISP: -100, HCALC1: 30000, RANGEDSP: 100, TTFDISP: -200, DELTAH: -2000 } });
  a.pinball.showDisplay({ verb: 6, noun: 63 });
  assert.equal(a.dsky.noun, '63');
  a.keys('V06N68E');
  assert.equal(a.dsky.noun, '68');
  assert.equal(a.pinball.showDisplay({ verb: 6, noun: 63, source: 'p63' }), 'waiting');
  assert.equal(lit(a, 'keyRel'), true);
  assert.equal(a.dsky.noun, '68');
  assert.equal(a.pinball.state.dsplist.noun, 63);
  a.press('KEY REL');
  assert.equal(a.dsky.noun, '63');
  assert.equal(lit(a, 'keyRel'), false);
  assert.deepEqual(regs(a), ['+05000', '-01000', '+30000']);
});

test('a crew V16N68 holds the DSKY against the program display; KEY REL hands it back', () => {
  const a = makeAgc({ erasable: { ABVEL: 5000, HDOTDISP: -100, HCALC1: 30000, DELTAH: -2000 } });
  a.keys('V16N68E', 1);
  assert.equal(a.pinball.showDisplay({ verb: 6, noun: 63 }), 'waiting');
  assert.equal(lit(a, 'keyRel'), true);
  a.run(1.1);
  assert.equal(a.dsky.noun, '68', 'the monitor keeps running');
  a.press('KEY REL');
  assert.equal(a.dsky.noun, '63', 'the waiting V06N63 replaces it');
  assert.equal(a.pinball.state.monitor, null, 'NVSUB ended the monitor');
});

test('flashing program display: keys light KEY REL, KEY REL re-establishes, PRO / V34 / V32 answer', () => {
  const answers = [];
  const handlers = {
    onProceed: () => answers.push('proceed'),
    onTerminate: () => answers.push('terminate'),
    onRecycle: () => answers.push('recycle'),
    onEnter: () => answers.push('enter'),
  };
  const a = makeAgc({ erasable: { TTFDISP: -600, TTOGO: -400, OUTOFPLN: 1.2, ABVEL: 5000, HDOTDISP: 1, HCALC1: 50000 } });
  a.pinball.showDisplay({ verb: 6, noun: 61, flash: true, ...handlers });
  assert.equal(a.dsky.flashVerbNoun, true);
  assert.deepEqual(a.pinball.state.waiting, { verb: 6, noun: 61, flash: true, priority: false, source: null });
  // ENTR on a flashing V06 just executes V06N61 again (not a response) and
  // the crew now holds the DSKY: KEY REL.
  a.press('ENTR');
  assert.deepEqual(answers, []);
  assert.equal(lit(a, 'keyRel'), true);
  a.keys('V06N63E');
  assert.equal(a.dsky.noun, '63');
  a.press('KEY REL');
  assert.equal(a.dsky.noun, '61', 'PINBRNCH re-establishes the flashing display');
  assert.equal(a.dsky.flashVerbNoun, true);
  assert.equal(lit(a, 'keyRel'), false);
  a.press('PRO');
  assert.deepEqual(answers, ['proceed']);
  assert.equal(a.dsky.flashVerbNoun, false);
  assert.equal(a.pinball.state.waiting, null);

  a.pinball.showDisplay({ verb: 6, noun: 61, flash: true, ...handlers });
  a.keys('V34E');
  a.pinball.showDisplay({ verb: 6, noun: 61, flash: true, ...handlers });
  a.keys('V32E');
  a.pinball.showDisplay({ verb: 6, noun: 61, flash: true, ...handlers });
  a.keys('V33E');
  assert.deepEqual(answers, ['proceed', 'terminate', 'recycle', 'proceed']);
});

test('V99N62 "please enable engine": V06N62 then a pasted, flashing 99; PRO or ENTR answer', () => {
  const answers = [];
  const a = makeAgc({ erasable: { ABVEL: 5560.1, TTOGO: -5, DVTOTAL: 0 } });
  const req = { verb: 99, noun: 62, flash: true, onProceed: () => answers.push('proceed'), onEnter: () => answers.push('enter'), onTerminate: () => answers.push('terminate') };
  assert.equal(a.pinball.showDisplay(req), 'shown');
  assert.equal(a.dsky.verb, '99');
  assert.equal(a.dsky.noun, '62');
  assert.equal(a.dsky.flashVerbNoun, true);
  assert.deepEqual(regs(a), ['+55601', '-00 05', '+00000']);
  a.press('PRO');
  assert.deepEqual(answers, ['proceed']);
  a.pinball.showDisplay(req);
  a.press('ENTR');
  assert.deepEqual(answers, ['proceed', 'enter']);
});

test('V50N25 checklist (GOPERF1): R1 octal code, R2/R3 blank, flashing 50', () => {
  const answers = [];
  const a = makeAgc();
  a.pinball.showDisplay({ verb: 50, noun: 25, checklist: 0o500, onEnter: () => answers.push('enter'), onProceed: () => answers.push('proceed') });
  assert.equal(a.dsky.verb, '50');
  assert.equal(a.dsky.noun, '25');
  assert.deepEqual(regs(a), [' 00500', '      ', '      ']);
  assert.equal(a.dsky.flashVerbNoun, true);
  a.press('ENTR');
  assert.deepEqual(answers, ['enter']);
});

test('GOTOPOOH V37N99 (flashing V37, blank noun): the crew keys 63 ENTR', () => {
  const a = makeAgc({ mode: 0 });
  a.pinball.showDisplay({ verb: 37, noun: 99, flash: true });
  assert.equal(a.dsky.verb, '37');
  assert.equal(a.dsky.noun, '  ');
  assert.equal(a.dsky.flashVerbNoun, true);
  a.keys('63');
  assert.equal(lit(a, 'keyRel'), true, 'a job waits in ENDIDLE');
  a.keys('E');
  assert.deepEqual(a.calls.changeProgram, [63]);
  assert.equal(lit(a, 'keyRel'), false);
  assert.equal(a.pinball.state.waiting, null);
});

test('a program-requested monitor (V16N40 flashing) refreshes and is answered by PRO', () => {
  let proceeded = 0;
  const a = makeAgc({ software: 'Comanche055', erasable: { TTOGO: -100, VGDISP: 3000.5, DVTOTAL: 12.3 } });
  a.pinball.showDisplay({ verb: 16, noun: 40, flash: true, onProceed: () => { proceeded += 1; } });
  a.run(0.1);
  assert.deepEqual(regs(a), ['-01 40', '+30005', '+00123']);
  a.erasable.TTOGO = -99;
  a.run(1.0);
  assert.equal(regs(a)[0], '-01 39');
  assert.equal(a.dsky.verb, '16');
  assert.equal(a.pinball.state.monitor.external, false);
  a.press('PRO');
  assert.equal(proceeded, 1);
  assert.equal(a.pinball.state.monitor, null);
});

test('priority display interrupts the normal one and gives it back; 2-second rule', () => {
  const answers = [];
  const a = makeAgc({ erasable: { ABVEL: 5000, HDOTDISP: -10, HCALC1: 20000 } });
  a.alarms.alarm(0o1703);
  a.pinball.showDisplay({ verb: 6, noun: 63 });
  a.pinball.showDisplay({ verb: 5, noun: 9, priority: true, onProceed: () => answers.push('prio') });
  assert.equal(a.dsky.noun, '09');
  assert.equal(regs(a)[0], ' 01703');
  assert.equal(a.pinball.showDisplay({ verb: 6, noun: 63 }), 'interrupted');
  a.press('PRO');                            // too soon: sent out again
  assert.deepEqual(answers, []);
  assert.equal(a.dsky.noun, '09');
  a.run(2.0);
  a.press('PRO');
  assert.deepEqual(answers, ['prio']);
  assert.equal(a.dsky.noun, '63', 'the interrupted normal display is back');
});

test('blankFor (BURNBABY TIG-35, CLEANDSP): VERB/NOUN/R1-R3 dark, PROG stays; held display comes back', () => {
  const a = makeAgc({ erasable: { ABVEL: 5560, TTOGO: -35, DVTOTAL: 0 } });
  a.dsky.setProg('63');
  a.pinball.showDisplay({ verb: 6, noun: 62 });
  a.pinball.blankFor(5);
  const d = a.dsky.snapshot();
  assert.equal(d.prog, '63');
  assert.equal(d.verb + d.noun, '    ');
  assert.deepEqual(regs(a), ['      ', '      ', '      ']);
  assert.equal(d.blanked, false, 'not the all-digits-dark state');
  assert.equal(d.flashVerbNoun, false);
  a.erasable.TTOGO = -31;
  assert.equal(a.pinball.showDisplay({ verb: 6, noun: 62 }), 'held');
  assert.equal(a.dsky.noun, '  ');
  a.run(5.05);
  assert.equal(a.dsky.noun, '62');
  assert.equal(regs(a)[1], '-00 31');
});

// ------------------------------------------------------------- restarts

test('onRestart (ENEMA/STARTSB2): digits blanked, monitor and entry dropped, PROG lamp kept', () => {
  const a = makeAgc({ erasable: { DELTAH: -2884 } });
  a.keys('V16N68E', 1);
  a.alarms.alarm(0o1202);
  a.pinball.showDisplay({ verb: 6, noun: 61, flash: true });
  a.keys('V0');
  a.dsky.setLights({ oprErr: true });
  a.pinball.onRestart({ hardware: false });
  const d = a.dsky.snapshot();
  assert.equal(d.prog + d.verb + d.noun, '      ');
  assert.deepEqual(regs(a), ['      ', '      ', '      ']);
  assert.equal(d.lights.prog, true, 'the lamp word is not touched');
  assert.equal(d.lights.oprErr, false);
  assert.equal(d.lights.keyRel, false);
  assert.equal(d.flashVerbNoun, false);
  const s = a.pinball.state;
  assert.equal(s.monitor, null);
  assert.equal(s.waiting, null);
  assert.equal(s.entry, 'idle');
  assert.equal(s.dsplock, false);
  const n = a.requested.filter((r) => r.name === 'MONDO').length;
  a.run(3);
  assert.equal(a.requested.filter((r) => r.name === 'MONDO').length, n);
  a.press('5');
  assert.deepEqual(regs(a), ['      ', '      ', '      '], 'digits are blocked after a restart');
});

test('endMonitor() stops the MONDO requests', () => {
  const a = makeAgc();
  a.keys('V16N36E', 1.5);
  a.pinball.endMonitor();
  const n = a.requested.filter((r) => r.name === 'MONDO').length;
  a.run(3);
  assert.equal(a.requested.filter((r) => r.name === 'MONDO').length, n);
});

test('works without an Executive (keys take effect at once)', () => {
  const a = makeAgc({ withExec: false });
  a.pinball.pressScript('V06N36E', { gapMs: 0 });
  assert.equal(a.dsky.verb, '06');
  assert.equal(a.dsky.noun, '36');
  assert.match(regs(a)[0], /^\+00102$/);
});

test('pressScript emits a "key" bus event per key at its time', () => {
  const a = makeAgc();
  a.pinball.pressScript('V35E', { gapMs: 400, source: 'crew' });
  a.run(1.3);
  const keys = a.events.filter((e) => e.type === 'key').map((e) => e.payload);
  assert.deepEqual(keys.map((k) => k.key), ['VERB', '3', '5', 'ENTR']);
  assert.ok(Math.abs(keys[3].t - keys[0].t - 1.2) < 1e-9);
  assert.equal(keys[0].source, 'crew');
});

// ------------------------------------------------------------- tables

test('verb tables: 100 entries each, spares as in VERBTAB / LST2FAN', () => {
  for (const t of [VERBS_LUMINARY099, VERBS_COMANCHE055]) {
    for (let v = 0; v <= 99; v++) assert.ok(t[v] && t[v].name && t[v].kind && typeof t[v].impl === 'boolean', `verb ${v}`);
  }
  const spare = (t) => Object.values(t).filter((v) => v.kind === 'spare').map((v) => v.verb);
  assert.deepEqual(spare(VERBS_LUMINARY099), [0, 8, 9, 10, 18, 19, 20, 26, 28, 29, 38, 39, 45, 46, 51, 59, 68, 84, 86, 87, 88, 94, 98]);
  assert.deepEqual(spare(VERBS_COMANCHE055), [0, 8, 9, 10, 18, 19, 20, 26, 28, 29, 38, 39, 79, 84, 95, 98]);
  assert.equal(VERBS_LUMINARY099[57].name, 'PERMIT LANDING RADAR UPDATES');
  assert.equal(VERBS_LUMINARY099[99].kind, 'please');
  assert.equal(verbTable('Comanche055')[51].name, 'PLEASE MARK');
  for (const v of [1, 5, 6, 16, 21, 25, 32, 33, 34, 35, 36, 37, 57, 69, 99]) assert.equal(VERBS_LUMINARY099[v].impl, true, `V${v}`);
});

test('noun tables decoded from the listing: landing nouns', () => {
  const n = NOUNS_LUMINARY099;
  for (let i = 0; i < 100; i++) {
    assert.ok(n[i], `N${i}`);
    assert.ok(NOUNS_COMANCHE055[i], `CM N${i}`);
    assert.match(n[i].anchor, /^noun\.\d\d$/);
  }
  const fmt = (x) => x.components.map((c) => c.format);
  assert.deepEqual(fmt(n[60]), ['XXXX.X', 'XXXX.X', 'XXXXX']);
  assert.deepEqual(fmt(n[61]), ['XXbXX', 'XXbXX', 'XXXX.X']);
  assert.deepEqual(fmt(n[62]), ['XXXX.X', 'XXbXX', 'XXXX.X']);
  assert.deepEqual(fmt(n[63]), ['XXXX.X', 'XXXX.X', 'XXXXX']);
  assert.deepEqual(fmt(n[64]), ['+XXbYY', 'XXXX.X', 'XXXXX']);
  assert.deepEqual(fmt(n[65]), ['HMS.H', 'HMS.M', 'HMS.S']);
  assert.deepEqual(fmt(n[66]), ['XXXXX', '+0000X']);
  assert.deepEqual(fmt(n[68]), ['XXXX.X', 'XXbXX', 'XXXXX']);
  assert.deepEqual(n[68].components.map((c) => c.key), ['RANGEDSP', 'TTFDISP', 'DELTAH']);
  assert.deepEqual(n[68].components.map((c) => c.unit), ['nmi', 'min:s', 'ft']);
  assert.deepEqual(n[63].components.map((c) => c.key), ['ABVEL', 'HDOTDISP', 'HCALC1']);
  assert.equal(n[68].noLoad, true);
  assert.equal(n[68].decimalOnly, true);
  assert.equal(n[63].noLoad, false);
  assert.equal(n[69].inUse, false);
  assert.equal(n[9].components[0].octalOnly, true);
  assert.deepEqual(fmt(n[36]), ['HMS.H', 'HMS.M', 'HMS.S']);
  assert.match(n[68].name, /SLANT RANGE TO LANDING SITE/);
});

test('noun reads: erasable names, arrays for vectors, simulator fallbacks', () => {
  const agc = { t: 100, erasable: { HCALC: 1234, LPDTIME: 42, LPDANGLE: 51, VGBODY: [1.5, -2.25, 3], DELVLVC: 10, 'DELVLVC+2': 20, 'DELVLVC+4': 30, LRPOS: 2 } };
  const n = NOUNS_LUMINARY099;
  assert.equal(n[63].components[2].read(agc), 1234, 'HCALC1 falls back to HCALC');
  assert.deepEqual(n[64].components[0].read(agc), [42, 51]);
  assert.deepEqual(formatComponent(n[64].components[0], agc), { sign: '+', digits: '42 51' });
  assert.equal(n[66].components[1].read(agc), 2);
  assert.equal(n[36].components[0].read(agc), 100, 'TIME2 is the AGC clock');
  const c = NOUNS_COMANCHE055;
  assert.deepEqual(c[85].components.map((x) => x.read(agc)), [1.5, -2.25, 3], 'array word 0, +2, +4');
  assert.deepEqual(c[81].components.map((x) => x.read(agc)), [10, 20, 30], 'scalar words');
  assert.equal(readErasable({ erasable: { THETAD: [10, 20, 30] } }, 'THETAD'), 10);
  assert.equal(readErasable({ erasable: { THETAD: [10, 20, 30] } }, 'THETAD+2'), 30);
  const names = erasableNames('Luminary099').map((e) => e.name);
  for (const k of ['DELTAH', 'HDOTDISP', 'HCALC', 'VHORIZ', 'TTFDISP', 'RANGEDSP', 'TTOGO', 'VGDISP', 'DVTOTAL', 'TIG', 'ABVEL']) {
    assert.ok(names.includes(k), k);
  }
});

// ------------------------------------------------------------- with the real Simulation

let Simulation = null;
try {
  ({ Simulation } = await import('../js/sim.js'));
} catch {
  Simulation = null;
}

test('integration: V37E63E from P00 in the real Simulation; V16N68 MONDO jobs reach the Executive', { skip: !Simulation && 'sim.js does not import yet' }, () => {
  const sim = new Simulation({ software: 'Luminary099', vehicle: 'static', startGET: '102:00:00', initialProgram: 0 });
  const agc = sim.agc;
  agc.keys('V35E', { gapMs: 200 });
  sim.step(1);
  assert.equal(agc.dsky.lampTest, true);
  sim.step(5.5);
  assert.equal(agc.dsky.lampTest, false);
  agc.keys('V16N36E', { gapMs: 200 });
  sim.step(4);
  assert.equal(agc.dsky.verb, '16');
  assert.equal(agc.dsky.noun, '36');
  assert.equal(agc.pinball.state.monitor?.noun, 36);
  agc.keys('V37E63E', { gapMs: 200 });
  sim.step(3);
  assert.equal(agc.mode, 63);
  assert.equal(agc.dsky.prog, '63');
  assert.equal(agc.pinball.state.monitor, null, 'V37 (GOPROG2/STARTSB2) killed the monitor');
});
