// Instruments view: compact LM-style readouts for the left column.
//
// Two vertical tape meters (altitude on a log scale, altitude rate on an
// asinh scale — the LM's ALT/ALT RATE tapes read across the whole descent
// the same way: fine near zero, coarse far out), a table of Truth vs AGC
// values, throttle (commanded vs actual), DPS propellant with the
// low-level and Bingo marks, thrust/mass, landing-radar data-good status,
// PGNS mode and the TIG countdown while BURNBABY is armed.
// For the Command Module (Comanche055) the SPS-burn readouts replace them.
//
// "Truth" is the simulated vehicle (`snapshot.vehicle`, ARCHITECTURE §8);
// "AGC" is the computer's own navigated estimate (`snapshot.agc.nav`),
// which differs from the truth until landing-radar data are incorporated
// (Apollo 11: ΔH ≈ −2,900 ft at radar lock-on, research/web-timeline-b.md).
//
// Everything above `mountInstruments` is DOM-free (node:test imports it).

import { formatGET, formatMinSec, parseGET } from '../util/time.js';
import { NMI, toFt, toFps, LB, LBF, FPS } from '../util/units.js';

// ---------- constants (with sources) ----------

// DPS low-level sensor trips at 5.6 % in any tank (AER-DPS p.6). At that
// point ~116 s of firing time remained, and the land-or-abort ("Bingo")
// decision falls when 20 s remain (MR §9.8.3) — both via
// research/web-trajectory-b.md §1.3. Bingo as a propellant fraction is
// DERIVED here assuming a constant (hover) burn rate: 5.6 % × 20/116.
export const LOW_LEVEL_FRAC = 0.056;
export const BINGO_FRAC = LOW_LEVEL_FRAC * (20 / 116);
// The ground counted 94 s from the low-level light to Bingo (ALSJ, Fjeld;
// research/web-timeline-b.md D17).
export const BINGO_AFTER_LOW_LEVEL = 94;
// Apollo 11's light latched at 102:44:28 (MR Table 5-I), ~20 s early because
// of propellant slosh — so replays use the historical time, not the gauge.
export const LOW_LEVEL_GET_A11 = parseGET('102:44:28');

// Throttle marks as fractions of the 10,500 lbf design thrust:
// minimum ≈10 % (THROTTLE_CONTROL_ROUTINES.agc:63-65 "THROTTLING IN THE REGION
// 10% - 94% ... THE MANUAL THROTTLE ... PROVIDES THE LOWER BOUND"; MR §9.8.1
// measured 13 %); FTP 92.5 % (AER-DPS p.7; the LGC models 93.0 %, FMAXPOS
// in CONTROLLED_CONSTANTS.agc); throttle recovery/advance thresholds
// LOWCRIT 57 % / HIGHCRIT 63 % (Apollo 11 pad load) — all via
// research/web-trajectory-b.md §1.2.
export const THROTTLE_MIN = 0.10;
export const THROTTLE_FTP = 0.925;
export const THROTTLE_LOWCRIT = 0.57;
export const THROTTLE_HIGHCRIT = 0.63;

const LUNAR_G = 1.625; // m/s², μ/R² from util/units.js MOON_MU / MOON_RADIUS²

// ---------- pure helpers ----------

const GROUP = /\B(?=(\d{3})+(?!\d))/g;

export function fmtNum(v, digits = 0) {
  if (!Number.isFinite(v)) return '—';
  const fixed = Math.abs(v).toFixed(digits);
  const [int, frac] = fixed.split('.');
  const s = int.replace(GROUP, ',') + (frac ? `.${frac}` : '');
  return v < 0 && Number(fixed) !== 0 ? `−${s}` : s;
}

// Signed with an explicit + (rates), using a true minus sign.
export function fmtSigned(v, digits = 0) {
  if (!Number.isFinite(v)) return '—';
  const s = fmtNum(v, digits);
  return v > 0 && Number(Math.abs(v).toFixed(digits)) !== 0 ? `+${s}` : s;
}

// Altitude tape: log10(1 + h/10) — 0..10 ft and 10,000..60,000 ft both get
// usable space. Returns 0..1 (clamped).
export const ALT_TAPE_MAX_FT = 60000;
export function altTapePos(ft) {
  if (!Number.isFinite(ft)) return 0;
  const f = (x) => Math.log10(1 + Math.max(0, x) / 10);
  return Math.min(1, f(ft) / f(ALT_TAPE_MAX_FT));
}

// Altitude-rate tape: asinh(v/k) / asinh(max/k), in −1..1 (clamped).
export const RATE_TAPE_MAX_FPS = 300;
export const RATE_TAPE_K = 5;
export function rateTapePos(fps) {
  if (!Number.isFinite(fps)) return 0;
  const p = Math.asinh(fps / RATE_TAPE_K) / Math.asinh(RATE_TAPE_MAX_FPS / RATE_TAPE_K);
  return Math.max(-1, Math.min(1, p));
}

export function formatRangeShort(m) {
  if (!Number.isFinite(m)) return { v: '—', u: '' };
  const ft = toFt(m);
  if (Math.abs(ft) >= 20000) return { v: fmtNum(m / NMI, Math.abs(m / NMI) >= 100 ? 0 : 1), u: 'nmi' };
  return { v: fmtNum(ft), u: 'ft' };
}

export function pct(frac, digits = 0) {
  return Number.isFinite(frac) ? `${fmtNum(frac * 100, digits)}%` : '—';
}

// Bingo countdown (s) after the low-level light; null before it.
export function bingoRemaining(lowLevelT, t) {
  if (!Number.isFinite(lowLevelT) || !Number.isFinite(t) || t < lowLevelT) return null;
  return lowLevelT + BINGO_AFTER_LOW_LEVEL - t;
}

export const BURN_PHASE_LABELS = Object.freeze({
  pre: 'pre-ignition',
  'avg-g': 'Average-G running',
  ullage: 'ullage',
  v99: 'V99 — awaiting PRO',
  ignition: 'ignition',
  trim: 'trim (minimum thrust)',
  'throttle-up': 'throttle-up',
  burning: 'burning',
  cutoff: 'cutoff',
  done: 'complete',
});

// "TIG −00:35 · Average-G running" style countdown text, or null.
export function tigCountdown(burn, t) {
  if (!burn || !Number.isFinite(burn.tig) || !Number.isFinite(t)) return null;
  if (burn.phase === 'done') return null;
  const rel = t - burn.tig;
  const clock = formatMinSec(rel).replace('-', '−');
  const phase = BURN_PHASE_LABELS[burn.phase] || burn.phase || '';
  return `TIG ${clock}${phase ? ` · ${phase}` : ''}`;
}

export function pgnsModeLabel(mode) {
  if (mode === 'attHold') return 'ATT HOLD';
  if (mode === 'auto') return 'AUTO';
  return '—';
}

// "169.7 × 60.0" (apocynthion × pericynthion altitudes, nmi) or
// "hyperbolic · peri 61.5" before orbit insertion.
export function orbitText(orbit) {
  if (!orbit || !Number.isFinite(orbit.peri)) return '—';
  const nmi = (m) => fmtNum(m / NMI, 1);
  if (!Number.isFinite(orbit.apo)) return `hyperbolic · peri ${nmi(orbit.peri)}`;
  return `${nmi(orbit.apo)} × ${nmi(orbit.peri)}`;
}

// First finite value among `names` in an object (erasable name variants).
export function pick(obj, names) {
  if (!obj) return null;
  for (const n of names) if (Number.isFinite(obj[n])) return obj[n];
  return null;
}

// ---------- tapes (SVG markup builders, DOM-free strings) ----------

const TAPE = { w: 64, h: 196, top: 8, bottom: 188 };

function tapeY(pos01) {
  return TAPE.bottom - pos01 * (TAPE.bottom - TAPE.top);
}

export function altTapeTicks() {
  const majors = [0, 10, 100, 1000, 10000, 50000];
  const minors = [2, 5, 20, 50, 200, 500, 2000, 5000, 20000];
  return {
    majors: majors.map((v) => ({ v, y: tapeY(altTapePos(v)), label: v >= 1000 ? `${v / 1000}k` : String(v) })),
    minors: minors.map((v) => ({ v, y: tapeY(altTapePos(v)) })),
  };
}

export function rateTapeTicks() {
  const mid = (TAPE.top + TAPE.bottom) / 2;
  const half = (TAPE.bottom - TAPE.top) / 2;
  const y = (v) => mid - rateTapePos(v) * half;
  const majors = [-200, -50, -10, 0, 10, 50, 200];
  const minors = [-100, -20, -5, 5, 20, 100];
  return {
    majors: majors.map((v) => ({ v, y: y(v), label: v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0' })),
    minors: minors.map((v) => ({ v, y: y(v) })),
    mid,
    half,
  };
}

function tapeSvg(kind, title) {
  const ticks = kind === 'alt' ? altTapeTicks() : rateTapeTicks();
  const lines = [];
  for (const t of ticks.minors) lines.push(`<line x1="40" x2="46" y1="${t.y.toFixed(1)}" y2="${t.y.toFixed(1)}" class="tape-minor"/>`);
  for (const t of ticks.majors) {
    lines.push(`<line x1="36" x2="46" y1="${t.y.toFixed(1)}" y2="${t.y.toFixed(1)}" class="tape-major"/>`);
    lines.push(`<text x="33" y="${(t.y + 3).toFixed(1)}" class="tape-label">${t.label}</text>`);
  }
  const zeroY = kind === 'alt' ? TAPE.bottom : ticks.mid;
  return `<svg class="tape-svg" viewBox="0 0 ${TAPE.w} ${TAPE.h}" role="img" aria-label="${title}" focusable="false">
    <rect x="38" y="${TAPE.top}" width="10" height="${TAPE.bottom - TAPE.top}" rx="2" class="tape-track"/>
    <rect x="38" y="${zeroY}" width="10" height="0" class="tape-fill" data-role="fill"/>
    ${lines.join('')}
    <g data-role="agc" class="tape-agc" transform="translate(0 ${zeroY})"><path d="M36 0 l-6 -4 v8 z"/></g>
    <g data-role="truth" class="tape-truth" transform="translate(0 ${zeroY})"><path d="M49 0 l8 -5 v10 z"/></g>
  </svg>`;
}

// ---------- mount ----------

export function mountInstruments(root, ctx) {
  const { bus, app } = ctx;

  root.innerHTML = `
    <h2 class="panel-title"><span>Instruments</span><span class="inst-get" data-k="get">GET —</span></h2>
    <div class="inst" data-spot="inst">
      <p class="inst-empty" data-role="empty" hidden></p>
      <div class="inst-lm" data-role="lm">
        <div class="inst-top">
          <figure class="tape" data-spot="inst.alt">
            <figcaption>ALT</figcaption>
            ${tapeSvg('alt', 'Altitude tape, logarithmic scale')}
          </figure>
          <figure class="tape" data-spot="inst.altrate">
            <figcaption>ALT RATE</figcaption>
            ${tapeSvg('rate', 'Altitude-rate tape, compressed scale')}
          </figure>
          <table class="inst-table">
            <caption class="visually-hidden">Vehicle truth versus the AGC's estimate</caption>
            <thead><tr><th scope="col"><span class="visually-hidden">Quantity</span></th><th scope="col" title="The simulated vehicle">Truth</th><th scope="col" title="The computer's navigated estimate">AGC</th></tr></thead>
            <tbody>
              <tr><th scope="row">Altitude <span class="u">ft</span></th><td data-k="alt">—</td><td data-k="altAgc">—</td></tr>
              <tr><th scope="row">Alt rate <span class="u">ft/s</span></th><td data-k="rate">—</td><td data-k="rateAgc">—</td></tr>
              <tr><th scope="row">Horiz vel <span class="u">ft/s</span></th><td data-k="vh">—</td><td data-k="vhAgc">—</td></tr>
              <tr><th scope="row">Range <span class="u" data-k="rangeU">nmi</span></th><td data-k="range">—</td><td data-k="rangeAgc">—</td></tr>
              <tr class="inst-dh"><th scope="row" title="Landing-radar altitude minus the AGC's altitude (N68 R3)">ΔH <span class="u">ft</span></th><td colspan="2" data-k="dh">—</td></tr>
            </tbody>
          </table>
        </div>

        <div class="inst-bar-row" data-spot="inst.throttle">
          <div class="inst-bar-head"><span class="inst-label">Throttle</span><span class="inst-val"><span data-k="thrCmd">cmd —</span> · <span data-k="thrAct">act —</span></span></div>
          <div class="ibar" role="meter" aria-label="DPS throttle" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-role="thrBar">
            <span class="ibar-band" style="left:${THROTTLE_LOWCRIT * 100}%;width:${(THROTTLE_HIGHCRIT - THROTTLE_LOWCRIT) * 100}%" title="Throttle recovery / advance thresholds (LOWCRIT 57 %, HIGHCRIT 63 %, Apollo 11 pad load)"></span>
            <span class="ibar-fill" data-role="thrFill"></span>
            <span class="ibar-cmd" data-role="thrCmd" title="Commanded by the AGC"></span>
            <span class="ibar-mark" style="left:${THROTTLE_MIN * 100}%" title="Minimum throttle ≈10 % (MR measured 13 %)"></span>
            <span class="ibar-mark" style="left:${THROTTLE_FTP * 100}%" title="Fixed throttle position ≈92.5 %"></span>
          </div>
          <div class="ibar-scale" aria-hidden="true"><span style="left:${THROTTLE_MIN * 100}%">MIN</span><span style="left:${(THROTTLE_LOWCRIT + THROTTLE_HIGHCRIT) * 50}%">57–63</span><span style="left:${THROTTLE_FTP * 100}%">FTP</span></div>
        </div>

        <div class="inst-bar-row" data-spot="inst.fuel">
          <div class="inst-bar-head"><span class="inst-label">DPS propellant</span><span class="inst-val" data-k="fuel">—</span></div>
          <div class="ibar ibar-fuel" role="meter" aria-label="DPS propellant remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-role="fuelBar">
            <span class="ibar-fill" data-role="fuelFill"></span>
            <span class="ibar-mark ibar-mark-low" style="left:${LOW_LEVEL_FRAC * 100}%" title="Low-level light: 5.6 % in any tank"></span>
          </div>
          <div class="inst-bar-head inst-reserve-head"><span class="inst-label">Last 10 %</span><span class="inst-val" data-k="bingo"></span></div>
          <div class="ibar ibar-reserve" aria-hidden="true">
            <span class="ibar-fill" data-role="resFill"></span>
            <span class="ibar-mark ibar-mark-low" style="left:${LOW_LEVEL_FRAC * 1000}%"></span>
            <span class="ibar-mark ibar-mark-bingo" style="left:${BINGO_FRAC * 1000}%"></span>
          </div>
          <div class="ibar-scale" aria-hidden="true"><span style="left:${BINGO_FRAC * 1000}%">BINGO</span><span style="left:${LOW_LEVEL_FRAC * 1000}%">LOW LEVEL</span></div>
        </div>

        <dl class="inst-grid">
          <div><dt>Thrust</dt><dd><span data-k="thrust">—</span> <span class="u">lbf</span></dd></div>
          <div><dt>Mass</dt><dd><span data-k="mass">—</span> <span class="u">lb</span></dd></div>
          <div><dt>Thrust/mass</dt><dd><span data-k="accel">—</span> <span class="u">ft/s²</span></dd></div>
          <div><dt>PGNS mode</dt><dd data-k="pgns">—</dd></div>
        </dl>

        <div class="inst-lr">
          <span class="inst-label" title="Landing radar">LR</span>
          <span class="lamp" data-k="lrAlt" data-on="false"><span class="lamp-dot" aria-hidden="true"></span>ALT</span>
          <span class="lamp" data-k="lrVel" data-on="false"><span class="lamp-dot" aria-hidden="true"></span>VEL</span>
          <span class="inst-lr-inc" data-k="lrInc">—</span>
        </div>
        <p class="inst-foot"><span data-k="prog">—</span><span class="inst-tig" data-k="tig" hidden></span></p>
      </div>

      <div class="inst-cm" data-role="cm" hidden>
        <dl class="inst-grid inst-grid-cm">
          <div><dt>VG <span class="u">ft/s</span></dt><dd data-k="cmVg">—</dd></div>
          <div><dt>ΔV accum. <span class="u">ft/s</span></dt><dd data-k="cmDv">—</dd></div>
          <div><dt data-k="cmTimeLabel">Burn time</dt><dd data-k="cmTime">—</dd></div>
          <div><dt>Mass <span class="u">lb</span></dt><dd data-k="cmMass">—</dd></div>
          <div><dt>SPS thrust <span class="u">lbf</span></dt><dd data-k="cmThrust">—</dd></div>
          <div><dt>Engine</dt><dd data-k="cmEngine">—</dd></div>
          <div><dt>Altitude <span class="u">nmi</span></dt><dd data-k="cmAlt">—</dd></div>
          <div><dt>Speed <span class="u">ft/s</span></dt><dd data-k="cmSpeed">—</dd></div>
          <div class="inst-wide"><dt>Orbit <span class="u">apo × peri, nmi</span></dt><dd data-k="cmOrbit">—</dd></div>
        </dl>
        <div class="inst-bar-row">
          <div class="inst-bar-head"><span class="inst-label">VG to go</span><span class="inst-val" data-k="cmVgPct">—</span></div>
          <div class="ibar" role="meter" aria-label="Velocity to be gained, fraction remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-role="cmVgBar"><span class="ibar-fill ibar-fill-cm" data-role="cmVgFill"></span></div>
        </div>
        <p class="inst-foot"><span data-k="cmProg">—</span><span class="inst-tig" data-k="cmTig" hidden></span></p>
      </div>
      <p class="inst-note">Truth = the simulated vehicle; AGC = the computer’s own navigated estimate (what the DSKY shows).</p>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const K = {};
  for (const node of root.querySelectorAll('[data-k]')) K[node.dataset.k] = node;
  const el = {
    empty: q('[data-role="empty"]'),
    lm: q('[data-role="lm"]'),
    cm: q('[data-role="cm"]'),
    altTape: q('[data-spot="inst.alt"] svg'),
    rateTape: q('[data-spot="inst.altrate"] svg'),
    thrBar: q('[data-role="thrBar"]'),
    thrFill: q('[data-role="thrFill"]'),
    thrCmd: q('[data-role="thrCmd"]'),
    fuelBar: q('[data-role="fuelBar"]'),
    fuelFill: q('[data-role="fuelFill"]'),
    resFill: q('[data-role="resFill"]'),
    cmVgBar: q('[data-role="cmVgBar"]'),
    cmVgFill: q('[data-role="cmVgFill"]'),
  };
  const tapes = {
    alt: { fill: el.altTape.querySelector('[data-role="fill"]'), truth: el.altTape.querySelector('[data-role="truth"]'), agc: el.altTape.querySelector('[data-role="agc"]') },
    rate: { fill: el.rateTape.querySelector('[data-role="fill"]'), truth: el.rateTape.querySelector('[data-role="truth"]'), agc: el.rateTape.querySelector('[data-role="agc"]') },
  };
  const rateTicks = rateTapeTicks();

  const cache = new Map();
  const set = (key, text) => {
    if (cache.get(key) === text) return;
    cache.set(key, text);
    if (K[key]) K[key].textContent = text;
  };
  const setAttr = (node, key, attr, value) => {
    const ck = `${key}@${attr}`;
    if (cache.get(ck) === value) return;
    cache.set(ck, value);
    if (value === null) node.removeAttribute(attr); else node.setAttribute(attr, value);
  };
  const setStyle = (node, key, prop, value) => {
    const ck = `${key}#${prop}`;
    if (cache.get(ck) === value) return;
    cache.set(ck, value);
    node.style[prop] = value;
  };
  const setHidden = (node, key, hidden) => {
    const ck = `${key}!hidden`;
    if (cache.get(ck) === hidden) return;
    cache.set(ck, hidden);
    node.hidden = hidden;
  };

  // Live per-run state (physics runs detect the low-level light themselves;
  // CM burns need the ignition time and the VG at ignition).
  let run = freshRun();
  function freshRun() {
    return {
      lowLevelT: null, prevFuel: null, ignitionT: null, cutoffT: undefined,
      vgAtIgn: null, vgPre: null, prevEngine: false, lastT: null,
    };
  }
  const offs = [
    bus.on('sim:reset', () => { run = freshRun(); }),
    bus.on('app:mode', () => { run = freshRun(); }),
  ];

  function vehicleKind() {
    try {
      return app?.currentSim?.()?.options?.vehicle ?? null;
    } catch {
      return null;
    }
  }

  function render(snap) {
    if (!snap) {
      set('get', 'GET —');
      setHidden(el.empty, 'empty', false);
      if (cache.get('emptyMsg') !== 'none') {
        cache.set('emptyMsg', 'none');
        el.empty.textContent = 'No simulation running.';
      }
      setHidden(el.lm, 'lm', true);
      setHidden(el.cm, 'cm', true);
      return;
    }
    set('get', `GET ${formatGET(snap.t)}`);
    if (run.lastT !== null && snap.t < run.lastT - 1e-6) run = freshRun();
    run.lastT = snap.t;
    const isCm = snap.software === 'Comanche055';
    const v = snap.vehicle || {};
    const parked = vehicleKind() === 'static';
    const msg = parked ? 'Vehicle parked: this preset drives the DSKY only, so there are no flight readouts.' : null;
    setHidden(el.empty, 'empty', !msg);
    if (msg && cache.get('emptyMsg') !== msg) {
      cache.set('emptyMsg', msg);
      el.empty.textContent = msg;
    }
    setHidden(el.lm, 'lm', isCm || parked);
    setHidden(el.cm, 'cm', !isCm || parked);
    if (parked) return;
    if (isCm) renderCm(snap, v);
    else renderLm(snap, v);
  }

  function renderLm(snap, v) {
    const agc = snap.agc || {};
    const nav = agc.nav || {};
    const er = agc.erasable || {};

    // Table.
    const altFt = toFt(v.alt);
    const altAgcFt = toFt(nav.alt);
    set('alt', fmtNum(altFt));
    set('altAgc', fmtNum(altAgcFt));
    set('rate', fmtSigned(toFps(v.altRate), Math.abs(toFps(v.altRate)) < 10 ? 1 : 0));
    set('rateAgc', fmtSigned(toFps(nav.altRate), Math.abs(toFps(nav.altRate)) < 10 ? 1 : 0));
    set('vh', fmtNum(toFps(v.vHoriz), Math.abs(toFps(v.vHoriz)) < 10 ? 1 : 0));
    set('vhAgc', fmtNum(toFps(nav.vHoriz), Math.abs(toFps(nav.vHoriz)) < 10 ? 1 : 0));
    const rg = formatRangeShort(v.range);
    set('rangeU', rg.u || 'nmi');
    set('range', rg.v);
    const rgA = Number.isFinite(nav.range) ? (rg.u === 'nmi' ? fmtNum(nav.range / NMI, Math.abs(nav.range / NMI) >= 100 ? 0 : 1) : fmtNum(toFt(nav.range))) : '—';
    set('rangeAgc', rgA);
    // ΔH: the erasable DELTAH (display units, ft) when the program keeps it;
    // otherwise LR altitude − AGC altitude while the radar has data.
    let dh = pick(er, ['DELTAH']);
    if (dh === null && v.lr?.altValid && Number.isFinite(v.lr.alt) && Number.isFinite(nav.alt)) dh = toFt(v.lr.alt - nav.alt);
    set('dh', dh === null ? '— (no LR data)' : fmtSigned(dh));

    // Tapes.
    moveTape(tapes.alt, 'alt', tapeY(altTapePos(altFt)), tapeY(altTapePos(altAgcFt)), TAPE.bottom);
    const yr = (fps) => rateTicks.mid - rateTapePos(fps) * rateTicks.half;
    moveTape(tapes.rate, 'rate', yr(toFps(v.altRate)), yr(toFps(nav.altRate)), rateTicks.mid);

    // Throttle.
    const act = Number.isFinite(v.throttle) ? Math.max(0, Math.min(1, v.throttle)) : null;
    const cmd = Number.isFinite(agc.guidance?.throttleCmd) ? Math.max(0, Math.min(1, agc.guidance.throttleCmd)) : null;
    set('thrAct', `act ${act === null ? '—' : pct(v.engineOn ? act : 0)}`);
    set('thrCmd', `cmd ${cmd === null ? '—' : pct(cmd)}`);
    setStyle(el.thrFill, 'thrFill', 'width', `${((v.engineOn ? act : 0) || 0) * 100}%`);
    setAttr(el.thrBar, 'thrBar', 'aria-valuenow', String(Math.round(((v.engineOn ? act : 0) || 0) * 100)));
    setStyle(el.thrCmd, 'thrCmdM', 'left', `${(cmd ?? 0) * 100}%`);
    setHidden(el.thrCmd, 'thrCmdM', cmd === null);

    // Propellant.
    const fuel = Number.isFinite(v.fuelFrac) ? Math.max(0, Math.min(1, v.fuelFrac)) : null;
    set('fuel', fuel === null ? '—' : pct(fuel, 1));
    setStyle(el.fuelFill, 'fuelFill', 'width', `${(fuel ?? 0) * 100}%`);
    setAttr(el.fuelBar, 'fuelBar', 'aria-valuenow', fuel === null ? '0' : (fuel * 100).toFixed(1));
    setStyle(el.resFill, 'resFill', 'width', `${Math.min(1, (fuel ?? 0) / 0.1) * 100}%`);
    // Low-level light time: historical in replays, detected in physics runs.
    if (vehicleKind() === 'replay') run.lowLevelT = snap.t >= LOW_LEVEL_GET_A11 ? LOW_LEVEL_GET_A11 : null;
    else if (run.lowLevelT === null && fuel !== null && fuel <= LOW_LEVEL_FRAC && run.prevFuel !== null && run.prevFuel > LOW_LEVEL_FRAC) run.lowLevelT = snap.t;
    run.prevFuel = fuel;
    const bingo = v.landed ? null : bingoRemaining(run.lowLevelT, snap.t);
    const bingoText = bingo === null ? (run.lowLevelT !== null ? 'low-level light on' : '')
      : bingo > 0 ? `LOW LEVEL · Bingo in ${Math.ceil(bingo)} s` : 'BINGO — land within 20 s or abort';
    set('bingo', bingoText);
    setAttr(K.bingo, 'bingoState', 'data-state', bingo === null ? (run.lowLevelT !== null ? 'low' : 'none') : bingo > 0 ? 'low' : 'bingo');

    // Thrust, mass.
    set('thrust', Number.isFinite(v.thrust) ? fmtNum(v.thrust / LBF) : '—');
    set('mass', Number.isFinite(v.mass) ? fmtNum(v.mass / LB) : '—');
    set('accel', Number.isFinite(v.thrust) && v.mass > 0 ? fmtNum(v.thrust / v.mass / FPS, 1) : '—');
    set('pgns', pgnsModeLabel(agc.crew?.pgnsMode));

    // Landing radar: data-good discretes (the DSKY ALT/VEL lamps are the
    // inverse — lit when the data are NOT good).
    const lrA = !!v.lr?.altValid;
    const lrV = !!v.lr?.velValid;
    setAttr(K.lrAlt, 'lrAltOn', 'data-on', String(lrA));
    setAttr(K.lrVel, 'lrVelOn', 'data-on', String(lrV));
    setAttr(K.lrAlt, 'lrAltT', 'title', lrA ? 'LR altitude data good' : 'No LR altitude data (DSKY ALT light on)');
    setAttr(K.lrVel, 'lrVelT', 'title', lrV ? 'LR velocity data good' : 'No LR velocity data (DSKY VEL light on)');
    const inc = nav.lrIncorporating;
    set('lrInc', inc === true ? 'AGC incorporating (V57)' : inc === false ? (lrA ? 'not incorporated (V57 not keyed)' : 'no data') : '—');

    const prog = Number.isFinite(agc.mode) ? `P${String(agc.mode).padStart(2, '0')}${agc.programName ? ` ${agc.programName}` : ''}` : '—';
    set('prog', prog);
    const tig = tigCountdown(agc.burn, snap.t);
    set('tig', tig || '');
    setHidden(K.tig, 'tigH', !tig);
  }

  function moveTape(tape, key, yTruth, yAgc, yZero) {
    const yt = Number.isFinite(yTruth) ? Math.round(yTruth * 4) / 4 : yZero;
    const ya = Number.isFinite(yAgc) ? Math.round(yAgc * 4) / 4 : null;
    setAttr(tape.truth, `${key}T`, 'transform', `translate(0 ${yt})`);
    setAttr(tape.agc, `${key}A`, 'transform', `translate(0 ${ya ?? yZero})`);
    setAttr(tape.agc, `${key}Av`, 'visibility', ya === null ? 'hidden' : 'visible');
    const top = Math.min(yt, yZero);
    setAttr(tape.fill, `${key}Fy`, 'y', String(top));
    setAttr(tape.fill, `${key}Fh`, 'height', String(Math.abs(yZero - yt)));
  }

  function renderCm(snap, v) {
    const agc = snap.agc || {};
    const er = agc.erasable || {};
    const burn = agc.burn;
    // Ignition edge (for the burn clock and the VG fraction).
    if (v.engineOn && !run.prevEngine && run.ignitionT === null) run.ignitionT = snap.t;
    run.prevEngine = !!v.engineOn;
    const ignEv = burn?.events?.find((e) => e && e.done && /ign/i.test(`${e.id} ${e.label}`) && Number.isFinite(e.t));
    const ignT = ignEv?.t ?? run.ignitionT;

    // Display quantities as PINBALL shows them (N40: time from ignition /
    // VG / ΔV accumulated) — names per the noun tables, values in display
    // units (ft/s); the vehicle's own fields are a fallback.
    const vg = pick(er, ['VGDISP', 'VG', 'VGTIG']) ?? (Number.isFinite(v.vg) ? toFps(v.vg) : null);
    // ΔV: the AGC's accumulated value when kept; else the vehicle's sensed
    // ΔV (CmSpsVehicle.dvSensed, m/s).
    const dv = pick(er, ['DVTOTAL', 'DELVTOT', 'DV']) ?? (Number.isFinite(v.dvSensed) ? toFps(v.dvSensed) : null);
    if (vg !== null && ignT !== null && run.vgAtIgn === null) run.vgAtIgn = Math.max(vg, 1);
    if (vg !== null && run.vgAtIgn === null && !v.engineOn) run.vgPre = vg;
    set('cmVg', vg === null ? '—' : fmtNum(vg, 1));
    set('cmDv', dv === null ? '—' : fmtNum(dv, 1));
    if (Number.isFinite(v.burnTime) && v.burnTime > 0) {
      set('cmTimeLabel', v.engineOn ? 'Burn time' : 'Burn length');
      set('cmTime', `${fmtNum(v.burnTime, 1)} s`);
    } else if (ignT !== null && snap.t >= ignT) {
      set('cmTimeLabel', v.engineOn ? 'Burn time' : 'Burn length');
      const end = v.engineOn ? snap.t : (run.cutoffT ?? snap.t);
      if (!v.engineOn && run.cutoffT === undefined) run.cutoffT = snap.t;
      set('cmTime', `${fmtNum(end - ignT, 1)} s`);
    } else {
      set('cmTimeLabel', 'Burn time');
      set('cmTime', '—');
    }
    set('cmMass', Number.isFinite(v.mass) ? fmtNum(v.mass / LB) : '—');
    set('cmThrust', Number.isFinite(v.thrust) ? fmtNum(v.engineOn ? v.thrust / LBF : 0) : '—');
    set('cmEngine', v.engineOn ? 'SPS ON' : 'off');
    set('cmAlt', Number.isFinite(v.alt) ? fmtNum(v.alt / NMI, 1) : '—');
    set('cmSpeed', Number.isFinite(v.speed) ? fmtNum(toFps(v.speed)) : '—');
    set('cmOrbit', orbitText(v.orbit));
    const ref = run.vgAtIgn ?? run.vgPre ?? null;
    const frac = vg !== null && ref ? Math.max(0, Math.min(1, vg / ref)) : null;
    set('cmVgPct', frac === null ? '—' : pct(frac));
    setStyle(el.cmVgFill, 'cmVgFill', 'width', `${(frac ?? 0) * 100}%`);
    setAttr(el.cmVgBar, 'cmVgBar', 'aria-valuenow', String(Math.round((frac ?? 0) * 100)));
    const prog = Number.isFinite(agc.mode) ? `P${String(agc.mode).padStart(2, '0')}${agc.programName ? ` ${agc.programName}` : ''}` : '—';
    set('cmProg', prog);
    const tig = tigCountdown(burn, snap.t);
    set('cmTig', tig || '');
    setHidden(K.cmTig, 'cmTigH', !tig);
  }

  return {
    render,
    destroy() {
      for (const off of offs) off();
      root.innerHTML = '';
    },
  };
}
