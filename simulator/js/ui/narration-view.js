// Narration panel (right column). Demo mode: the chapter, the latest
// explanation card (sanitised HTML body + chips that open the real source
// lines), the "paused so you can read" countdown with Continue, and the
// collapsible history of earlier explanations. Interactive mode: the
// preset's description and tips plus a live line saying what the computer
// model is doing (program, ignition sequence, guidance phase).

import { formatGET, formatMinSec } from '../util/time.js';
import {
  h, setText, setHtml, setHidden, setStyle, icon, formatOctal, formatProgram,
} from './html.js';

// snapshot.agc.burn.phase (§6.9.1) → words.
const BURN_PHASES = {
  pre: 'counting down to ignition',
  'avg-g': 'Average-G navigation running',
  ullage: 'ullage — RCS jets settling the propellant',
  v99: 'asking the crew for permission to ignite (V99, waiting for PRO)',
  ignition: 'engine ignition',
  trim: 'trimming the gimbal at low throttle',
  'throttle-up': 'throttling up',
  burning: 'engine burning under guidance',
  cutoff: 'engine cutoff',
  done: 'burn complete',
};
const GUIDANCE_PHASES = {
  braking: 'braking phase guidance (P63)',
  approach: 'approach phase guidance (P64)',
  rod: 'rate-of-descent mode (P66)',
  manual: 'manual control',
};

// The anchor registry belongs to the source panel's owner; load it lazily so
// that a missing or broken registry only costs the chips their pretty names.
let anchorLookup = null;
const anchorsReady = import('../data/anchors/index.js')
  .then((m) => {
    anchorLookup = typeof m.getAnchor === 'function' ? m.getAnchor : (id) => m.ANCHORS?.[id] ?? null;
  })
  .catch(() => {});

function anchorInfo(id) {
  const a = anchorLookup ? anchorLookup(id) : null;
  if (!a) return { label: id, title: `Show source: ${id}` };
  const base = String(a.file || '').split('/').pop();
  const label = a.label ? `${base} · ${a.label}` : base || id;
  const where = a.file ? `${a.file}:${a.start}${a.end && a.end !== a.start ? `–${a.end}` : ''}` : id;
  return { label, title: `Show source: ${a.title || id} (${where})` };
}

export function mountNarration(root, ctx) {
  const { bus, app } = ctx;
  root.dataset.spot = 'narration';
  root.classList.add('nar');

  const counter = h('span', { class: 'nar-counter' });
  const heading = h('h2', { class: 'panel-title' }, h('span', {}, 'Explanation'), counter);

  // ---------- demo ----------
  const chapterEl = h('p', { class: 'nar-chapter' });
  const cardGet = h('span', { class: 'nar-get' });
  const cardTitle = h('h3', { class: 'nar-title' });
  const cardText = h('div', { class: 'nar-text' });
  const cardChips = h('div', { class: 'nar-anchors', role: 'group', aria: { label: 'Source code for this explanation' } });
  const card = h('article', { class: 'nar-card', aria: { live: 'polite', atomic: 'true' } },
    h('header', { class: 'nar-card-head' }, cardTitle, cardGet), cardText, cardChips);

  const holdText = h('span', { class: 'nar-hold-text' });
  const holdFill = h('span', { class: 'nar-hold-fill' });
  const holdBtn = h('button', {
    type: 'button',
    class: 'btn btn-primary nar-continue',
    on: { click: () => app.director?.resume() },
  }, 'Continue');
  const hold = h('div', { class: 'nar-hold', hidden: true },
    h('span', { class: 'nar-hold-icon', svg: icon('hold'), aria: { hidden: 'true' } }),
    h('div', { class: 'nar-hold-main' }, holdText, h('span', { class: 'nar-hold-bar', aria: { hidden: 'true' } }, holdFill)),
    holdBtn);

  const endedBox = h('div', { class: 'nar-ended', hidden: true },
    h('p', {}, 'End of this replay.'),
    h('div', { class: 'nar-ended-actions' },
      h('button', { type: 'button', class: 'btn', on: { click: () => app.director?.restart() } }, 'Watch again'),
      h('button', { type: 'button', class: 'btn', on: { click: () => nextScenario() } }, 'Next scenario')));

  const historyCount = h('span', { class: 'nar-history-count' });
  const historyList = h('ol', { class: 'nar-history-list' });
  const historyBox = h('details', { class: 'nar-history', hidden: true },
    h('summary', {}, 'Earlier explanations ', historyCount), historyList);

  const demoBox = h('div', { class: 'panel-body nar-demo' }, chapterEl, card, hold, endedBox, historyBox);

  // ---------- interactive ----------
  const presetTitle = h('h3', { class: 'nar-title' });
  const presetText = h('div', { class: 'nar-text' });
  const tipsList = h('ul', { class: 'nar-tips' });
  const liveProgram = h('p', { class: 'nar-live-prog' });
  const liveDetail = h('ul', { class: 'nar-live-list' });
  const interactiveBox = h('div', { class: 'panel-body nar-interactive', hidden: true },
    h('article', { class: 'nar-card' }, presetTitle, presetText, tipsList),
    h('section', { class: 'nar-live', aria: { label: 'What the computer is doing' } },
      h('h3', { class: 'nar-live-head' }, 'What the computer is doing'), liveProgram, liveDetail),
    h('p', { class: 'nar-honesty' },
      'A behavioural model of Luminary 099 / Comanche 055 — not an instruction-level emulator of the rope. '
      + 'Displays, timings and the Executive load are modelled from the source and the mission record.'));

  root.append(heading, demoBox, interactiveBox);

  // ---------- state ----------
  let current = null;   // latest narration
  let earlier = [];     // older narrations, oldest first
  let dirty = true;
  let fresh = false;    // animate the next card
  let lastMode = null;
  let lastPreset = null;
  let lastScenario = null;

  function nextScenario() {
    const list = app.uiState?.().scenarios || [];
    const i = list.findIndex((s) => s.id === app.scenario?.id);
    const next = list[(i + 1) % Math.max(1, list.length)];
    if (next) app.loadScenario(next.id);
  }

  function chipsFor(anchors) {
    return anchors.map((id, i) => {
      const info = anchorInfo(id);
      return h('button', {
        type: 'button',
        class: 'chip',
        title: info.title,
        aria: { label: info.title },
        data: { anchor: id },
        on: {
          click: () => {
            const rest = anchors.filter((_, k) => k !== i);
            bus.emit('source:show', { anchors: [id, ...rest], primary: id, from: 'narration' });
          },
        },
      }, h('span', { class: 'chip-icon', svg: icon('code'), aria: { hidden: 'true' } }), info.label);
    });
  }

  function historyItem(n) {
    const body = h('div', { class: 'nar-text', html: n.body });
    const chips = n.anchors?.length ? h('div', { class: 'nar-anchors' }, chipsFor(n.anchors)) : null;
    return h('li', {},
      h('details', {},
        h('summary', {}, h('span', { class: 'nar-get' }, formatGET(n.t)), ' ', n.title),
        body, chips));
  }

  const offs = [
    bus.on('director:seeked', (p) => {
      const list = p?.narrations || [];
      current = list.at(-1) || null;
      earlier = list.slice(0, -1);
      fresh = false;
      dirty = true;
    }),
    bus.on('narrate', (n) => {
      if (app.mode !== 'demo') return;
      if (current) earlier.push(current);
      current = n;
      fresh = true;
      dirty = true;
    }),
    bus.on('director:loaded', () => {
      current = null;
      earlier = [];
      dirty = true;
    }),
    bus.on('app:mode', () => {
      dirty = true;
    }),
  ];
  anchorsReady.then(() => {
    dirty = true;
  });

  function renderCard(ui) {
    if (current) {
      setText(cardTitle, current.title);
      setText(cardGet, formatGET(current.t));
      setHtml(cardText, current.body);
      cardChips.replaceChildren(...chipsFor(current.anchors || []));
    } else {
      // Before the first narration: the scenario's own summary.
      setText(cardTitle, ui.scenario ? ui.scenario.title : 'Demo');
      setText(cardGet, ui.scenario ? `${ui.scenario.start} – ${ui.scenario.end}` : '');
      setHtml(cardText, ui.scenario?.summary ? `<p>${ui.scenario.summary}</p>` : '');
      cardChips.replaceChildren();
    }
    setHidden(cardChips, !cardChips.childElementCount);
    if (fresh) {
      card.classList.remove('is-fresh');
      void card.offsetWidth; // restart the CSS animation
      card.classList.add('is-fresh');
      fresh = false;
    }
    historyList.replaceChildren(...earlier.slice().reverse().map(historyItem));
    setText(historyCount, `(${earlier.length})`);
    setHidden(historyBox, earlier.length === 0);
  }

  function renderDemo(ui) {
    const d = ui.director || {};
    if (ui.scenario !== lastScenario) {
      lastScenario = ui.scenario;
      dirty = true;
    }
    if (dirty) {
      dirty = false;
      renderCard(ui);
    }
    const chapters = d.chapters || [];
    const chapter = chapters[d.chapterIndex];
    setText(chapterEl, chapter ? chapter.title : '');
    setHidden(chapterEl, !chapter);
    setText(counter, chapters.length ? `Chapter ${Math.max(1, d.chapterIndex + 1)} of ${chapters.length}` : '');

    const holding = d.holding;
    setHidden(hold, !holding);
    if (holding) {
      const secs = Math.max(0, Math.ceil(holding.remaining - 1e-6));
      setText(holdText, d.playing
        ? `Paused so you can read — continuing in ${secs} s`
        : `Paused so you can read (${secs} s left) — the replay is paused`);
      setStyle(holdFill, '--hold', (holding.total > 0 ? holding.remaining / holding.total : 0).toFixed(3));
    }
    setHidden(endedBox, !d.ended);
  }

  function liveLines(snapshot) {
    const agc = snapshot?.agc;
    if (!agc) return { program: 'The computer is not running yet.', details: [] };
    const program = `${formatProgram(agc.mode)}${agc.programName ? ` — ${agc.programName}` : ''}`;
    const details = [];
    const burn = agc.burn;
    if (burn && burn.phase && burn.phase !== 'done') {
      // Time relative to ignition, from TIG itself so the sign is unambiguous.
      const rel = Number.isFinite(burn.tig) && Number.isFinite(snapshot.t) ? snapshot.t - burn.tig : null;
      const tig = rel === null ? '' : ` (TIG ${formatMinSec(rel)})`;
      details.push(`Ignition sequence (BURNBABY): ${BURN_PHASES[burn.phase] || burn.phase}${tig}`);
    }
    const g = agc.guidance;
    if (g && g.phase) {
      const ttg = Number.isFinite(g.ttg) ? `, time to go ${Math.round(Math.abs(g.ttg))} s` : '';
      details.push(`Guidance: ${GUIDANCE_PHASES[g.phase] || g.phase}${ttg}`);
    }
    const load = agc.exec?.load?.total;
    if (Number.isFinite(load)) details.push(`Executive load: ${Math.round(load * 100)} %`);
    const last = agc.alarms?.last;
    if (last && Number.isFinite(last.t) && snapshot.t - last.t < 30) {
      details.push(`Program alarm ${formatOctal(last.code)}${last.text ? ` — ${last.text}` : ''} at ${formatGET(last.t)}`);
    }
    if (agc.dsky?.lights?.prog) details.push('PROG light on — key V05N09E to read the alarm codes, RSET to clear');
    return { program, details };
  }

  function renderInteractive(snapshot, ui) {
    const preset = ui.preset;
    if (preset !== lastPreset) {
      lastPreset = preset;
      setText(presetTitle, preset?.title || 'Interactive');
      setHtml(presetText, preset?.description ? toParagraphs(preset.description) : '');
      const tips = Array.isArray(preset?.tips) ? preset.tips : [];
      tipsList.replaceChildren(...tips.map((tip) => h('li', { html: tip })));
      setHidden(tipsList, tips.length === 0);
    }
    const { program, details } = liveLines(snapshot);
    setText(liveProgram, program);
    const key = details.join('\n');
    if (liveDetail.__key !== key) {
      liveDetail.__key = key;
      liveDetail.replaceChildren(...details.map((d) => h('li', {}, d)));
    }
  }

  function render(snapshot, ui) {
    if (!ui) return;
    if (ui.mode !== lastMode) {
      lastMode = ui.mode;
      setHidden(demoBox, ui.mode !== 'demo');
      setHidden(interactiveBox, ui.mode !== 'interactive');
      setText(heading.firstChild, ui.mode === 'demo' ? 'Explanation' : 'Interactive');
      setText(counter, '');
      lastPreset = undefined;
      dirty = true;
    }
    if (ui.mode === 'demo') renderDemo(ui);
    else renderInteractive(snapshot, ui);
  }

  function destroy() {
    for (const off of offs) off();
    root.replaceChildren();
  }

  return { render, destroy };
}

// Plain-text descriptions (presets) may separate paragraphs with blank
// lines; HTML ones pass through the sanitiser unchanged.
function toParagraphs(text) {
  const s = String(text);
  if (/<\/?(p|ul|ol|br)\b/i.test(s)) return s;
  return s.split(/\n\s*\n/).map((p) => `<p>${p.trim()}</p>`).join('');
}
