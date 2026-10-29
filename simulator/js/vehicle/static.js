// StaticVehicle — a parked vehicle with zero rates: the DSKY-only presets
// and scenarios (P00 on the pad of the scenario list, Verb/Noun practice)
// need a vehicle provider but no flight. Same state shape as the other
// providers (ARCHITECTURE §8); commands are ignored.
//
// opts: { startGET, initialState: any subset of the state fields (SI) }.
// The default is an LM sitting on the surface at the landing site with the
// Apollo 11 landed mass (16,153.2 lb, Mission Report Table A-I) and the
// 770 lb of descent propellant left at cutoff (MR §9.13.1).

import { parseGET } from '../util/time.js';
import { LM } from './constants.js';

export class StaticVehicle {
  constructor(opts = {}) {
    this.opts = opts;
    this.reset();
  }

  reset() {
    const o = this.opts;
    this.t = parseGET(o.startGET ?? 0);
    const init = o.initialState || {};
    const propellant = Number.isFinite(init.propellant) ? init.propellant : LM.dpsAtCutoff;
    this.state = {
      t: this.t,
      alt: 0,
      altRate: 0,
      vHoriz: 0,
      vCross: 0,
      range: 0,
      downrange: 0,
      mass: LM.massAtLanding,
      thrust: 0,
      throttle: 0,
      throttleCmd: 0,
      fuelFrac: propellant / LM.dpsLoaded,
      propellant,
      pitch: 0,
      yaw: 0,
      engineOn: false,
      ullage: false,
      landed: true,
      contact: true,
      lowLevel: false,
      depleted: false,
      touchdown: null,
      vInertial: 0,
      phi: 0,
      ...init,
      lr: { altValid: false, velValid: false, alt: null, altRate: null, vHoriz: null, ...(init.lr || {}) },
    };
    this.state.t = this.t;
  }

  step(dt, _commands, t) {
    if (!(dt > 0)) return;
    this.t = Number.isFinite(t) ? t : this.t + dt;
    this.state.t = this.t;
  }
}
