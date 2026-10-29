// Ignition view: the BURNBABY timeline.
//
// While the master ignition routine is armed (`snapshot.agc.burn`), shows a
// horizontal timeline from TIG−60 s to TIG+40 s (or past cutoff for long
// burns, with the post-ignition part compressed) with the routine's events
// (`burn.events`: { id, label, rel, t, done, anchor }) as clickable markers,
// the current time, the phase, and lanes for what the DSKY shows, Average-G
// (SERVICER every 2 s), RCS ullage and the engine/throttle profile — the
// planned profile from the source plus the actual throttle trace.
// Clicking an event shows its source lines (`'source:show'`).
// With no burn armed, explains BURNBABY and its table-driven design (the
// `WHICH` table) with a button that opens the tables in the source panel.
//
// Times below are from Luminary099/BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc
// (abbreviated BBB) as decoded in research/src-ignition.md §6–7; the CM
// lanes from Comanche055/P40-P47.agc (§15). Everything above `mountIgnition`
// is DOM-free so node:test can import it.

import { formatGET, formatMinSec } from '../util/time.js';

// ---------- canonical schedules (source-derived, relative to TIG) ----------

// The noun of the countdown display is BURNBABY table entry (0) (BBB:74,88,
// 112,127,142); the post-ignition display is the program's own.
const LM_NOUNS = { 63: '62', 40: '40', 42: '40', 12: '74' };
const LM_POST = { 63: 'V06N63', 40: 'V06N40', 42: 'V06N40', 12: 'V06N74' };
// Ullage start in cs after the TIG−30 task (table entry (6), BBB:95,118,133):
// 2240 cs → TIG−7.5 s; 2640 → TIG−3.5 s (P42); 0 → none (P12). Ullage off
// 50 cs after ignition (ULLAGOFF, BBB:530-533).
const LM_ULLAGE = { 63: -7.5, 40: -7.5, 42: -3.5, 12: null };

// Throttle levels as fractions of rated thrust. FTP 0.925 (AER-DPS; see
// instruments-view.js); minimum ≈0.10 (MR measured 0.13).
const MIN_T = 0.1;
const FTP_T = 0.925;

export function burnTitle(program, software) {
  if (software === 'Comanche055') return `P40 · SPS burn (Comanche 055)`;
  const names = { 63: 'P63 · powered descent initiation', 40: 'P40 · DPS burn', 42: 'P42 · APS burn', 12: 'P12 · powered ascent' };
  return names[program] || (Number.isFinite(program) ? `P${program}` : 'Burn');
}

// Lanes & planned throttle profile for a program. `end` is the rel time
// (s) where the timeline should stop being interesting (cutoff + margin).
export function ignitionSchedule(program, software, { cutoffRel = null } = {}) {
  const lanes = [];
  let throttle = [];
  let notes = [];
  if (software === 'Comanche055') {
    // TIGBLNK blanks at TIG−35 ("CALL TIGAVEG IN FIVE SEC AT TIG-30",
    // Comanche055/P40-P47.agc:350); TIGAVEG "UNBLANK DISPLAY" at TIG−30
    // (:456-466); TIG-5 "WILL CAUSE V99 FLASH" (:480-486); SPSON (:526).
    const end = cutoffRel ?? 40;
    lanes.push({
      id: 'dsky', label: 'DSKY', segments: [
        { from: -Infinity, to: -35, text: 'V06N40 countdown', kind: 'disp' },
        { from: -35, to: -30, text: 'blank', kind: 'blank' },
        { from: -30, to: -5, text: 'V06N40', kind: 'disp' },
        { from: -5, to: 0, text: 'V99N40 — PRO?', kind: 'flash' },
        { from: 0, to: end, text: 'V06N40 · TTOGO to cutoff', kind: 'disp' },
      ],
    });
    lanes.push({ id: 'avg', label: 'Avg-G', segments: [{ from: -30, to: Infinity, text: 'SERVICER every 2 s', kind: 'avg', ticks: 2 }] });
    throttle = [{ from: -Infinity, to: 0, level: 0 }, { from: 0, to: end, level: 1 }, { from: end, to: Infinity, level: 0 }];
    notes = ['SPS: fixed thrust (not throttleable).'];
    const sequence = 'DSKY: V06N40 countdown → blank at TIG−35 → V06N40 again at TIG−30 (Average-G running) → V99N40 flashing at TIG−5 until PRO → V06N40 counting to cutoff.';
    return { lanes, throttle, throttleLabel: 'SPS', notes, end, sequence };
  }
  const noun = LM_NOUNS[program] || '62';
  const post = LM_POST[program] || 'V06N63';
  lanes.push({
    id: 'dsky', label: 'DSKY', segments: [
      // CALLT-35 starts the V06Nxx countdown after the pre-ignition
      // integration (BBB:222-246); TIG−35 blanks it for 5 s "TO INDICATE
      // THAT AVERAGE G IS STARTING" (BBB:250-263, 784-788); TIG−30 restores
      // it (BBB:292-315); TIG−5 flashes V99 (DISPCHNG, BBB:354-386, 768-781).
      { from: -Infinity, to: -35, text: `V06N${noun} countdown`, kind: 'disp' },
      { from: -35, to: -30, text: 'blank', kind: 'blank' },
      { from: -30, to: -5, text: `V06N${noun}`, kind: 'disp' },
      { from: -5, to: 0, text: `V99N${noun} — PRO?`, kind: 'flash' },
      { from: 0, to: Infinity, text: post, kind: 'disp' },
    ],
  });
  // Average-G starts at TIG−29.9 (PREREAD from the TIG−30 task, BBB:339-343);
  // READACCS every 2 s (SERVICER.agc:79-139).
  lanes.push({ id: 'avg', label: 'Avg-G', segments: [{ from: -29.9, to: Infinity, text: 'SERVICER every 2 s', kind: 'avg', ticks: 2, tick0: -29.9 }] });
  const ull = LM_ULLAGE[program];
  if (ull !== null && ull !== undefined) {
    lanes.push({ id: 'rcs', label: 'RCS', segments: [{ from: ull, to: 0.5, text: 'ullage +X', kind: 'rcs' }] });
  }
  if (program === 63) {
    // Ignition at minimum thrust; P63ZOOM at TIG+ZOOMTIME (26 s) connects
    // landing guidance and calls FLATOUT → FTP (BBB:390-400, 564-584;
    // THROTTLE_CONTROL_ROUTINES.agc:189-198).
    throttle = [
      { from: -Infinity, to: 0, level: 0 },
      { from: 0, to: 26, level: MIN_T, text: 'trim ≈10 %' },
      { from: 26, to: Infinity, level: FTP_T, text: 'FTP' },
    ];
    notes = ['26 s at minimum thrust while the gimbal trims through the centre of mass, then throttle-up to the fixed throttle position.'];
  } else if (program === 40) {
    // P40ZOOM only when NOTHROTL is clear, i.e. S40.13 found the burn would
    // last ≥ 95 s at minimum thrust (BBB:472-487; P40-P47.agc:1000-1111).
    const end = cutoffRel ?? Infinity;
    const long = Number.isFinite(cutoffRel) ? cutoffRel >= 95 : true;
    throttle = [{ from: -Infinity, to: 0, level: 0 }, { from: 0, to: long ? 26 : end, level: MIN_T, text: 'min' }];
    if (long) throttle.push({ from: 26, to: end, level: FTP_T, text: 'FTP' });
    if (Number.isFinite(end)) throttle.push({ from: end, to: Infinity, level: 0 });
    notes = ['P40 throttles up at +26 s only for long burns (S40.13 sets NOTHROTL otherwise).'];
  } else if (program === 42 || program === 12) {
    const end = cutoffRel ?? Infinity;
    throttle = [{ from: -Infinity, to: 0, level: 0 }, { from: 0, to: end, level: 1, text: 'APS' }];
    if (Number.isFinite(end)) throttle.push({ from: end, to: Infinity, level: 0 });
    notes = ['APS: fixed thrust (not throttleable).'];
  }
  const sequence = `DSKY: V06N${noun} countdown → blank at TIG−35 (Average-G starting) → V06N${noun} at TIG−30 → V99N${noun} flashing at TIG−5 until PRO → ${post} after ignition.`;
  return { lanes, throttle, throttleLabel: program === 42 || program === 12 ? 'APS' : 'DPS', notes, end: cutoffRel ?? 40, sequence };
}

// ---------- scales ----------

// Piecewise-linear map from `domain` stops (increasing) to `range` stops.
// Clamps outside. `.invert` maps back.
export function makePiecewiseScale(domain, range) {
  const n = Math.min(domain.length, range.length);
  const f = (v) => {
    if (!(n >= 2)) return range[0] ?? 0;
    if (v <= domain[0]) return range[0];
    for (let i = 1; i < n; i++) {
      if (v <= domain[i]) {
        const k = (v - domain[i - 1]) / ((domain[i] - domain[i - 1]) || 1);
        return range[i - 1] + k * (range[i] - range[i - 1]);
      }
    }
    return range[n - 1];
  };
  f.invert = (p) => {
    if (p <= range[0]) return domain[0];
    for (let i = 1; i < n; i++) {
      if (p <= range[i]) {
        const k = (p - range[i - 1]) / ((range[i] - range[i - 1]) || 1);
        return domain[i - 1] + k * (domain[i] - domain[i - 1]);
      }
    }
    return domain[n - 1];
  };
  f.domain = domain.slice(0, n);
  f.range = range.slice(0, n);
  return f;
}

// Timeline span: TIG−60 s … TIG+40 s, or past the last event for long
// burns (P40), whose post-ignition part is compressed into the last 38 %.
export function timelineScale(events = [], schedule = null) {
  const lo = -60;
  let hi = 40;
  for (const e of events) if (Number.isFinite(e?.rel)) hi = Math.max(hi, e.rel + 10);
  if (Number.isFinite(schedule?.end)) hi = Math.max(hi, schedule.end + 10);
  if (hi <= 70) return makePiecewiseScale([lo, hi], [0, 1]);
  return makePiecewiseScale([lo, 30, hi], [0, 0.62, 1]);
}

// Tick values for the timeline: every 5 s (labels every 10 s) in the linear
// part; nice steps in a compressed tail.
export function timelineTicks(scale) {
  const d = scale.domain;
  const out = [];
  const linEnd = d.length > 2 ? d[1] : d[d.length - 1];
  for (let v = Math.ceil(d[0] / 5) * 5; v <= linEnd + 1e-9; v += 5) out.push({ v, major: v % 10 === 0 });
  if (d.length > 2) {
    // At most ~3 labels in the compressed tail (it gets 38 % of the width).
    const span = d[2] - d[1];
    const step = [30, 60, 120, 180, 300, 600, 1200].find((s) => s >= span / 3) || 1200;
    for (let v = Math.ceil((d[1] + step * 0.6) / step) * step; v <= d[2] + 1e-9; v += step) out.push({ v, major: true });
  }
  return out;
}

export function fmtRel(rel) {
  if (!Number.isFinite(rel)) return '—';
  if (rel === 0) return 'TIG';
  const a = Math.abs(rel);
  const s = a >= 120 ? formatMinSec(a).replace('+', '').replace(/^0(\d:)/, '$1') : Number.isInteger(Math.round(a * 10) / 10) ? String(Math.round(a)) : a.toFixed(1);
  return `${rel < 0 ? '−' : '+'}${s}`;
}

// Greedy row assignment so markers at nearby positions (0..1) stack.
export function assignRows(positions, minGap = 0.075, maxRows = 4) {
  const rowsEnd = [];
  return positions.map((p) => {
    for (let r = 0; r < maxRows; r++) {
      if (rowsEnd[r] === undefined || p - rowsEnd[r] >= minGap) {
        rowsEnd[r] = p;
        return r;
      }
    }
    // All rows busy: reuse the one that ended earliest.
    let best = 0;
    for (let r = 1; r < maxRows; r++) if (rowsEnd[r] < rowsEnd[best]) best = r;
    rowsEnd[best] = p;
    return best;
  });
}

// Phase captions. LM texts follow BBB; the CM's own (not table-driven) P40
// countdown differs where noted (Comanche055/P40-P47.agc, research §15).
export function phaseText(phase, software) {
  if (software === 'Comanche055') {
    const cm = {
      'avg-g': ['Average-G running', 'TIGAVEG restored the display at TIG−30 s and started Average-G navigation (SERVICER every 2 s).'],
      v99: ['V99 — please enable engine', 'The DSKY flashes Verb 99 Noun 40. The SPS lights only after the crew keys PRO.'],
      ignition: ['Ignition', 'SPSON: the AGC sets channel 11 bit 13 and the SPS thrust builds up.'],
      burning: ['Burning', 'Powered flight: the AGC steers the SPS and counts down to cutoff (the SPS is not throttleable).'],
      trim: ['Burning', 'Powered flight: the AGC steers the SPS and counts down to cutoff.'],
    };
    if (cm[phase]) return cm[phase];
  }
  return PHASE_TEXT[phase] || [phase || '—', ''];
}

export const PHASE_TEXT = Object.freeze({
  pre: ['Countdown', 'BURNBABY has integrated the state vector to TIG−29.9 s and shows the countdown every second.'],
  'avg-g': ['Average-G running', 'SERVICER (Average-G navigation) runs every 2 s from TIG−30 s; the DSKY went blank for 5 s to announce it.'],
  ullage: ['Ullage', 'RCS jets fire +X to settle the propellant at the bottom of the tanks before the engine lights.'],
  v99: ['V99 — please enable engine', 'The DSKY flashes Verb 99. Nothing ignites until the crew keys PRO.'],
  ignition: ['Ignition', 'ENGINE ON: the AGC sets channel 11 bit 13.'],
  trim: ['Trim at minimum thrust', 'Minimum thrust for 26 s while the descent engine’s gimbal trims through the centre of mass; landing guidance is not yet connected.'],
  'throttle-up': ['Throttle-up', 'P63ZOOM connects landing guidance and commands maximum thrust — the fixed throttle position.'],
  burning: ['Burning', 'Powered flight: guidance steers (and, for the DPS, throttles) every 2 s.'],
  cutoff: ['Cutoff', 'ENGINE OFF: channel 11 bit 14.'],
  done: ['Complete', 'The ignition sequence is over.'],
});

// Anchor ids to try for "show the tables", most specific first. The
// `burn.*` ids are defined by the programs owner (data/anchors/programs.js).
export const TABLE_ANCHOR_CANDIDATES = Object.freeze([
  'burn.tables', 'burn.which', 'burn.p63table', 'burn.header', 'burn.burnbaby', 'burn.entry',
]);

// First id that `getAnchor` knows; the first candidate when the registry is
// not available (the source view then reports the unknown id itself).
export function resolveAnchor(candidates, getAnchor) {
  const list = candidates.filter(Boolean);
  if (typeof getAnchor !== 'function') return list[0] ?? null;
  for (const id of list) {
    try { if (getAnchor(id)) return id; } catch { /* ignore */ }
  }
  return null;
}

// What the DSKY shows right now, in words.
export function dskyNow(dsky) {
  if (!dsky) return '—';
  if (dsky.blanked) return 'blank';
  const v = String(dsky.verb ?? '').trim();
  const n = String(dsky.noun ?? '').trim();
  if (!v && !n) return 'no verb/noun';
  return `V${v || '  '} N${n || '  '}${dsky.flashVerbNoun ? ' flashing' : ''}`;
}

// The P63 table as it stands in the source (BBB:127-140) — offsets octal.
export const P63TABLE_ROWS = Object.freeze([
  ['(0)', 'VN 0662', 'countdown display V06N62; V99N62 at TIG−5'],
  ['(1)', 'TCF ULLGNOT', 'TIG−30 action: start Average-G'],
  ['(2)', 'TCF COMFAIL3', 'PRO after V97 (engine fail)'],
  ['(3)', 'TCF V99RECYC', 'ENTER on V99: flash it again'],
  ['(4)', 'TCF TASKOVER', '(no user in Luminary 099)'],
  ['(5)', 'TCF P63SPOT', 'start of the pre-ignition integration'],
  ['(6)', 'DEC 2240', 'ullage 22.40 s after TIG−30 → TIG−7.5'],
  ['(7)', '2CADR SERVEXIT', 'SERVICER exit until ignition'],
  ['(11)', 'TCF DISPCHNG', 'TIG−5 action: the V99 display'],
  ['(12)', 'TCF WAITABIT', 'TIG reached, no PRO yet: wait'],
  ['(13)', 'TCF P63IGN', 'post-ignition set-up'],
]);

// ---------- mount ----------

export function mountIgnition(root, ctx) {
  const doc = root.ownerDocument;
  const { bus } = ctx;

  root.innerHTML = `
    <div class="ign" data-spot="ignition">
      <section class="ign-live" data-role="live" hidden>
        <header class="ign-head">
          <div class="ign-head-text">
            <h3 class="ign-title"><span data-k="title">BURN, BABY, BURN</span> <span class="ign-title-sub" data-k="titleSub">master ignition routine</span></h3>
            <p class="ign-sub" data-k="sub">—</p>
          </div>
          <div class="ign-clock" aria-live="off">
            <span class="ign-t" data-k="clock">TIG —</span>
            <span class="ign-phase" data-k="phase">—</span>
          </div>
        </header>
        <p class="ign-desc" data-k="desc"></p>
        <p class="ign-now"><span class="ign-now-label">DSKY now</span> <span class="ign-now-val" data-k="dsky">—</span><span class="ign-now-label ign-now-thr">Throttle</span> <span class="ign-now-val" data-k="thr">—</span></p>
        <div class="ign-timeline" data-spot="ignition.timeline">
          <div class="ign-row ign-row-ev"><span class="ign-lane-label">Events</span><div class="ign-events" data-role="events"></div></div>
          <div class="ign-row ign-row-axis" aria-hidden="true"><span class="ign-lane-label"></span><div class="ign-axis" data-role="axis"></div></div>
          <div class="ign-lanes" data-role="lanes"></div>
          <div class="ign-cursor-layer" aria-hidden="true"><div class="ign-cursor" data-role="cursor"><span class="ign-cursor-label" data-k="cursor">now</span></div></div>
        </div>
        <p class="ign-seq" data-k="seq"></p>
        <p class="ign-notes" data-k="notes"></p>
        <h4 class="ign-list-title">Sequence — select an event to see its code</h4>
        <ol class="ign-list" data-role="list"></ol>
      </section>
      <section class="ign-idle" data-role="idle">
        <h3 class="ign-title">BURN, BABY, BURN <span class="ign-title-sub">the master ignition routine</span></h3>
        <p>Every powered-flight program of the Lunar Module — P12 ascent, P40/P42 burns, P63 descent — hands its ignition to one shared routine, <code>BURNBABY</code>, written by Peter Adler and Don Eyles. It runs everything from the pre-ignition time check to TIG+26 s, when DPS programs throttle up: integrate the state vector to TIG−30 s, blank the DSKY for 5 s to show that Average-G is starting, fire ullage, flash <b>V99</b> (“please enable engine”) at TIG−5 s and wait for the crew’s PRO, light the engine.</p>
        <p>The routine is <b>table-driven</b>. Each program puts the address of its own table into the erasable register <code>WHICH</code>; BURNBABY then does <code>INDEX WHICH</code> + <code>TCF n</code> to pick up the program-specific display, ullage delay, guidance hook and post-ignition step. Above the tables the authors wrote <i>NOLI SE TANGERE</i> — “do not touch them”: every program depends on their fixed layout.</p>
        <p class="ign-cm-note">The Command Module’s Comanche 055 has its own P40 countdown with the same milestones (blank at TIG−35, V99 at TIG−5), but it is not table-driven.</p>
        <table class="ign-table">
          <caption>P63TABLE (offsets are octal) — <span class="ign-cite">BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc:127-140</span></caption>
          <thead><tr><th scope="col">Offset</th><th scope="col">Entry</th><th scope="col">Used for</th></tr></thead>
          <tbody>${P63TABLE_ROWS.map(([o, e, u]) => `<tr><td>${o}</td><td><code>${e}</code></td><td>${u}</td></tr>`).join('')}</tbody>
        </table>
        <p><button type="button" class="btn btn-primary" data-act="tables">Show the tables in the source</button></p>
        <p class="ign-idle-foot" data-k="idleFoot">No burn is armed. The timeline appears here when a program arms BURNBABY (in the demo: “Burn, Baby, Burn”, or the “Before PDI” preset).</p>
      </section>
    </div>`;

  const q = (s) => root.querySelector(s);
  const K = {};
  for (const n of root.querySelectorAll('[data-k]')) K[n.dataset.k] = n;
  const el = {
    live: q('[data-role="live"]'),
    idle: q('[data-role="idle"]'),
    events: q('[data-role="events"]'),
    axis: q('[data-role="axis"]'),
    lanes: q('[data-role="lanes"]'),
    cursor: q('[data-role="cursor"]'),
    list: q('[data-role="list"]'),
  };
  const cache = new Map();
  const set = (key, text) => {
    if (cache.get(key) === text) return;
    cache.set(key, text);
    K[key].textContent = text;
  };

  // Anchor registry (another owner's module, loaded lazily so this file
  // imports in Node).
  let getAnchor = null;
  import('../data/anchors/index.js')
    .then((m) => { getAnchor = typeof m.getAnchor === 'function' ? m.getAnchor : null; })
    .catch(() => { getAnchor = null; });

  const showSource = (anchors) => {
    const list = anchors.filter(Boolean);
    if (list.length) bus.emit('source:show', { anchors: list });
  };
  const tablesAnchor = () => resolveAnchor([...TABLE_ANCHOR_CANDIDATES], getAnchor) || TABLE_ANCHOR_CANDIDATES[0];
  const eventAnchor = (e) => {
    if (!e?.anchor) return tablesAnchor();
    if (getAnchor && !resolveAnchor([e.anchor], getAnchor)) return tablesAnchor();
    return e.anchor;
  };

  const onClick = (ev) => {
    const b = ev.target.closest('[data-act], [data-ev]');
    if (!b || !root.contains(b)) return;
    if (b.dataset.act === 'tables') showSource([tablesAnchor()]);
    else if (b.dataset.ev !== undefined) {
      const e = view.events[Number(b.dataset.ev)];
      if (e) showSource([eventAnchor(e)]);
    }
  };
  root.addEventListener('click', onClick);

  // ---------- state ----------

  let lastBurn = null;          // keep the timeline after the burn object goes away
  let trace = [];               // [{ rel, thr }] actual throttle during this burn
  let view = { key: null, scale: null, events: [], schedule: null, markers: [], items: [] };

  const resetRun = () => { lastBurn = null; trace = []; view.key = null; };
  const offs = [bus.on('sim:reset', resetRun), bus.on('app:mode', resetRun)];

  function render(snap) {
    const burn = snap?.agc?.burn || null;
    if (burn) lastBurn = { ...burn, software: snap.software };
    const b = burn || lastBurn;
    const showLive = !!b && Number.isFinite(b.tig);
    // No burn armed → the explanation; a finished burn stays visible below
    // it ("how the last ignition ran").
    const showIdle = !burn;
    const modeKey = `${showLive}|${showIdle}`;
    if (cache.get('mode') !== modeKey) {
      cache.set('mode', modeKey);
      el.live.hidden = !showLive;
      el.idle.hidden = !showIdle;
      el.live.classList.toggle('is-past', showLive && showIdle);
    }
    set('idleFoot', !snap ? 'No simulation running.'
      : showLive ? 'No burn is armed now. Below: how the last ignition ran.'
        : 'No burn is armed. The timeline appears here when a program arms the ignition sequence (in the demo: “Burn, Baby, Burn”, or the “Before PDI” preset).');
    if (!showLive) return;
    const software = snap?.software || b.software;
    const rel = snap ? snap.t - b.tig : null;

    // Build the static structure when the burn changes.
    const events = Array.isArray(b.events) ? b.events.filter((e) => e && Number.isFinite(e.rel)) : [];
    const cutoff = events.find((e) => /cutoff|engine.?off|shut/i.test(`${e.id} ${e.label}`));
    const key = `${software}|${b.program}|${b.tig}|${events.map((e) => `${e.id}@${e.rel}`).join(',')}`;
    if (key !== view.key) build(key, b, software, events, cutoff?.rel ?? null);

    // Live parts.
    const isCm = software === 'Comanche055';
    set('title', isCm ? 'SPS IGNITION' : 'BURN, BABY, BURN');
    set('titleSub', isCm ? 'Comanche 055’s own P40 countdown' : 'master ignition routine');
    set('sub', `${burnTitle(b.program, software)} · TIG ${formatGET(b.tig, { tenths: true })}`);
    set('clock', rel === null ? 'TIG —' : `TIG ${formatMinSec(rel).replace('-', '−')}`);
    const ph = phaseText(b.phase, software);
    set('phase', burn ? ph[0] : 'Complete');
    set('desc', burn ? ph[1] : 'The ignition sequence is over; the timeline shows how it ran.');
    set('dsky', dskyNow(snap?.agc?.dsky));
    const v = snap?.vehicle;
    const thr = v ? (v.engineOn ? `${Math.round((v.throttle || 0) * 100)} %` : 'engine off') : '—';
    set('thr', thr);

    // Highlight the DSKY segment the countdown is in.
    let nowSeg = -1;
    if (rel !== null && burn) view.dskySegs?.forEach((sg, i) => { if (rel >= sg.from && rel < sg.to) nowSeg = i; });
    if (cache.get('nowSeg') !== nowSeg) {
      cache.set('nowSeg', nowSeg);
      view.dskySegs?.forEach((sg, i) => sg.node.classList.toggle('is-now', i === nowSeg));
    }

    if (rel !== null) {
      const x = view.scale(rel);
      const out = rel > view.scale.domain[view.scale.domain.length - 1];
      const before = rel < view.scale.domain[0];
      const xs = `${(x * 100).toFixed(2)}%`;
      if (cache.get('cursorX') !== xs) {
        cache.set('cursorX', xs);
        el.cursor.style.left = xs;
      }
      set('cursor', out ? `${fmtRel(rel)} s →` : before ? `← ${fmtRel(rel)} s` : 'now');
      const side = x > 0.8 ? 'left' : 'right';
      if (cache.get('cursorSide') !== side) {
        cache.set('cursorSide', side);
        el.cursor.dataset.side = side;
      }
      // Throttle trace while within the window.
      if (v && !before && !out) {
        const last = trace[trace.length - 1];
        if (!last || rel - last.rel >= 0.25 || rel < last.rel) {
          if (last && rel < last.rel) trace = [];
          trace.push({ rel, thr: v.engineOn ? Math.max(0, Math.min(1, v.throttle || 0)) : 0 });
          updateTrace();
        }
      }
    }

    // Event done states.
    events.forEach((e, i) => {
      const done = !!e.done || (rel !== null && e.rel <= rel && burn === null);
      const k = `done${i}`;
      if (cache.get(k) === done) return;
      cache.set(k, done);
      view.markers[i]?.classList.toggle('is-done', done);
      view.items[i]?.classList.toggle('is-done', done);
      const st = view.items[i]?.querySelector('.ign-li-state');
      if (st) st.textContent = done ? 'done' : 'pending';
    });
  }

  function build(key, b, software, events, cutoffRel) {
    view.key = key;
    view.events = events;
    view.schedule = ignitionSchedule(b.program, software, { cutoffRel });
    view.scale = timelineScale(events, view.schedule);
    for (const k of [...cache.keys()]) if (/^done\d+$|^cursor|^nowSeg$/.test(k)) cache.delete(k);
    const sc = view.scale;
    const pctX = (v) => `${(sc(v) * 100).toFixed(3)}%`;
    const lo = sc.domain[0];
    const hi = sc.domain[sc.domain.length - 1];

    // Axis.
    const ticks = timelineTicks(sc);
    const lastMajor = ticks.filter((t) => t.major).pop();
    el.axis.innerHTML = ticks.map((t) => `<span class="ign-tick${t.major ? ' is-major' : ''}${t.v === 0 ? ' is-tig' : ''}${t === lastMajor ? ' is-last' : ''}" style="left:${pctX(t.v)}">${t.major ? `<span>${t.v === 0 ? 'TIG' : fmtRel(t.v)}${t === lastMajor ? ' s' : ''}</span>` : ''}</span>`).join('')
      + (sc.domain.length > 2 ? `<span class="ign-break" style="left:${pctX(sc.domain[1])}" title="Scale compressed after this point">≈</span>` : '');

    // Lanes.
    const laneHtml = [];
    for (const lane of view.schedule.lanes) {
      const segs = lane.segments.map((s) => {
        const a = Math.max(lo, s.from);
        const z = Math.min(hi, s.to);
        if (!(z > a)) return '';
        let ticksHtml = '';
        if (s.ticks) {
          const t0 = s.tick0 ?? s.from;
          const marks = [];
          const tEnd = Math.min(z, sc.domain.length > 2 ? sc.domain[1] : z);
          for (let t = t0; t <= tEnd + 1e-9; t += s.ticks) if (t >= a) marks.push(`<i style="left:${(((sc(t) - sc(a)) / ((sc(z) - sc(a)) || 1)) * 100).toFixed(2)}%"></i>`);
          ticksHtml = `<span class="ign-seg-ticks" aria-hidden="true">${marks.join('')}</span>`;
        }
        return `<span class="ign-seg ign-seg-${s.kind}" data-from="${s.from}" data-to="${s.to}" style="left:${pctX(a)};width:${((sc(z) - sc(a)) * 100).toFixed(3)}%" title="${escapeAttr(s.text)}">${ticksHtml}<span class="ign-seg-text">${escapeHtml(s.text)}</span></span>`;
      }).join('');
      laneHtml.push(`<div class="ign-row"><span class="ign-lane-label">${lane.label}</span><div class="ign-lane" data-lane="${lane.id}">${segs}</div></div>`);
    }
    // Throttle lane: planned profile (dashed) + actual trace.
    const pts = [];
    for (const s of view.schedule.throttle) {
      const a = Math.max(lo, s.from);
      const z = Math.min(hi, s.to);
      if (!(z >= a)) continue;
      const ya = (100 - s.level * 88).toFixed(1);
      pts.push(`${(sc(a) * 1000).toFixed(1)},${ya}`, `${(sc(z) * 1000).toFixed(1)},${ya}`);
    }
    const thrLabels = view.schedule.throttle.filter((s) => s.text && s.to > lo && s.from < hi).map((s) => {
      const mid = (Math.max(lo, s.from) + Math.min(hi, s.to)) / 2;
      return `<span class="ign-thr-label" style="left:${pctX(mid)};bottom:${(s.level * 88).toFixed(0)}%">${escapeHtml(s.text)}</span>`;
    }).join('');
    laneHtml.push(`<div class="ign-row"><span class="ign-lane-label">${view.schedule.throttleLabel}</span><div class="ign-lane ign-lane-thr" data-lane="thr">
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <polyline class="ign-thr-plan" points="${pts.join(' ')}" vector-effect="non-scaling-stroke"/>
        <polyline class="ign-thr-act" data-role="trace" points="" vector-effect="non-scaling-stroke"/>
      </svg>${thrLabels}</div></div>`);
    el.lanes.innerHTML = laneHtml.join('');
    view.traceEl = el.lanes.querySelector('[data-role="trace"]');
    view.dskySegs = [...el.lanes.querySelectorAll('[data-lane="dsky"] .ign-seg')].map((node) => ({
      node, from: Number(node.dataset.from), to: Number(node.dataset.to),
    }));
    set('seq', view.schedule.sequence || '');
    updateTrace();

    // Event markers (rows so neighbours never overlap) and the list.
    const order = events.map((e, i) => ({ e, i, x: sc(e.rel) })).sort((p, r) => p.x - r.x);
    const rows = assignRows(order.map((o) => o.x));
    const nRows = Math.max(1, ...rows.map((r) => r + 1));
    el.events.style.setProperty('--rows', String(nRows));
    view.markers = [];
    el.events.innerHTML = '';
    order.forEach((o, k) => {
      const e = o.e;
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'ign-ev';
      btn.dataset.ev = String(o.i);
      btn.style.left = `${(o.x * 100).toFixed(3)}%`;
      btn.style.setProperty('--row', String(rows[k]));
      if (o.x > 0.86) btn.dataset.align = 'end';
      btn.title = `${fmtRel(e.rel)} s: ${e.label}`;
      btn.setAttribute('aria-label', `${e.rel === 0 ? 'At TIG' : `TIG ${fmtRel(e.rel)} seconds`}: ${e.label}. Show the source code.`);
      btn.innerHTML = `<span class="ign-ev-dot" aria-hidden="true"></span><span class="ign-ev-text">${escapeHtml(fmtRel(e.rel))}</span>`;
      el.events.append(btn);
      view.markers[o.i] = btn;
    });
    el.list.innerHTML = '';
    view.items = [];
    events.map((e, i) => ({ e, i })).sort((p, r) => p.e.rel - r.e.rel).forEach(({ e, i }) => {
      const li = doc.createElement('li');
      li.className = 'ign-li';
      li.innerHTML = `<button type="button" class="ign-li-btn" data-ev="${i}">
        <span class="ign-li-rel">${escapeHtml(fmtRel(e.rel))}${e.rel === 0 ? '' : ' s'}</span>
        <span class="ign-li-label">${escapeHtml(e.label)}</span>
        <span class="ign-li-state">pending</span>
        <span class="ign-li-src" aria-hidden="true">source ›</span>
      </button>`;
      el.list.append(li);
      view.items[i] = li;
    });
    set('notes', view.schedule.notes.join(' '));
  }

  function updateTrace() {
    if (!view.traceEl || !view.scale) return;
    const sc = view.scale;
    const pts = trace.map((p) => `${(sc(p.rel) * 1000).toFixed(1)},${(100 - p.thr * 88).toFixed(1)}`).join(' ');
    view.traceEl.setAttribute('points', pts);
  }

  return {
    render,
    destroy() {
      for (const off of offs) off();
      root.removeEventListener('click', onClick);
      root.innerHTML = '';
    },
  };
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function escapeAttr(text) {
  return escapeHtml(text);
}
