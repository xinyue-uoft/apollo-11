// Comanche 055 (Command Module "Columbia") major-mode programs.
// js/agc/programs/index.js re-exports this map as PROGRAMS_COMANCHE055.
//
//   P00  CMC idling                      p00.js
//   P40  SPS thrusting (LOI-1 showcase)  p40.js
//   P61–P67  entry, milestones level     entry.js

import P00 from './p00.js';
import P40 from './p40.js';
import { P61, P62, P63, P64, P65, P66, P67 } from './entry.js';

export const PROGRAMS_COMANCHE055 = Object.freeze({
  0: P00,
  40: P40,
  61: P61,
  62: P62,
  63: P63,
  64: P64,
  65: P65,
  66: P66,
  67: P67,
});

export { P00, P40, P61, P62, P63, P64, P65, P66, P67 };
