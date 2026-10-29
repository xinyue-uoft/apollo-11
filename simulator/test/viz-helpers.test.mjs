// Pure helpers of the visualisation views (trajectory, instruments, crew,
// ignition). The view modules must import in Node without a DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseGET } from '../js/util/time.js';
import { FT, FPS, NMI } from '../js/util/units.js';
import {
  niceStep, niceTicks, niceCeil, linearScale, phaseForMode, programTitle,
  formatAlarmCode, formatRange, fmtInt, classifyMilestone, shortLabel,
  normalizeMilestones, modeTransitions, modeAt, lastIndexAtOrBefore, pointAtTime,
  PathRecorder, computeZoomWindow, layoutLabels, TrajectoryModel, mergeAlarms,
  clusterLabel, curvatureFlattening, summarizeTrajectory, sampleReplayPath,
  screenDecimate, ProjectedPath, selectMajor,
  FALLBACK_MILESTONES, PDI_GET, TOUCHDOWN_GET,
} from '../js/ui/trajectory-view.js';
import {
  altTapePos, rateTapePos, fmtNum, fmtSigned, formatRangeShort, pct,
  BINGO_FRAC, LOW_LEVEL_FRAC, bingoRemaining, tigCountdown, pgnsModeLabel, pick,
  orbitText, altTapeTicks, rateTapeTicks, THROTTLE_MIN, THROTTLE_FTP,
} from '../js/ui/instruments-view.js';
import { crewModel, rodRateFps, fmtRate, crewHint, LPD_AZ_STEP_DEG, LPD_EL_STEP_DEG } from '../js/ui/crew-view.js';
import {
  makePiecewiseScale, timelineScale, timelineTicks, fmtRel, assignRows,
  ignitionSchedule, resolveAnchor, dskyNow, phaseText, P63TABLE_ROWS,
  TABLE_ANCHOR_CANDIDATES, burnTitle,
} from '../js/ui/ignition-view.js';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const lines = (file) => readFileSync(REPO + file, 'utf8').split('\n');

// ---------------- trajectory ----------------

test('nice ticks and scales', () => {
  assert.equal(niceStep(100, 5), 20);
  assert.equal(niceStep(260, 6), 50);
  assert.deepEqual(niceTicks(0, 260, 6), [0, 50, 100, 150, 200, 250]);
  assert.deepEqual(niceTicks(-1000, 3000, 4), [-1000, 0, 1000, 2000, 3000]);
  assert.deepEqual(niceTicks(5, 5), [5]);
  assert.deepEqual(niceTicks(NaN, 5), []);
  for (const v of [1, 7, 49376, 53784, 263.2]) assert.ok(niceCeil(v) >= v && niceCeil(v) <= v * 1.5 + 1e-9, `niceCeil(${v})`);
  assert.equal(niceCeil(53784), 60000);
  const s = linearScale(0, 100, 10, 210);
  assert.equal(s(50), 110);
  assert.equal(s.invert(110), 50);
  const rev = linearScale(100, 0, 0, 500);   // reversed range axis
  assert.equal(rev(0), 500);
});

test('program colours and titles', () => {
  assert.equal(phaseForMode(63), 'p63');
  assert.equal(phaseForMode(64), 'p64');
  for (const m of [65, 66, 67, 68]) assert.equal(phaseForMode(m), 'p66');
  assert.equal(phaseForMode(0), 'other');
  assert.equal(phaseForMode(null), 'other');
  assert.equal(programTitle(63), 'P63 · braking phase');
  assert.equal(programTitle(40, 'SPS THRUST'), 'P40 · sps thrust');
  assert.equal(programTitle(undefined), '—');
});

test('formatting: alarm codes are octal, DSKY style', () => {
  assert.equal(formatAlarmCode(0o1202), '01202');
  assert.equal(formatAlarmCode(0o1201), '01201');
  assert.equal(formatAlarmCode('Program alarm 1202'), '01202');
  assert.equal(formatAlarmCode('nothing'), '');
  assert.equal(fmtInt(-2900), '−2,900');
  assert.equal(fmtInt(49376), '49,376');
  assert.equal(formatRange(260 * NMI), '260 nmi');
  assert.equal(formatRange(4.45 * NMI), '4.5 nmi');
  assert.equal(formatRange(3 * NMI), '18,228 ft');
  assert.equal(formatRange(25 * NMI), '25.0 nmi');
  assert.equal(formatRange(-1100 * FT), '−1,100 ft');
});

test('milestones: classification, short labels, normalisation', () => {
  const m = (id, label) => ({ id, label });
  assert.equal(classifyMilestone(m('alarm-1202-1', 'Program alarm 1202')), 'alarm');
  assert.equal(classifyMilestone(m('touchdown', 'Touchdown')), 'landing');
  assert.equal(classifyMilestone(m('p64', 'P64 — high gate')), 'program');
  assert.equal(classifyMilestone(m('lr', 'Landing radar data good')), 'event');
  assert.equal(shortLabel(m('pdi', 'PDI — DPS ignition')), 'PDI');
  assert.equal(shortLabel(m('ftp', 'Throttle up to fixed throttle position')), 'Throttle up');
  assert.equal(shortLabel(m('x', 'Throttle down')), 'Throttle down');
  assert.equal(shortLabel(m('lr-good', 'Landing radar data good')), 'LR lock-on');
  assert.equal(shortLabel(m('a', 'Program alarm 1201')), '01201');
  assert.equal(shortLabel(m('p66', 'P66 (rate of descent)')), 'P66');
  assert.equal(shortLabel(m('ll', 'Low-level light')), 'Low level');
  assert.equal(shortLabel(m('something', 'A rather long label that keeps going')).length, 16);

  const norm = normalizeMilestones([
    { t: '102:41:32', id: 'p64', label: 'P64' },
    { t: 'bad', id: 'x', label: 'x' },
    null,
    { t: parseGET('102:33:05.01'), id: 'pdi', label: 'PDI' },
  ]);
  assert.deepEqual(norm.map((x) => x.id), ['pdi', 'p64']);
  assert.equal(norm[0].t, parseGET('102:33:05.01'));
  assert.equal(norm[1].kind, 'program');

  // The fallback list is the Mission Report Table 5-I sequence, in order,
  // from PDI to touchdown, with five program alarms.
  const fb = normalizeMilestones(FALLBACK_MILESTONES);
  assert.equal(fb[0].t, PDI_GET);
  assert.equal(fb[fb.length - 1].t, TOUCHDOWN_GET);
  assert.deepEqual(fb.filter((x) => x.kind === 'alarm').map((x) => x.short), ['01202', '01202', '01201', '01202', '01202']);
});

test('major milestones only, when the data flag them', () => {
  const list = normalizeMilestones([
    { t: 1, id: 'ullage', label: 'Ullage', major: false },
    { t: 2, id: 'pdi', label: 'PDI', major: true },
    { t: 3, id: 'alarm-1202-1', label: 'Program alarm 1202', kind: 'alarm', major: false },
    { t: 4, id: 'lr-regain-1', label: 'Radar data good again', kind: 'radar' },
  ]);
  assert.deepEqual(selectMajor(list).map((m) => m.id), ['pdi', 'alarm-1202-1']);
  assert.equal(list[3].short, 'LR data good');
  assert.equal(list[3].kind, 'event');
  const unflagged = normalizeMilestones(FALLBACK_MILESTONES);
  assert.equal(selectMajor(unflagged).length, unflagged.length);
});

test('mode transitions colour a replayed path', () => {
  const tr = modeTransitions(normalizeMilestones(FALLBACK_MILESTONES), 63);
  assert.equal(modeAt(tr, parseGET('102:40:00')), 63);
  assert.equal(modeAt(tr, parseGET('102:41:32')), 64);
  assert.equal(modeAt(tr, parseGET('102:43:00')), 64);
  assert.equal(modeAt(tr, parseGET('102:44:00')), 66);
});

test('path lookup and recorder', () => {
  const pts = [{ t: 0, r: 100, h: 10, m: 63 }, { t: 10, r: 0, h: 0, m: 63 }];
  assert.equal(lastIndexAtOrBefore(pts, -1), -1);
  assert.equal(lastIndexAtOrBefore(pts, 5), 0);
  assert.equal(lastIndexAtOrBefore(pts, 10), 1);
  assert.deepEqual(pointAtTime(pts, 5), { t: 5, r: 50, h: 5, m: 63 });
  assert.equal(pointAtTime(pts, 11), null);

  const rec = new PathRecorder({ minDt: 0.5, maxPoints: 100 });
  for (let i = 0; i <= 20; i++) rec.add({ t: i * 0.1, r: 1, h: 1, m: 63 });
  assert.equal(rec.points.length, 5);              // 0, 0.5, 1.0, 1.5, 2.0
  assert.ok(rec.add({ t: 2.05, r: 1, h: 1, m: 64 })); // a program change is always kept
  rec.add({ t: 1.2, r: 1, h: 1, m: 63 });          // time went back: truncate
  assert.ok(rec.points.every((p, i, a) => i === 0 || p.t > a[i - 1].t));
  assert.ok(rec.points[rec.points.length - 1].t <= 1.2);
  const big = new PathRecorder({ minDt: 0, maxPoints: 50 });
  for (let i = 0; i < 200; i++) big.add({ t: i, r: i, h: i, m: i < 100 ? 63 : 64 });
  assert.ok(big.points.length <= 50);
  assert.equal(big.points[big.points.length - 1].t, 199);
  assert.ok(big.points.every((p, i, a) => i === 0 || p.t > a[i - 1].t));
});

test('screen-space decimation keeps shape, program changes and window crossings', () => {
  const pts = [];
  for (let i = 0; i <= 1000; i++) pts.push({ t: i, r: 1000 - i, h: 0, m: i < 600 ? 63 : 64 });
  const fx = (p) => p.r / 10;     // 0.1 px per point → heavy decimation
  const fy = () => 0;
  const sp = screenDecimate(pts, fx, fy, null, 1);
  assert.ok(sp.length < 120, String(sp.length));
  assert.deepEqual(sp[0], [100, 0, 63]);
  assert.deepEqual(sp[sp.length - 1], [0, 0, 64]);   // last point always kept
  assert.ok(sp.some((q) => q[2] === 64 && q[0] === 40), 'first point of the new program kept');
  // Clip to x in [20, 30]: one run, with the crossing points either side.
  const clip = { x0: 20, x1: 30, y0: -1, y1: 1 };
  const c = screenDecimate(pts, fx, fy, clip, 0);
  assert.ok(c[0][0] > 30 && c[c.length - 1][0] < 20, JSON.stringify([c[0], c[c.length - 1]]));
  assert.ok(!c.includes(null));
  // The range cull gives the same result without projecting everything.
  let calls = 0;
  const counted = (p) => { calls++; return fx(p); };
  const culled = screenDecimate(pts, counted, fy, clip, 0, { lo: 190, hi: 310 });
  assert.ok(calls < 200, String(calls));
  assert.deepEqual(culled.filter((q) => q[0] >= 20 && q[0] <= 30), c.filter((q) => q[0] >= 20 && q[0] <= 30));
  // Leaving and re-entering the window leaves a gap marker.
  const zig = [0, 25, 50, 25, 0].map((x, i) => ({ t: i, r: x * 10, h: 0, m: 63 }));
  const g = screenDecimate(zig, fx, fy, clip, 0);
  assert.ok(g.includes(null));
});

test('incremental projection for pane A', () => {
  const pp = new ProjectedPath(1);
  const src = [];
  for (let i = 0; i < 10; i++) src.push({ t: i, r: i * 5, h: 0, m: 63 });
  const fx = (p) => p.r;
  const fy = () => 0;
  pp.update('k', src, fx, fy);
  assert.equal(pp.out.length, 10);
  src.push({ t: 10, r: 45.5, h: 0, m: 63 });        // < 1 px from the last kept: dropped
  src.push({ t: 11, r: 60, h: 0, m: 63 });
  pp.update('k', src, fx, fy);
  assert.equal(pp.out.length, 11);
  assert.deepEqual(pp.prefix(4).map((q) => q[0]), [0, 5, 10, 15, 20]);
  pp.update('other-key', src, fx, fy);              // projection changed: rebuilt
  assert.equal(pp.n, src.length);
});

test('final-approach window follows the LM and keeps the site in view', () => {
  // Far uprange (braking phase): the fixed approach window, LM not shown.
  const far = computeZoomWindow({ lmR: 40 * NMI / FT, lmH: 30000 });
  assert.equal(far.lmVisible, false);
  assert.ok(far.rNear < 0 && far.rFar > 30000);
  // High gate (≈7,129 ft, ≈26,000 ft from the aim point).
  const hg = computeZoomWindow({ lmR: 26000, lmH: 7129 });
  assert.ok(hg.lmVisible && hg.siteVisible);
  assert.ok(hg.rNear <= 0 && hg.rFar >= 26000 && hg.hMax >= 7129);
  // Low over the surface: a tight window.
  const low = computeZoomWindow({ lmR: 500, lmH: 150 });
  assert.ok(low.rFar - low.rNear < 3000 && low.hMax < 1000);
  assert.ok(low.rNear <= 0 && low.rFar >= 500);
  // Landed 1,100 ft beyond the aim point: both in view, LM inside margins.
  const td = computeZoomWindow({ lmR: -1100, lmH: 0 });
  assert.ok(td.rNear < -1100 && td.rFar > 0 && td.siteVisible);
  // Never smaller than the minimum window.
  const z = computeZoomWindow({ lmR: 0, lmH: 0 });
  assert.ok(z.rFar - z.rNear >= 700 && z.hMax >= 220);
});

test('label layout never overlaps and stays in bounds', () => {
  const bounds = { x: 0, y: 0, w: 400, h: 200 };
  const items = [];
  for (let i = 0; i < 8; i++) items.push({ key: i, x: 300 + i * 3, y: 150, w: 60, h: 15, priority: i % 3 });
  const out = layoutLabels(items, bounds);
  assert.ok(out.length >= 6, `placed ${out.length}`);
  for (const a of out) {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= 400 && a.y + a.h <= 200);
    for (const b of out) {
      if (a === b) continue;
      const sep = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(sep, `labels ${a.key} and ${b.key} overlap`);
    }
  }
  assert.ok(out.some((l) => l.leader), 'stacked labels get leader lines');
  assert.deepEqual(layoutLabels(items, bounds), out, 'deterministic');
  // An obstacle is respected.
  const one = layoutLabels([{ key: 'a', x: 100, y: 100, w: 40, h: 15 }], bounds, { obstacles: [{ x: 90, y: 70, w: 80, h: 30 }] });
  assert.equal(one.length, 1);
  assert.ok(one[0].y >= 100 || one[0].y + one[0].h <= 70);
});

test('cluster labels fold repeats and truncate', () => {
  assert.equal(clusterLabel(['P64', '01201', '01202', '01202', 'P66']), 'P64 · 01201 · 01202 ×2 · P66');
  assert.ok(clusterLabel(['Touchdown', 'Touchdown', 'Low level', 'P66', 'P64', '01202'], 20).endsWith('…'));
});

test('the live model marks edges, not the first sample', () => {
  const snap = (t, v, mode = 63, alarms = []) => ({
    t, software: 'Luminary099',
    vehicle: { alt: 1000, range: 5000, throttle: 0.1, engineOn: true, fuelFrac: 0.5, lr: { altValid: true }, ...v },
    agc: { mode, alarms: { history: alarms } },
  });
  const m = new TrajectoryModel();
  m.observe(snap(100, {}, 64));                   // a preset starting mid-burn
  assert.equal(m.live.size, 0, 'no PDI / LR marker at the first sample');
  m.observe(snap(101, { throttle: 0.3 }, 64));
  m.observe(snap(102, {}, 66));
  assert.ok(m.live.has('p66'));
  m.observe(snap(103, { fuelFrac: 0.05 }, 66));
  assert.ok(m.live.has('low-level'));
  m.observe(snap(104, { landed: true, alt: 0, range: -300 }, 66));
  assert.deepEqual(m.landed, { t: 104, r: -300, h: 0 });
  assert.ok(m.live.has('touchdown'));
  m.observe(snap(50, {}, 63));                    // time went backwards → reset
  assert.equal(m.landed, null);
  assert.equal(m.points.length, 1);

  const fresh = new TrajectoryModel();
  fresh.observe(snap(0, { engineOn: false, throttle: 0, lr: {} }));
  fresh.observe(snap(1, { engineOn: true, throttle: 0.1, lr: {} }));
  fresh.observe(snap(27, { throttle: 0.93, lr: {} }));
  fresh.observe(snap(400, { throttle: 0.6, lr: { altValid: true } }));
  assert.deepEqual([...fresh.live.keys()], ['ignition', 'throttle-up', 'throttle-down', 'lr-data-good']);
  fresh.observe(snap(401, { throttle: 0.6, lr: { altValid: false } }));
  fresh.observe(snap(402, { throttle: 0.6, lr: { altValid: true } }));
  assert.equal(fresh.live.get('lr-data-good').t, 400, 'a radar drop-out and recovery is not a new lock-on');
  assert.equal(fresh.live.get('ignition').short, 'PDI');

  const alarms = TrajectoryModel.alarmMilestones(snap(0, {}, 63, [{ t: 10, code: 0o1202, text: 'NO CORE SETS' }]));
  assert.equal(alarms[0].label, 'Program alarm 01202 — NO CORE SETS');
  const merged = mergeAlarms(normalizeMilestones([{ t: 11, id: 'a', label: 'Program alarm 1202' }]), alarms);
  assert.equal(merged.length, 1, 'an AGC alarm near a historical one is the same alarm');
  // One-to-one matching by code: two historical 1202s 15 s apart and two
  // model 1202s, the second ~5 s early → still two markers; a 1201 does not
  // match a 1202.
  const hist = normalizeMilestones([
    { t: 100, id: 'a1', label: 'Program alarm 1202' }, { t: 115, id: 'a2', label: 'Program alarm 1202' },
  ]);
  const sim = [{ t: 101, code: 0o1202 }, { t: 110, code: 0o1202 }].map((x) => ({ ...x, id: `s${x.t}`, label: 'Program alarm 01202', kind: 'alarm' }));
  assert.equal(mergeAlarms(hist, sim).length, 2);
  assert.equal(mergeAlarms(hist, [{ t: 101, id: 'x', label: 'Program alarm 01201', kind: 'alarm', code: 0o1201 }]).length, 3);
});

test('surface curvature flattening factor', () => {
  // 260 nmi: d²/2R ≈ 66.8 km ≈ 219,000 ft below the site's horizontal.
  const f = curvatureFlattening(260 * NMI, 30, 0.004);   // 0.004 px/ft
  assert.ok(Math.abs(f - (219000 * 0.004) / 30) / f < 0.02, String(f));
  assert.equal(curvatureFlattening(0, 30, 1), null);
});

test('text alternative', () => {
  assert.match(summarizeTrajectory(null), /no simulation/);
  const s = summarizeTrajectory({ software: 'Luminary099', vehicle: { alt: 10000 * FT, range: 30 * NMI, altRate: -120 * FPS }, agc: { mode: 63 } },
    [{ label: 'PDI' }, { label: 'Throttle up' }]);
  assert.match(s, /P63 · braking phase\. Altitude 10,000 feet, 30\.0 nautical miles to the targeted site, descending 120 feet per second\. Recent milestones: PDI; Throttle up\./);
  assert.match(summarizeTrajectory({ software: 'Comanche055', vehicle: {} }), /Command Module/);
});

test('replay sampling steps the provider in order', () => {
  const calls = [];
  const fake = (kind, opts) => {
    assert.equal(kind, 'replay');
    let t = opts.startGET;
    return {
      get state() { return { alt: 1000 - (t - opts.startGET), range: 5000 - 10 * (t - opts.startGET) }; },
      step(dt, cmd, tNext) { calls.push(tNext); t = tNext; },
    };
  };
  const pts = sampleReplayPath(fake, {}, 100, 102, { dt: 0.5, transitions: [{ t: -Infinity, mode: 63 }, { t: 101, mode: 64 }] });
  assert.deepEqual(calls, [100.5, 101, 101.5, 102]);
  assert.equal(pts.length, 5);
  assert.deepEqual(pts.map((p) => p.m), [63, 63, 64, 64, 64]);
  assert.equal(pts[4].r, 4980);
});

// ---------------- instruments ----------------

test('tape scales', () => {
  assert.equal(altTapePos(0), 0);
  assert.equal(altTapePos(60000), 1);
  assert.equal(altTapePos(1e6), 1);
  let prev = -1;
  for (const v of [0, 5, 10, 100, 1000, 7129, 50000]) { assert.ok(altTapePos(v) > prev); prev = altTapePos(v); }
  assert.equal(rateTapePos(0), 0);
  assert.ok(Math.abs(rateTapePos(-50) + rateTapePos(50)) < 1e-12);
  assert.equal(rateTapePos(-1000), -1);
  assert.ok(rateTapePos(-3) < 0 && rateTapePos(-3) > -0.2);
  const at = altTapeTicks();
  assert.ok(at.majors.every((t, i, a) => i === 0 || t.y < a[i - 1].y), 'higher altitude is higher up');
  const rt = rateTapeTicks();
  assert.equal(rt.majors.find((t) => t.v === 0).y, rt.mid);
});

test('instrument formatting', () => {
  assert.equal(fmtNum(-2900), '−2,900');
  assert.equal(fmtNum(5559.7, 1), '5,559.7');
  assert.equal(fmtNum(-0.04, 1), '0.0');
  assert.equal(fmtSigned(4.5, 1), '+4.5');
  assert.equal(fmtSigned(-125), '−125');
  assert.equal(fmtSigned(0), '0');
  assert.deepEqual(formatRangeShort(3 * NMI), { v: '18,228', u: 'ft' });
  assert.deepEqual(formatRangeShort(120.4 * NMI), { v: '120', u: 'nmi' });
  assert.deepEqual(formatRangeShort(41.8 * NMI), { v: '41.8', u: 'nmi' });
  assert.equal(pct(0.925), '93%');
  assert.equal(pct(null), '—');
  assert.equal(pgnsModeLabel('attHold'), 'ATT HOLD');
  assert.equal(pgnsModeLabel('auto'), 'AUTO');
  assert.equal(pick({ A: 'x', B: 3 }, ['A', 'B']), 3);
  assert.equal(pick(null, ['A']), null);
  assert.equal(orbitText({ apo: 169.7 * NMI, peri: 60.0 * NMI }), '169.7 × 60.0');
  assert.equal(orbitText({ apo: null, peri: 61.5 * NMI }), 'hyperbolic · peri 61.5');
});

test('propellant marks and the Bingo count', () => {
  assert.equal(LOW_LEVEL_FRAC, 0.056);
  assert.ok(Math.abs(BINGO_FRAC - 0.0097) < 0.0002);   // 5.6 % × 20/116
  assert.equal(bingoRemaining(null, 10), null);
  const ll = parseGET('102:44:28');
  assert.equal(bingoRemaining(ll, ll - 1), null);
  assert.equal(bingoRemaining(ll, parseGET('102:45:02')), 60);   // Duke: "60 seconds"
  assert.equal(bingoRemaining(ll, parseGET('102:45:31')), 31);   // Duke: "30 seconds"
  assert.ok(THROTTLE_MIN < THROTTLE_FTP);
});

test('TIG countdown text', () => {
  const tig = parseGET('102:33:05');
  assert.equal(tigCountdown({ tig, phase: 'avg-g' }, tig - 35), 'TIG −00:35 · Average-G running');
  assert.equal(tigCountdown({ tig, phase: 'trim' }, tig + 12), 'TIG +00:12 · trim (minimum thrust)');
  assert.equal(tigCountdown({ tig, phase: 'done' }, tig + 100), null);
  assert.equal(tigCountdown(null, 0), null);
});

// ---------------- crew ----------------

test('crew view model', () => {
  assert.equal(crewModel(null, 'demo').visible, 'none');
  assert.equal(crewModel({ software: 'Comanche055' }, 'interactive').visible, 'cm');
  const snap = {
    software: 'Luminary099',
    vehicle: { engineOn: true },
    agc: { mode: 66, crew: { rodRate: -3 * FPS, pgnsMode: 'attHold', rrFault: true, lpdClicks: { dx: 1, dy: -2 } }, guidance: { lpd: { angle: 47.2, time: 30 } } },
  };
  const m = crewModel(snap, 'demo');
  assert.equal(m.visible, 'lm');
  assert.equal(m.readOnly, true);
  assert.ok(Math.abs(m.rodFps + 3) < 1e-9);
  assert.equal(m.pgnsMode, 'attHold');
  assert.equal(m.rrFault, true);
  assert.deepEqual(m.lpd, { dx: 1, dy: -2, angle: 47.2, time: 30 });
  assert.equal(crewModel(snap, 'interactive').readOnly, false);
  const empty = crewModel({ software: 'Luminary099', agc: {} }, 'interactive');
  assert.equal(empty.rodFps, null);
  assert.equal(empty.pgnsMode, null);
  assert.deepEqual(empty.lpd, { dx: 0, dy: 0, angle: null, time: null });
  assert.equal(rodRateFps(undefined), null);
  assert.equal(fmtRate(-3), '−3.0');
  assert.equal(fmtRate(1.04), '+1.0');
  assert.equal(fmtRate(null), '—');
  assert.match(crewHint({ ...m, mode: 64, pgnsMode: 'attHold' }), /ROD click switches to P66/);
  assert.match(crewHint({ ...m, mode: 64, pgnsMode: 'auto' }), /LPD clicks redesignate/);
  assert.match(crewHint({ ...m, landed: true }), /surface/);
  // LPD steps match AZEACH / ELEACH in the listing.
  const src = lines('Luminary099/LUNAR_LANDING_GUIDANCE_EQUATIONS.agc');
  assert.match(src[1211 - 1], /^AZEACH\s+DEC\s+\.03491\s+# 2 DEGREES/);
  assert.match(src[1212 - 1], /^ELEACH\s+DEC\s+\.00873\s+# 1\/2 DEGREE/);
  assert.equal(LPD_AZ_STEP_DEG, 2);
  assert.equal(LPD_EL_STEP_DEG, 0.5);
});

// ---------------- ignition ----------------

test('piecewise timeline scale', () => {
  const s = makePiecewiseScale([-60, 30, 400], [0, 0.62, 1]);
  assert.equal(s(-60), 0);
  assert.equal(s(30), 0.62);
  assert.equal(s(400), 1);
  assert.equal(s(-100), 0);
  assert.equal(s(1000), 1);
  for (const v of [-45, 0, 12.5, 200]) assert.ok(Math.abs(s.invert(s(v)) - v) < 1e-9);
  const p63 = timelineScale([{ rel: -35 }, { rel: 26 }], ignitionSchedule(63, 'Luminary099'));
  assert.deepEqual(p63.domain, [-60, 40]);   // TIG−60 … TIG+40 for P63
  assert.equal(p63(-10), 0.5);
  const loi = timelineScale([{ rel: 0 }, { rel: 357.53 }]);
  assert.equal(loi.domain.length, 3);
  assert.equal(loi(30), 0.62);
  const tailLabels = timelineTicks(loi).filter((t) => t.v > 30);
  assert.ok(tailLabels.length >= 2 && tailLabels.length <= 3, JSON.stringify(tailLabels));
  const linTicks = timelineTicks(p63);
  assert.ok(linTicks.some((t) => t.v === 0 && t.major));
  assert.equal(linTicks.length, 21);
});

test('relative-time labels and marker rows', () => {
  assert.equal(fmtRel(-35), '−35');
  assert.equal(fmtRel(-7.5), '−7.5');
  assert.equal(fmtRel(0), 'TIG');
  assert.equal(fmtRel(26), '+26');
  assert.equal(fmtRel(357.53), '+5:57');
  const xs = [0.25, 0.301, 0.525, 0.55, 0.6, 0.605, 0.86];
  const rows = assignRows(xs, 0.075);
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < i; j++) {
      if (rows[i] === rows[j]) assert.ok(xs[i] - xs[j] >= 0.075, `${i}/${j}`);
    }
  }
});

test('P63 ignition schedule follows BURNBABY', () => {
  const s = ignitionSchedule(63, 'Luminary099');
  const dsky = s.lanes.find((l) => l.id === 'dsky').segments;
  assert.deepEqual(dsky.find((x) => x.kind === 'blank'), { from: -35, to: -30, text: 'blank', kind: 'blank' });
  assert.deepEqual(dsky.find((x) => x.kind === 'flash'), { from: -5, to: 0, text: 'V99N62 — PRO?', kind: 'flash' });
  assert.equal(dsky[dsky.length - 1].text, 'V06N63');
  const rcs = s.lanes.find((l) => l.id === 'rcs').segments[0];
  assert.equal(rcs.from, -7.5);   // DEC 2240 cs after TIG−29.9
  assert.equal(rcs.to, 0.5);      // ULLAGOFF 50 cs after ignition
  assert.deepEqual(s.throttle.map((x) => [x.from, x.level]), [[-Infinity, 0], [0, 0.1], [26, 0.93]]);
  assert.match(s.sequence, /V99N62 flashing at TIG−5/);
  // P42 ullage at TIG−3.5 (DEC 2640); P12 none.
  assert.equal(ignitionSchedule(42, 'Luminary099').lanes.find((l) => l.id === 'rcs').segments[0].from, -3.5);
  assert.equal(ignitionSchedule(12, 'Luminary099').lanes.find((l) => l.id === 'rcs'), undefined);
  // CM: SPS at fixed thrust until cutoff, V99N40.
  const cm = ignitionSchedule(40, 'Comanche055', { cutoffRel: 357.53 });
  assert.equal(cm.throttleLabel, 'SPS');
  assert.ok(cm.lanes[0].segments.some((x) => x.text.startsWith('V99N40')));
  assert.deepEqual(cm.throttle[1], { from: 0, to: 357.53, level: 1 });
  assert.match(burnTitle(40, 'Comanche055'), /SPS/);
  assert.match(phaseText('burning', 'Comanche055')[1], /not throttleable/);
  assert.match(phaseText('trim', 'Luminary099')[1], /26 s/);
});

test('the P63TABLE shown in the view matches the listing', () => {
  const src = lines('Luminary099/BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc');
  const table = src.slice(127 - 1, 140).join('\n');
  assert.match(src[127 - 1], /^P63TABLE\s+VN\s+0662\s+# \(0\)/);
  for (const [off, entry] of P63TABLE_ROWS) {
    const [op, arg] = entry.split(' ');
    const re = new RegExp(`${op}\\s+${arg}\\s+# \\${off.slice(0, -1)}\\)`);
    assert.match(table, re, `${off} ${entry}`);
  }
});

test('anchor fallback and DSKY wording', () => {
  const known = new Set(['burn.which']);
  assert.equal(resolveAnchor([...TABLE_ANCHOR_CANDIDATES], (id) => known.has(id)), 'burn.which');
  assert.equal(resolveAnchor(['nope'], () => null), null);
  assert.equal(resolveAnchor(['burn.tables', 'burn.which'], null), 'burn.tables');
  assert.equal(dskyNow({ blanked: true }), 'blank');
  assert.equal(dskyNow({ verb: '99', noun: '62', flashVerbNoun: true }), 'V99 N62 flashing');
  assert.equal(dskyNow(null), '—');
});
