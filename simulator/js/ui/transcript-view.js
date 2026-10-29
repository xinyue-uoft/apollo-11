// Transcript panel (centre column, under the visualisation).
//
// Demo mode: a captions feed of the crew/ground voice ('say'), the crew's
// keystrokes ('director:keys') and, inline in a distinct style, the
// computer's own events: program alarms (amber, octal code), software
// restarts, program (major mode) changes, BURNBABY steps.
// Interactive mode: the computer event log plus the user's keystrokes.
//
// Newest line at the bottom; the feed follows new lines unless the user has
// scrolled up, in which case a "new lines" button appears. Lines are queued
// by the bus handlers and written to the DOM once per frame in render().

import { formatGET } from '../util/time.js';
import { parseKeys } from '../util/keys.js';
import { h, setText, setAttr, setHidden, toggleClass, icon, formatOctal, formatProgram } from './html.js';

const MAX_LINES = 600;
const COMPUTER_KINDS = ['alarm', 'restart', 'mode', 'burn', 'oprerr'];

// Speaker → crew position and colour class. Matching is by surname so
// "Aldrin (onboard)" still finds Aldrin. Unknown speakers get `spk-other`.
const SPEAKERS = [
  ['armstrong', 'CDR', 'spk-cdr'],
  ['aldrin', 'LMP', 'spk-lmp'],
  ['duke', 'CAPCOM', 'spk-capcom'],
  ['collins', 'CMP', 'spk-cmp'],
];

function speaker(who, role) {
  const name = String(who || '').toLowerCase();
  const hit = SPEAKERS.find(([key]) => name.includes(key));
  return { role: role || (hit ? hit[1] : ''), cls: hit ? hit[2] : 'spk-other' };
}

// Program names come from the programs registry (engineer D) when it loads;
// the live snapshot fills in anything missing.
const programNames = { Luminary099: {}, Comanche055: {} };
import('../agc/programs/index.js')
  .then((m) => {
    for (const [software, table] of [['Luminary099', m.PROGRAMS_LUMINARY099], ['Comanche055', m.PROGRAMS_COMANCHE055]]) {
      for (const [num, cls] of Object.entries(table || {})) {
        const name = typeof cls?.name === 'string' && !/^P\d+$/.test(cls.name) ? cls.name : null;
        if (name) programNames[software][num] = name;
      }
    }
  })
  .catch(() => {});

// "V16N68E" → ['VERB', '16', 'NOUN', '68', 'ENTR'] (digits grouped).
export function groupKeys(keys) {
  const out = [];
  for (const k of keys) {
    if (/^\d$/.test(k) && out.length && /^[+-]?\d+$/.test(out[out.length - 1])) out[out.length - 1] += k;
    else if (/^\d$/.test(k) && out.length && /^[+-]$/.test(out[out.length - 1])) out[out.length - 1] += k;
    else out.push(k);
  }
  return out;
}

function keyChips(keys) {
  return groupKeys(keys).map((k) => h('kbd', {}, k));
}

function burnRel(rel) {
  if (!Number.isFinite(rel)) return '';
  const r = Math.round(rel * 10) / 10;
  return r < 0 ? `TIG − ${Math.abs(r)} s` : r > 0 ? `TIG + ${r} s` : 'TIG';
}

export function mountTranscript(root, ctx) {
  const { bus, app } = ctx;
  root.dataset.spot = 'transcript';
  root.classList.add('tr');

  // ---------- skeleton ----------
  const voiceBtn = h('button', {
    type: 'button', class: 'tr-filter', aria: { pressed: 'true' },
    title: 'Show crew and ground voice and crew keystrokes',
    on: { click: () => toggleFilter('voice', voiceBtn) },
  }, 'Voice');
  const sysBtn = h('button', {
    type: 'button', class: 'tr-filter', aria: { pressed: 'true' },
    title: 'Show the computer’s own events (alarms, restarts, program changes)',
    on: { click: () => toggleFilter('sys', sysBtn) },
  }, 'Computer');
  const titleText = h('span', {}, 'Transcript');
  const heading = h('h2', { class: 'panel-title' }, titleText,
    h('span', { class: 'tr-filters', role: 'group', aria: { label: 'Show in transcript' } }, voiceBtn, sysBtn));

  const list = h('ol', { class: 'tr-list' });
  const empty = h('p', { class: 'tr-empty' });
  const feed = h('div', {
    class: 'tr-feed', role: 'log', tabindex: '0', aria: { label: 'Transcript and computer events', live: 'polite' },
  }, empty, list);
  const jump = h('button', {
    type: 'button', class: 'btn tr-jump', hidden: true,
    on: { click: () => { stick = true; scrollToEnd(); setHidden(jump, true); } },
  });
  const note = h('p', { class: 'tr-note' });
  root.append(heading, h('div', { class: 'tr-body' }, feed, jump), note);

  // ---------- state ----------
  let mode = app.mode;
  let lines = [];        // rendered entries (for name fill-in)
  let pending = [];      // entries waiting for the next render
  let rebuild = null;    // replacement history after a seek / load
  let stick = true;      // follow new lines
  let unseen = 0;
  let needsIntro = false;
  let lastMode = null;
  let userKeys = null;   // the open "You keyed …" line in interactive mode
  let busyFrames = 0;    // aria-busy after a history rebuild
  const hidden = { voice: false, sys: false };

  function toggleFilter(which, btn) {
    hidden[which] = !hidden[which];
    setAttr(btn, 'aria-pressed', String(!hidden[which]));
    toggleClass(list, `hide-${which}`, hidden[which]);
  }

  function nearBottom() {
    return feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
  }
  function scrollToEnd() {
    feed.scrollTop = feed.scrollHeight;
    unseen = 0;
  }
  feed.addEventListener('scroll', () => {
    stick = nearBottom();
    if (stick) {
      unseen = 0;
      setHidden(jump, true);
    }
  }, { passive: true });

  function clear() {
    lines = [];
    pending = [];
    rebuild = [];
    userKeys = null;
    unseen = 0;
    stick = true;
  }

  const push = (entry) => pending.push(entry);

  // ---------- bus ----------
  const offs = [
    bus.on('app:mode', (p) => {
      mode = p?.mode || app.mode;
      clear();
      needsIntro = mode === 'interactive';
    }),
    bus.on('director:seeked', (p) => {
      if (mode !== 'demo') return;
      // Copies: lines get view-only fields (their DOM node) attached.
      rebuild = (p?.log || []).slice(-MAX_LINES).map((e) => ({ ...e }));
      pending = [];
    }),
    bus.on('say', (p) => {
      if (mode === 'demo') push({ kind: 'say', ...p });
    }),
    bus.on('director:keys', (p) => {
      if (mode === 'demo') push({ kind: 'keys', ...p });
    }),
    ...COMPUTER_KINDS.map((kind) => bus.on(kind, (p) => push({ ...p, kind }))),
    bus.on('key', (p) => {
      if (mode !== 'interactive' || p?.source === 'crew' || !p?.key) return;
      // Group a run of keystrokes into one line until ENTR/PRO/RSET/KEY REL.
      if (userKeys && !userKeys.closed && (p.t ?? 0) - userKeys.t < 20) {
        userKeys.keys.push(p.key);
        userKeys.updated = true;
      } else {
        userKeys = { kind: 'userkeys', t: p.t, keys: [p.key], closed: false };
        push(userKeys);
      }
      if (['ENTR', 'PRO', 'RSET', 'KEY REL'].includes(p.key)) userKeys.closed = true;
    }),
  ];

  // ---------- line rendering ----------
  function programLabel(entry, software) {
    const name = entry.name || entry.programName || programNames[software]?.[entry.mode] || '';
    return `${formatProgram(entry.mode)}${name ? ` · ${name}` : ''}`;
  }

  function lineFor(entry, software) {
    const time = h('time', { class: 'tr-get' }, Number.isFinite(entry.t) ? formatGET(entry.t) : '');
    switch (entry.kind) {
      case 'say': {
        const s = speaker(entry.who, entry.role);
        const onboard = entry.channel === 'onboard';
        const srcTitle = [entry.src && `Source: ${entry.src}`, onboard && 'onboard intercom (LM tape), not heard in Houston',
          entry.note, entry.alt && `Other records: ${entry.alt}`].filter(Boolean).join(' — ');
        return h('li', { class: `tr-line tr-say ${s.cls}${onboard ? ' tr-onboard' : ''}` },
          time,
          h('span', { class: 'tr-who' }, entry.who, s.role ? h('span', { class: 'tr-role' }, s.role) : null),
          h('span', { class: 'tr-text' }, entry.text),
          (entry.src || onboard) ? h('span', { class: 'tr-src', title: srcTitle || null },
            [entry.src, onboard ? 'onboard' : null].filter(Boolean).join(' · ')) : null);
      }
      case 'keys': {
        let keys;
        try {
          keys = parseKeys(entry.script);
        } catch {
          keys = [String(entry.script)];
        }
        const s = speaker(entry.who);
        return h('li', { class: `tr-line tr-keys ${s.cls}` },
          time,
          h('span', { class: 'tr-who' }, entry.who || 'Crew', h('span', { class: 'tr-role' }, 'keys')),
          h('span', { class: 'tr-text tr-keyseq', aria: { label: `keyed ${groupKeys(keys).join(' ')}` } }, keyChips(keys)));
      }
      case 'userkeys': {
        const text = h('span', { class: 'tr-text tr-keyseq' }, keyChips(entry.keys));
        const li = h('li', { class: 'tr-line tr-keys tr-user' },
          time, h('span', { class: 'tr-who' }, 'You', h('span', { class: 'tr-role' }, 'DSKY')), text);
        entry.el = text;
        return li;
      }
      case 'alarm': {
        const code = formatOctal(entry.code);
        return h('li', { class: `tr-line tr-sys tr-alarm${entry.restart ? ' tr-alarm-restart' : ''}` },
          time,
          h('span', { class: 'tr-who' }, 'AGC'),
          h('span', { class: 'tr-text' },
            h('strong', {}, `PROGRAM ALARM ${code}`),
            entry.text ? ` — ${entry.text}` : '',
            entry.restart ? h('span', { class: 'tr-tag' }, 'software restart') : null));
      }
      case 'restart':
        return h('li', { class: 'tr-line tr-sys tr-restart' },
          time,
          h('span', { class: 'tr-who' }, 'AGC'),
          h('span', { class: 'tr-text' }, h('strong', {}, 'SOFTWARE RESTART'),
            entry.reason ? ` — ${entry.reason}` : '',
            Number.isFinite(entry.code) ? ` (${formatOctal(entry.code)})` : ''));
      case 'mode': {
        const label = h('span', { class: 'tr-prog' }, programLabel(entry, software));
        entry.el = label;
        entry.software = software;
        const from = Number.isFinite(entry.prev) && entry.prev !== entry.mode ? `${formatProgram(entry.prev)} → ` : '';
        return h('li', { class: 'tr-line tr-sys tr-mode' },
          time,
          h('span', { class: 'tr-who' }, 'AGC'),
          h('span', { class: 'tr-text' }, entry.initial ? 'Running ' : 'Program ', from, label));
      }
      case 'burn':
        return h('li', { class: 'tr-line tr-sys tr-burn' },
          time,
          h('span', { class: 'tr-who' }, 'AGC'),
          h('span', { class: 'tr-text' }, entry.label || entry.id || 'Ignition sequence step',
            Number.isFinite(entry.rel) ? h('span', { class: 'tr-tag' }, burnRel(entry.rel)) : null));
      case 'oprerr':
        return h('li', { class: 'tr-line tr-sys tr-oprerr' },
          time,
          h('span', { class: 'tr-who' }, 'DSKY'),
          h('span', { class: 'tr-text' }, h('strong', {}, 'OPR ERR'), entry.reason ? ` — ${entry.reason}` : ''));
      case 'intro':
        return h('li', { class: 'tr-line tr-sys tr-intro' },
          time,
          h('span', { class: 'tr-who' }, 'SIM'),
          h('span', { class: 'tr-text' }, entry.text));
      default:
        return null;
    }
  }

  function append(entries, software) {
    const frag = document.createDocumentFragment();
    for (const entry of entries) {
      const li = lineFor(entry, software);
      if (!li) continue;
      lines.push(entry);
      frag.append(li);
    }
    list.append(frag);
    while (list.childElementCount > MAX_LINES) {
      list.firstElementChild.remove();
      lines.shift();
    }
  }

  // ---------- render ----------
  function render(snapshot, ui) {
    if (!ui) return;
    if (ui.mode !== lastMode) {
      lastMode = ui.mode;
      mode = ui.mode;
      note.textContent = ui.mode === 'demo'
        ? 'Voice at its ALSJ / air-to-ground transcript time; computer events at the model’s time. Hover a source tag for details.'
        : 'Computer events from the model and the keys you press on the DSKY.';
      setText(titleText, ui.mode === 'demo' ? 'Transcript' : 'Computer log');
      setText(voiceBtn, ui.mode === 'demo' ? 'Voice' : 'Keys');
    }
    const software = snapshot?.software || ui.scenario?.software || ui.preset?.software || 'Luminary099';

    if (needsIntro && snapshot && ui.mode === 'interactive') {
      needsIntro = false;
      const agc = snapshot.agc;
      push({
        kind: 'intro',
        t: snapshot.t,
        text: `${ui.preset?.title || 'Interactive session'} — computer in ${formatProgram(agc?.mode)}${agc?.programName ? ` ${agc.programName}` : ''}`,
      });
      // The intro goes first even if events were queued before it.
      pending.unshift(pending.pop());
    }

    let changed = false;
    if (rebuild) {
      // A rebuilt history is not news: keep screen readers from reading the
      // whole log out (aria-busy until the next frames).
      setAttr(feed, 'aria-busy', 'true');
      busyFrames = 2;
      list.replaceChildren();
      lines = [];
      append(rebuild, software);
      rebuild = null;
      changed = true;
      stick = true;
    } else if (busyFrames > 0 && --busyFrames === 0) {
      setAttr(feed, 'aria-busy', null);
    }
    if (pending.length) {
      const batch = pending;
      pending = [];
      append(batch, software);
      if (!stick) unseen += batch.length;
      changed = true;
    }
    if (userKeys?.updated && userKeys.el) {
      userKeys.updated = false;
      userKeys.el.replaceChildren(...keyChips(userKeys.keys));
      changed = true;
    }

    // Fill in program names the registry did not know, from the live state.
    const agc = snapshot?.agc;
    if (agc?.programName) {
      for (let i = lines.length - 1; i >= 0 && i >= lines.length - 5; i--) {
        const e = lines[i];
        if (e.kind === 'mode' && e.mode === agc.mode && e.el && !e.named) {
          e.named = true;
          if (!e.name && !programNames[software]?.[e.mode]) {
            e.name = agc.programName;
            e.el.textContent = programLabel(e, software);
          }
        }
      }
    }

    if (changed) {
      if (stick) scrollToEnd();
      setHidden(jump, stick || unseen === 0);
      if (!stick) jump.replaceChildren(h('span', { svg: icon('down'), aria: { hidden: 'true' } }), `${unseen} new`);
    }
    const isEmpty = list.childElementCount === 0;
    setHidden(empty, !isEmpty);
    if (isEmpty) {
      setText(empty, ui.mode === 'demo'
        ? 'Voice captions and computer events appear here as the replay reaches them.'
        : 'Computer events and your DSKY keystrokes will be logged here.');
    }
  }

  function destroy() {
    for (const off of offs) off();
    root.replaceChildren();
  }

  return { render, destroy };
}
