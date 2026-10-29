// Executive view: where the 1202 becomes visible.
//
// Shows, from `snapshot.agc.exec` (executive.js), `snapshot.agc.alarms`
// (alarms.js) and `snapshot.agc.restart` (restart.js):
//   - the core sets (8 in the LM, 7 in the CM) and the 5 VAC areas as cards,
//     with a line from each job's core set to the VAC area it holds;
//   - the Waitlist slots and the six restart groups (phase tables);
//   - the CPU load of the last second, stacked by contributor, and a
//     2-minute sparkline of the total with alarm markers;
//   - an event log of alarms and restarts, and a short legend.
// On an overflow the failing request is shown bouncing off the full row
// with its alarm code; the board is held for a moment, then a sweep clears
// it (the software restart) and the protected jobs reappear.
//
// Render diffing: every element is created once; per frame only text,
// classes and widths that changed are written. The helpers above
// `mountExec` are DOM-free (node:test can import them).

import { formatGET } from '../util/time.js';
import { describeAlarm, formatAlarmCode } from '../agc/alarms.js';

// ------------------------------------------------------------ pure helpers

// Load-bar groups, in drawing order (busy first, idle last).
export const LOAD_LEGEND = Object.freeze([
  { group: 'servicer', label: 'SERVICER & guidance', short: 'SERVICER' },
  { group: 'display', label: 'Guidance displays', short: 'Displays' },
  { group: 'monitor', label: 'V16 monitor (MONDO)', short: 'Monitor' },
  { group: 'lr', label: 'Landing-radar reads', short: 'LR reads' },
  { group: 'keys', label: 'Keystrokes (CHARIN)', short: 'Keys' },
  { group: 'other', label: 'Other jobs', short: 'Other' },
  { group: 'interrupts', label: 'Interrupts & tasks', short: 'Interrupts' },
  { group: 'steal', label: 'RR CDU cycle stealing', short: 'RR CDU steal' },
  { group: 'idle', label: 'Idle (spare)', short: 'Idle' },
]);

const STATE_TEXT = { RUNNING: 'RUNNING', READY: 'READY', SLEEPING: 'SLEEPING' };

export function prioText(prio) {
  return `PRIO ${Math.abs(Number(prio) || 0).toString(8).padStart(2, '0')}`;
}

export function ageText(seconds) {
  if (!(seconds >= 0)) return '';
  return seconds < 1 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds)} s`;
}

export function pct(f) {
  return `${Math.round(Math.max(0, f) * 100)}%`;
}

// Segment widths (percent, summing to 100) for the stacked bar.
export function loadSegments(load) {
  const groups = (load && load.groups) || {};
  const total = LOAD_LEGEND.reduce((s, g) => s + (groups[g.group] || 0), 0);
  return LOAD_LEGEND.map((g) => ({
    group: g.group,
    width: total > 0 ? ((groups[g.group] || 0) / total) * 100 : (g.group === 'idle' ? 100 : 0),
    fraction: groups[g.group] || 0,
  }));
}

// SVG path for the load history over the last `windowS` seconds.
export function sparkPath(history, now, { width = 300, height = 40, windowS = 120 } = {}) {
  if (!history || !history.length) return '';
  const x = (t) => width - ((now - t) / windowS) * width;
  const y = (v) => height - Math.max(0, Math.min(1, v)) * height;
  let d = '';
  for (const h of history) {
    if (now - h.t > windowS + 1) continue;
    d += `${d ? 'L' : 'M'}${x(h.t).toFixed(1)},${y(h.total).toFixed(1)}`;
  }
  return d;
}

// One line per alarm / restart, newest first.
export function buildLog(alarms, restart, software, limit = 30) {
  const out = [];
  for (const a of (alarms && alarms.history) || []) {
    const info = describeAlarm(a.code, software);
    out.push({
      key: `a${a.t.toFixed(3)}:${a.code}`, t: a.t, code: info.octal, text: info.text,
      kind: a.restart ? 'software restart' : (info.cls === 'p00' ? 'abort to P00' : 'alarm'),
      anchor: info.anchor, cls: info.cls,
    });
  }
  for (const r of (restart && restart.history) || []) {
    if (!r.hardware) continue;
    out.push({ key: `r${r.t.toFixed(3)}`, t: r.t, code: '—', text: `Hardware restart: ${r.reason}`, kind: 'hardware restart', anchor: 'restart.goprog', cls: 'hw' });
  }
  out.sort((a, b) => b.t - a.t);
  return out.slice(0, limit);
}

// The job view the board shows for one core set (stable fields only, so the
// render can compare cheaply).
function jobKey(job) {
  if (!job) return '';
  return `${job.id}|${job.name}|${job.prio}|${job.state}|${job.vacIndex}|${job.group}`;
}

// ------------------------------------------------------------------ view

export function mountExec(root, ctx) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const bus = ctx && ctx.bus;
  const reducedMotion = () => !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const now = () => (win && win.performance ? win.performance.now() : Date.now()); // UI timing only

  root.innerHTML = `
    <div class="ex" data-spot="exec">
      <header class="ex-head">
        <div class="ex-head-text">
          <h3 class="ex-title">The Executive <span class="ex-title-sub" data-k="sw">Luminary 099</span></h3>
          <p class="ex-sub" data-k="sub">Jobs, priorities, core sets and VAC areas</p>
        </div>
        <ul class="ex-chips" aria-label="Executive status">
          <li class="ex-chip" data-k="running" title="The job that has the processor (always in core set 0)">idle</li>
          <li class="ex-chip ex-chip-steal" data-spot="exec.steal" data-k="steal" title="Memory cycles stolen by the rendezvous-radar CDU counters">RR CDU steal 0%</li>
          <li class="ex-chip" data-k="restarts" title="Software and hardware restarts in this run">0 restarts</li>
        </ul>
      </header>

      <div class="ex-board" data-role="board">
        <svg class="ex-links" data-role="links" aria-hidden="true" focusable="false"></svg>
        <section class="ex-row ex-row-cores" data-spot="exec.coresets" aria-labelledby="ex-cores-h">
          <div class="ex-row-head"><h4 class="ex-row-title" id="ex-cores-h">Core sets</h4> <span class="ex-count" data-k="coresCount">0 / 8</span></div>
          <ol class="ex-cards ex-cards-cores" data-role="cores"></ol>
        </section>
        <section class="ex-row ex-row-vacs" data-spot="exec.vacs" aria-labelledby="ex-vacs-h">
          <div class="ex-row-head"><h4 class="ex-row-title" id="ex-vacs-h">VAC areas</h4> <span class="ex-count" data-k="vacsCount">0 / 5</span></div>
          <ol class="ex-cards ex-cards-vacs" data-role="vacs"></ol>
        </section>
        <div class="ex-bounce" data-role="bounce" aria-hidden="true" hidden><span class="ex-bounce-req" data-k="bounceReq"></span><span class="ex-bounce-code" data-k="bounceCode"></span></div>
        <div class="ex-sweep" data-role="sweep" aria-hidden="true"></div>
        <p class="ex-held" data-role="held" hidden>Software restart…</p>
      </div>

      <div class="ex-strips">
        <section class="ex-strip" aria-labelledby="ex-wl-h">
          <div class="ex-row-head"><h4 class="ex-strip-title" id="ex-wl-h">Waitlist</h4> <span class="ex-count" data-k="wlCount">0 / 9</span></div>
          <ol class="ex-slots" data-role="waitlist"></ol>
        </section>
        <section class="ex-strip" aria-labelledby="ex-rg-h">
          <div class="ex-row-head"><h4 class="ex-strip-title" id="ex-rg-h">Restart groups</h4> <span class="ex-hint">what a restart brings back</span></div>
          <ol class="ex-groups" data-role="groups"></ol>
        </section>
      </div>

      <section class="ex-load" data-spot="exec.load" aria-labelledby="ex-load-h">
        <div class="ex-row-head"><h4 class="ex-strip-title" id="ex-load-h">CPU time, last second</h4> <span class="ex-count" data-k="busy">busy 0%</span></div>
        <div class="ex-bar" data-role="bar" role="img" aria-label="CPU load"></div>
        <div class="ex-bar-scale" aria-hidden="true"><span>0</span><span>50%</span><span class="ex-bar-100">100%</span></div>
        <ul class="ex-legend" data-role="legend"></ul>
        <div class="ex-spark-wrap">
          <svg class="ex-spark" data-role="spark" viewBox="0 0 300 44" preserveAspectRatio="none" role="img" aria-label="Total load over the last two minutes">
            <line class="ex-spark-100" x1="0" y1="2" x2="300" y2="2"></line>
            <g transform="translate(0,2)">
              <path class="ex-spark-area" data-role="sparkArea" d=""></path>
              <path class="ex-spark-line" data-role="sparkLine" d=""></path>
            </g>
            <g data-role="sparkMarks"></g>
          </svg>
          <div class="ex-spark-axis" aria-hidden="true"><span>−2 min</span><span>load, 100% line on top</span><span>now</span></div>
        </div>
        <p class="ex-backlog" data-k="backlog"></p>
      </section>

      <section class="ex-log-wrap" aria-labelledby="ex-log-h">
        <h4 class="ex-strip-title" id="ex-log-h">Alarms and restarts</h4>
        <ol class="ex-log" data-spot="exec.log" data-role="log" aria-live="polite"><li class="ex-log-empty">No alarms yet.</li></ol>
      </section>

      <section class="ex-help" aria-label="How to read this">
        <dl class="ex-defs">
          <div><dt><span class="ex-sw g-servicer" aria-hidden="true"></span>Core set</dt><dd>12 registers that hold one job's state while it runs or waits. Every job needs one; the running job is always in core set 0. None free → alarm <b>1202</b>.</dd></div>
          <div><dt><span class="ex-sw ex-sw-vac" aria-hidden="true"></span>VAC area</dt><dd>A 43-word scratch area for jobs that use the vector interpreter (FINDVAC). Only five exist. None free → alarm <b>1201</b>.</dd></div>
          <div><dt>Priority</dt><dd>Octal; higher wins. SERVICER (navigation + guidance, PRIO 20) is the lowest and longest, so it is the one left unfinished when time runs out.</dd></div>
          <div><dt>Restart</dt><dd>On 1201/1202 the software restarts: every job is dropped, then only what the phase tables protect comes back. The PROG lamp lights; the RESTART lamp does not.</dd></div>
        </dl>
        <p class="ex-code-links">Code:
          <button type="button" class="ex-link" data-anchors="exec.novac.1202">find a core set</button>
          <button type="button" class="ex-link" data-anchors="exec.findvac.1201">find a VAC area</button>
          <button type="button" class="ex-link" data-anchors="exec.setloc,exec.ej1">priority compare</button>
          <button type="button" class="ex-link" data-anchors="restart.enema,restart.wipe-exec,restart.goprog3">software restart</button>
          <button type="button" class="ex-link" data-anchors="exec.job.servicer,restart.servicer">SERVICER</button>
        </p>
        <p class="ex-model-note">Behavioural model: the counts, priorities, search order and restart rules follow the listing; the CPU cost of each job is calibrated to the published duty-cycle margins, not measured.</p>
      </section>

      <p class="ex-empty" data-role="empty" hidden>Start a scenario or the interactive mode to see the Executive at work.</p>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const el = {
    board: q('[data-role="board"]'),
    links: q('[data-role="links"]'),
    cores: q('[data-role="cores"]'),
    vacs: q('[data-role="vacs"]'),
    waitlist: q('[data-role="waitlist"]'),
    groups: q('[data-role="groups"]'),
    bar: q('[data-role="bar"]'),
    legend: q('[data-role="legend"]'),
    sparkLine: q('[data-role="sparkLine"]'),
    sparkArea: q('[data-role="sparkArea"]'),
    sparkMarks: q('[data-role="sparkMarks"]'),
    log: q('[data-role="log"]'),
    bounce: q('[data-role="bounce"]'),
    sweep: q('[data-role="sweep"]'),
    held: q('[data-role="held"]'),
    empty: q('[data-role="empty"]'),
  };
  const k = {};
  for (const node of root.querySelectorAll('[data-k]')) k[node.dataset.k] = node;

  // ---------- static pieces built once ----------

  const segs = LOAD_LEGEND.map((g) => {
    const s = doc.createElement('span');
    s.className = `ex-seg g-${g.group}`;
    s.title = g.label;
    el.bar.append(s);
    const li = doc.createElement('li');
    li.className = 'ex-legend-item';
    li.innerHTML = `<span class="ex-sw g-${g.group}" aria-hidden="true"></span><span class="ex-legend-label">${g.short}</span> <span class="ex-legend-val">0%</span>`;
    li.title = g.label;
    el.legend.append(li);
    return { group: g.group, seg: s, val: li.querySelector('.ex-legend-val'), last: -1, lastText: '' };
  });
  const line100 = doc.createElement('span');
  line100.className = 'ex-bar-line';
  el.bar.append(line100);

  // Cards are (re)built when the number of core sets changes (LM 8 / CM 7).
  let coreCards = [];
  let vacCards = [];
  let wlSlots = [];
  let groupChips = [];

  function buildCards(nCores, nVacs) {
    el.cores.textContent = '';
    el.vacs.textContent = '';
    coreCards = [];
    vacCards = [];
    for (let i = 0; i < nCores; i++) {
      const li = doc.createElement('li');
      li.className = 'ex-card ex-core is-free';
      li.innerHTML = `
        <div class="ex-card-top"><span class="ex-slot">Set ${i}</span><span class="ex-vacchip" hidden></span></div>
        <div class="ex-job">free</div>
        <div class="ex-state"></div>
        <div class="ex-meta"><span class="ex-prio"></span><span class="ex-age"></span></div>
        <div class="ex-prog" aria-hidden="true"><span></span></div>`;
      if (i === 0) li.title = 'Core set 0 always holds the running job (CHANJOB swaps the chosen job into it)';
      el.cores.append(li);
      coreCards.push({
        li,
        state: li.querySelector('.ex-state'),
        job: li.querySelector('.ex-job'),
        prio: li.querySelector('.ex-prio'),
        age: li.querySelector('.ex-age'),
        prog: li.querySelector('.ex-prog > span'),
        vac: li.querySelector('.ex-vacchip'),
        key: null, ageText: '', progW: -1,
      });
    }
    for (let i = 0; i < nVacs; i++) {
      const li = doc.createElement('li');
      li.className = 'ex-card ex-vac is-free';
      li.innerHTML = `<div class="ex-card-top"><span class="ex-slot">VAC ${i + 1}</span></div><div class="ex-job">free</div><div class="ex-meta"><span class="ex-owner"></span></div>`;
      el.vacs.append(li);
      vacCards.push({ li, job: li.querySelector('.ex-job'), owner: li.querySelector('.ex-owner'), key: null });
    }
    el.cores.style.setProperty('--cores', String(nCores));
    k.coresCount.textContent = `0 / ${nCores}`;
    k.vacsCount.textContent = `0 / ${nVacs}`;
    linksSig = null;
  }

  function buildWaitlist(n) {
    el.waitlist.textContent = '';
    wlSlots = [];
    for (let i = 0; i < n; i++) {
      const li = doc.createElement('li');
      li.className = 'ex-slotchip is-free';
      li.textContent = '·';
      el.waitlist.append(li);
      wlSlots.push({ li, text: '·' });
    }
  }

  function buildGroups(n) {
    el.groups.textContent = '';
    groupChips = [];
    for (let g = 1; g <= n; g++) {
      const li = doc.createElement('li');
      li.className = 'ex-group';
      li.innerHTML = `<span class="ex-group-n">${g}</span><span class="ex-group-p">${g}.0</span>`;
      el.groups.append(li);
      groupChips.push({ li, p: li.querySelector('.ex-group-p'), key: null });
    }
  }

  // ---------- events ----------

  const onClick = (ev) => {
    const btn = ev.target.closest('button[data-anchors]');
    if (!btn || !bus) return;
    const anchors = btn.dataset.anchors.split(',').filter(Boolean);
    if (anchors.length) bus.emit('source:show', { anchors });
  };
  root.addEventListener('click', onClick);

  // ---------- render state ----------

  let shape = '';
  let linksSig = null;
  let lastOverflowT = null;
  let lastRestartCount = null;
  let holdUntil = 0;
  let sweepPending = false;
  let lastHistLen = -1;
  let lastHistT = null;
  let lastMarksKey = '';
  let logKey = '';
  let wasNull = null;
  let sw = '';

  function resetRun() {
    lastOverflowT = null;
    lastRestartCount = null;
    holdUntil = 0;
    sweepPending = false;
    el.bounce.hidden = true;
    el.held.hidden = true;
    el.board.classList.remove('is-held', 'is-sweeping');
    lastHistLen = -1;
    logKey = '';
    linksSig = null;
  }
  const offs = bus ? [bus.on('sim:reset', resetRun), bus.on('app:mode', resetRun)] : [];

  const ro = win && typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => { linksSig = null; }) : null;
  if (ro) ro.observe(el.board);

  // ---------- render ----------

  function render(snapshot) {
    const agc = snapshot && snapshot.agc;
    const ex = agc && agc.exec;
    const isNull = !ex;
    if (isNull !== wasNull) {
      wasNull = isNull;
      el.empty.hidden = !isNull;
      root.querySelector('.ex').classList.toggle('is-empty', isNull);
    }
    if (isNull) return;

    const t = typeof snapshot.t === 'number' ? snapshot.t : ex.t;
    const software = agc.software || ex.software || 'Luminary099';
    if (software !== sw) {
      sw = software;
      k.sw.textContent = software === 'Comanche055' ? 'Comanche 055 · CM' : 'Luminary 099 · LM';
    }

    const s = `${ex.coreSets.length}/${ex.vacs.length}`;
    if (s !== shape) {
      shape = s;
      buildCards(ex.coreSets.length, ex.vacs.length);
      buildWaitlist(ex.waitlistSlots || 9);
      buildGroups(((agc.restart && agc.restart.groups) || []).length || 6);
    }

    // Overflow → bounce + hold; restart → sweep.
    const ov = ex.lastOverflow;
    const real = now();
    if (ov && ov.t !== lastOverflowT) {
      const fresh = lastOverflowT !== null || (t - ov.t < 1.5);
      lastOverflowT = ov.t;
      if (fresh && t - ov.t < 3) startBounce(ov, real);
    }
    const rc = agc.restart ? agc.restart.count : 0;
    if (lastRestartCount === null) lastRestartCount = rc;
    if (rc !== lastRestartCount) {
      lastRestartCount = rc;
      if (!reducedMotion()) sweepPending = true;
    }
    const holding = real < holdUntil;
    if (holding) {
      if (heldBoard) renderBoard(heldBoard, t);
    } else {
      heldBoard = null;
      if (el.board.classList.contains('is-held')) {
        el.board.classList.remove('is-held');
        el.held.hidden = true;
      }
      if (sweepPending) {
        sweepPending = false;
        el.board.classList.remove('is-sweeping');
        void el.board.offsetWidth; // restart the CSS animation
        el.board.classList.add('is-sweeping');
        win.setTimeout(() => el.board.classList.remove('is-sweeping'), 900);
      }
      renderBoard(ex, t);
    }

    renderChips(ex, agc);
    renderWaitlist(ex);
    renderGroups(agc.restart);
    renderLoad(ex, t, agc.alarms);
    renderLog(agc.alarms, agc.restart, software);
  }

  let heldBoard = null;

  function startBounce(ov, real) {
    heldBoard = ov.board || null;
    const code = formatAlarmCode(ov.code);
    k.bounceReq.textContent = `${ov.name || 'job'} · ${prioText(ov.prio)}${ov.vac ? ' · needs VAC' : ''}`;
    k.bounceCode.textContent = code;
    el.bounce.className = `ex-bounce ${ov.code === 0o1201 ? 'at-vacs' : 'at-cores'}`;
    el.bounce.hidden = false;
    void el.bounce.offsetWidth;
    el.bounce.classList.add('is-on');
    if (!reducedMotion()) {
      holdUntil = real + 1400;
      el.board.classList.add('is-held');
      el.held.hidden = false;
      el.held.textContent = `${code}: ${ov.code === 0o1201 ? 'no VAC area free' : (ov.code === 0o1203 ? 'Waitlist full' : 'no core set free')} → software restart`;
    }
    win.setTimeout(() => { el.bounce.hidden = true; el.bounce.classList.remove('is-on'); }, reducedMotion() ? 2500 : 1800);
  }

  function renderBoard(ex, t) {
    let used = 0;
    let sig = '';
    for (let i = 0; i < coreCards.length; i++) {
      const c = coreCards[i];
      const job = ex.coreSets[i] && ex.coreSets[i].job;
      const key = jobKey(job);
      if (job) used += 1;
      if (key !== c.key) {
        const wasFree = !c.key;
        const otherJob = job && (!c.key || c.key.split('|')[0] !== String(job.id));
        c.key = key;
        if (!job) {
          c.li.className = 'ex-card ex-core is-free';
          if (!wasFree) c.li.classList.add('is-freed');
          c.job.textContent = 'free';
          c.state.textContent = '';
          c.prio.textContent = '';
          c.age.textContent = '';
          c.ageText = '';
          c.vac.hidden = true;
          c.li.setAttribute('aria-label', `Core set ${i}: free`);
        } else {
          c.li.className = `ex-card ex-core g-${job.group} st-${job.state.toLowerCase()}`;
          // A job just created pops in; one that was only swapped into
          // this core set (CHANJOB) gets a quieter flash.
          if (otherJob) c.li.classList.add(job.age < 0.3 ? 'is-new' : 'is-moved');
          c.job.textContent = job.name;
          c.state.textContent = STATE_TEXT[job.state] || job.state;
          c.prio.textContent = prioText(job.prio);
          if (job.vacIndex !== null && job.vacIndex !== undefined) {
            c.vac.hidden = false;
            c.vac.textContent = `VAC ${job.vacIndex + 1}`;
          } else {
            c.vac.hidden = true;
          }
          c.li.setAttribute('aria-label', `Core set ${i}: ${job.name}, ${prioText(job.prio).toLowerCase()}, ${job.state.toLowerCase()}${job.vacIndex !== null && job.vacIndex !== undefined ? `, holds VAC area ${job.vacIndex + 1}` : ''}`);
        }
      }
      if (job) {
        const a = ageText(job.age);
        if (a !== c.ageText) { c.ageText = a; c.age.textContent = a; }
        const w = Math.round((job.progress || 0) * 100);
        if (w !== c.progW) { c.progW = w; c.prog.style.width = `${w}%`; }
        if (job.vacIndex !== null && job.vacIndex !== undefined) sig += `${i}>${job.vacIndex}:${job.group};`;
      }
    }
    k.coresCount.textContent = `${used} / ${coreCards.length}`;
    k.coresCount.classList.toggle('is-full', used >= coreCards.length);

    let vused = 0;
    for (let i = 0; i < vacCards.length; i++) {
      const v = vacCards[i];
      const ref = ex.vacs[i] && ex.vacs[i].job;
      const owner = ref ? ex.coreSets.find((c) => c.job && c.job.id === ref.id) : null;
      const key = ref ? `${ref.id}|${ref.name}|${owner ? owner.index : ''}|${owner && owner.job ? owner.job.group : ''}` : '';
      if (ref) vused += 1;
      if (key !== v.key) {
        const wasFree = !v.key;
        v.key = key;
        if (!ref) {
          v.li.className = `ex-card ex-vac is-free${wasFree ? '' : ' is-freed'}`;
          v.job.textContent = 'free';
          v.owner.textContent = '';
          v.li.setAttribute('aria-label', `VAC area ${i + 1}: free`);
        } else {
          v.li.className = `ex-card ex-vac g-${owner && owner.job ? owner.job.group : 'other'} is-new`;
          v.job.textContent = ref.name;
          v.owner.textContent = owner ? `core set ${owner.index}` : '';
          v.li.setAttribute('aria-label', `VAC area ${i + 1}: ${ref.name}${owner ? `, core set ${owner.index}` : ''}`);
        }
      }
    }
    k.vacsCount.textContent = `${vused} / ${vacCards.length}`;
    k.vacsCount.classList.toggle('is-full', vused >= vacCards.length);

    if (sig !== linksSig) {
      linksSig = sig;
      drawLinks(ex);
    }
  }

  // Lines from each VAC-holding job's core set card to its VAC card.
  function drawLinks(ex) {
    const svg = el.links;
    const b = el.board.getBoundingClientRect();
    if (!b.width) { svg.innerHTML = ''; return; }
    svg.setAttribute('viewBox', `0 0 ${b.width.toFixed(0)} ${b.height.toFixed(0)}`);
    let html = '';
    for (let i = 0; i < coreCards.length; i++) {
      const job = ex.coreSets[i] && ex.coreSets[i].job;
      if (!job || job.vacIndex === null || job.vacIndex === undefined || !vacCards[job.vacIndex]) continue;
      const a = coreCards[i].li.getBoundingClientRect();
      const v = vacCards[job.vacIndex].li.getBoundingClientRect();
      const x1 = a.left + a.width / 2 - b.left;
      const y1 = a.bottom - b.top - 2;
      const x2 = v.left + v.width / 2 - b.left;
      const y2 = v.top - b.top + 2;
      const my = (y1 + y2) / 2;
      html += `<path class="ex-link-line g-${job.group}" d="M${x1.toFixed(1)},${y1.toFixed(1)} C${x1.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}"/>`;
    }
    svg.innerHTML = html;
  }

  let chipsKey = '';
  function renderChips(ex, agc) {
    const run = ex.running;
    const steal = (ex.steal && ex.steal.rrCdu) || 0;
    const rc = agc.restart ? agc.restart.count : 0;
    const key = `${run ? `${run.name}|${run.prio}` : '-'}|${steal}|${rc}|${ex.idle}`;
    if (key === chipsKey) return;
    chipsKey = key;
    k.running.textContent = run ? `CPU: ${run.name} (${prioText(run.prio)})` : 'CPU: idle (DUMMYJOB)';
    k.running.classList.toggle('is-idle', !run);
    k.steal.textContent = `RR CDU steal ${pct(steal)}`;
    k.steal.classList.toggle('is-on', steal > 0);
    k.restarts.textContent = `${rc} restart${rc === 1 ? '' : 's'}`;
    k.restarts.classList.toggle('is-on', rc > 0);
  }

  function renderWaitlist(ex) {
    const tasks = ex.waitlist || [];
    k.wlCount.textContent = `${tasks.length} / ${wlSlots.length}`;
    for (let i = 0; i < wlSlots.length; i++) {
      const task = tasks[i];
      const text = task ? `${task.name} ${task.dueIn < 1 ? task.dueIn.toFixed(2) : task.dueIn.toFixed(1)} s` : '·';
      const s = wlSlots[i];
      if (text !== s.text) {
        s.text = text;
        s.li.textContent = text;
        s.li.className = task ? 'ex-slotchip' : 'ex-slotchip is-free';
      }
    }
  }

  function renderGroups(restart) {
    const groups = (restart && restart.groups) || [];
    for (let i = 0; i < groupChips.length; i++) {
      const g = groups[i];
      const c = groupChips[i];
      const key = g ? `${g.active}|${g.phase}|${g.label}` : '';
      if (key === c.key) continue;
      c.key = key;
      c.li.classList.toggle('is-active', !!(g && g.active));
      c.p.textContent = g && g.active ? g.phase : `${i + 1}.0`;
      c.li.title = g && g.active ? `Group ${i + 1}, phase ${g.phase}${g.label ? `: ${g.label}` : ''}` : `Group ${i + 1}: not active`;
    }
  }

  function renderLoad(ex, t, alarms) {
    const load = ex.load || {};
    for (const p of loadSegments(load)) {
      const s = segs.find((x) => x.group === p.group);
      const w = Math.round(p.width * 10) / 10;
      if (w !== s.last) {
        s.last = w;
        s.seg.style.width = `${w}%`;
      }
      const txt = pct(p.fraction);
      if (txt !== s.lastText) { s.lastText = txt; s.val.textContent = txt; }
    }
    const busy = pct(load.total || 0);
    if (k.busy.textContent !== `busy ${busy}`) k.busy.textContent = `busy ${busy}`;
    el.bar.setAttribute('aria-label', `CPU load over the last second: ${busy} busy`);
    const copies = ex.coreSets.filter((c) => c.job && c.job.group === 'servicer' && (c.job.name === 'SERVICER' || c.job.name === 'GUIDANCE')).length;
    const waiting = ex.coreSets.filter((c) => c.job && c.job.name === 'MAKEPLAY' && c.job.state !== 'RUNNING').length;
    let backlog = ex.backlogMs > 0.5 ? `Work still to do: ${Math.round(ex.backlogMs)} ms of CPU time.` : 'Nothing waiting.';
    if (copies > 1) backlog += ` ${copies} copies of SERVICER: the older ones could not finish before READACCS started another.`;
    if (waiting > 1) backlog += ` ${waiting} display jobs wait at SERVICER's priority.`;
    if (k.backlog.textContent !== backlog) k.backlog.textContent = backlog;

    const h = ex.history || [];
    const lastT = h.length ? h[h.length - 1].t : null;
    if (h.length !== lastHistLen || lastT !== lastHistT) {
      lastHistLen = h.length;
      lastHistT = lastT;
      const ref = lastT !== null ? lastT : t;
      const pts = h.filter((x) => ref - x.t <= 120);
      const d = sparkPath(pts, ref, { width: 300, height: 40 });
      el.sparkLine.setAttribute('d', d);
      const x0 = pts.length ? 300 - ((ref - pts[0].t) / 120) * 300 : 300;
      el.sparkArea.setAttribute('d', d ? `${d}L300,40L${x0.toFixed(1)},40Z` : '');
      const marks = ((alarms && alarms.history) || []).filter((a) => ref - a.t <= 120 && a.t <= ref + 0.5);
      const mk = marks.map((a) => `${a.t}:${a.code}`).join(',') + `@${Math.round(ref * 4)}`;
      if (mk !== lastMarksKey) {
        lastMarksKey = mk;
        el.sparkMarks.innerHTML = marks.map((a) => {
          const x = (300 - ((ref - a.t) / 120) * 300).toFixed(1);
          return `<g class="ex-spark-mark"><line x1="${x}" y1="0" x2="${x}" y2="44"></line><title>${formatGET(a.t)} ${formatAlarmCode(a.code)}</title></g>`;
        }).join('');
      }
    }
  }

  function renderLog(alarms, restart, software) {
    const rows = buildLog(alarms, restart, software);
    const key = rows.map((r) => r.key).join(',');
    if (key === logKey) return;
    logKey = key;
    el.log.textContent = '';
    if (!rows.length) {
      const li = doc.createElement('li');
      li.className = 'ex-log-empty';
      li.textContent = 'No alarms yet.';
      el.log.append(li);
      return;
    }
    for (const r of rows) {
      const li = doc.createElement('li');
      li.className = `ex-log-row cls-${r.cls}`;
      const get = doc.createElement('span');
      get.className = 'ex-log-t';
      get.textContent = formatGET(r.t);
      const code = doc.createElement('span');
      code.className = 'ex-log-code';
      code.textContent = r.code;
      const text = doc.createElement('span');
      text.className = 'ex-log-text';
      text.textContent = r.text;
      const kind = doc.createElement('span');
      kind.className = 'ex-log-kind';
      kind.textContent = r.kind;
      li.append(get, code, text, kind);
      if (r.anchor) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'ex-link';
        b.dataset.anchors = r.cls === 'restart' ? `${r.anchor},alarm.bailout1,restart.enema` : r.anchor;
        b.textContent = 'code';
        b.setAttribute('aria-label', `Show the code for ${r.code}`);
        li.append(b);
      }
      el.log.append(li);
    }
  }

  function destroy() {
    for (const off of offs) off();
    if (ro) ro.disconnect();
    root.removeEventListener('click', onClick);
    root.innerHTML = '';
  }

  return { render, destroy };
}
