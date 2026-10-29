// Crew controls view: the LM crew-station controls the simulator supports
// (ARCHITECTURE §11.3) — ROD switch, LPD hand-controller clicks, PGNS mode
// (AUTO / ATT HOLD), the rendezvous-radar switch fault that reproduces
// Apollo 11's CDU cycle stealing, and ENGINE STOP (a toggle: press to
// command the engine off, press again to release it).
//
// Interactive mode: live buttons → `ctx.app.crewInput(name, value)`.
// Demo mode: the same controls, disabled, showing the replay's state (and
// briefly highlighting any control the crew operates).
// The Command Module has none of these (they are LM-only); it gets the SPS
// ΔV THRUST switch (crewInput 'engineStop'), which P40 reads as an engine
// failure. A DSKY-only (static) vehicle gets a one-line note.
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
//   …GUIDANCE_EQUATIONS.agc:200-208) — from P63, P64 or P65 once landing
//   guidance runs (GUILDENSTERN, research/src-landing.md §8); in AUTO the
//   clicks are discarded (GUILDRET zeroes RODCOUNT, :224-225). P66 in
//   Luminary099 has only the vertical channel: attitude is manual (§5.9).
// - LPD: each left/right click moves the site 2° in azimuth, each fore/aft
//   click 0.5° in elevation (AZEACH / ELEACH, :1211-1212); clicks are
//   ignored in attitude hold (COUNT'EM, :1174-1178) and outside P64
//   (PITFALL, :1130-1134). The LPD angle/time (N64 R1) is meaningful in
//   P64 only.
// - P65 (P65START / P65VERT, :252-258, :897-913): nulls the horizontal
//   velocity and descends at 3 ft/s; ATT HOLD + a ROD click → P66.
// - CM: with the ΔV THRUST switches off, P40's thrust check (S40.8, LOTHRUST)
//   flashes V97N40; its responses are V34 terminate, PRO proceed, ENTR
//   re-ignite (FAILDSP, Comanche055/P40-P47.agc:939-944, :1007-1135).
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

// Pure view model of the crew panel. `vehicleKind` is the simulation's
// vehicle ('static' = DSKY only, no flight).
export function crewModel(snap, appMode, vehicleKind = null) {
  if (!snap) return { visible: 'none', readOnly: true };
  const readOnly = appMode !== 'interactive';
  const crew = snap.agc?.crew || {};
  if (snap.software === 'Comanche055') {
    return {
      visible: 'cm',
      readOnly,
      mode: snap.agc?.mode ?? null,
      engineOn: !!snap.vehicle?.engineOn,
      engineStop: crew.engineStop === true,
      // P40's engine-fail display (FAILDSP) is up: V97N40 flashing.
      v97: snap.agc?.dsky?.verb === '97' && !!snap.agc?.dsky?.flashVerbNoun,
    };
  }
  if (vehicleKind === 'static') return { visible: 'static', readOnly };
  const lpd = snap.agc?.guidance?.lpd || null;
  const clicks = crew.lpdClicks || { dx: 0, dy: 0 };
  const td = snap.vehicle?.touchdown || null;
  return {
    visible: 'lm',
    readOnly,
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
    // LmPhysics' touchdown evaluation, for the user's own flight only: the
    // replay vehicle also reports a touchdown (forward speed only, verdict
    // 'safe'), but the sandbox's scoring limits do not apply to the real
    // landing, whose speeds the narration quotes from the Mission Report.
    touchdown: !readOnly && td && td.verdict ? {
      verdict: td.verdict,
      vVert: Number.isFinite(td.vVert) ? Math.abs(toFps(td.vVert)) : null,
      vHoriz: Number.isFinite(td.vHoriz) ? Math.abs(toFps(td.vHoriz)) : null,
    } : null,
  };
}

const fps1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');

// The landing outcome, worded per LmPhysics' verdict.
function landedHint(td) {
  const speeds = td ? `${fps1(td.vVert)} ft/s down, ${fps1(td.vHoriz)} ft/s across` : '';
  if (td?.verdict === 'crash') return `Crashed: the LM hit the surface at ${speeds}. Restart to fly it again.`;
  if (td?.verdict === 'hard') return `Hard landing: ${speeds} — outside the touchdown limits. The descent controls no longer do anything.`;
  if (td?.verdict === 'safe') return `Landed: ${speeds} — within the touchdown limits. The descent controls no longer do anything.`;
  return 'On the surface: the descent controls no longer do anything.';
}

// ATT HOLD freezes the attitude: this simulator has no hand controller.
const ATT_FROZEN = 'the attitude is frozen (this simulator has no hand controller)';

// One-line context hint for the crew controls, per program and mode. It is
// not a live region: the landing outcome is announced once (the shell's
// toast) and program changes by the computer log; the hint is read on demand.
export function crewHint(model) {
  if (model.visible === 'static') {
    return `This ${model.readOnly ? 'scenario' : 'starting point'} drives the DSKY only — no vehicle is simulated, so there is nothing to fly.`;
  }
  if (model.visible === 'cm') {
    if (model.readOnly) return '';
    if (model.engineStop) {
      return 'ΔV THRUST OFF: the SPS cannot fire. In a P40 burn the computer sees the thrust fail and flashes V97N40 — set NORMAL again, then PRO continues the burn (ENTR re-ignites through V99, V34 ends it).';
    }
    if (model.v97) return 'V97N40 flashing: PRO continues the burn, ENTR re-ignites through V99, V34 ends it.';
    return model.mode === 40
      ? 'Set ΔV THRUST to OFF during the burn to see P40’s engine-fail logic (flashing V97N40).'
      : '';
  }
  if (model.visible !== 'lm') return '';
  if (model.landed) return landedHint(model.touchdown);
  if (model.engineStop) return 'ENGINE STOP is pressed: the descent engine is commanded off (in powered flight the LM falls) — click ENGINE STOP again to release it.';
  if (model.mode === 66) return 'P66: each ROD click changes the commanded descent rate by 1 ft/s; the AGC throttles to hold it while the commander flies the attitude.';
  if (model.mode === 65) {
    return model.pgnsMode === 'attHold'
      ? 'P65 in ATT HOLD: a ROD click switches to P66.'
      : 'P65: the computer nulls the horizontal velocity and descends at 3 ft/s. To take over, select ATT HOLD and click ROD (P66).';
  }
  if (model.mode === 64) {
    return model.pgnsMode === 'attHold'
      ? `P64 in ATT HOLD: ${ATT_FROZEN}, so nothing steers the descent — click ROD now to switch to P66 (as Armstrong did at 102:43:22), or return to AUTO. LPD clicks are ignored in attitude hold.`
      : 'P64: after PRO on the flashing V06N64, LPD clicks redesignate the landing site. For P66, select ATT HOLD and click ROD.';
  }
  if (model.mode === 63) {
    return model.pgnsMode === 'attHold'
      ? `P63 in ATT HOLD: ${ATT_FROZEN} — return to AUTO. Once landing guidance runs, a ROD click would start P66; LPD clicks work only in P64.`
      : 'P63: the computer flies the braking phase. In AUTO the ROD clicks are discarded; LPD clicks work only in P64.';
  }
  return 'These controls matter in the landing programs (P64, P65, P66).';
}

const RO_TEXT = {
  lm: 'Replay: the controls show what the crew did. Switch to <b>Interactive</b> to fly the descent yourself.',
  cm: 'Replay: the switch shows the crew’s setting. Switch to <b>Interactive</b> to try it yourself.',
};

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
    <div class="panel-title"><h2>Crew station</h2><span class="crew-badge" data-k="badge">—</span></div>
    <div class="crew" data-spot="crew">
      <p class="crew-ro" data-role="ro" hidden>${RO_TEXT.lm}</p>
      <p class="crew-empty" data-role="empty" hidden>No simulation running.</p>
      <p class="crew-static" data-role="static" hidden></p>
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
            <button type="button" class="btn crew-stop-btn" data-act="engineStop" aria-pressed="false" aria-label="Engine stop" title="Command the descent engine off (click again to release)">ENGINE<br>STOP</button>
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
        <p class="crew-hint" data-k="hint"></p>
        <details class="crew-more">
          <summary>How the controls work</summary>
          <ul>
            <li><b>ROD</b> (rate of descent) — a spring-loaded toggle on the thrust/translation controller. Each click changes P66’s commanded descent rate by ${ROD_STEP_FPS} ft/s (RODSCALE, Apollo 11 pad load). Up = slower, down = faster.</li>
            <li><b>LPD</b> — in P64, after PRO on the flashing V06N64, clicks of the attitude hand controller move the landing site: ${LPD_AZ_STEP_DEG}° per left/right click, ${LPD_EL_STEP_DEG}° per fore/aft click. The DSKY’s N64 R1 shows the time left for redesignation and the LPD angle to read against the window reticle.</li>
            <li><b>ATT HOLD</b> — attitude hold (manual attitude). With ATT HOLD selected, the first ROD click switches the computer to P66, as on Apollo 11 at 102:43:22.</li>
            <li><b>ENGINE STOP</b> — commands the descent engine off (after touchdown, or to stop a burn). In flight the LM then falls: click it again to release it and let the computer throttle the engine back up.</li>
            <li><b>RR switch fault</b> — ${RR_MORE}</li>
          </ul>
          <p class="crew-note">Simplified: switch positions are modelled as the discretes the AGC reads; the real panel had more positions and interlocks.</p>
        </details>
      </div>
      <div class="crew-cmbox" data-role="cm" hidden>
        <section class="crew-ctl crew-dv" data-spot="crew.dvThrust" aria-labelledby="crew-dv-h">
          <div class="crew-rr-head">
            <h3 id="crew-dv-h">SPS ΔV THRUST</h3>
            <button type="button" class="switch" role="switch" aria-checked="true" data-act="dvThrust" aria-labelledby="crew-dv-h" aria-describedby="crew-dv-help">
              <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
              <span data-k="dvText" aria-hidden="true">NORMAL</span>
            </button>
          </div>
          <p class="crew-help" id="crew-dv-help">The SPS thrust-enable switches (ΔV THRUST A/B). OFF keeps the engine from firing; during a P40 burn the computer then sees the thrust fail and flashes V97N40.</p>
        </section>
        <p class="crew-hint" data-k="cmHint"></p>
        <p class="crew-cm">The Command Module’s other crew-station controls are not modelled. Fly the CM chapter from the DSKY: the P40 burn needs only <kbd>PRO</kbd> on the flashing V99.</p>
      </div>
    </div>`;

  const q = (s) => root.querySelector(s);
  const K = {};
  for (const n of root.querySelectorAll('[data-k]')) K[n.dataset.k] = n;
  const btn = {};
  for (const b of root.querySelectorAll('[data-act]')) btn[b.dataset.act] = b;
  const el = {
    ro: q('[data-role="ro"]'), empty: q('[data-role="empty"]'), static: q('[data-role="static"]'),
    lm: q('[data-role="lm"]'), cm: q('[data-role="cm"]'),
  };
  const sections = {
    rod: q('[data-spot="crew.rod"]'),
    lpd: q('[data-spot="crew.lpd"]'),
    pgns: q('.crew-pgns'),
    rr: q('[data-spot="crew.rr"]'),
    stop: q('.crew-stop'),
    dv: q('[data-spot="crew.dvThrust"]'),
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
    // Toggles: true commands the engine off, false releases it.
    engineStop: () => send('engineStop', !model?.engineStop),
    dvThrust: () => send('engineStop', !model?.engineStop),
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

  function vehicleKind() {
    try {
      return app?.currentSim?.()?.options?.vehicle ?? null;
    } catch {
      return null;
    }
  }

  function render(snap, ui) {
    const appMode = ui?.mode ?? app?.mode ?? 'demo';
    model = crewModel(snap, appMode, ui?.vehicleKind ?? vehicleKind());
    once('vis', model.visible, (v) => {
      el.lm.hidden = v !== 'lm';
      el.cm.hidden = v !== 'cm';
      el.empty.hidden = v !== 'none';
      el.static.hidden = v !== 'static';
    });
    const ro = model.readOnly && RO_TEXT[model.visible] ? model.visible : null;
    once('ro', ro, (v) => {
      el.ro.hidden = !v;
      if (v) el.ro.innerHTML = RO_TEXT[v];
    });
    set('badge', model.visible === 'none' ? '—' : model.readOnly ? 'Replay · read-only' : 'Interactive');
    if (model.visible === 'static') {
      once('static', crewHint(model), (text) => { el.static.textContent = text; });
      return;
    }
    if (model.visible !== 'lm' && model.visible !== 'cm') return;

    once('disabled', model.readOnly, (ro) => {
      for (const b of Object.values(btn)) {
        b.disabled = ro;
        if (ro) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
      }
    });

    if (model.visible === 'cm') {
      once('dv', model.engineStop, (off) => {
        btn.dvThrust.setAttribute('aria-checked', String(!off));
        K.dvText.textContent = off ? 'OFF' : 'NORMAL';
      });
      const hint = crewHint(model);
      set('cmHint', hint);
      once('cmHintH', !hint, (empty) => { K.cmHint.hidden = empty; });
      return;
    }

    set('rod', model.rodFps === null ? '—' : `${fmtRate(model.rodFps)} ft/s`);
    const { dx, dy, angle, time } = model.lpd;
    set('lpdClicks', `az ${dx > 0 ? '+' : ''}${dx} · el ${dy > 0 ? '+' : ''}${dy}`);
    // The LPD angle and redesignation time (N64 R1) exist in P64 in flight
    // only; the guidance keeps the last values afterwards.
    set('lpdAngle', model.mode !== 64 || model.landed || angle === null ? 'LPD —' : `LPD ${Math.round(angle)}°${time !== null ? ` · ${Math.max(0, Math.round(time))} s left` : ''}`);
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
      btn.engineStop.setAttribute('aria-pressed', String(!!on));
      btn.engineStop.title = on ? 'Engine commanded off — click again to release' : 'Command the descent engine off (click again to release)';
    });
  }

  // In replays, highlight the control the crew just operated (the computer
  // model announces every crew-station input on the bus as 'crew').
  const SECTION_FOR = { rodClick: 'rod', lpd: 'lpd', pgnsMode: 'pgns', rrFault: 'rr', engineStop: 'stop' };
  const offs = [
    bus.on('crew', ({ name } = {}) => {
      if (!model?.readOnly) return;
      if (model.visible === 'lm') flash(sections[SECTION_FOR[name]]);
      else if (model.visible === 'cm' && name === 'engineStop') flash(sections.dv);
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
