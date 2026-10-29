// formatRegister(): PINBALL's register formats (js/agc/display-format.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRegister, formatHms, octal5, toWord, twoDigits, parseEntry, FORMATS, isFormat, BLANK_REGISTER,
} from '../js/agc/display-format.js';

const reg = (sign, digits) => ({ sign, digits });

test('every contract format code exists', () => {
  for (const f of ['XXXXX', 'XXX.XX', 'XXXX.X', 'X.XXXX', '.XXXXX', 'XXbXX', 'XXXXX OCT', 'BLANK']) {
    assert.ok(isFormat(f), f);
    assert.ok(FORMATS[f], f);
  }
  assert.throws(() => formatRegister(1, 'NOPE'), /Unknown DSKY register format/);
});

test('decimal: sign, leading zeros, implied decimal point', () => {
  assert.deepEqual(formatRegister(5559.7, 'XXXX.X'), reg('+', '55597'));
  assert.deepEqual(formatRegister(-2.2, 'XXXX.X'), reg('-', '00022'));
  assert.deepEqual(formatRegister(49971, 'XXXXX'), reg('+', '49971'));
  assert.deepEqual(formatRegister(-2884, 'XXXXX'), reg('-', '02884'));
  assert.deepEqual(formatRegister(12.345, 'XX.XXX'), reg('+', '12345'));
  assert.deepEqual(formatRegister(1.2345, 'X.XXXX'), reg('+', '12345'));
  assert.deepEqual(formatRegister(0.5, '.XXXXX'), reg('+', '50000'));
  assert.deepEqual(formatRegister(359.99, 'XXX.XX'), reg('+', '35999'));
});

test('decimal: +0 shows "+", negative zero and small negatives show "-" (DSPSIGN)', () => {
  assert.deepEqual(formatRegister(0, 'XXXXX'), reg('+', '00000'));
  assert.deepEqual(formatRegister(-0, 'XXXXX'), reg('-', '00000'));
  assert.deepEqual(formatRegister(-0.04, 'XXXX.X'), reg('-', '00000'));
  assert.deepEqual(formatRegister(-0, 'XXbXX'), reg('-', '00 00'));
});

test('decimal: rounds half up on the magnitude (DSPRND)', () => {
  assert.deepEqual(formatRegister(1234.55, 'XXXX.X'), reg('+', '12346'));
  assert.deepEqual(formatRegister(-1234.55, 'XXXX.X'), reg('-', '12346'));
  assert.deepEqual(formatRegister(1234.549, 'XXXX.X'), reg('+', '12345'));
  assert.deepEqual(formatRegister(2.5, 'XXXXX'), reg('+', '00003'));
  assert.deepEqual(formatRegister(-2.5, 'XXXXX'), reg('-', '00003'));
  assert.deepEqual(formatRegister(2.675, 'XXX.XX'), reg('+', '00268'));
});

test('decimal: saturates at 99999 (DPOSMAX)', () => {
  assert.deepEqual(formatRegister(99999, 'XXXXX'), reg('+', '99999'));
  assert.deepEqual(formatRegister(99999.6, 'XXXXX'), reg('+', '99999'));
  assert.deepEqual(formatRegister(123456, 'XXXXX'), reg('+', '99999'));
  assert.deepEqual(formatRegister(-1e9, 'XXXX.X'), reg('-', '99999'));
});

test('null, undefined and NaN give a blank register; BLANK always does', () => {
  for (const v of [null, undefined, NaN, Infinity]) assert.deepEqual(formatRegister(v, 'XXXXX'), BLANK_REGISTER);
  assert.deepEqual(formatRegister(42, 'BLANK'), BLANK_REGISTER);
  assert.deepEqual(formatRegister(null, '+XXbYY'), BLANK_REGISTER);
});

test('minutes/seconds XXbXX: blank D3, rounds by 0.5 s, limit 59B59 (M/SOUT)', () => {
  assert.deepEqual(formatRegister(-35, 'XXbXX'), reg('-', '00 35'));
  assert.deepEqual(formatRegister(-400, 'XXbXX'), reg('-', '06 40'));
  assert.deepEqual(formatRegister(125.4, 'XXbXX'), reg('+', '02 05'));
  assert.deepEqual(formatRegister(125.5, 'XXbXX'), reg('+', '02 06'));
  assert.deepEqual(formatRegister(59 * 60 + 58.4, 'XXbXX'), reg('+', '59 58'));
  assert.deepEqual(formatRegister(59 * 60 + 58.5, 'XXbXX'), reg('+', '59 59'));
  assert.deepEqual(formatRegister(10000, 'XXbXX'), reg('+', '59 59'));
  assert.deepEqual(formatRegister(-10000, 'XXbXX'), reg('-', '59 59'));
});

test('hours/minutes/seconds: three registers, seconds truncated to centiseconds (HMSOUT)', () => {
  const t = 102 * 3600 + 34 * 60 + 54.329;
  assert.deepEqual(formatHms(t), [reg('+', '00102'), reg('+', '00034'), reg('+', '05432')]);
  assert.deepEqual(formatRegister(-90.5, 'HMS.S'), reg('-', '03050'));
  assert.deepEqual(formatRegister(-90.5, 'HMS.M'), reg('-', '00001'));
  assert.deepEqual(formatRegister(0, 'HMS.H'), reg('+', '00000'));
});

test('octal: 5 digits of the 15-bit word, no sign; ones-complement negatives', () => {
  assert.deepEqual(formatRegister(0o1202, 'XXXXX OCT'), reg(' ', '01202'));
  assert.deepEqual(formatRegister(0o41202, 'XXXXX OCT'), reg(' ', '41202'));
  assert.deepEqual(formatRegister(0, 'OCT'), reg(' ', '00000'));
  assert.equal(toWord(-1), 0o77776);
  assert.equal(toWord(-0), 0o77777);
  assert.equal(octal5(0o500), '00500');
});

test('two integers +XXbYY (N64 R1), LR position +0000X, CDU degrees', () => {
  assert.deepEqual(formatRegister([42, 7], '+XXbYY'), reg('+', '42 07'));
  assert.deepEqual(formatRegister({ first: 0, second: 99 }, '+XXbYY'), reg('+', '00 99'));
  assert.deepEqual(formatRegister([150, -3], '+XXbYY'), reg('+', '99 00'));
  assert.deepEqual(formatRegister(2, '+0000X'), reg('+', '00002'));
  assert.deepEqual(formatRegister(-10, 'XXX.XX CDU'), reg('+', '35000'));
  assert.deepEqual(formatRegister(370.25, 'XXX.XX CDU'), reg('+', '01025'));
  assert.deepEqual(formatRegister(359.999, 'XXX.XX CDU'), reg('+', '00000'));
});

test('two-digit VERB/NOUN/PROG fields', () => {
  assert.equal(twoDigits(6), '06');
  assert.equal(twoDigits(63), '63');
  assert.equal(twoDigits(null), '  ');
});

test('parseEntry: decimal with sign, octal without, limits', () => {
  assert.deepEqual(parseEntry({ sign: '+', digits: '00102' }, 'HMS.H'), { ok: true, value: 102 });
  assert.deepEqual(parseEntry({ sign: '+', digits: '05432' }, 'HMS.S'), { ok: true, value: 54.32 });
  assert.equal(parseEntry({ sign: '+', digits: '00060' }, 'HMS.M').ok, false);
  assert.deepEqual(parseEntry({ sign: '-', digits: '12345' }, 'XXXX.X'), { ok: true, value: -1234.5 });
  assert.deepEqual(parseEntry({ sign: null, digits: '17' }, 'XXXXX OCT'), { ok: true, value: 15, octal: true });
  assert.equal(parseEntry({ sign: '+', digits: '00001' }, 'XXXXX OCT').ok, false);
  assert.equal(parseEntry({ sign: '+', digits: '00001' }, 'XXbXX').ok, false);
  assert.equal(parseEntry({ sign: '+', digits: '36000' }, 'XXX.XX CDU').ok, false);
});
