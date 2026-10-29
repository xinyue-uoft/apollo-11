// Interactive starting points for the Command Module chapter (Comanche 055,
// "Columbia"), merged into PRESETS by js/data/presets.js (ARCHITECTURE §11.2).
// The LOI presets use the CmSpsVehicle ('cmSps') on Apollo 11's approach to
// the Moon and the LOI-1 maneuver PAD read up at 072:51:24 GET (see
// js/agc/programs/cm/p40.js, LOI1_PAD); the entry preset uses its scripted
// entry mode and the Entry PAD (js/agc/programs/cm/entry.js, ENTRY_PAD).

import { formatGET, parseGET } from '../util/time.js';
import { LOI1_PAD, loadExternalDeltaV } from '../agc/programs/cm/p40.js';
import { loadEntryPad } from '../agc/programs/cm/entry.js';

const TIG = parseGET(LOI1_PAD.tig); // 075:49:49.65

// Put the computer and the spacecraft where the crew had them before the
// burn: PAD loaded (P30), and optionally P40 already running.
//   stage: null (stay in P00) | 'r60' | 'gimbal' | 'countdown'
export function setupLoi1(sim, { stage = 'countdown' } = {}) {
  const agc = sim.agc;
  loadExternalDeltaV(agc);
  if (!stage) return;
  agc.startProgram(40);
  const p40 = agc.program;
  if (!p40 || p40.constructor?.number !== 40) return;
  // Apollo 11 was already in the LOI attitude well before LOS (the
  // checklist work at 075:41–075:46 GET in the Apollo Flight Journal is
  // switch set-up, not a maneuver), so point the spacecraft along the
  // S40.1 thrust direction.
  if (sim.vehicle && typeof sim.vehicle.setAttitude === 'function' && p40.ut) {
    sim.vehicle.setAttitude(p40.ut);
  }
  if (stage !== 'r60') p40.skipTo(stage);
}

// Entry: load the Entry PAD and start P61 (or a later entry program).
//   stage: 61 (crew steps through P61/P62) | 63 (already waiting for 0.05 g)
export function setupEntry(sim, { stage = 61 } = {}) {
  loadEntryPad(sim.agc);
  sim.agc.startProgram(stage);
}

export const PRESETS_CM = [
  {
    id: 'cm-p00',
    title: 'CM DSKY (P00)',
    description: [
      'Columbia\'s computer (Comanche 055) idling in P00 at 075:40:00 GET, nine minutes before the first Lunar Orbit Insertion burn; the LOI-1 PAD is already loaded.',
      'Key V37E40E to select P40. Flashing V50N18 asks for the attitude maneuver: PRO to fly it, ENTR when done.',
      'Flashing V50N25 with 00204 offers the SPS gimbal test: PRO = drive test + trim (18 s), ENTR = trim only (5 s).',
      'V06N40 then counts down to TIG ' + formatGET(TIG, { tenths: true }) + '; press PRO when V99 flashes at TIG−5.',
    ].join(' '),
    software: 'Comanche055',
    vehicle: 'cmSps',
    startGET: '075:40:00',
    initialProgram: 0,
    vehicleOptions: { initial: 'loi1' },
    setup: (sim) => setupLoi1(sim, { stage: null }),
  },
  {
    id: 'cm-loi1',
    title: 'LOI-1 burn (P40, TIG−3 min)',
    description: [
      'Apollo 11 behind the Moon, P40 counting down on V06N40 (R1 time to ignition, R2 velocity to be gained 2917 ft/s, R3 ΔV so far).',
      'At TIG−35 s the verb, noun and registers blank for five seconds (the program number stays) while Average-G starts; at TIG−5 s V99 flashes — press PRO to let the SPS fire.',
      'Watch N40 count down the 6-minute burn; after cut-off PRO on the flashing V16N40 shows the residuals (V16N85), PRO again ends P40 (flashing V37: key V37E00E).',
    ].join(' '),
    software: 'Comanche055',
    vehicle: 'cmSps',
    startGET: TIG - 180,
    initialProgram: null,
    vehicleOptions: { initial: 'loi1' },
    setup: (sim) => setupLoi1(sim, { stage: 'countdown' }),
  },
  {
    id: 'cm-loi1-ignition',
    title: 'LOI-1 ignition (P40, TIG−45 s)',
    description: [
      'The last 45 seconds before LOI-1. Blank DSKY at TIG−35 s, V06N40 back at TIG−30 s, flashing V99N40 at TIG−5 s.',
      'PRO before TIG and the engine lights on time; PRO late and it lights at once; V34 terminates; ENTR bypasses the SPS (RCS burn, V16N85).',
      'Try the engine-fail logic: set SPS ΔV THRUST to OFF on the crew panel during the burn and P40 flashes V97N40 (set it back to NORMAL and press PRO to resume).',
    ].join(' '),
    software: 'Comanche055',
    vehicle: 'cmSps',
    startGET: TIG - 45,
    initialProgram: null,
    vehicleOptions: { initial: 'loi1' },
    setup: (sim) => setupLoi1(sim, { stage: 'countdown' }),
  },
  {
    id: 'cm-entry',
    title: 'Entry (P61–P67, scripted)',
    description: [
      'Columbia\'s entry on 24 July 1969 at the level of the computer\'s programs: the displays and switching rules are from Comanche 055; the trajectory is a scripted profile through the Mission Report\'s and Entry PAD\'s numbers (in between: illustrative).',
      'P61 flashes V06N61 (splash point), V06N60 and V06N63: PRO through them. P62 asks for CM/SM separation (V50N25 00041): PRO, then PRO on V06N61.',
      'P63 waits for 0.05 g (195:03:34), P64 flies the constant-drag phase, P65 the up-control skip (PRO on the flashing V16N69), P67 the final phase until 1,000 ft/s.',
    ].join(' '),
    software: 'Comanche055',
    vehicle: 'cmSps',
    startGET: '194:44:00',
    initialProgram: null,
    vehicleOptions: { initial: 'entry' },
    setup: (sim) => setupEntry(sim, { stage: 61 }),
  },
];
