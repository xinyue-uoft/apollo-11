// The DSKY view: a faithful drawing of the Block II DSKY (LM for Luminary099,
// CM main panel for Comanche055) driven by DskyState snapshots, plus a real
// keyboard (buttons + physical keys).
//
// Geometry is in mils (0.001 in) measured from Riley Rainey's CAD
// transcription of the MIT/Raytheon drawings (web-dsky-b §1): front housing
// 2004968E (8.124 x 8.000 in), front cover 2004929 (6.900 x 8.000 in), EL
// display 1006315G, lamp panel 1006387D, keycap 1006353A. One SVG draws the
// panel; transparent HTML boxes laid over it carry the spotlight hooks
// (`data-spot`) and accessible names, and the keys are real <button>s at
// the CAD key positions. Everything scales with the column width (SVG
// viewBox + container-query units), so nothing has a fixed pixel size.
//
// Colours are the research's recommendations (web-dsky-b §4, mostly
// APPROX white-balanced photo samples; EL green from the 530 nm spec).

import { KEYBOARD_MAP } from '../util/keys.js';
import {
  DSKY_LAMP_LAYOUT, FLASHING_LIGHTS, LIGHT_LEGENDS, segmentsFor, dskySummary, dskyAnnounceKey,
} from '../agc/dsky-state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------- geometry (mils) ----------

const UNIT_W = 8124;                 // front housing width  [CAD 2004968E]
const UNIT_H = 8000;                 // front housing height
const FACE_X = (UNIT_W - 6900) / 2;  // cover plate 6.900 in wide, centred in the housing (APPROX centring)

// Window openings in the cover plate [CAD 2004929], cover-plate coordinates.
const LAMP_WIN = { x: FACE_X + 520, y: 265, w: 2500, h: 4480 };
const EL_WIN = { x: FACE_X + 3880, y: 265, w: 2500, h: 4480 };

// Lamp grid [CAD 1006387D]: 1.100 x 0.530 in cells, column gap 0.140 in,
// row pitch 0.595 in; the 2.340 x 4.100 in grid is centred in the window (APPROX).
const LAMP_CELL = { w: 1100, h: 530, colX: [0, 1240], pitch: 595 };
const LAMP_ORIGIN = { x: LAMP_WIN.x + (LAMP_WIN.w - 2340) / 2, y: LAMP_WIN.y + (LAMP_WIN.h - 4100) / 2 };

// EL panel [CAD 1006315G]: content 2.360 x 4.054 in, centred in the window (APPROX).
const EL = { x: EL_WIN.x + (EL_WIN.w - 2360) / 2, y: EL_WIN.y + (EL_WIN.h - 4054) / 2 };
const EL_COMPACTY = { x: 0, y: 0, w: 880, h: 820 };
const EL_LABELS = [
  { text: 'PROG', x: 1480, y: 0 },
  { text: 'VERB', x: 0, y: 960 },
  { text: 'NOUN', x: 1480, y: 960 },
];
const EL_LABEL_SIZE = { w: 880, h: 260 };
// Separator bars. The CAD (drawing rev G) starts the top bar at x 0.041 in;
// some later panels show all three the same length (web-dsky-b §1.3 note).
const EL_SEPS = [
  { x: 41, y: 1840, w: 2180, h: 65 },
  { x: 258, y: 2600, w: 1963, h: 65 },
  { x: 258, y: 3360, w: 1963, h: 65 },
];
const DIGIT_W = 444;
const DIGIT_H = 500;
const FIELD_DIGITS = {
  prog: [[1492, 314], [1912, 314]],
  verb: [[22, 1274], [442, 1274]],
  noun: [[1492, 1274], [1912, 1274]],
};
const REG_X = [272, 682, 1092, 1502, 1912];
const REG_Y = [2034, 2794, 3554];
const SIGN_X = 23;
const SIGN_Y = [2163, 2923, 3683];

// Spotlight / accessibility boxes over the EL panel (EL-content coordinates).
const EL_SPOTS = {
  prog: { x: 1480, y: 0, w: 880, h: 814 },
  verb: { x: 0, y: 960, w: 886, h: 814 },
  noun: { x: 1480, y: 960, w: 880, h: 814 },
  r1: { x: 23, y: 2034, w: 2333, h: 500 },
  r2: { x: 23, y: 2794, w: 2333, h: 500 },
  r3: { x: 23, y: 3554, w: 2333, h: 500 },
  compacty: EL_COMPACTY,
};

// EL digit segments, digit-local mils (0.444 x 0.500 in box, slanted ~15 deg;
// derived from CAD SegE/H/M/N/K/F/J, web-dsky-b §2). '1' lights b+c — the
// right-hand side, not centred, as on the real panel.
const SEGMENTS = {
  a: '176,65 349,65 367,0 138,0',
  b: '309,252 377,252 444,0 377,0',
  c: '265,419 311,498 374,262 307,262',
  d: '10,497 19,500 300,500 262,430 77,430',
  e: '0,475 2,491 85,408 124,262 57,262',
  f: '59,252 127,252 173,80 130,4 123,15',
  g: '128,285 290,285 308,220 146,220',
};
const SEG_NAMES = Object.keys(SEGMENTS);

// Sign: upright, 0.232 x 0.248 in box; '-' is the bar, '+' adds two stubs
// with small gaps to the bar [CAD Body1-3].
const SIGN_PARTS = {
  bar: { x: 0, y: 91, w: 232, h: 65 },
  top: { x: 82, y: 0, w: 65, h: 83 },
  bottom: { x: 82, y: 166, w: 65, h: 82 },
};

// Keyboard [CAD 2004929]: 7 columns, ~0.909 in square openings at 0.970 in
// pitch; c1/c7 keys sit half a pitch lower than the main rows. Keycap face
// 0.865 in square [CAD 1006353A]. Order = tab order (row by row).
const KEY_COL_X = [84, 1053, 2025, 2995, 3965, 4937, 5910];
const KEY_ROW_Y = { r1: 5064, up: 5551, r2: 6034, low: 6521, r3: 7003 };
const KEY_OPEN = 909;
const KEY_CAP = 865;
const KEY_DEFS = [
  { key: 'VERB', id: 'verb', label: 'Verb', legend: ['VERB'], col: 0, row: 'up' },
  { key: '+', id: 'plus', label: 'Plus', legend: ['+'], col: 1, row: 'r1', kind: 'sign' },
  { key: '7', id: '7', label: '7', legend: ['7'], col: 2, row: 'r1', kind: 'digit' },
  { key: '8', id: '8', label: '8', legend: ['8'], col: 3, row: 'r1', kind: 'digit' },
  { key: '9', id: '9', label: '9', legend: ['9'], col: 4, row: 'r1', kind: 'digit' },
  { key: 'CLR', id: 'clr', label: 'Clear', legend: ['CLR'], col: 5, row: 'r1' },
  { key: 'ENTR', id: 'entr', label: 'Enter', legend: ['ENTR'], col: 6, row: 'up' },
  { key: 'NOUN', id: 'noun', label: 'Noun', legend: ['NOUN'], col: 0, row: 'low' },
  { key: '-', id: 'minus', label: 'Minus', legend: ['−'], col: 1, row: 'r2', kind: 'sign' },
  { key: '4', id: '4', label: '4', legend: ['4'], col: 2, row: 'r2', kind: 'digit' },
  { key: '5', id: '5', label: '5', legend: ['5'], col: 3, row: 'r2', kind: 'digit' },
  { key: '6', id: '6', label: '6', legend: ['6'], col: 4, row: 'r2', kind: 'digit' },
  { key: 'PRO', id: 'pro', label: 'Proceed', legend: ['PRO'], col: 5, row: 'r2' },
  { key: 'RSET', id: 'rset', label: 'Reset', legend: ['RSET'], col: 6, row: 'low' },
  { key: '0', id: '0', label: '0', legend: ['0'], col: 1, row: 'r3', kind: 'digit' },
  { key: '1', id: '1', label: '1', legend: ['1'], col: 2, row: 'r3', kind: 'digit' },
  { key: '2', id: '2', label: '2', legend: ['2'], col: 3, row: 'r3', kind: 'digit' },
  { key: '3', id: '3', label: '3', legend: ['3'], col: 4, row: 'r3', kind: 'digit' },
  { key: 'KEY REL', id: 'keyrel', label: 'Key release', legend: ['KEY', 'REL'], col: 5, row: 'r3' },
];

// Lamp legends as engraved (two-line ones split as on the windows).
const LAMP_LINES = {
  uplinkActy: ['UPLINK', 'ACTY'],
  gimbalLock: ['GIMBAL', 'LOCK'],
};
const WHITE_COLUMN = 0; // left column white, right column yellow (web-dsky-b §1.2)

const VARIANTS = {
  Luminary099: { id: 'lm', caption: 'LM DSKY · Luminary 099', name: 'Lunar Module DSKY' },
  Comanche055: { id: 'cm', caption: 'CM DSKY · Comanche 055', name: 'Command Module main-panel DSKY' },
};

const PRESS_MS = { crew: 420, user: 150 };
const LIVE_MIN_INTERVAL_MS = 1000;
// Register-only changes are announced just after the user's own keystroke
// (the echo of a V21 load); a running monitor verb is otherwise silent.
const USER_ECHO_MS = 1500;

// Focusable scrolling panels (source listing, transcript, file list): Enter
// keeps its own meaning there; every other DSKY key (letters, digits, +/-)
// still reaches the DSKY so a sequence is never half-keyed. The replay
// shortcuts (controls-view.js) skip the same regions for Space and the arrows.
const SCROLL_REGIONS = '[role="region"][tabindex], [role="log"], .src-code, .tr-feed, .src-files';

let mountCount = 0;

// ---------- small DOM helpers ----------

function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (parent) parent.append(el);
  return el;
}

function htmlEl(tag, attrs = {}, parent = null) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') el.textContent = v;
    else el.setAttribute(k, String(v));
  }
  if (parent) parent.append(el);
  return el;
}

// Position an absolutely placed HTML box given unit mils.
function place(el, x, y, w, h) {
  const s = el.style;
  s.left = `${(x / UNIT_W) * 100}%`;
  s.top = `${(y / UNIT_H) * 100}%`;
  s.width = `${(w / UNIT_W) * 100}%`;
  s.height = `${(h / UNIT_H) * 100}%`;
}

function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function isEditable(el) {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  return /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
}

// Elements where Enter/Space must keep their native meaning.
function isActivatable(el) {
  if (!el || el === document.body) return false;
  return /^(BUTTON|A|SUMMARY)$/.test(el.tagName)
    || /^(button|tab|link|menuitem|option|switch|checkbox|radio)$/.test(el.getAttribute?.('role') || '');
}

function inScrollRegion(el) {
  return !!(el && el.nodeType === 1 && el.closest(SCROLL_REGIONS));
}

const fieldText = (s) => s.trim() || 'blank';
const signWord = (sign) => (sign === '+' ? 'plus ' : sign === '-' ? 'minus ' : '');

// ---------- the view ----------

export function mountDsky(root, ctx = {}) {
  const uid = `dsky${++mountCount}`;
  const bus = ctx.bus || null;
  const offs = [];

  root.textContent = '';
  const dsky = htmlEl('div', { class: 'dsky', 'data-variant': 'lm', 'data-power': 'off', 'data-el': 'off' }, root);
  const unit = htmlEl('div', {
    class: 'dsky-unit', 'data-spot': 'dsky', role: 'group', 'aria-label': 'DSKY: display and keyboard',
  }, dsky);

  // ----- static artwork -----
  const art = svgEl('svg', {
    class: 'dsky-art', viewBox: `0 0 ${UNIT_W} ${UNIT_H}`, 'aria-hidden': 'true', focusable: 'false',
  }, unit);
  const defs = svgEl('defs', {}, art);
  const glow = svgEl('filter', {
    id: `${uid}-glow`, x: '-20%', y: '-20%', width: '140%', height: '140%', 'color-interpolation-filters': 'sRGB',
  }, defs);
  svgEl('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 16, result: 'blur' }, glow);
  const merge = svgEl('feMerge', {}, glow);
  svgEl('feMergeNode', { in: 'blur' }, merge);
  svgEl('feMergeNode', { in: 'SourceGraphic' }, merge);
  const faceGrad = svgEl('linearGradient', { id: `${uid}-face`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  svgEl('stop', { offset: 0, class: 'face-hi' }, faceGrad);
  svgEl('stop', { offset: 1, class: 'face-lo' }, faceGrad);
  const lampGrad = svgEl('radialGradient', { id: `${uid}-lamp`, cx: '50%', cy: '45%', r: '70%' }, defs);
  svgEl('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.35 }, lampGrad);
  svgEl('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }, lampGrad);

  // Housing with its side flanges, then the cover plate. Fastener positions
  // on the flanges are illustrative (APPROX — not measured).
  svgEl('rect', { class: 'housing', x: 0, y: 0, width: UNIT_W, height: UNIT_H, rx: 140 }, art);
  for (const cx of [FACE_X / 2, UNIT_W - FACE_X / 2]) {
    for (const cy of [620, UNIT_H - 620]) {
      const g = svgEl('g', { class: 'fastener', transform: `translate(${cx} ${cy})` }, art);
      svgEl('circle', { r: 115 }, g);
      svgEl('rect', { x: -80, y: -16, width: 160, height: 32, rx: 10 }, g);
    }
  }
  svgEl('rect', { class: 'face', x: FACE_X, y: 0, width: 6900, height: UNIT_H, fill: `url(#${uid}-face)` }, art);

  // Lamp window (the cells are drawn per variant below).
  svgEl('rect', { class: 'win lamp-win', x: LAMP_WIN.x, y: LAMP_WIN.y, width: LAMP_WIN.w, height: LAMP_WIN.h, rx: 40 }, art);
  const lampLayer = svgEl('g', { class: 'lamp-cells' }, art);

  // EL window.
  svgEl('rect', { class: 'win el-win', x: EL_WIN.x, y: EL_WIN.y, width: EL_WIN.w, height: EL_WIN.h, rx: 40 }, art);
  const elg = svgEl('g', { class: 'el', transform: `translate(${EL.x} ${EL.y})`, filter: `url(#${uid}-glow)` }, art);

  const compActy = svgEl('g', { class: 'el-compacty' }, elg);
  svgEl('rect', { x: EL_COMPACTY.x, y: EL_COMPACTY.y, width: EL_COMPACTY.w, height: EL_COMPACTY.h }, compActy);
  for (const [i, word] of ['COMP', 'ACTY'].entries()) {
    svgEl('text', { x: EL_COMPACTY.w / 2, y: 290 + i * 250, class: 'el-text' }, compActy).textContent = word;
  }
  for (const label of EL_LABELS) {
    const g = svgEl('g', { class: 'el-label' }, elg);
    svgEl('rect', { x: label.x, y: label.y, width: EL_LABEL_SIZE.w, height: EL_LABEL_SIZE.h }, g);
    svgEl('text', { x: label.x + EL_LABEL_SIZE.w / 2, y: label.y + EL_LABEL_SIZE.h / 2, class: 'el-text' }, g)
      .textContent = label.text;
  }
  for (const s of EL_SEPS) svgEl('rect', { class: 'el-sep', x: s.x, y: s.y, width: s.w, height: s.h }, elg);

  const digitsLayer = svgEl('g', { class: 'el-digits' }, elg);
  const makeDigit = (x, y, parent) => {
    const g = svgEl('g', { class: 'digit', transform: `translate(${x} ${y})` }, parent);
    const polys = SEG_NAMES.map((s) => svgEl('polygon', { class: 'seg', points: SEGMENTS[s] }, g));
    return { ch: null, polys };
  };
  const fields = {};
  for (const [name, pos] of Object.entries(FIELD_DIGITS)) {
    const g = svgEl('g', { class: `field field-${name}${name === 'prog' ? '' : ' vn'}` }, digitsLayer);
    fields[name] = pos.map(([x, y]) => makeDigit(x, y, g));
  }
  const regs = REG_Y.map((y, i) => {
    const g = svgEl('g', { class: `reg reg-${i + 1}` }, digitsLayer);
    const sg = svgEl('g', { class: 'sign', transform: `translate(${SIGN_X} ${SIGN_Y[i]})` }, g);
    const parts = {};
    for (const [k, r] of Object.entries(SIGN_PARTS)) {
      parts[k] = svgEl('rect', { class: 'seg', x: r.x, y: r.y, width: r.w, height: r.h }, sg);
    }
    return { sign: { ch: null, parts }, digits: REG_X.map((x) => makeDigit(x, y, g)) };
  });

  // Key openings (recesses) behind the caps.
  for (const k of KEY_DEFS) {
    svgEl('rect', {
      class: 'key-well', x: FACE_X + KEY_COL_X[k.col], y: KEY_ROW_Y[k.row], width: KEY_OPEN, height: KEY_OPEN, rx: 60,
    }, art);
  }

  // ----- overlays: spotlight hooks + accessible names -----
  const lampsBox = htmlEl('div', { class: 'dsky-overlay', role: 'group', 'aria-label': 'Indicator lamps' }, unit);
  const displayBox = htmlEl('div', { class: 'dsky-overlay', role: 'group', 'aria-label': 'Electroluminescent display' }, unit);
  const elSpots = {};
  for (const [name, r] of Object.entries(EL_SPOTS)) {
    const el = htmlEl('div', { class: 'dsky-spot', 'data-spot': `dsky.${name}`, role: 'img' }, displayBox);
    place(el, EL.x + r.x, EL.y + r.y, r.w, r.h);
    elSpots[name] = el;
  }
  // COMP ACTY also answers to the lamp-style id.
  const compSpot = htmlEl('div', { class: 'dsky-spot dsky-spot-inner', 'data-spot': 'dsky.light.compActy', 'aria-hidden': 'true' }, elSpots.compacty);
  compSpot.style.inset = '0';

  // ----- keyboard -----
  const keysBox = htmlEl('div', { class: 'dsky-keys', role: 'group', 'aria-label': 'DSKY keyboard' }, unit);
  const keyButtons = new Map();
  for (const k of KEY_DEFS) {
    const b = htmlEl('button', {
      type: 'button',
      class: `dsky-key${k.kind ? ` dsky-key-${k.kind}` : ''}${k.legend.length > 1 ? ' dsky-key-2line' : ''}`,
      'aria-label': k.label,
      'data-spot': `dsky.key.${k.id}`,
      'data-key': k.key,
    }, keysBox);
    for (const line of k.legend) htmlEl('span', { text: line, 'aria-hidden': 'true' }, b);
    const inset = (KEY_OPEN - KEY_CAP) / 2;
    place(b, FACE_X + KEY_COL_X[k.col] + inset, KEY_ROW_Y[k.row] + inset, KEY_CAP, KEY_CAP);
    keyButtons.set(k.key, { el: b, timer: null });

    b.addEventListener('pointerdown', (e) => {
      if (e.button === 0) b.classList.add('is-down');
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
      b.addEventListener(type, () => b.classList.remove('is-down'));
    }
    // A mouse click must not leave focus on a button: a later physical Enter
    // would re-activate that button instead of meaning ENTR. So, like a
    // click on plain content, it takes focus off whatever control had it.
    // (Tab focus + Enter/Space still activates a key, as for any button.)
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const active = document.activeElement;
      if (active && active !== document.body && typeof active.blur === 'function') active.blur();
    });
    b.addEventListener('click', () => userPress(k.key));
  }

  // ----- footer: caption + shortcut legend -----
  const foot = htmlEl('div', { class: 'dsky-foot' }, dsky);
  const caption = htmlEl('span', { class: 'dsky-caption', text: VARIANTS.Luminary099.caption }, foot);
  const legendId = `${uid}-legend`;
  const toggle = htmlEl('button', {
    type: 'button', class: 'btn dsky-legend-toggle', 'aria-expanded': 'false', 'aria-controls': legendId,
    'aria-label': 'Keyboard shortcuts', text: 'Shortcuts',
  }, foot);
  const legend = htmlEl('div', { class: 'dsky-legend', id: legendId, hidden: '' }, dsky);
  buildLegend(legend);
  toggle.addEventListener('click', () => {
    const open = legend.hidden;
    legend.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });

  const live = htmlEl('div', { class: 'visually-hidden', 'aria-live': 'polite', 'aria-atomic': 'true' }, dsky);

  // ----- per-variant lamp panel -----
  let variant = null;
  let lamps = [];   // { name, g, spot, flashes, on, label }

  function buildLamps(software) {
    const layout = DSKY_LAMP_LAYOUT[software] || DSKY_LAMP_LAYOUT.Luminary099;
    lampLayer.textContent = '';
    lampsBox.textContent = '';
    lamps = [];
    layout.forEach((row, ri) => {
      row.forEach((entry, ci) => {
        if (entry === null) return; // no window here (CM rows 6-7)
        const x = LAMP_ORIGIN.x + LAMP_CELL.colX[ci];
        const y = LAMP_ORIGIN.y + ri * LAMP_CELL.pitch;
        const blank = typeof entry === 'object';
        const name = blank ? entry.blank : entry;
        const color = ci === WHITE_COLUMN ? 'white' : 'yellow';
        const flashes = !blank && FLASHING_LIGHTS.includes(name);
        const g = svgEl('g', {
          class: `lamp lamp-${color}${blank ? ' lamp-blank' : ''}${flashes ? ' lamp-flashes' : ''}`,
        }, lampLayer);
        svgEl('rect', { class: 'lamp-cell', x, y, width: LAMP_CELL.w, height: LAMP_CELL.h, rx: 18 }, g);
        svgEl('rect', { class: 'lamp-sheen', x, y, width: LAMP_CELL.w, height: LAMP_CELL.h, rx: 18, fill: `url(#${uid}-lamp)` }, g);
        const spot = htmlEl('div', { class: 'dsky-spot', 'data-spot': `dsky.light.${name}` }, lampsBox);
        place(spot, x, y, LAMP_CELL.w, LAMP_CELL.h);
        if (blank) {
          // Blank window on the Apollo 11 LM: never lit (web-dsky-b §1.2).
          spot.setAttribute('aria-hidden', 'true');
          return;
        }
        const lines = LAMP_LINES[name] || [LIGHT_LEGENDS[name]];
        lines.forEach((line, li) => {
          const ty = y + LAMP_CELL.h / 2 + (li - (lines.length - 1) / 2) * 190;
          svgEl('text', { class: 'lamp-text', x: x + LAMP_CELL.w / 2, y: ty }, g).textContent = line;
        });
        spot.setAttribute('role', 'img');
        const lamp = { name, g, spot, flashes, on: null, label: '' };
        lamps.push(lamp);
        setLampLabel(lamp, false);
      });
    });
  }

  function setLampLabel(lamp, on) {
    const state = on ? (lamp.flashes ? 'on, flashing' : 'on') : 'off';
    const label = `${LIGHT_LEGENDS[lamp.name]} lamp: ${state}`;
    if (label !== lamp.label) {
      lamp.label = label;
      lamp.spot.setAttribute('aria-label', label);
    }
  }

  // ----- drawing primitives (diffed) -----

  function setDigit(dg, ch) {
    if (dg.ch === ch) return;
    dg.ch = ch;
    const segs = segmentsFor(ch);
    for (let i = 0; i < 7; i++) dg.polys[i].classList.toggle('on', segs.includes(SEG_NAMES[i]));
  }

  function setSign(sg, ch) {
    if (sg.ch === ch) return;
    sg.ch = ch;
    sg.parts.bar.classList.toggle('on', ch === '+' || ch === '-');
    sg.parts.top.classList.toggle('on', ch === '+');
    sg.parts.bottom.classList.toggle('on', ch === '+');
  }

  const spotLabels = {};
  function setSpotLabel(name, text) {
    if (spotLabels[name] === text) return;
    spotLabels[name] = text;
    elSpots[name].setAttribute('aria-label', text);
  }

  // ----- live summary (at most once per second, only on change) -----
  // Interactive mode only: during a replay the narration explains the DSKY.
  // The summary is announced when PROG/VERB/NOUN, the flash or a lamp
  // changes, or within USER_ECHO_MS of the user's own key; the registers
  // stay readable on demand through the display's field labels.
  let liveText = '';
  let livePending = null;
  let liveLast = -Infinity;
  let liveTimer = null;
  let liveKey = null;
  let userKeyAt = -Infinity;
  let mode = null;

  function announce(text) {
    if (text === liveText && livePending === null) return;
    livePending = text;
    const now = performance.now();
    const wait = liveLast + LIVE_MIN_INTERVAL_MS - now;
    if (wait <= 0) flushLive();
    else if (!liveTimer) liveTimer = setTimeout(flushLive, wait);
  }

  function flushLive() {
    liveTimer = null;
    if (livePending === null) return;
    if (livePending !== liveText) {
      liveText = livePending;
      live.textContent = liveText;
      liveLast = performance.now();
    }
    livePending = null;
  }

  function silenceLive() {
    clearTimeout(liveTimer);
    liveTimer = null;
    livePending = null;
    liveText = '';
    live.textContent = '';
  }

  // Demo: the keys only show the crew's keystrokes (a click explains why
  // with a toast), so they leave the tab order and read as unavailable.
  function applyMode(m) {
    if (m === mode) return;
    mode = m;
    const demo = m === 'demo';
    for (const { el } of keyButtons.values()) {
      if (demo) {
        el.tabIndex = -1;
        el.setAttribute('aria-disabled', 'true');
      } else {
        el.removeAttribute('tabindex');
        el.removeAttribute('aria-disabled');
      }
    }
    keysBox.setAttribute('aria-label', demo ? 'DSKY keyboard (read-only during a replay)' : 'DSKY keyboard');
    liveKey = null;
    dirty = true;
    if (demo) silenceLive();
  }

  // ----- render -----
  let lastVersion = -1;
  let dirty = true;
  let poweredOff = false;

  function applyVariant(software) {
    const v = VARIANTS[software] ? software : 'Luminary099';
    if (v === variant) return;
    variant = v;
    buildLamps(v);
    setAttr(dsky, 'data-variant', VARIANTS[v].id);
    caption.textContent = VARIANTS[v].caption;
    unit.setAttribute('aria-label', `${VARIANTS[v].name}: display and keyboard`);
    dirty = true;
  }

  function apply(d) {
    // The EL panel is dark only when there is no computer. (On the real
    // DSKY standby also switches it off, but standby is not modelled: here
    // STBY lights only for the V35 lamp test, with the panel on.)
    const elOff = !d;
    setAttr(dsky, 'data-power', d ? 'on' : 'off');
    setAttr(dsky, 'data-el', elOff ? 'off' : 'on');
    setAttr(dsky, 'data-blanked', d?.blanked ? 'true' : 'false');
    setAttr(dsky, 'data-vnflash', d?.flashVerbNoun ? 'true' : 'false');

    const prog = d ? d.prog : '  ';
    const verb = d ? d.verb : '  ';
    const noun = d ? d.noun : '  ';
    setDigit(fields.prog[0], prog[0]); setDigit(fields.prog[1], prog[1]);
    setDigit(fields.verb[0], verb[0]); setDigit(fields.verb[1], verb[1]);
    setDigit(fields.noun[0], noun[0]); setDigit(fields.noun[1], noun[1]);
    for (let i = 0; i < 3; i++) {
      const r = d ? d.r[i] : { sign: ' ', digits: '     ' };
      setSign(regs[i].sign, r.sign);
      for (let j = 0; j < 5; j++) setDigit(regs[i].digits[j], r.digits[j]);
    }

    for (const lamp of lamps) {
      const on = !!(d && d.lights[lamp.name]);
      if (on !== lamp.on) {
        lamp.on = on;
        lamp.g.classList.toggle('on', on);
        setLampLabel(lamp, on);
      }
    }
    const ca = !!(d && !elOff && d.lights.compActy);
    compActy.classList.toggle('on', ca);

    // Accessible names of the display fields.
    const dark = elOff || !!d?.blanked;
    const flash = d?.flashVerbNoun ? ', flashing' : '';
    setSpotLabel('prog', `PROG: ${dark ? 'blank' : fieldText(prog)}`);
    setSpotLabel('verb', `VERB: ${dark ? 'blank' : fieldText(verb)}${flash}`);
    setSpotLabel('noun', `NOUN: ${dark ? 'blank' : fieldText(noun)}${flash}`);
    for (let i = 0; i < 3; i++) {
      const r = d ? d.r[i] : null;
      const text = dark || !r || (r.sign === ' ' && !r.digits.trim())
        ? 'blank' : `${signWord(r.sign)}${r.digits.trim() || 'blank'}`;
      setSpotLabel(`r${i + 1}`, `Register ${i + 1}: ${text}`);
    }
    setSpotLabel('compacty', `COMP ACTY: ${ca ? 'lit' : 'off'}`);

    if (mode === 'demo') return;
    const key = dskyAnnounceKey(d, { software: variant });
    if (key !== liveKey || performance.now() - userKeyAt < USER_ECHO_MS) {
      announce(dskySummary(d, { software: variant }));
    }
    liveKey = key;
  }

  function render(snapshot, ui) {
    applyMode(ui?.mode ?? ctx.app?.mode ?? 'demo');
    const software = snapshot?.software || snapshot?.agc?.software || variant || 'Luminary099';
    applyVariant(software);
    const d = snapshot?.agc?.dsky || null;
    if (!d) {
      if (!poweredOff || dirty) {
        poweredOff = true;
        dirty = false;
        lastVersion = -1;
        apply(null);
      }
      return;
    }
    if (!dirty && !poweredOff && d.version === lastVersion) return;
    poweredOff = false;
    dirty = false;
    lastVersion = d.version;
    apply(d);
  }

  // ----- key press animation (pointer, keyboard, crew keystrokes) -----
  function pressVisual(key, source = 'user') {
    const entry = keyButtons.get(key);
    if (!entry) return;
    const { el } = entry;
    // Pure class state with a short transition — no forced reflow, so a burst
    // of crew keystrokes at high replay speed stays cheap.
    clearTimeout(entry.timer);
    el.classList.add('is-pressed');
    el.classList.toggle('is-crew', source === 'crew');
    entry.timer = setTimeout(() => {
      el.classList.remove('is-pressed', 'is-crew');
      entry.timer = null;
    }, PRESS_MS[source] || PRESS_MS.user);
  }

  // ----- physical keyboard -----
  function onKeyDown(e) {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target;
    if (isEditable(target) || isEditable(document.activeElement)) return;
    const key = KEYBOARD_MAP[e.key] ?? (e.key.length === 1 ? KEYBOARD_MAP[e.key.toLowerCase()] : undefined);
    if (!key) return;
    // Enter on a focused button/link keeps activating that control, and
    // keeps its own meaning in a scrolling panel (SCROLL_REGIONS).
    if (e.key === 'Enter' && (isActivatable(target) || isActivatable(document.activeElement)
      || inScrollRegion(target) || inScrollRegion(document.activeElement))) return;
    e.preventDefault();
    userPress(key);
  }

  // The app refuses user keys during a replay (it shows a toast instead);
  // only animate a key the computer actually received.
  function userPress(key) {
    const accepted = ctx.app?.pressKey?.(key);
    if (accepted !== false) {
      userKeyAt = performance.now();
      pressVisual(key, 'user');
    }
  }
  document.addEventListener('keydown', onKeyDown);

  if (bus) {
    offs.push(bus.on('key', (p = {}) => {
      if (p.source === 'crew') pressVisual(p.key, 'crew');
      else if (p.source === 'user' || p.source === undefined) {
        userKeyAt = performance.now();
        pressVisual(p.key, 'user');
      }
    }));
    // A new Simulation starts a new DskyState whose version restarts at 0:
    // force the next frame to redraw.
    const invalidate = () => { dirty = true; };
    offs.push(bus.on('sim:reset', invalidate));
    offs.push(bus.on('app:mode', invalidate));
  }

  applyVariant('Luminary099');
  render(null);

  return {
    render,
    destroy() {
      document.removeEventListener('keydown', onKeyDown);
      for (const off of offs) off();
      clearTimeout(liveTimer);
      for (const entry of keyButtons.values()) clearTimeout(entry.timer);
      root.textContent = '';
    },
  };
}

// Replay shortcuts (controls-view.js and the timeline slider in
// timeline-view.js handle them; listed here so they are documented).
const REPLAY_KEYS = [
  ['Play / pause', ['Space']],
  ['Prev / next chapter', ['←', '→']],
  ['Slower / faster', ['[', ']']],
];
const TIMELINE_KEYS = [
  ['±5 s', ['←', '→']],
  ['±30 s', ['Shift ←', 'Shift →']],
  ['Prev / next chapter', ['PgDn', 'PgUp']],
  ['Start / end', ['Home', 'End']],
];

// Shortcut legend: the DSKY part is generated from KEYBOARD_MAP so it never
// drifts from it.
function buildLegend(container) {
  const order = ['VERB', 'NOUN', '+', '-', 'DIGITS', 'CLR', 'PRO', 'KEY REL', 'ENTR', 'RSET'];
  const names = {
    VERB: 'VERB', NOUN: 'NOUN', '+': '+', '-': '−', DIGITS: '0–9',
    CLR: 'CLR', PRO: 'PRO', 'KEY REL': 'KEY REL', ENTR: 'ENTR', RSET: 'RSET',
  };
  const byKey = new Map(order.map((k) => [k, []]));
  for (const [physical, dsky] of Object.entries(KEYBOARD_MAP)) {
    const group = /^[0-9]$/.test(dsky) ? 'DIGITS' : dsky;
    if (group === 'DIGITS') continue;
    const label = physical.length === 1 ? physical.toUpperCase() : physical;
    byKey.get(group)?.push(label);
  }
  byKey.set('DIGITS', ['0–9']);
  const section = (title, rows) => {
    htmlEl('p', { class: 'dsky-legend-h', text: title }, container);
    const dl = htmlEl('dl', {}, container);
    for (const [name, keys] of rows) {
      const row = htmlEl('div', {}, dl);
      htmlEl('dt', { text: name }, row);
      const dd = htmlEl('dd', {}, row);
      keys.forEach((label, i) => {
        if (i) dd.append(' ');
        htmlEl('kbd', { text: label }, dd);
      });
    }
  };
  section('DSKY keys', order.map((k) => [names[k], byKey.get(k)]));
  section('Replay', REPLAY_KEYS);
  section('Timeline slider (focused)', TIMELINE_KEYS);
  htmlEl('p', {
    class: 'dsky-legend-note',
    text: 'DSKY keys work anywhere on the page except in text fields; in the source listing and the transcript, '
      + 'Enter, Space and the arrows keep their usual meaning. Ctrl, Alt and Cmd combinations are ignored. '
      + 'In Interactive mode, Space pauses the simulation and [ ] change its speed.',
  }, container);
}
