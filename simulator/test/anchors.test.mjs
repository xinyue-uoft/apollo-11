// Source anchors and the source manifest.
//
// - Every file in js/data/anchors/ (whoever owns it) exports ANCHORS whose
//   entries point at real lines: the file exists, 1 <= start <= end <= line
//   count, `label` (when given) begins line `start` in the AGC label column,
//   and there is a title.
// - Ids are unique across files and index.js merges every file.
// - Every anchor id referenced anywhere in simulator/js/**/*.js (`anchor:
//   '...'`, `anchors: [...]`, `getAnchor('...')`, `static anchor = '...'`)
//   and every `anchor`/`anchors` value exported by the computer model, data
//   and scenario modules exists.
// - js/data/source-manifest.js matches what tools/gen-manifest.mjs generates.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildManifest, renderManifest, countLines, OUTPUT } from '../tools/gen-manifest.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SIM = join(ROOT, 'simulator');
const ANCHOR_DIR = join(SIM, 'js/data/anchors');
const rel = (p) => relative(ROOT, p).split(sep).join('/');

// ---------- load every anchor file on its own ----------

const anchorFiles = readdirSync(ANCHOR_DIR)
  .filter((n) => n.endsWith('.js') && n !== 'index.js')
  .sort();

const loaded = [];
for (const name of anchorFiles) {
  const owner = name.replace(/\.js$/, '');
  try {
    const mod = await import(pathToFileURL(join(ANCHOR_DIR, name)).href);
    loaded.push({ owner, name, anchors: mod.ANCHORS, error: null });
  } catch (error) {
    loaded.push({ owner, name, anchors: null, error });
  }
}

// All ids from the individual files (so the reference checks still run when
// index.js itself cannot be imported).
const known = new Map();
for (const { owner, anchors } of loaded) {
  if (anchors && typeof anchors === 'object') {
    for (const [id, a] of Object.entries(anchors)) if (!known.has(id)) known.set(id, { owner, anchor: a });
  }
}

const lineCache = new Map();
function linesOf(file) {
  if (!lineCache.has(file)) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    const lines = text.split('\n');
    if (text.endsWith('\n')) lines.pop();
    lineCache.set(file, { lines, count: countLines(text) });
  }
  return lineCache.get(file);
}

function checkAnchor(id, a) {
  const problems = [];
  if (!a || typeof a !== 'object') return ['is not an object'];
  if (!/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_*+-]+)+$/.test(id)) problems.push('id should look like "prefix.name"');
  if (typeof a.title !== 'string' || !a.title.trim()) problems.push('missing title');
  if (typeof a.file !== 'string' || !a.file) return [...problems, 'missing file'];
  if (a.file.startsWith('/') || a.file.split('/').includes('..')) return [...problems, `file "${a.file}" must be repo-relative`];
  const abs = join(ROOT, a.file);
  if (!existsSync(abs) || !statSync(abs).isFile()) return [...problems, `file "${a.file}" does not exist`];
  const { lines, count } = linesOf(a.file);
  if (!Number.isInteger(a.start) || !Number.isInteger(a.end)) {
    return [...problems, `start/end must be integers (got ${a.start}, ${a.end})`];
  }
  if (!(a.start >= 1 && a.start <= a.end && a.end <= count)) {
    problems.push(`range ${a.start}-${a.end} outside 1..${count} (or start > end)`);
  }
  if (a.label !== undefined && a.label !== null) {
    const line = lines[a.start - 1] ?? '';
    const ok = typeof a.label === 'string' && a.label.length > 0 && line.startsWith(a.label)
      && (line.length === a.label.length || /\s/.test(line[a.label.length]));
    if (!ok) problems.push(`label "${a.label}" does not begin line ${a.start}: ${JSON.stringify(line.slice(0, 60))}`);
  }
  return problems;
}

// ---------- anchor files ----------

test('every anchor file exports an ANCHORS object', () => {
  assert.ok(anchorFiles.includes('core.js'), 'core.js exists');
  const bad = loaded
    .filter((f) => f.error || !f.anchors || typeof f.anchors !== 'object' || Array.isArray(f.anchors))
    .map((f) => `anchors/${f.name}: ${f.error ? f.error.message : 'no ANCHORS object export'}`);
  assert.deepEqual(bad, []);
});

test('anchor ids are unique across all anchor files', () => {
  const seen = new Map();
  const dups = [];
  for (const { name, anchors } of loaded) {
    for (const id of Object.keys(anchors || {})) {
      if (seen.has(id)) dups.push(`"${id}" in anchors/${seen.get(id)} and anchors/${name}`);
      else seen.set(id, name);
    }
  }
  assert.deepEqual(dups, []);
});

test('every anchor points at real lines of a real file', () => {
  const problems = [];
  let n = 0;
  for (const { name, anchors } of loaded) {
    for (const [id, a] of Object.entries(anchors || {})) {
      n += 1;
      for (const p of checkAnchor(id, a)) problems.push(`anchors/${name} ${id}: ${p}`);
    }
  }
  assert.ok(n > 0, 'some anchors are defined');
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});

test('core anchors use the src. prefix and are well formed', () => {
  const core = loaded.find((f) => f.owner === 'core');
  assert.ok(core?.anchors, 'core.js loads');
  for (const [id, a] of Object.entries(core.anchors)) {
    assert.match(id, /^src\./, id);
    assert.deepEqual(checkAnchor(id, a), [], id);
  }
});

// ---------- index.js ----------

test('index.js merges every anchor file; getAnchor / listAnchors', async () => {
  const index = await import('../js/data/anchors/index.js');
  const owners = Object.keys(index.ANCHOR_SOURCES).sort();
  assert.deepEqual(owners, loaded.map((f) => f.owner).sort(), 'every file in anchors/ is merged by index.js');
  const total = loaded.reduce((s, f) => s + Object.keys(f.anchors || {}).length, 0);
  assert.equal(Object.keys(index.ANCHORS).length, total);

  const list = index.listAnchors();
  assert.equal(list.length, total);
  const ids = list.map((a) => a.id);
  assert.deepEqual(ids, [...ids].sort(), 'listAnchors() is sorted by id');

  const some = list[0];
  assert.equal(index.getAnchor(some.id), some);
  assert.equal(index.getAnchor(some.id).file, known.get(some.id).anchor.file);
  assert.equal(index.getAnchor('no.such.anchor'), null);
  assert.equal(index.getAnchor(undefined), null);
  assert.equal(index.getAnchor('toString'), null);
  assert.ok(Object.isFrozen(index.ANCHORS));

  assert.throws(
    () => index.mergeAnchors({ a: { 'x.y': { file: 'f', start: 1, end: 1, title: 't' } }, b: { 'x.y': { file: 'g', start: 1, end: 1, title: 't' } } }),
    /Duplicate source anchor id "x\.y".*anchors\/a\.js.*anchors\/b\.js/,
  );
});

// ---------- references ----------

// Remove comments from JS source, keeping strings, template literals and
// regex literals intact (regex literals are recognised by the usual "what
// came before the slash" heuristic).
function stripComments(src) {
  let out = '';
  let i = 0;
  let prev = '';   // last significant character outside comments/strings
  const regexOk = () => !prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /\b(return|typeof|case|in|of|delete|void|throw|new)$/.test(out.trimEnd());
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');   // keep line numbers
      i = stop;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (c !== '`' && src[j] === '\n') break;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      prev = c;
      continue;
    }
    if (c === '/' && regexOk()) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') j += 2;
        else if (src[j] === '[') { inClass = true; j++; } else if (src[j] === ']') { inClass = false; j++; } else if (src[j] === '/' && !inClass) break;
        else j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      prev = '/';
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

const STRING_RE = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$]*)`/g;
const lit = (m) => m[1] ?? m[2] ?? m[3];

function scanReferences(code) {
  const refs = [];   // [{ id, index }]
  const single = /\b(?:anchor|primaryAnchor)\s*[:=]\s*('([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$]*)`)/g;
  for (const m of code.matchAll(single)) refs.push({ id: m[2] ?? m[3] ?? m[4], index: m.index });
  const call = /\bgetAnchor\(\s*('([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$]*)`)\s*\)/g;
  for (const m of code.matchAll(call)) refs.push({ id: m[2] ?? m[3] ?? m[4], index: m.index });
  const multi = /\banchors\s*[:=]\s*\[([^\]]*)\]/g;
  for (const m of code.matchAll(multi)) {
    for (const s of m[1].matchAll(STRING_RE)) refs.push({ id: lit(s), index: m.index + m[0].indexOf(s[0]) });
  }
  return refs;
}

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('stripComments / scanReferences (self-test)', () => {
  const src = [
    "const a = { anchor: 'exec.novac' }; // anchor: 'not.this'",
    '/* anchors: [\'nor.this\'] */',
    "const re = /['\"]/g; const b = { anchors: ['p63.entry', \"burn.tables\"] };",
    'static anchor = `p64.entry`;',
    "getAnchor('noun.63'); const t = { anchor: `noun.${n}` };",
  ].join('\n');
  const ids = scanReferences(stripComments(src)).map((r) => r.id);
  assert.deepEqual(ids.sort(), ['burn.tables', 'exec.novac', 'noun.63', 'p63.entry', 'p64.entry']);
});

test('every anchor id referenced in simulator/js resolves', () => {
  const problems = [];
  const odd = [];
  let count = 0;
  for (const file of jsFiles(join(SIM, 'js'))) {
    if (file.startsWith(ANCHOR_DIR + sep)) continue;   // definitions, not references
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const { id, index } of scanReferences(code)) {
      if (!id) continue;
      const line = code.slice(0, index).split('\n').length;
      if (!id.includes('.')) {
        odd.push(`${rel(file)}:${line} '${id}'`);
        continue;
      }
      count += 1;
      if (!known.has(id)) problems.push(`${rel(file)}:${line} references unknown anchor '${id}'`);
    }
  }
  if (odd.length) console.log(`[anchors] ignored non-anchor-looking strings: ${odd.join(', ')}`);
  console.log(`[anchors] ${count} literal anchor references checked`);
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});

// Walk the exports of the pure-logic modules (computer model, data,
// scenarios) and collect `anchor` / `anchors` values, including class
// statics such as P63.anchor. Modules that fail to import are reported, not
// failed: their own suites cover that.
function collect(value, path, out, seen, depth = 0) {
  if (value === null || depth > 7) return;
  const t = typeof value;
  if (t !== 'object' && t !== 'function') return;
  if (seen.has(value)) return;
  seen.add(value);
  let keys;
  try {
    keys = t === 'function' ? Object.getOwnPropertyNames(value).filter((k) => !['length', 'name', 'prototype', 'caller', 'arguments'].includes(k)) : Object.keys(value);
  } catch {
    return;
  }
  for (const k of keys) {
    let v;
    try {
      v = value[k];
    } catch {
      continue;
    }
    if (k === 'anchor' && typeof v === 'string') out.push({ id: v, path: `${path}.${k}` });
    else if (k === 'anchors' && Array.isArray(v)) v.forEach((id, i) => typeof id === 'string' && out.push({ id, path: `${path}.${k}[${i}]` }));
    else collect(v, `${path}.${k}`, out, seen, depth + 1);
  }
}

test('anchors exported by the model, data and scenario modules resolve', async (t) => {
  const dirs = ['js/agc', 'js/data', 'js/demo', 'js/vehicle'].map((d) => join(SIM, d)).filter(existsSync);
  const files = dirs.flatMap(jsFiles).filter((f) => !f.startsWith(ANCHOR_DIR + sep));
  const problems = [];
  const failed = [];
  let count = 0;
  for (const file of files) {
    let mod;
    try {
      mod = await import(pathToFileURL(file).href);
    } catch (err) {
      failed.push(`${rel(file)}: ${err.message.split('\n')[0]}`);
      continue;
    }
    const found = [];
    collect(mod, rel(file), found, new Set());
    for (const { id, path } of found) {
      count += 1;
      if (!known.has(id)) problems.push(`${path} → unknown anchor '${id}'`);
    }
  }
  if (failed.length) t.diagnostic(`modules that could not be imported (not checked): ${failed.join('; ')}`);
  t.diagnostic(`${count} exported anchor references checked in ${files.length - failed.length} modules`);
  assert.deepEqual([...new Set(problems)], [], `\n${[...new Set(problems)].join('\n')}`);
});

// ---------- manifest ----------

test('source manifest is up to date with Luminary099/ and Comanche055/', async () => {
  const expected = renderManifest(buildManifest(ROOT));
  const actual = readFileSync(join(ROOT, OUTPUT), 'utf8');
  assert.ok(actual === expected, `${OUTPUT} is out of date — run: node simulator/tools/gen-manifest.mjs`);

  const { MANIFEST, getManifestEntry } = await import('../js/data/source-manifest.js');
  const onDisk = [];
  for (const dir of ['Luminary099', 'Comanche055']) {
    for (const n of readdirSync(join(ROOT, dir))) if (n.endsWith('.agc') || n === 'README.md') onDisk.push(`${dir}/${n}`);
  }
  assert.deepEqual(MANIFEST.map((e) => e.file).sort(), onDisk.sort());
  const exec = getManifestEntry('Luminary099/EXECUTIVE.agc');
  assert.equal(exec.lines, linesOf('Luminary099/EXECUTIVE.agc').count);
  assert.equal(exec.section, 'SKIPPER');
  assert.equal(exec.pages, '1103-1116');
  assert.equal(getManifestEntry('Comanche055/EXECUTIVE.agc').section, 'CHIEFTAN');
  assert.equal(getManifestEntry('nope.agc'), null);
  for (const e of MANIFEST) assert.ok(e.description, `${e.file} has a description`);
});
