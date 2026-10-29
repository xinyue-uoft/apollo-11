// Vehicle providers (ARCHITECTURE §8). The Simulation creates one with
//   createVehicle(kind, { track, rng, startGET, ...vehicleOptions })
// and calls vehicle.step(dt, commands, t) every 10-ms substep.
//
//   'static'  StaticVehicle — parked, zero rates (DSKY-only use)
//   'replay'  ReplayVehicle — interpolates a historical track; ignores commands
//   'physics' LmPhysics     — the LM flying the descent; obeys the AGC's commands.
//             Without an explicit `initialState` it starts from the track
//             (default: the Apollo 11 descent) at `startGET`.
//   'cmSps'   CmSpsVehicle  — the CSM for SPS burns (engineer D2's cm-sps.js)

import { StaticVehicle } from './static.js';
import { ReplayVehicle } from './replay.js';
import { LmPhysics, stateFromTrack } from './lm-physics.js';
import { CmSpsVehicle } from './cm-sps.js';

export { StaticVehicle, ReplayVehicle, LmPhysics, CmSpsVehicle, stateFromTrack };
export { createTrackModel } from './replay.js';

export const VEHICLE_KINDS = Object.freeze(['static', 'replay', 'physics', 'cmSps']);

export function createVehicle(kind = 'static', opts = {}) {
  switch (kind) {
    case 'static':
      return new StaticVehicle(opts);
    case 'replay':
      return new ReplayVehicle(opts);
    case 'physics':
      return new LmPhysics(opts);
    case 'cmSps':
      return new CmSpsVehicle(opts);
    default:
      throw new Error(`Unknown vehicle kind "${kind}" (expected ${VEHICLE_KINDS.join(', ')})`);
  }
}
