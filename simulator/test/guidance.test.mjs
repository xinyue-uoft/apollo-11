// Landing guidance (ARCHITECTURE §7, brief E): the Luminary 099 equations
// and a closed-loop guided descent with the LM physics.
// Run: cd /home/user/apollo-11 && node --test simulator/test/guidance.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseGET, formatGET } from '../js/util/time.js';
import { createRng } from '../js/util/rng.js';
import { FT, FPS, MOON_MU, MOON_RADIUS, toFt, toFps } from '../js/util/units.js';
import {
  BRAKING_TARGETS, APPROACH_TARGETS, P65_TARGET, GUIDANCE_PARAMS,
  solveTtg, solveTtgDetailed, ttfCoefficients, accelCommand, leadCoefficients, thrustCommand,
  throttleLogic, toGuidanceFrame, guidanceToLocal, localToGuidance, pitchOfLocal, thrustDirFromPitch,
  lookAngle, lookAngleDisplay, tredes, redesignate, shiftSite, rodClick, rodCommand, p65Accel,
  p66AttitudeAssist, slantRange, LandingGuidance,
} from '../js/agc/guidance/landing-guidance.js';
import { LmPhysics, stateFromTrack } from '../js/vehicle/lm-physics.js';
import { DPS, THROTTLE_LOGIC, LM } from '../js/vehicle/constants.js';
import { APOLLO11_DESCENT } from '../js/data/apollo11-descent.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (±${tol})`);

// A navigated state as the guidance sees it, from a track/physics state.
const navOf = (s) => ({
  alt: s.alt, altRate: s.altRate, vHoriz: s.vHoriz, range: s.range, mass: s.mass,
  thrust: s.thrust, pitch: s.pitch, measuredAccel: s.mass > 0 ? s.thrust / s.mass : 0,
});

// ---------- targets ----------

test('targets are the Apollo 11 pad load (LM Data Book), in SI', () => {
  near(BRAKING_TARGETS.rdg[0] / FT, 171.835, 1e-9);
  near(BRAKING_TARGETS.rdg[2] / FT, -10678.596, 1e-9);
  near(BRAKING_TARGETS.vdg[0] / FPS, -105.876, 1e-9);
  near(BRAKING_TARGETS.adg[2] / FT, -9.1044, 1e-9);
  near(BRAKING_TARGETS.jdgZ / FT, -0.01882677, 1e-12);
  // The starred pad words are 18·VBRFG_z and 6·ABRFG_z (research §4.1).
  near(18 * BRAKING_TARGETS.vdg[2] / FPS, -18.72, 1e-9);
  near(6 * BRAKING_TARGETS.adg[2] / FT, -54.6264, 1e-9);
  near(18 * APPROACH_TARGETS.vdg[2] / FPS, 4.464, 1e-9);
  near(6 * APPROACH_TARGETS.adg[2] / FT, -3.072, 1e-9);
  assert.equal(BRAKING_TARGETS.tend, 62);
  assert.equal(APPROACH_TARGETS.tend, 12);
  assert.equal(APPROACH_TARGETS.deltaTtf, -110);
  near(P65_TARGET.v2fg[0] / FPS, -3, 1e-12);
  assert.equal(GUIDANCE_PARAMS.leadTime, -2.2);
  assert.equal(GUIDANCE_PARAMS.rootMaxPasses, 8);
  // Implied P65 hand-over state (research §4.3): the approach polynomial at
  // T = −12 s is ≈152 ft up and ≈−67 ft downrange.
  const t = APPROACH_TARGETS;
  const T = -12;
  const x = t.rdg[0] + t.vdg[0] * T + (t.adg[0] * T * T) / 2;
  near(x / FT, 152, 2, 'P65 hand-over height');
});

// ---------- geometry ----------

test('guidance frame: x up at the site, z downrange; local ↔ guidance', () => {
  const at = toGuidanceFrame({ alt: 1000, altRate: -5, vHoriz: 20, range: 0 });
  near(at.rg[0], 1000, 1e-6);
  near(at.rg[2], 0, 1e-6);
  near(at.vg[0], -5, 1e-9);
  near(at.vg[2], 20, 1e-9);
  near(at.gravity[0], -MOON_MU / (MOON_RADIUS + 1000) ** 2, 1e-9);
  const far = toGuidanceFrame({ alt: 15000, altRate: 0, vHoriz: 1700, range: 400e3 });
  assert.ok(far.rg[2] < -390e3 && far.rg[0] < 0, 'uprange LM sits below the site horizontal plane');
  near(slantRange({ alt: 3000, altRate: 0, vHoriz: 0, range: 4000 }), 5000, 5);
  const phi = 0.2;
  const d = localToGuidance([Math.cos(0.3), 0, -Math.sin(0.3)], phi);
  const back = guidanceToLocal(d, phi);
  near(back[0], Math.cos(0.3), 1e-12);
  near(pitchOfLocal(back), (0.3 * 180) / Math.PI, 1e-9);
  near(pitchOfLocal(guidanceToLocal(thrustDirFromPitch(45, phi), phi)), 45, 1e-9);
});

// ---------- TTF/8 ----------

test('TTF solver: Newton on the jerk cubic converges like ROOTPSRS', () => {
  // The guidance-start state (TIG + 26 s). The ignition algorithm's pad
  // values design it at RIGNZ −1,432,597 ft, RIGNX −130,520 ft (research §2),
  // ≈236 nmi uprange; the replay's derived range is within ≈1.5 nmi of that
  // (0.7 %; IGNALG also corrects RIGN with the KIGN sensitivities).
  const s = stateFromTrack(APOLLO11_DESCENT, '102:33:31.36');
  const { rg, vg } = toGuidanceFrame(s);
  near(rg[2] / FT, -1432597, 12000, 'downrange ≈ RIGNZ');
  near(rg[0] / FT, -130520, 5000, 'height ≈ RIGNX');
  // From the IGNALG-like guess −GUIDDURN.
  const r = solveTtgDetailed({ rg, vg, target: BRAKING_TARGETS });
  assert.ok(r.converged && r.passes <= 8, `converged in ${r.passes} passes`);
  const [a0, a1, a2, a3] = ttfCoefficients({ rg, vg, target: BRAKING_TARGETS });
  const f = (T) => ((a3 * T + a2) * T + a1) * T + a0;
  assert.ok(Math.abs(f(r.ttg)) < 1e-6 * Math.abs(a0), 'residual');
  assert.ok(r.ttg < -500 && r.ttg > -700, `TTF ${r.ttg.toFixed(1)} s`);
  assert.equal(solveTtg({ rg, vg, target: BRAKING_TARGETS }), r.ttg);
  // The AGC solves for x = T/8 with coefficients /64 (LLGE:489-504): same root.
  const A3 = 8 * BRAKING_TARGETS.jdgZ;
  const A2 = 6 * BRAKING_TARGETS.adg[2];
  const A1 = (6 * vg[2] + 18 * BRAKING_TARGETS.vdg[2]) / 8;
  const A0 = (-24 * (rg[2] - BRAKING_TARGETS.rdg[2])) / 64;
  const x = r.ttg / 8;
  assert.ok(Math.abs(((A3 * x + A2) * x + A1) * x + A0) < 1e-6 * Math.abs(A0));
  // Bad roots give up after eight passes (→ alarm 01406).
  const bad = solveTtgDetailed({ rg: [0, 0, -1000], vg: [0, 0, 0], target: { ...BRAKING_TARGETS, jdgZ: 1e-9, adg: [0, 0, 1e-9], vdg: [0, 0, 0], rdg: [0, 0, 1000] }, guess: -1 });
  assert.equal(bad.converged, false);
  assert.ok(bad.passes <= 9);
});

// ---------- QUADGUID ----------

test('acceleration command: the published law and the coded lead', () => {
  const target = BRAKING_TARGETS;
  const rg = [5000, 0, -80000];
  const vg = [-40, 0, 900];
  const T = -150;
  const pub = [0, 1, 2].map((i) => target.adg[i] + (6 * (target.vdg[i] + vg[i])) / T + (12 * (target.rdg[i] - rg[i])) / (T * T));
  const noLead = accelCommand({ rg, vg, target, ttg: T, leadTime: 0 });
  for (let i = 0; i < 3; i++) near(noLead[i], pub[i], 1e-12, `component ${i}`);
  const c1 = leadCoefficients(T, 0);
  assert.deepEqual([c1.cV, c1.cR, c1.cVD, c1.cA], [1, 1, 1, 1]);
  // With LEADTIME −2.2 s: r = (T + 2.2)/T and the coefficients of LLGE:546-575.
  const c = leadCoefficients(T, -2.2);
  const r = (T + 2.2) / T;
  near(c.r, r, 1e-15);
  near(c.cV, 2 * r * r - r, 1e-15);
  near(c.cR, 3 * r * r - 2 * r, 1e-15);
  near(c.cVD, 4 * r * r - 3 * r, 1e-15);
  near(c.cA, 6 * r * r - 6 * r + 1, 1e-15);
  const lead = accelCommand({ rg, vg, target, ttg: T });
  for (let i = 0; i < 3; i++) {
    near(lead[i], c.cA * target.adg[i] + (6 * (c.cVD * target.vdg[i] + c.cV * vg[i])) / T + (12 * c.cR * (target.rdg[i] - rg[i])) / (T * T), 1e-12);
  }
  // The SAFEGUARD: within 2.2 s of the target r = 0.
  assert.equal(leadCoefficients(-1, -2.2).r, 0);
  // A state already on the target polynomial needs exactly the target's acceleration at T = 0 limit.
  assert.deepEqual(accelCommand({ rg, vg, target, ttg: 0 }), target.adg.slice());
});

test('P65 velocity nulling', () => {
  const a = p65Accel({ vg: [-3 * FPS, 0, 10] });
  near(a[0], 0, 1e-12);
  near(a[2], -1, 1e-12);
});

// ---------- AFCCALC + THROTTLE ----------

test('thrust command: gravity, |AFC| and the braking-component limit (AFCCALC)', () => {
  const mass = 10000;
  const gravity = [-1.6, 0, 0];
  const easy = thrustCommand({ acg: [0, 0, -1], gravity, mass, throttleState: { fcold: 0 } });
  near(easy.unfc[0], 1.6, 1e-12);
  near(easy.afc, Math.hypot(1.6, 1), 1e-12);
  assert.equal(easy.limited, false);
  near(easy.throttle, (easy.afc * mass) / DPS.ratedThrust, 1e-12, 'throttleable: FC');
  // More braking than HIGHESTF allows: z gives way, x kept, |AFC| unclipped.
  const hard = thrustCommand({ acg: [0, 0, -6], gravity, mass, throttleState: { fcold: 0 } });
  assert.equal(hard.limited, true);
  near(hard.unfc[0], 1.6, 1e-12);
  near(Math.hypot(hard.unfc[0], hard.unfc[2]), THROTTLE_LOGIC.highestF / mass, 1e-9);
  near(hard.afc, Math.hypot(1.6, 6), 1e-12);
  assert.equal(hard.mode, 'ftp');
  near(hard.throttle, DPS.ftpFraction, 1e-12);
});

test('throttle logic: FTP ↔ throttleable hysteresis (LOWCRIT 57 %, HIGHCRIT 63 %)', () => {
  const LOW = THROTTLE_LOGIC.lowCrit;
  const HIGH = THROTTLE_LOGIC.highCrit;
  near(LOW / DPS.ratedThrust, 0.57, 0.001);
  near(HIGH / DPS.ratedThrust, 0.63, 0.001);
  // After FLATOUT (FCOLD = 0) a big demand goes to the stop...
  let s = throttleLogic({ fc: 40000, fcold: 0 });
  assert.equal(s.mode, 'ftp');
  // ...and stays there while FC > LOWCRIT, even between the thresholds.
  s = throttleLogic({ fc: 28000, fp: DPS.ftpThrust, fcold: s.fcold });
  assert.equal(s.mode, 'ftp');
  // Throttle recovery at FC ≤ LOWCRIT.
  s = throttleLogic({ fc: LOW - 10, fp: DPS.ftpThrust, fcold: s.fcold });
  assert.equal(s.mode, 'throttleable');
  assert.equal(s.recovery, true);
  near(s.thrust, LOW - 10, 1e-9);
  // Between the thresholds it now stays throttleable...
  s = throttleLogic({ fc: 28000, fcold: s.fcold });
  assert.equal(s.mode, 'throttleable');
  // ...and goes back up only above HIGHCRIT.
  s = throttleLogic({ fc: HIGH + 10, fcold: s.fcold });
  assert.equal(s.mode, 'ftp');
  assert.equal(s.throttleUp, true);
  assert.equal(s.fcold, THROTTLE_LOGIC.fMaxPos);
});

// ---------- P66 ----------

test('P66: ROD clicks and the rate-of-descent law', () => {
  near(rodClick(-5 * FPS, 2), -3 * FPS, 1e-12);
  near(rodClick(-5 * FPS, -1), -6 * FPS, 1e-12);
  const mass = 7500;
  const gm = 1.62;
  // Steady at the desired rate, upright, measured = commanded: hover thrust.
  const hover = rodCommand({ hdot: -3 * FPS, vdgVert: -3 * FPS, gravity: gm, cosTilt: 1, mass, measuredAccel: gm });
  near(hover.afc, gm, 1e-12);
  // Tilted: more thrust; sinking too fast: more thrust (TAUROD 1.5 s).
  near(rodCommand({ hdot: -3 * FPS, vdgVert: -3 * FPS, gravity: gm, cosTilt: Math.cos(0.2), mass }).afc, gm / Math.cos(0.2), 1e-12);
  near(rodCommand({ hdot: -6 * FPS, vdgVert: -3 * FPS, gravity: gm, cosTilt: 1, mass }).afc, gm + (3 * FPS) / 1.5, 1e-12);
  // MINFORCE / MAXFORCE (980 / 6,300 lbf).
  near(rodCommand({ hdot: 0, vdgVert: -100, gravity: gm, cosTilt: 1, mass }).fc, GUIDANCE_PARAMS.minForce, 1e-6);
  near(rodCommand({ hdot: -100, vdgVert: 0, gravity: gm, cosTilt: 1, mass }).fc, GUIDANCE_PARAMS.maxForce, 1e-6);
  // The commander stand-in tilts back to slow down, and is limited.
  assert.ok(p66AttitudeAssist({ vHoriz: 10 * FPS, gravity: gm }) > 0);
  assert.equal(p66AttitudeAssist({ vHoriz: 200, gravity: gm }), 20);
});

// ---------- LPD ----------

test('LPD: LOOKANGL, TREDES and redesignation geometry', () => {
  // Pitch 45° (thrust tilted back), site 16° below the horizon → 61°.
  const h = 1000;
  const d = h / Math.tan((16 * Math.PI) / 180);
  const nav = { alt: h, altRate: 0, vHoriz: 0, range: d };
  const geo = toGuidanceFrame(nav);
  const bodyX = thrustDirFromPitch(45, geo.phi);
  near(lookAngle({ rg: geo.rg, bodyX }), 61, 0.1);
  assert.equal(lookAngleDisplay({ rg: geo.rg, bodyX }), 61);
  // TREDES = |TTF| − 34 s, 0..99 (TDISPSET); TLB: TR 82 at |TTF| ≈ 116 s.
  assert.equal(tredes(-172), 99);
  assert.equal(tredes(-116), 82);
  assert.equal(tredes(-34), 0);
  assert.equal(tredes(-20), 0);
  // One click forward (+el) moves the site farther; aft brings it closer.
  const far = redesignate({ nav, clicks: { el: 1 } });
  const close = redesignate({ nav, clicks: { el: -1 } });
  assert.ok(far.downrange > 0 && close.downrange < 0);
  // 0.5° at a 16° line of sight from 1,000 ft: ≈ d·(tan16/tan15.5 − 1).
  near(far.downrange, h / Math.tan((15.5 * Math.PI) / 180) - d, 3);
  // Azimuth clicks move it sideways (2° each), +az to the right.
  const right = redesignate({ nav, clicks: { az: 1 } });
  assert.ok(right.crossrange > 0 && Math.abs(right.downrange) < 5);
  near(right.crossrange, Math.hypot(h, d) * Math.tan((2 * Math.PI) / 180) * (d / Math.hypot(h, d)), 25);
  // DEPRCRIT keeps the line of sight ≥ ≈1.15° below the horizon.
  const flat = redesignate({ nav, clicks: { el: 60 } });
  near(Math.atan2(h, d + flat.downrange) * (180 / Math.PI), Math.asin(0.02) * (180 / Math.PI), 0.15);
  // shiftSite: range to the moved site.
  near(shiftSite(nav, far).range, d + far.downrange, 1e-9);
});

// ---------- LandingGuidance sequencing ----------

test('LandingGuidance: phase switch at TTF > −62 s, STARTP64 adds DELTTFAP, P65 at −12 s', () => {
  const g = new LandingGuidance();
  g.start({ t: 0, phase: 'braking', ttfGuess: -70 });
  const nav = { alt: 9000 * FT, altRate: -140 * FPS, vHoriz: 700 * FPS, range: 40000 * FT, mass: 9000, thrust: 26000, pitch: 55 };
  // Advance the TTF with passes; geometry fixed so Newton returns ≈ the same root.
  const root = solveTtg({ ...toGuidanceFrame(nav), target: BRAKING_TARGETS, guess: -70 });
  const out = g.pass(nav, 2);
  near(out.ttf, root, 0.5);
  assert.equal(out.phase, 'braking');
  // Force the TTF near the switch and check the next phases.
  g.s.ttf = -63;
  const navNear = { alt: 7200 * FT, altRate: -125 * FPS, vHoriz: 510 * FPS, range: 26500 * FT, mass: 8700, thrust: 26000, pitch: 55 };
  let o = g.pass(navNear, 4);
  const sw = o.switchPhase === 'approach' ? o : g.pass(navNear, 6);
  assert.equal(sw.switchPhase, 'approach');
  assert.ok(sw.ttf > -62, 'EXTLOGIC: TENDBRAK + TTF > 0');
  assert.equal(sw.phase, 'braking', 'this pass still exits as P63');
  const before = g.s.ttf;
  o = g.pass(navNear, sw === o ? 6 : 8);
  assert.equal(o.newProgram, 64);
  assert.equal(o.phase, 'approach');
  // STARTP64: TTF += −110 s, then Newton refines it for the approach targets.
  const guess = before + APPROACH_TARGETS.deltaTtf + 2;
  near(o.ttf, solveTtg({ ...toGuidanceFrame(navNear), target: APPROACH_TARGETS, guess }), 1e-6);
  assert.ok(o.ttf < -150 && o.ttf > -200);
  assert.equal(o.redFlag, false);
  g.proceedP64();
  assert.equal(g.s.redFlag, true);
  // Display values.
  assert.ok(o.display.TREDES > 0 && o.display.LOOKANGL > 40 && o.display.LOOKANGL < 80);
  near(o.display.RANGEDSP, Math.hypot(...toGuidanceFrame(navNear).rg), 1e-6);
  // A redesignation click moves the site at the next pass and is reported.
  g.addLpdClicks({ el: 2 });
  const red = g.pass(navNear, 10);
  assert.ok(red.redesignation && red.redesignation.downrange > 0);
  assert.equal(red.siteShift.downrange, red.redesignation.downrange);
  // P66 entry keeps the sink rate; clicks change it by 1 ft/s each.
  g.startP66({ ...navNear, altRate: -12 * FPS }, 12);
  assert.equal(g.phase, 'rod');
  const r1 = g.rodPass({ ...navNear, altRate: -12 * FPS, measuredAccel: 3 }, 13, 3);
  near(r1.vdgVert, -9 * FPS, 1e-12);
  assert.equal(r1.program, 66);
  assert.equal(r1.thrustDir, null, 'P66 leaves attitude to the commander');
});

test('LandingGuidance.start: approach entered directly (presets) without a second STARTP64', () => {
  const nav = navOf({ ...stateFromTrack(APOLLO11_DESCENT, '102:41:34'), thrust: 26000 });
  const fresh = new LandingGuidance().start({ t: 0, phase: 'approach' });
  const o1 = fresh.pass(nav, 2);
  assert.equal(o1.newProgram, 64);
  const entered = new LandingGuidance().start({ t: 0, phase: 'approach', entered: true });
  assert.equal(entered.state.ttf, -172);
  const o2 = entered.pass(nav, 2);
  assert.equal(o2.newProgram, null);
  assert.equal(o2.program, 64);
  near(o2.ttf, o1.ttf, 1e-6, 'same TTF either way');
});

test('LandingGuidance: a bad root raises 01406 and keeps the last commands', () => {
  const g = new LandingGuidance({ params: { ...GUIDANCE_PARAMS, rootMaxPasses: 0 } });
  g.start({ t: 0, ttfGuess: -600 });
  const nav = stateFromTrack(APOLLO11_DESCENT, '102:35:00');
  const o = g.pass(navOf({ ...nav, thrust: DPS.ftpThrust }), 2);
  assert.equal(o.alarm, 0o1406);
  assert.equal(o.throttle, null);
});

// ---------- closed loop ----------

// BURNBABY-like start at PDI (10 % for the trim period, P63ZOOM at nominal
// TIG + 26 s with FLATOUT), guidance every 2 s, P64 and — standing in for
// the crew — an automatic P66 with a nominal −3 ft/s ROD when P64 hands
// over (TTF > −12 s), horizontal velocity nulled by p66AttitudeAssist,
// engine stop 1 s after the contact light.
function flyDescent({ start = '102:33:05.01', phase = 'braking', seed = 1969, rodTarget = -3, maxT = 900 } = {}) {
  const v = new LmPhysics({ rng: createRng(seed).fork('vehicle'), startGET: start });
  const g = new LandingGuidance();
  const pdi = APOLLO11_DESCENT.pdiGET;
  const zoom = APOLLO11_DESCENT.zoomGET;
  const t0 = v.t;
  const cmd = { engineOn: true, throttle: v.state.throttle || 0.1, thrustDir: null, pitch: null };
  const ev = {};
  const rows = [];
  let t = t0;
  let guiding = false;
  let rod = phase === 'rod';
  let nextPass = t0 + 0.1;
  let nextRod = t0;
  let nextRow = t0;
  let contactT = null;
  if (phase === 'approach') { g.start({ t: t0, phase: 'approach', ttfGuess: -BRAKING_TARGETS.tend }); guiding = true; nextPass = t0; }
  if (rod) { g.startP66(navOf(v.state), t0); ev.p66 = { t: t0, alt: v.state.alt }; }
  while (!v.state.landed && t < t0 + maxT) {
    const s = v.state;
    if (!guiding && !rod && t >= zoom) {
      guiding = true;
      g.start({ t });            // P63ZOOM: LUNLAND connected …
      cmd.throttle = 1;          // … and FLATOUT (the stop)
      ev.zoom = t;
    }
    if (guiding && !rod && t >= nextPass - 1e-9) {
      nextPass += 2;
      const out = g.pass(navOf(s), t);
      if (out.alarm) ev.alarm = out.alarm;
      if (out.recovery && !ev.throttleDown) ev.throttleDown = { t, alt: s.alt };
      if (out.newProgram === 64) ev.p64 = { t, alt: s.alt, altRate: s.altRate, vHoriz: s.vHoriz, range: s.range, ttf: out.ttf, pitch: s.pitch };
      if (out.throttle !== null) cmd.throttle = out.throttle;
      if (out.thrustDir) cmd.thrustDir = out.thrustDir;
      if (out.switchPhase === 'vertical') {
        rod = true;
        g.startP66(navOf(s), t);
        nextRod = t;
        cmd.thrustDir = null;
        ev.p66 = { t, alt: s.alt };
      }
    }
    if (rod && t >= nextRod - 1e-9) {
      nextRod += 1;
      const vdg = g.state.vdgVert / FPS;
      const clicks = vdg < rodTarget - 0.5 ? 1 : vdg > rodTarget + 0.5 ? -1 : 0;
      const out = g.rodPass(navOf(s), t, clicks);
      cmd.throttle = out.throttle;
      cmd.thrustDir = null;
      cmd.pitch = p66AttitudeAssist({ vHoriz: s.vHoriz, gravity: MOON_MU / (MOON_RADIUS + s.alt) ** 2 });
    }
    if (s.contact && contactT === null) { contactT = t; ev.contact = t; }
    if (contactT !== null && t >= contactT + 1) cmd.engineOn = false;
    if (t >= nextRow - 1e-9) {
      nextRow += 30;
      rows.push({ tfi: t - pdi, phase: g.phase || 'trim', s: { ...s }, ttf: g.state ? g.state.ttf : null });
    }
    v.step(0.01, cmd, t + 0.01);
    t += 0.01;
  }
  return { v, ev, rows, final: { ...v.state } };
}

function table(run) {
  const pdi = APOLLO11_DESCENT.pdiGET;
  const head = '  TFI  phase      alt ft   ḣ ft/s  vH ft/s   range ft  thr %  pitch  fuel %    TTF s';
  const lines = run.rows.map(({ tfi, phase, s, ttf }) => [
    `${Math.round(tfi)}`.padStart(5), phase.padEnd(9), toFt(s.alt).toFixed(0).padStart(8),
    toFps(s.altRate).toFixed(1).padStart(8), toFps(s.vHoriz).toFixed(0).padStart(8),
    toFt(s.range).toFixed(0).padStart(10), (s.throttle * 100).toFixed(1).padStart(6),
    s.pitch.toFixed(1).padStart(6), (s.fuelFrac * 100).toFixed(1).padStart(7),
    (ttf === null ? '' : ttf.toFixed(1)).padStart(8),
  ].join(' '));
  const f = run.final;
  const e = run.ev;
  const at = (x) => `${formatGET(x, { tenths: true })} (TFI ${(x - pdi).toFixed(1)} s)`;
  const extra = [
    e.throttleDown && `throttle-down ${at(e.throttleDown.t)} at ${toFt(e.throttleDown.alt).toFixed(0)} ft   [Apollo 11: 102:39:31, TFI 386 s; predicted 384 s]`,
    e.p64 && `P64 ${at(e.p64.t)} at ${toFt(e.p64.alt).toFixed(0)} ft, ${toFps(e.p64.altRate).toFixed(1)} ft/s, ${toFps(e.p64.vHoriz).toFixed(0)} ft/s fwd, ${toFt(e.p64.range).toFixed(0)} ft to go, TTF ${e.p64.ttf.toFixed(1)} s   [Apollo 11: 102:41:32, 7,129 ft, −125 ft/s; BEN70 nominal 8:26, 7,515 ft, −145 ft/s, 506 ft/s]`,
    e.p66 && `P66 ${at(e.p66.t)} at ${toFt(e.p66.alt).toFixed(0)} ft`,
    e.contact && `contact light ${at(e.contact)}`,
    f.touchdown && `touchdown ${at(f.touchdown.t)}: ${toFps(f.touchdown.vVert).toFixed(2)} ft/s vertical, ${toFps(f.touchdown.vHoriz).toFixed(2)} ft/s horizontal, tilt ${f.touchdown.tilt.toFixed(1)}°, ${f.touchdown.verdict}; fuel ${(f.fuelFrac * 100).toFixed(2)} %, ${toFt(f.range).toFixed(0)} ft from the aim point`,
  ].filter(Boolean);
  return [head, ...lines, ...extra].join('\n');
}

test('closed loop: guided descent from the Apollo 11 PDI state to a safe landing', (t) => {
  const run = flyDescent();
  t.diagnostic('guided descent from PDI (physics + Luminary 099 guidance, automatic P66 at −3 ft/s):');
  for (const line of table(run).split('\n')) t.diagnostic(line);
  const { ev, final } = run;
  const pdi = APOLLO11_DESCENT.pdiGET;
  assert.equal(ev.alarm, undefined, 'no 1406');
  assert.ok(ev.zoom && Math.abs(ev.zoom - APOLLO11_DESCENT.zoomGET) < 0.02);
  // Throttle recovery near the flown 386 s.
  assert.ok(ev.throttleDown, 'throttle recovery happened');
  near(ev.throttleDown.t - pdi, 386, 15, 'throttle-down TFI');
  // High gate near 7,000 ft about 8–9 min after ignition.
  assert.ok(ev.p64, 'P64 reached');
  const tfi64 = ev.p64.t - pdi;
  assert.ok(tfi64 > 480 && tfi64 < 540, `P64 at TFI ${tfi64.toFixed(1)} s`);
  near(toFt(ev.p64.alt), 7300, 800, 'high-gate altitude');
  near(toFps(ev.p64.altRate), -140, 25, 'high-gate sink rate');
  near(toFt(ev.p64.range), 26000, 3000, 'range to the aim point at high gate');
  assert.ok(ev.p64.ttf < -150 && ev.p64.ttf > -200, 'P64 TTF ≈ −172 s');
  // P66 near the P65 hand-over height (≈150 ft) and a safe landing with fuel left.
  assert.ok(ev.p66 && toFt(ev.p66.alt) > 80 && toFt(ev.p66.alt) < 300);
  assert.ok(final.landed, 'landed');
  assert.equal(final.touchdown.verdict, 'safe');
  assert.ok(Math.abs(toFps(final.touchdown.vHoriz)) < 1.5);
  assert.ok(final.fuelFrac > 0.03, `fuel left ${(final.fuelFrac * 100).toFixed(2)} %`);
  assert.ok(!final.depleted);
  assert.ok(Math.abs(toFt(final.range)) < 300, 'lands near the aim point');
  const tfiTd = final.touchdown.t - pdi;
  assert.ok(tfiTd > 680 && tfiTd < 780, `touchdown TFI ${tfiTd.toFixed(1)} s (nominal 11:54 = 714 s)`);
});

test('closed loop: deterministic with the seed', () => {
  const a = flyDescent({ seed: 42, maxT: 200 });
  const b = flyDescent({ seed: 42, maxT: 200 });
  assert.deepEqual(a.final, b.final);
});

test('closed loop: presets at high gate (P64) and low gate (P66) land safely', (t) => {
  const hg = flyDescent({ start: '102:41:32', phase: 'approach' });
  assert.ok(hg.final.landed && hg.final.touchdown.verdict === 'safe');
  assert.ok(Math.abs(toFt(hg.final.range)) < 300);
  const lg = flyDescent({ start: '102:43:22', phase: 'rod' });
  assert.ok(lg.final.landed && lg.final.touchdown.verdict === 'safe');
  assert.ok(lg.final.fuelFrac > 0.01);
  t.diagnostic(`from high gate: touchdown ${formatGET(hg.final.touchdown.t)}, fuel ${(hg.final.fuelFrac * 100).toFixed(1)} %; `
    + `from P66 at 102:43:22: touchdown ${formatGET(lg.final.touchdown.t)} (Apollo 11: 102:45:39.9), fuel ${(lg.final.fuelFrac * 100).toFixed(1)} % (Apollo 11: 4.2 %)`);
  assert.ok(LM.dpsAtCutoff > 0);
});
