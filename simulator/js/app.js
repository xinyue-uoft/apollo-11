// App controller: owns the mode (demo / interactive), the frame loop, the
// view instances and URL routing. All simulation logic lives in sim.js and
// below; all drawing lives in ui/. This file only wires them together.

import { createBus } from './util/bus.js';
import { Simulation } from './sim.js';
import { Director } from './demo/director.js';
import { SCENARIOS } from './demo/scenarios/index.js';
import { PRESETS } from './data/presets.js';
import { TRACKS } from './data/tracks.js';
import { vehicleEventText } from './ui/html.js';

import { mountDsky } from './ui/dsky-view.js';
import { mountInstruments } from './ui/instruments-view.js';
import { mountCrew } from './ui/crew-view.js';
import { mountTrajectory } from './ui/trajectory-view.js';
import { mountExec } from './ui/exec-view.js';
import { mountIgnition } from './ui/ignition-view.js';
import { mountTranscript } from './ui/transcript-view.js';
import { mountNarration } from './ui/narration-view.js';
import { mountSource } from './ui/source-view.js';
import { mountTimeline } from './ui/timeline-view.js';
import { mountControls } from './ui/controls-view.js';

const SOFTWARE_LABELS = {
  Luminary099: 'Luminary 099 · Lunar Module “Eagle” · Apollo 11',
  Comanche055: 'Comanche 055 · Command Module “Columbia” · Apollo 11',
};

const MAX_FRAME_DT = 0.1; // s of real time per frame (tab switches, hiccups)
const INTERACTIVE_SPEEDS = [1, 2, 5, 10];
const VIZ_PANELS = ['trajectory', 'exec', 'ignition'];
const VIZ_ENGAGED_MS = 20000; // a scenario does not switch tabs this soon after the user worked there

const MODE_TITLES = {
  demo: 'Demo: guided replays of Apollo 11, with explanations and the real source code',
  interactive: 'Interactive: key the DSKY and fly it yourself',
};

export class App {
  constructor(doc = document) {
    this.doc = doc;
    this.bus = createBus();
    this.mode = 'demo';
    this.scenario = null;
    this.preset = null;
    this.interactive = { sim: null, playing: true, speed: 1 };
    this.tab = 'trajectory';
    this._vehicleSeen = null;    // landing-outcome edges: { sim, lowLevel, depleted, touchdown }
    this._pausedKeysTold = false; // the "simulation paused" toast, once per pause
    this._vizTouched = -Infinity; // performance.now() of the user's last input in the viz panel
    this._movingFocus = false;

    this.director = new Director({
      bus: this.bus,
      createSim: (scenario) => this.createSim({
        software: scenario.software,
        vehicle: scenario.vehicle || 'static',
        startGET: scenario.start,
        replayTrack: scenario.track ? TRACKS[scenario.track] : null,
        initialProgram: scenario.initialProgram ?? null,
        vehicleOptions: scenario.vehicleOptions || {},
        agcOptions: scenario.agcOptions || {},
      }),
    });

    this.views = [];
    this._last = null;
    this._raf = null;
  }

  // ---------- construction ----------

  createSim(options) {
    return new Simulation({ ...options, bus: this.bus });
  }

  start() {
    const ctx = { bus: this.bus, app: this };
    const mount = (id, fn) => {
      const root = this.doc.getElementById(id);
      if (!root) return;
      try {
        this.views.push({ id, view: fn(root, ctx) });
      } catch (err) {
        console.error(`Failed to mount ${id}:`, err);
        root.innerHTML = `<p class="panel-body">This panel failed to load: ${escapeHtml(err.message)}</p>`;
      }
    };
    mount('dsky-root', mountDsky);
    mount('instruments-root', mountInstruments);
    mount('crew-root', mountCrew);
    mount('trajectory-root', mountTrajectory);
    mount('exec-root', mountExec);
    mount('ignition-root', mountIgnition);
    mount('transcript-root', mountTranscript);
    mount('narration-root', mountNarration);
    mount('source-root', mountSource);
    mount('timeline-root', mountTimeline);
    mount('controls-root', mountControls);

    this.buildModeSwitch();
    this.bindTabs();
    this.bindBus();
    this.bindSkipLink();
    this.observeStickyBars();
    this.observeNarration();

    this.applyRoute(this.doc.defaultView.location.hash);
    this.doc.defaultView.addEventListener('hashchange', () => {
      this.applyRoute(this.doc.defaultView.location.hash);
    });

    const loop = (now) => {
      const dt = this._last === null ? 0 : Math.min(MAX_FRAME_DT, (now - this._last) / 1000);
      this._last = now;
      this.frame(dt);
      this._raf = this.doc.defaultView.requestAnimationFrame(loop);
    };
    this._raf = this.doc.defaultView.requestAnimationFrame(loop);
  }

  // ---------- routing & modes ----------

  applyRoute(hash) {
    const [, mode, id] = /^#\/?(demo|interactive)(?:\/([\w-]+))?/.exec(hash || '') || [];
    // A hash that is not a route (an in-page link such as "#main"): keep
    // what is running and put the route back.
    if (hash && hash !== '#' && !mode && (this.scenario || this.preset)) {
      this.setRoute();
      return;
    }
    if (mode === 'interactive') this.startInteractive(id || PRESETS[0]?.id, { route: false, resume: true });
    else this.loadScenario(id || SCENARIOS[0]?.id, { route: false });
  }

  setRoute() {
    const id = this.mode === 'demo' ? this.scenario?.id : this.preset?.id;
    const hash = `#/${this.mode}${id ? `/${id}` : ''}`;
    const win = this.doc.defaultView;
    if (win.location.hash !== hash) win.history.replaceState(null, '', hash);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    if (mode === 'interactive') this.startInteractive(this.preset?.id || PRESETS[0]?.id, { resume: true });
    else this.loadScenario(this.scenario?.id || SCENARIOS[0]?.id);
  }

  // The interactive sim is kept (not stepped) while a replay plays, so that
  // coming back to Interactive resumes the user's flight.
  loadScenario(id, { route = true } = {}) {
    const scenario = SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
    if (!scenario) return;
    this.mode = 'demo';
    this.scenario = scenario;
    this.bus.emit('app:mode', { mode: 'demo', scenario });
    this.director.load(scenario);
    this.updateSoftwareLabel(scenario.software);
    this.updateModeSwitch();
    if (route) this.setRoute();
  }

  // `resume`: coming back from Demo to the same preset continues the sim
  // that was left (PILOT-2); otherwise (another preset, Restart) a new one.
  startInteractive(presetId, { route = true, resume = false } = {}) {
    const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
    if (!preset) return;
    this.director.pause();
    // A replay seek still running must not announce anything (tab, source,
    // crew keys) into interactive mode; the replay reloads on return.
    this.director.cancelSeek();
    if (resume && this.mode !== 'interactive' && this.interactive.sim && this.preset?.id === preset.id) {
      this.mode = 'interactive';
      this.bus.emit('app:mode', { mode: 'interactive', preset, resumed: true });
      this.selectPresetTab(preset);
      this.updateSoftwareLabel(preset.software);
      this.updateModeSwitch();
      if (route) this.setRoute();
      return;
    }
    // A new starting point starts at 1× (10× suits P00, not a landing);
    // Restart keeps the user's speed.
    if (preset.id !== this.preset?.id) this.interactive.speed = 1;
    this.mode = 'interactive';
    this.preset = preset;
    this.interactive.playing = true;
    this._pausedKeysTold = false;
    this.interactive.sim = this.createSim({
      software: preset.software,
      vehicle: preset.vehicle || 'static',
      startGET: preset.startGET,
      replayTrack: preset.track ? TRACKS[preset.track] : null,
      initialProgram: preset.initialProgram ?? null,
      vehicleOptions: preset.vehicleOptions || {},
      agcOptions: preset.agcOptions || {},
    });
    this.bus.emit('app:mode', { mode: 'interactive', preset });
    if (typeof preset.setup === 'function') preset.setup(this.interactive.sim);
    this.selectPresetTab(preset);
    this.updateSoftwareLabel(preset.software);
    this.updateModeSwitch();
    if (route) this.setRoute();
  }

  // The visualisation tab a starting point opens on (also when the user
  // comes back to it from a replay): the preset's own `tab`, else, for the
  // Command Module, which has no descent to plot, its SPS burn.
  selectPresetTab(preset) {
    if (preset.tab) this.selectTab(preset.tab);
    else if (preset.software === 'Comanche055' && this.tab === 'trajectory') this.selectTab('ignition');
  }

  restartInteractive() {
    if (this.preset) this.startInteractive(this.preset.id);
  }

  currentSim() {
    return this.mode === 'demo' ? this.director.sim : this.interactive.sim;
  }

  // ---------- input ----------

  // A DSKY key from the user (mouse, touch or keyboard).
  pressKey(key) {
    if (this.mode === 'interactive' && this.interactive.sim) {
      this.interactive.sim.agc.key(key);
      // The keystroke waits for simulated time (PINBALL runs as Executive
      // jobs): say so once per pause, or the DSKY looks dead.
      if (!this.interactive.playing && !this._pausedKeysTold) {
        this._pausedKeysTold = true;
        this.bus.emit('toast', { text: 'The simulation is paused: your keys take effect when you press Run (Space).' });
      }
      return true;
    }
    this.bus.emit('toast', {
      text: 'During a replay the crew has the keyboard. Switch to Interactive mode to key the DSKY yourself.',
    });
    return false;
  }

  // Crew-station controls (ROD switch, LPD, engine stop, RR switch...).
  crewInput(name, value) {
    const sim = this.currentSim();
    if (this.mode !== 'interactive' || !sim) return false;
    if (typeof sim.agc.crewInput === 'function') sim.agc.crewInput(name, value);
    return true;
  }

  setInteractivePlaying(playing) {
    this.interactive.playing = !!playing;
    if (!this.interactive.playing) this._pausedKeysTold = false;
  }

  setInteractiveSpeed(speed) {
    if (INTERACTIVE_SPEEDS.includes(speed)) this.interactive.speed = speed;
  }

  // ---------- frame loop ----------

  frame(realDt) {
    let snapshot = null;
    if (this.mode === 'demo') {
      this.director.frame(realDt);
      snapshot = this.director.sim ? this.director.sim.snapshot() : null;
    } else if (this.interactive.sim) {
      if (this.interactive.playing) this.interactive.sim.step(realDt * this.interactive.speed);
      snapshot = this.interactive.sim.snapshot();
      this.watchVehicle(this.interactive.sim, snapshot);
    }
    const ui = this.uiState();
    for (const { id, view } of this.views) {
      try {
        view?.render?.(snapshot, ui);
      } catch (err) {
        if (!view.__failed) console.error(`Render failed in ${id}:`, err);
        view.__failed = true;
      }
    }
  }

  // Landing outcome of the user's flight (interactive mode; in a replay the
  // script tells the story): on the low-level light, propellant depletion
  // and touchdown, emit 'vehicle' { t, kind, verdict?, vVert?, vHoriz?,
  // tilt? } (SI, as in the snapshot) and a toast. Edges only: a new sim
  // starts from its own state without announcing it.
  watchVehicle(sim, snapshot) {
    const v = snapshot?.vehicle;
    if (!v) return;
    const seen = this._vehicleSeen;
    const now = { sim, lowLevel: !!v.lowLevel, depleted: !!v.depleted, touchdown: !!v.touchdown };
    this._vehicleSeen = now;
    if (!seen || seen.sim !== sim) return;
    const events = [];
    if (now.lowLevel && !seen.lowLevel) events.push({ kind: 'lowLevel' });
    if (now.depleted && !seen.depleted) events.push({ kind: 'depleted' });
    if (now.touchdown && !seen.touchdown) {
      const td = v.touchdown;
      events.push({ kind: 'touchdown', verdict: td.verdict, vVert: td.vVert, vHoriz: td.vHoriz, tilt: td.tilt, t: td.t });
    }
    for (const ev of events) {
      const payload = { t: snapshot.t, ...ev };
      if (!Number.isFinite(payload.t)) payload.t = snapshot.t;
      this.bus.emit('vehicle', payload);
      this.bus.emit('toast', { text: vehicleEventText(payload) });
    }
  }

  uiState() {
    return {
      mode: this.mode,
      vehicleKind: this.currentSim()?.options?.vehicle ?? null,
      scenario: this.scenario,
      scenarios: SCENARIOS,
      preset: this.preset,
      presets: PRESETS,
      director: this.director.state,
      interactive: {
        playing: this.interactive.playing,
        speed: this.interactive.speed,
        speeds: INTERACTIVE_SPEEDS,
      },
      tab: this.tab,
    };
  }

  // ---------- chrome ----------

  updateSoftwareLabel(software) {
    const el = this.doc.getElementById('software-label');
    if (el) el.textContent = SOFTWARE_LABELS[software] || software;
    this.doc.body.dataset.software = software;
  }

  buildModeSwitch() {
    const nav = this.doc.getElementById('mode-switch');
    if (!nav) return;
    nav.innerHTML = '';
    for (const [mode, label] of [['demo', 'Demo'], ['interactive', 'Interactive']]) {
      const b = this.doc.createElement('button');
      b.type = 'button';
      b.dataset.mode = mode;
      b.textContent = label;
      b.title = MODE_TITLES[mode];
      b.addEventListener('click', () => this.setMode(mode));
      nav.append(b);
    }
    this.updateModeSwitch();
  }

  updateModeSwitch() {
    for (const b of this.doc.querySelectorAll('#mode-switch button')) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === this.mode));
    }
    this.doc.body.dataset.mode = this.mode;
  }

  // ARIA tabs pattern: one tab stop (roving tabindex); ←/→ (wrapping),
  // Home and End move to a tab and select it.
  bindTabs() {
    const list = this.doc.getElementById('viz-tabs');
    const tabs = () => [...this.doc.querySelectorAll('#viz-tabs [role="tab"]')];
    for (const b of tabs()) {
      b.addEventListener('click', () => this.selectTab(b.dataset.tab));
    }
    const touch = () => {
      if (!this._movingFocus) this._vizTouched = this.doc.defaultView.performance.now();
    };
    for (const type of ['pointerdown', 'keydown', 'focusin']) {
      this.doc.querySelector('.panel-viz')?.addEventListener(type, touch, true);
    }
    list?.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const all = tabs();
      const i = all.indexOf(e.target);
      if (i < 0) return;
      let j;
      if (e.key === 'ArrowRight') j = (i + 1) % all.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + all.length) % all.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = all.length - 1;
      else return;
      e.preventDefault();
      this.selectTab(all[j].dataset.tab);
      all[j].focus();
    });
    this.selectTab(this.tab);
  }

  selectTab(name) {
    const tabs = [...this.doc.querySelectorAll('#viz-tabs [role="tab"]')];
    if (!tabs.some((b) => b.dataset.tab === name)) return;
    this.tab = name;
    for (const b of tabs) {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      const panel = this.doc.getElementById(b.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    }
    this.bus.emit('tab', { name });
  }

  bindBus() {
    // A scenario's `focus` switches the visualisation tab — in a replay
    // only. Not under a user who has just been working in the tabs or the
    // panel (the tab the replay wants pulses instead); and if focus is in
    // there, it moves to the newly selected tab rather than dropping to
    // <body> with the hidden panel.
    this.bus.on('focus', ({ panel } = {}) => {
      if (this.mode !== 'demo' || !VIZ_PANELS.includes(panel) || panel === this.tab) return;
      const tab = this.doc.getElementById(`tab-${panel}`);
      const inside = this.doc.activeElement?.closest?.('.panel-viz');
      if (inside && this.doc.defaultView.performance.now() - this._vizTouched < VIZ_ENGAGED_MS) {
        this.pulse(tab);
        return;
      }
      this.selectTab(panel);
      if (inside && tab) {
        this._movingFocus = true;
        tab.focus({ preventScroll: true });
        this._movingFocus = false;
      }
    });
    this.bus.on('spotlight', ({ target } = {}) => {
      if (!target) return;
      for (const el of this.doc.querySelectorAll(`[data-spot="${cssEscape(target)}"]`)) this.pulse(el);
    });
  }

  pulse(el) {
    if (!el) return;
    el.classList.remove('spotlight');
    void el.offsetWidth; // restart the animation
    el.classList.add('spotlight');
    setTimeout(() => el.classList.remove('spotlight'), 2600);
  }

  // The skip link moves focus without touching the hash, which is the
  // router's (a "#main" hash used to reload the first scenario).
  bindSkipLink() {
    const link = this.doc.querySelector('.skip-link');
    const main = this.doc.getElementById('main');
    link?.addEventListener('click', (e) => {
      e.preventDefault();
      main?.focus();
    });
  }

  // Publish the rendered heights of the sticky top bar and timeline as
  // --sticky-top / --sticky-bottom, so that scroll-padding (base.css) keeps
  // a focused element from scrolling in underneath them. Both wrap with the
  // window width; the top bar is not sticky on narrow screens.
  observeStickyBars() {
    const win = this.doc.defaultView;
    const root = this.doc.documentElement;
    const top = this.doc.getElementById('topbar');
    const bottom = this.doc.getElementById('timeline-root');
    const height = (el) => (el && win.getComputedStyle(el).position === 'sticky' ? el.offsetHeight : 0);
    const update = () => {
      root.style.setProperty('--sticky-top', `${height(top)}px`);
      root.style.setProperty('--sticky-bottom', `${height(bottom)}px`);
    };
    update();
    if (typeof win.ResizeObserver === 'function') {
      const ro = new win.ResizeObserver(update);
      for (const el of [top, bottom]) if (el) ro.observe(el);
    }
    win.addEventListener('resize', update);
  }

  // The three-column layout (base.css) stacks the source listing one gap
  // under the explanation by the explanation's rendered height, published
  // as --narration-h: the two share their column's grid rows with the DSKY
  // column, which must not move with every new explanation card.
  observeNarration() {
    const win = this.doc.defaultView;
    const main = this.doc.getElementById('main');
    const narration = this.doc.getElementById('narration-root');
    if (!main || !narration) return;
    const update = () => main.style.setProperty('--narration-h', `${narration.getBoundingClientRect().height}px`);
    update();
    if (typeof win.ResizeObserver === 'function') new win.ResizeObserver(update).observe(narration);
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function cssEscape(text) {
  return String(text).replace(/["\\]/g, '\\$&');
}
