// P63 — THE LUNAR LANDING, BRAKING PHASE (Luminary099/THE_LUNAR_LANDING.agc:
// 34-40). Selected with V37E63E: P63LM and FLAGORGY set the landing up,
// IGNALG computes TIG, the crew sets the event timer on the flashing
// V06N61, chooses the fine-align option (V50N25 00014), lets R60 put the
// LM in the burn attitude (V50N18), and BURNBABY (P63TABLE) counts down on
// V06N62, blanks the DSKY at TIG−35, starts Average-G at TIG−30, flashes
// V99N62 at TIG−5 and lights the engine on PRO. After the 26-s trim,
// P63ZOOM connects the braking-phase guidance (LUNLAND) to every SERVICER
// pass (V06N63); when TTF > −62 s (TENDBRAK) the guidance switches to P64.
// The behaviour lives in landing.js (shared with P64-P66) and burnbaby.js.

import { LandingMode } from './landing.js';

export default class P63 extends LandingMode {
  static number = 63;
  static name = 'BRAKING PHASE';
  static anchor = 'p63.entry';
}
