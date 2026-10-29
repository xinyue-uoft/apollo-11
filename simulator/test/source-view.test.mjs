// The source panel's pure parts: the AGC listing tokenizer that drives the
// syntax highlighting, the GitHub link format and the featured anchors.
// (The DOM part, mountSource, is exercised in the browser.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenizeAgcLine, githubUrl, countLines, REPO_URL, FEATURED_ANCHORS } from '../js/ui/source-view.js';
import { getAnchor } from '../js/data/anchors/index.js';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// "type:text" for every non-whitespace token.
const kinds = (line) => tokenizeAgcLine(line).filter((t) => t.type !== 'ws').map((t) => `${t.type}:${t.text}`);

test('labels, machine opcodes, operands and comments', () => {
  // Luminary099/EXECUTIVE.agc:36-38
  assert.deepEqual(kinds('NOVAC\t\tINHINT'), ['label:NOVAC', 'op:INHINT']);
  assert.deepEqual(kinds('\t\tAD\tFAKEPRET\t# LOC(MPAC +6) - LOC(QPRET)'),
    ['op:AD', 'sym:FAKEPRET', 'comment:# LOC(MPAC +6) - LOC(QPRET)']);
  assert.deepEqual(kinds('\t\tTC\tINTPRET +3'), ['op:TC', 'sym:INTPRET', 'num:+3']);
  assert.deepEqual(kinds('\t\tTCF\t-5'), ['op:TCF', 'num:-5']);
  // Pseudo-label in the opcode column (Luminary099/INTERPRETER.agc:47).
  assert.deepEqual(kinds(' +2\t\tCA\tBBANK\t\t\t# INTERPRETIVE BRANCHES FINISH HERE.'),
    ['label:+2', 'op:CA', 'sym:BBANK', 'comment:# INTERPRETIVE BRANCHES FINISH HERE.']);
  // A label made of punctuation (BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc:954).
  assert.deepEqual(kinds('?\t\t=\tGOTOPOOH'), ['label:?', 'pseudo:=', 'sym:GOTOPOOH']);
});

test('interpretive opcodes, including two per line and operand-only lines', () => {
  assert.deepEqual(kinds('FLAGORGY\tTC\tINTPRET\t\t# DIONYSIAN FLAG WAVING'),
    ['label:FLAGORGY', 'op:TC', 'sym:INTPRET', 'comment:# DIONYSIAN FLAG WAVING']);
  assert.deepEqual(kinds('\t\tDLOAD\tDSU'), ['iop:DLOAD', 'iop:DSU']);
  assert.deepEqual(kinds('\t\tCLEAR\tCLEAR'), ['iop:CLEAR', 'iop:CLEAR']);
  assert.deepEqual(kinds('\t\tAXT,1\tSSP'), ['iop:AXT,1', 'iop:SSP']);
  assert.deepEqual(kinds('\t\tSTODL\tTTF/8'), ['iop:STODL', 'sym:TTF/8']);
  assert.deepEqual(kinds('\t\t\tTIG'), ['sym:TIG']);
});

test('pseudo-ops and octal / decimal constants', () => {
  assert.deepEqual(kinds('\t\tOCT\t01202'), ['pseudo:OCT', 'oct:01202']);
  assert.deepEqual(kinds('NO.CORES\tDEC\t7'), ['label:NO.CORES', 'pseudo:DEC', 'dec:7']);
  assert.deepEqual(kinds('\t\tERASE\t+83D'), ['pseudo:ERASE', 'dec:+83D']);
  assert.deepEqual(kinds('\t\t2DEC\t+.8342971408 B-1\t# STAR 37\tX'),
    ['pseudo:2DEC', 'dec:+.8342971408', 'num:B-1', 'comment:# STAR 37\tX']);
  assert.deepEqual(kinds('\t\tEBANK=\tWHICH'), ['pseudo:EBANK=', 'sym:WHICH']);
  assert.deepEqual(kinds('P12TABLE\tVN\t0674\t\t# (0)'), ['label:P12TABLE', 'pseudo:VN', 'num:0674', 'comment:# (0)']);
  assert.deepEqual(kinds('100MRUPT\t=\tOCT37766\t\t# (DEC 16374)'),
    ['label:100MRUPT', 'pseudo:=', 'sym:OCT37766', 'comment:# (DEC 16374)']);
  assert.deepEqual(kinds('\t\t7\tINDJUMP -1'), ['num:7', 'sym:INDJUMP', 'num:-1']);
});

test('page markers, transcriber annotations and includes', () => {
  assert.deepEqual(kinds('# Page 1103'), ['page:# Page 1103']);
  assert.deepEqual(kinds('## At the get-together of the AGC developers'), ['annot:## At the get-together of the AGC developers']);
  assert.deepEqual(kinds('#\tAssemble revision 001 of AGC program LMY99'), ['comment:#\tAssemble revision 001 of AGC program LMY99']);
  assert.deepEqual(kinds('\t\t\t\t# Page 393'), ['comment:# Page 393']);   // only a column-1 marker is a page marker
  assert.deepEqual(kinds('$EXECUTIVE.agc\t\t\t\t\t# pp. 1103-1116'), ['include:$EXECUTIVE.agc', 'comment:# pp. 1103-1116']);
  assert.deepEqual(tokenizeAgcLine(''), []);
  assert.deepEqual(tokenizeAgcLine(null), []);
});

test('tokens reproduce every line of every listing exactly', () => {
  let lines = 0;
  const bad = [];
  const seen = new Set();
  for (const dir of ['Luminary099', 'Comanche055']) {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (!name.endsWith('.agc')) continue;
      const text = readFileSync(join(ROOT, dir, name), 'utf8');
      text.split('\n').forEach((line, i) => {
        lines += 1;
        const toks = tokenizeAgcLine(line);
        for (const t of toks) seen.add(t.type);
        if (toks.map((t) => t.text).join('') !== line || toks.some((t) => !t.text)) bad.push(`${dir}/${name}:${i + 1}`);
      });
    }
  }
  assert.ok(lines > 100000);
  assert.deepEqual(bad.slice(0, 10), []);
  for (const type of ['label', 'op', 'iop', 'pseudo', 'sym', 'oct', 'dec', 'num', 'comment', 'annot', 'page', 'include', 'ws']) {
    assert.ok(seen.has(type), `token type ${type} occurs`);
  }
});

test('GitHub links and line counting', () => {
  assert.equal(REPO_URL, 'https://github.com/xinyue-uoft/apollo-11');
  assert.equal(githubUrl('Luminary099/EXECUTIVE.agc', 155, 208),
    'https://github.com/xinyue-uoft/apollo-11/blob/master/Luminary099/EXECUTIVE.agc#L155-L208');
  assert.equal(githubUrl('Luminary099/EXECUTIVE.agc', 43, 43),
    'https://github.com/xinyue-uoft/apollo-11/blob/master/Luminary099/EXECUTIVE.agc#L43');
  assert.equal(githubUrl('Comanche055/MAIN.agc'), 'https://github.com/xinyue-uoft/apollo-11/blob/master/Comanche055/MAIN.agc');
  assert.equal(countLines('a\nb\n'), 2);
  assert.equal(countLines('a\nb'), 2);
  assert.equal(countLines(''), 0);
});

test('featured anchors exist', () => {
  assert.ok(FEATURED_ANCHORS.length >= 4);
  for (const [id, text] of FEATURED_ANCHORS) {
    assert.ok(getAnchor(id), id);
    assert.ok(text);
  }
});
