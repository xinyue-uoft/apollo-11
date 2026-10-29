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
import { PRESETS_CM, setupLoi1 } from '../js/data/presets-cm.js';
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
  const [x] = rig.agc.erasable.VGBODY;
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
  const vgb = agc.erasable.VGBODY;
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
  const files = ['p40.js', 'p00.js', 'cm-common.js', 'index.js'].map((f) => `../js/agc/programs/cm/${f}`);
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
  for (const P of [P00, P40]) {
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
  assert.deepEqual(agc.erasable.DELVLVC, [-2889.7, -394.4, -68.6]);
  assert.equal(agc.erasable.CSMMASS, 62710);
  assert.equal(agc.erasable.PACTOFF, 0.98);
  assert.equal(agc.erasable.YACTOFF, -0.19);
  assert.ok(Math.abs(agc.erasable.CSMMASS + agc.erasable.LEMMASS - 96061.6) < 1e-6);
  assert.equal(PAD_LOADS.ETDECAY < 0, true);
});

// ---------- integration with the real computer model (when present) ----------

async function tryImport(path) {
  try {
    return await import(path);
  } catch (err) {
    return { __error: err };
  }
}

test('Real Simulation: CM presets build and LOI-1 burns (skipped until agc.js/vehicle index exist)', async (t) => {
  const simMod = await tryImport('../js/sim.js');
  if (simMod.__error) {
    t.skip(`Simulation not importable yet: ${simMod.__error.message.split('\n')[0]}`);
    return;
  }
  const { Simulation } = simMod;
  for (const pr of PRESETS_CM) {
    const sim = new Simulation({
      software: pr.software, vehicle: pr.vehicle, startGET: pr.startGET,
      initialProgram: pr.initialProgram ?? null, vehicleOptions: pr.vehicleOptions || {},
    });
    pr.setup(sim);
    assert.equal(sim.agc.erasable.TIG, TIG, pr.id);
    sim.step(2);
    const snap = sim.snapshot();
    assert.equal(snap.software, 'Comanche055');
  }
  // Fly LOI-1 through the real Agc + PINBALL: PRO on V99, then check the cut-off.
  const pr = PRESETS_CM.find((p) => p.id === 'cm-loi1-ignition');
  const sim = new Simulation({
    software: pr.software, vehicle: pr.vehicle, startGET: pr.startGET,
    initialProgram: pr.initialProgram ?? null, vehicleOptions: pr.vehicleOptions || {},
  });
  pr.setup(sim);
  sim.runTo(TIG - 3.5);
  assert.equal(sim.agc.dsky.verb, '99', 'V99 shown');
  sim.agc.key('PRO', { source: 'user' });
  sim.runTo(TIG + 365);
  const burn = sim.agc.program?.snapshot?.();
  assert.ok(burn && burn.tCutoff, 'cut-off happened');
  assert.ok(Math.abs(burn.tCutoff - burn.tIgnition - 357.5) < 3);
});
