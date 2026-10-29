// Scenario validation (ARCHITECTURE §9.1). Pure logic: used by the scenario
// test suite and by the Director, which warns about a malformed scenario in
// development instead of failing in the middle of a replay.
//
//   validateScenario(scenario) → { ok, errors: [string] }
//
// One scenario event = `at` + exactly ONE of the event kinds below, plus
// optional `who` / `gapMs` (with `keys`) and a free-text `note` for authors.

import { parseGET } from '../util/time.js';
import { parseKeys } from '../util/keys.js';
import { findDisallowedMarkup } from '../ui/html.js';

// Order matters: when an event carries several kinds anyway (the Director is
// lenient at run time), they are applied in this order — `hold` last, so a
// hold always pauses *after* whatever else happens at that instant.
export const EVENT_KINDS = Object.freeze([
  'chapter', 'speed', 'action', 'keys', 'focus', 'narrate', 'say', 'spotlight', 'hold',
]);
export const EVENT_EXTRA_KEYS = Object.freeze(['at', 'who', 'gapMs', 'note']);
export const NARRATE_KEYS = Object.freeze(['title', 'body', 'anchors', 'focus']);
// Panels the app can switch to on a `focus` (app.js bindBus → selectTab).
export const FOCUS_PANELS = Object.freeze(['trajectory', 'exec', 'ignition']);
export const SOFTWARE = Object.freeze(['Luminary099', 'Comanche055']);
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 60;
export const MAX_HOLD = 30; // s of real time; longer pauses belong to the user

const ID_RE = /^[\w-]+$/; // what app.js accepts in a #/demo/<id> route
const ANCHOR_RE = /^\S+$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim().length > 0;

function tryGET(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  try {
    const t = parseGET(value);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

export function validateScenario(scenario) {
  const errors = [];
  if (!isObject(scenario)) return { ok: false, errors: ['scenario must be an object'] };

  const name = isText(scenario.id) ? scenario.id : '(no id)';
  const err = (msg) => errors.push(`${name}: ${msg}`);

  // ---------- header ----------
  if (!isText(scenario.id) || !ID_RE.test(scenario.id)) {
    err('id must be a non-empty string of letters, digits, "-" or "_"');
  }
  if (!isText(scenario.title)) err('title must be a non-empty string');
  if (!isText(scenario.summary)) err('summary must be a non-empty string');
  if (!SOFTWARE.includes(scenario.software)) {
    err(`software must be one of ${SOFTWARE.join(', ')} (got ${JSON.stringify(scenario.software)})`);
  }
  if (scenario.vehicle !== undefined && !isText(scenario.vehicle)) {
    err('vehicle must be a non-empty string when given');
  }
  if (scenario.vehicle === 'replay' && !isText(scenario.track)) {
    err('a replay scenario needs a track (key of TRACKS in data/tracks.js)');
  }
  if (scenario.track !== undefined && scenario.track !== null && !isText(scenario.track)) {
    err('track must be a string when given');
  }
  if (scenario.initialProgram !== undefined && scenario.initialProgram !== null
    && !(Number.isInteger(scenario.initialProgram) && scenario.initialProgram >= 0)) {
    err('initialProgram must be a non-negative integer (major mode) or null');
  }
  if (scenario.setup !== undefined && typeof scenario.setup !== 'function') {
    err('setup must be a function (sim) => void when given');
  }
  if (scenario.speed !== undefined
    && !(Number.isFinite(scenario.speed) && scenario.speed >= MIN_SPEED && scenario.speed <= MAX_SPEED)) {
    err(`speed must be a number in [${MIN_SPEED}, ${MAX_SPEED}]`);
  }

  const start = tryGET(scenario.start);
  const end = tryGET(scenario.end);
  if (start === null) err(`start must be a GET "hhh:mm:ss[.s]" (got ${JSON.stringify(scenario.start)})`);
  if (end === null) err(`end must be a GET "hhh:mm:ss[.s]" (got ${JSON.stringify(scenario.end)})`);
  if (start !== null && end !== null && !(end > start)) err('end must be after start');

  // ---------- events ----------
  if (!Array.isArray(scenario.events) || scenario.events.length === 0) {
    err('events must be a non-empty array');
    return { ok: errors.length === 0, errors };
  }

  let prev = -Infinity;
  scenario.events.forEach((ev, index) => {
    const where = `events[${index}]${isObject(ev) && ev.at !== undefined ? ` @${ev.at}` : ''}`;
    const e = (msg) => err(`${where}: ${msg}`);
    if (!isObject(ev)) {
      e('event must be an object');
      return;
    }

    const t = tryGET(ev.at);
    if (t === null) {
      e(`at must be a GET "hhh:mm:ss[.s]" (got ${JSON.stringify(ev.at)})`);
    } else {
      if (t < prev) e('events must be sorted by `at` (this one is earlier than the one before)');
      prev = Math.max(prev, t);
      if (start !== null && t < start) e(`at is before the scenario start ${scenario.start}`);
      if (end !== null && t > end) e(`at is after the scenario end ${scenario.end}`);
    }

    const kinds = EVENT_KINDS.filter((k) => ev[k] !== undefined);
    const unknown = Object.keys(ev).filter((k) => !EVENT_KINDS.includes(k) && !EVENT_EXTRA_KEYS.includes(k));
    if (unknown.length) e(`unknown key(s) ${unknown.map((k) => `"${k}"`).join(', ')}`);
    if (kinds.length === 0) e(`event needs one of ${EVENT_KINDS.join(', ')}`);
    if (kinds.length > 1) e(`event has several kinds (${kinds.join(', ')}); split it into one event per kind`);
    if ((ev.who !== undefined || ev.gapMs !== undefined) && ev.keys === undefined) {
      e('who/gapMs only apply to a keys event (a say event carries its own who)');
    }
    if (ev.note !== undefined && typeof ev.note !== 'string') e('note must be a string');

    for (const kind of kinds) checkKind(kind, ev, e);
  });

  return { ok: errors.length === 0, errors };
}

function checkKind(kind, ev, e) {
  const v = ev[kind];
  switch (kind) {
    case 'chapter':
      if (!isText(v) && !(isObject(v) && isText(v.title))) e('chapter must be a non-empty title string');
      break;

    case 'narrate': {
      if (!isObject(v)) {
        e('narrate must be an object { title, body, anchors?, focus? }');
        break;
      }
      const unknown = Object.keys(v).filter((k) => !NARRATE_KEYS.includes(k));
      if (unknown.length) e(`narrate has unknown key(s) ${unknown.map((k) => `"${k}"`).join(', ')}`);
      if (!isText(v.title)) e('narrate.title must be a non-empty string');
      if (!isText(v.body)) {
        e('narrate.body must be a non-empty string');
      } else {
        const bad = findDisallowedMarkup(v.body);
        if (bad.length) e(`narrate.body uses markup the sanitiser strips: ${bad.join(', ')}`);
      }
      if (v.anchors !== undefined) {
        if (!Array.isArray(v.anchors)) e('narrate.anchors must be an array of anchor id strings');
        else {
          v.anchors.forEach((a, i) => {
            if (typeof a !== 'string' || !ANCHOR_RE.test(a)) e(`narrate.anchors[${i}] must be an anchor id string`);
          });
        }
      }
      if (v.focus !== undefined && !FOCUS_PANELS.includes(v.focus)) {
        e(`narrate.focus must be one of ${FOCUS_PANELS.join(', ')}`);
      }
      break;
    }

    case 'say':
      if (!isObject(v)) {
        e('say must be an object { who, text, src? }');
        break;
      }
      if (!isText(v.who)) e('say.who must be a non-empty string');
      if (!isText(v.text)) e('say.text must be a non-empty string');
      if (v.src !== undefined && typeof v.src !== 'string') e('say.src must be a string');
      if (v.t !== undefined && tryGET(v.t) === null) e('say.t (the quote\'s own GET) must parse');
      break;

    case 'keys':
      if (!isText(v)) {
        e('keys must be a keystroke script string such as "V16N68E"');
      } else {
        try {
          if (parseKeys(v).length === 0) e('keys script is empty');
        } catch (error) {
          e(error.message);
        }
      }
      if (ev.who !== undefined && !isText(ev.who)) e('who must be a non-empty string');
      if (ev.gapMs !== undefined && !(Number.isFinite(ev.gapMs) && ev.gapMs > 0)) {
        e('gapMs must be a positive number of milliseconds');
      }
      break;

    case 'action':
      if (typeof v !== 'function') e('action must be a function (sim) => void');
      break;

    case 'hold':
      if (!(Number.isFinite(v) && v > 0 && v <= MAX_HOLD)) e(`hold must be a number of seconds in (0, ${MAX_HOLD}]`);
      break;

    case 'spotlight': {
      const list = Array.isArray(v) ? v : [v];
      if (list.length === 0 || !list.every(isText)) e('spotlight must be a data-spot id string (or an array of them)');
      break;
    }

    case 'focus':
      if (!FOCUS_PANELS.includes(v)) e(`focus must be one of ${FOCUS_PANELS.join(', ')}`);
      break;

    case 'speed':
      if (!(Number.isFinite(v) && v >= MIN_SPEED && v <= MAX_SPEED)) {
        e(`speed must be a number in [${MIN_SPEED}, ${MAX_SPEED}]`);
      }
      break;

    default:
      break;
  }
}
