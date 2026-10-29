// Trajectory view: the LM's powered descent as a side profile — altitude
// above the local surface against range to the targeted landing site — in
// two linked panes:
//   A. the full profile from PDI (~260 nmi uprange) to touchdown, drawn over
//      a gently curved (flattened) lunar surface;
//   B. an auto-zooming final-approach pane that follows the LM from P64 high
//      gate (~7,000 ft, ~26,000 ft from the aim point) down to touchdown.
// The flown path is coloured by program (P63 / P64 / P66), the LM glyph is
// rotated by its pitch with a DPS plume scaled by throttle, and the
// historical milestones are marked with labels that never overlap.
//
// Canvas 2D, devicePixelRatio aware; redraws only when the simulation time,
// the size or the zoom animation changes. Everything above `mountTrajectory`
// is DOM-free so that node:test can import the helpers.
//
// Data: vehicle truth from `snapshot.vehicle` (ARCHITECTURE §8, SI units).
// In replay mode the whole historical path is sampled once from the same
// replay provider the simulation uses (so seeking needs no re-recording);
// milestones come from `js/data/apollo11-descent.js` (`{ t, id, label }`).
// Historical numbers below: research/web-trajectory-b.md (MR = Apollo 11
// Mission Report MSC-00171) and research/web-timeline-b.md.

import { parseGET, formatGET } from '../util/time.js';
import { FT, NMI, MOON_RADIUS, toFt, toFps } from '../util/units.js';
import { createRng } from '../util/rng.js';

// ---------- historical constants ----------

export const PDI_GET = parseGET('102:33:05.01');        // MR Table 9.6-V
export const TOUCHDOWN_GET = parseGET('102:45:39.9');   // MR §5.4
export const ENGINE_OFF_GET = parseGET('102:45:41.4');  // MR Table 9.6-V

// DPS low-level sensor: 5.6 % in any tank (AER-DPS p.6, via
// research/web-trajectory-b.md §1.3). Used only for live (physics) runs.
export const LOW_LEVEL_FRAC = 0.056;

// Used only when the track module provides no milestones of its own.
// research/web-timeline-b.md §1b / web-trajectory-b.md §3 (MR Table 5-I).
export const FALLBACK_MILESTONES = Object.freeze([
  { t: '102:33:05.01', id: 'pdi', label: 'PDI — DPS ignition' },
  { t: '102:33:31', id: 'throttle-up', label: 'Throttle up (FTP)' },
  { t: '102:37:51', id: 'lr-data-good', label: 'Landing radar data good' },
  { t: '102:38:22', id: 'alarm-1202-1', label: 'Program alarm 1202' },
  { t: '102:39:02', id: 'alarm-1202-2', label: 'Program alarm 1202' },
  { t: '102:39:31', id: 'throttle-down', label: 'Throttle down' },
  { t: '102:41:32', id: 'p64', label: 'P64 — high gate' },
  { t: '102:42:18', id: 'alarm-1201', label: 'Program alarm 1201' },
  { t: '102:42:43', id: 'alarm-1202-3', label: 'Program alarm 1202' },
  { t: '102:42:58', id: 'alarm-1202-4', label: 'Program alarm 1202' },
  { t: '102:43:22', id: 'p66', label: 'P66 — rate of descent' },
  { t: '102:44:28', id: 'low-level', label: 'Low-level light' },
  { t: '102:45:39.9', id: 'touchdown', label: 'Touchdown' },
]);

// ---------- programs & phases ----------

export const PHASES = Object.freeze({
  p63: { label: 'P63 braking', token: '--phase-p63', fallback: '#4c8dff' },
  p64: { label: 'P64 approach', token: '--phase-p64', fallback: '#2fc7a8' },
  p66: { label: 'P66 rate of descent', token: '--phase-p66', fallback: '#ffb52e' },
  other: { label: 'Coast / other', token: '--text-faint', fallback: '#8a94a0' },
});

// Major mode → colour family. P65 (auto landing) and P67 (manual) are the
// other vertical-phase programs (LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:176
// "WCHPHASE = 2 ---> VERTICAL: P65,P66,P67"), so they share P66's colour;
// P68 (landing confirmation) keeps it too because the path has ended.
export function phaseForMode(mode) {
  if (mode === 63) return 'p63';
  if (mode === 64) return 'p64';
  if (mode === 65 || mode === 66 || mode === 67 || mode === 68) return 'p66';
  return 'other';
}

const PROGRAM_TITLES = {
  0: 'P00 · idle', 63: 'P63 · braking phase', 64: 'P64 · approach phase',
  65: 'P65 · auto landing', 66: 'P66 · rate of descent', 67: 'P67 · manual',
  68: 'P68 · landing confirmation', 12: 'P12 · powered ascent',
};

export function programTitle(mode, name) {
  if (PROGRAM_TITLES[mode]) return PROGRAM_TITLES[mode];
  if (Number.isFinite(mode)) {
    const p = `P${String(mode).padStart(2, '0')}`;
    return name ? `${p} · ${String(name).toLowerCase()}` : p;
  }
  return '—';
}

// ---------- scales & ticks ----------

export function niceStep(span, maxTicks = 6) {
  if (!(span > 0) || !(maxTicks >= 1)) return 1;
  const raw = span / maxTicks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

// "Nice" tick values (1-2-2.5-5 × 10^n) covering [min, max].
export function niceTicks(min, max, maxTicks = 6) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min > max) [min, max] = [max, min];
  if (min === max) return [min];
  const step = niceStep(max - min, maxTicks);
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  const out = [];
  for (let i = first; i <= last; i++) out.push(Number((i * step).toPrecision(12)) || 0);
  return out;
}

// Smallest nice value ≥ v (for axis maxima).
export function niceCeil(v) {
  if (!(v > 0)) return 0;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.4, 1.5, 1.6, 1.8, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10]) if (m * mag >= v - 1e-9) return m * mag;
  return 10 * mag;
}

export function linearScale(d0, d1, r0, r1) {
  const k = (r1 - r0) / ((d1 - d0) || 1);
  const f = (v) => r0 + (v - d0) * k;
  f.invert = (p) => d0 + (p - r0) / k;
  f.domain = [d0, d1];
  f.range = [r0, r1];
  return f;
}

// Pane A draws the surface as a curve that falls away uprange, as it does in
// the landing site's local-vertical frame (drop ≈ d²/2R). The real drop over
// 260 nmi is ~220,000 ft — far more than the altitudes plotted — so the
// curve is flattened; this returns the flattening factor shown in the pane.
export function curvatureFlattening(rangeMax, sagPx, pxPerFt) {
  if (!(rangeMax > 0) || !(sagPx > 0) || !(pxPerFt > 0)) return null;
  const trueDropFt = toFt((rangeMax * rangeMax) / (2 * MOON_RADIUS));
  return (trueDropFt * pxPerFt) / sagPx;
}

// ---------- number formatting ----------

const GROUP = /\B(?=(\d{3})+(?!\d))/g;

export function fmtInt(v) {
  if (!Number.isFinite(v)) return '—';
  const r = Math.round(v);
  const s = String(Math.abs(r)).replace(GROUP, ',');
  return r < 0 ? `−${s}` : s;
}

function fmtNum1(v) {
  return Number.isFinite(v) ? v.toFixed(1) : '—';
}

// Axis tick label with as many decimals as the tick step needs (0.2 nmi
// steps read 0.2, 0.4 … rather than rounding to 0, 0, 1 …; 2.5 → 7.5).
export function fmtTick(v, step) {
  if (!Number.isFinite(v)) return '—';
  let dp = 0;
  while (dp < 6 && step > 0 && Math.abs(step * 10 ** dp - Math.round(step * 10 ** dp)) > 1e-6) dp += 1;
  if (dp === 0) return fmtInt(v);
  const s = Math.abs(v).toFixed(dp);
  return v < 0 && Number(s) !== 0 ? `−${s}` : s;
}

// "Landed" / "Hard landing" / "Crashed", per LmPhysics' touchdown verdict.
export function landingWord(verdict, who = 'Landed') {
  if (verdict === 'crash') return 'Crashed';
  if (verdict === 'hard') return 'Hard landing';
  return who;
}

// Range for humans: nmi far out, feet close in (AGC displays use both).
export function formatRange(m) {
  if (!Number.isFinite(m)) return '—';
  const ft = toFt(m);
  if (Math.abs(ft) >= 20000) {
    const nmi = m / NMI;
    return `${Math.abs(nmi) >= 100 ? nmi.toFixed(0) : nmi.toFixed(1)} nmi`;
  }
  return `${fmtInt(ft)} ft`;
}

// AGC alarm codes are octal; show them as the DSKY does (5 digits, 01202).
export function formatAlarmCode(code) {
  if (typeof code === 'number' && Number.isFinite(code)) return code.toString(8).padStart(5, '0');
  const m = /(\d{4,5})/.exec(String(code ?? ''));
  return m ? m[1].padStart(5, '0') : '';
}

// ---------- milestones ----------

// kind: 'alarm' | 'program' | 'landing' | 'event'.
export function classifyMilestone(m) {
  const s = `${m.id ?? ''} ${m.label ?? ''}`.toLowerCase();
  if (/alarm|\b120[12]\b/.test(s)) return 'alarm';
  if (/touchdown|contact|landed|landing$/.test(s)) return 'landing';
  if (/\bp6[3-8]\b|high gate|low gate/.test(s)) return 'program';
  return 'event';
}

// Short marker label for a milestone (the full label goes in the tooltip).
export function shortLabel(m) {
  const s = `${m.id ?? ''} ${m.label ?? ''}`.toLowerCase();
  const kind = m.kind || classifyMilestone(m);
  if (kind === 'alarm') return formatAlarmCode(m.code ?? m.label ?? m.id) || 'Alarm';
  if (/\bpdi\b|ignition/.test(s)) return 'PDI';
  if (/throttle.?up|\bftp\b|fixed throttle|max(imum)? thrust/.test(s)) return 'Throttle up';
  if (/throttle.?down|throttle recovery/.test(s)) return 'Throttle down';
  if (/again|regain/.test(s) && /radar|\blr\b/.test(s)) return 'LR data good';
  if (/data lost|dropout/.test(s)) return 'LR data lost';
  if (/lock|radar data good|lr.?(data.?)?good|\blr\b.*acq/.test(s)) return 'LR lock-on';
  if (/v57|radar updates|enable radar/.test(s)) return 'V57';
  if (/yaw|face.?up|rolling over/.test(s)) return 'Yaw-around';
  if (/\bp64\b|high gate/.test(s)) return 'P64';
  if (/\bp65\b/.test(s)) return 'P65';
  if (/\bp66\b/.test(s)) return 'P66';
  if (/\bp67\b/.test(s)) return 'P67';
  if (/low.?level|quantity light/.test(s)) return 'Low level';
  if (/att(itude)?.?hold|manual/.test(s)) return 'ATT HOLD';
  if (/touchdown|contact/.test(s)) return 'Touchdown';
  const label = String(m.label ?? m.id ?? '');
  return label.length > 16 ? `${label.slice(0, 15)}…` : label;
}

// Accepts `{ t: seconds | 'hhh:mm:ss', id, label }` entries in any order;
// drops malformed ones. Returns new objects sorted by time.
export function normalizeMilestones(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list) {
    if (!m) continue;
    let t;
    try { t = parseGET(m.t); } catch { continue; }
    if (!Number.isFinite(t)) continue;
    const base = { ...m, t, id: String(m.id ?? m.label ?? t), label: String(m.label ?? m.id ?? ''), srcKind: m.kind };
    // Our own classification decides the marker shape (data modules may use
    // other vocabularies, e.g. 'radar' / 'crew'); an explicit 'alarm' or
    // 'program' from the data is kept.
    base.kind = m.kind === 'alarm' || m.kind === 'program' ? m.kind : classifyMilestone(base);
    base.short = m.short || shortLabel(base);
    out.push(base);
  }
  return out.sort((a, b) => a.t - b.t);
}

// When the data flag their major milestones (`major: true`), the profile
// shows only those plus every program alarm; otherwise all of them.
export function selectMajor(list) {
  const flagged = list.some((m) => typeof m.major === 'boolean');
  return flagged ? list.filter((m) => m.major || m.kind === 'alarm') : list;
}

// Program transitions (for colouring a replayed path) from milestones.
export function modeTransitions(milestones, initialMode = 63) {
  const out = [{ t: -Infinity, mode: initialMode }];
  for (const m of milestones) {
    const s = `${m.id} ${m.label}`.toLowerCase();
    const match = /\bp(6[4-8])\b/.exec(s);
    if (match) out.push({ t: m.t, mode: Number(match[1]) });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function modeAt(transitions, t) {
  let mode = transitions[0]?.mode ?? null;
  for (const tr of transitions) {
    if (tr.t <= t + 1e-9) mode = tr.mode;
    else break;
  }
  return mode;
}

// ---------- path helpers ----------

// Index of the last point with p.t <= t (binary search), or -1.
export function lastIndexAtOrBefore(points, t) {
  let lo = 0;
  let hi = points.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t + 1e-9) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// Path position at time t, linearly interpolated; null outside the path.
export function pointAtTime(points, t) {
  if (!points.length || t < points[0].t - 1e-9 || t > points[points.length - 1].t + 1e-9) return null;
  const i = lastIndexAtOrBefore(points, t);
  const a = points[Math.max(0, i)];
  const b = points[Math.min(points.length - 1, i + 1)];
  if (!b || b === a || b.t === a.t) return { ...a };
  const f = (t - a.t) / (b.t - a.t);
  return { t, r: a.r + (b.r - a.r) * f, h: a.h + (b.h - a.h) * f, m: a.m };
}

// Keeps a bounded, time-ordered sample list of the live state.
export class PathRecorder {
  constructor({ minDt = 0.2, maxPoints = 8000 } = {}) {
    this.minDt = minDt;
    this.maxPoints = maxPoints;
    this.points = [];
  }

  reset() {
    this.points = [];
  }

  // Returns true when a point was stored.
  add(p) {
    if (!Number.isFinite(p.t) || !Number.isFinite(p.r) || !Number.isFinite(p.h)) return false;
    const last = this.points[this.points.length - 1];
    if (last && p.t < last.t - 1e-6) this.points.length = lastIndexAtOrBefore(this.points, p.t) + 1;
    const prev = this.points[this.points.length - 1];
    // Always keep program changes; otherwise sample every minDt seconds.
    if (prev && p.t - prev.t < this.minDt && p.m === prev.m) return false;
    this.points.push(p);
    if (this.points.length > this.maxPoints) this.decimate();
    return true;
  }

  // Halve the density of the older half (keeps recent detail for pane B).
  decimate() {
    const half = this.points.length >> 1;
    const old = this.points.slice(0, half).filter((p, i, arr) => i % 2 === 0 || i === arr.length - 1
      || p.m !== arr[i - 1].m);
    this.points = old.concat(this.points.slice(half));
  }
}

// ---------- the final-approach window ----------

// Window of pane B in feet: { rNear, rFar, hMax } with range decreasing to
// the right (rFar at the left edge). Contains the LM and, when it is not too
// far away, the targeted site; otherwise follows the LM. When the LM is
// still far uprange the pane shows a fixed approach window instead.
export function computeZoomWindow({
  lmR, lmH, siteR = 0, aspect = 3.5,
  minW = 700, minH = 220, maxW = 40000, maxH = 9000,
} = {}) {
  const approach = { rNear: siteR - 0.08 * maxW, rFar: siteR + 0.92 * maxW, hMax: maxH, lmVisible: false, siteVisible: true };
  if (!Number.isFinite(lmR) || !Number.isFinite(lmH)) return approach;
  const h0 = Math.max(0, lmH);
  const dx = lmR - siteR;
  if (dx > 0.85 * maxW || h0 > maxH * 0.95) return { ...approach, lmVisible: false };
  const includeSite = Math.abs(dx) <= Math.max(h0 * 8, 4000);
  let w;
  if (includeSite) w = Math.max(Math.abs(dx) * 1.35, h0 * aspect, minW);
  else w = Math.max(h0 * aspect * 1.4, minW);
  w = Math.min(w, maxW);
  const hMax = Math.min(Math.max(h0 * 1.5, (w / aspect) * 0.9, minH), maxH);
  let rNear;
  if (includeSite) {
    rNear = Math.min(siteR, lmR) - 0.12 * w;
    if (lmR > rNear + 0.9 * w) rNear = lmR - 0.9 * w;
  } else {
    rNear = lmR - 0.35 * w;
  }
  return { rNear, rFar: rNear + w, hMax, lmVisible: true, siteVisible: siteR >= rNear && siteR <= rNear + w };
}

// ---------- label layout ----------

function overlaps(a, b, pad = 0) {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

function insideBounds(r, b) {
  return r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h;
}

// Greedy, deterministic label placement. items: [{ key, x, y, w, h,
// priority }] where (x, y) is the marker; labels go above/below the marker,
// stacking upwards in rows (with a leader line) until one fits without
// overlapping another label, a marker (other than its own) or an obstacle.
// Returns placed labels only: [{ key, x, y, w, h, ax, ay, leader }].
export function layoutLabels(items, bounds, { rowH = 15, gap = 7, maxRows = 8, pad = 2, obstacles = [], markerR = 3 } = {}) {
  const placed = [];
  const out = [];
  const markers = items.map((it) => ({ key: it.key, x: it.x - markerR, y: it.y - markerR, w: markerR * 2, h: markerR * 2 }));
  const order = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.x - b.x || a.y - b.y);
  for (const it of order) {
    const cands = [];
    for (let r = 0; r < maxRows; r++) {
      const above = it.y - gap - it.h - r * rowH;
      cands.push({ x: it.x + 3, y: above, r }, { x: it.x - 3 - it.w, y: above, r });
      if (r < 2) {
        const below = it.y + gap + r * rowH;
        cands.push({ x: it.x + 3, y: below, r }, { x: it.x - 3 - it.w, y: below, r });
      }
    }
    for (const c of cands) {
      const rect = { x: c.x, y: c.y, w: it.w, h: it.h };
      if (!insideBounds(rect, bounds)) continue;
      if (placed.some((p) => overlaps(p, rect, pad))) continue;
      if (obstacles.some((o) => overlaps(o, rect, pad))) continue;
      if (markers.some((m) => m.key !== it.key && overlaps(m, rect, 1))) continue;
      placed.push(rect);
      out.push({ key: it.key, ...rect, ax: it.x, ay: it.y, leader: c.r > 0 });
      break;
    }
  }
  return out;
}

// ---------- the model behind the view (pure) ----------

// Collects the path, live milestones and the landing point from snapshots.
export class TrajectoryModel {
  constructor() {
    this.recorder = new PathRecorder();
    this.reset();
  }

  reset() {
    this.recorder.reset();
    this.live = new Map();      // id → milestone (physics runs)
    this.landed = null;         // { t, r, h }
    this.prev = null;
    this.lrSeen = false;
    this.domain = { r: 0, h: 0 };
  }

  get points() {
    return this.recorder.points;
  }

  addLive(m) {
    if (this.live.has(m.id)) return;
    const n = normalizeMilestones([m])[0];
    if (n) this.live.set(n.id, n);
  }

  // Feed one snapshot; `t` is snapshot.t (GET s).
  observe(snap) {
    const v = snap?.vehicle;
    if (!v || !Number.isFinite(v.alt) || !Number.isFinite(v.range)) return;
    const t = snap.t;
    const mode = snap.agc?.mode ?? null;
    if (this.prev && t < this.prev.t - 1e-6) this.reset();
    const prev = this.prev;
    this.recorder.add({ t, r: v.range, h: Math.max(0, v.alt), m: mode });
    this.growDomain(v.range, v.alt);

    // Edge-detected milestones, so a physics run gets its own markers. The
    // first observation has no "before", so it cannot be an edge (a preset
    // that starts mid-burn must not get a "PDI" marker at its start).
    if (!prev) {
      this.prev = this.flags(t, mode, v);
      this.lrSeen = !!v.lr?.altValid;
      return;
    }
    const p = prev;
    if (v.engineOn && !p.engineOn && !this.live.has('ignition')) {
      this.addLive({ t, id: 'ignition', label: mode === 63 ? 'PDI — DPS ignition' : 'Ignition' });
    }
    if (this.live.has('ignition') && !this.live.has('throttle-up') && v.throttle > 0.85 && !(p.throttle > 0.85)) {
      this.addLive({ t, id: 'throttle-up', label: 'Throttle up (FTP)' });
    }
    if (this.live.has('throttle-up') && !this.live.has('throttle-down') && v.throttle < 0.75 && p.throttle >= 0.75) {
      this.addLive({ t, id: 'throttle-down', label: 'Throttle down' });
    }
    // Lock-on = the first time the radar has data (later drop-outs and
    // recoveries are not lock-ons).
    if (v.lr?.altValid && !p.lrAlt && !this.lrSeen) {
      this.addLive({ t, id: 'lr-data-good', label: 'Landing radar data good' });
    }
    if (v.lr?.altValid) this.lrSeen = true;
    if (mode !== p.mode && [64, 65, 66, 67].includes(mode) && Number.isFinite(p.mode)) {
      this.addLive({ t, id: `p${mode}`, label: `P${mode}` });
    }
    // LmPhysics reports the sensor itself (`lowLevel`); otherwise use 5.6 %.
    const lowNow = v.lowLevel === true || (Number.isFinite(v.fuelFrac) && v.fuelFrac <= LOW_LEVEL_FRAC);
    if (lowNow && !p.low) {
      this.addLive({ t, id: 'low-level', label: 'Low-level light' });
    }
    if ((v.landed || v.contact) && !(p.landed || p.contact) && !this.landed) {
      this.landed = { t, r: v.range, h: 0 };
      this.addLive({ t, id: 'touchdown', label: v.contact && !v.landed ? 'Contact light' : 'Touchdown' });
    }
    this.prev = this.flags(t, mode, v);
  }

  flags(t, mode, v) {
    return {
      t, mode, engineOn: !!v.engineOn, throttle: v.throttle, lrAlt: !!v.lr?.altValid,
      fuel: v.fuelFrac, landed: !!v.landed, contact: !!v.contact,
      low: v.lowLevel === true || (Number.isFinite(v.fuelFrac) && v.fuelFrac <= LOW_LEVEL_FRAC),
    };
  }

  growDomain(r, h) {
    if (Number.isFinite(r)) this.domain.r = Math.max(this.domain.r, r);
    if (Number.isFinite(h)) this.domain.h = Math.max(this.domain.h, h);
  }

  // Alarm markers from the AGC's own alarm history (survives seeks because
  // the history is part of the re-simulated state).
  static alarmMilestones(snap) {
    const hist = snap?.agc?.alarms?.history;
    if (!Array.isArray(hist)) return [];
    return hist.filter((a) => Number.isFinite(a?.t)).map((a) => ({
      t: a.t,
      id: `alarm-${formatAlarmCode(a.code)}-${a.t.toFixed(1)}`,
      label: `Program alarm ${formatAlarmCode(a.code)}${a.text ? ` — ${a.text}` : ''}`,
      code: a.code,
      kind: 'alarm',
    }));
  }
}

// Merge historical milestones with the AGC's own alarms: each AGC alarm is
// matched one-to-one with the nearest unmatched historical alarm of the same
// code within `tol` seconds (the model reproduces them only approximately);
// unmatched ones are added (e.g. a physics run's own alarms).
export function mergeAlarms(milestones, alarms, tol = 10) {
  const out = [...milestones];
  const taken = new Set();
  for (const a of normalizeMilestones(alarms)) {
    let best = null;
    for (const m of out) {
      if (m.kind !== 'alarm' || taken.has(m) || m.short !== a.short) continue;
      const d = Math.abs(m.t - a.t);
      if (d <= tol && (!best || d < Math.abs(best.t - a.t))) best = m;
    }
    if (best) taken.add(best);
    else out.push(a);
  }
  return out.sort((x, y) => x.t - y.t);
}

// Joins short labels for a cluster of nearby milestones, folding repeats
// ("01202 · 01202" → "01202 ×2").
export function clusterLabel(shorts, maxLen = 48) {
  const parts = [];
  for (const s of shorts) {
    const last = parts[parts.length - 1];
    if (last && last.s === s) last.n += 1;
    else parts.push({ s, n: 1 });
  }
  let text = parts.map((p) => (p.n > 1 ? `${p.s} ×${p.n}` : p.s)).join(' · ');
  if (text.length > maxLen) text = `${text.slice(0, maxLen - 1).replace(/[\s·]+$/, '')}…`;
  return text;
}

// One-line text alternative for the canvas (aria-label).
export function summarizeTrajectory(snap, passed = []) {
  if (!snap?.vehicle) return 'Trajectory: no simulation running.';
  const v = snap.vehicle;
  if (snap.software === 'Comanche055') return 'Trajectory: the Command Module chapter has no landing trajectory.';
  const parts = [];
  parts.push(`${programTitle(snap.agc?.mode, snap.agc?.programName)}.`);
  if (v.landed) parts.push(`${landingWord(v.touchdown?.verdict)}.`);
  else {
    parts.push(`Altitude ${fmtInt(toFt(v.alt))} feet,`);
    const dist = formatRange(Math.abs(v.range)).replace('nmi', 'nautical miles').replace('ft', 'feet');
    parts.push(v.range < 0 ? `${dist} beyond the targeted site,` : `${dist} to the targeted site,`);
    const rate = toFps(v.altRate);
    if (Number.isFinite(rate)) parts.push(rate < 0 ? `descending ${fmtInt(-rate)} feet per second.` : `climbing ${fmtInt(rate)} feet per second.`);
  }
  if (passed.length) parts.push(`Recent milestones: ${passed.slice(-3).map((m) => m.label).join('; ')}.`);
  return parts.join(' ');
}

// ---------- replay sampling ----------

// Samples a replay provider (same factory and track the simulation uses)
// from t0 to t1 at dt. `createVehicle` is js/vehicle/index.js's factory.
export function sampleReplayPath(createVehicle, track, t0, t1, { dt = 0.25, transitions = null } = {}) {
  const vehicle = createVehicle('replay', { track, rng: createRng(1969).fork('vehicle'), startGET: t0 });
  const commands = { throttle: 0, thrustDir: [1, 0, 0], engineOn: false, ullage: false, rod: 0, lpd: null };
  const pts = [];
  const push = (t) => {
    const s = vehicle.state;
    if (!s || !Number.isFinite(s.alt) || !Number.isFinite(s.range)) return;
    pts.push({ t, r: s.range, h: Math.max(0, s.alt), m: transitions ? modeAt(transitions, t) : null });
  };
  push(t0);
  const n = Math.ceil((t1 - t0) / dt);
  for (let i = 1; i <= n; i++) {
    const t = t0 + i * dt;
    vehicle.step(dt, commands, t);
    push(t);
  }
  return pts;
}

// ---------- drawing (DOM-free: takes a CanvasRenderingContext2D) ----------

function lmGlyph(g, x, y, size, pitchDeg, throttle, engineOn, theme) {
  g.save();
  g.translate(x, y);
  // Pitch: angle of the thrust (X) axis from the local vertical. A positive
  // pitch tilts the top uprange (left), thrusting against the forward
  // velocity, as in the braking phase.
  g.rotate((-(Number.isFinite(pitchDeg) ? pitchDeg : 0) * Math.PI) / 180);
  g.scale(size, size);
  g.lineJoin = 'round';
  // Plume: proportional to throttle, only while the engine burns.
  if (engineOn && throttle > 0.005) {
    const len = 0.25 + 1.6 * Math.min(1, throttle);
    const grad = g.createLinearGradient(0, 0.3, 0, 0.3 + len);
    grad.addColorStop(0, 'rgba(255,236,190,0.95)');
    grad.addColorStop(0.35, 'rgba(255,181,46,0.7)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-0.13, 0.3);
    g.quadraticCurveTo(-0.1 - len * 0.12, 0.3 + len * 0.55, 0, 0.3 + len);
    g.quadraticCurveTo(0.1 + len * 0.12, 0.3 + len * 0.55, 0.13, 0.3);
    g.closePath();
    g.fill();
  }
  g.lineWidth = 0.06;
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  // Legs and footpads.
  g.beginPath();
  g.moveTo(-0.34, 0.08); g.lineTo(-0.56, 0.44); g.moveTo(-0.66, 0.45); g.lineTo(-0.46, 0.45);
  g.moveTo(0.34, 0.08); g.lineTo(0.56, 0.44); g.moveTo(0.46, 0.45); g.lineTo(0.66, 0.45);
  g.strokeStyle = theme.legs;
  g.stroke();
  // Engine bell.
  g.fillStyle = '#5b6168';
  g.beginPath();
  g.moveTo(-0.09, 0.14); g.lineTo(0.09, 0.14); g.lineTo(0.14, 0.31); g.lineTo(-0.14, 0.31);
  g.closePath();
  g.fill();
  // Descent stage (gold foil).
  g.fillStyle = theme.descent;
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.beginPath();
  g.rect(-0.4, -0.12, 0.8, 0.27);
  g.fill();
  g.stroke();
  // Ascent stage.
  g.fillStyle = theme.ascent;
  g.beginPath();
  g.moveTo(-0.3, -0.12);
  g.lineTo(-0.3, -0.36);
  g.lineTo(-0.16, -0.52);
  g.lineTo(0.12, -0.54);
  g.lineTo(0.3, -0.38);
  g.lineTo(0.32, -0.12);
  g.closePath();
  g.fill();
  g.stroke();
  // Window.
  g.fillStyle = '#1a2230';
  g.beginPath();
  g.moveTo(-0.24, -0.34); g.lineTo(-0.14, -0.46); g.lineTo(-0.08, -0.34);
  g.closePath();
  g.fill();
  g.restore();
}

function siteFlag(g, x, y, color, label, font) {
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - 16);
  g.stroke();
  g.beginPath();
  g.moveTo(x, y - 16);
  g.lineTo(x + 9, y - 12.5);
  g.lineTo(x, y - 9);
  g.closePath();
  g.fill();
  if (label) {
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillText(label, x + 3, y - 19);
  }
  g.restore();
}

function landedMark(g, x, y, color) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5);
  g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5);
  g.stroke();
  g.restore();
}

function drawMarker(g, x, y, kind, color, theme) {
  g.save();
  g.lineWidth = 1.5;
  g.strokeStyle = theme.panel;
  if (kind === 'alarm') {
    g.fillStyle = theme.red;
    g.beginPath();
    g.moveTo(x, y - 5.5);
    g.lineTo(x + 5, y + 3.5);
    g.lineTo(x - 5, y + 3.5);
    g.closePath();
    g.fill();
    g.stroke();
  } else if (kind === 'landing') {
    g.fillStyle = theme.white;
    g.beginPath();
    g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y);
    g.closePath();
    g.fill();
    g.stroke();
  } else {
    g.fillStyle = color || theme.text;
    g.beginPath();
    g.arc(x, y, kind === 'program' ? 4.5 : 3.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Screen-space decimation: projects points with fx/fy, drops those that
// move less than `minPx` from the last kept one (unless the program
// changes), and culls runs outside `clip` (keeping the crossing points; a
// `null` marks a gap). `rCull` ({ lo, hi } in metres of range) skips points
// cheaply before projecting them. Returns [[x, y, m] | null, ...].
export function screenDecimate(pts, fx, fy, clip = null, minPx = 0.75, rCull = null) {
  const out = [];
  let lastX = 0;
  let lastY = 0;
  let lastM;
  let hasLast = false;
  let pendingP = null;
  let wasIn = false;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    let x;
    let y;
    let inside;
    if (rCull && (p.r < rCull.lo || p.r > rCull.hi)) inside = false;
    else {
      x = fx(p);
      y = fy(p);
      inside = !clip || (x >= clip.x0 && x <= clip.x1 && y >= clip.y0 && y <= clip.y1);
    }
    if (!inside) {
      if (wasIn) {
        out.push([x ?? fx(p), y ?? fy(p), p.m]);
        wasIn = false;
        hasLast = false;
      } else pendingP = p;
      continue;
    }
    if (!wasIn) {
      if (out.length && out[out.length - 1] !== null) out.push(null);
      if (pendingP) out.push([fx(pendingP), fy(pendingP), pendingP.m]);
      pendingP = null;
      wasIn = true;
      hasLast = false;
    }
    if (hasLast && i !== pts.length - 1 && lastM === p.m && Math.abs(x - lastX) < minPx && Math.abs(y - lastY) < minPx) continue;
    out.push([x, y, p.m]);
    lastX = x;
    lastY = y;
    lastM = p.m;
    hasLast = true;
  }
  return out;
}

// Incrementally projected path for a fixed projection (pane A): only new
// source points are processed each frame. `idx[i]` is the source index of
// out[i], so a replay can draw the prefix flown so far.
export class ProjectedPath {
  constructor(minPx = 0.75) {
    this.minPx = minPx;
    this.reset(null, null);
  }

  reset(key, src) {
    this.key = key;
    this.src = src;
    this.n = 0;
    this.out = [];
    this.idx = [];
  }

  update(key, src, fx, fy) {
    if (key !== this.key || src !== this.src || src.length < this.n) this.reset(key, src);
    for (let i = this.n; i < src.length; i++) {
      const p = src[i];
      const x = fx(p);
      const y = fy(p);
      const last = this.out[this.out.length - 1];
      if (last && last[2] === p.m && Math.abs(x - last[0]) < this.minPx && Math.abs(y - last[1]) < this.minPx) continue;
      this.out.push([x, y, p.m]);
      this.idx.push(i);
    }
    this.n = src.length;
    return this;
  }

  // Kept points whose source index is ≤ n.
  prefix(n) {
    let lo = 0;
    let hi = this.idx.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.idx[mid] <= n) lo = mid + 1; else hi = mid;
    }
    return this.out.slice(0, lo);
  }
}

// Draw decimated screen points ([x, y, m] | null) coloured by program.
function drawScreenPath(g, sp, colorFor, width) {
  if (sp.length < 2) return;
  g.save();
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  let i = 0;
  while (i < sp.length - 1) {
    if (!sp[i] || !sp[i + 1]) { i++; continue; }
    const ph = phaseForMode(sp[i][2]);
    g.strokeStyle = colorFor(ph);
    g.beginPath();
    g.moveTo(sp[i][0], sp[i][1]);
    let j = i + 1;
    for (; j < sp.length; j++) {
      if (!sp[j]) break;
      g.lineTo(sp[j][0], sp[j][1]);
      if (phaseForMode(sp[j][2]) !== ph) break;
    }
    g.stroke();
    i = Math.max(j, i + 1);
  }
  g.restore();
}

function drawScreenDashed(g, sp, color, width) {
  if (sp.length < 2) return;
  g.save();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.setLineDash([4, 4]);
  g.beginPath();
  let pen = false;
  for (const q of sp) {
    if (!q) { pen = false; continue; }
    if (pen) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
    pen = true;
  }
  g.stroke();
  g.restore();
}

// ---------- mount ----------

export function mountTrajectory(root, ctx) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const { bus, app } = ctx;

  root.innerHTML = `
    <div class="traj" data-spot="trajectory">
      <div class="viz-head">
        <ul class="viz-legend" data-role="legend" aria-label="Path colour by program">
          <li><span class="swatch swatch-p63" aria-hidden="true"></span>P63 braking</li>
          <li><span class="swatch swatch-p64" aria-hidden="true"></span>P64 approach</li>
          <li><span class="swatch swatch-p66" aria-hidden="true"></span>P66 rate of descent</li>
          <li data-role="hist-legend" hidden><span class="swatch swatch-hist" aria-hidden="true"></span><span data-role="hist-text">Apollo 11 as flown</span></li>
        </ul>
        <span class="viz-chip" data-role="phase">—</span>
      </div>
      <div class="traj-stage">
        <canvas class="traj-canvas" role="img" aria-label="Trajectory: no simulation running."></canvas>
        <span class="traj-spot" data-spot="trajectory.lm" aria-hidden="true"></span>
        <span class="traj-spot" data-spot="trajectory.site" aria-hidden="true"></span>
        <div class="traj-tip" role="tooltip" hidden></div>
        <p class="traj-empty" hidden></p>
      </div>
      <p class="viz-note" data-role="note">Altitude above the local surface against range to the computer's targeted landing site — the simulated vehicle (truth), not the AGC's estimate. Markers: <span class="note-dot" aria-hidden="true"></span> events, <span class="note-tri" aria-hidden="true"></span> program alarms. The LM glyph is not to scale.</p>
    </div>`;

  const el = {
    wrap: root.querySelector('.traj'),
    stage: root.querySelector('.traj-stage'),
    canvas: root.querySelector('.traj-canvas'),
    spotLm: root.querySelector('[data-spot="trajectory.lm"]'),
    spotSite: root.querySelector('[data-spot="trajectory.site"]'),
    tip: root.querySelector('.traj-tip'),
    empty: root.querySelector('.traj-empty'),
    phase: root.querySelector('[data-role="phase"]'),
    histLegend: root.querySelector('[data-role="hist-legend"]'),
    histText: root.querySelector('[data-role="hist-text"]'),
    note: root.querySelector('[data-role="note"]'),
    legend: root.querySelector('[data-role="legend"]'),
  };
  const g = el.canvas.getContext('2d');
  const model = new TrajectoryModel();
  const reduceMotion = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  let theme = readTheme(el.wrap);
  let size = { w: 0, h: 0, dpr: 1 };
  let dirty = true;
  let lastDrawT = null;
  let lastSnap = null;
  let lastUi = null;
  let zoom = null;               // smoothed pane-B window
  let lastFrameMs = null;
  let hits = [];                 // marker hit areas for the tooltip
  let hover = null;              // { x, y }
  let ariaText = '';
  let ariaAt = -Infinity;
  let pendingAria = null;
  const textCache = new Map();
  const cache = { phase: '', empty: null, histLegend: null, histText: '', spotLm: '', spotSite: '', chrome: null };

  // Lazy data: the track registry and the vehicle factory (written by
  // another engineer; loaded dynamically so this module imports in Node).
  const data = { tracks: null, descent: null, createVehicle: null };
  Promise.allSettled([
    import('../data/tracks.js'),
    import('../data/apollo11-descent.js'),
    import('../vehicle/index.js'),
  ]).then(([tracks, descent, vehicle]) => {
    if (tracks.status === 'fulfilled') data.tracks = tracks.value.TRACKS || null;
    if (descent.status === 'fulfilled') data.descent = descent.value;
    if (vehicle.status === 'fulfilled') data.createVehicle = vehicle.value.createVehicle || null;
    replay = null;
    dirty = true;
  });

  // Replay path cache: { key, pts, milestones, transitions } or null.
  let replay = null;
  // Offscreen static layer of pane A, and its incrementally projected path.
  const bgA = { canvas: doc.createElement('canvas'), key: null };
  const projA = new ProjectedPath(0.75);

  const offs = [
    bus.on('sim:reset', () => { model.reset(); zoom = null; dirty = true; }),
    bus.on('app:mode', () => { model.reset(); replay = null; zoom = null; dirty = true; }),
  ];

  const ro = new win.ResizeObserver(() => resize());
  ro.observe(el.stage);
  resize();

  el.canvas.addEventListener('pointermove', onPointer);
  el.canvas.addEventListener('pointerleave', () => { hover = null; hideTip(); });

  function readTheme(node) {
    const cs = win.getComputedStyle(node);
    const v = (name, fb) => (cs.getPropertyValue(name) || '').trim() || fb;
    return {
      panel: v('--panel', '#161a1f'),
      panel2: v('--panel-2', '#1c2127'),
      border: v('--border', '#2b323b'),
      borderStrong: v('--border-strong', '#3a434e'),
      text: v('--text', '#dde2e8'),
      dim: v('--text-dim', '#9aa4b0'),
      faint: v('--text-faint', '#8a94a0'),
      amber: v('--amber', '#ffb52e'),
      red: v('--red', '#ff6257'),
      blue: v('--blue', '#6cb6ff'),
      white: v('--white-lamp', '#f4f1e6'),
      p63: v('--phase-p63', PHASES.p63.fallback),
      p64: v('--phase-p64', PHASES.p64.fallback),
      p66: v('--phase-p66', PHASES.p66.fallback),
      other: v('--text-faint', PHASES.other.fallback),
      fontUi: v('--font-ui', 'system-ui, sans-serif'),
      fontMono: v('--font-mono', 'ui-monospace, monospace'),
      descent: '#c7a14a',
      ascent: '#cfd3d8',
      legs: '#a8adb3',
      ground: '#2a2e33',
      groundDeep: '#1b1e22',
      groundLine: '#646c76',
      hist: 'rgba(221,226,232,0.32)',
    };
  }

  function resize() {
    const rect = el.stage.getBoundingClientRect();
    const dpr = Math.min(3, win.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    size = { w, h, dpr };
    el.canvas.width = Math.round(w * dpr);
    el.canvas.height = Math.round(h * dpr);
    el.canvas.style.width = `${w}px`;
    el.canvas.style.height = `${h}px`;
    dirty = true;
  }

  function colorFor(ph) {
    return theme[ph] || theme.other;
  }

  function textW(text, font) {
    const key = `${font}|${text}`;
    let w = textCache.get(key);
    if (w === undefined) {
      g.font = font;
      w = g.measureText(text).width;
      if (textCache.size > 500) textCache.clear();
      textCache.set(key, w);
    }
    return w;
  }

  function currentVehicleKind() {
    if (lastUi?.vehicleKind) return lastUi.vehicleKind;
    try {
      return app?.currentSim?.()?.options?.vehicle ?? null;
    } catch {
      return null;
    }
  }

  function trackFor(ui) {
    const id = ui?.mode === 'interactive' ? ui?.preset?.track : ui?.scenario?.track;
    if (!data.tracks) return null;
    return (id && data.tracks[id]) || data.tracks.apollo11Descent || null;
  }

  function historicalMilestones(track) {
    const list = track?.milestones || data.descent?.milestones || data.descent?.MILESTONES || null;
    return selectMajor(normalizeMilestones(list && list.length ? list : FALLBACK_MILESTONES));
  }

  // Build (once per track/scenario) the sampled historical path.
  function ensureReplay(ui, snap) {
    const kind = currentVehicleKind();
    if (kind !== 'replay' && kind !== 'physics') return null;
    const track = trackFor(ui);
    if (!track || !data.createVehicle || snap?.software === 'Comanche055') return null;
    const sim = app?.currentSim?.();
    const start = (() => {
      try { return parseGET(sim?.options?.startGET ?? snap.t); } catch { return snap.t; }
    })();
    const key = `${kind}|${ui?.mode}|${ui?.scenario?.id ?? ''}|${ui?.preset?.id ?? ''}|${start}`;
    if (replay?.key === key) return replay;
    const milestones = historicalMilestones(track);
    const transitions = modeTransitions(milestones, 63);
    // Replay: from the scenario start, or from PDI when the scenario starts
    // later (the whole descent is shown). Sandbox: the reference starts where
    // the preset starts. Never more than 2 min before PDI (a long coast would
    // only squash the axes).
    const t0 = Math.max(kind === 'replay' ? Math.min(start, PDI_GET) : start, PDI_GET - 120);
    const t1 = Math.max(TOUCHDOWN_GET + 8, (milestones[milestones.length - 1]?.t ?? 0) + 5);
    let pts = [];
    try {
      pts = sampleReplayPath(data.createVehicle, track, t0, t1, { dt: 0.25, transitions });
      // Coasting before PDI is still program 63 (selected at ~102:10).
    } catch (err) {
      console.warn('Trajectory: could not sample the replay track:', err);
      pts = [];
    }
    // The axes cover the whole historical flight so they never jump.
    const domain = { r: 0, h: 0 };
    for (const p of pts) {
      domain.r = Math.max(domain.r, p.r);
      domain.h = Math.max(domain.h, p.h);
    }
    replay = { key, pts, milestones, transitions, kind, domain, sites: track.sites || null };
    return replay;
  }

  // ---------- render ----------

  function render(snapshot, ui) {
    lastSnap = snapshot;
    lastUi = ui;
    if (snapshot?.vehicle && snapshot.software !== 'Comanche055') model.observe(snapshot);
    const now = win.performance.now();
    flushAria(now);
    // Hidden tab (zero-size stage): nothing to draw; redraw when shown.
    if (size.w < 8 || size.h < 8) { dirty = true; return; }
    const animating = zoom && zoom.target && !zoomSettled();
    const t = snapshot?.t ?? null;
    if (!dirty && t === lastDrawT && !animating) return;
    draw(snapshot, ui, now);
    lastDrawT = t;
    dirty = false;
  }

  function zoomSettled() {
    const a = zoom;
    const b = zoom.target;
    return Math.abs(a.rNear - b.rNear) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.hMax - b.hMax) < 0.5;
  }

  function setEmpty(text) {
    const val = text || null;
    if (cache.empty === val) return;
    cache.empty = val;
    el.empty.hidden = !val;
    el.empty.textContent = val || '';
  }

  // The P63/P64/P66 legend and the LM caption belong to a descent: hidden
  // for the Command Module, a DSKY-only vehicle and no simulation.
  function setChrome(on) {
    if (cache.chrome === on) return;
    cache.chrome = on;
    el.legend.hidden = !on;
    el.note.hidden = !on;
  }

  function setText(node, key, text) {
    if (cache[key] === text) return;
    cache[key] = text;
    node.textContent = text;
  }

  function placeSpot(node, key, x, y) {
    const v = Number.isFinite(x) && Number.isFinite(y) ? `translate(${Math.round(x - 14)}px, ${Math.round(y - 14)}px)` : 'translate(-9999px, -9999px)';
    if (cache[key] === v) return;
    cache[key] = v;
    node.style.transform = v;
  }

  // The text alternative changes at most once per second (screen readers
  // re-announce a changed label); the latest text is kept pending.
  function updateAria(text, now) {
    pendingAria = text;
    flushAria(now);
  }

  function flushAria(now) {
    if (pendingAria === null || pendingAria === ariaText || now - ariaAt < 1000) return;
    ariaText = pendingAria;
    ariaAt = now;
    el.canvas.setAttribute('aria-label', ariaText);
  }

  function draw(snap, ui, now = win.performance.now()) {
    const { w: W, h: H, dpr } = size;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    hits = [];

    if (!snap) {
      setChrome(false);
      setEmpty('No simulation running.');
      setText(el.phase, 'phase', '—');
      placeSpot(el.spotLm, 'spotLm', NaN, NaN);
      placeSpot(el.spotSite, 'spotSite', NaN, NaN);
      updateAria('Trajectory: no simulation running.', now);
      return;
    }
    if (snap.software === 'Comanche055') {
      setChrome(false);
      setEmpty('The trajectory view shows the Lunar Module’s powered descent. In the Command Module chapter, follow the SPS burn on the Ignition tab and the instruments on the left.');
      setText(el.phase, 'phase', programTitle(snap.agc?.mode, snap.agc?.programName));
      placeSpot(el.spotLm, 'spotLm', NaN, NaN);
      placeSpot(el.spotSite, 'spotSite', NaN, NaN);
      updateAria(summarizeTrajectory(snap), now);
      return;
    }
    const v = snap.vehicle;
    const kind = currentVehicleKind();
    if (!v || kind === 'static' || !Number.isFinite(v.alt) || !Number.isFinite(v.range)) {
      setChrome(false);
      setEmpty(ui?.mode === 'demo'
        ? 'No flight state: this scenario drives the DSKY only, so there is no trajectory to show.'
        : 'No flight state: this starting point parks the vehicle (DSKY only). Choose a descent preset to fly.');
      setText(el.phase, 'phase', programTitle(snap.agc?.mode, snap.agc?.programName));
      placeSpot(el.spotLm, 'spotLm', NaN, NaN);
      placeSpot(el.spotSite, 'spotSite', NaN, NaN);
      updateAria('Trajectory: no flight state.', now);
      return;
    }
    setChrome(true);
    setEmpty(null);
    setText(el.phase, 'phase', programTitle(snap.agc?.mode, snap.agc?.programName));

    const rp = ensureReplay(ui, snap);
    const isReplay = kind === 'replay' && rp && rp.pts.length > 1;

    // Path (flown) and the historical reference (dashed).
    let flown;
    let hist = null;
    let milestones;
    let flownCount = null;     // replay: the flown path is a prefix of hist
    const livePt = { t: snap.t, r: v.range, h: Math.max(0, v.alt), m: snap.agc?.mode ?? null };
    if (isReplay) {
      flownCount = lastIndexAtOrBefore(rp.pts, snap.t) + 1;
      livePt.m = livePt.m ?? modeAt(rp.transitions, snap.t);
      flown = rp.pts;
      hist = rp.pts;
      milestones = mergeAlarms(rp.milestones, TrajectoryModel.alarmMilestones(snap));
    } else {
      flown = model.points;
      if (rp && rp.pts.length > 1 && kind === 'physics') hist = rp.pts;
      milestones = mergeAlarms([...model.live.values()], TrajectoryModel.alarmMilestones(snap));
    }
    const histLabel = isReplay ? 'Apollo 11 path ahead' : 'Apollo 11 as flown';
    const showHist = !!hist;
    if (cache.histLegend !== showHist) {
      cache.histLegend = showHist;
      el.histLegend.hidden = !showHist;
    }
    setText(el.histText, 'histText', histLabel);

    // Milestones up to now, positioned on the flown path.
    const passed = [];
    for (const m of milestones) {
      if (m.t > snap.t + 1e-6) continue;
      const p = pointAtTime(flown, m.t) ?? (Math.abs(m.t - snap.t) < 0.5 ? livePt : null);
      if (!p) continue;
      passed.push({ ...m, r: p.r, h: p.h });
    }

    // Landing point (replay: the historical touchdown; live: first contact).
    let landed = model.landed;
    if (isReplay) {
      // Where the vehicle came to rest once landed (the footpads settle a
      // little after the contact light); before that the touchdown marker.
      const td = passed.find((m) => m.kind === 'landing');
      landed = v.landed ? { t: td?.t ?? snap.t, r: v.range, h: 0 } : td ? { t: td.t, r: td.r, h: 0 } : null;
    }

    model.growDomain(v.range, v.alt);
    // Replay: the sampled flight (+ the live point) sets the axes; live
    // points from before the sampled start would only squash them.
    const domR = isReplay ? Math.max(rp.domain.r, v.range) : Math.max(model.domain.r, hist ? rp.domain.r : 0);
    const domH = isReplay ? Math.max(rp.domain.h, v.alt) : Math.max(model.domain.h, hist ? rp.domain.h : 0);
    const rMax = Math.max(niceCeil(domR * 1.02), 2000);
    const hMax = Math.max(niceCeil(toFt(domH) * 1.08), 1000);

    const lm = { r: v.range, h: Math.max(0, v.alt), pitch: v.pitch, throttle: v.throttle, engineOn: v.engineOn };

    // Layout: pane A (full profile) on top, pane B (final approach) below.
    const narrow = W < 520;
    const font = `600 ${narrow ? 10 : 11}px ${theme.fontUi}`;
    const fontSmall = `${narrow ? 9.5 : 10}px ${theme.fontUi}`;
    const gapAB = 26;
    const hA = Math.round((H - gapAB) * 0.54);
    const A = { x: 0, y: 0, w: W, h: hA };
    const B = { x: 0, y: hA + gapAB, w: W, h: H - hA - gapAB };

    // Pane B window (smoothed).
    const plotB = { x: 8, y: B.y + 20, w: W - 16, h: B.h - 20 - 20 };
    const aspect = plotB.w / Math.max(40, plotB.h);
    const target = computeZoomWindow({ lmR: toFt(lm.r), lmH: toFt(lm.h), aspect: Math.max(1.5, Math.min(6, aspect)) });
    const wT = target.rFar - target.rNear;
    if (!zoom || reduceMotion.matches) {
      zoom = { rNear: target.rNear, w: wT, hMax: target.hMax };
    } else {
      const dt = lastFrameMs === null ? 0.016 : Math.min(0.25, (now - lastFrameMs) / 1000);
      const k = 1 - Math.exp(-dt / 0.45);
      zoom.w = Math.exp(Math.log(zoom.w) + (Math.log(wT) - Math.log(zoom.w)) * k);
      zoom.hMax = Math.exp(Math.log(zoom.hMax) + (Math.log(target.hMax) - Math.log(zoom.hMax)) * k);
      zoom.rNear += (target.rNear - zoom.rNear) * k;
    }
    zoom.target = { rNear: target.rNear, w: wT, hMax: target.hMax };
    lastFrameMs = now;
    const win2 = { rNear: zoom.rNear, rFar: zoom.rNear + zoom.w, hMax: zoom.hMax };

    const histKey = hist ? `${rp.key}|${hist.length}` : 'none';
    const paneA = drawPaneA(A, { flown, flownCount, livePt, hist, histKey, passed, lm, landed, rMax, hMax, win2, font, fontSmall, narrow });
    const sites = isReplay ? rp.sites : null;
    const paneB = drawPaneB(B, plotB, { flown, flownCount, livePt, hist, passed, lm, landed, win2, lmVisible: target.lmVisible, font, fontSmall, narrow, snap, isReplay, sites });
    drawLink(paneA.zoomRect, plotB);

    // Spotlight anchors follow the LM and the site.
    const lmPos = paneB.lm || paneA.lm;
    placeSpot(el.spotLm, 'spotLm', lmPos?.[0], lmPos?.[1]);
    const sitePos = paneB.site || paneA.site;
    placeSpot(el.spotSite, 'spotSite', sitePos?.[0], sitePos?.[1]);

    if (hover) showTipAt(hover.x, hover.y);
    updateAria(summarizeTrajectory(snap, passed), now);
  }

  // ----- pane A: full profile over a curved surface -----

  function drawPaneA(A, s) {
    const plot = { x: A.x + 10, y: A.y + 22, w: A.w - 20, h: A.h - 22 - 18 };
    const rMaxN = s.rMax / NMI;
    const rMinN = -0.03 * rMaxN;
    const sx = (rm) => plot.x + plot.w * (1 - (rm / NMI - rMinN) / (rMaxN - rMinN));
    const sag = Math.min(30, plot.h * 0.13);
    const baseY = plot.y + plot.h - sag;
    const surfY = (rm) => baseY + sag * Math.min(1.05, Math.max(0, rm / s.rMax)) ** 2;
    const k = (baseY - plot.y - 6) / s.hMax;          // px per ft
    const proj = (p) => [sx(p.r), surfY(p.r) - toFt(p.h) * k];

    // Static layer (title, ground, contours, ticks, historical path): drawn
    // once per size/axes change into an offscreen canvas, then blitted.
    const key = `${size.w}x${size.h}@${size.dpr}|${A.h}|${s.rMax}|${s.hMax}|${s.narrow}|${s.histKey}`;
    if (bgA.key !== key) {
      bgA.key = key;
      bgA.canvas.width = el.canvas.width;
      bgA.canvas.height = el.canvas.height;
      const c = bgA.canvas.getContext('2d');
      c.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      c.clearRect(0, 0, size.w, size.h);
      paintPaneAStatic(c, A, s, { plot, rMaxN, rMinN, sx, sag, baseY, surfY, k, proj });
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(bgA.canvas, 0, 0);
    g.restore();

    // Zoom window outline (pane B's region).
    const zx1 = sx(s.win2.rFar * FT);
    const zx2 = sx(s.win2.rNear * FT);
    const zyTop = Math.min(surfY(0) - s.win2.hMax * k, surfY(0) - 4);
    const zoomRect = { x: Math.min(zx1, zx2 - 5), y: zyTop, w: Math.max(5, zx2 - zx1), h: surfY(0) - zyTop };
    g.save();
    g.strokeStyle = 'rgba(221,226,232,0.45)';
    g.setLineDash([3, 3]);
    g.strokeRect(zoomRect.x + 0.5, zoomRect.y + 0.5, zoomRect.w, zoomRect.h);
    g.restore();

    // Paths.
    g.save();
    g.beginPath();
    g.rect(A.x, A.y + 16, A.w, A.h - 16);
    g.clip();
    const fxA = (p) => sx(p.r);
    const fyA = (p) => surfY(p.r) - toFt(p.h) * k;
    projA.update(key, s.flown, fxA, fyA);
    const spA = s.flownCount === null ? projA.out.slice() : projA.prefix(s.flownCount - 1);
    spA.push([fxA(s.livePt), fyA(s.livePt), s.livePt.m]);
    drawScreenPath(g, spA, colorFor, 2.2);

    // Target site.
    const site = [sx(0), surfY(0)];
    siteFlag(g, site[0], site[1], theme.white, null, s.font);
    if (s.landed) {
      const [lx] = proj(s.landed);
      landedMark(g, lx, surfY(s.landed.r), theme.amber);
    }

    // LM glyph.
    const [lmx, lmy] = proj(s.lm);
    lmGlyph(g, lmx, lmy - 6, 15, s.lm.pitch, s.lm.throttle, s.lm.engineOn, theme);
    g.restore();

    // Milestones & labels. Those within ~26 px of the site (the whole final
    // approach at this scale) would pile up: they get one cluster label at
    // the zoom bracket instead — pane B shows them individually.
    const items = [];
    const cluster = [];
    for (const m of s.passed) {
      const [x, y] = proj(m);
      if (x > site[0] - 26) cluster.push(m);
      else items.push({ m, x, y });
    }
    if (cluster.length === 1) {
      const [x, y] = proj(cluster[0]);
      items.push({ m: cluster[0], x, y });
      cluster.length = 0;
    }
    const obstacles = [{ x: lmx - 12, y: lmy - 20, w: 24, h: 26 }, { x: site[0] - 4, y: site[1] - 18, w: 14, h: 18 }];
    if (cluster.length) {
      const text = clusterLabel(cluster.map((m) => m.short), s.narrow ? 30 : 56);
      const w = textW(text, s.font) + 10;
      const x = Math.max(A.x + 4, zoomRect.x + zoomRect.w - w);
      const y = Math.max(A.y + 18, zoomRect.y - 26);
      obstacles.push({ x, y, w, h: 16 });
      g.save();
      g.strokeStyle = 'rgba(221,226,232,0.35)';
      g.beginPath();
      g.moveTo(zoomRect.x + zoomRect.w / 2, zoomRect.y);
      g.lineTo(Math.min(zoomRect.x + zoomRect.w / 2, x + w - 6), y + 16);
      g.stroke();
      g.fillStyle = 'rgba(22,26,31,0.86)';
      roundRect(g, x, y, w, 16, 3);
      g.fill();
      g.font = s.font;
      g.textBaseline = 'middle';
      g.fillStyle = cluster.some((m) => m.kind === 'alarm') ? theme.amber : theme.text;
      g.fillText(text, x + 5, y + 8.5);
      g.restore();
      for (const m of cluster) hits.push({ x: zoomRect.x + zoomRect.w / 2, y: zoomRect.y, m });
    }
    drawMilestones(items, { x: A.x + 2, y: A.y + 18, w: A.w - 4, h: (A.y + A.h) - (A.y + 18) - 16 }, s.font, obstacles);

    return { zoomRect, lm: [lmx, lmy - 6], site: null };
  }

  function paintPaneAStatic(c, A, s, geo) {
    const { plot, rMaxN, rMinN, sx, sag, baseY, surfY, k, proj } = geo;
    // Title & curvature note.
    c.save();
    c.font = s.font;
    c.fillStyle = theme.dim;
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.fillText('FULL DESCENT', plot.x, A.y + 14);
    const titleW = textW('FULL DESCENT', s.font);
    c.font = s.fontSmall;
    c.fillStyle = theme.faint;
    c.fillText(s.narrow ? '· ft vs nmi to target' : '· altitude (ft) vs range to target (nmi)', plot.x + titleW + 6, A.y + 14);
    const fl = curvatureFlattening(s.rMax, sag, k);
    if (fl && fl > 2) {
      c.textAlign = 'right';
      const r = fl >= 100 ? Math.round(fl / 10) * 10 : Math.round(fl);
      c.fillText(s.narrow ? `curvature ${r}× flatter` : `Moon’s curvature drawn ${r}× flatter`, plot.x + plot.w, A.y + 14);
    }
    c.restore();

    // Ground.
    c.save();
    const grad = c.createLinearGradient(0, baseY, 0, A.y + A.h);
    grad.addColorStop(0, theme.ground);
    grad.addColorStop(1, theme.groundDeep);
    c.fillStyle = grad;
    c.beginPath();
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const x = plot.x + (plot.w * i) / N;
      const rm = (rMinN + (rMaxN - rMinN) * (1 - i / N)) * NMI;
      if (i === 0) c.moveTo(A.x, surfY(rm));
      c.lineTo(x, surfY(rm));
    }
    c.lineTo(A.x + A.w, surfY(rMinN * NMI));
    c.lineTo(A.x + A.w, A.y + A.h);
    c.lineTo(A.x, A.y + A.h);
    c.closePath();
    c.fill();
    c.strokeStyle = theme.groundLine;
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = plot.x + (plot.w * i) / N;
      const rm = (rMinN + (rMaxN - rMinN) * (1 - i / N)) * NMI;
      if (i === 0) c.moveTo(x, surfY(rm)); else c.lineTo(x, surfY(rm));
    }
    c.stroke();
    c.restore();

    // Altitude contours parallel to the surface.
    c.save();
    c.font = s.fontSmall;
    c.textBaseline = 'bottom';
    c.textAlign = 'left';
    const hTicks = niceTicks(0, s.hMax, s.narrow ? 3 : 4).filter((v) => v > 0);
    for (const hv of hTicks) {
      c.strokeStyle = 'rgba(255,255,255,0.06)';
      c.setLineDash([2, 4]);
      c.beginPath();
      for (let i = 0; i <= N; i++) {
        const x = plot.x + (plot.w * i) / N;
        const rm = (rMinN + (rMaxN - rMinN) * (1 - i / N)) * NMI;
        const y = surfY(rm) - hv * k;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = theme.faint;
      const label = hv >= 1000 ? `${Number.isInteger(hv / 1000) ? fmtInt(hv / 1000) : +(hv / 1000).toFixed(2)}k ft` : `${fmtInt(hv)} ft`;
      c.fillText(label, plot.x + 2, surfY(s.rMax) - hv * k - 2);
    }
    c.restore();

    // Range ticks (nmi) along the bottom.
    c.save();
    c.font = s.fontSmall;
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    c.fillStyle = theme.dim;
    c.strokeStyle = theme.groundLine;
    const xTicks = niceTicks(0, rMaxN, Math.max(3, Math.min(7, Math.floor(plot.w / 90))));
    const xStep = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 1;
    for (const xv of xTicks) {
      const x = sx(xv * NMI);
      const y = surfY(xv * NMI);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + 4);
      c.stroke();
      const label = xv === 0 ? '0' : fmtTick(xv, xStep);
      c.fillText(label, Math.min(Math.max(x, plot.x + 8), plot.x + plot.w - 8), A.y + A.h - 2);
    }
    c.restore();

    if (s.hist) {
      c.save();
      c.beginPath();
      c.rect(A.x, A.y + 16, A.w, A.h - 16);
      c.clip();
      drawScreenDashed(c, screenDecimate(s.hist, (p) => sx(p.r), (p) => surfY(p.r) - toFt(p.h) * k, null, 1.2), theme.hist, 1.2);
      c.restore();
    }
  }

  // ----- pane B: auto-zooming final approach -----

  function drawPaneB(B, plot, s) {
    const { rNear, rFar, hMax } = s.win2;
    const sx = linearScale(rFar, rNear, plot.x, plot.x + plot.w);   // feet, reversed
    const sy = linearScale(0, hMax, plot.y + plot.h, plot.y);
    const proj = (p) => [sx(toFt(p.r)), sy(toFt(p.h))];

    // Frame.
    g.save();
    g.fillStyle = 'rgba(255,255,255,0.015)';
    g.fillRect(plot.x, plot.y, plot.w, plot.h);
    g.font = s.font;
    g.fillStyle = theme.dim;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText('FINAL APPROACH', plot.x, B.y + 13);
    const titleW = textW('FINAL APPROACH', s.font);
    g.font = s.fontSmall;
    g.fillStyle = theme.faint;
    g.fillText(s.narrow ? '· auto-zoom · ft' : '· auto-zoom · altitude vs range to target (ft)', plot.x + titleW + 6, B.y + 13);
    g.restore();

    // Grid.
    const xT = niceTicks(rNear, rFar, Math.max(3, Math.min(8, Math.floor(plot.w / 90))));
    const yT = niceTicks(0, hMax, s.narrow ? 3 : 4);
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 1;
    g.beginPath();
    for (const xv of xT) { const x = Math.round(sx(xv)) + 0.5; g.moveTo(x, plot.y); g.lineTo(x, plot.y + plot.h); }
    for (const yv of yT) { const y = Math.round(sy(yv)) + 0.5; g.moveTo(plot.x, y); g.lineTo(plot.x + plot.w, y); }
    g.stroke();
    g.font = s.fontSmall;
    g.fillStyle = theme.faint;
    g.textBaseline = 'bottom';
    g.textAlign = 'left';
    for (const yv of yT) if (yv > 0 && sy(yv) > plot.y + 12) g.fillText(`${fmtInt(yv)} ft`, plot.x + 3, sy(yv) - 2);
    g.textAlign = 'center';
    g.fillStyle = theme.dim;
    for (const xv of xT) {
      const x = sx(xv);
      if (x < plot.x + 14 || x > plot.x + plot.w - 14) continue;
      g.fillText(fmtInt(xv), x, B.y + B.h - 2);
    }
    g.textAlign = 'right';
    g.fillStyle = theme.faint;
    const step = xT.length > 1 ? xT[1] - xT[0] : 0;
    if (step) {
      g.textBaseline = 'alphabetic';
      g.fillText(`grid ${fmtInt(step)} ft`, plot.x + plot.w, B.y + 13);
    }
    g.restore();

    // Ground (flat here: over 40,000 ft the curvature drop is < 500 ft and
    // the local terrain varies by more — research/web-trajectory-b.md §5.1).
    g.save();
    const gy = sy(0);
    const grad = g.createLinearGradient(0, gy, 0, plot.y + plot.h + 4);
    grad.addColorStop(0, theme.ground);
    grad.addColorStop(1, theme.groundDeep);
    g.fillStyle = grad;
    g.fillRect(plot.x, gy, plot.w, Math.max(3, plot.y + plot.h - gy + 2));
    g.strokeStyle = theme.groundLine;
    g.beginPath();
    g.moveTo(plot.x, gy + 0.5);
    g.lineTo(plot.x + plot.w, gy + 0.5);
    g.stroke();
    g.restore();

    let lmPos = null;
    let sitePos = null;
    let landedBox = null;
    let siteBox = null;
    g.save();
    g.beginPath();
    g.rect(plot.x, plot.y - 4, plot.w, plot.h + 8);
    g.clip();
    const clipB = { x0: plot.x - 30, y0: plot.y - 30, x1: plot.x + plot.w + 30, y1: plot.y + plot.h + 30 };
    const span = (rFar - rNear) * FT;
    const cull = { lo: rNear * FT - 0.1 * span, hi: rFar * FT + 0.1 * span };
    const fxB = (p) => sx(toFt(p.r));
    const fyB = (p) => sy(toFt(p.h));
    if (s.hist) drawScreenDashed(g, screenDecimate(s.hist, fxB, fyB, clipB, 1.2, cull), theme.hist, 1.4);
    const flownB = s.flownCount === null ? s.flown : s.flown.slice(0, s.flownCount);
    const spB = screenDecimate(flownB, fxB, fyB, clipB, 0.75, cull);
    if (spB.length && spB[spB.length - 1] !== null) spB.push([fxB(s.livePt), fyB(s.livePt), s.livePt.m]);
    drawScreenPath(g, spB, colorFor, 2.6);
    const siteX = sx(0);
    if (siteX >= plot.x - 2 && siteX <= plot.x + plot.w + 2) {
      siteFlag(g, siteX, gy, theme.white, 'aim point', s.fontSmall);
      sitePos = [siteX, gy - 8];
      siteBox = { x: siteX - 26, y: gy - 32, w: 56, h: 34 };
    }
    // The planned site in map coordinates (track annotation, feet): the PDI
    // navigation error moved the whole trajectory — the computer never knew.
    const planned = s.sites?.planned;
    let plannedBox = null;
    if (planned && Number.isFinite(planned.range)) {
      const px = sx(planned.range);
      if (px >= plot.x + 4 && px <= plot.x + plot.w - 4) {
        g.save();
        g.strokeStyle = theme.faint;
        g.setLineDash([2, 2]);
        g.beginPath();
        g.moveTo(px, gy);
        g.lineTo(px, gy - 16);
        g.stroke();
        g.setLineDash([]);
        g.beginPath();
        g.moveTo(px, gy - 16);
        g.lineTo(px + 8, gy - 12.5);
        g.lineTo(px, gy - 9);
        g.stroke();
        g.font = s.fontSmall;
        g.fillStyle = theme.faint;
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.fillText('planned site (map)', px + 3, gy - 19);
        g.restore();
        const pw = textW('planned site (map)', s.fontSmall);
        plannedBox = { x: px + 3 - pw / 2, y: gy - 32, w: pw, h: 34 };
      }
    }
    if (s.landed) {
      const lx = sx(toFt(s.landed.r));
      landedMark(g, lx, gy, theme.amber);
    }
    if (s.lmVisible) {
      const [x, y] = proj(s.lm);
      const size = s.narrow ? 24 : 30;
      // The glyph's footpads are ~0.45·size below its origin; keep them on
      // the ground line when landed.
      const yy = Math.min(y - size * 0.45, gy - size * 0.45);
      lmGlyph(g, x, yy, size, s.lm.pitch, s.lm.throttle, s.lm.engineOn, theme);
      lmPos = [x, yy];
    }
    g.restore();

    // Landing annotation.
    if (s.landed) {
      const lx = sx(toFt(s.landed.r));
      const d = toFt(s.landed.r);
      // LmPhysics evaluates the touchdown (vertical/horizontal speed, tilt).
      const td = s.isReplay ? null : s.snap?.vehicle?.touchdown;
      const who = s.isReplay ? 'Eagle landed' : landingWord(td?.verdict);
      let txt = Math.abs(d) < 50 ? `${who} at the aim point`
        : d < 0 ? `${who} ${fmtInt(-d)} ft beyond the aim point` : `${who} ${fmtInt(d)} ft short of the aim point`;
      if (td && Number.isFinite(td.vVert)) {
        txt += ` · ${fmtNum1(Math.abs(toFps(td.vVert)))} ft/s down, ${fmtNum1(Math.abs(toFps(td.vHoriz)))} ft/s across`;
      }
      g.save();
      g.font = s.font;
      const tw = textW(txt, s.font);
      const x = Math.min(Math.max(lx - tw / 2, plot.x + 6), plot.x + plot.w - tw - 6);
      const y = plot.y + 6;
      landedBox = { x: x - 5, y: y - 2, w: tw + 10, h: 17 };
      g.fillStyle = 'rgba(22,26,31,0.86)';
      roundRect(g, x - 5, y - 2, tw + 10, 17, 4);
      g.fill();
      g.fillStyle = td?.verdict === 'crash' ? theme.red : theme.amber;
      g.textBaseline = 'top';
      g.fillText(txt, x, y + 1);
      // Replay: how far from the planned (map) site — ≈6.6 km for Apollo 11
      // (MR §5.3, Table 5-IV; research/web-trajectory-b.md §3.1).
      if (planned && Number.isFinite(planned.range)) {
        const km = ((planned.range - d) * FT) / 1000;
        const t2 = `≈${km.toFixed(1)} km (${(km * 1000 / NMI).toFixed(1)} nmi) long of the planned site — PDI navigation error`;
        g.font = s.fontSmall;
        const w2 = textW(t2, s.fontSmall);
        const x2 = Math.min(Math.max(lx - w2 / 2, plot.x + 6), plot.x + plot.w - w2 - 6);
        g.fillStyle = 'rgba(22,26,31,0.86)';
        roundRect(g, x2 - 5, y + 17, w2 + 10, 15, 4);
        g.fill();
        g.fillStyle = theme.dim;
        g.fillText(t2, x2, y + 19);
        landedBox = { x: Math.min(landedBox.x, x2 - 5), y: landedBox.y, w: Math.max(landedBox.x + landedBox.w, x2 + w2 + 5) - Math.min(landedBox.x, x2 - 5), h: 34 };
      }
      g.restore();
    }

    // LM far away: say where it is.
    if (!s.lmVisible) {
      const txt = s.lm.h > 0 || s.lm.r > 0
        ? `LM is ${formatRange(Math.round(s.lm.r / NMI) * NMI)} uprange at ${fmtInt(Math.round(toFt(s.lm.h) / 100) * 100)} ft — the final approach begins at P64 high gate (≈7,000 ft).`
        : '';
      if (txt) {
        g.save();
        g.font = s.fontSmall;
        g.fillStyle = theme.dim;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        const maxW = Math.min(plot.w - 16, 420);
        const { lines, width } = wrapLines(g, txt, maxW, s.fontSmall);
        const boxW = width + 12;
        g.fillStyle = 'rgba(16,19,23,0.85)';
        roundRect(g, plot.x + 2, plot.y + 3, boxW, lines.length * 14 + 8, 4);
        g.fill();
        g.fillStyle = theme.dim;
        lines.forEach((l, i) => g.fillText(l, plot.x + 8, plot.y + 8 + i * 14));
        // Arrow to the left edge (uprange).
        g.strokeStyle = theme.dim;
        g.beginPath();
        const ay = plot.y + plot.h * 0.55;
        g.moveTo(plot.x + 26, ay); g.lineTo(plot.x + 8, ay);
        g.moveTo(plot.x + 14, ay - 5); g.lineTo(plot.x + 8, ay); g.lineTo(plot.x + 14, ay + 5);
        g.stroke();
        g.restore();
      }
    }

    // Milestones in the window.
    const items = [];
    for (const m of s.passed) {
      const ft = toFt(m.r);
      if (ft > rFar || ft < rNear || toFt(m.h) > hMax) continue;
      const [x, y] = proj(m);
      items.push({ m, x, y });
    }
    const obstacles = [];
    if (lmPos) obstacles.push({ x: lmPos[0] - 20, y: lmPos[1] - 20, w: 40, h: 36 });
    if (siteBox) obstacles.push(siteBox);
    if (landedBox) obstacles.push(landedBox);
    if (plannedBox) obstacles.push(plannedBox);
    drawMilestones(items, { x: plot.x + 2, y: plot.y + 2, w: plot.w - 4, h: plot.h - 4 }, s.font, obstacles);

    return { lm: lmPos, site: sitePos };
  }

  function drawLink(zr, plotB) {
    if (!zr) return;
    g.save();
    g.strokeStyle = 'rgba(221,226,232,0.16)';
    g.setLineDash([2, 3]);
    g.beginPath();
    g.moveTo(zr.x, zr.y + zr.h);
    g.lineTo(plotB.x, plotB.y);
    g.moveTo(zr.x + zr.w, zr.y + zr.h);
    g.lineTo(plotB.x + plotB.w, plotB.y);
    g.stroke();
    g.restore();
  }

  function drawMilestones(items, bounds, font, obstacles) {
    if (!items.length) return;
    const prio = { program: 3, landing: 3, alarm: 2, event: 1 };
    const layoutItems = items.map((it, i) => ({
      key: i, x: it.x, y: it.y, w: textW(it.m.short, font) + 8, h: 15, priority: prio[it.m.kind] ?? 1,
    }));
    const labels = layoutLabels(layoutItems, bounds, { obstacles, markerR: 6 });
    // Leaders first, then markers, then label boxes on top.
    g.save();
    g.strokeStyle = 'rgba(221,226,232,0.35)';
    g.lineWidth = 1;
    for (const l of labels) {
      if (!l.leader) continue;
      const lx = l.x + (l.x >= l.ax ? 0 : l.w);
      const ly = l.y + l.h / 2;
      g.beginPath();
      g.moveTo(l.ax, l.ay);
      g.lineTo(lx, ly);
      g.stroke();
    }
    g.restore();
    for (const it of items) {
      const color = it.m.kind === 'program' ? colorFor(phaseForMode(Number(/p(6\d)/i.exec(it.m.id + it.m.label)?.[1]))) : theme.text;
      drawMarker(g, it.x, it.y, it.m.kind, color, theme);
      hits.push({ x: it.x, y: it.y, m: it.m });
    }
    g.save();
    g.font = font;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    for (const l of labels) {
      const m = items[l.key].m;
      g.fillStyle = 'rgba(22,26,31,0.82)';
      roundRect(g, l.x, l.y, l.w, l.h, 3);
      g.fill();
      g.fillStyle = m.kind === 'alarm' ? theme.amber : m.kind === 'program' ? theme.text : theme.dim;
      g.fillText(m.short, l.x + 4, l.y + l.h / 2 + 0.5);
    }
    g.restore();
  }

  // Word-wrapped lines + widest line; cached (measureText is costly).
  const wrapCache = new Map();
  function wrapLines(gc, text, maxW, font) {
    const key = `${font}|${maxW}|${text}`;
    let hit = wrapCache.get(key);
    if (hit) return hit;
    const lines = [];
    let line = '';
    for (const w of text.split(' ')) {
      const test = line ? `${line} ${w}` : w;
      if (textW(test, font) > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    hit = { lines, width: Math.max(...lines.map((l) => textW(l, font))) };
    if (wrapCache.size > 50) wrapCache.clear();
    wrapCache.set(key, hit);
    return hit;
  }

  // ----- tooltip -----

  function onPointer(ev) {
    const rect = el.canvas.getBoundingClientRect();
    hover = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    showTipAt(hover.x, hover.y);
  }

  function showTipAt(x, y) {
    let best = null;
    let bestD = 10;
    for (const h of hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bestD) { best = h; bestD = d; }
    }
    if (!best) { hideTip(); return; }
    const m = best.m;
    const text = `${m.label} — GET ${formatGET(m.t)} · ${fmtInt(toFt(m.h))} ft · ${formatRange(m.r)} to target`;
    if (el.tip.textContent !== text) el.tip.textContent = text;
    el.tip.hidden = false;
    const tw = el.tip.offsetWidth;
    const left = Math.min(Math.max(4, best.x - tw / 2), size.w - tw - 4);
    el.tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(2, best.y - 34))}px)`;
  }

  function hideTip() {
    if (!el.tip.hidden) el.tip.hidden = true;
  }

  // Theme changes (e.g. a user stylesheet) are rare; re-read on resize too.
  const mq = win.matchMedia ? win.matchMedia('(prefers-color-scheme: dark)') : null;
  const onScheme = () => { theme = readTheme(el.wrap); bgA.key = null; dirty = true; };
  mq?.addEventListener?.('change', onScheme);

  return {
    render,
    destroy() {
      for (const off of offs) off();
      ro.disconnect();
      mq?.removeEventListener?.('change', onScheme);
      root.innerHTML = '';
    },
  };
}
