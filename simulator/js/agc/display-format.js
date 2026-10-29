// Number -> DSKY register formatting, the way PINBALL's output routines do
// it (ARCHITECTURE §6.2). Values arrive already in display units (ft, ft/s,
// deg, nmi, s ...); the noun tables (nouns.js) choose the format code.
//
// What the real code does, and what we reproduce:
// - Decimal (DSPDECWD, Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:
//   2481-2537): the sign relay comes from the sign of the word *before*
//   rounding — "+" for positive and +0, "-" for negative AND for -0
//   (DSPSIGN, :2481-2493); then 5 digits with leading zeros, rounded half up
//   on the magnitude (DECROUND adds half a least-significant digit,
//   :2495-2503); a rounding overflow saturates to 99999 (:2499-2502). There
//   is no decimal point on the hardware: the noun's scale implies it. The
//   scale-factor routines themselves can overflow for values beyond the
//   documented maxima; saturating at 99999 there too is our simplification.
// - Octal (DSPOCTWO, :2596-2626): 5 octal digits of the 15-bit word, leading
//   zeros, both sign relays off ("CAF BIT14 # TO BLANK SIGNS").
// - Minutes/seconds (M/SOUT, :1594-1674): sign, minutes in D1D2, D3 blank,
//   seconds in D4D5; rounded by +/-0.5 s (SEPSEC, :1664-1673); a magnitude
//   of 59 min 58.5 s or more is forced to 59 min 59 s (M/SLIMIT, :1613).
// - Hours/minutes/seconds (HMSOUT, :1546-1579): three registers, hours
//   "00xxx.", minutes mod 60 "000xx.", seconds mod 60 "0xx.xx"; the seconds
//   are not rounded (SEPSECNR, :1675), i.e. the clock is truncated to centiseconds.
// - Two integers (2INTOUT, :1498-1515): "+" forced, D1D2 = first integer,
//   D3 blank, D4D5 = second (like the verb/noun digits: no rounding).
// - CDU degrees (DEGOUTSF, :1394-1402): 0..359.99, negative AGC angles show
//   as 360 - |x|, always "+".
// - LR position (LRPOSOUT, :1419-1429): "+0000x", x = 0..3.
//
// Format codes (strings). The first eight are the contract's (§6.2); the
// rest are needed by the Luminary099/Comanche055 noun tables:
//   'XXXXX'       signed decimal, whole            (scale C, "xxxxx.")
//   'XXXX.X'      signed decimal, 1 implied decimal (VEL3, POS4, POS7 ...)
//   'XXX.XX'      signed decimal, 2 implied decimals (DPDEG(360), POS5 ...)
//   'X.XXXX'      signed decimal, 4 implied decimals (contract; no 099 noun)
//   '.XXXXX'      signed fraction                  (scale B, "FRAC")
//   'XXbXX'       minutes/seconds, signed          (scale L, M/SOUT)
//   'XXXXX OCT'   octal, no sign                   (scale A)
//   'BLANK'       blank register
//   'XX.XXX'      signed decimal, 3 implied decimals (DPDEG(90), elevation)
//   'XXX.XX CDU'  CDU angle 0..359.99, always "+"   (scale D, DEGOUTSF)
//   '+XXbYY'      two integers 0..99, "+" forced   (scale PP, 2INTOUT);
//                 value = [first, second] or { first, second }
//   '+0000X'      landing-radar antenna position   (scale TT, LRPOSOUT)
//   'HMS.H' 'HMS.M' 'HMS.S'  hours / minutes / seconds registers of a time
//                 given in seconds                 (scale K, HMSOUT)
//
// `null`, `undefined` or a non-finite number gives a blank register.

export const BLANK_REGISTER = Object.freeze({ sign: ' ', digits: '     ' });

export const FORMATS = Object.freeze({
  XXXXX: { kind: 'decimal', decimals: 0, text: 'xxxxx.' },
  'XXXX.X': { kind: 'decimal', decimals: 1, text: 'xxxx.x' },
  'XXX.XX': { kind: 'decimal', decimals: 2, text: 'xxx.xx' },
  'XX.XXX': { kind: 'decimal', decimals: 3, text: 'xx.xxx' },
  'X.XXXX': { kind: 'decimal', decimals: 4, text: 'x.xxxx' },
  '.XXXXX': { kind: 'decimal', decimals: 5, text: '.xxxxx' },
  'XXX.XX CDU': { kind: 'cdu', decimals: 2, text: 'xxx.xx (0-359.99)' },
  XXbXX: { kind: 'minsec', text: 'xxBxx (min/sec)' },
  '+XXbYY': { kind: 'twoint', text: '+xxByy' },
  '+0000X': { kind: 'lrpos', text: '+0000x' },
  'HMS.H': { kind: 'hms', part: 'h', text: '00xxx. h' },
  'HMS.M': { kind: 'hms', part: 'm', text: '000xx. min' },
  'HMS.S': { kind: 'hms', part: 's', text: '0xx.xx s' },
  'XXXXX OCT': { kind: 'octal', text: 'xxxxx (octal)' },
  BLANK: { kind: 'blank', text: 'blank' },
});

// Aliases accepted for convenience.
const ALIASES = { OCT: 'XXXXX OCT', OCTAL: 'XXXXX OCT', 'MM:SS': 'XXbXX', CDU: 'XXX.XX CDU' };

export const MAX5 = 99999;
const WORD = 0o77777;

export function isFormat(format) {
  return Object.prototype.hasOwnProperty.call(FORMATS, format) || Object.prototype.hasOwnProperty.call(ALIASES, format);
}

export function normaliseFormat(format) {
  if (Object.prototype.hasOwnProperty.call(FORMATS, format)) return format;
  if (Object.prototype.hasOwnProperty.call(ALIASES, format)) return ALIASES[format];
  throw new Error(`Unknown DSKY register format ${JSON.stringify(format)}`);
}

const pad = (n, w) => String(n).padStart(w, '0');
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// Sign of the AGC word: '-' for negative numbers and for -0 (DSPSIGN).
export function signOf(v) {
  return v < 0 || Object.is(v, -0) ? '-' : '+';
}

// Round half up on the magnitude, in units of the last digit. The tiny
// relative epsilon keeps binary floating point from turning 12345.5 into
// 12345.499999999998 (PINBALL rounds a binary fraction, so exact decimal
// ties are not meaningful anyway).
function roundMag(mag, decimals) {
  const x = mag * 10 ** decimals;
  return Math.floor(x + 0.5 + 1e-9 * Math.max(1, x));
}

// Five decimal digits with saturation (DSPRND / DPOSMAX).
function digits5(n) {
  return pad(Math.min(MAX5, Math.max(0, n)), 5);
}

// A 15-bit AGC word (ones' complement for negative numbers: -0 = 77777).
export function toWord(v) {
  if (!finite(v)) return 0;
  const n = Math.trunc(v);
  if (n < 0 || Object.is(v, -0) || (n === 0 && v < 0)) return (~Math.min(-n, 0o37777)) & WORD;
  return n & WORD;
}

// "01202"-style: 5 octal digits of a 15-bit word.
export function octal5(word) {
  return pad((Number(word) & WORD).toString(8), 5);
}

// Two-digit VERB / NOUN / PROG field (DSPDECVN: no sign, no rounding,
// leading zero kept), '  ' for null.
export function twoDigits(n) {
  if (n === null || n === undefined || !finite(n)) return '  ';
  return pad(Math.min(99, Math.max(0, Math.trunc(n))), 2);
}

export function formatRegister(value, format = 'XXXXX') {
  const code = normaliseFormat(format);
  const f = FORMATS[code];
  if (f.kind === 'blank') return { ...BLANK_REGISTER };

  if (f.kind === 'twoint') return formatTwoInt(value);
  if (value === null || value === undefined) return { ...BLANK_REGISTER };
  if (!finite(value)) return { ...BLANK_REGISTER };

  switch (f.kind) {
    case 'decimal':
      return { sign: signOf(value), digits: digits5(roundMag(Math.abs(value), f.decimals)) };
    case 'cdu': {
      // DEGOUTSF: the angle is taken modulo 360 and shown positive.
      let a = value % 360;
      if (a < 0) a += 360;
      let n = roundMag(a, 2);
      if (n >= 36000) n -= 36000;
      return { sign: '+', digits: digits5(n) };
    }
    case 'minsec':
      return formatMinSec(value);
    case 'lrpos':
      return { sign: '+', digits: digits5(Math.max(0, Math.min(3, Math.trunc(value)))) };
    case 'hms':
      return formatHmsPart(value, f.part);
    case 'octal':
      return { sign: ' ', digits: octal5(toWord(value)) };
    default:
      return { ...BLANK_REGISTER };
  }
}

// M/SOUT: 'XXbXX'.
function formatMinSec(seconds) {
  const sign = signOf(seconds);
  const mag = Math.abs(seconds);
  // M/SLIMIT: at or above 59 min 58.5 s the display is forced to 59B59;
  // otherwise SEPSEC rounds by 0.5 s.
  const t = mag >= 59 * 60 + 58.5 ? 59 * 60 + 59 : Math.floor(mag + 0.5);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return { sign, digits: `${pad(m, 2)} ${pad(s, 2)}` };
}

// HMSOUT: hours, minutes mod 60, centiseconds mod 6000, each signed.
function formatHmsPart(seconds, part) {
  const sign = signOf(seconds);
  // AGC time is an integer number of centiseconds; truncate the float GET.
  const cs = Math.floor(Math.abs(seconds) * 100 + 1e-6);
  let n;
  if (part === 'h') n = Math.floor(cs / 360000);
  else if (part === 'm') n = Math.floor(cs / 6000) % 60;
  else n = cs % 6000;
  return { sign, digits: digits5(n) };
}

// 2INTOUT: '+XXbYY'.
function formatTwoInt(value) {
  if (value === null || value === undefined) return { ...BLANK_REGISTER };
  let a;
  let b;
  if (Array.isArray(value)) [a, b] = value;
  else if (typeof value === 'object') ({ first: a, second: b } = value);
  else return { ...BLANK_REGISTER };
  if (!finite(a) && !finite(b)) return { ...BLANK_REGISTER };
  // TREDES/LOOKANGL are limited to 0..99 by the program (TDISPSET,
  // LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:1384-1410); clamp the same way.
  const two = (x) => pad(Math.max(0, Math.min(99, Math.trunc(finite(x) ? x : 0))), 2);
  return { sign: '+', digits: `${two(a)} ${two(b)}` };
}

// The three registers of an HMS noun from one time in seconds.
export function formatHms(seconds) {
  return [formatRegister(seconds, 'HMS.H'), formatRegister(seconds, 'HMS.M'), formatRegister(seconds, 'HMS.S')];
}

// The inverse used by load verbs: digits keyed for a register -> value in
// display units. `entry` = { sign: '+'|'-'|null, digits: '12345' } (digits
// may be fewer than 5 for octal). Returns { ok, value, reason }.
export function parseEntry(entry, format) {
  const code = normaliseFormat(format);
  const f = FORMATS[code];
  const text = String(entry.digits || '').replace(/\s/g, '');
  if (entry.sign) {
    const n = Number.parseInt(text || '0', 10);
    const neg = entry.sign === '-';
    switch (f.kind) {
      case 'decimal': {
        const v = n / 10 ** f.decimals;
        return { ok: true, value: neg ? -v : v };
      }
      case 'cdu':
        // DEGINSF: CDU angles are loaded as 0..359.99 ("value too large
        // for the scale" otherwise -> ALMCYCLE).
        if (n >= 36000) return { ok: false, reason: 'angle above 359.99' };
        return { ok: true, value: (neg ? -n : n) / 100 };
      case 'hms': {
        // HMSIN limits (ASSEMBLY_AND_OPERATION_INFORMATION.agc:725-737).
        if (f.part === 'h') return n <= 745 ? { ok: true, value: neg ? -n : n } : { ok: false, reason: 'hours > 745' };
        if (f.part === 'm') return n <= 59 ? { ok: true, value: neg ? -n : n } : { ok: false, reason: 'minutes > 59' };
        return n <= 5999 ? { ok: true, value: (neg ? -n : n) / 100 } : { ok: false, reason: 'seconds > 59.99' };
      }
      case 'octal':
        return { ok: false, reason: 'decimal data into an octal-only component' };
      default:
        return { ok: false, reason: `component cannot be loaded (${code})` };
    }
  }
  // Octal entry.
  const n = Number.parseInt(text || '0', 8);
  if (f.kind === 'octal' || f.kind === 'decimal' || f.kind === 'cdu') return { ok: true, value: n, octal: true };
  return { ok: false, reason: `octal data into ${code}` };
}
