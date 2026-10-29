import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGET, formatGET, formatMinSec } from '../js/util/time.js';
import { createRng } from '../js/util/rng.js';
import { parseKeys } from '../js/util/keys.js';
import { createBus } from '../js/util/bus.js';

test('GET parse/format round trip', () => {
  assert.equal(parseGET('102:38:26'), 102 * 3600 + 38 * 60 + 26);
  assert.equal(formatGET(parseGET('102:45:39.9')), '102:45:39');
  assert.equal(formatGET(parseGET('102:45:39.9'), { tenths: true }), '102:45:39.9');
  assert.equal(formatGET(5), '000:00:05');
  assert.equal(formatMinSec(-35), '-00:35');
  assert.throws(() => parseGET('12:00'));
});

test('rng is deterministic and forks independently', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 10; i++) assert.equal(a.next(), b.next());
  const f1 = createRng(7).fork('lr');
  const f2 = createRng(7).fork('lr');
  assert.equal(f1.normal(), f2.normal());
});

test('keystroke scripts', () => {
  assert.deepEqual(parseKeys('V37E63E'), ['VERB', '3', '7', 'ENTR', '6', '3', 'ENTR']);
  assert.deepEqual(parseKeys('v16 n68 e'), ['VERB', '1', '6', 'NOUN', '6', '8', 'ENTR']);
  assert.deepEqual(parseKeys('PKRC+-'), ['PRO', 'KEY REL', 'RSET', 'CLR', '+', '-']);
  assert.throws(() => parseKeys('X'));
});

test('bus on/off/once/wildcard', () => {
  const bus = createBus();
  const seen = [];
  const off = bus.on('a', (p) => seen.push(['a', p]));
  bus.once('a', (p) => seen.push(['once', p]));
  bus.on('*', ({ type }) => seen.push(['*', type]));
  bus.emit('a', 1);
  off();
  bus.emit('a', 2);
  assert.deepEqual(seen, [['a', 1], ['once', 1], ['*', 'a'], ['*', 'a']]);
});
