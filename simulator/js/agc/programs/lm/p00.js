// P00 — LGC IDLING ("POOH", Luminary099/FRESH_START_AND_RESTART.agc:850-899).
// Reached with V37E00E (always allowed, :756-758), after GOTOPOOH's flashing
// V37 request, or at the start of a scenario. Nothing runs but the
// background: no Average-G, no guidance; the workload is the idle machine
// (interrupts, DAP, telemetry). The V37/R00 clean-up of the previous program
// (engine off, landing-radar bypass, restart groups killed) is done by
// Agc.changeProgram (FRESH_START_AND_RESTART.agc:814-875).

import { LmProgram } from './common.js';

export default class P00 extends LmProgram {
  static number = 0;
  static name = 'LGC IDLING';
  static anchor = 'src.pooh';

  enter() {
    super.enter();
    this.stage = 'idle';
    // R00: "CAF LRBYBIT / TS FLGWRD11" — LR processing bypassed (:835-837).
    this.agc.flags.LRBYPASS = true;
    this.agc.flags.MUNFLAG = false;
    this.setPhase('idle');
  }

  vehicleCommands() {
    // ENGINOF1 / ALLCOAST: engine off, attitude held by the DAP.
    return { throttle: 0, thrustDir: null, engineOn: false, ullage: false, rod: 0, lpd: null };
  }
}
