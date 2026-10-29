// The simulation: one AGC model plus one vehicle, advanced in fixed 10 ms
// substeps. Deterministic for a given set of options (seeded RNG, no wall
// clock), which is what lets the demo director seek by re-simulating.

import { createBus } from './util/bus.js';
import { createRng } from './util/rng.js';
import { parseGET } from './util/time.js';
import { Agc } from './agc/agc.js';
import { createVehicle } from './vehicle/index.js';

export const SUBSTEP = 0.01; // seconds

const DEFAULTS = {
  software: 'Luminary099',
  vehicle: 'static',
  startGET: 0,
  seed: 1969,
  replayTrack: null,
  initialProgram: null,
  vehicleOptions: {},
  agcOptions: {},
};

export class Simulation {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    // `bus` is the outside world (UI, director). Internally the model talks
    // to `this.bus`, which forwards everything outward unless muted (the
    // director mutes while it re-simulates during a seek).
    this.outBus = this.options.bus || createBus();
    this.muted = false;
    this.reset();
  }

  reset() {
    const o = this.options;
    this.t0 = parseGET(o.startGET);
    this.ticks = 0;
    this.t = this.t0;
    this._acc = 0;

    this.bus = createBus();
    this.bus.on('*', ({ type, payload }) => {
      if (!this.muted) this.outBus.emit(type, payload);
    });

    this.rng = createRng(o.seed);
    this.vehicle = createVehicle(o.vehicle, {
      track: o.replayTrack,
      rng: this.rng.fork('vehicle'),
      startGET: this.t0,
      ...o.vehicleOptions,
    });
    this.agc = new Agc({
      software: o.software,
      bus: this.bus,
      rng: this.rng.fork('agc'),
      vehicle: this.vehicle,
      startGET: this.t0,
      ...o.agcOptions,
    });
    if (o.initialProgram !== null && o.initialProgram !== undefined) {
      this.agc.startProgram(o.initialProgram, { initial: true });
    }
    this.outBus.emit('sim:reset', { t: this.t });
  }

  setMuted(muted) {
    this.muted = !!muted;
  }

  // Advance by dt seconds of simulated time.
  step(dt) {
    if (!(dt > 0)) return;
    this._acc += dt;
    while (this._acc >= SUBSTEP - 1e-9) {
      this._acc -= SUBSTEP;
      this.ticks += 1;
      this.t = this.t0 + this.ticks * SUBSTEP;
      this.vehicle.step(SUBSTEP, this.agc.vehicleCommands(), this.t);
      this.agc.step(this.t, SUBSTEP);
    }
  }

  // Advance until GET `target` (no-op if already past it).
  runTo(target) {
    const goal = parseGET(target);
    if (goal > this.t) this.step(goal - this.t + 1e-9);
  }

  snapshot() {
    return {
      t: this.t,
      software: this.options.software,
      agc: this.agc.snapshot(),
      vehicle: { ...this.vehicle.state },
    };
  }
}
