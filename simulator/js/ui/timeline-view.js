// Timeline footer: a scrubber over the scenario's [start, end] with chapter
// segments, event ticks (voice faint, explanations blue, program changes
// green, alarms amber / red when they caused a restart), the current
// position, a hover tooltip (GET + chapter), click/drag to seek and full
// keyboard operation (role="slider": ←/→ ±5 s, Shift ±30 s, PageUp/PageDown
// next/previous chapter, Home/End). Shows the re-simulation progress while
// a seek runs. In interactive mode it only shows the elapsed time.
//
// Alarm and program-change ticks are learned from the computer model as the
// replay meets them (they emerge from the model, they are not in the
// script); the replay is deterministic, so they stay valid for the session.

import { formatGET, parseGET } from '../util/time.js';
import { h, setText, setAttr, setHidden, setStyle, toggleClass } from './html.js';

const KEY_STEP = 5;       // s per arrow key
const KEY_STEP_BIG = 30;  // s with Shift
const LABEL_MIN_PX = 54;  // narrower chapter segments hide their label

function safeGET(v) {
  try {
    const t = parseGET(v);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

function pct(x) {
  return `${(Math.min(1, Math.max(0, x)) * 100).toFixed(3)}%`;
}

export function mountTimeline(root, ctx) {
  const { bus, app } = ctx;
  root.dataset.spot = 'timeline';

  // ---------- skeleton ----------
  const t0 = h('span', { class: 'tl-time tl-t0' });
  const t1 = h('span', { class: 'tl-time tl-t1' });
  const chaptersEl = h('div', { class: 'tl-chapters', aria: { hidden: 'true' } });
  const rail = h('div', { class: 'tl-rail', aria: { hidden: 'true' } },
    h('div', { class: 'tl-fill' }), h('div', { class: 'tl-seekbar' }));
  const ticksEl = h('div', { class: 'tl-ticks', aria: { hidden: 'true' } });
  const head = h('div', { class: 'tl-head', aria: { hidden: 'true' } });
  const ghost = h('div', { class: 'tl-ghost', aria: { hidden: 'true' }, hidden: true });
  const tipTime = h('span', { class: 'tl-tip-time' });
  const tipChapter = h('span', { class: 'tl-tip-chapter' });
  const tipEvent = h('span', { class: 'tl-tip-event' });
  const tip = h('div', { class: 'tl-tip', aria: { hidden: 'true' }, hidden: true }, tipTime, tipChapter, tipEvent);
  const track = h('div', {
    class: 'tl-track',
    role: 'slider',
    tabindex: '0',
    aria: { label: 'Replay position (Ground Elapsed Time)', valuemin: '0', valuemax: '0', valuenow: '0' },
  }, chaptersEl, rail, ticksEl, ghost, head, tip);
  const status = h('span', { class: 'tl-status' });
  const demoRow = h('div', { class: 'tl-row' }, t0, track, t1);
  const legend = h('div', { class: 'tl-legend', aria: { hidden: 'true' } },
    h('span', { class: 'tl-key tl-key-narrate' }, 'explanation'),
    h('span', { class: 'tl-key tl-key-say' }, 'voice'),
    h('span', { class: 'tl-key tl-key-mode' }, 'program change'),
    h('span', { class: 'tl-key tl-key-alarm' }, 'alarm'),
    h('span', { class: 'tl-key tl-key-restart' }, 'alarm + restart'),
    status);
  const demoBox = h('div', { class: 'tl tl-demo' }, demoRow, legend);

  const intText = h('span', { class: 'tl-int-text' });
  const intBox = h('div', { class: 'tl tl-int', hidden: true }, intText);
  root.append(demoBox, intBox);

  // ---------- state ----------
  let ui = null;
  let lastMode = null;
  let lastScenario = null;
  let lastChapters = null;
  let lastChapterIndex = -2;
  let start = 0;
  let end = 1;
  let scriptTicks = [];
  let allTicks = [];         // what is drawn, for the hover tooltip
  const learned = new Map(); // scenario id → Map(key → tick)
  let ticksDirty = true;
  let segments = [];
  let dragging = null;       // { id, t }
  let hoverX = null;
  let lastValueText = '';

  const span = () => Math.max(1e-9, end - start);
  const director = () => app.director;

  function timeAtClientX(clientX) {
    const r = track.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
    return start + x * span();
  }

  function chapterAt(t) {
    const list = ui?.director?.chapters || [];
    let found = null;
    for (const c of list) if (c.t <= t + 1e-6) found = c;
    return found;
  }

  // ---------- ticks ----------
  function learnedFor(id) {
    if (!learned.has(id)) learned.set(id, new Map());
    return learned.get(id);
  }

  function learn(kind, p) {
    // Bus events can arrive before the next render, so read the app, not `ui`.
    const scenario = app.scenario;
    if (app.mode !== 'demo' || !scenario || !Number.isFinite(p?.t)) return;
    const range = app.director?.state;
    if (!range || p.t < range.start - 1e-6 || p.t > range.end + 1e-6) return;
    if (kind === 'mode' && (p.initial || !Number.isFinite(p.mode))) return;
    const ident = kind === 'mode' ? p.mode : p.code ?? '';
    const key = `${kind}:${ident}:${Math.round(p.t)}`;
    const map = learnedFor(scenario.id);
    if (map.has(key)) return;
    let cls = 'tl-tick-mode';
    let label = `P${String(p.mode).padStart(2, '0')}`;
    if (kind === 'alarm') {
      cls = p.restart ? 'tl-tick-restart' : 'tl-tick-alarm';
      label = `Program alarm ${Number.isFinite(p.code) ? p.code.toString(8).padStart(5, '0') : ''}${p.restart ? ' + restart' : ''}`;
    } else if (kind === 'restart') {
      cls = 'tl-tick-restart';
      label = 'Software restart';
    }
    map.set(key, { t: p.t, cls, label });
    if (scenario === ui?.scenario) ticksDirty = true;
  }

  function buildScriptTicks(scenario) {
    const out = [];
    for (const ev of scenario?.events || []) {
      const t = safeGET(ev.at);
      if (t === null) continue;
      if (ev.say) out.push({ t, cls: 'tl-tick-say', label: `${ev.say.who}: ${ev.say.text}` });
      else if (ev.narrate) out.push({ t, cls: 'tl-tick-narrate', label: ev.narrate.title });
    }
    return out;
  }

  function renderTicks() {
    ticksDirty = false;
    allTicks = [...scriptTicks, ...(ui?.scenario ? learnedFor(ui.scenario.id).values() : [])];
    ticksEl.replaceChildren(...allTicks.map((tk) => h('span', {
      class: `tl-tick ${tk.cls}`,
      style: `left:${pct((tk.t - start) / span())}`,
    })));
  }

  // ---------- chapters ----------
  function renderChapters(chapters) {
    segments = chapters.map((c, i) => {
      const next = chapters[i + 1]?.t ?? end;
      const seg = h('div', {
        class: `tl-seg${i % 2 ? ' tl-seg-odd' : ''}`,
        style: `left:${pct((c.t - start) / span())};width:${pct((next - c.t) / span())}`,
        title: c.title,
      }, h('span', { class: 'tl-seg-label' }, c.title));
      seg.__frac = (next - c.t) / span();
      return seg;
    });
    chaptersEl.replaceChildren(...segments);
    lastChapterIndex = -2;
    fitLabels();
  }

  function fitLabels() {
    const width = track.clientWidth || 0;
    for (const seg of segments) toggleClass(seg, 'is-narrow', seg.__frac * width < LABEL_MIN_PX);
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fitLabels) : null;
  ro?.observe(track);

  // ---------- input ----------
  function seekTo(t) {
    const d = director();
    if (!d?.sim) return;
    d.seek(Math.min(end, Math.max(start, t)));
  }

  // Live director state (not the last frame's copy), so that several key
  // presses within one frame accumulate.
  function refTime() {
    const d = director()?.state;
    return d?.seeking ? d.seeking.target : d?.t ?? start;
  }

  // The most important tick within a few pixels of `t` (alarms beat program
  // changes beat explanations beat voice).
  const RANK = { 'tl-tick-restart': 4, 'tl-tick-alarm': 4, 'tl-tick-mode': 3, 'tl-tick-narrate': 2, 'tl-tick-say': 1 };
  function tickNear(t) {
    const slack = (5 / Math.max(1, track.clientWidth)) * span();
    let best = null;
    for (const tk of allTicks) {
      if (Math.abs(tk.t - t) > slack) continue;
      if (!best || (RANK[tk.cls] || 0) > (RANK[best.cls] || 0)
        || ((RANK[tk.cls] || 0) === (RANK[best.cls] || 0) && Math.abs(tk.t - t) < Math.abs(best.t - t))) best = tk;
    }
    return best;
  }

  function showTip(t, x) {
    const c = chapterAt(t);
    const tk = tickNear(t);
    setText(tipTime, formatGET(tk ? tk.t : t));
    setText(tipChapter, c ? c.title : '');
    setText(tipEvent, tk ? tk.label : '');
    setHidden(tipEvent, !tk);
    setHidden(tip, false);
    const w = track.clientWidth || 1;
    const half = Math.min(140, (tip.offsetWidth || 120) / 2);
    setStyle(tip, 'left', `${Math.min(w - half, Math.max(half, x))}px`);
  }

  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || app.mode !== 'demo') return;
    e.preventDefault();
    track.focus({ preventScroll: true });
    track.setPointerCapture?.(e.pointerId);
    dragging = { id: e.pointerId, t: timeAtClientX(e.clientX) };
    toggleClass(track, 'is-dragging', true);
  });
  track.addEventListener('pointermove', (e) => {
    const t = timeAtClientX(e.clientX);
    hoverX = e.clientX - track.getBoundingClientRect().left;
    showTip(t, hoverX);
    if (dragging && e.pointerId === dragging.id) dragging.t = t;
  });
  const endDrag = (e, commit) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const t = timeAtClientX(e.clientX);
    dragging = null;
    toggleClass(track, 'is-dragging', false);
    setHidden(ghost, true);
    // Releasing right on an explanation, program change or alarm tick snaps
    // to it (an explanation exactly at the seek target then plays live).
    const tk = tickNear(t);
    if (commit) seekTo(tk && (RANK[tk.cls] || 0) >= 2 ? tk.t : t);
  };
  track.addEventListener('pointerup', (e) => endDrag(e, true));
  track.addEventListener('pointercancel', (e) => endDrag(e, false));
  track.addEventListener('pointerleave', () => {
    hoverX = null;
    if (!dragging) setHidden(tip, true);
  });

  track.addEventListener('keydown', (e) => {
    if (app.mode !== 'demo' || e.ctrlKey || e.metaKey || e.altKey) return;
    const d = director();
    const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        seekTo(refTime() - step);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        seekTo(refTime() + step);
        break;
      case 'PageUp':
        d?.nextChapter();
        break;
      case 'PageDown':
        d?.prevChapter();
        break;
      case 'Home':
        seekTo(start);
        break;
      case 'End':
        seekTo(end);
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  // ---------- bus ----------
  const offs = [
    bus.on('alarm', (p) => learn('alarm', p)),
    bus.on('mode', (p) => learn('mode', p)),
    bus.on('director:seeked', (p) => {
      for (const entry of p?.log || []) {
        if (entry.kind === 'alarm' || entry.kind === 'mode') learn(entry.kind, entry);
      }
    }),
  ];

  // ---------- render ----------
  function renderDemo(d) {
    if (ui.scenario !== lastScenario) {
      lastScenario = ui.scenario;
      start = d.start;
      end = d.end > d.start ? d.end : d.start + 1;
      setText(t0, formatGET(start));
      setText(t1, formatGET(end));
      scriptTicks = buildScriptTicks(ui.scenario);
      ticksDirty = true;
      lastChapters = null;
      setAttr(track, 'aria-valuemax', String(Math.round(end - start)));
    }
    if (d.chapters !== lastChapters) {
      lastChapters = d.chapters;
      renderChapters(d.chapters || []);
    }
    if (ticksDirty) renderTicks();

    if (d.chapterIndex !== lastChapterIndex) {
      lastChapterIndex = d.chapterIndex;
      segments.forEach((seg, i) => toggleClass(seg, 'is-current', i === d.chapterIndex));
    }

    const seeking = d.seeking;
    const shownT = seeking ? seeking.target : d.t;
    setStyle(track, '--pos', pct((shownT - start) / span()));
    toggleClass(track, 'is-seeking', !!seeking);
    setAttr(track, 'aria-busy', seeking ? 'true' : null);
    if (seeking) {
      setStyle(track, '--seek', pct(seeking.progress));
      setText(status, `Re-simulating… ${Math.round(seeking.progress * 100)} %`);
    } else {
      setText(status, d.holding ? 'Paused for explanation' : d.ended ? 'End of replay' : '');
    }

    if (dragging) {
      setHidden(ghost, false);
      setStyle(ghost, 'left', pct((dragging.t - start) / span()));
      if (hoverX !== null) showTip(dragging.t, hoverX);
    }

    const now = Math.round(shownT - start);
    setAttr(track, 'aria-valuenow', String(Math.max(0, now)));
    const c = d.chapters?.[d.chapterIndex];
    const text = `GET ${formatGET(shownT)}${c ? `, chapter ${d.chapterIndex + 1} of ${d.chapters.length}: ${c.title}` : ''}`;
    if (text !== lastValueText) {
      lastValueText = text;
      setAttr(track, 'aria-valuetext', text);
    }
  }

  function renderInteractive(snapshot) {
    const startGET = safeGET(ui.preset?.startGET);
    if (!snapshot || startGET === null) {
      setText(intText, 'Interactive mode');
      return;
    }
    const elapsed = Math.max(0, snapshot.t - startGET);
    const m = Math.floor(elapsed / 60);
    const s = Math.floor(elapsed % 60);
    const it = ui.interactive || {};
    setText(intText, `Interactive · GET ${formatGET(snapshot.t)} · running ${m}:${String(s).padStart(2, '0')}`
      + `${it.playing ? '' : ' · paused'} · ${it.speed ?? 1}×`);
  }

  function render(snapshot, uiState) {
    if (!uiState) return;
    ui = uiState;
    if (ui.mode !== lastMode) {
      lastMode = ui.mode;
      setHidden(demoBox, ui.mode !== 'demo');
      setHidden(intBox, ui.mode !== 'interactive');
      lastScenario = null;
    }
    if (ui.mode === 'demo') {
      const d = ui.director;
      if (!d) return;
      renderDemo(d);
    } else {
      renderInteractive(snapshot);
    }
  }

  function destroy() {
    for (const off of offs) off();
    ro?.disconnect();
    root.replaceChildren();
  }

  return { render, destroy };
}
