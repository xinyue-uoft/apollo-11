// Crew controls view: the LM crew-station controls the simulator supports
// (ARCHITECTURE §11.3) — ROD switch, LPD hand-controller clicks, PGNS mode
// (AUTO / ATT HOLD), the rendezvous-radar switch fault that reproduces
// Apollo 11's CDU cycle stealing, and ENGINE STOP.
//
// Interactive mode: live buttons → `ctx.app.crewInput(name, value)`.
// Demo mode: the same controls, disabled, showing the replay's state (and
// briefly highlighting any control the crew operates).
// The Command Module has none of these (they are LM-only), so the view
// shows a short note instead.
//
// Everything above `mountCrew` is DOM-free (node:test imports it).

import { toFps } from '../util/units.js';

// Source facts used in the help text (checked against Luminary099):
// - ROD: "BIT 7 MEANS - RATE INCREMENT, BIT 6 + INCREMENT" (DESCBITS,
//   LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:1223-1228); each click is scaled
//   by the pad-loaded RODSCALE ("CLICK SCALE FACTOR FOR ROD",
//   ERASABLE_ASSIGNMENTS.agc:1391) = 1.0 ft/s for Apollo 11
//   (research/web-trajectory-b.md §4.2); RODCOMP adds the clicks to the
//   desired altitude rate VDGVERT (…GUIDANCE_EQUATIONS.agc:948-953).
// - P66 entry: in attitude hold, a ROD click switches to P66 (P66NOW?,
//   …GUIDANCE_EQUATIONS.agc:200-208); in AUTO the clicks are discarded
//   (GUILDRET zeroes RODCOUNT, :224-225).
// - LPD: each left/right click moves the site 2° in azimuth, each fore/aft
//   click 0.5° in elevation (AZEACH / ELEACH, :1211-1212); clicks are
//   ignored in attitude hold (COUNT'EM, :1174-1178) and outside P64
//   (PITFALL, :1130-1134).
export const ROD_STEP_FPS = 1.0;
export const LPD_AZ_STEP_DEG = 2;
export const LPD_EL_STEP_DEG = 0.5;

// The contract keeps internal quantities in SI; `crew.rodRate` is the
// commanded altitude rate (m/s) → ft/s for display.
export function rodRateFps(rodRate) {
  return Number.isFinite(rodRate) ? toFps(rodRate) : null;
}

export function fmtRate(fps) {
  if (!Number.isFinite(fps)) return '—';
  const r = Math.round(fps * 10) / 10;
  const s = Math.abs(r).toFixed(1);
  return r > 0 ? `+${s}` : r < 0 ? `−${s}` : '0.0';
}

// Pure view model of the crew panel.
export function crewModel(snap, appMode) {
  if (!snap) return { visible: 'none', readOnly: true };
  if (snap.software === 'Comanche055') return { visible: 'cm', readOnly: appMode !== 'interactive' };
  const crew = snap.agc?.crew || {};
  const lpd = snap.agc?.guidance?.lpd || null;
  const clicks = crew.lpdClicks || { dx: 0, dy: 0 };
  return {
    visible: 'lm',
    readOnly: appMode !== 'interactive',
    mode: snap.agc?.mode ?? null,
    rodFps: rodRateFps(crew.rodRate),
    pgnsMode: crew.pgnsMode === 'attHold' ? 'attHold' : crew.pgnsMode === 'auto' ? 'auto' : null,
    rrFault: typeof crew.rrFault === 'boolean' ? crew.rrFault : null,
    lpd: {
      dx: Number.isFinite(clicks.dx) ? clicks.dx : 0,
      dy: Number.isFinite(clicks.dy) ? clicks.dy : 0,
      angle: Number.isFinite(lpd?.angle) ? lpd.angle : null,
      time: Number.isFinite(lpd?.time) ? lpd.time : null,
    },
    engineOn: !!snap.vehicle?.engineOn,
    engineStop: crew.engineStop === true,
    landed: !!snap.vehicle?.landed,
  };
}

// One-line context hint for the ROD/LPD controls, per program and mode.
export function crewHint(model) {
  if (model.visible !== 'lm') return '';
  if (model.landed) return 'On the surface: the descent controls no longer do anything.';
  if (model.mode === 66) return 'P66: each ROD click changes the commanded descent rate by 1 ft/s; the AGC holds that rate.';
  if (model.mode === 64) {
    return model.pgnsMode === 'attHold'
      ? 'P64 in ATT HOLD: a ROD click switches to P66 (as Armstrong did at 102:43:22). LPD clicks are ignored in attitude hold.'
      : 'P64: after PRO on the flashing V06N64, LPD clicks redesignate the landing site. For P66, select ATT HOLD and click ROD.';
  }
  if (model.mode === 63) return 'P63: the computer flies the braking phase. ROD and LPD clicks have no effect yet.';
  return 'These controls matter in the landing programs (P64, P66).';
}

// research/src-executive.md §10.1 (Eyles 2004) and research/web-timeline-b.md
// D12 (Mission Report §16.2.5).
const RR_HELP = 'Reproduces Apollo 11’s rendezvous-radar switch setting: the RR angle counters stole '
  + 'about 13–15 % of the computer’s time — the extra load behind the 1201/1202 alarms.';
const RR_MORE = 'The RR mode switch was out of the LGC position (AUTO TRACK, later SLEW). Because the radar’s '
  + '800 Hz excitation was not phase-locked to the CDUs, the RR CDU counters ran at their maximum rate '
  + '(6,400 pulses/s per angle), each pulse taking one 11.7 µs memory cycle (Eyles 2004; Mission Report §16.2.5).';

// ---------- mount ----------

export function mountCrew(root, ctx) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const { bus, app } = ctx;

  root.innerHTML = `
    <h2 class="panel-title"><span>Crew station</span><span class="crew-badge" data-k="badge">—</span></h2>
    <div class="crew" data-spot="crew">
      <p class="crew-ro" data-role="ro" hidden>Replay: the controls show what the crew did. Switch to <b>Interactive</b> to fly the descent yourself.</p>
      <p class="crew-empty" data-role="empty" hidden>No simulation running.</p>
      <div class="crew-lm" data-role="lm">
        <div class="crew-row">
          <section class="crew-ctl crew-rod" data-spot="crew.rod" aria-labelledby="crew-rod-h">
            <h3 id="crew-rod-h">ROD switch</h3>
            <div class="rod-box">
              <button type="button" class="btn crew-btn" data-act="rodUp" aria-label="ROD switch up: descend 1 foot per second slower">▲ <span>+1 ft/s</span></button>
              <output class="crew-out" data-k="rod" aria-live="off" title="Commanded altitude rate (P66)">—</output>
              <button type="button" class="btn crew-btn" data-act="rodDown" aria-label="ROD switch down: descend 1 foot per second faster">▼ <span>−1 ft/s</span></button>
            </div>
            <p class="crew-sub">commanded ḣ</p>
          </section>
          <section class="crew-ctl crew-lpd" data-spot="crew.lpd" aria-labelledby="crew-lpd-h">
            <h3 id="crew-lpd-h">LPD clicks</h3>
            <div class="lpd-pad" role="group" aria-label="Landing point designator hand-controller clicks">
              <button type="button" class="btn crew-btn lpd-up" data-act="lpdFwd" aria-label="Hand controller forward: move the landing site 0.5 degrees farther">▲</button>
              <button type="button" class="btn crew-btn lpd-left" data-act="lpdLeft" aria-label="Hand controller left: move the landing site 2 degrees left">◀</button>
              <span class="lpd-hub" aria-hidden="true"></span>
              <button type="button" class="btn crew-btn lpd-right" data-act="lpdRight" aria-label="Hand controller right: move the landing site 2 degrees right">▶</button>
              <button type="button" class="btn crew-btn lpd-down" data-act="lpdAft" aria-label="Hand controller aft: move the landing site 0.5 degrees nearer">▼</button>
            </div>
            <p class="crew-sub"><span data-k="lpdClicks">az 0 · el 0</span><br><span data-k="lpdAngle">LPD —</span></p>
          </section>
        </div>
        <div class="crew-row crew-row-2">
          <section class="crew-ctl crew-pgns" aria-labelledby="crew-pgns-h">
            <h3 id="crew-pgns-h">PGNS mode control</h3>
            <div class="seg" role="radiogroup" aria-labelledby="crew-pgns-h">
              <button type="button" class="seg-btn" role="radio" aria-checked="false" data-act="pgnsAuto">AUTO</button>
              <button type="button" class="seg-btn" role="radio" aria-checked="false" data-act="pgnsAtt">ATT HOLD</button>
            </div>
          </section>
          <section class="crew-ctl crew-stop" aria-label="Engine stop">
            <button type="button" class="btn crew-stop-btn" data-act="engineStop">ENGINE<br>STOP</button>
          </section>
        </div>
        <section class="crew-ctl crew-rr" data-spot="crew.rr" aria-labelledby="crew-rr-h">
          <div class="crew-rr-head">
            <h3 id="crew-rr-h">RR switch fault</h3>
            <button type="button" class="switch" role="switch" aria-checked="false" data-act="rr" aria-describedby="crew-rr-help">
              <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
              <span data-k="rrText">RR CDU cycle stealing: off</span>
            </button>
          </div>
          <p class="crew-help" id="crew-rr-help">${RR_HELP}</p>
        </section>
        <p class="crew-hint" data-k="hint" aria-live="polite"></p>
        <details class="crew-more">
          <summary>How the controls work</summary>
          <ul>
            <li><b>ROD</b> (rate of descent) — a spring-loaded toggle on the thrust/translation controller. Each click changes P66’s commanded descent rate by ${ROD_STEP_FPS} ft/s (RODSCALE, Apollo 11 pad load). Up = slower, down = faster.</li>
            <li><b>LPD</b> — in P64, after PRO on the flashing V06N64, clicks of the attitude hand controller move the landing site: ${LPD_AZ_STEP_DEG}° per left/right click, ${LPD_EL_STEP_DEG}° per fore/aft click. The DSKY’s N64 R1 shows the time left for redesignation and the LPD angle to read against the window reticle.</li>
            <li><b>ATT HOLD</b> — attitude hold (manual attitude). With ATT HOLD selected, the first ROD click switches the computer to P66, as on Apollo 11 at 102:43:22.</li>
            <li><b>ENGINE STOP</b> — shuts the descent engine down (after touchdown, or to stop a burn).</li>
            <li><b>RR switch fault</b> — ${RR_MORE}</li>
          </ul>
          <p class="crew-note">Simplified: switch positions are modelled as the discretes the AGC reads; the real panel had more positions and interlocks.</p>
        </details>
      </div>
      <p class="crew-cm" data-role="cm" hidden>The Command Module’s crew-station controls are not modelled. Fly the CM chapter from the DSKY: the P40 burn needs only <kbd>PRO</kbd> on the flashing V99.</p>
    </div>`;

  const q = (s) => root.querySelector(s);
  const K = {};
  for (const n of root.querySelectorAll('[data-k]')) K[n.dataset.k] = n;
  const btn = {};
  for (const b of root.querySelectorAll('[data-act]')) btn[b.dataset.act] = b;
  const el = { ro: q('[data-role="ro"]'), empty: q('[data-role="empty"]'), lm: q('[data-role="lm"]'), cm: q('[data-role="cm"]') };
  const sections = {
    rod: q('[data-spot="crew.rod"]'),
    lpd: q('[data-spot="crew.lpd"]'),
    pgns: q('.crew-pgns'),
    rr: q('[data-spot="crew.rr"]'),
    stop: q('.crew-stop'),
  };

  const cache = new Map();
  const set = (key, text) => {
    if (cache.get(key) === text) return;
    cache.set(key, text);
    K[key].textContent = text;
  };
  const once = (key, value, fn) => {
    if (cache.get(key) === value) return;
    cache.set(key, value);
    fn(value);
  };

  let model = null;
  const flashTimers = new Map();

  const send = (name, value) => {
    if (!model || model.readOnly) return;
    app?.crewInput?.(name, value);
  };
  const actions = {
    rodUp: () => send('rodClick', +1),
    rodDown: () => send('rodClick', -1),
    // dx: +1 = right, dy: +1 = forward (site farther downrange).
    lpdFwd: () => send('lpd', { dx: 0, dy: +1 }),
    lpdAft: () => send('lpd', { dx: 0, dy: -1 }),
    lpdLeft: () => send('lpd', { dx: -1, dy: 0 }),
    lpdRight: () => send('lpd', { dx: +1, dy: 0 }),
    pgnsAuto: () => send('pgnsMode', 'auto'),
    pgnsAtt: () => send('pgnsMode', 'attHold'),
    rr: () => send('rrFault', !(model?.rrFault)),
    engineStop: () => send('engineStop', true),
  };
  const onClick = (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || !root.contains(b) || b.disabled) return;
    actions[b.dataset.act]?.();
  };
  root.addEventListener('click', onClick);

  // Arrow keys move between the two PGNS radio buttons (radiogroup pattern).
  const seg = q('.seg');
  seg.addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return;
    ev.preventDefault();
    const target = ev.target === btn.pgnsAuto ? btn.pgnsAtt : btn.pgnsAuto;
    target.focus();
    if (!target.disabled) target.click();
  });

  function flash(section) {
    if (!section) return;
    section.classList.remove('crew-changed');
    void section.offsetWidth;
    section.classList.add('crew-changed');
    clearTimeout(flashTimers.get(section));
    flashTimers.set(section, win.setTimeout(() => section.classList.remove('crew-changed'), 1600));
  }

  function render(snap, ui) {
    const appMode = ui?.mode ?? app?.mode ?? 'demo';
    model = crewModel(snap, appMode);
    once('vis', model.visible, (v) => {
      el.lm.hidden = v !== 'lm';
      el.cm.hidden = v !== 'cm';
      el.empty.hidden = v !== 'none';
    });
    once('ro', model.readOnly && model.visible === 'lm', (ro) => { el.ro.hidden = !ro; });
    set('badge', model.visible === 'none' ? '—' : model.readOnly ? 'Replay · read-only' : 'Interactive');
    if (model.visible !== 'lm') return;

    once('disabled', model.readOnly, (ro) => {
      for (const b of Object.values(btn)) {
        b.disabled = ro;
        if (ro) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
      }
    });

    set('rod', model.rodFps === null ? '—' : `${fmtRate(model.rodFps)} ft/s`);
    const { dx, dy, angle, time } = model.lpd;
    set('lpdClicks', `az ${dx > 0 ? '+' : ''}${dx} · el ${dy > 0 ? '+' : ''}${dy}`);
    set('lpdAngle', angle === null ? 'LPD —' : `LPD ${Math.round(angle)}°${time !== null ? ` · ${Math.max(0, Math.round(time))} s left` : ''}`);
    once('pgns', model.pgnsMode, (m) => {
      btn.pgnsAuto.setAttribute('aria-checked', String(m === 'auto'));
      btn.pgnsAtt.setAttribute('aria-checked', String(m === 'attHold'));
      btn.pgnsAuto.tabIndex = m === 'attHold' ? -1 : 0;
      btn.pgnsAtt.tabIndex = m === 'attHold' ? 0 : -1;
    });
    once('rr', model.rrFault, (on) => {
      btn.rr.setAttribute('aria-checked', String(!!on));
      K.rrText.textContent = `RR CDU cycle stealing: ${on === null ? '—' : on ? 'on' : 'off'}`;
    });
    once('stop', model.engineOn, (on) => {
      btn.engineStop.dataset.live = String(on);
    });
    set('hint', crewHint(model));

    once('stopped', model.engineStop, (on) => {
      btn.engineStop.dataset.stopped = String(!!on);
      btn.engineStop.setAttribute('aria-label', on ? 'Engine stop (pressed: the engine is commanded off)' : 'Engine stop');
    });
  }

  // In replays, highlight the control the crew just operated (the computer
  // model announces every crew-station input on the bus as 'crew').
  const SECTION_FOR = { rodClick: 'rod', lpd: 'lpd', pgnsMode: 'pgns', rrFault: 'rr', engineStop: 'stop' };
  const offs = [
    bus.on('crew', ({ name } = {}) => {
      if (!model?.readOnly || model.visible !== 'lm') return;
      flash(sections[SECTION_FOR[name]]);
    }),
  ];

  return {
    render,
    destroy() {
      for (const off of offs) off();
      for (const t of flashTimers.values()) clearTimeout(t);
      root.removeEventListener('click', onClick);
      root.innerHTML = '';
    },
  };
}
