// The demo scenarios, in the order the scenario picker shows them
// (ARCHITECTURE §11.2). Each file is one scenario in the §9.1 format; the
// shared crew schedule (crew-a11.js) and helpers (lib.js) are not scenarios.

import dskyBasics from './dsky-basics.js';
import burnBabyBurn from './burn-baby-burn.js';
import p63Braking from './p63-braking.js';
import alarms1202 from './alarms-1202.js';
import p64Approach from './p64-approach.js';
import p66Touchdown from './p66-touchdown.js';
import fullDescent from './full-descent.js';
import cmLoi from './cm-loi.js';

export const SCENARIOS = Object.freeze([
  dskyBasics,
  burnBabyBurn,
  p63Braking,
  alarms1202,
  p64Approach,
  p66Touchdown,
  fullDescent,
  cmLoi,
]);
