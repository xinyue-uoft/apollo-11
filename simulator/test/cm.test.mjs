// Command Module (Comanche 055) chapter: P40 SPS burn sequence, the
// CmSpsVehicle model and the CM presets. Most tests drive P40 + the vehicle
// with a small stand-in `agc` (the documented surface only), so they do not
// depend on the Agc composition root; the last tests use the real
// Simulation when the rest of the computer model is present.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/util/rng.js';
import { createBus } from '../js/util/bus.js';
import { parseGET } from '../js/util/time.js';
import { FT, NMI, LB, MOON_RADIUS } from '../js/util/units.js';
import {
  CmSpsVehicle, LOI1, LOI1_SPS, hyperbolaState, CM_PIPA_PULSE,
} from '../js/vehicle/cm-sps.js';
import P40, { LOI1_PAD, loadExternalDeltaV, PAD_LOADS } from '../js/agc/programs/cm/p40.js';
import P00 from '../js/agc/programs/cm/p00.js';
import { PROGRAMS_COMANCHE055 } from '../js/agc/programs/cm/index.js';
import { s40_1, lvlhToInertial, coast, vnorm } from '../js/agc/programs/cm/csm-math.js';
import { getVector } from '../js/agc/programs/cm/cm-common.js';
import { PRESETS_CM, setupLoi1, setupEntry } from '../js/data/presets-cm.js';
import { ENTRY } from '../js/vehicle/cm-sps.js';
import { ENTRY_PAD, ENTRY_CONSTANTS, loadEntryPad as loadEntryPadFn } from '../js/agc/programs/cm/entry.js';
import { ANCHORS as CM_ANCHORS } from '../js/data/anchors/cm.js';

const TIG = parseGET(LOI1_PAD.tig);
const DT = 0.01;

// ---------- a stand-in agc with the documented surface ----------

function makeRig({ start = TIG - 180, stage = 'countdown', autoPro = null } = {}) {
  const vehicle = new CmSpsVehicle({ startGET: start, rng: createRng(1969).fork('vehicle'), initial: 'loi1' });
  const log = { displays: [], blanks: [], phases: [], alarms: [], burn: [], protects: [] };
  const agc = {
    software: 'Comanche055',
    t: start,
    vehicle,
    erasable: {},
    flags: {},
    bus: createBus(),
    current: null,
    pinball: {
      showDisplay(o) {
        agc.current = o;
        const last = log.displays.at(-1);
        if (!last || last.verb !== o.verb || last.noun !== o.noun || last.flash !== !!o.flash) {
          log.displays.push({ t: agc.t, verb: o.verb, noun: o.noun, flash: !!o.flash });
        }
      },
      blankFor(s) {
        log.blanks.push({ t: agc.t, s });
        log.displays.push({ t: agc.t, verb: null, noun: null, flash: false });
      },
    },
    workload: { setPhase(p) { log.phases.push({ t: agc.t, p }); } },
    restart: {
      protect(group, phase, reenter, meta) { log.protects.push({ t: agc.t, group, phase, reenter, meta }); },
      clear() {},
      clearIfOwner() {},
    },
    alarm(code) { log.alarms.push({ t: agc.t, code }); },
  };
  agc.bus.on('burn', (e) => log.burn.push(e));
  loadExternalDeltaV(agc);
  const p40 = new P40(agc);
  agc.program = p40;
  p40.enter();
  if (stage) {
    vehicle.setAttitude(p40.ut);
    if (stage !== 'r60') p40.skipTo(stage);
  }
  const rig = {
    agc, p40, vehicle, log, t: start, autoProDone: false,
    // advance to GET `until`, pressing PRO on V99 at `autoPro` (rel. TIG)
    runTo(until, hook = null) {
      while (rig.t < until - 1e-9) {
        rig.t = Math.round((rig.t + DT) * 100) / 100;
        vehicle.step(DT, agc.program.vehicleCommands(), rig.t);
        agc.t = rig.t;
        agc.program.step(rig.t, DT);
        if (autoPro !== null && !rig.autoProDone && agc.current?.verb === 99 && agc.current.flash && rig.t >= TIG + autoPro) {
          rig.autoProDone = true;
          rig.key('proceed');
        }
        if (hook) hook(rig);
      }
    },
    key(kind) {
      const d = agc.current;
      if (!d || !d.flash) return false;
      if (kind === 'proceed') d.onProceed?.();
      if (kind === 'terminate') d.onTerminate?.();
      if (kind === 'enter') d.onEnter?.();
      return true;
    },
    firstDisplay(verb, noun, flash, after = -Infinity) {
      return log.displays.find((d) => d.verb === verb && d.noun === noun && d.flash === flash && d.t >= after) || null;
    },
    event(id) {
      return log.burn.find((e) => e.id === id) || null;
    },
  };
  return rig;
}

// ---------- the vehicle model ----------

test('CmSpsVehicle: LOI-1 approach hyperbola matches the Mission Report pericynthion', () => {
  const v = new CmSpsVehicle({ startGET: LOI1.pericynthionGET, initial: 'loi1' });
  assert.ok(Math.abs(v.state.alt - 61.5 * NMI) < 1, `alt ${v.state.alt / NMI} n mi`);
  assert.ok(Math.abs(v.state.speed - 8334 * FT) < 0.01);
  assert.ok(Math.abs(v.state.altRate) < 1e-6);
  // Kepler propagation agrees with numerical integration 4 minutes back.
  const s = hyperbolaState(MOON_RADIUS + LOI1.pericynthionAlt, LOI1.pericynthionSpeed, -240);
  const c = coast([MOON_RADIUS + LOI1.pericynthionAlt, 0, 0], [0, LOI1.pericynthionSpeed, 0], -240, 0.5);
  assert.ok(vnorm([s.r[0] - c.r[0], s.r[1] - c.r[1], 0]) < 5, 'positions agree within 5 m');
  assert.equal(v.state.orbit.apo, null, 'approach is hyperbolic');
});

test('CmSpsVehicle: SPS transients, propellant and 5.85 cm/s PIPA pulses', () => {
  const v = new CmSpsVehicle({ startGET: TIG, initial: 'loi1' });
  const m0 = v.state.mass;
  const dir = v.state.bodyX;
  for (let i = 0; i < 20; i++) v.step(DT, { engineOn: true, thrustDir: dir });
  // 0.2 s into the 0.4 s build-up: half thrust
  assert.ok(Math.abs(v.state.throttle - 0.5) < 1e-9);
  for (let i = 0; i < 1000; i++) v.step(DT, { engineOn: true, thrustDir: dir });
  assert.equal(v.state.throttle, 1);
  assert.ok(Math.abs(v.state.thrust - LOI1_SPS.thrust) < 1e-6);
  const used = m0 - v.state.mass;
  assert.ok(Math.abs(used - LOI1_SPS.mdot * (10.2 - 0.2)) < 1, `propellant used ${used} kg`);
  const pulses = v.state.pipaPulses;
  const sensed = v.state.pipa;
  for (let k = 0; k < 3; k++) assert.equal(pulses[k], Math.trunc(sensed[k] / CM_PIPA_PULSE));
  // Tail-off: thrust decays over ≈1.4 s after the off command.
  v.step(DT, { engineOn: false, thrustDir: dir });
  assert.ok(v.state.throttle > 0.9);
  for (let i = 0; i < 200; i++) v.step(DT, { engineOn: false, thrustDir: dir });
  assert.equal(v.state.throttle, 0);
  assert.equal(v.state.engineOn, false);
  // LM-only fields stay at their neutral values.
  assert.equal(v.state.landed, false);
  assert.equal(v.state.lr.altValid, false);
});

test('LOI-1 derived SPS performance is consistent with the Mission Report', () => {
  // ṁ·t = Δm and ve·ln(m0/mf) = ΔV by construction; check the magnitudes.
  assert.ok(Math.abs(LOI1_SPS.mdot / LB - 67.19) < 0.05, `mdot ${LOI1_SPS.mdot / LB} lb/s`);
  assert.ok(LOI1_SPS.isp > 310 && LOI1_SPS.isp < 320);
  assert.ok(Math.abs(LOI1_SPS.thrust / 4.4482216152605 - 21171) < 20);
});

// ---------- S40.1 ----------

test('S40.1: LOI-1 velocity to be gained keeps |ΔV| = 2917.3 ft/s and turns it by THETAT/2', () => {
  const rig = makeRig({ stage: 'r60' });
  const { p40, agc } = rig;
  assert.ok(Math.abs(agc.erasable.VGDISP - 2917.3) < 0.1, `VGDISP ${agc.erasable.VGDISP}`);
  const deg = (p40.thetaT * 180) / Math.PI;
  assert.ok(deg > 25 && deg < 40, `THETAT ${deg}°`);
  // The rotation is about the orbit normal: the out-of-plane part is kept.
  const delvsin = lvlhToInertial(LOI1_PAD.dvLv.map((x) => x * FT), p40.rTig, p40.vTig);
  const { vgtig } = s40_1(delvsin, p40.rTig, p40.vTig, p40.totalMassKg(), p40.F);
  assert.ok(Math.abs(vnorm(vgtig) - vnorm(delvsin)) < 1e-6);
  // First display is R60's flashing V50N18.
  assert.deepEqual(rig.log.displays[0], { t: rig.t, verb: 50, noun: 18, flash: true });
});

// ---------- the countdown ----------

test('P40 countdown: TIG−35 blank, TIG−30 Average-G, TIG−5 V99N40 at the listing times', () => {
  const rig = makeRig({ autoPro: -4 });
  rig.runTo(TIG + 3);
  const { log } = rig;
  const at = (id) => rig.event(id).t - TIG;
  assert.ok(Math.abs(at('tigblnk') - -34.96) <= 0.011, `tigblnk ${at('tigblnk')}`);
  assert.ok(Math.abs(at('tigaveg') - -29.96) <= 0.011, `tigaveg ${at('tigaveg')}`);
  assert.ok(Math.abs(at('tig5') - -5.0) <= 0.011, `tig5 ${at('tig5')}`);
  // The DSKY is blanked at TIGBLNK until the first CLOCKJOB after TIGAVEG.
  const blank = log.blanks[0];
  assert.ok(Math.abs(blank.t - TIG + 34.96) <= 0.011);
  assert.ok(blank.s >= 5 - 1e-6 && blank.s <= 6 + 1e-6, `blank ${blank.s} s`);
  const back = rig.firstDisplay(6, 40, false, TIG - 34.9);
  assert.ok(back.t - TIG >= -29.97 && back.t - TIG <= -28.95, `V06N40 back at ${back.t - TIG}`);
  // Average-G (SERVICER) workload phase starts at TIGAVEG.
  const burnPhase = log.phases.find((p) => p.p === 'cmBurn');
  assert.ok(Math.abs(burnPhase.t - TIG + 29.96) <= 0.011);
  // V99N40 flashes on the next CLOCKJOB after TIG-5 (≤ 1 s).
  const v99 = rig.firstDisplay(99, 40, true);
  assert.ok(v99.t - TIG >= -5.0 && v99.t - TIG <= -3.99, `V99 at ${v99.t - TIG}`);
  // R1 of N40 counts the time from ignition: negative before TIG.
  assert.ok(rig.firstDisplay(6, 40, false));
});

test('P40: PRO on V99 before TIG → ignition at TIG; N40 R1 counts up, then down to cut-off', () => {
  const rig = makeRig({ autoPro: -4.5 });
  let ttogoAt1s = null;
  rig.runTo(TIG + 6, (r) => {
    if (Math.abs(r.t - (TIG + 1.5)) < 0.005) ttogoAt1s = r.agc.erasable.TTOGO;
  });
  const ign = rig.event('ignition');
  assert.ok(Math.abs(ign.t - TIG) <= 0.011, `ignition at ${ign.t - TIG}`);
  assert.equal(rig.agc.flags.ASTNFLAG, true);
  assert.equal(rig.agc.flags.ENGONFLG, true);
  assert.ok(ttogoAt1s > 0 && ttogoAt1s < 2, `TTOGO +${ttogoAt1s} after ignition`);
  assert.ok(Math.abs(rig.event('tvc').t - TIG - 0.4) <= 0.011);
  assert.ok(Math.abs(rig.event('steer').t - TIG - 2.0) <= 0.011);
  // After the first steering pass TIG holds the predicted cut-off.
  assert.ok(rig.agc.erasable.TTOGO < -300, `TTOGO ${rig.agc.erasable.TTOGO}`);
});

test('P40: V99 waits for PRO — no ignition at TIG; a late PRO lights the SPS at once', () => {
  const rig = makeRig({ start: TIG - 45 });
  rig.runTo(TIG + 8);
  assert.equal(rig.event('ignition'), null, 'no ignition without PRO');
  assert.equal(rig.vehicle.state.engineOn, false);
  assert.equal(rig.agc.flags.IGNFLAG, true, 'TIG-0 has come');
  assert.equal(rig.agc.current.verb, 99);
  assert.equal(rig.agc.current.flash, true);
  assert.ok(rig.agc.erasable.TTOGO > 6, 'R1 counts up past TIG');
  rig.key('proceed');
  rig.runTo(TIG + 8.1);
  const ign = rig.event('ignition');
  assert.ok(ign && Math.abs(ign.t - (TIG + 8.0)) <= 0.021, `late ignition at ${ign && ign.t - TIG}`);
  assert.equal(rig.vehicle.state.engineOn, true);
});

test('P40: V34 on V99 terminates — SPS never fires, flashing V37 (GOTOPOOH)', () => {
  const rig = makeRig({ start: TIG - 45 });
  rig.runTo(TIG - 3);
  assert.equal(rig.agc.current.verb, 99);
  rig.key('terminate');
  rig.runTo(TIG + 5);
  assert.equal(rig.event('ignition'), null);
  assert.equal(rig.vehicle.state.burnTime, 0);
  assert.deepEqual([rig.agc.current.verb, rig.agc.current.noun, rig.agc.current.flash], [37, 99, true]);
  assert.equal(rig.agc.flags.TIMRFLAG, false);
});

test('P40: ENTER on V99 bypasses the SPS (P40RCS → flashing V16N85)', () => {
  const rig = makeRig({ start: TIG - 45 });
  rig.runTo(TIG - 3);
  rig.key('enter');
  rig.runTo(TIG + 3);
  assert.equal(rig.event('ignition'), null);
  assert.deepEqual([rig.agc.current.verb, rig.agc.current.noun, rig.agc.current.flash], [16, 85, true]);
  // VG in body axes ≈ the whole burn along +X.
  const [x] = getVector(rig.agc, 'VGBODY', { dp: true });
  assert.ok(x > 2900, `VGBODY X ${x}`);
});

test('P40: TIG too close → alarm 1703 and TIG slipped (MIDTOAV1 / P40SNEWM)', () => {
  const rig = makeRig({ start: TIG - 30, stage: 'gimbal' });
  rig.key('enter');                 // trim only: 5 s, then the countdown
  rig.runTo(TIG - 24);
  assert.equal(rig.log.alarms[0]?.code, 0o1703);
  const tNew = rig.agc.erasable.TIG;
  assert.ok(Math.abs(tNew - (TIG - 30 + 5.01 + 12.5 + 29.96)) < 0.02, `new TIG ${tNew - TIG}`);
});

test('P40 gimbal option: V50N25 R1=00204, PRO = drive test + trim (18 s), ENTER = trim only (5 s)', () => {
  for (const [kind, delay] of [['proceed', 18], ['enter', 5]]) {
    const rig = makeRig({ start: TIG - 170, stage: 'gimbal' });
    assert.deepEqual([rig.agc.current.verb, rig.agc.current.noun, rig.agc.current.flash], [50, 25, true]);
    assert.equal(rig.agc.erasable.DSPTEM1, 0o204);
    rig.key(kind);
    rig.runTo(TIG - 170 + delay - 0.1);
    assert.equal(rig.p40.stage, 'trim');
    rig.runTo(TIG - 170 + delay + 0.1);
    assert.equal(rig.p40.stage, 'countdown');
    assert.deepEqual([rig.agc.current.verb, rig.agc.current.noun], [6, 40]);
  }
});

test('R60: V50N18 → PRO maneuvers (V06N18) → V50N18 → ENTER → V50N25', () => {
  const rig = makeRig({ start: TIG - 300, stage: null });
  assert.deepEqual([rig.agc.current.verb, rig.agc.current.noun, rig.agc.current.flash], [50, 18, true]);
  rig.key('proceed');
  assert.deepEqual([rig.agc.current.verb, rig.agc.current.noun, rig.agc.current.flash], [6, 18, false]);
  rig.runTo(TIG - 240);
  assert.deepEqual([rig.agc.current.verb, rig.agc.current.noun, rig.agc.current.flash], [50, 18, true]);
  const s = rig.vehicle.state;
  const err = Math.acos(Math.min(1, s.bodyX.reduce((a, x, i) => a + x * rig.p40.ut[i], 0))) * 180 / Math.PI;
  assert.ok(err < 0.1, `attitude error ${err}°`);
  rig.key('enter');
  assert.deepEqual([rig.agc.current.verb, rig.agc.current.noun, rig.agc.current.flash], [50, 25, true]);
});

// ---------- the whole LOI-1 burn ----------

test('LOI-1: ΔV accumulates to the target, cut-off near 357.5 s, ~170 x 60 n mi orbit, residuals', (t) => {
  const rig = makeRig({ autoPro: -4 });
  let cutoffSeen = null;
  rig.runTo(TIG + 362, (r) => {
    if (cutoffSeen === null && r.event('cutoff')) cutoffSeen = r.t;
  });
  assert.ok(cutoffSeen !== null);
  const { agc, vehicle } = rig;
  const cut = rig.event('cutoff');
  assert.ok(cut, 'ENGINOFF happened');
  const burn = cut.t - rig.event('ignition').t;
  // Mission Report Table 8.6-II: 357.53 s (PAD predicted 6:02 = 362 s).
  assert.ok(Math.abs(burn - 357.53) < 2.5, `burn ${burn.toFixed(2)} s`);
  // Mission Report Table 7-V: 2917.5 ft/s.
  const dv = vehicle.state.dvSensed / FT;
  assert.ok(Math.abs(dv - 2917.5) < 10, `ΔV ${dv.toFixed(1)} ft/s`);
  assert.ok(Math.abs(agc.erasable.DVTOTAL - 2917.5) < 10, `DVTOTAL ${agc.erasable.DVTOTAL}`);
  // Resulting orbit (Mission Report Table 7-V: 169.7 x 60.0; V82 onboard 169.6 x 60.9).
  const apo = vehicle.state.orbit.apo / NMI;
  const peri = vehicle.state.orbit.peri / NMI;
  assert.ok(Math.abs(apo - 169.7) < 6, `apocynthion ${apo.toFixed(1)}`);
  assert.ok(Math.abs(peri - 60.0) < 6, `pericynthion ${peri.toFixed(1)}`);
  // Mass at cut-off (Mission Report Table A-I: 72,037.6 lb).
  assert.ok(Math.abs(vehicle.state.mass / LB - 72037.6) < 300);
  // POSTBURN: flashing V16N40 2.5 s after ENGINOFF with a small VG.
  const pb = rig.firstDisplay(16, 40, true);
  assert.ok(pb && Math.abs(pb.t - cut.t - 2.5) <= 0.011, 'V16N40 2.5 s after cut-off');
  assert.ok(agc.erasable.VGDISP < 2, `VG after the burn ${agc.erasable.VGDISP} ft/s`);
  assert.ok(agc.erasable.TTOGO > 0 && agc.erasable.TTOGO < 3, `final R1 ${agc.erasable.TTOGO}`);
  assert.equal(agc.flags.TIMRFLAG, false, 'clock stopped (TVCZAP)');
  // PRO → (2 s) → V16N85 residuals; PRO → GOTOPOOH flashing V37.
  rig.key('proceed');
  rig.runTo(rig.t + 2.5);
  assert.deepEqual([agc.current.verb, agc.current.noun, agc.current.flash], [16, 85, true]);
  const vgb = getVector(agc, 'VGBODY', { dp: true });
  assert.ok(vgb.every((c) => Math.abs(c) < 2), `VGBODY ${vgb.map((c) => c.toFixed(2))}`);
  rig.key('proceed');
  assert.deepEqual([agc.current.verb, agc.current.noun, agc.current.flash], [37, 99, true]);
  t.diagnostic(`LOI-1 model: burn ${burn.toFixed(2)} s, ΔV ${dv.toFixed(1)} ft/s, orbit ${apo.toFixed(1)} x ${peri.toFixed(1)} n mi, cut-off mass ${(vehicle.state.mass / LB).toFixed(0)} lb, VG ${agc.erasable.VGDISP.toFixed(2)} ft/s, VGBODY ${vgb.map((c) => c.toFixed(2)).join(' ')}`);
});

test('LOI-1 is deterministic for a given seed', () => {
  const a = makeRig({ start: TIG - 45, autoPro: -4 });
  const b = makeRig({ start: TIG - 45, autoPro: -4 });
  a.runTo(TIG + 60);
  b.runTo(TIG + 60);
  assert.deepEqual(a.vehicle.state.r, b.vehicle.state.r);
  assert.equal(a.agc.erasable.VGDISP, b.agc.erasable.VGDISP);
});

test('Engine failure during the burn → V97N40 flashing (LOTHRUST); V34 shuts down → V37', () => {
  const rig = makeRig({ start: TIG - 45, autoPro: -4 });
  rig.runTo(TIG + 30);
  rig.p40.onCrewInput('engineStop', true);
  rig.runTo(TIG + 36);
  assert.deepEqual([rig.agc.current.verb, rig.agc.current.noun, rig.agc.current.flash], [97, 40, true]);
  const v97 = rig.log.displays.find((d) => d.verb === 97);
  assert.ok(v97.t - TIG > 30 && v97.t - TIG < 35, `V97 at ${v97.t - TIG}`);
  rig.key('terminate');
  rig.runTo(TIG + 40);
  assert.deepEqual([rig.agc.current.verb, rig.agc.current.noun], [37, 99]);
  assert.equal(rig.p40.engineOn, false);
});

test('Engine failure, V97 ENTER: recycle to V99 and re-ignite on PRO', () => {
  const rig = makeRig({ start: TIG - 45, autoPro: -4 });
  rig.runTo(TIG + 20);
  rig.p40.onCrewInput('engineStop', true);
  rig.runTo(TIG + 26);
  assert.equal(rig.agc.current.verb, 97);
  rig.key('enter');
  rig.p40.onCrewInput('engineStop', false);
  rig.runTo(TIG + 30);
  assert.deepEqual([rig.agc.current.verb, rig.agc.current.noun, rig.agc.current.flash], [99, 40, true]);
  rig.key('proceed');
  rig.runTo(TIG + 31);
  assert.equal(rig.vehicle.state.engineOn, true, 'SPS re-lit');
});

test('Restart protection: P40 registers groups 4 and 6 with phases from the listing', () => {
  const rig = makeRig({ autoPro: -4 });
  rig.runTo(TIG + 3);
  const phases = rig.log.protects.map((x) => x.phase);
  for (const ph of ['6.3', '4.21', '4.37', '4.6', '4.7', '4.61']) assert.ok(phases.includes(ph), ph);
  // A re-entry rebuilds the display.
  const n = rig.log.displays.length;
  rig.agc.current = null;
  rig.log.protects.at(-1).reenter(rig.t, { group: 4 });
  assert.ok(rig.agc.current, 'display re-established after a restart');
  assert.ok(rig.log.displays.length >= n);
});

test('snapshot.burn shape (ARCHITECTURE §6.9.1) with source anchors that exist', () => {
  const rig = makeRig({ start: TIG - 45, autoPro: -4 });
  rig.runTo(TIG + 1);
  const b = rig.p40.burn.snapshot();
  assert.equal(b.program, 40);
  assert.equal(b.tig, TIG);
  assert.ok(Math.abs(b.tMinusTig - 1) < 0.02);
  assert.equal(b.phase, 'ignition');
  for (const e of b.events) {
    assert.equal(typeof e.id, 'string');
    assert.equal(typeof e.label, 'string');
    assert.ok(Number.isFinite(e.rel) && Number.isFinite(e.t));
    assert.equal(typeof e.done, 'boolean');
    assert.ok(CM_ANCHORS[e.anchor], `anchor ${e.anchor}`);
  }
  const cut = b.events.find((e) => e.id === 'cutoff');
  assert.ok(cut.rel > 340 && cut.rel < 380, `predicted cut-off ${cut.rel}`);
});

test('Every anchor id used by the CM code is defined in anchors/cm.js', async () => {
  const { readFileSync } = await import('node:fs');
  const files = ['p40.js', 'p00.js', 'entry.js', 'cm-common.js', 'index.js'].map((f) => `../js/agc/programs/cm/${f}`);
  const ids = new Set();
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const m of src.matchAll(/'(cm\.[a-z0-9.]+)'/g)) ids.add(m[1]);
  }
  assert.ok(ids.size > 10);
  for (const id of ids) assert.ok(CM_ANCHORS[id], `missing anchor ${id}`);
});

// ---------- programs map, P00, presets ----------

test('PROGRAMS_COMANCHE055 exposes P00 and P40 with the §6.10 class shape', () => {
  assert.equal(PROGRAMS_COMANCHE055[0], P00);
  assert.equal(PROGRAMS_COMANCHE055[40], P40);
  for (const P of Object.values(PROGRAMS_COMANCHE055)) {
    assert.equal(typeof P.number, 'number');
    assert.equal(typeof P.name, 'string');
    assert.ok(CM_ANCHORS[P.anchor], P.anchor);
    for (const m of ['enter', 'step', 'exit', 'vehicleCommands']) assert.equal(typeof P.prototype[m], 'function', m);
  }
  const phases = [];
  const p = new P00({ workload: { setPhase: (x) => phases.push(x) } });
  p.enter();
  assert.deepEqual(phases, ['cmIdle']);
  assert.equal(p.vehicleCommands().engineOn, false);
});

test('PRESETS_CM: well-formed; set-up works on a stand-in sim', () => {
  assert.ok(PRESETS_CM.length >= 2);
  const ids = new Set();
  for (const pr of PRESETS_CM) {
    for (const k of ['id', 'title', 'description', 'software', 'vehicle']) assert.equal(typeof pr[k], 'string', k);
    assert.ok(!ids.has(pr.id));
    ids.add(pr.id);
    assert.equal(pr.software, 'Comanche055');
    assert.equal(pr.vehicle, 'cmSps');
    assert.ok(Number.isFinite(parseGET(pr.startGET)));
    // stand-in sim: vehicle + agc with startProgram
    const vehicle = new CmSpsVehicle({ startGET: parseGET(pr.startGET), ...pr.vehicleOptions });
    const agc = {
      t: parseGET(pr.startGET), vehicle, erasable: {}, flags: {}, program: null,
      pinball: { showDisplay() {} }, workload: { setPhase() {} },
      startProgram(n) { this.program = new PROGRAMS_COMANCHE055[n](this); this.program.enter(); },
    };
    if (pr.initialProgram !== null && pr.initialProgram !== undefined) agc.startProgram(pr.initialProgram);
    pr.setup({ agc, vehicle });
    if (pr.id === 'cm-entry') {
      assert.equal(agc.program.constructor.number, 61);
      assert.equal(agc.erasable.ENTRYEI, parseGET('195:03:06'));
      continue;
    }
    assert.equal(agc.erasable.TIG, TIG);
    if (pr.id !== 'cm-p00') {
      assert.equal(agc.program.constructor.number, 40);
      assert.equal(agc.program.stage, 'countdown');
    }
  }
  assert.ok(ids.has('cm-p00') && ids.has('cm-loi1'));
});

test('setupLoi1 stages: r60 / gimbal / countdown', () => {
  for (const [stage, expect] of [['r60', 'r60'], ['gimbal', 'gimbal'], ['countdown', 'countdown']]) {
    const vehicle = new CmSpsVehicle({ startGET: TIG - 300 });
    const agc = {
      t: TIG - 300, vehicle, erasable: {}, flags: {},
      pinball: { showDisplay() {} }, workload: { setPhase() {} },
      startProgram(n) { this.program = new PROGRAMS_COMANCHE055[n](this); this.program.enter(); },
    };
    setupLoi1({ agc, vehicle }, { stage });
    assert.equal(agc.program.stage, expect);
  }
});

test('PAD values loaded for the displays (N33, N47, N48, N81)', () => {
  const agc = { erasable: {}, flags: {} };
  loadExternalDeltaV(agc);
  assert.equal(agc.erasable.TIG, parseGET('075:49:49.65'));
  assert.deepEqual(getVector(agc, 'DELVLVC', { dp: true }), [-2889.7, -394.4, -68.6]);
  assert.equal(agc.erasable['DELVLVC+2'], -394.4);
  assert.equal(agc.erasable.CSMMASS, 62710);
  assert.equal(agc.erasable.PACTOFF, 0.98);
  assert.equal(agc.erasable.YACTOFF, -0.19);
  assert.ok(Math.abs(agc.erasable.CSMMASS + agc.erasable.LEMMASS - 96061.6) < 1e-6);
  assert.equal(PAD_LOADS.ETDECAY < 0, true);
});

// ---------- entry (P61–P67, scripted profile) ----------

function makeEntryRig(start = parseGET('194:44:00')) {
  const vehicle = new CmSpsVehicle({ startGET: start, initial: 'entry' });
  const modes = [];
  const agc = {
    software: 'Comanche055', t: start, vehicle, erasable: {}, flags: {}, current: null, program: null, mode: null,
    pinball: { showDisplay(o) { agc.current = o; }, blankFor() {} },
    workload: { phase: null, setPhase(p) { this.phase = p; } },
    startProgram(n) {
      agc.program?.exit?.();
      agc.mode = n;
      modes.push({ t: agc.t, n });
      agc.program = new PROGRAMS_COMANCHE055[n](agc);
      agc.program.enter();
    },
  };
  const rig = {
    agc, vehicle, modes, t: start,
    runTo(until) {
      while (rig.t < until - 1e-9) {
        rig.t = Math.round((rig.t + DT) * 100) / 100;
        vehicle.step(DT, agc.program?.vehicleCommands?.() || {}, rig.t);
        agc.t = rig.t;
        agc.program?.step(rig.t, DT);
      }
    },
    key(kind) {
      const d = agc.current;
      if (!d?.flash) return false;
      ({ proceed: d.onProceed, terminate: d.onTerminate, enter: d.onEnter })[kind]?.();
      return true;
    },
    vn() { return [agc.current?.verb, agc.current?.noun, !!agc.current?.flash]; },
    modeAt(n) { return modes.find((m) => m.n === n) || null; },
  };
  return rig;
}

test('Entry P61/P62: Entry PAD displays and crew responses per the listing', () => {
  const rig = makeEntryRig();
  setupEntry({ agc: rig.agc, vehicle: rig.vehicle }, { stage: 61 });
  assert.equal(rig.agc.workload.phase, 'cmEntry');
  assert.deepEqual(rig.vn(), [6, 61, true]);
  assert.equal(rig.agc.erasable['LAT(SPL)'], 13.32);
  assert.equal(rig.agc.erasable['LNG(SPL)'], -169.17);
  assert.equal(rig.agc.erasable.HEADSUP, -1, 'lift up');
  rig.key('enter');                                   // recycle: same display
  assert.deepEqual(rig.vn(), [6, 61, true]);
  rig.runTo(rig.t + 1);
  rig.key('proceed');
  assert.deepEqual(rig.vn(), [6, 60, true]);
  assert.equal(rig.agc.erasable.GMAX, 630, 'GMAX kept as 100·g');
  assert.equal(rig.agc.erasable.VPRED, 36194);
  rig.runTo(rig.t + 1);
  rig.key('proceed');
  assert.deepEqual(rig.vn(), [6, 63, true]);
  assert.equal(rig.agc.erasable.RTGO, 1403.3);
  assert.ok(rig.agc.erasable.TTE < 0, 'TTE counts toward the EMS altitude');
  rig.runTo(rig.t + 1);
  rig.key('proceed');
  assert.equal(rig.agc.mode, 62);
  assert.deepEqual(rig.vn(), [50, 25, true]);
  assert.equal(rig.agc.erasable.DSPTEM1, 0o41, 'checklist 00041 CM/SM SEP switch up');
  rig.runTo(rig.t + 1);
  rig.key('proceed');
  assert.deepEqual(rig.vn(), [6, 61, true]);
  rig.runTo(rig.t + 1);
  rig.key('proceed');
  assert.deepEqual(rig.vn(), [6, 22, false]);
  const tPro = rig.t;
  rig.runTo(tPro + 31);
  assert.equal(rig.agc.mode, 63);
  rig.runTo(rig.t + 2.1);
  assert.deepEqual(rig.vn(), [6, 64, false]);
});

test('Entry P63→P67: 0.05 g, up control, no P66, steering ends below 1,000 ft/s', () => {
  const rig = makeEntryRig(ENTRY.eiGET - 120);
  setupEntry({ agc: rig.agc, vehicle: rig.vehicle }, { stage: 63 });
  rig.runTo(ENTRY.eiGET + 600);
  const rel = (n) => rig.modeAt(n) && rig.modeAt(n).t - ENTRY.eiGET;
  // 0.05 g at EI+28 s (Entry PAD), sensed on the next 2-s pass.
  assert.ok(rel(64) > 28 && rel(64) <= 30.01, `P64 at EI+${rel(64)}`);
  assert.ok(rel(65) >= 150 && rel(65) <= 152.01, `P65 at EI+${rel(65)}`);
  assert.equal(rig.modeAt(66), null, '"You\'ll get P65, but no P66"');
  assert.ok(rel(67) > rel(65), 'P67 after P65');
  // The P65 → P67 criterion: falling and V < VL + 500 ft/s.
  const at67 = rig.modeAt(67).t;
  const v = new CmSpsVehicle({ startGET: at67, initial: 'entry' }).state.entry;
  assert.ok(v.rdot < 0 && v.v < rig.agc.erasable.VL + ENTRY_CONSTANTS.C18);
  // P67.1 flashing V16N67 once V < VQUIT; response → GOTOPOOH (V37).
  assert.deepEqual(rig.vn(), [16, 67, true]);
  assert.ok(rig.agc.erasable.RTGON67 < 10, `range to go ${rig.agc.erasable.RTGON67}`);
  assert.ok(Math.abs(rig.agc.erasable.LAT - 13.3) < 0.2);
  rig.key('proceed');
  assert.deepEqual(rig.vn(), [37, 99, true]);
  assert.equal(rig.agc.mode, 67, 'the major mode stays until V37');
});

test('Entry P65 flashing V16N69 shows drag level and exit velocity inside the PAD limits', () => {
  const rig = makeEntryRig(ENTRY.eiGET - 10);
  setupEntry({ agc: rig.agc, vehicle: rig.vehicle }, { stage: 63 });
  rig.runTo(ENTRY.eiGET + 160);
  assert.equal(rig.agc.mode, 65);
  assert.deepEqual(rig.vn(), [16, 69, true]);
  const { Q7, VL } = rig.agc.erasable;
  assert.ok(Q7 <= ENTRY_PAD.dl[0] && Q7 >= ENTRY_PAD.dl[1]);
  assert.ok(VL <= ENTRY_PAD.vl[0] && VL >= ENTRY_PAD.vl[1]);
  rig.key('proceed');
  rig.runTo(rig.t + 2.1);
  assert.deepEqual(rig.vn(), [6, 74, false], 'entry display resumes after PRO');
});

test('Entry P64 below 27,000 ft/s goes to the final phase at 0.2 g (KEP2, no P65)', () => {
  // Start the chain late, already slower than VFINAL1: INITROLL → KEP2 → P67.
  const rig = makeEntryRig(ENTRY.eiGET + 140);
  setupEntry({ agc: rig.agc, vehicle: rig.vehicle }, { stage: 63 });
  rig.runTo(ENTRY.eiGET + 160);
  assert.equal(rig.modeAt(65), null);
  assert.equal(rig.agc.mode, 67);
});

test('Entry profile: sourced points are honoured', () => {
  const at = (get) => new CmSpsVehicle({ startGET: get, initial: 'entry' }).state;
  const ei = at(ENTRY.eiGET);
  assert.ok(Math.abs(ei.entry.v - 36194.4) < 0.01);
  assert.ok(Math.abs(ei.alt / FT - 400000) < 1);
  const g05 = at(ENTRY.eiGET + 28).entry;
  assert.ok(Math.abs(g05.g - 0.05) < 1e-9);
  assert.ok(Math.abs(g05.rtgo - 1403.3) < 1e-6);
  const drogue = at(parseGET('195:12:06.9'));
  assert.ok(Math.abs(drogue.entry.rtgo - 1.7) < 1e-6);
  assert.ok(Math.abs(drogue.entry.lat - 13.30) < 1e-6 && Math.abs(drogue.entry.lon + 169.15) < 1e-6);
  const landed = at(parseGET('195:18:35'));
  assert.equal(landed.landed, true);
  assert.ok(Math.abs(landed.mass / LB - 10873.0) < 0.01);
  const peak = Math.max(...ENTRY.keyframes.map((k) => k.d));
  assert.equal(peak, 6.5);
});

// ---------- the noun tables (engineer B's nouns.js) read what P40/entry write ----------

test('CM nouns render the P40 and entry erasables (N40, N85, N33, N47, N48, N60, N61, N69)', async (t) => {
  const mod = await tryImport('../js/agc/nouns.js');
  const fmt = await tryImport('../js/agc/display-format.js');
  if (mod.__error || fmt.__error) {
    t.skip('nouns.js / display-format.js not importable yet');
    return;
  }
  const { NOUNS_COMANCHE055 } = mod;
  const { formatRegister } = fmt;
  const rig = makeRig({ start: TIG - 45, autoPro: -4 });
  rig.runTo(TIG - 20);
  const agc = rig.agc;
  const show = (n) => NOUNS_COMANCHE055[n].components.map((c) => {
    const r = formatRegister(c.read(agc), c.format);
    return `${r.sign}${r.digits}`;
  });
  const n40 = show(40);
  assert.match(n40[0], /^-00 [12]\d$/, `N40 R1 ${n40[0]}`);   // about −20 s
  assert.equal(n40[1], '+29173');                              // VG 2917.3 ft/s
  assert.equal(n40[2], '+00000');
  assert.deepEqual(show(33), ['+00075', '+00049', '+04965']);  // TIG 075:49:49.65
  assert.deepEqual(show(47), ['+62710', '+33352']);
  assert.deepEqual(show(48), ['+00098', '-00019']);
  assert.deepEqual(show(18), ['+35800', '+22600', '+34700']); // PAD burn attitude
  // Residuals in body axes as Collins read them ("minus 1, minus 1, plus 1").
  for (const [k, v] of [['VGBODY', -0.1], ['VGBODY+2', -0.1], ['VGBODY+4', 0.1]]) agc.erasable[k] = v;
  assert.deepEqual(show(85), ['-00001', '-00001', '+00001']);
  // Entry PAD displays (research src-comanche.md §7.2: N61 +01332 -16917 -00001; N60 +00630 +36194 -00648).
  loadEntryPadFn(agc);
  assert.deepEqual(show(61), ['+01332', '-16917', '-00001']);
  assert.deepEqual(show(60), ['+00630', '+36194', '-00648']);
  assert.deepEqual(show(22), ['+00000', '+15200', '+00100']);
});

// ---------- integration with the real computer model (when present) ----------

async function tryImport(path) {
  try {
    return await import(path);
  } catch (err) {
    return { __error: err };
  }
}

function buildSim(Simulation, pr) {
  const sim = new Simulation({
    software: pr.software, vehicle: pr.vehicle, startGET: pr.startGET,
    initialProgram: pr.initialProgram ?? null, vehicleOptions: pr.vehicleOptions || {},
  });
  pr.setup(sim);
  return sim;
}

const dskyLine = (sim) => {
  const d = sim.agc.dsky;
  return { prog: d.prog, verb: d.verb, noun: d.noun, flash: d.flashVerbNoun, blanked: d.blanked, r: d.r.map((x) => x.sign + x.digits) };
};

test('Real Simulation: every CM preset builds and runs', async (t) => {
  const simMod = await tryImport('../js/sim.js');
  if (simMod.__error) {
    t.skip(`Simulation not importable yet: ${simMod.__error.message.split('\n')[0]}`);
    return;
  }
  for (const pr of PRESETS_CM) {
    const sim = buildSim(simMod.Simulation, pr);
    if (pr.id === 'cm-entry') assert.equal(sim.agc.erasable.ENTRYEI, parseGET('195:03:06'));
    else assert.equal(sim.agc.erasable.TIG, TIG, pr.id);
    sim.step(2);
    const snap = sim.snapshot();
    assert.equal(snap.software, 'Comanche055');
    assert.equal(snap.agc.dsky.prog, { 'cm-p00': '00', 'cm-entry': '61' }[pr.id] || '40', pr.id);
  }
});

test('Real Simulation: LOI-1 on the real Agc/PINBALL — DSKY at the listing times', async (t) => {
  const simMod = await tryImport('../js/sim.js');
  if (simMod.__error) {
    t.skip(`Simulation not importable yet: ${simMod.__error.message.split('\n')[0]}`);
    return;
  }
  const sim = buildSim(simMod.Simulation, PRESETS_CM.find((p) => p.id === 'cm-loi1-ignition'));
  sim.runTo(TIG - 36);
  let d = dskyLine(sim);
  assert.deepEqual([d.verb, d.noun, d.flash], ['06', '40', false]);
  assert.equal(d.r[1], '+29173', 'VG 2917.3 ft/s');
  sim.runTo(TIG - 32);
  d = dskyLine(sim);
  assert.ok(d.blanked || (d.verb === '  ' && d.r.every((x) => x.trim() === '')), 'blank between TIG−35 and TIG−30');
  sim.runTo(TIG - 28);
  assert.equal(dskyLine(sim).noun, '40', 'V06N40 back after TIG−30');
  sim.runTo(TIG - 3.9);
  d = dskyLine(sim);
  assert.deepEqual([d.verb, d.noun, d.flash], ['99', '40', true], 'V99N40 flashing');
  sim.runTo(TIG + 3);
  assert.equal(sim.vehicle.state.engineOn, false, 'no PRO, no ignition');
  sim.agc.key('PRO', { source: 'user' });
  sim.runTo(TIG + 3.1);
  assert.equal(sim.vehicle.state.engineOn, true, 'late PRO ignites at once');
  sim.runTo(TIG + 370);
  const p = sim.agc.program.snapshot();
  assert.ok(p.tCutoff, 'cut-off happened');
  assert.ok(Math.abs(p.tCutoff - p.tIgnition - 357.5) < 3, `burn ${p.tCutoff - p.tIgnition}`);
  d = dskyLine(sim);
  assert.deepEqual([d.verb, d.noun, d.flash], ['16', '40', true], 'POSTBURN V16N40');
  sim.agc.key('PRO', { source: 'user' });
  sim.step(2.5);
  d = dskyLine(sim);
  assert.deepEqual([d.verb, d.noun, d.flash], ['16', '85', true], 'TIGNOW V16N85');
  sim.agc.key('PRO', { source: 'user' });
  sim.step(1);
  assert.deepEqual([dskyLine(sim).verb, dskyLine(sim).flash], ['37', true], 'GOTOPOOH: flashing V37');
  sim.agc.keys('V37E00E', { source: 'user' });
  sim.step(4);
  assert.equal(sim.agc.mode, 0);
  t.diagnostic(`real sim: burn ${(p.tCutoff - p.tIgnition).toFixed(2)} s (late ignition at TIG+3)`);
});

test('Real Simulation: entry P61 → P67 on the real Agc/PINBALL', async (t) => {
  const simMod = await tryImport('../js/sim.js');
  if (simMod.__error) {
    t.skip(`Simulation not importable yet: ${simMod.__error.message.split('\n')[0]}`);
    return;
  }
  const sim = buildSim(simMod.Simulation, PRESETS_CM.find((p) => p.id === 'cm-entry'));
  const seen = [];
  sim.outBus.on('mode', ({ mode, t: tt }) => seen.push({ mode, t: tt }));
  for (let i = 0; i < 5; i++) {
    sim.agc.key('PRO', { source: 'user' });
    sim.step(2);
  }
  assert.equal(sim.agc.mode, 62);
  sim.runTo('195:05:50');
  assert.equal(sim.agc.mode, 65);
  assert.deepEqual([sim.agc.dsky.verb, sim.agc.dsky.noun], ['16', '69']);
  sim.agc.key('PRO', { source: 'user' });
  sim.runTo('195:12:00');
  assert.equal(sim.agc.mode, 67);
  assert.deepEqual([sim.agc.dsky.verb, sim.agc.dsky.noun, sim.agc.dsky.flashVerbNoun], ['16', '67', true]);
  const modes = seen.map((m) => m.mode);
  for (const m of [63, 64, 65, 67]) assert.ok(modes.includes(m), `P${m}`);
  assert.ok(!modes.includes(66), 'no P66');
  const p64 = seen.find((m) => m.mode === 64).t - ENTRY.eiGET;
  assert.ok(p64 > 28 && p64 < 31, `P64 at EI+${p64.toFixed(2)}`);
});

test('Real Simulation: a clock load moves TIME2 — P40 TTOGO = TIME2 − TIG, TEVENT := TIME2; the burn keeps its GET', async (t) => {
  const simMod = await tryImport('../js/sim.js');
  if (simMod.__error) {
    t.skip(`Simulation not importable yet: ${simMod.__error.message.split('\n')[0]}`);
    return;
  }
  const sim = buildSim(simMod.Simulation, PRESETS_CM.find((p) => p.id === 'cm-loi1-ignition'));
  const agc = sim.agc;
  sim.runTo(TIG - 40);
  agc.setClock(agc.t + 60);     // V25N36: the clock a minute ahead
  sim.runTo(TIG - 38);
  assert.ok(Math.abs(agc.erasable.TTOGO - (agc.clock() - agc.erasable.TIG)) < 1.05, 'TTOGO = TIME2 − TIG');
  assert.ok(agc.erasable.TTOGO > 10, 'TIG not reloaded: the countdown is a minute off');
  agc.erasable.TIG += 60;       // V25N33: TIG in the clock's new frame
  sim.runTo(TIG - 20);
  assert.ok(Math.abs(agc.erasable.TTOGO - -20) < 1.05, `countdown consistent again (${agc.erasable.TTOGO})`);
  sim.runTo(TIG - 3);
  sim.agc.key('PRO', { source: 'user' });
  sim.runTo(TIG + 370);
  const p = agc.program.snapshot();
  assert.ok(Math.abs(p.tIgnition - TIG) < 0.05, `ignition at its GET (${p.tIgnition - TIG})`);
  assert.ok(Math.abs(p.tCutoff - p.tIgnition - 357.5) < 3, `cut-off from TIG − TIME2 in one frame: burn ${p.tCutoff - p.tIgnition} s`);
  assert.ok(Math.abs(agc.erasable.TEVENT - agc.clock(p.tCutoff)) < 0.05, 'TEVENT := TIME2 at cut-off');
});
