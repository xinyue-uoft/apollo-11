// The source panel: the real Luminary 099 / Comanche 055 listings of this
// repository, fetched over HTTP, syntax-highlighted the way an AGC listing
// reads (labels, machine and interpretive opcodes, pseudo-ops, operands,
// `#` comments, `##` transcriber annotations, `# Page NNN` markers, octal
// and decimal constants), with the lines that implement what is happening
// on screen highlighted.
//
// Inputs: bus 'source:show' { anchors: [ids], primary?, file?, start?, end? }
// (the director when a narration starts, narration chips, the ignition
// view), 'narrate' events that carry `anchors`, and 'director:seeked'
// (restores the anchors of the latest narration after a seek). Requests are
// coalesced and idempotent: the same anchor list twice is a no-op.
//
// Big files (P20-P25.agc has 5182 lines) are rendered lazily in fixed-height
// chunks: only the chunks in or near the viewport are tokenised and turned
// into DOM, so showing an anchor costs a few milliseconds once the file is
// cached.
//
// `tokenizeAgcLine` is pure (no DOM) so the tests can import this module in
// Node; everything that touches the DOM lives inside `mountSource`.

import { getAnchor } from '../data/anchors/index.js';
import { MANIFEST, PROGRAMS, getManifestEntry } from '../data/source-manifest.js';

// Where "View on GitHub" points: <REPO_URL>/blob/<branch>/<file>#L<a>-L<b>.
export const REPO_URL = 'https://github.com/xinyue-uoft/apollo-11';
const REPO_BRANCH = 'master';

const CHUNK = 160;          // lines per lazily rendered chunk
const CONTEXT = 3;          // lines of context kept above a highlighted range
const MAX_MATCHES = 5000;   // find-in-file cap
const FALLBACK_LH = 19;     // px, if the CSS line height cannot be read

// ---------- the tokenizer (pure) ----------

// Block II machine instructions (incl. the extracode forms and the
// assembler's aliases such as NDX/TCR/MSK).
const MACHINE_OPS = new Set([
  'AD', 'ADS', 'AUG', 'BZF', 'BZMF', 'CA', 'CAE', 'CAF', 'CCS', 'COM', 'CS', 'DAS', 'DCA',
  'DCOM', 'DCS', 'DDOUBL', 'DIM', 'DOUBLE', 'DTCB', 'DTCF', 'DV', 'DXCH', 'EDRUPT', 'EXTEND',
  'INCR', 'INDEX', 'INHINT', 'LXCH', 'MASK', 'MP', 'MSK', 'MSU', 'NDX', 'NOOP', 'OVSK', 'QXCH',
  'RAND', 'READ', 'RELINT', 'RESUME', 'RETURN', 'ROR', 'RXOR', 'SQUARE', 'SU', 'TC', 'TCAA',
  'TCF', 'TCR', 'TS', 'WAND', 'WOR', 'WRITE', 'XCH', 'XLQ', 'XXALQ', 'ZL', 'ZQ',
]);

// Interpretive opcodes (the language entered with TC INTPRET, left with
// EXIT — Luminary099/INTERPRETER.agc). Two may share a line ("DLOAD DSU").
const INTERP_OPS = new Set([
  'ABS', 'ABVAL', 'ACOS', 'ARCCOS', 'ARCSIN', 'ASIN', 'AXC,1', 'AXC,2', 'AXT,1', 'AXT,2',
  'BDDV', 'BDDV*', 'BDSU', 'BDSU*', 'BHIZ', 'BMN', 'BOF', 'BOFCLR', 'BOFF', 'BOFINV', 'BOFSET',
  'BON', 'BONCLR', 'BONINV', 'BONSET', 'BOV', 'BOVB', 'BPL', 'BVSU', 'BVSU*', 'BZE', 'CALL',
  'CALRB', 'CCALL', 'CCALL*', 'CCLRB', 'CGOTO', 'CLEAR', 'CLR', 'CLRGO', 'COS', 'COSINE', 'DAD',
  'DAD*', 'DCOMP', 'DDV', 'DDV*', 'DLOAD', 'DLOAD*', 'DMP', 'DMP*', 'DMPR', 'DMPR*', 'DOT',
  'DOT*', 'DSQ', 'DSU', 'DSU*', 'EXIT', 'GOTO', 'INCR,1', 'INCR,2', 'INVERT', 'INVGO', 'ITA',
  'LXA,1', 'LXA,2', 'LXC,1', 'LXC,2', 'MXV', 'MXV*', 'NORM', 'PDDL', 'PDDL*', 'PDVL', 'PDVL*',
  'PUSH', 'ROUND', 'RTB', 'RVQ', 'SET', 'SETGO', 'SETPD', 'SIGN', 'SIN', 'SINE', 'SL', 'SL*',
  'SL1', 'SL1R', 'SL2', 'SL2R', 'SL3', 'SL3R', 'SL4', 'SL4R', 'SLOAD', 'SLOAD*', 'SLR', 'SLR*',
  'SQRT', 'SR', 'SR*', 'SR1', 'SR1R', 'SR2', 'SR2R', 'SR3', 'SR3R', 'SR4', 'SR4R', 'SRR',
  'SRR*', 'SSP', 'STADR', 'STCALL', 'STODL', 'STODL*', 'STORE', 'STOVL', 'STOVL*', 'STQ',
  'SXA,1', 'SXA,2', 'TAD', 'TIX,1', 'TIX,2', 'TLOAD', 'UNIT', 'V/SC', 'VAD', 'VAD*', 'VCOMP',
  'VDEF', 'VLOAD', 'VLOAD*', 'VPROJ', 'VSL', 'VSL*', 'VSL1', 'VSL2', 'VSL3', 'VSL4', 'VSL5',
  'VSL6', 'VSL7', 'VSL8', 'VSQ', 'VSR', 'VSR*', 'VSR1', 'VSR2', 'VSR3', 'VSR4', 'VSR5', 'VSR6',
  'VSR7', 'VSR8', 'VSU', 'VSU*', 'VXM', 'VXM*', 'VXSC', 'VXSC*', 'VXV', 'VXV*', 'XAD,1',
  'XAD,2', 'XCHX,1', 'XCHX,2', 'XSU,1', 'XSU,2',
]);

// Assembler directives and constant/address pseudo-ops (yaYUL).
const PSEUDO_OPS = new Set([
  '=', '=MINUS', '=ECADR', 'EQUALS', 'ERASE', 'MEMORY', 'BANK', 'BLOCK', 'SETLOC', 'LOC',
  'EBANK=', 'SBANK=', 'COUNT', 'COUNT*', 'BNKSUM', 'CHECK=', 'SUBRO', 'OCT', 'OCTAL', '2OCT',
  'DEC', 'DEC*', '2DEC', '2DEC*', 'MM', 'VN', 'NV', 'ADRES', 'REMADR', 'GENADR', '-GENADR',
  'FCADR', 'ECADR', 'CADR', '-CADR', '2CADR', '-2CADR', '2BCADR', '2FCADR', 'BBCON', 'BBCON*',
  'DNCHAN', '-DNCHAN', 'DNPTR', '-DNPTR', '1DNADR', '2DNADR', '3DNADR', '4DNADR', '5DNADR',
  '6DNADR', '-1DNADR', '-2DNADR', '-3DNADR', '-4DNADR', '-5DNADR', '-6DNADR', 'XCADR',
]);

const OCTAL_PSEUDO = new Set(['OCT', 'OCTAL', '2OCT']);
const DECIMAL_PSEUDO = new Set(['DEC', 'DEC*', '2DEC', '2DEC*', 'MM']);

// 7, -5, +66440, .5, 96.0, 83D, 0,2 (index register suffix), 1.0B18 ...
const NUM_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:D|[BE][+-]?\d+)?\*?(?:,[12])?$/;
// Scale factors written as separate words: B-12, E-3, B+14*.
const SCALE_RE = /^[BE][+-]?\d+\*?$/;
const PAGE_RE = /^#\s*Page\s+\d+/i;

function classifyOp(word) {
  if (MACHINE_OPS.has(word)) return 'op';
  if (INTERP_OPS.has(word)) return 'iop';
  if (PSEUDO_OPS.has(word)) return 'pseudo';
  return null;
}

// Split one listing line into typed tokens whose texts concatenate back to
// the line exactly. Types: label, op (machine instruction), iop
// (interpretive opcode), pseudo (assembler directive / constant pseudo-op),
// sym (operand symbol), oct, dec, num (constants), comment, annot ("##"
// transcriber annotation), page ("# Page NNN" marker), include ("$FILE.agc"
// in MAIN.agc), ws.
export function tokenizeAgcLine(line) {
  const text = line === null || line === undefined ? '' : String(line);
  const out = [];
  if (!text) return out;

  const hash = text.indexOf('#');
  const code = hash < 0 ? text : text.slice(0, hash);
  const comment = hash < 0 ? '' : text.slice(hash);

  const parts = code.match(/\s+|\S+/g) || [];
  const words = parts.filter((p) => !/^\s/.test(p));
  let w = -1;            // index into words
  let opKind = null;     // kind of the line's opcode once seen
  let opName = '';
  let iops = 0;          // interpretive opcodes seen on this line
  let pos = 0;
  for (const part of parts) {
    const at = pos;
    pos += part.length;
    if (/^\s/.test(part)) {
      out.push({ type: 'ws', text: part });
      continue;
    }
    w += 1;
    let type;
    if (at === 0) {
      // Something in column 1 is a label (or an include in MAIN.agc).
      type = part.startsWith('$') ? 'include' : 'label';
    } else if (opKind === null) {
      const kind = classifyOp(part);
      if (kind) {
        type = kind;
        opKind = kind;
        opName = part;
        if (kind === 'iop') iops = 1;
      } else if (w === 0 && /^[+-]\d+$/.test(part) && classifyOp(words[1] || '')) {
        type = 'label';  // pseudo-label such as " +2  CA BBANK" (INTERPRETER.agc:47)
      } else if (NUM_RE.test(part)) {
        type = 'num';     // raw numeric word, e.g. "7  INDJUMP -1"
        opKind = 'raw';
      } else {
        type = 'sym';     // an interpretive operand on its own line
        opKind = 'operand';
      }
    } else if (opKind === 'iop' && iops < 2 && INTERP_OPS.has(part)) {
      type = 'iop';
      iops += 1;
    } else if (OCTAL_PSEUDO.has(opName) && /^[+-]?[0-7]+$/.test(part)) {
      type = 'oct';
    } else if (NUM_RE.test(part)) {
      type = DECIMAL_PSEUDO.has(opName) || /\dD(?:,[12])?$/.test(part) ? 'dec' : 'num';
    } else if (SCALE_RE.test(part)) {
      type = 'num';
    } else {
      type = 'sym';
    }
    out.push({ type, text: part });
  }

  if (comment) {
    let type = 'comment';
    if (comment.startsWith('##')) type = 'annot';
    else if (hash === 0 && PAGE_RE.test(comment)) type = 'page';
    out.push({ type, text: comment });
  }
  return out;
}

// ---------- small pure helpers ----------

export function countLines(text) {
  if (!text) return 0;
  const n = text.split('\n').length;
  return text.endsWith('\n') ? n - 1 : n;
}

function splitLines(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Label → first line defining it (anything in column 1 that is not a
// comment or an include).
function indexLabels(lines) {
  const labels = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^([^\s#$][^\s#]*)/.exec(lines[i]);
    if (m && !labels.has(m[1])) labels.set(m[1], i + 1);
  }
  return labels;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

const fileBase = (file) => String(file).split('/').pop();

export function githubUrl(file, start, end) {
  const path = String(file).split('/').map(encodeURIComponent).join('/');
  const frag = start ? (end && end !== start ? `#L${start}-L${end}` : `#L${start}`) : '';
  return `${REPO_URL}/blob/${REPO_BRANCH}/${path}${frag}`;
}

const norm = (s) => s.toUpperCase().replace(/\.AGC$/, '').replace(/[^A-Z0-9]/g, '');

// "$LAMBERT_AIMPOINT_GUIDANCE.agc" in MAIN.agc → manifest entry (a few
// include names differ slightly from the transcribed file names).
function resolveInclude(program, name) {
  const exact = getManifestEntry(`${program}/${name}`);
  if (exact) return exact;
  const n = norm(name);
  const files = MANIFEST.filter((e) => e.program === program);
  return files.find((e) => norm(e.name) === n)
    || files.find((e) => norm(e.name).endsWith(n) || n.endsWith(norm(e.name)))
    || null;
}

function programLabel(program) {
  const p = PROGRAMS[program];
  if (!p) return program || '';
  return `${p.title} · ${program === 'Comanche055' ? 'CM' : 'LM'}`;
}

// ---------- the view ----------

// Famous lines offered before any anchor is shown (all `src.` anchors).
export const FEATURED_ANCHORS = [
  ['src.burnbaby.naming', 'BURN, BABY, BURN — how the ignition routine got its name'],
  ['src.lum.alarm-codes', 'The alarm list: 01201, 01202 …'],
  ['src.landing.crank', '“Please crank the silly thing around”'],
  ['src.guidance.hope', '“Temporary, I hope hope hope”'],
  ['src.pinball.shakespeare', 'Shakespeare in the DSKY program'],
  ['src.cmc.contract', 'Comanche 055’s approval page, signed by Margaret Hamilton'],
];

export function mountSource(root, ctx = {}) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const bus = ctx.bus;
  const offs = [];

  root.dataset.spot = 'source';
  root.classList.add('src');
  root.innerHTML = `
    <h2 class="panel-title src-titlebar">
      <span class="src-titletext">Source code</span>
      <span class="src-titlebtns">
        <button type="button" class="btn src-follow" aria-pressed="true"
          title="When on, the panel jumps to the code each demo step points at">Follow demo</button>
        <button type="button" class="btn src-browse" aria-expanded="false" aria-controls="src-browser">Files</button>
      </span>
    </h2>
    <div class="src-chips" role="group" aria-label="Code for this step" hidden></div>
    <div class="src-main">
      <header class="src-head" data-spot="source.header">
        <h3 class="src-heading"></h3>
        <p class="src-meta"></p>
        <p class="src-note" hidden></p>
      </header>
      <div class="src-tools" hidden>
        <form class="src-find" role="search">
          <label class="visually-hidden" for="src-find-q">Find in file</label>
          <input id="src-find-q" class="src-input" type="search" placeholder="Find in file (Ctrl+F)" autocomplete="off" spellcheck="false">
          <button type="button" class="btn btn-icon src-prev" aria-label="Previous match" title="Previous match (Shift+Enter)">↑</button>
          <button type="submit" class="btn btn-icon src-next" aria-label="Next match" title="Next match (Enter)">↓</button>
          <span class="src-count" aria-live="polite"></span>
        </form>
        <form class="src-goto">
          <label class="visually-hidden" for="src-goto-q">Go to label</label>
          <input id="src-goto-q" class="src-input" type="text" list="src-labels" placeholder="Go to label" autocomplete="off" spellcheck="false">
          <datalist id="src-labels"></datalist>
          <button type="submit" class="btn">Go</button>
        </form>
      </div>
      <div class="src-code" data-spot="source.code" tabindex="0" role="region" aria-label="Source listing"></div>
    </div>
    <div class="src-browser" id="src-browser" hidden>
      <div class="src-browser-bar">
        <label class="visually-hidden" for="src-files-q">Search files</label>
        <input id="src-files-q" class="src-input" type="search" placeholder="Search 175 files — name or topic" autocomplete="off" spellcheck="false">
        <div class="src-progs" role="group" aria-label="Program">
          <button type="button" class="btn" data-prog="all" aria-pressed="true">Both</button>
          <button type="button" class="btn" data-prog="Luminary099" aria-pressed="false">Luminary 099</button>
          <button type="button" class="btn" data-prog="Comanche055" aria-pressed="false">Comanche 055</button>
        </div>
        <button type="button" class="btn src-browser-close">Close</button>
      </div>
      <p class="src-browser-count" aria-live="polite"></p>
      <ul class="src-files" aria-label="Source files"></ul>
    </div>
    <p class="src-status" role="status" aria-live="polite"></p>
  `;

  const $ = (sel) => root.querySelector(sel);
  const el = {
    follow: $('.src-follow'),
    browse: $('.src-browse'),
    chips: $('.src-chips'),
    main: $('.src-main'),
    heading: $('.src-heading'),
    meta: $('.src-meta'),
    note: $('.src-note'),
    tools: $('.src-tools'),
    findForm: $('.src-find'),
    findQ: $('#src-find-q'),
    prev: $('.src-prev'),
    count: $('.src-count'),
    gotoForm: $('.src-goto'),
    gotoQ: $('#src-goto-q'),
    labels: $('#src-labels'),
    code: $('.src-code'),
    browser: $('.src-browser'),
    filesQ: $('#src-files-q'),
    progs: $('.src-progs'),
    files: $('.src-files'),
    filesCount: $('.src-browser-count'),
    close: $('.src-browser-close'),
    status: $('.src-status'),
  };
  el.filesQ.placeholder = `Search ${MANIFEST.filter((e) => e.name.endsWith('.agc')).length} files — name or topic`;

  // ---------- state ----------

  const cache = new Map();   // file → Promise<{ lines, labels }>
  const state = {
    follow: true,
    chips: [],               // [{ id, anchor|null, fresh }]
    chipKey: '',
    current: null,           // { kind: 'anchor'|'file', id, anchor, file }
    docFile: null,
    lines: null,
    labels: null,
    chunks: [],              // [{ el, start, end, rendered }]
    hl: null,                // { start, end }
    found: null,             // { line, from, to }
    matches: null,           // { key, list: [[line, col]] }
    matchIndex: -1,
    loadToken: 0,
    pending: null,
    flushQueued: false,
    raf: 0,
    browserProgram: 'all',
    programPicked: false,    // the user chose a program in the browser
    software: null,
    pendingScroll: null,
  };

  const reducedMotion = () => !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function lineHeight() {
    const v = parseFloat(win.getComputedStyle(el.code).getPropertyValue('--src-lh'));
    return v > 0 ? v : FALLBACK_LH;
  }

  function setStatus(text) {
    if (el.status.textContent !== text) el.status.textContent = text;
  }

  // ---------- loading files ----------

  function loadFile(file) {
    if (!cache.has(file)) {
      const url = new URL(`../../../${file.split('/').map(encodeURIComponent).join('/')}`, import.meta.url);
      const p = win.fetch(url).then((res) => {
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
        return res.text();
      }).then((text) => {
        const lines = splitLines(text);
        return { lines, labels: indexLabels(lines) };
      });
      p.catch(() => cache.delete(file));
      cache.set(file, p);
    }
    return cache.get(file);
  }

  function showLoadError(file, err) {
    const fromFile = win.location?.protocol === 'file:';
    const why = fromFile || !err.status
      ? 'The browser could not fetch the listing.'
      : `The server answered ${esc(err.message)} for <code>${esc(file)}</code>.`;
    el.code.innerHTML = `
      <div class="src-error">
        <p><b>Source not available.</b> ${why}</p>
        <p>The source panel reads the <code>.agc</code> files of this repository over HTTP.
        From the repository folder run <code>npm run sim</code> (or <code>node simulator/serve.mjs</code>)
        and open <a href="http://localhost:8011/simulator/">http://localhost:8011/simulator/</a>.</p>
        <p>Meanwhile you can read <a href="${esc(githubUrl(file, state.hl?.start, state.hl?.end))}" target="_blank" rel="noopener">${esc(fileBase(file))} on GitHub</a>.</p>
      </div>`;
    state.docFile = null;
    state.lines = null;
    state.chunks = [];
    el.tools.hidden = true;
  }

  // ---------- document rendering (lazy chunks) ----------

  function openDocument(file, data) {
    state.docFile = file;
    state.lines = data.lines;
    state.labels = data.labels;
    state.matches = null;
    state.matchIndex = -1;
    state.found = null;
    el.count.textContent = '';
    el.code.setAttribute('aria-label', `Source listing: ${fileBase(file)}, ${data.lines.length} lines`);
    const frag = doc.createDocumentFragment();
    state.chunks = [];
    for (let start = 1; start <= data.lines.length; start += CHUNK) {
      const end = Math.min(data.lines.length, start + CHUNK - 1);
      const div = doc.createElement('div');
      div.className = 'src-chunk';
      div.style.setProperty('--n', String(end - start + 1));
      frag.append(div);
      state.chunks.push({ el: div, start, end, rendered: false });
    }
    el.code.replaceChildren(frag);
    el.code.scrollTop = 0;
    el.code.scrollLeft = 0;
    // Labels for "Go to label" (datalist suggestions).
    const opts = doc.createDocumentFragment();
    for (const name of data.labels.keys()) {
      const o = doc.createElement('option');
      o.value = name;
      opts.append(o);
    }
    el.labels.replaceChildren(opts);
    el.tools.hidden = false;
  }

  function lineHtml(n) {
    const text = state.lines[n - 1];
    const tokens = tokenizeAgcLine(text);
    const mark = state.found && state.found.line === n ? state.found : null;
    let html = '';
    let pos = 0;
    for (const tok of tokens) {
      const from = pos;
      const to = pos + tok.text.length;
      pos = to;
      const piece = (s) => {
        if (!s) return '';
        if (tok.type === 'ws') return esc(s);
        if (tok.type === 'include') {
          const entry = resolveInclude(state.docFile.split('/')[0], s.slice(1));
          if (entry) return `<a class="t-include" href="${esc(githubUrl(entry.file))}" data-open="${esc(entry.file)}">${esc(s)}</a>`;
        }
        return `<span class="t-${tok.type}">${esc(s)}</span>`;
      };
      if (!mark || to <= mark.from || from >= mark.to) {
        html += piece(tok.text);
      } else {
        const a = Math.max(0, mark.from - from);
        const b = Math.min(tok.text.length, mark.to - from);
        html += piece(tok.text.slice(0, a)) + `<mark>${piece(tok.text.slice(a, b))}</mark>` + piece(tok.text.slice(b));
      }
    }
    const cls = ['sl'];
    const attrs = [];
    if (state.hl && n >= state.hl.start && n <= state.hl.end) {
      cls.push('is-hl');
      if (n === state.hl.start) cls.push('is-hl-first');
      if (n === state.hl.end) cls.push('is-hl-last');
      attrs.push('aria-current="true"');
    }
    if (mark) cls.push('is-found');
    if (tokens.length === 1 && tokens[0].type === 'page') cls.push('is-page');
    return `<li class="${cls.join(' ')}" ${attrs.join(' ')}><span class="ln" aria-hidden="true">${n}</span><span class="lc">${html || ' '}</span></li>`;
  }

  function renderChunk(chunk) {
    let html = `<ol class="src-lines" start="${chunk.start}">`;
    for (let n = chunk.start; n <= chunk.end; n++) html += lineHtml(n);
    chunk.el.innerHTML = `${html}</ol>`;
    chunk.rendered = true;
  }

  function chunkOf(n) {
    return state.chunks[Math.floor((n - 1) / CHUNK)] || null;
  }

  function ensureRendered(fromLine, toLine) {
    if (!state.lines) return;
    const a = Math.max(1, fromLine);
    const b = Math.min(state.lines.length, toLine);
    for (let i = Math.floor((a - 1) / CHUNK); i <= Math.floor((b - 1) / CHUNK); i++) {
      const c = state.chunks[i];
      if (c && !c.rendered) renderChunk(c);
    }
  }

  // Render what is visible (plus one viewport of overscan).
  function renderVisible() {
    state.raf = 0;
    if (!state.lines) return;
    const lh = lineHeight();
    const top = el.code.scrollTop;
    const h = el.code.clientHeight || 400;
    const first = Math.floor((top - h) / lh) + 1;
    const last = Math.ceil((top + 2 * h) / lh) + 1;
    ensureRendered(first, last);
  }

  function scheduleVisible() {
    if (!state.raf) state.raf = win.requestAnimationFrame(renderVisible);
  }

  // Re-render the given lines if their chunk is in the DOM (highlight and
  // find marks change only a handful of lines).
  function refreshLines(from, to) {
    if (!state.lines || !(from > 0)) return;
    const b = Math.min(state.lines.length, to);
    for (let n = Math.max(1, from); n <= b; n++) {
      const c = chunkOf(n);
      if (!c || !c.rendered) continue;
      const li = c.el.firstElementChild?.children[n - c.start];
      if (li) li.outerHTML = lineHtml(n);
    }
  }

  function setHighlight(range) {
    const old = state.hl;
    state.hl = range;
    if (old) refreshLines(old.start, old.end);
    if (range) refreshLines(range.start, range.end);
  }

  function setFound(found) {
    const old = state.found;
    state.found = found;
    if (old) refreshLines(old.line, old.line);
    if (found) refreshLines(found.line, found.line);
  }

  // Scroll so that `start..end` is in view with a little context above,
  // smoothly unless the user prefers reduced motion. Long jumps first move
  // instantly to one viewport away so the smooth part stays short.
  function scrollToRange(start, end = start, { smooth = true } = {}) {
    if (!state.lines) return;
    if (el.main.hidden) {
      // The file browser covers the code; scroll when it closes.
      state.pendingScroll = { start, end };
      return;
    }
    state.pendingScroll = null;
    const lh = lineHeight();
    const viewH = el.code.clientHeight || 400;
    const rangeH = (end - start + 1) * lh;
    let top = (start - 1 - CONTEXT) * lh;
    if (rangeH + 2 * CONTEXT * lh < viewH) top = (start - 1) * lh - Math.max(CONTEXT * lh, (viewH - rangeH) / 3);
    const maxTop = Math.max(0, state.lines.length * lh - viewH);
    top = Math.round(Math.min(maxTop, Math.max(0, top)));
    ensureRendered(Math.floor(top / lh) - CHUNK / 2, Math.ceil((top + viewH) / lh) + CHUNK / 2);
    const animate = smooth && !reducedMotion() && typeof el.code.scrollTo === 'function';
    if (animate && Math.abs(el.code.scrollTop - top) > 2 * viewH) {
      el.code.scrollTop = top + (el.code.scrollTop > top ? viewH : -viewH);
    }
    if (animate) el.code.scrollTo({ top, left: 0, behavior: 'smooth' });
    else {
      el.code.scrollTop = top;
      el.code.scrollLeft = 0;
    }
  }

  // ---------- header ----------

  function renderHeader() {
    const cur = state.current;
    if (!cur) return;
    if (cur.kind === 'missing') {
      el.heading.textContent = 'Unknown source anchor';
      el.meta.innerHTML = `<code>${esc(cur.id)}</code> is not defined in <code>simulator/js/data/anchors/</code>.`;
      el.note.hidden = true;
      return;
    }
    const entry = getManifestEntry(cur.file);
    const program = entry?.program || cur.file.split('/')[0];
    const parts = [`<span class="src-file" title="${esc(cur.file)}">${esc(fileBase(cur.file))}</span>`];
    let link;
    if (cur.kind === 'anchor') {
      const a = cur.anchor;
      const label = a.label || labelAt(a.start);
      el.heading.textContent = a.title || cur.id || fileBase(a.file);
      if (label) parts.push(`<span class="src-label" title="AGC label">${esc(label)}</span>`);
      parts.push(`<span class="src-lines-range">${a.start === a.end ? `line ${a.start}` : `lines ${a.start}–${a.end}`}</span>`);
      link = githubUrl(a.file, a.start, a.end);
      const note = a.note || a.description || '';
      el.note.textContent = note;
      el.note.hidden = !note;
    } else {
      el.heading.textContent = entry ? `${entry.title}` : fileBase(cur.file);
      if (entry?.pages) parts.push(`<span>listing pp. ${esc(entry.pages)}</span>`);
      if (entry?.lines) parts.push(`<span>${entry.lines} lines</span>`);
      link = githubUrl(cur.file, cur.line || null);
      el.note.textContent = entry?.description || '';
      el.note.hidden = !entry?.description;
    }
    parts.push(`<span class="src-prog">${esc(programLabel(program))}</span>`);
    parts.push(`<a class="src-gh" href="${esc(link)}" target="_blank" rel="noopener">View on GitHub<span class="visually-hidden"> (opens a new tab)</span></a>`);
    el.meta.innerHTML = parts.join('<span class="src-sep" aria-hidden="true"> · </span>');
  }

  function labelAt(n) {
    if (!state.lines || state.docFile !== state.current?.file) return null;
    const m = /^([^\s#$][^\s#]*)/.exec(state.lines[n - 1] || '');
    return m ? m[1] : null;
  }

  // ---------- showing things ----------

  // `fromUser`: a click in this panel (closes the file browser); requests
  // from the bus leave an open browser alone and update the view behind it.
  async function showAnchor(id, { fromUser = false } = {}) {
    const anchor = getAnchor(id);
    if (fromUser) closeBrowser({ focus: false });
    if (!anchor) {
      state.current = { kind: 'missing', id };
      renderHeader();
      updateChips();
      setStatus(`Unknown source anchor ${id}`);
      return;
    }
    state.current = { kind: 'anchor', id, anchor, file: anchor.file };
    updateChips();
    await openFile(anchor.file, { start: anchor.start, end: anchor.end });
  }

  async function openFile(file, { start = null, end = null, line = null, kind = null } = {}) {
    const token = ++state.loadToken;
    if (kind === 'file') state.current = { kind: 'file', file, line };
    hideEmpty();
    renderHeader();
    const range = start ? { start, end: Math.max(start, end || start) } : null;
    let data;
    if (state.docFile !== file) {
      // Forget the previous document while the next one loads.
      state.docFile = null;
      state.lines = null;
      state.chunks = [];
      state.hl = null;
      state.found = null;
      el.code.innerHTML = `<p class="src-loading">Loading ${esc(fileBase(file))}…</p>`;
      el.code.setAttribute('aria-busy', 'true');
      try {
        data = await loadFile(file);
      } catch (err) {
        if (token !== state.loadToken) return;
        el.code.removeAttribute('aria-busy');
        state.hl = range;
        showLoadError(file, err);
        setStatus(`Could not load ${fileBase(file)}`);
        return;
      }
      if (token !== state.loadToken) return;
      el.code.removeAttribute('aria-busy');
      state.hl = null;
      openDocument(file, data);
    }
    if (range && range.end > state.lines.length) range.end = state.lines.length;
    setFound(null);
    setHighlight(range);
    renderHeader();           // the label column is known now
    if (range) {
      scrollToRange(range.start, range.end);
      setStatus(`${fileBase(file)}, ${range.start === range.end ? `line ${range.start}` : `lines ${range.start} to ${range.end}`} highlighted`);
    } else if (line) {
      scrollToRange(line, line);
    } else {
      scrollToRange(1, 1, { smooth: false });
      setStatus(`${fileBase(file)} opened`);
    }
    scheduleVisible();
  }

  // ---------- chips (the anchors of the current step) ----------

  function setChips(ids, primary) {
    state.chips = ids.map((id) => ({ id, anchor: getAnchor(id), fresh: !state.follow }));
    const pid = typeof primary === 'number' ? ids[primary] : primary;
    state.chipPrimary = ids.includes(pid) ? pid : ids[0];
    updateChips();
  }

  function updateChips() {
    const chips = state.chips;
    el.chips.hidden = chips.length === 0;
    if (!chips.length) {
      el.chips.replaceChildren();
      return;
    }
    const curId = state.current?.kind === 'anchor' || state.current?.kind === 'missing' ? state.current.id : null;
    const key = chips.map((c) => `${c.id}:${c.fresh ? 1 : 0}`).join('|') + `#${curId}`;
    if (el.chips.dataset.key === key) return;
    el.chips.dataset.key = key;
    el.chips.replaceChildren(...chips.map((c) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'src-chip';
      b.dataset.id = c.id;
      const a = c.anchor;
      const label = a ? (a.label || fileBase(a.file).replace(/\.agc$/, '')) : c.id;
      const title = a ? `${a.title} — ${fileBase(a.file)} ${a.start}–${a.end}` : `Unknown anchor ${c.id}`;
      b.title = title;
      b.setAttribute('aria-label', a ? `${a.title} (${fileBase(a.file)}, lines ${a.start} to ${a.end})` : `Unknown anchor ${c.id}`);
      b.setAttribute('aria-pressed', String(c.id === curId));
      if (!a) b.classList.add('is-missing');
      if (c.fresh) b.classList.add('is-fresh');
      b.innerHTML = `<span class="src-chip-label">${esc(label)}</span><span class="src-chip-title">${esc(a ? a.title : 'unknown anchor')}</span>`;
      return b;
    }));
  }

  // ---------- incoming requests (bus) ----------

  function normalizeRequest(payload) {
    if (!payload || typeof payload !== 'object') return null;
    let ids = Array.isArray(payload.anchors) ? payload.anchors : (typeof payload.anchors === 'string' ? [payload.anchors] : []);
    if (!ids.length && typeof payload.anchor === 'string') ids = [payload.anchor];
    ids = [...new Set(ids.filter((x) => typeof x === 'string' && x))];
    if (ids.length) return { ids, primary: payload.primary ?? ids[0] };
    if (typeof payload.file === 'string') {
      const start = Number(payload.start || payload.line) || null;
      return { file: payload.file, start, end: Number(payload.end) || start, title: payload.title };
    }
    return null;
  }

  function request(payload) {
    const req = normalizeRequest(payload);
    if (!req) return;
    state.pending = req;
    if (!state.flushQueued) {
      state.flushQueued = true;
      queueMicrotask(flush);
    }
  }

  function flush() {
    state.flushQueued = false;
    const req = state.pending;
    state.pending = null;
    if (!req) return;
    if (req.file) {
      const key = `file:${req.file}:${req.start}:${req.end}`;
      if (key === state.chipKey) return;
      state.chipKey = key;
      if (!state.follow) return;
      if (req.start) {
        const anchor = { file: req.file, start: req.start, end: req.end || req.start, title: req.title || fileBase(req.file) };
        state.current = { kind: 'anchor', id: null, anchor, file: req.file };
        openFile(req.file, { start: anchor.start, end: anchor.end });
      } else {
        openFile(req.file, { kind: 'file' });
      }
      return;
    }
    const pid = typeof req.primary === 'number' ? req.ids[req.primary] : req.primary;
    const key = `${req.ids.join('|')}#${pid}`;
    if (key === state.chipKey) return;       // idempotent: director + narration chip
    state.chipKey = key;
    setChips(req.ids, req.primary);
    if (state.follow) showAnchor(state.chipPrimary);
  }

  if (bus) {
    offs.push(bus.on('source:show', request));
    offs.push(bus.on('narrate', (p) => {
      const anchors = p?.anchors || p?.narrate?.anchors;
      if (Array.isArray(anchors) && anchors.length) request({ anchors, primary: p.primary });
    }));
    offs.push(bus.on('director:seeked', (p) => {
      if (p?.reason === 'load') {
        state.chips = [];
        state.chipKey = '';
        updateChips();
      }
      const last = [...(p?.narrations || [])].reverse().find((n) => Array.isArray(n.anchors) && n.anchors.length);
      if (last) request({ anchors: last.anchors });
    }));
  }

  // ---------- empty state ----------

  function showEmpty() {
    state.current = null;
    el.heading.textContent = 'The flight software, line by line';
    el.meta.innerHTML = `${esc(PROGRAMS.Luminary099?.title || 'Luminary 099')} (Lunar Module) and ${esc(PROGRAMS.Comanche055?.title || 'Comanche 055')} (Command Module), as transcribed in this repository.`;
    el.note.hidden = true;
    el.tools.hidden = true;
    const items = FEATURED_ANCHORS.filter(([id]) => getAnchor(id)).map(([id, text]) =>
      `<li><button type="button" class="src-featured" data-anchor="${esc(id)}">${esc(text)}</button></li>`).join('');
    el.code.innerHTML = `
      <div class="src-empty">
        <p>During a replay this panel shows the real source lines behind each step — the highlighted range is what the computer is running.
        <span class="src-legend"><span class="t-label">LABEL</span> <span class="t-op">TC</span> machine op,
        <span class="t-iop">DLOAD</span> interpretive op, <span class="t-pseudo">OCT</span> pseudo-op,
        <span class="t-comment"># comment</span>, <span class="t-annot">## transcriber’s note</span>.</span></p>
        ${items ? `<p class="src-empty-sub">Famous lines:</p><ul class="src-featured-list">${items}</ul>` : ''}
        <p><button type="button" class="btn src-empty-browse">Browse all files</button></p>
      </div>`;
    state.docFile = null;
    state.lines = null;
    state.chunks = [];
    state.hl = null;
  }

  function hideEmpty() {
    const empty = el.code.querySelector('.src-empty');
    if (empty) empty.remove();
  }

  // ---------- file browser ----------

  let filesBuilt = false;

  function buildFiles() {
    const groups = [['Luminary099', 'Luminary 099 — Lunar Module'], ['Comanche055', 'Comanche 055 — Command Module']];
    const html = [];
    for (const [program, heading] of groups) {
      const entries = MANIFEST.filter((e) => e.program === program)
        .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.name < b.name ? -1 : 1));
      html.push(`<li class="src-files-group" data-group="${program}"><h4>${esc(heading)}</h4><ul>`);
      for (const e of entries) {
        const hay = `${e.name} ${e.title} ${e.description} ${e.section || ''}`.toLowerCase();
        html.push(`<li data-program="${e.program}" data-hay="${esc(hay)}"><button type="button" class="src-file-btn" data-file="${esc(e.file)}">
          <span class="src-file-name">${esc(e.name)}</span>
          <span class="src-file-meta">${e.section ? `${esc(e.section)} · ` : ''}${e.pages ? `pp. ${esc(e.pages)} · ` : ''}${e.lines} lines</span>
          <span class="src-file-desc">${esc(e.description || '')}</span></button></li>`);
      }
      html.push('</ul></li>');
    }
    el.files.innerHTML = html.join('');
    filesBuilt = true;
  }

  function filterFiles() {
    const q = el.filesQ.value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const group of el.files.querySelectorAll('.src-files-group')) {
      const groupOn = state.browserProgram === 'all' || group.dataset.group === state.browserProgram;
      let any = 0;
      for (const li of group.querySelectorAll('li[data-hay]')) {
        const on = groupOn && terms.every((t) => li.dataset.hay.includes(t));
        li.hidden = !on;
        if (on) any += 1;
      }
      group.hidden = !any;
      shown += any;
    }
    el.filesCount.textContent = `${shown} file${shown === 1 ? '' : 's'}`;
  }

  function setBrowserProgram(program) {
    state.browserProgram = program;
    for (const b of el.progs.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.prog === program));
    if (filesBuilt) filterFiles();
  }

  function openBrowser() {
    if (!filesBuilt) buildFiles();
    filterFiles();
    el.browser.hidden = false;
    el.main.hidden = true;
    el.browse.setAttribute('aria-expanded', 'true');
    el.filesQ.focus();
  }

  function closeBrowser({ focus = true } = {}) {
    if (el.browser.hidden) return;
    el.browser.hidden = true;
    el.main.hidden = false;
    el.browse.setAttribute('aria-expanded', 'false');
    if (focus) el.browse.focus();
    if (state.pendingScroll) scrollToRange(state.pendingScroll.start, state.pendingScroll.end, { smooth: false });
    scheduleVisible();
  }

  // ---------- find in file ----------

  function computeMatches(q) {
    const key = `${state.docFile}\n${q}`;
    if (state.matches?.key === key) return state.matches.list;
    const list = [];
    const needle = q.toLowerCase();
    for (let i = 0; i < state.lines.length && list.length < MAX_MATCHES; i++) {
      const hay = state.lines[i].toLowerCase();
      let at = hay.indexOf(needle);
      while (at >= 0 && list.length < MAX_MATCHES) {
        list.push([i + 1, at]);
        at = hay.indexOf(needle, at + needle.length);
      }
    }
    state.matches = { key, list };
    state.matchIndex = -1;
    return list;
  }

  function findStep(dir) {
    const q = el.findQ.value;
    if (!state.lines || !q) {
      el.count.textContent = '';
      setFound(null);
      return;
    }
    const list = computeMatches(q);
    if (!list.length) {
      el.count.textContent = 'No matches';
      setFound(null);
      return;
    }
    let i = state.matchIndex;
    if (i < 0) {
      // First search: start from the top of the view.
      const topLine = Math.floor(el.code.scrollTop / lineHeight()) + 1;
      i = list.findIndex(([n]) => n >= topLine);
      if (i < 0) i = 0;
      if (dir < 0) i = (i - 1 + list.length) % list.length;
    } else {
      i = (i + dir + list.length) % list.length;
    }
    state.matchIndex = i;
    const [line, col] = list[i];
    setFound({ line, from: col, to: col + q.length });
    scrollToRange(line, line, { smooth: false });
    const capped = list.length >= MAX_MATCHES ? '+' : '';
    el.count.textContent = `${i + 1} of ${list.length}${capped}`;
  }

  function gotoLabel(query) {
    const q = query.trim();
    if (!q || !state.labels) return;
    const up = q.toUpperCase();
    let line = state.labels.get(q) || state.labels.get(up);
    let name = state.labels.has(q) ? q : up;
    if (!line) {
      for (const [k, v] of state.labels) {
        if (k.toUpperCase().startsWith(up)) { line = v; name = k; break; }
      }
    }
    if (!line) {
      setStatus(`No label ${q} in ${fileBase(state.docFile)}`);
      return;
    }
    setFound({ line, from: 0, to: name.length });
    scrollToRange(line, line);
    setStatus(`${name}: line ${line}`);
  }

  // ---------- events ----------

  function onClick(e) {
    const t = e.target;
    const chip = t.closest('.src-chip');
    if (chip) {
      const c = state.chips.find((x) => x.id === chip.dataset.id);
      if (c) c.fresh = false;
      showAnchor(chip.dataset.id, { fromUser: true });
      return;
    }
    const feat = t.closest('[data-anchor]');
    if (feat) {
      showAnchor(feat.dataset.anchor, { fromUser: true });
      return;
    }
    const fileBtn = t.closest('[data-file]');
    if (fileBtn) {
      closeBrowser({ focus: false });
      openFile(fileBtn.dataset.file, { kind: 'file' }).then(() => el.code.focus({ preventScroll: true }));
      return;
    }
    const inc = t.closest('a[data-open]');
    if (inc && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
      e.preventDefault();
      openFile(inc.dataset.open, { kind: 'file' });
      return;
    }
    if (t.closest('.src-empty-browse')) openBrowser();
  }

  function onKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (e.key === 'f' || e.key === 'F') && !el.tools.hidden && !el.main.hidden) {
      e.preventDefault();
      el.findQ.focus();
      el.findQ.select();
    } else if ((e.key === 'F3' || (mod && (e.key === 'g' || e.key === 'G'))) && state.lines) {
      e.preventDefault();
      findStep(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape' && !el.browser.hidden) {
      e.preventDefault();
      closeBrowser();
    }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeyDown);
  el.code.addEventListener('scroll', scheduleVisible, { passive: true });

  el.follow.addEventListener('click', () => {
    state.follow = !state.follow;
    el.follow.setAttribute('aria-pressed', String(state.follow));
    if (state.follow) {
      for (const c of state.chips) c.fresh = false;
      if (state.chipPrimary && state.current?.id !== state.chipPrimary) showAnchor(state.chipPrimary);
      else updateChips();
    }
  });
  el.browse.addEventListener('click', () => (el.browser.hidden ? openBrowser() : closeBrowser()));
  el.close.addEventListener('click', () => closeBrowser());
  el.progs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-prog]');
    if (b) {
      state.programPicked = true;
      setBrowserProgram(b.dataset.prog);
    }
  });
  el.filesQ.addEventListener('input', filterFiles);
  el.filesQ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      const first = el.files.querySelector('li[data-hay]:not([hidden]) button');
      if (first) {
        e.preventDefault();
        if (e.key === 'Enter') first.click();
        else first.focus();
      }
    }
  });
  el.files.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const btns = [...el.files.querySelectorAll('li[data-hay]:not([hidden]) button')];
    const i = btns.indexOf(doc.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? btns[i + 1] : (btns[i - 1] || el.filesQ);
    next?.focus();
  });
  el.findForm.addEventListener('submit', (e) => {
    e.preventDefault();
    findStep(1);
  });
  el.findQ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      findStep(-1);
    } else if (e.key === 'Escape') {
      el.findQ.value = '';
      el.count.textContent = '';
      setFound(null);
      el.code.focus({ preventScroll: true });
    }
  });
  el.findQ.addEventListener('input', () => {
    state.matches = null;
    state.matchIndex = -1;
    el.count.textContent = '';
  });
  el.prev.addEventListener('click', () => findStep(-1));
  el.gotoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    gotoLabel(el.gotoQ.value);
  });

  // ---------- start ----------

  showEmpty();
  // A view that mounts after the director has already narrated (or after a
  // seek) picks up the latest narration's anchors.
  try {
    const hist = ctx.app?.director?.history?.();
    const last = [...(hist?.narrations || [])].reverse().find((n) => Array.isArray(n.anchors) && n.anchors.length);
    if (last) request({ anchors: last.anchors });
  } catch {
    // no director yet — nothing to restore
  }

  return {
    render(snapshot, ui) {
      // Default the file browser to the program being flown.
      const software = (ui?.mode === 'interactive' ? ui?.preset?.software : ui?.scenario?.software)
        || snapshot?.agc?.software || null;
      if (software && software !== state.software) {
        state.software = software;
        if (!state.programPicked) setBrowserProgram(software);
      }
    },
    // For other views and the console: show an anchor or a file directly.
    show(idOrPayload) {
      request(typeof idOrPayload === 'string' ? { anchors: [idOrPayload] } : idOrPayload);
    },
    destroy() {
      for (const off of offs) off?.();
      if (state.raf) win.cancelAnimationFrame(state.raf);
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeyDown);
      root.innerHTML = '';
      root.classList.remove('src');
    },
  };
}
