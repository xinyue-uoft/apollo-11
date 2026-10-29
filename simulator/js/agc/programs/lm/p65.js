// P65 — automatic vertical descent (P65START / P65VERT, Luminary099/
// LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:252-258, :897-913): when the approach
// TTF exceeds −12 s (TENDAPPR) the guidance nulls the horizontal velocity
// and descends at 3 ft/s (V2FG, TAUVERT = 10 s pad loads), display V06N60.
// Not flown on Apollo 11 (Armstrong took over in P66 at ≈400 ft); reached in
// the sandbox if the crew does nothing. There is no touchdown logic in the
// listing: the crew stops the engine. See landing.js.

import { LandingMode } from './landing.js';

export default class P65 extends LandingMode {
  static number = 65;
  static name = 'LANDING PHASE (AUTO)';
  static anchor = 'p65.entry';
}
