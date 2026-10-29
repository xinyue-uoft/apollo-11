// DskyState: what the DSKY hardware is showing right now. No behaviour —
// PINBALL (pinball.js), the Executive (COMP ACTY) and the alarm/restart code
// write here; the DSKY view only reads `snapshot()`.
//
// On the real machine the display is a bank of latching relays loaded one
// relay word (one digit pair) at a time through channel 10, plus discrete
// lamp bits in channel 11 and in relay word 12 (DSPTAB+11D):
//   Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:386-444 (relay words,
//   5-bit digit codes), Luminary099/INPUT_OUTPUT_CHANNEL_BIT_DESCRIPTIONS.agc:49-71
//   (channels 10 and 11). We keep the decoded result (characters, signs,
//   lamp booleans) because that is what every consumer needs; the relay
//   codes are kept below so the view draws digits exactly as the relays do.
//
// Every field can be read like plain data (`dsky.prog`, `dsky.lights.prog`,
// `dsky.r[0].digits`). Writes — through the setters or by plain assignment —
// are validated and bump `version` only when something actually changed, so
// views can skip frames cheaply. Unknown lamp names throw (catches typos).

export const LIGHT_NAMES = Object.freeze([
  'uplinkActy', 'noAtt', 'stby', 'keyRel', 'oprErr', 'prioDisp', 'noDap',
  'temp', 'gimbalLock', 'prog', 'restart', 'tracker', 'alt', 'vel', 'compActy',
]);

// Legends as engraved on the lamp windows / EL panel (web-dsky-b §1.2-1.3).
export const LIGHT_LEGENDS = Object.freeze({
  uplinkActy: 'UPLINK ACTY',
  noAtt: 'NO ATT',
  stby: 'STBY',
  keyRel: 'KEY REL',
  oprErr: 'OPR ERR',
  prioDisp: 'PRIO DISP',
  noDap: 'NO DAP',
  temp: 'TEMP',
  gimbalLock: 'GIMBAL LOCK',
  prog: 'PROG',
  restart: 'RESTART',
  tracker: 'TRACKER',
  alt: 'ALT',
  vel: 'VEL',
  compActy: 'COMP ACTY',
});

// Left lamp matrix, 2 columns x 7 rows, per DSKY variant (web-dsky-b §1.2,
// from the Virtual AGC lamp tables built from the engineering drawings).
// Left column lamps are white, right column lamps are "aviation yellow".
//   null           = no lamp window at all (plain blank area)
//   { blank: id }  = a blank lamp window that is never lit; `id` is the
//                    contract lamp that a later DSKY put there (PRIO DISP and
//                    NO DAP were decals added for Apollo 15-17 — Apollo 11's
//                    LM had blank windows; Luminary099 never drives relay
//                    word 12 bits 1-2).
export const DSKY_LAMP_LAYOUT = Object.freeze({
  // LM, ALARM INDICATOR 1005025-001 (Apollo 11-17 LM DSKY 2003994-091).
  Luminary099: Object.freeze([
    ['uplinkActy', 'temp'],
    ['noAtt', 'gimbalLock'],
    ['stby', 'prog'],
    ['keyRel', 'restart'],
    ['oprErr', 'tracker'],
    [{ blank: 'prioDisp' }, 'alt'],
    [{ blank: 'noDap' }, 'vel'],
  ]),
  // CM, ALARM INDICATOR 1006387: ten lamps; rows 6-7 are a plain blank area
  // (CAD 1006387D has exactly 10 cells; CSM AOH p. 2.2-19 "eleven status and
  // caution indicators" = these 10 + COMP ACTY).
  Comanche055: Object.freeze([
    ['uplinkActy', 'temp'],
    ['noAtt', 'gimbalLock'],
    ['stby', 'prog'],
    ['keyRel', 'restart'],
    ['oprErr', 'tracker'],
    [null, null],
    [null, null],
  ]),
});

// Lamps gated by the hardware flash signal while lit (KEY REL, OPR ERR) —
// "This indicator is modulated by the flash signal" (web-dsky-b §3).
export const FLASHING_LIGHTS = Object.freeze(['keyRel', 'oprErr']);

// V/N flash oscillator (hardware): period 1.28 s, 75 % on (web-dsky-b §3).
export const FLASH_PERIOD_S = 1.28;
export const FLASH_DUTY = 0.75;

// 5-bit relay codes per character, Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:432-444.
export const RELAY_CODES = Object.freeze({
  ' ': 0o00, 0: 0o25, 1: 0o03, 2: 0o31, 3: 0o33, 4: 0o17,
  5: 0o36, 6: 0o34, 7: 0o23, 8: 0o35, 9: 0o37,
});

// Segments lit by each of the 32 relay codes (a top, b upper right, c lower
// right, d bottom, e lower left, f upper left, g middle) — decoded from the
// DSKY schematic trace (web-dsky-b §5.1 [TRACE]). Includes the non-standard
// codes so relay self-test patterns would render correctly.
export const RELAY_SEGMENTS = Object.freeze([
  '', 'b', 'c', 'bc', 'cf', 'bcf', 'cf', 'bcf',
  'g', 'bg', 'cg', 'bcg', 'cfg', 'bcfg', 'cfg', 'bcfg',
  'ae', 'abe', 'ac', 'abc', 'acdef', 'abcdef', 'acdf', 'abcdf',
  'adeg', 'abdeg', 'acdg', 'abcdg', 'acdefg', 'abcdefg', 'acdfg', 'abcdfg',
]);

export function segmentsFor(ch) {
  const code = RELAY_CODES[ch];
  return code === undefined ? '' : RELAY_SEGMENTS[code];
}

const BLANK2 = '  ';
const BLANK5 = '     ';
const SIGNS = ['+', '-', ' '];

// '63' | 63 | ' 5' | '' | null → a 2-character field.
function toField2(value, what) {
  if (value === null || value === undefined || value === '') return BLANK2;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 99) {
      throw new RangeError(`DSKY ${what}: ${value} is not 0..99`);
    }
    return String(value).padStart(2, '0');
  }
  if (typeof value === 'string' && /^[0-9 ]{2}$/.test(value)) return value;
  throw new TypeError(`DSKY ${what}: expected 2 characters (digits or blanks), got ${JSON.stringify(value)}`);
}

function toSign(sign) {
  if (sign === null || sign === undefined || sign === '') return ' ';
  if (SIGNS.includes(sign)) return sign;
  throw new TypeError(`DSKY register sign must be '+', '-' or ' ', got ${JSON.stringify(sign)}`);
}

function toDigits5(digits) {
  if (digits === null || digits === undefined || digits === '') return BLANK5;
  if (typeof digits === 'string' && /^[0-9 ]{5}$/.test(digits)) return digits;
  throw new TypeError(`DSKY register digits must be 5 characters (digits or blanks), got ${JSON.stringify(digits)}`);
}

function checkIndex(i) {
  if (!Number.isInteger(i) || i < 0 || i > 2) {
    throw new RangeError(`DSKY register index must be 0, 1 or 2, got ${i}`);
  }
}

function checkLight(name) {
  if (!LIGHT_NAMES.includes(name)) throw new Error(`Unknown DSKY light "${name}"`);
}

export class DskyState {
  #prog = BLANK2;
  #verb = BLANK2;
  #noun = BLANK2;
  #regs = [
    { sign: ' ', digits: BLANK5 },
    { sign: ' ', digits: BLANK5 },
    { sign: ' ', digits: BLANK5 },
  ];
  #flash = false;
  #blanked = false;
  #lampTest = false;
  #lights = Object.fromEntries(LIGHT_NAMES.map((n) => [n, false]));
  #version = 0;

  constructor() {
    // `lights` and `r` are live, fixed-shape views: reading works like plain
    // data, writing (`dsky.lights.prog = true`, `dsky.r[0] = { sign, digits }`,
    // `dsky.r[1].digits = '00000'`) goes through the validating setters, and
    // a misspelt lamp name throws (the object is frozen; modules are strict).
    const lights = {};
    for (const name of LIGHT_NAMES) {
      Object.defineProperty(lights, name, {
        enumerable: true,
        get: () => this.#lights[name],
        set: (on) => this.setLight(name, on),
      });
    }
    const regs = [];
    for (let i = 0; i < 3; i++) {
      const reg = {};
      Object.defineProperty(reg, 'sign', {
        enumerable: true,
        get: () => this.#regs[i].sign,
        set: (sign) => this.setRegister(i, sign, this.#regs[i].digits),
      });
      Object.defineProperty(reg, 'digits', {
        enumerable: true,
        get: () => this.#regs[i].digits,
        set: (digits) => this.setRegister(i, this.#regs[i].sign, digits),
      });
      Object.freeze(reg);
      Object.defineProperty(regs, i, {
        enumerable: true,
        get: () => reg,
        set: (value) => this.setRegister(i, value),
      });
    }
    Object.defineProperty(this, 'lights', { value: Object.freeze(lights), enumerable: true });
    Object.defineProperty(this, 'r', { value: Object.freeze(regs), enumerable: true });
  }

  // ---------- read access ----------

  get prog() { return this.#prog; }
  get verb() { return this.#verb; }
  get noun() { return this.#noun; }
  get flashVerbNoun() { return this.#flash; }
  get blanked() { return this.#blanked; }
  get lampTest() { return this.#lampTest; }
  get version() { return this.#version; }

  // Plain assignment is accepted and validated like the setters.
  set prog(v) { this.setProg(v); }
  set verb(v) { this.setVerb(v); }
  set noun(v) { this.setNoun(v); }
  set flashVerbNoun(on) { this.setFlash(on); }
  set blanked(on) { this.setBlanked(on); }
  set lampTest(on) { this.setLampTest(on); }

  isLit(name) {
    checkLight(name);
    return this.#lights[name];
  }

  // ---------- setters (each bumps `version` once if anything changed) ----------

  // PROG / VERB / NOUN: 2-char strings of digits/blanks, or an integer
  // 0..99 (zero-padded, e.g. 0 → '00'), or ''/null for blank.
  setProg(value) { return this.#setField('prog', toField2(value, 'PROG')); }
  setVerb(value) { return this.#setField('verb', toField2(value, 'VERB')); }
  setNoun(value) { return this.#setField('noun', toField2(value, 'NOUN')); }

  // setRegister(i, sign, digits) or setRegister(i, { sign, digits }) — the
  // second form takes formatRegister()'s result directly. i = 0..2 (R1..R3).
  // A blank sign with digits is how an octal value shows (no sign relay).
  setRegister(i, sign, digits) {
    checkIndex(i);
    if (sign && typeof sign === 'object') ({ sign, digits } = sign);
    const s = toSign(sign);
    const d = toDigits5(digits);
    const cur = this.#regs[i];
    if (cur.sign === s && cur.digits === d) return false;
    this.#regs[i] = { sign: s, digits: d };
    this.#version += 1;
    return true;
  }

  setRegisterBlank(i) {
    return this.setRegister(i, ' ', BLANK5);
  }

  setLight(name, on) {
    checkLight(name);
    const v = !!on;
    if (this.#lights[name] === v) return false;
    this.#lights[name] = v;
    this.#version += 1;
    return true;
  }

  // Several lamps at once: setLights({ prog: true, oprErr: false }).
  setLights(map) {
    for (const name of Object.keys(map)) checkLight(name);
    let changed = false;
    for (const [name, on] of Object.entries(map)) {
      const v = !!on;
      if (this.#lights[name] !== v) {
        this.#lights[name] = v;
        changed = true;
      }
    }
    if (changed) this.#version += 1;
    return changed;
  }

  // V/N FLASH, channel 11 bit 6 (FLASHON/FLASHOFF,
  // Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:3475-3483). The hardware
  // oscillator does the actual blinking; the view animates it.
  setFlash(on) { return this.#setFlag('flash', !!on); }

  // All EL digits dark (e.g. BURNBABY's 5 s blank at TIG-35 s).
  setBlanked(on) { return this.#setFlag('blanked', !!on); }

  // V35 in progress (VBTSTLTS ... TSTLTS3,
  // Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:3623-3714).
  setLampTest(on) { return this.#setFlag('lampTest', !!on); }

  // The V35 digit pattern: every digit relay 8 and the three '+' sign relays
  // (FULLDSP OCT 05675 = "DISPLAY ALL 8'S", FULLDSP1 OCT 07675 = "ALL 8'S AND +",
  // Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:3661-3662). Lamps and the
  // V/N flash are separate (TSTCON1/TSTCON2) and left to the caller.
  setAll8s() {
    return this.#batch(() => {
      this.#prog = '88';
      this.#verb = '88';
      this.#noun = '88';
      this.#regs = [0, 1, 2].map(() => ({ sign: '+', digits: '88888' }));
    });
  }

  // Blank PROG/VERB/NOUN and R1-R3 (digits and sign relays). With
  // { keepProg: true } the major-mode digits stay (as after ENEMA's DSPOFF,
  // when MMDSPLAY re-shows PROG).
  blankDigits({ keepProg = false } = {}) {
    return this.#batch(() => {
      if (!keepProg) this.#prog = BLANK2;
      this.#verb = BLANK2;
      this.#noun = BLANK2;
      this.#regs = [0, 1, 2].map(() => ({ sign: ' ', digits: BLANK5 }));
    });
  }

  // Everything back to the power-on state: digits blank, no flash, not
  // blanked, no lamp test, every lamp off. { lights: false } keeps the lamps.
  clearAll({ lights = true } = {}) {
    return this.#batch(() => {
      this.#prog = BLANK2;
      this.#verb = BLANK2;
      this.#noun = BLANK2;
      this.#regs = [0, 1, 2].map(() => ({ sign: ' ', digits: BLANK5 }));
      this.#flash = false;
      this.#blanked = false;
      this.#lampTest = false;
      if (lights) for (const n of LIGHT_NAMES) this.#lights[n] = false;
    });
  }

  // Deep copy, cheap enough to call every frame.
  snapshot() {
    const r = this.#regs;
    return {
      prog: this.#prog,
      verb: this.#verb,
      noun: this.#noun,
      r: [
        { sign: r[0].sign, digits: r[0].digits },
        { sign: r[1].sign, digits: r[1].digits },
        { sign: r[2].sign, digits: r[2].digits },
      ],
      flashVerbNoun: this.#flash,
      lights: { ...this.#lights },
      blanked: this.#blanked,
      lampTest: this.#lampTest,
      version: this.#version,
    };
  }

  toJSON() {
    return this.snapshot();
  }

  // ---------- internals ----------

  #setField(which, value) {
    const cur = which === 'prog' ? this.#prog : which === 'verb' ? this.#verb : this.#noun;
    if (cur === value) return false;
    if (which === 'prog') this.#prog = value;
    else if (which === 'verb') this.#verb = value;
    else this.#noun = value;
    this.#version += 1;
    return true;
  }

  #setFlag(which, value) {
    const cur = which === 'flash' ? this.#flash : which === 'blanked' ? this.#blanked : this.#lampTest;
    if (cur === value) return false;
    if (which === 'flash') this.#flash = value;
    else if (which === 'blanked') this.#blanked = value;
    else this.#lampTest = value;
    this.#version += 1;
    return true;
  }

  // Run a multi-field change; bump version once if the visible state moved.
  #batch(fn) {
    const before = signature(this.snapshot());
    fn();
    const changed = signature(this.snapshot()) !== before;
    if (changed) this.#version += 1;
    return changed;
  }
}

function signature(s) {
  let lights = '';
  for (const n of LIGHT_NAMES) lights += s.lights[n] ? '1' : '0';
  return `${s.prog}|${s.verb}|${s.noun}|${s.r.map((x) => x.sign + x.digits).join('|')}|`
    + `${s.flashVerbNoun ? 1 : 0}${s.blanked ? 1 : 0}${s.lampTest ? 1 : 0}|${lights}`;
}

// Which contract lamps physically exist (and can light) on a DSKY variant.
export function lampsOn(software) {
  const layout = DSKY_LAMP_LAYOUT[software] || DSKY_LAMP_LAYOUT.Luminary099;
  return layout.flat().filter((x) => typeof x === 'string');
}

// A readable one-line summary of a DskyState snapshot, for the view's
// aria-live region and for logs/tests, e.g.
// "Program 63. Verb 06 Noun 63. Register 1 minus 02900. ... Lamps lit: PROG."
// COMP ACTY is left out on purpose: it flickers with the Executive's load.
export function dskySummary(snap, { software = 'Luminary099' } = {}) {
  if (!snap) return 'DSKY off.';
  const parts = [];
  if (snap.lampTest) parts.push('Lamp test.');
  const field = (text) => text.trim() || 'blank';
  if (snap.blanked) {
    parts.push('Display blanked.');
  } else {
    parts.push(`Program ${field(snap.prog)}.`);
    parts.push(`Verb ${field(snap.verb)} Noun ${field(snap.noun)}${snap.flashVerbNoun ? ', flashing' : ''}.`);
    snap.r.forEach((reg, i) => {
      const digits = reg.digits.trim();
      if (!digits && reg.sign === ' ') {
        parts.push(`Register ${i + 1} blank.`);
        return;
      }
      const sign = reg.sign === '+' ? 'plus ' : reg.sign === '-' ? 'minus ' : '';
      parts.push(`Register ${i + 1} ${sign}${digits || 'blank'}.`);
    });
  }
  const lit = lampsOn(software)
    .filter((n) => snap.lights[n])
    .map((n) => (FLASHING_LIGHTS.includes(n) ? `${LIGHT_LEGENDS[n]} (flashing)` : LIGHT_LEGENDS[n]));
  if (lit.length) parts.push(`Lamps lit: ${lit.join(', ')}.`);
  return parts.join(' ');
}
