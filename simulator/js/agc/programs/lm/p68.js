// P68 — LANDING CONFIRMATION (LANDJUNK, Luminary099/THE_LUNAR_LANDING.agc:
// 275-334). Never entered automatically: the crew keys V37E68E after
// touchdown (V37 table FCADRMM1/PREMM1, FRESH_START_AND_RESTART.agc:1070,
// :1123; research src-landing.md §9). V37 itself stops Average-G (ISSERVON,
// :789-800), so the workload becomes the surface load. LANDJUNK zeroes the
// attitude error, sets a 5° deadband, sets SURFFLAG and APSFLAG, clears
// LETABORT (no more P70/P71 aborts), computes latitude/longitude/altitude
// (LAT-LONG) and makes the present position the landing site (RLS), then
// flashes V06N43 — "ASTRONAUT: NOW LOOK WHERE YOU ENDED UP". PRO goes on to
// initialise P57 data and GOTOPOOH ("PLEASE SELECT P57"); V34 GOTOPOOH;
// V32 shows N43 again.
//
// The position: with the replay the onboard (PGNCS) solution of Apollo 11,
// 0.649° N 23.46° E (MR Table 5-IV); with the physics LM, the targeted site
// of MR Table 5-IV (0.691° N, 23.72° E, trajectory coordinates) moved by the
// distance the LM landed short/long of it along the westward ground track
// (planar model: no cross-range). ALT is measured from the landing-site
// radius (the ERADFLAG choice of LAT-LONG was not determined, research
// src-landing.md §9 — simplification).

import { MOON_RADIUS, NMI } from '../../../util/units.js';
import { LmProgram, vehicleKind } from './common.js';
import { APOLLO11_LANDING } from './landing.js';

export const TARGETED_SITE = Object.freeze({ lat: 0.691, long: 23.72 }); // MR Table 5-IV

export default class P68 extends LmProgram {
  static number = 68;
  static name = 'LANDING CONFIRMATION';
  static anchor = 'p68.entry';

  enter() {
    super.enter();
    this.setPhase('landed');
    this.landJunk();
  }

  landJunk() {
    const agc = this.agc;
    this.stage = 'landjunk';
    this.protect(4, '4.24', () => this.landJunk(), { label: 'LANDJUNK', anchor: 'p68.entry' });
    // SET SURFFLAG, CLEAR LETABORT, SET APSFLAG, SET LUNAFLAG (:296-307).
    Object.assign(agc.flags, { SURFFLAG: true, LETABORT: false, APSFLAG: true, LUNAFLAG: true });
    Object.assign(agc.erasable, this.latLong());
    this.display();
  }

  // LAT-LONG of the present position (display units: deg, deg, n mi).
  latLong() {
    const s = this.agc.vehicle?.state || {};
    const alt = Number.isFinite(s.alt) ? Math.max(0, s.alt) : 0;
    if (vehicleKind(this.agc) === 'replay') {
      const p = APOLLO11_LANDING.pgncsLanding;
      return { LAT: p.lat, LONG: p.long, ALT: alt / NMI };
    }
    // Range is positive while uprange (east) of the site; the LM flies west.
    const range = Number.isFinite(s.range) ? s.range : 0;
    const dLong = (range / MOON_RADIUS) * (180 / Math.PI);
    return { LAT: TARGETED_SITE.lat, LONG: TARGETED_SITE.long + dLong, ALT: alt / NMI };
  }

  display() {
    this.flash(6, 43, {
      terminate: () => this.goToPooh(),
      // PRO: GSAV, REFMF (YNBSAV, ZNBSAV, ATTFLAG for P57), GOTOPOOH.
      proceed: () => this.goToPooh(),
      enter: () => this.display(),
    }, { id: 'LANDJUNK', source: 'p68.entry' });
  }

  vehicleCommands() {
    return { throttle: 0, thrustDir: null, engineOn: false, ullage: false, rod: 0, lpd: null };
  }
}
