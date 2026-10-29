// Tiny DOM helpers shared by the demo views (narration, transcript,
// timeline, controls) and the whitelist sanitiser for scenario narration
// bodies (ARCHITECTURE §9.1).
//
// The sanitiser and the formatting helpers are pure string functions, so
// this module imports cleanly in Node (the scenario validator and the tests
// use them). Everything that touches `document` does so only when called.

import { TOUCHDOWN_LIMITS, LM } from '../vehicle/constants.js';
import { toFps } from '../util/units.js';

// ---------- sanitiser ----------

// Elements a narration body may use. The only attribute that survives is
// `class` (letters, digits, `-`, `_` and spaces). Everything else is
// dropped; the text inside a dropped element is kept unless the element is
// one whose content is not prose (scripts, styles, embedded documents...).
export const ALLOWED_TAGS = Object.freeze([
  'b', 'i', 'em', 'strong', 'code', 'br', 'p', 'ul', 'ol', 'li', 'kbd', 'span',
]);
const ALLOWED = new Set(ALLOWED_TAGS);
const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'embed', 'source', 'track',
  'wbr', 'area', 'base', 'col', 'param']);
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'template', 'noscript',
  'textarea', 'title', 'svg', 'math', 'select', 'xmp', 'noembed', 'noframes', 'frameset',
  'head', 'canvas', 'video', 'audio', 'applet', 'plaintext']);

// `<tag attr="a>b" ...>` — quoted attribute values may contain `>`.
const TAG_RE = /<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y;
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const ENTITY_RE = /&(?:[A-Za-z][A-Za-z0-9]{1,31}|#\d{1,7}|#[xX][0-9A-Fa-f]{1,6});/y;

function cleanClass(value) {
  return String(value).replace(/[^A-Za-z0-9_\- ]/g, '').replace(/\s+/g, ' ').trim();
}

// Escape text for HTML, keeping well-formed character references
// (`&amp;`, `&#8211;`, `&nbsp;`) so authors can write them.
function escapeText(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '&') {
      ENTITY_RE.lastIndex = i;
      const m = ENTITY_RE.exec(text);
      if (m) {
        out += m[0];
        i += m[0].length - 1;
      } else {
        out += '&amp;';
      }
    } else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else out += ch;
  }
  return out;
}

// Whitelist sanitiser: string in, safe HTML string out. When `issues` (an
// array) is given, every construct that was removed is described in it —
// the scenario validator uses that to tell authors what would be stripped.
export function sanitizeHtml(html, { issues = null } = {}) {
  const src = html === null || html === undefined ? '' : String(html);
  const report = (what) => {
    if (issues && !issues.includes(what)) issues.push(what);
  };
  const stack = [];
  let out = '';
  let text = '';
  const flush = () => {
    if (text) out += escapeText(text);
    text = '';
  };

  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      text += src.slice(i);
      break;
    }
    text += src.slice(i, lt);
    i = lt;

    // Comments, doctypes, CDATA, processing instructions: dropped.
    if (src.startsWith('<!--', i)) {
      const close = src.indexOf('-->', i + 4);
      report('<!-- comment -->');
      i = close < 0 ? src.length : close + 3;
      continue;
    }
    if (src[i + 1] === '!' || src[i + 1] === '?') {
      const close = src.indexOf('>', i);
      report(src[i + 1] === '!' ? '<!...>' : '<?...?>');
      i = close < 0 ? src.length : close + 1;
      continue;
    }

    TAG_RE.lastIndex = i;
    const m = TAG_RE.exec(src);
    if (!m) {
      // A lone '<' (e.g. "altitude < 500 ft") is text.
      text += '<';
      i += 1;
      continue;
    }
    i = TAG_RE.lastIndex;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrText = m[3] || '';

    if (!ALLOWED.has(tag)) {
      if (!closing) report(`<${tag}>`);
      if (!closing && DROP_CONTENT.has(tag) && !/\/\s*$/.test(attrText)) {
        // Skip everything up to the matching end tag (or the end).
        const endRe = new RegExp(`</${tag}\\s*>`, 'ig');
        endRe.lastIndex = i;
        const end = endRe.exec(src);
        i = end ? endRe.lastIndex : src.length;
      }
      continue;
    }

    flush();
    if (closing) {
      const at = stack.lastIndexOf(tag);
      if (at < 0) continue; // stray end tag
      while (stack.length > at) out += `</${stack.pop()}>`;
      continue;
    }

    let cls = '';
    ATTR_RE.lastIndex = 0;
    let a;
    while ((a = ATTR_RE.exec(attrText))) {
      const name = a[1].toLowerCase();
      if (name === '/') continue;
      if (name === 'class') {
        cls = cleanClass(a[2] ?? a[3] ?? a[4] ?? '');
      } else {
        report(`<${tag} ${name}>`);
      }
    }
    out += cls ? `<${tag} class="${cls}">` : `<${tag}>`;
    if (!VOID.has(tag)) stack.push(tag);
  }
  flush();
  while (stack.length) out += `</${stack.pop()}>`;
  return out;
}

// Markup in `html` that the sanitiser would strip, e.g. ['<a href>', '<img>'].
export function findDisallowedMarkup(html) {
  const issues = [];
  sanitizeHtml(html, { issues });
  return issues;
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// ---------- formatting ----------

// AGC alarm codes are octal; the DSKY shows them as five octal digits
// (V05N09 shows 1202 as "01202").
export function formatOctal(code, digits = 5) {
  if (!Number.isFinite(code)) return '?????';
  return Math.trunc(code).toString(8).padStart(digits, '0');
}

export function formatProgram(mode) {
  return Number.isFinite(mode) ? `P${String(Math.trunc(mode)).padStart(2, '0')}` : 'P--';
}

export function formatSpeed(speed) {
  return `${speed}×`;
}

// A speed in m/s as ft/s (magnitude): one decimal below 100, whole numbers
// with separators above.
export function formatFps(mps) {
  if (!Number.isFinite(mps)) return '?';
  const v = Math.abs(toFps(mps));
  return v < 99.95 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US');
}

// Landing outcome of an interactive flight, from a 'vehicle' bus event
// (App.watchVehicle): { kind: 'lowLevel'|'depleted'|'touchdown', verdict,
// vVert, vHoriz (m/s), tilt (deg) }, or the snapshot's vehicle.touchdown.
export function vehicleEventText(ev) {
  if (ev?.kind === 'lowLevel') {
    return `Low-level light: the descent propellant is down to ${(LM.lowLevelFraction * 100).toFixed(1)} %.`;
  }
  if (ev?.kind === 'depleted') return 'Descent propellant exhausted: the engine has stopped.';
  const speeds = `${formatFps(ev?.vVert)} ft/s down, ${formatFps(ev?.vHoriz)} ft/s across`;
  if (ev?.verdict === 'crash') return `Crash: the LM hit the surface at ${speeds}.`;
  if (ev?.verdict === 'hard') {
    const L = TOUCHDOWN_LIMITS;
    return `Hard landing: ${speeds}${Number.isFinite(ev.tilt) ? `, tilted ${Math.round(ev.tilt)}°` : ''} — `
      + `beyond the landing gear's limits (${Math.round(toFps(L.maxVertical))} ft/s down, `
      + `${Math.round(toFps(L.maxHorizontal))} ft/s across, ${L.maxTilt}°).`;
  }
  return `Touchdown: a safe landing at ${speeds}.`;
}

// ---------- DOM helpers (call only in a browser) ----------

// h('button', { class: 'btn', type: 'button', aria: { label: 'Play' },
//   data: { spot: 'x' }, on: { click }, text: 'Play' }, ...children)
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'html') el.innerHTML = sanitizeHtml(value);
    else if (key === 'svg') el.innerHTML = value; // trusted constant icons only
    else if (key === 'aria') for (const [k, v] of Object.entries(value)) el.setAttribute(`aria-${k}`, String(v));
    else if (key === 'data') for (const [k, v] of Object.entries(value)) el.dataset[k] = String(v);
    else if (key === 'on') for (const [k, fn] of Object.entries(value)) el.addEventListener(k, fn);
    else if (key === 'style') el.style.cssText = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// Diffing setters: touch the DOM only when the value really changes.
export function setText(el, value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (el.__text !== text) {
    el.__text = text;
    el.textContent = text;
  }
}

export function setHtml(el, html) {
  const safe = sanitizeHtml(html);
  if (el.__html !== safe) {
    el.__html = safe;
    el.innerHTML = safe;
  }
}

export function setAttr(el, name, value) {
  if (value === null || value === undefined || value === false) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
    return;
  }
  const text = value === true ? '' : String(value);
  if (el.getAttribute(name) !== text) el.setAttribute(name, text);
}

export function setHidden(el, hidden) {
  if (el.hidden !== !!hidden) el.hidden = !!hidden;
}

export function toggleClass(el, name, on) {
  if (el.classList.contains(name) !== !!on) el.classList.toggle(name, !!on);
}

export function setStyle(el, prop, value) {
  const key = `__style_${prop}`;
  if (el[key] !== value) {
    el[key] = value;
    el.style.setProperty(prop, value);
  }
}

// True when a keyboard shortcut must not fire because the user is typing
// or operating a control that uses the same keys.
export function isTypingTarget(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Small inline SVG icons (stroke/fill use currentColor). Trusted constants.
const ICON_PATHS = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  pause: '<path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor"/>',
  restart: '<path d="M5 12a7 7 0 1 0 2.05-4.95" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4.5 3.5v5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  prev: '<path d="M6 5v14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M19 5v14L8.5 12z" fill="currentColor"/>',
  next: '<path d="M18 5v14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M5 5v14l10.5-7z" fill="currentColor"/>',
  hold: '<rect x="4" y="5" width="16" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10h8M8 13.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  down: '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  code: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function icon(name) {
  const path = ICON_PATHS[name] || '';
  return `<svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">${path}</svg>`;
}
