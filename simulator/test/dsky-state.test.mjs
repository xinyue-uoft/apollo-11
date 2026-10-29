import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DskyState, LIGHT_NAMES, LIGHT_LEGENDS, DSKY_LAMP_LAYOUT, RELAY_CODES, RELAY_SEGMENTS,
  segmentsFor, lampsOn, dskySummary, FLASH_PERIOD_S, FLASH_DUTY,
} from '../js/agc/dsky-state.js';

const CONTRACT_LIGHTS = [
  'uplinkActy', 'noAtt', 'stby', 'keyRel', 'oprErr', 'prioDisp', 'noDap',
  'temp', 'gimbalLock', 'prog', 'restart', 'tracker', 'alt', 'vel', 'compActy',
];

test('blank defaults', () => {
  const d = new DskyState();
  assert.equal(d.prog, '  ');
  assert.equal(d.verb, '  ');
  assert.equal(d.noun, '  ');
  assert.equal(d.r.length, 3);
  for (const reg of d.r) assert.deepEqual({ ...reg }, { sign: ' ', digits: '     ' });
  assert.equal(d.flashVerbNoun, false);
  assert.equal(d.blanked, false);
  assert.equal(d.lampTest, false);
  assert.equal(d.version, 0);
  assert.deepEqual(Object.keys(d.lights).sort(), [...CONTRACT_LIGHTS].sort());
  for (const n of CONTRACT_LIGHTS) assert.equal(d.lights[n], false);
  assert.deepEqual([...LIGHT_NAMES].sort(), [...CONTRACT_LIGHTS].sort());
  for (const n of LIGHT_NAMES) assert.ok(LIGHT_LEGENDS[n], `legend for ${n}`);
});

test('PROG/VERB/NOUN setters accept 2-char strings, integers and blanks', () => {
  const d = new DskyState();
  d.setProg('63');
  d.setVerb(6);
  d.setNoun('63');
  assert.equal(d.prog, '63');
  assert.equal(d.verb, '06');
  assert.equal(d.noun, '63');
  d.setVerb('1 ');           // first digit keyed, second still blank
  assert.equal(d.verb, '1 ');
  d.setNoun(null);
  assert.equal(d.noun, '  ');
  d.setNoun('');
  assert.equal(d.noun, '  ');
  d.setProg(0);
  assert.equal(d.prog, '00');
  assert.throws(() => d.setProg('6'), TypeError);
  assert.throws(() => d.setProg('063'), TypeError);
  assert.throws(() => d.setVerb('A1'), TypeError);
  assert.throws(() => d.setNoun(100), RangeError);
  assert.throws(() => d.setNoun(-1), RangeError);
  assert.throws(() => d.setNoun(6.5), RangeError);
  assert.equal(d.prog, '00', 'failed writes leave the state alone');
});

test('register setter validates 5 characters and the sign set', () => {
  const d = new DskyState();
  d.setRegister(0, '-', '02900');
  d.setRegister(1, { sign: '+', digits: '00160' }); // formatRegister() result form
  d.setRegister(2, ' ', '01202');                   // octal: no sign
  assert.deepEqual(d.snapshot().r, [
    { sign: '-', digits: '02900' },
    { sign: '+', digits: '00160' },
    { sign: ' ', digits: '01202' },
  ]);
  d.setRegister(0, '+', '12   ');                   // partial data entry
  assert.equal(d.r[0].digits, '12   ');
  d.setRegister(1, '', '');                         // '' → blank
  assert.deepEqual({ ...d.r[1] }, { sign: ' ', digits: '     ' });

  assert.throws(() => d.setRegister(0, '+', '1234'), TypeError);
  assert.throws(() => d.setRegister(0, '+', '123456'), TypeError);
  assert.throws(() => d.setRegister(0, '+', '12a45'), TypeError);
  assert.throws(() => d.setRegister(0, '+', 12345), TypeError);
  assert.throws(() => d.setRegister(0, '*', '12345'), TypeError);
  assert.throws(() => d.setRegister(0, '−', '12345'), TypeError);
  assert.throws(() => d.setRegister(3, '+', '12345'), RangeError);
  assert.throws(() => d.setRegister(-1, '+', '12345'), RangeError);
  assert.equal(d.r[0].digits, '12   ', 'failed writes leave the state alone');

  d.setRegister(2, '-', '77777');
  d.setRegisterBlank(2);
  assert.deepEqual({ ...d.r[2] }, { sign: ' ', digits: '     ' });
});

test('every change bumps version exactly once; no-op writes do not', () => {
  const d = new DskyState();
  let v = d.version;
  const bumps = (fn, expected = 1) => {
    fn();
    assert.equal(d.version, v + expected);
    v = d.version;
  };
  bumps(() => d.setProg('63'));
  bumps(() => d.setProg('63'), 0);
  bumps(() => d.setVerb('06'));
  bumps(() => d.setNoun('63'));
  bumps(() => d.setRegister(0, '-', '02900'));
  bumps(() => d.setRegister(0, { sign: '-', digits: '02900' }), 0);
  bumps(() => d.setRegister(0, '+', '02900'));
  bumps(() => d.setRegisterBlank(1), 0);
  bumps(() => d.setLight('prog', true));
  bumps(() => d.setLight('prog', 1), 0);
  bumps(() => d.setLight('prog', false));
  bumps(() => d.setLights({ prog: true, oprErr: true }));
  bumps(() => d.setLights({ prog: true, oprErr: true }), 0);
  bumps(() => d.setFlash(true));
  bumps(() => d.setFlash(true), 0);
  bumps(() => d.setBlanked(true));
  bumps(() => d.setBlanked(false));
  bumps(() => d.setLampTest(true));
  bumps(() => d.setLampTest(false));
  bumps(() => d.setAll8s());
  bumps(() => d.setAll8s(), 0);
  bumps(() => d.blankDigits({ keepProg: true }));
  assert.equal(d.prog, '88');
  bumps(() => d.blankDigits());
  bumps(() => d.blankDigits(), 0);
  bumps(() => d.clearAll());
  bumps(() => d.clearAll(), 0);
  assert.equal(d.setLight('alt', true), true, 'setters report whether they changed something');
  assert.equal(d.setLight('alt', true), false);
});

test('plain assignment goes through the validating setters', () => {
  const d = new DskyState();
  let v = d.version;
  d.prog = '63';
  d.lights.prog = true;
  d.r[0] = { sign: '-', digits: '00100' };
  d.r[1].digits = '00200';
  d.r[1].sign = '+';
  d.flashVerbNoun = true;
  d.lampTest = true;
  d.blanked = true;
  assert.equal(d.version, v + 8);
  v = d.version;
  d.lights.prog = true;         // unchanged
  assert.equal(d.version, v);
  assert.equal(d.prog, '63');
  assert.equal(d.lights.prog, true);
  assert.deepEqual(d.snapshot().r.slice(0, 2), [
    { sign: '-', digits: '00100' },
    { sign: '+', digits: '00200' },
  ]);
  assert.throws(() => { d.lights.progg = true; }, TypeError);
  assert.throws(() => { d.r[0].digits = '1'; }, TypeError);
  assert.throws(() => { d.version = 0; }, TypeError);
  assert.throws(() => { d.lights = {}; }, TypeError);
});

test('unknown lamp names throw', () => {
  const d = new DskyState();
  assert.throws(() => d.setLight('progAlarm', true), /Unknown DSKY light "progAlarm"/);
  assert.throws(() => d.setLight('PROG', true), /Unknown DSKY light/);
  assert.throws(() => d.isLit('compacty'), /Unknown DSKY light/);
  assert.throws(() => d.setLights({ prog: true, keyrel: true }), /Unknown DSKY light "keyrel"/);
  assert.equal(d.lights.prog, false, 'a rejected batch changes nothing');
  assert.equal(d.version, 0);
  for (const n of CONTRACT_LIGHTS) d.setLight(n, true);
  assert.ok(CONTRACT_LIGHTS.every((n) => d.isLit(n)));
});

test('snapshot is a deep, isolated copy', () => {
  const d = new DskyState();
  d.setProg('63');
  d.setRegister(0, '-', '02900');
  d.setLight('compActy', true);
  const s1 = d.snapshot();
  assert.deepEqual(s1, {
    prog: '63', verb: '  ', noun: '  ',
    r: [
      { sign: '-', digits: '02900' },
      { sign: ' ', digits: '     ' },
      { sign: ' ', digits: '     ' },
    ],
    flashVerbNoun: false,
    lights: Object.fromEntries(LIGHT_NAMES.map((n) => [n, n === 'compActy'])),
    blanked: false,
    lampTest: false,
    version: 3,
  });
  // Mutating the snapshot does not touch the state...
  s1.r[0].digits = '99999';
  s1.lights.prog = true;
  s1.prog = '00';
  assert.equal(d.r[0].digits, '02900');
  assert.equal(d.lights.prog, false);
  assert.equal(d.prog, '63');
  // ...and later state changes do not reach an old snapshot.
  const s2 = d.snapshot();
  d.setRegister(0, '+', '11111');
  d.setLight('compActy', false);
  assert.equal(s2.r[0].digits, '02900');
  assert.equal(s2.lights.compActy, true);
  assert.notEqual(d.snapshot().r, s2.r);
  // Plain data: survives structuredClone / JSON.
  assert.deepEqual(structuredClone(s2), s2);
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d.snapshot());
});

test('V35 helpers: all 8s with plus signs; clearAll; keep lamps on request', () => {
  const d = new DskyState();
  d.setAll8s();
  const s = d.snapshot();
  assert.equal(s.prog, '88');
  assert.equal(s.verb, '88');
  assert.equal(s.noun, '88');
  for (const reg of s.r) assert.deepEqual(reg, { sign: '+', digits: '88888' });
  d.setLight('prog', true);
  d.setFlash(true);
  d.clearAll({ lights: false });
  assert.equal(d.lights.prog, true);
  assert.equal(d.flashVerbNoun, false);
  assert.equal(d.prog, '  ');
  d.clearAll();
  assert.equal(d.lights.prog, false);
});

test('relay codes and segment table match PINBALL and the schematic trace', () => {
  // Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:434-444
  assert.equal(RELAY_CODES[' '], 0b00000);
  assert.equal(RELAY_CODES['0'], 0b10101);
  assert.equal(RELAY_CODES['1'], 0b00011);
  assert.equal(RELAY_CODES['2'], 0b11001);
  assert.equal(RELAY_CODES['3'], 0b11011);
  assert.equal(RELAY_CODES['4'], 0b01111);
  assert.equal(RELAY_CODES['5'], 0b11110);
  assert.equal(RELAY_CODES['6'], 0b11100);
  assert.equal(RELAY_CODES['7'], 0b10011);
  assert.equal(RELAY_CODES['8'], 0b11101);
  assert.equal(RELAY_CODES['9'], 0b11111);
  assert.equal(RELAY_SEGMENTS.length, 32);
  const expected = {
    ' ': '', 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
    5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  };
  for (const [ch, segs] of Object.entries(expected)) assert.equal(segmentsFor(ch), segs, `digit ${ch}`);
  assert.equal(segmentsFor('x'), '');
  assert.equal(FLASH_PERIOD_S, 1.28);
  assert.equal(FLASH_DUTY, 0.75);
});

test('lamp layouts: Apollo 11 LM has blank windows in rows 6-7 left; CM has ten lamps', () => {
  const lm = DSKY_LAMP_LAYOUT.Luminary099;
  const cm = DSKY_LAMP_LAYOUT.Comanche055;
  assert.equal(lm.length, 7);
  assert.equal(cm.length, 7);
  assert.deepEqual(lm[5], [{ blank: 'prioDisp' }, 'alt']);
  assert.deepEqual(lm[6], [{ blank: 'noDap' }, 'vel']);
  assert.equal(lampsOn('Luminary099').length, 12);
  assert.ok(!lampsOn('Luminary099').includes('prioDisp'));
  assert.equal(lampsOn('Comanche055').length, 10);
  assert.ok(!lampsOn('Comanche055').includes('alt'));
  for (const name of [...lampsOn('Luminary099'), ...lampsOn('Comanche055')]) {
    assert.ok(LIGHT_NAMES.includes(name), name);
  }
});

test('dskySummary reads the display like a person would', () => {
  const d = new DskyState();
  assert.equal(dskySummary(null), 'DSKY off.');
  d.setProg('63');
  d.setVerb('06');
  d.setNoun('63');
  d.setRegister(0, '-', '02900');
  d.setRegister(1, '-', '00160');
  d.setRegister(2, '+', '42500');
  d.setLight('compActy', true);
  assert.equal(dskySummary(d.snapshot()),
    'Program 63. Verb 06 Noun 63. Register 1 minus 02900. Register 2 minus 00160. Register 3 plus 42500.');
  d.setVerb('99');
  d.setNoun('62');
  d.setFlash(true);
  d.setLight('prog', true);
  d.setLight('keyRel', true);
  d.setLight('prioDisp', true); // no lamp on the Apollo 11 LM: not reported
  d.setRegisterBlank(2);
  d.setRegister(1, ' ', '01202');
  assert.equal(dskySummary(d.snapshot()),
    'Program 63. Verb 99 Noun 62, flashing. Register 1 minus 02900. Register 2 01202. Register 3 blank.'
    + ' Lamps lit: PROG, KEY REL (flashing).');
  d.setLight('alt', true);
  assert.match(dskySummary(d.snapshot()), /PROG, KEY REL \(flashing\), ALT\.$/);
  assert.doesNotMatch(dskySummary(d.snapshot(), { software: 'Comanche055' }), /ALT/);
  d.setBlanked(true);
  assert.match(dskySummary(d.snapshot()), /^Display blanked\./);
  d.setLampTest(true);
  assert.match(dskySummary(d.snapshot()), /^Lamp test\. Display blanked\./);
});
