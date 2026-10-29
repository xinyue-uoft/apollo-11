// P66 — rate of descent (STARTP66 / RODTASK / RODCOMP, Luminary099/
// LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:143-185, :934-1113). Entered by
// GUILDENSTERN when the PGNS mode switch is in ATT HOLD and the ROD switch
// has been clicked (P66NOW?, :194-208). The desired altitude rate starts at
// the present rate and each click changes it by 1 ft/s (RODSCALE pad load;
// DESCENT+ slows the descent, :1218-1228); RODCOMP throttles for it every
// second and shows V06N60 (forward velocity, altitude rate, altitude).
// Luminary099's P66 has no attitude channel: the commander flies attitude
// with the hand controller (in the physics sandbox a labelled stand-in does
// that). The listing has no touchdown logic: after "Contact light" the crew
// pushes ENGINE STOP; P68 is then selected with V37E68E. See landing.js.

import { LandingMode } from './landing.js';

export default class P66 extends LandingMode {
  static number = 66;
  static name = 'LANDING PHASE (ROD)';
  static anchor = 'p66.entry';
}
