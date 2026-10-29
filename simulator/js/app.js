// App controller: owns the mode (demo / interactive), the frame loop, the
// view instances and URL routing. All simulation logic lives in sim.js and
// below; all drawing lives in ui/. This file only wires them together.

import { createBus } from './util/bus.js';
import { Simulation } from './sim.js';
import { Director } from './demo/director.js';
import { SCENARIOS } from './demo/scenarios/index.js';
import { PRESETS } from './data/presets.js';
import { TRACKS } from './data/tracks.js';

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

export class App {
  constructor(doc = document) {
    this.doc = doc;
    this.bus = createBus();
    this.mode = 'demo';
    this.scenario = null;
    this.preset = null;
    this.interactive = { sim: null, playing: true, speed: 1 };
    this.tab = 'trajectory';

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
    if (mode === 'interactive') this.startInteractive(id || PRESETS[0]?.id, { route: false });
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
    if (mode === 'interactive') this.startInteractive(this.preset?.id || PRESETS[0]?.id);
    else this.loadScenario(this.scenario?.id || SCENARIOS[0]?.id);
  }

  loadScenario(id, { route = true } = {}) {
    const scenario = SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
    if (!scenario) return;
    this.mode = 'demo';
    this.scenario = scenario;
    this.interactive.sim = null;
    this.bus.emit('app:mode', { mode: 'demo', scenario });
    this.director.load(scenario);
    this.updateSoftwareLabel(scenario.software);
    this.updateModeSwitch();
    if (route) this.setRoute();
  }

  startInteractive(presetId, { route = true } = {}) {
    const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
    if (!preset) return;
    this.director.pause();
    this.mode = 'interactive';
    this.preset = preset;
    this.interactive.playing = true;
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
    this.updateSoftwareLabel(preset.software);
    this.updateModeSwitch();
    if (route) this.setRoute();
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

  uiState() {
    return {
      mode: this.mode,
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

  bindTabs() {
    for (const b of this.doc.querySelectorAll('#viz-tabs [role="tab"]')) {
      b.addEventListener('click', () => this.selectTab(b.dataset.tab));
    }
  }

  selectTab(name) {
    const tabs = [...this.doc.querySelectorAll('#viz-tabs [role="tab"]')];
    if (!tabs.some((b) => b.dataset.tab === name)) return;
    this.tab = name;
    for (const b of tabs) {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      const panel = this.doc.getElementById(b.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    }
    this.bus.emit('tab', { name });
  }

  bindBus() {
    this.bus.on('focus', ({ panel } = {}) => {
      if (['trajectory', 'exec', 'ignition'].includes(panel)) this.selectTab(panel);
    });
    this.bus.on('spotlight', ({ target } = {}) => {
      if (!target) return;
      for (const el of this.doc.querySelectorAll(`[data-spot="${cssEscape(target)}"]`)) {
        el.classList.remove('spotlight');
        void el.offsetWidth; // restart the animation
        el.classList.add('spotlight');
        setTimeout(() => el.classList.remove('spotlight'), 2600);
      }
    });
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
