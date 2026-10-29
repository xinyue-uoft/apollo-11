// P00 — CMC IDLING (Comanche 055). The program the crew selects with
// V37E00E: no guidance, coasting-flight integration only ("POOH",
// Comanche055/FRESH_START_AND_RESTART.agc:953-1013; "ASTRONAUT SELECTION OF
// IDLING", P20-P25.agc:68). Selecting it also stops Average-G and turns
// the engine off (V37, FRESH_START_AND_RESTART.agc:739-747), which the
// previous program's exit() does in this model.

import { setPhase } from './cm-common.js';

export default class P00 {
  static number = 0;
  static name = 'CMC IDLING';
  static anchor = 'cm.p00.pooh';

  constructor(agc) {
    this.agc = agc;
    this.burn = { snapshot: () => null };
  }

  enter() {
    setPhase(this.agc, 'cmIdle');
  }

  step() {}

  exit() {}

  vehicleCommands() {
    // Coast: SPS off, attitude held by the RCS DAP (no new direction).
    return { throttle: 0, thrustDir: null, engineOn: false, ullage: false, rod: 0, lpd: null };
  }

  get commands() {
    return this.vehicleCommands();
  }

  snapshot() {
    return { stage: 'idle' };
  }
}
