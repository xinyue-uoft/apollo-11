// Narration panel (right column). Demo mode: the chapter, the latest
// explanation card (sanitised HTML body + chips that open the real source
// lines), the "paused so you can read" countdown with Continue, and the
// collapsible history of earlier explanations. Interactive mode: the
// preset's description and tips plus live lines saying how the flight
// ended (once it has), what the DSKY shows (the verb and noun decoded from
// the listing's tables) and what the computer model is doing (program,
// ignition sequence, guidance phase).

import { formatGET, formatMinSec } from '../util/time.js';
import { getNoun } from '../agc/nouns.js';
import { verbTable } from '../agc/verbs.js';
import { FORMATS } from '../agc/display-format.js';
import {
  h, setText, setHtml, setHidden, setStyle, toggleClass, icon, formatOctal, formatProgram, vehicleEventText,
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

// The listing's upper-case names in lower case, keeping register and
// program names (R1, P20), single letters (delta V, CDU X) and acronyms.
const ACRONYMS = new Set(['LR', 'RR', 'AGC', 'CSM', 'CM', 'LM', 'LEM', 'IMU', 'CDU', 'DAP', 'VHF', 'TFF', 'VG',
  'LV', 'DSKY', 'RCS', 'SPS', 'DPS', 'APS', 'TIG', 'PIPA', 'UT', 'GET', 'LOS', 'TPI', 'CSI', 'CDH', 'TPF', 'ADR', 'G+C']);
function readable(text) {
  return String(text).trim().replace(/\.$/, '')
    .replace(/[^\s,()/]+/g, (w) => (ACRONYMS.has(w) || /\d/.test(w) || w.length === 1 ? w : w.toLowerCase()));
}

// What a flashing VERB/NOUN asks of the crew, by verb kind (PINBALL: a
// flashing display waits in ENDIDLE for PRO/V33, V34 or V32; a PLEASE verb
// also takes ENTR; a load verb takes the data and ENTR;
// Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:2860-2886).
function flashHint(verb, entry) {
  if (verb === 37) return 'flashing: key a program number and ENTR';
  if (entry?.kind === 'please') return 'flashing: PRO to proceed, ENTR for the alternative the program offers, V34E to terminate';
  if (verb >= 21 && verb <= 25) return 'flashing: key the value(s) and ENTR';
  return 'flashing: PRO to accept, V34E to terminate (V32E to recycle)';
}

// One register's digits read with the noun component's scale (decimal
// display verbs only), e.g. "+30314" in XXXX.X → "+3031.4".
function registerValue(reg, comp) {
  const digits = String(reg?.digits ?? '').replace(/\s/g, '');
  if (!digits || !/^\d+$/.test(digits)) return null;
  const f = FORMATS[comp.format];
  const sign = reg.sign === '-' ? '−' : reg.sign === '+' ? '+' : '';
  if (f?.kind === 'decimal' || f?.kind === 'cdu') {
    const n = Number(digits) / 10 ** (f.decimals || 0);
    return `${sign}${n.toFixed(f.decimals || 0)}`;
  }
  if (f?.kind === 'minsec' && digits.length === 4) return `${sign}${digits.slice(0, 2)}:${digits.slice(2)}`;
  return null;
}

// "V16 N68 — monitor decimal: R1 slant range to landing site 5.3 nmi · …"
function displayLine(snapshot) {
  const d = snapshot?.agc?.dsky;
  if (!d || d.blanked || d.lampTest) return null;
  const verb = Number.parseInt(d.verb, 10);
  if (!Number.isFinite(verb)) return null;
  const software = snapshot.software;
  const v = verbTable(software)[verb];
  const noun = Number.parseInt(d.noun, 10);
  const n = Number.isFinite(noun) ? getNoun(software, noun) : null;
  const head = `V${d.verb}${Number.isFinite(noun) ? ` N${d.noun}` : ''}`;
  const parts = [];
  // "DISPLAY DECIMAL IN R1 OR R1,R2 OR R1,R2,R3": the registers are listed below
  if (v) parts.push(readable(v.name.replace(/\s+IN R1\b.*$/, '')));
  // Decimal display and monitor verbs show the noun's components in R1-R3.
  const decimal = v && (v.kind === 'display' || v.kind === 'monitor')
    && verbTable(software)[v.kind === 'monitor' ? v.monitorOf : verb]?.octal === false;
  let regs = '';
  if (n?.inUse && n.components.length) {
    regs = n.components.slice(0, 3).map((c, i) => {
      const value = decimal ? registerValue(d.r[i], c) : null;
      const unit = c.unit && !['octal', 'position'].includes(c.unit) ? ` ${c.unit}` : '';
      return `R${i + 1} ${readable(c.label)}${value ? ` ${value}${unit}` : unit ? ` (${unit.trim()})` : ''}`;
    }).join(' · ');
  }
  let text = `Display ${head}${parts.length ? ` — ${parts.join('; ')}` : ''}`;
  if (n && !n.inUse) text += ' (spare noun)';
  if (regs) text += `: ${regs}`;
  if (d.flashVerbNoun) text += ` — ${flashHint(verb, v)}`;
  return text;
}

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
  const headingText = h('h2', { id: 'narration-heading' }, 'Explanation');
  const heading = h('div', { class: 'panel-title' }, headingText, counter);
  root.setAttribute('aria-labelledby', 'narration-heading');

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
  const liveOutcome = h('p', { class: 'nar-live-outcome', hidden: true });
  const liveProgram = h('p', { class: 'nar-live-prog' });
  const liveDetail = h('ul', { class: 'nar-live-list' });
  const interactiveBox = h('div', { class: 'panel-body nar-interactive', hidden: true },
    h('article', { class: 'nar-card' }, presetTitle, presetText, tipsList),
    h('section', { class: 'nar-live', aria: { label: 'What the computer is doing' } },
      h('h3', { class: 'nar-live-head' }, 'What the computer is doing'), liveOutcome, liveProgram, liveDetail),
    h('p', { class: 'nar-honesty' },
      'A behavioural model of Luminary 099 / Comanche 055 — not an instruction-level emulator of the rope. '
      + 'Displays, timings and the Executive load are modelled from the source and the mission record.'));

  root.append(heading, demoBox, interactiveBox);

  // ---------- state ----------
  let current = null;   // latest narration
  let earlier = [];     // older narrations, oldest first
  let shownEarlier = 0; // how many of `earlier` are in the history list
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
      shownEarlier = -1; // rebuild the history list
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
      shownEarlier = -1;
      dirty = true;
    }),
    bus.on('app:mode', () => {
      dirty = true;
    }),
  ];
  anchorsReady.then(() => {
    shownEarlier = -1; // re-label every chip with the anchor names
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
    // Newest first. Normally narrations only accumulate, so new ones are
    // prepended and the items a reader has expanded stay expanded.
    if (shownEarlier < 0 || shownEarlier > earlier.length) {
      historyList.replaceChildren(...earlier.slice().reverse().map(historyItem));
    } else if (earlier.length > shownEarlier) {
      historyList.prepend(...earlier.slice(shownEarlier).reverse().map(historyItem));
    }
    shownEarlier = earlier.length;
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
    if (!agc) return { program: 'The computer is not running yet.', details: [], outcome: null };
    const program = `${formatProgram(agc.mode)}${agc.programName ? ` — ${agc.programName}` : ''}`;
    const details = [];
    // How the flight ended leads, once it has (the toast is gone by now).
    const vehicle = snapshot.vehicle;
    const td = vehicle?.touchdown;
    let outcome = null;
    if (td) outcome = { verdict: td.verdict, text: vehicleEventText({ kind: 'touchdown', ...td }) };
    else if (vehicle?.depleted) outcome = { verdict: 'crash', text: vehicleEventText({ kind: 'depleted' }) };
    const display = displayLine(snapshot);
    if (display) details.push(display);
    if (agc.dsky?.lights?.keyRel) {
      details.push('KEY REL lit: a program display is waiting while you have the keyboard — press KEY REL to let it show');
    }
    const burn = agc.burn;
    if (burn && burn.phase && burn.phase !== 'done') {
      // Time relative to ignition, from TIG itself so the sign is unambiguous.
      const rel = Number.isFinite(burn.tig) && Number.isFinite(snapshot.t) ? snapshot.t - burn.tig : null;
      const tig = rel === null ? '' : ` (TIG ${formatMinSec(rel)})`;
      details.push(`Ignition sequence (BURNBABY): ${BURN_PHASES[burn.phase] || burn.phase}${tig}`);
    }
    // Guidance: nothing once on the surface; no time to go in P66 (the
    // rate-of-descent mode has no target time; the value would be stale).
    const g = agc.guidance;
    if (g && g.phase && !td) {
      const ttg = Number.isFinite(g.ttg) && g.phase !== 'rod' && agc.mode !== 66
        ? `, time to go ${Math.round(Math.abs(g.ttg))} s` : '';
      details.push(`Guidance: ${GUIDANCE_PHASES[g.phase] || g.phase}${ttg}`);
    }
    if (vehicle?.lowLevel && !td && !vehicle.depleted) details.push(vehicleEventText({ kind: 'lowLevel' }));
    const load = agc.exec?.load?.total;
    if (Number.isFinite(load)) details.push(`Executive load: ${Math.round(load * 100)} %`);
    const last = agc.alarms?.last;
    if (last && Number.isFinite(last.t) && snapshot.t - last.t < 30) {
      details.push(`Program alarm ${formatOctal(last.code)}${last.text ? ` — ${last.text}` : ''} at ${formatGET(last.t)}`);
    }
    if (agc.dsky?.lights?.prog) details.push('PROG light on — key V05N09E to read the alarm codes, RSET to clear');
    return { program, details, outcome };
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
    const { program, details, outcome } = liveLines(snapshot);
    setHidden(liveOutcome, !outcome);
    setText(liveOutcome, outcome?.text ?? '');
    for (const v of ['safe', 'hard', 'crash']) toggleClass(liveOutcome, `is-${v}`, outcome?.verdict === v);
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
      setText(headingText, ui.mode === 'demo' ? 'Explanation' : 'Interactive');
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
