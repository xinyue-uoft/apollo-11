// Top-bar transport controls for both modes, the toast area and the global
// keyboard shortcuts (ARCHITECTURE §11; brief H).
//
//   Demo:        scenario picker · restart · ⏮ · play/pause · ⏭ · speed ·
//                "Pause on explanations" · GET clock + program
//   Interactive: preset picker · play/pause · speed · restart · GET + program
//
// Shortcuts (ignored while typing in a form control): Space = play/pause
// (paused during a reading hold: continue), ←/→ = previous/next chapter
// (demo), [ / ] = slower/faster. Space and the
// arrows are left alone inside a focused scrollable region (the source
// listing, the transcript), where they scroll.

import { formatGET } from '../util/time.js';
import { SPEEDS } from '../demo/director.js';
import {
  h, setText, setAttr, setHidden, toggleClass, isTypingTarget, icon, formatProgram, formatSpeed,
} from './html.js';

const AUTO_PAUSE_KEY = 'agc-sim.autoPause';
const TOAST_MAX = 3;
// Focusable scroll regions: their keys are theirs (contract with the views).
const SCROLL_REGIONS = '[role="region"][tabindex], [role="log"], .src-code, .tr-feed, .src-files';

function readPref(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writePref(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // private mode / blocked storage: the preference just isn't remembered
  }
}

function iconButton(name, label, onClick, { shortcut = null, hint = '' } = {}) {
  return h('button', {
    type: 'button',
    class: 'btn btn-icon',
    aria: shortcut ? { label, keyshortcuts: shortcut } : { label },
    title: hint ? `${label} (${hint})` : label,
    svg: icon(name),
    on: { click: onClick },
  });
}

// Rebuild a <select>'s options only when the list really changes.
function syncOptions(select, items, key) {
  if (select.__key === key) return;
  select.__key = key;
  select.replaceChildren(...items.map(({ value, label, title }) => h('option', { value, title }, label)));
}

export function mountControls(root, ctx) {
  const { bus, app } = ctx;
  const doc = root.ownerDocument;
  const director = () => app.director;
  root.classList.add('ctl');

  // ---------- demo group ----------
  const scenarioSel = h('select', {
    class: 'ctl-select ctl-scenario',
    aria: { label: 'Demo scenario' },
    on: { change: () => app.loadScenario(scenarioSel.value) },
  });
  const demoRestart = iconButton('restart', 'Restart this replay', () => director().restart());
  const prevBtn = iconButton('prev', 'Previous chapter', () => director().prevChapter(),
    { shortcut: 'ArrowLeft', hint: '←' });
  const nextBtn = iconButton('next', 'Next chapter', () => director().nextChapter(),
    { shortcut: 'ArrowRight', hint: '→' });
  const demoPlayLabel = h('span', { class: 'ctl-label' }, 'Play');
  const demoPlay = h('button', {
    type: 'button',
    class: 'btn btn-primary ctl-play',
    aria: { label: 'Play', keyshortcuts: 'Space' },
    on: { click: () => director().toggle() },
  });
  demoPlay.innerHTML = icon('play');
  demoPlay.append(demoPlayLabel);

  const speedSel = h('select', {
    class: 'ctl-select ctl-speed',
    aria: { label: 'Playback speed', keyshortcuts: '[ ]' },
    title: 'Playback speed ([ and ])',
    on: { change: () => director().setSpeed(Number(speedSel.value)) },
  });
  const autoBtn = h('button', {
    type: 'button',
    class: 'btn ctl-auto',
    aria: { pressed: 'true' },
    title: 'Hold each explanation until there has been time to read it (Continue skips)',
    on: {
      click: () => {
        const on = !director().autoPause;
        director().setAutoPause(on);
        writePref(AUTO_PAUSE_KEY, on ? '1' : '0');
      },
    },
  });
  autoBtn.innerHTML = icon('hold');
  autoBtn.append(
    h('span', { class: 'ctl-label ctl-label-long' }, 'Pause on explanations'),
    h('span', { class: 'ctl-label ctl-label-short' }, 'Auto-pause'),
  );

  const demoGroup = h('div', { class: 'ctl-group ctl-demo', role: 'group', aria: { label: 'Replay controls' } },
    scenarioSel,
    h('div', { class: 'ctl-transport' }, demoRestart, prevBtn, demoPlay, nextBtn),
    speedSel,
    autoBtn,
  );

  // ---------- interactive group ----------
  const presetSel = h('select', {
    class: 'ctl-select ctl-scenario',
    aria: { label: 'Starting point' },
    on: { change: () => app.startInteractive(presetSel.value) },
  });
  const intPlayLabel = h('span', { class: 'ctl-label' }, 'Pause');
  const intPlay = h('button', {
    type: 'button',
    class: 'btn btn-primary ctl-play',
    aria: { label: 'Pause', keyshortcuts: 'Space' },
    on: { click: () => app.setInteractivePlaying(!app.interactive.playing) },
  });
  intPlay.innerHTML = icon('pause');
  intPlay.append(intPlayLabel);
  const intSpeedSel = h('select', {
    class: 'ctl-select ctl-speed',
    aria: { label: 'Simulation speed', keyshortcuts: '[ ]' },
    title: 'Simulation speed ([ and ])',
    on: { change: () => app.setInteractiveSpeed(Number(intSpeedSel.value)) },
  });
  const intRestart = iconButton('restart', 'Restart from this starting point', () => app.restartInteractive());
  const intGroup = h('div', { class: 'ctl-group ctl-interactive', role: 'group', aria: { label: 'Simulation controls' } },
    presetSel,
    h('div', { class: 'ctl-transport' }, intPlay, intRestart),
    intSpeedSel,
  );

  // ---------- clock ----------
  const clockValue = h('span', { class: 'ctl-clock-value' }, '---:--:--');
  const progValue = h('span', { class: 'ctl-prog' }, 'P--');
  const clock = h('div', { class: 'ctl-clock', title: 'Ground Elapsed Time and the current major mode (program)' },
    h('span', { class: 'ctl-clock-label', aria: { hidden: 'true' } }, 'GET'),
    h('span', { class: 'visually-hidden' }, 'Ground elapsed time'),
    clockValue,
    h('span', { class: 'visually-hidden' }, ', program'),
    progValue,
  );

  root.append(demoGroup, intGroup);
  demoGroup.append(clock);

  // Remember "Pause on explanations" across visits (per browser only).
  const stored = readPref(AUTO_PAUSE_KEY);
  if (stored !== null && app.director) app.director.setAutoPause(stored === '1');

  // ---------- toasts ----------
  // Appended to <body>: the top bar uses backdrop-filter, which would make it
  // the containing block of a position:fixed child.
  const toasts = h('div', { class: 'toasts', role: 'status', aria: { live: 'polite', relevant: 'additions' } });
  doc.body.append(toasts);
  const live = new Map(); // text → { el, timer }

  function dismiss(text) {
    const item = live.get(text);
    if (!item) return;
    clearTimeout(item.timer);
    live.delete(text);
    item.el.remove();
  }

  function toast(text) {
    if (!text) return;
    const ms = Math.min(9000, 3500 + 45 * text.length);
    const existing = live.get(text);
    if (existing) { // same message again: just keep it up longer
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => dismiss(text), ms);
      return;
    }
    while (live.size >= TOAST_MAX) dismiss(live.keys().next().value);
    const close = h('button', {
      type: 'button',
      class: 'toast-close',
      aria: { label: 'Dismiss notification' },
      svg: icon('close'),
      on: { click: () => dismiss(text) },
    });
    const el = h('div', { class: 'toast' }, h('p', { class: 'toast-text' }, text), close);
    toasts.append(el);
    live.set(text, { el, timer: setTimeout(() => dismiss(text), ms) });
  }

  const offs = [
    bus.on('toast', (p) => toast(p?.text)),
    bus.on('director:error', (p) => toast(`The replay hit a problem (${p?.what}): ${p?.message}`)),
  ];

  // ---------- keyboard shortcuts ----------
  function onKeyDown(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target;
    if (isTypingTarget(target)) return;
    const el = target && target.nodeType === 1 ? target : null;
    const demo = app.mode === 'demo';
    switch (e.key) {
      case ' ':
      case 'Spacebar':
        // Let a focused button/link/summary activate natively, and a
        // focused scroll region page down.
        if (el?.closest('button, a[href], summary, [role="button"], [role="tab"], [role="slider"]')) return;
        if (el?.closest(SCROLL_REGIONS)) return;
        e.preventDefault();
        if (demo) director().toggle();
        else app.setInteractivePlaying(!app.interactive.playing);
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (!demo || el?.closest('[role="slider"], [role="tab"], [role="tablist"], [role="listbox"], [role="menu"], [role="radiogroup"]')) return;
        if (el?.closest(SCROLL_REGIONS)) return; // scrolls the listing sideways
        e.preventDefault();
        if (e.key === 'ArrowLeft') director().prevChapter();
        else director().nextChapter();
        break;
      case '[':
      case ']': {
        e.preventDefault();
        const dir = e.key === ']' ? 1 : -1;
        if (demo) {
          director().stepSpeed(dir);
        } else {
          const it = app.uiState().interactive || {};
          const list = it.speeds || [1, 2, 5, 10];
          const i = list.indexOf(it.speed);
          const next = list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
          app.setInteractiveSpeed(next);
        }
        break;
      }
      default:
        break;
    }
  }
  doc.addEventListener('keydown', onKeyDown);

  // ---------- render ----------
  let lastMode = null;

  function setPlayButton(button, label, playing, text) {
    if (button.__playing !== playing || button.__text !== text) {
      button.__playing = playing;
      button.__text = text;
      button.innerHTML = icon(playing ? 'pause' : 'play');
      button.append(label);
      setText(label, text);
      setAttr(button, 'aria-label', text);
      setAttr(button, 'title', `${text} (Space)`);
    }
  }

  function render(snapshot, ui) {
    if (!ui) return;
    if (ui.mode !== lastMode) {
      lastMode = ui.mode;
      setHidden(demoGroup, ui.mode !== 'demo');
      setHidden(intGroup, ui.mode !== 'interactive');
      toggleClass(root, 'is-demo', ui.mode === 'demo');
      // The clock lives in the visible group so that on a phone it wraps
      // onto the same row as the speed controls.
      (ui.mode === 'demo' ? demoGroup : intGroup).append(clock);
    }

    let get = null;
    if (ui.mode === 'demo') {
      const d = ui.director || {};
      const scenarios = ui.scenarios || [];
      syncOptions(scenarioSel, scenarios.map((s) => ({ value: s.id, label: s.title, title: s.summary })),
        scenarios.map((s) => s.id).join('|'));
      if (ui.scenario && scenarioSel.value !== ui.scenario.id) scenarioSel.value = ui.scenario.id;

      const speeds = [...new Set([...(d.speeds || SPEEDS), d.speed ?? 1])].sort((a, b) => a - b);
      syncOptions(speedSel, speeds.map((s) => ({ value: String(s), label: formatSpeed(s) })), speeds.join('|'));
      if (speedSel.value !== String(d.speed ?? 1)) speedSel.value = String(d.speed ?? 1);

      const ended = !!d.ended;
      const playing = !!d.playing && !ended;
      // Paused during a hold, Play continues at once (Director.toggle).
      const resumes = !playing && !ended && !!d.holding;
      setPlayButton(demoPlay, demoPlayLabel, playing,
        ended ? 'Replay' : playing ? 'Pause' : resumes ? 'Continue' : 'Play');
      toggleClass(demoPlay, 'is-continue', resumes);
      setAttr(autoBtn, 'aria-pressed', String(!!d.autoPause));
      prevBtn.disabled = !d.loaded;
      nextBtn.disabled = !d.loaded || !d.hasNextChapter;
      demoRestart.disabled = !d.loaded;
      demoPlay.disabled = !d.loaded;
      if (d.loaded) get = d.seeking ? d.seeking.target : d.t;
    } else {
      const it = ui.interactive || {};
      const presets = ui.presets || [];
      syncOptions(presetSel, presets.map((p) => ({ value: p.id, label: p.title, title: p.description })),
        presets.map((p) => p.id).join('|'));
      if (ui.preset && presetSel.value !== ui.preset.id) presetSel.value = ui.preset.id;
      const speeds = it.speeds || [1, 2, 5, 10];
      syncOptions(intSpeedSel, speeds.map((s) => ({ value: String(s), label: formatSpeed(s) })), speeds.join('|'));
      if (intSpeedSel.value !== String(it.speed)) intSpeedSel.value = String(it.speed);
      setPlayButton(intPlay, intPlayLabel, !!it.playing, it.playing ? 'Pause' : 'Run');
      if (snapshot) get = snapshot.t;
    }

    setText(clockValue, Number.isFinite(get) ? formatGET(get) : '---:--:--');
    const agc = snapshot?.agc;
    setText(progValue, formatProgram(agc?.mode));
    setAttr(progValue, 'title', agc?.programName ? `${formatProgram(agc.mode)} — ${agc.programName}` : null);
  }

  function destroy() {
    doc.removeEventListener('keydown', onKeyDown);
    for (const off of offs) off();
    for (const text of [...live.keys()]) dismiss(text);
    toasts.remove();
    root.replaceChildren();
  }

  return { render, destroy };
}
