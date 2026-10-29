// Vehicle providers and the Apollo 11 descent track (brief E).
// Run: cd /home/user/apollo-11 && node --test simulator/test/vehicle.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseGET, formatGET } from '../js/util/time.js';
import { createRng } from '../js/util/rng.js';
import { FT, FPS, LB, toFt, toFps } from '../js/util/units.js';
import {
  createVehicle, ReplayVehicle, LmPhysics, StaticVehicle, stateFromTrack, createTrackModel, VEHICLE_KINDS,
} from '../js/vehicle/index.js';
import { engineSetting } from '../js/vehicle/lm-physics.js';
import { LandingRadar } from '../js/vehicle/landing-radar.js';
import { DPS, LM, LR, THROTTLE_LOGIC } from '../js/vehicle/constants.js';
import { TRACKS, getTrack } from '../js/data/tracks.js';
import {
  APOLLO11_DESCENT, KEYFRAMES, MILESTONES, milestones, CALLOUTS, SOURCE_NOTES, RANGE_ANCHORS, SITES,
} from '../js/data/apollo11-descent.js';

const TRACK = APOLLO11_DESCENT;
const g = parseGET;

function replayAt(get, { rng = createRng(1969).fork('vehicle') } = {}) {
  const v = new ReplayVehicle({ track: TRACK, rng, startGET: get });
  return v.state;
}

// ---------- the data ----------

test('track registry and shape', () => {
  assert.equal(TRACKS.apollo11Descent, TRACK);
  assert.equal(getTrack('apollo11Descent'), TRACK);
  assert.throws(() => getTrack('nope'));
  assert.equal(TRACK.id, 'apollo11Descent');
  assert.equal(TRACK.pdiGET, g('102:33:05.01'));
  assert.equal(TRACK.touchdownGET, g('102:45:39.9'));
  assert.ok(KEYFRAMES.length > 100);
  assert.ok(TRACK.startGET <= g('102:10:30'), 'track starts in the descent-orbit coast');
  assert.ok(TRACK.endGET >= g('102:48:00'), 'track continues after landing');
});

test('keyframes: strictly increasing GET, finite fields, documented sources', () => {
  let prev = -Infinity;
  for (const k of KEYFRAMES) {
    const t = g(k.t);
    assert.ok(t > prev, `${k.t} after previous`);
    prev = t;
    for (const f of ['alt', 'altRate', 'vHoriz', 'range', 'throttle', 'fuel', 'mass', 'pitch']) {
      assert.ok(Number.isFinite(k[f]), `${k.t} ${f}`);
    }
    assert.ok(k.source in SOURCE_NOTES, `${k.t} source "${k.source}" is documented`);
    assert.ok(k.alt >= 0 && k.throttle >= 0 && k.throttle <= 100 && k.fuel > 0 && k.fuel <= 100);
  }
});

test('milestones: ordered, unique ids, { t, id, label, source }', () => {
  assert.equal(milestones, MILESTONES);
  const ids = new Set();
  let prev = -Infinity;
  for (const m of MILESTONES) {
    assert.ok(typeof m.t === 'string' && m.label && m.source && m.kind);
    assert.equal(m.get, g(m.t));
    assert.ok(m.get >= prev, `${m.id} in order`);
    prev = m.get;
    assert.ok(!ids.has(m.id), `unique ${m.id}`);
    ids.add(m.id);
  }
  for (const id of ['pdi', 'throttle-up', 'lr-data-good', 'throttle-down', 'p64', 'p66', 'low-level', 'touchdown',
    'alarm-1202-1', 'alarm-1202-2', 'alarm-1201', 'alarm-1202-3', 'alarm-1202-4']) {
    assert.ok(ids.has(id), `milestone ${id}`);
  }
  const at = (id) => MILESTONES.find((m) => m.id === id).t;
  // Mission Report Table 5-I / 9.6-V times (research/web-trajectory-b.md §3).
  assert.equal(at('pdi'), '102:33:05.01');
  assert.equal(at('lr-data-good'), '102:37:51');
  assert.equal(at('throttle-down'), '102:39:31');
  assert.equal(at('p64'), '102:41:32');
  assert.equal(at('p66'), '102:43:22');
  assert.equal(at('low-level'), '102:44:28');
  assert.equal(at('touchdown'), '102:45:39.9');
});

// ---------- the replay ----------

test('replay: GET advances monotonically and the commands are ignored', () => {
  const a = new ReplayVehicle({ track: TRACK, startGET: '102:33:00' });
  const b = new ReplayVehicle({ track: TRACK, startGET: '102:33:00' });
  let prev = a.state.t;
  for (let i = 0; i < 2000; i++) {
    a.step(0.01, { throttle: 1, engineOn: false, thrustDir: [0, 0, 1] });
    b.step(0.01, {});
    assert.ok(a.state.t > prev);
    prev = a.state.t;
  }
  assert.equal(a.state.alt, b.state.alt);
  assert.equal(a.state.throttle, b.state.throttle);
  // The third argument (the Simulation's GET) wins over accumulated dt.
  a.step(0.01, {}, g('102:40:00'));
  assert.equal(a.state.t, g('102:40:00'));
});

test('replay: state shape (ARCHITECTURE §8) in SI', () => {
  const s = replayAt('102:38:30');
  for (const f of ['t', 'alt', 'altRate', 'vHoriz', 'vCross', 'range', 'downrange', 'mass', 'thrust', 'throttle', 'fuelFrac', 'pitch', 'yaw']) {
    assert.ok(Number.isFinite(s[f]), f);
  }
  for (const f of ['engineOn', 'ullage', 'landed', 'contact']) assert.equal(typeof s[f], 'boolean', f);
  assert.deepEqual(Object.keys(s.lr).sort(), ['alt', 'altRate', 'altValid', 'vHoriz', 'velValid']);
  assert.ok(Math.abs(toFt(s.alt) - 30400) < 300, 'altitude in metres');
  assert.ok(s.throttle > 0.9 && s.throttle < 0.95, 'throttle is a 0..1 fraction (FTP ≈ 93 %)');
});

test('replay: PDI, throttle-up, throttle-down, high gate and the radar (Mission Report)', () => {
  const pdi = replayAt('102:33:05.01');
  assert.ok(Math.abs(toFt(pdi.alt) - 49376) < 1, 'BET 49,376 ft');
  assert.ok(Math.abs(toFt(pdi.altRate) + 2.2) < 0.1);
  assert.ok(Math.abs(toFps(pdi.vInertial) - 5559.7) < 2, '5,559.7 ft/s inertial');
  assert.ok(pdi.engineOn && Math.abs(pdi.throttle - 0.10) < 1e-9, 'ignition at 10 %');
  assert.ok(!replayAt('102:33:04').engineOn);
  assert.ok(replayAt('102:33:00').ullage && !replayAt('102:33:06').ullage, 'ullage 102:32:58 → TIG+0.5');
  assert.ok(Math.abs(replayAt('102:33:29').throttle - 0.10) < 1e-9, 'trim period at minimum');
  assert.ok(Math.abs(replayAt('102:33:35').throttle - DPS.ftpFraction) < 0.005, 'FTP after 26 s');
  assert.ok(replayAt('102:39:30').throttle > 0.9, 'still at FTP before throttle recovery');
  assert.ok(Math.abs(replayAt('102:39:40').throttle - 0.58) < 0.005, 'throttled down after 102:39:31');
  const hg = replayAt('102:41:32');
  assert.ok(Math.abs(toFt(hg.alt) - 7129) < 50, `P64 at 7,129 ft (got ${toFt(hg.alt).toFixed(0)})`);
  assert.ok(Math.abs(toFps(hg.altRate) + 125) < 5, `P64 at −125 ft/s (got ${toFps(hg.altRate).toFixed(1)})`);
  assert.ok(Math.abs(hg.pitch - 55) < 6, 'pitch ≈ 55° at high gate (BEN72)');
  assert.ok(!replayAt('102:37:50').lr.altValid && replayAt('102:37:52').lr.altValid, 'LR data good at 102:37:51');
  assert.ok(!replayAt('102:44:15').lr.altValid && replayAt('102:44:25').lr.altValid, 'dropout 102:44:11–21');
  assert.ok(replayAt('102:36:40').yaw === 0 && replayAt('102:38:10').yaw === 180, 'face-up yaw 102:36:46–102:37:59');
});

test('replay: values at the quoted crew callouts', (t) => {
  const rows = [];
  for (const c of CALLOUTS) {
    if (!c.check) continue;
    const s = replayAt(c.get);
    const alt = toFt(s.alt);
    const rate = toFps(s.altRate);
    const vh = toFps(s.vHoriz);
    rows.push(`${c.t}  ${c.quote.padEnd(44)}  alt ${alt.toFixed(0).padStart(5)}  rate ${rate.toFixed(1).padStart(6)}  fwd ${vh.toFixed(1).padStart(6)}`);
    // Callout timing is ±2 s around the display (research §9): allow 2.5 s of
    // the descent rate, at least 25 ft, plus 3 % of the value.
    const r = Math.abs(c.altRate ?? rate);
    if (c.alt !== null) {
      const tol = Math.max(25, 2.5 * r + 0.03 * c.alt);
      assert.ok(Math.abs(alt - c.alt) <= tol, `${c.t} "${c.quote}": alt ${alt.toFixed(0)} vs ${c.alt} (±${tol.toFixed(0)})`);
    }
    if (c.altRate !== null) {
      const tol = Math.max(2.5, 0.1 * Math.abs(c.altRate));
      assert.ok(Math.abs(rate - c.altRate) <= tol, `${c.t}: rate ${rate.toFixed(1)} vs ${c.altRate}`);
    }
    if (c.vHoriz !== null) {
      assert.ok(Math.abs(vh - c.vHoriz) <= 1.5, `${c.t}: forward ${vh.toFixed(1)} vs ${c.vHoriz}`);
    }
  }
  t.diagnostic('replay at the crew callouts (DSKY ft, ft/s):');
  for (const row of rows) t.diagnostic(row);
});

test('replay: touchdown at 102:45:39.9 with alt ≈ 0, then on the surface', () => {
  const td = replayAt('102:45:39.9');
  assert.ok(td.contact, 'contact light at 102:45:39.9 (MR §5.4)');
  assert.ok(toFt(td.alt) <= LM.probeLength / FT + 0.1, 'the probes (5.6 ft) touch');
  assert.ok(Math.abs(toFps(td.altRate) + 1.7) < 0.2, '1.7 ft/s down');
  assert.ok(toFps(td.vHoriz) < 0.5, 'negligible forward velocity');
  assert.ok(td.engineOn && !td.landed);
  const before = replayAt('102:45:39.5');
  assert.ok(!before.contact);
  const off = replayAt('102:45:41.5');
  assert.ok(!off.engineOn, 'engine cutoff 102:45:41.4');
  const down = replayAt('102:45:43');
  assert.ok(down.landed && down.alt === 0 && down.altRate === 0 && down.vHoriz === 0);
  assert.ok(down.touchdown && down.touchdown.t === g('102:45:39.9'));
  const later = replayAt('102:49:00');
  assert.ok(later.landed && later.throttle === 0);
  assert.ok(Math.abs(later.mass - LM.massAtLanding) < 10, 'MR landed mass 7,327 kg');
  assert.ok(Math.abs(later.fuelFrac * LM.dpsLoaded - LM.dpsAtCutoff) < 2 * LB, '770 lb left at cutoff');
});

test('replay: altitude falls monotonically and altRate is its derivative', () => {
  let prev = Infinity;
  let worst = 0;
  for (let t = TRACK.startGET; t <= TRACK.footpadsGET; t += 0.5) {
    const s = replayAt(t);
    assert.ok(s.alt <= prev + 0.05 * FT, `alt rises at ${formatGET(t, { tenths: true })}`);
    prev = s.alt;
    const a = replayAt(t - 0.05).alt;
    const b = replayAt(t + 0.05).alt;
    if (t > TRACK.startGET + 1 && t < TRACK.footpadsGET - 0.2) worst = Math.max(worst, Math.abs((b - a) / 0.1 - s.altRate));
  }
  assert.ok(worst < 0.05 * FPS, `altRate vs d(alt)/dt: ${toFps(worst).toFixed(3)} ft/s`);
});

test('replay: range to the aim point matches the quoted anchors', () => {
  for (const a of RANGE_ANCHORS) {
    const r = toFt(replayAt(a.t).range);
    assert.ok(Math.abs(r - a.range) <= a.tol, `${a.t}: ${r.toFixed(0)} ft vs ${a.range.toFixed(0)} ± ${a.tol.toFixed(0)} (${a.source})`);
  }
  assert.equal(SITES.landed.range, -1100);
  // Range shrinks over the whole flight up to the landing site.
  let prev = Infinity;
  for (let t = TRACK.startGET; t <= TRACK.footpadsGET; t += 1) {
    const r = replayAt(t).range;
    assert.ok(r < prev + 0.5, `range grows at ${formatGET(t)}`);
    prev = r;
  }
});

test('replay: fuel and mass decrease; low-level light at 102:44:28', () => {
  let pf = Infinity;
  let pm = Infinity;
  for (let t = TRACK.pdiGET; t <= TRACK.engineOffGET; t += 2) {
    const s = replayAt(t);
    assert.ok(s.fuelFrac <= pf + 1e-9 && s.mass <= pm + 1e-6);
    pf = s.fuelFrac;
    pm = s.mass;
  }
  assert.ok(!replayAt('102:44:27').lowLevel && replayAt('102:44:29').lowLevel);
  assert.ok(Math.abs(replayAt('102:33:05.01').mass - LM.massAtPdi) < 1);
});

test('replay: deterministic with the seed (radar noise)', () => {
  const run = (seed) => {
    const v = new ReplayVehicle({ track: TRACK, rng: createRng(seed).fork('vehicle'), startGET: '102:40:00' });
    const out = [];
    for (let i = 0; i < 500; i++) {
      v.step(0.01, {});
      out.push(v.state.lr.alt);
    }
    return out;
  };
  assert.deepEqual(run(7), run(7));
  assert.notDeepEqual(run(7), run(8));
  const s = replayAt('102:40:00');
  assert.ok(Math.abs(s.lr.alt - s.alt) < 0.01 * s.alt, 'radar ≈ truth');
});

// ---------- physics ----------

test('createVehicle kinds', () => {
  assert.deepEqual(VEHICLE_KINDS, ['static', 'replay', 'physics', 'cmSps']);
  assert.ok(createVehicle('static', {}) instanceof StaticVehicle);
  assert.ok(createVehicle('replay', { track: TRACK, startGET: '102:35:00' }) instanceof ReplayVehicle);
  assert.ok(createVehicle('physics', { startGET: '102:35:00' }) instanceof LmPhysics);
  const cm = createVehicle('cmSps', { startGET: '075:40:00' });
  assert.ok(cm && typeof cm.step === 'function' && cm.state);
  assert.throws(() => createVehicle('rocket'));
  assert.throws(() => createVehicle('replay', {}), /track/);
  // As sim.js builds it: track null for a physics preset falls back to Apollo 11.
  const p = createVehicle('physics', { track: null, rng: createRng(1).fork('vehicle'), startGET: g('102:41:32') });
  assert.ok(Math.abs(toFt(p.state.alt) - 7129) < 50);
});

test('static vehicle: parked, zero rates', () => {
  const v = createVehicle('static', { startGET: 100 });
  v.step(1, { engineOn: true, throttle: 1 });
  assert.equal(v.state.t, 101);
  assert.equal(v.state.alt, 0);
  assert.equal(v.state.altRate, 0);
  assert.equal(v.state.thrust, 0);
  assert.equal(v.state.engineOn, false);
  assert.equal(v.state.landed, true);
});

test('stateFromTrack: SI initial states consistent with the replay', () => {
  for (const get of ['102:33:05.01', '102:41:32', '102:43:22']) {
    const st = stateFromTrack(TRACK, get);
    const r = replayAt(get);
    assert.equal(st.t, g(get));
    assert.ok(Math.abs(st.alt - r.alt) < 1e-6 && Math.abs(st.range - r.range) < 1e-6);
    assert.ok(Math.abs(st.propellant - r.fuelFrac * LM.dpsLoaded) < 1e-6);
    const p = new LmPhysics({ startGET: get, track: TRACK });
    assert.ok(Math.abs(p.state.alt - r.alt) < 1e-6);
    assert.ok(Math.abs(p.state.vHoriz - r.vHoriz) < 1e-6);
    assert.ok(Math.abs(p.state.range - r.range) < 1e-3);
    assert.ok(Math.abs(p.state.pitch - r.pitch) < 1e-9);
  }
  // Overrides.
  const p = new LmPhysics({ startGET: '102:41:32', initialState: { alt: 1000, fuelFrac: 0.5 } });
  assert.equal(p.state.alt, 1000);
  assert.ok(Math.abs(p.state.fuelFrac - 0.5) < 1e-9);
});

test('physics: the descent-orbit coast arrives at the historical PDI state', () => {
  const v = new LmPhysics({ rng: createRng(1).fork('vehicle'), startGET: '102:28:00' });
  const pdi = TRACK.pdiGET;
  let t = v.t;
  while (t < pdi - 1e-9) {
    const dt = Math.min(0.01, pdi - t);
    v.step(dt, { engineOn: false }, t + dt);
    t += dt;
  }
  const tr = replayAt(pdi);
  assert.ok(Math.abs(toFt(v.state.alt - tr.alt)) < 10, `alt ${toFt(v.state.alt - tr.alt).toFixed(2)} ft`);
  assert.ok(Math.abs(toFps(v.state.altRate - tr.altRate)) < 0.2);
  assert.ok(Math.abs(toFps(v.state.vHoriz - tr.vHoriz)) < 0.2);
  assert.ok(Math.abs(toFt(v.state.range - tr.range)) < 100);
  assert.ok(!v.state.engineOn && v.state.thrust === 0 && v.state.mass === tr.mass);
});

test('physics: throttle behaviour (10 % minimum, throttleable band, fixed throttle position)', () => {
  assert.equal(engineSetting(0), DPS.minFraction);
  assert.equal(engineSetting(0.05), DPS.minFraction);
  assert.equal(engineSetting(0.4), 0.4);
  assert.equal(engineSetting(0.65), 0.65);
  assert.equal(engineSetting(0.8), DPS.ftpFraction, 'the 65–92.5 % region snaps to the stop');
  assert.equal(engineSetting(1.2), DPS.ftpFraction);
  assert.ok(Math.abs(DPS.ftpThrust - THROTTLE_LOGIC.fMaxPos) < 1e-6, 'physics FTP = LGC FMAXPOS');
  assert.ok(Math.abs(DPS.isp - 301.4) < 0.1, 'Isp from DPSVEX');

  const v = new LmPhysics({ startGET: '102:33:00' });     // coasting, engine off
  const m0 = v.state.mass;
  for (let i = 0; i < 300; i++) v.step(0.01, { engineOn: true, throttle: 0.4 });
  assert.ok(Math.abs(v.state.throttle - 0.4) < 0.002, `throttle follows within the lag (${v.state.throttle})`);
  const f = v.state.thrust;
  const m1 = v.state.mass;
  v.step(0.01, { engineOn: true, throttle: 0.4 });
  const mdot = (m1 - v.state.mass) / 0.01;
  assert.ok(Math.abs(mdot - f / DPS.exhaustVelocity) / mdot < 0.01, 'mass flow = F / ve');
  assert.ok(m0 > m1);
  // Rate limit: from 40 % to the stop takes more than one second at FRATE.
  v.step(0.01, { engineOn: true, throttle: 1 });
  for (let i = 0; i < 50; i++) v.step(0.01, { engineOn: true, throttle: 1 });
  assert.ok(v.state.throttle < DPS.ftpFraction - 0.05, 'slews at FRATE');
  for (let i = 0; i < 300; i++) v.step(0.01, { engineOn: true, throttle: 1 });
  assert.ok(Math.abs(v.state.throttle - DPS.ftpFraction) < 0.002);
  // Engine off.
  for (let i = 0; i < 300; i++) v.step(0.01, { engineOn: false, throttle: 1 });
  assert.equal(v.state.thrust, 0);
  assert.equal(v.state.engineOn, false);
});

test('physics: propellant depletion stops the engine', () => {
  const v = new LmPhysics({ startGET: '102:45:00', initialState: { propellant: LM.dpsUnusable + 5 } });
  for (let i = 0; i < 300; i++) v.step(0.01, { engineOn: true, throttle: 0.3 });
  assert.ok(v.state.depleted);
  assert.equal(v.state.engineOn, false);
  assert.ok(v.state.propellant >= LM.dpsUnusable - 1);
});

test('physics: attitude follows the commanded thrust direction at a limited rate', () => {
  const v = new LmPhysics({ startGET: '102:41:32' });
  const p0 = v.state.pitch;
  // Thrust straight up through the site: pitch → −phi (local vertical vs site vertical).
  for (let i = 0; i < 100; i++) v.step(0.01, { engineOn: true, throttle: 0.5, thrustDir: [1, 0, 0] });
  assert.ok(Math.abs((p0 - v.state.pitch) - 10) < 0.2, `10°/s limit (moved ${(p0 - v.state.pitch).toFixed(2)}°)`);
  for (let i = 0; i < 1000; i++) v.step(0.01, { engineOn: true, throttle: 0.5, thrustDir: [1, 0, 0] });
  assert.ok(Math.abs(v.state.pitch + (v.state.phi * 180) / Math.PI) < 0.05);
  // Without a direction the attitude is held; a pitch command is honoured.
  const held = v.state.pitch;
  for (let i = 0; i < 50; i++) v.step(0.01, { engineOn: true, throttle: 0.5 });
  assert.equal(v.state.pitch, held);
  for (let i = 0; i < 200; i++) v.step(0.01, { engineOn: true, throttle: 0.5, pitch: 12 });
  assert.ok(Math.abs(v.state.pitch - 12) < 1e-9);
});

test('physics: automatic yaw to windows-up after ignition', () => {
  const v = new LmPhysics({ startGET: '102:33:00' });
  assert.equal(v.state.yaw, 0);
  let t = v.t;
  for (let i = 0; i < 100 * 220; i++) { v.step(0.01, { engineOn: true, throttle: 0.1 }, t + 0.01); t += 0.01; }
  assert.equal(v.state.yaw, 180);
  const w = new LmPhysics({ startGET: '102:33:00', autoYaw: false });
  for (let i = 0; i < 100 * 220; i++) w.step(0.01, { engineOn: true, throttle: 0.1 });
  assert.equal(w.state.yaw, 0);
});

test('physics: contact probes and touchdown evaluation', () => {
  const drop = (alt, altRate, vHoriz, pitch = 0) => {
    const v = new LmPhysics({ startGET: '102:45:30', initialState: { alt, altRate, vHoriz, pitch, yaw: 180 } });
    let contactAlt = null;
    for (let i = 0; i < 5000 && !v.state.landed; i++) {
      v.step(0.01, { engineOn: false });
      if (v.state.contact && contactAlt === null) contactAlt = v.state.alt;
    }
    return { v, contactAlt };
  };
  const soft = drop(1 * FT, -1 * FPS, 0);
  assert.ok(soft.v.state.landed && soft.v.state.touchdown.verdict === 'safe');
  assert.equal(soft.v.state.alt, 0);
  assert.equal(soft.v.state.altRate, 0);
  const probe = drop(30 * FT, -2 * FPS, 0);
  assert.ok(probe.contactAlt <= LM.probeLength && probe.contactAlt > LM.probeLength - 0.1, 'contact light at 5.6 ft');
  assert.equal(drop(1 * FT, -1 * FPS, 8 * FPS).v.state.touchdown.verdict, 'hard', 'drifting sideways');
  assert.equal(drop(1 * FT, -1 * FPS, 0, 20).v.state.touchdown.verdict, 'hard', 'tilted');
  assert.equal(drop(200 * FT, -20 * FPS, 0).v.state.touchdown.verdict, 'crash');
  // After landing it stays put.
  const v = soft.v;
  const r = v.state.range;
  for (let i = 0; i < 100; i++) v.step(0.01, { engineOn: false });
  assert.ok(v.state.landed && Math.abs(v.state.range - r) < 1e-6);
});

test('physics: a redesignation (commands.lpd) moves the targeted site', () => {
  const v = new LmPhysics({ startGET: '102:42:30' });
  const r0 = v.state.range;
  v.step(0.01, { engineOn: true, throttle: 0.4, lpd: { downrange: 300, crossrange: 0 } });
  const v2 = new LmPhysics({ startGET: '102:42:30' });
  v2.step(0.01, { engineOn: true, throttle: 0.4 });
  assert.ok(Math.abs((v.state.range - v2.state.range) - 300) < 1e-6);
  assert.ok(r0 > 0);
});

// ---------- landing radar ----------

test('landing radar: acquisition altitude, windows-up, velocity, noise', () => {
  const rng = createRng(3).fork('lr');
  const lr = new LandingRadar({ rng });
  assert.ok(Math.abs(lr.acqAltitude - LR.altAcqNominal) <= 3 * LR.altAcqSigma + 1e-6);
  const truth = (altFt, yaw = 180, rate = -100, vh = 2000) => ({ alt: altFt * FT, altRate: rate * FPS, vHoriz: vh * FPS, yaw, landed: false });
  assert.equal(lr.update(truth(48000), 0.01).altValid, false);
  assert.equal(lr.update(truth(lr.acqAltitude / FT - 10, 0), 0.01).altValid, false, 'face down: no lock');
  let s = lr.update(truth(lr.acqAltitude / FT - 10), 0.01);
  assert.equal(s.altValid, true);
  assert.equal(s.velValid, false, 'velocity later');
  s = lr.update(truth(27000), 0.3);
  assert.equal(s.velValid, true);
  assert.ok(Math.abs(s.alt / FT - 27000) < 27000 * 0.01);
  // Nearly motionless: zero Doppler, velocity data lost.
  s = lr.update(truth(50, 180, 0, 0), 0.3);
  assert.equal(s.altValid, true);
  assert.equal(s.velValid, false);
  const a = new LandingRadar({ rng: createRng(9).fork('lr') });
  const b = new LandingRadar({ rng: createRng(9).fork('lr') });
  assert.equal(a.acqAltitude, b.acqAltitude);
  assert.equal(new LandingRadar({ acqAltitude: 37000 * FT }).acqAltitude, 37000 * FT);
});

test('track model is cached and validates its input', () => {
  assert.equal(createTrackModel(TRACK), createTrackModel(TRACK));
  assert.throws(() => createTrackModel({ keyframes: [] }));
  assert.throws(() => createTrackModel({ keyframes: [KEYFRAMES[1], KEYFRAMES[0]] }));
});
