// P64 — approach phase (STARTP64, Luminary099/LUNAR_LANDING_GUIDANCE_
// EQUATIONS.agc:260-268): started by the guidance itself at high gate, not
// by V37. TTF/8 += DELTTFAP (−110 s), approach targets, the hand-controller
// interrupt RUPT10 enabled for landing-point redesignation, REDFLAG off so
// V06N64 flashes until the crew keys PRO (P64DISPS/P64CEED, :856-881). R1
// of N64 shows TREDES (seconds left for redesignation) and the LPD angle;
// each fore/aft click of the hand controller moves the aim 0.5°, each
// left/right click 2° (COUNT'EM, :1174-1212). See landing.js.

import { LandingMode } from './landing.js';

export default class P64 extends LandingMode {
  static number = 64;
  static name = 'APPROACH PHASE';
  static anchor = 'p64.entry';
}
