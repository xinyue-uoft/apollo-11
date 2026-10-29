// The Lunar Module programs (js/agc/programs/lm/): BURNBABY's table-driven
// ignition sequence at the listing's times, V99 and PRO, the P63 entry
// dialog, SERVICER-driven guidance and displays, P63 → P64 → P66 → P68,
// restarts, the navigation estimate and the crew controls — run against the
// real DSKY, PINBALL, Executive, Workload, Restart, vehicle and guidance
// modules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../js/sim.js';
import { parseGET, formatGET } from '../js/util/time.js';
import { FT, FPS } from '../js/util/units.js';
import { TRACKS } from '../js/data/tracks.js';
import { PRESETS } from '../js/data/presets.js';
import {
  IGNITION_TABLES, indexWhich, decodeVN, BURN_TIMING, TIG_APOLLO11, DISPDEX,
} from '../js/agc/programs/lm/burnbaby.js';
import { APOLLO11_LANDING } from '../js/agc/programs/lm/landing.js';
import { NAV_MODEL } from '../js/agc/nav.js';

const TIG = TIG_APOLLO11;
const track = TRACKS.apollo11Descent;

function make(opts = {}) {
  return new Simulation({ software: 'Luminary099', vehicle: 'replay', replayTrack: track, initialProgram: 63, ...opts });
}

function fromPreset(id, extra = {}) {
  const p = PRESETS.find((x) => x.id === id);
  const s = new Simulation({
    software: p.software, vehicle: p.vehicle, startGET: p.startGET,
    replayTrack: p.track ? TRACKS[p.track] : null, initialProgram: p.initialProgram ?? null,
    vehicleOptions: p.vehicleOptions || {}, agcOptions: { ...(p.agcOptions || {}), ...extra },
  });
  if (typeof p.setup === 'function') p.setup(s);
  return s;
}

// Step to GET `get` in 0.05-s chunks, calling `each(sim)` after each chunk.
function runTo(sim, get, each) {
  const goal = parseGET(get);
  while (sim.t < goal - 1e-9) {
    sim.step(Math.min(0.05, goal - sim.t + 1e-9));
    if (each) each(sim);
  }
}

function on(sim, types) {
  const out = [];
  for (const type of types) sim.outBus.on(type, (p) => out.push({ type, ...p }));
  return out;
}

const d = (sim) => sim.agc.dsky;
const vn = (sim) => `V${d(sim).verb}N${d(sim).noun}${d(sim).flashVerbNoun ? '*' : ''}`;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

// ---------------------------------------------------------------- tables

test('the WHICH tables keep the listing’s offsets and meanings (octal offsets)', () => {
  const t = IGNITION_TABLES.P63TABLE;
  assert.equal(t.line, 127);
  assert.deepEqual(decodeVN(indexWhich(t, 0o0).VN), { verb: 6, noun: 62 });
  assert.equal(indexWhich(t, 0o1).TCF, 'ULLGNOT');
  assert.equal(indexWhich(t, 0o3).TCF, 'V99RECYC');
  assert.equal(indexWhich(t, 0o6).DEC, 2240, 'ullage 22.40 s after TIG-30');
  assert.equal(indexWhich(t, 0o7)['2CADR'], 'SERVEXIT');
  assert.equal(indexWhich(t, 0o11).TCF, 'DISPCHNG', '(11) octal = 10th word');
  assert.equal(indexWhich(t, 0o13).TCF, 'P63IGN');
  assert.equal(indexWhich(IGNITION_TABLES.P40TABLE, 0o14).TCF, 'REP40ALM');
  assert.equal(indexWhich(IGNITION_TABLES.P42TABLE, 0o6).DEC, 2640);
  assert.equal(indexWhich(IGNITION_TABLES.P12TABLE, 0o6).DEC, 0, 'P12: no ullage');
  assert.throws(() => indexWhich(IGNITION_TABLES.P41TABLE, 0o0), /no word/);
  assert.equal(BURN_TIMING.D29_9SEC, 29.9);
  assert.equal(BURN_TIMING.S24_9SEC, 24.9);
  assert.equal(DISPDEX.VB99DEX, 0o13);
});

// ----------------------------------------------------- the ignition sequence

test('BURNBABY: every event at the listing’s time relative to TIG (±0.05 s), displays on the clock', () => {
  const sim = make({ startGET: '102:32:00' });
  const burn = on(sim, ['burn']);
  const seen = {};
  const grab = (name, at) => { if (!seen[name] && sim.t >= TIG + at) seen[name] = { vn: vn(sim), prog: d(sim).prog, r2: d(sim).r[1].digits, alt: d(sim).lights.alt }; };
  runTo(sim, '102:33:02.5', (s) => {
    grab('blank', -31);
    grab('back', -28);
    grab('v99', -4.5);
  });
  sim.agc.keys('P');
  runTo(sim, '102:33:40', () => grab('after', 3));
  const rel = Object.fromEntries(burn.map((e) => [e.id, e.rel]));
  const expected = { tig35: -34.9, tig30: -29.9, ullage: -7.5, tig5: -5.0, ignition: 0, ullageOff: 0.5, zoom: 26.0 };
  for (const [id, r] of Object.entries(expected)) {
    assert.ok(id in rel, `event ${id} fired`);
    near(rel[id], r, 0.05, id);
  }
  assert.ok(rel.pro > -5 && rel.pro < 0, 'PRO between TIG-5 and TIG');
  // TIG-35 blanks everything but PROG; the countdown returns after TIG-30.
  assert.equal(seen.blank.vn, 'V  N  ');
  assert.equal(seen.blank.prog, '63');
  assert.equal(seen.back.vn, 'V06N62');
  assert.equal(seen.v99.vn, 'V99N62*', 'V99N62 flashing at TIG-5');
  assert.equal(seen.v99.alt, true, 'ALT lamp on: LR reads requested below 50,000 ft, no data');
  assert.equal(seen.after.vn, 'V06N63', 'P63IGN: V06N63 after ignition');
  // Events carry source anchors; snapshot.burn §6.9.1.
  const snap = sim.snapshot().agc.burn;
  assert.equal(snap.program, 63);
  assert.equal(snap.tig, TIG);
  assert.ok(snap.events.every((e) => typeof e.anchor === 'string' && e.anchor.startsWith('burn.')));
  assert.ok(['throttle-up', 'burning'].includes(snap.phase));
  assert.equal(sim.agc.workload.averageG, true);
});

test('V99 waits for PRO: no ignition at TIG without it; a late PRO ignites at once, ZOOM stays at nominal TIG + 26 s', () => {
  const sim = make({ vehicle: 'static', startGET: '102:32:20' });
  const burn = on(sim, ['burn']);
  runTo(sim, formatGET(TIG + 3, { tenths: true }));
  const b = sim.agc.landing.burn;
  assert.equal(b.flags.ENGONFLG, false, 'no ignition');
  assert.equal(sim.agc.vehicleCommands().engineOn, false);
  assert.equal(vn(sim), 'V99N62*', 'V99 keeps flashing');
  assert.ok(sim.agc.erasable.TTOGO > 1.5, 'TTOGO counts up past TIG');
  sim.agc.keys('P');
  runTo(sim, formatGET(TIG + 4, { tenths: true }));
  const ign = burn.find((e) => e.id === 'ignition');
  assert.ok(ign, 'ignition after PRO');
  assert.ok(ign.rel > 3 && ign.rel < 3.3, `ignition ${ign.rel.toFixed(2)} s after TIG`);
  assert.equal(sim.agc.vehicleCommands().engineOn, true);
  runTo(sim, formatGET(TIG + 27, { tenths: true }));
  near(burn.find((e) => e.id === 'zoom').rel, 26, 0.05, 'ZOOM after nominal TIG');
});

test('V34 on V99 terminates: no ignition, flashing V37 (GOTOPOOH)', () => {
  const sim = make({ vehicle: 'static', startGET: '102:32:50' });
  runTo(sim, '102:33:01');
  sim.agc.keys('V34E', { gapMs: 200 });
  runTo(sim, '102:33:08');
  assert.equal(sim.agc.landing.burn.flags.ENGONFLG, false);
  assert.equal(d(sim).verb, '37');
  assert.equal(d(sim).flashVerbNoun, true);
  assert.equal(sim.agc.vehicleCommands().ullage, false, 'ullage off (NULLCLOK)');
});

test('P63 by V37: V06N61, the R51 option V50N25 00014, R60 V50N18, then BURNBABY counts down V06N62', () => {
  const sim = new Simulation({ software: 'Luminary099', vehicle: 'static', startGET: '102:10:00', initialProgram: 0 });
  sim.agc.keys('V37E63E', { gapMs: 300 });
  runTo(sim, '102:10:08');
  assert.equal(sim.agc.mode, 63);
  assert.equal(vn(sim), 'V06N61*', 'IGNALG done: flashing V06N61');
  assert.equal(sim.agc.erasable.TIG, TIG, 'TIG = Apollo 11 TIG');
  assert.equal(d(sim).r[1].sign, '-', 'R2 time from ignition, negative');
  sim.agc.keys('P');
  runTo(sim, '102:10:10');
  assert.equal(vn(sim), 'V50N25*');
  assert.equal(d(sim).r[0].digits, '00014', 'checklist code 00014: fine-align option');
  sim.agc.keys('E');
  runTo(sim, '102:10:12');
  assert.equal(vn(sim), 'V50N18*', 'R60: please perform auto maneuver');
  assert.equal(d(sim).r[0].digits, '18200', 'N18 R1 roll 182.00');
  sim.agc.keys('P');
  runTo(sim, '102:10:14');
  assert.equal(vn(sim), 'V06N18', 'static V06N18 during the maneuver');
  runTo(sim, '102:10:20');
  assert.equal(vn(sim), 'V50N18*', 'maneuver done: V50N18 again');
  sim.agc.keys('E');
  runTo(sim, '102:10:26');
  assert.equal(vn(sim), 'V06N62', 'BURNBABY countdown');
  const burn = sim.snapshot().agc.burn;
  near(burn.events.find((e) => e.id === 'tig35').t, TIG - 34.9, 0.001, 'TIG-35 scheduled');
});

test('TIG too close: alarm 01703 and TIG slipped to integration end + 29.9 s', () => {
  const sim = new Simulation({ software: 'Luminary099', vehicle: 'static', startGET: '102:32:00', initialProgram: 0, agcOptions: { tig: '102:32:40' } });
  const alarms = on(sim, ['alarm']);
  sim.agc.keys('V37E63E', { gapMs: 200 });
  runTo(sim, '102:32:06');
  sim.agc.keys('P');
  runTo(sim, '102:32:08');
  sim.agc.keys('E');
  runTo(sim, '102:32:10');
  sim.agc.keys('E');
  runTo(sim, '102:32:14');
  assert.ok(alarms.some((a) => a.code === 0o1703), 'alarm 01703');
  const tig = sim.agc.erasable.TIG;
  assert.ok(tig > parseGET('102:32:40') + 20, `TIG slipped to ${formatGET(tig, { tenths: true })}`);
  assert.ok(tig - sim.t > 45 && tig - sim.t < 52);
});

// --------------------------------------------------- SERVICER-driven passes

test('guidance and displays update on SERVICER passes only; a starved SERVICER freezes them', () => {
  const sim = make({ startGET: '102:35:00' });
  runTo(sim, '102:35:05');
  const changes = [];
  let last = d(sim).r[2].digits;
  let lastPass = sim.agc.workload.lastPassT;
  let passes = 0;
  runTo(sim, '102:35:25', (s) => {
    if (s.agc.workload.lastPassT !== lastPass) {
      passes += 1;
      lastPass = s.agc.workload.lastPassT;
    }
    const r3 = d(s).r[2].digits;
    if (r3 !== last) {
      changes.push({ t: s.t, pass: s.agc.workload.lastPassT });
      last = r3;
    }
  });
  assert.ok(passes >= 9 && passes <= 11, `${passes} passes in 20 s`);
  assert.ok(changes.length >= 9, 'R3 (altitude) changes every pass');
  for (const c of changes) assert.ok(c.t - c.pass < 0.06, 'each change at a SERVICER completion');
  // Starve the machine: almost every memory cycle stolen.
  sim.agc.exec.setSteal('test', 0.995);
  const frozen = d(sim).r[2].digits;
  const altBefore = sim.vehicle.state.alt;
  runTo(sim, '102:35:31');
  assert.equal(d(sim).r[2].digits, frozen, 'display frozen');
  assert.ok(altBefore - sim.vehicle.state.alt > 100 * FT, 'while the LM keeps descending');
  sim.agc.exec.setSteal('test', 0);
});

// ------------------------------------------------------------ restarts

test('1202 via the Executive: software restart, V16N68 monitor dropped, V06N63 back on the next pass, guidance continues', () => {
  const sim = make({ startGET: '102:37:40' });
  const ev = on(sim, ['alarm', 'restart', 'mode']);
  runTo(sim, '102:38:06');
  sim.agc.keys('V16N68E');
  runTo(sim, '102:38:12');
  assert.equal(vn(sim), 'V16N68');
  assert.ok(sim.agc.pinball.state.monitor, 'monitor running');
  near(sim.agc.erasable.DELTAH, -2900, 250, 'N68 R3 DELTAH ≈ −2,900 ft');
  // Fill the core sets until the Executive overflows (NOVAC → 1202).
  for (let i = 0; i < 12; i++) {
    if (!sim.agc.exec.requestJob({ name: `JUNK${i}`, prio: 0o05, vac: false, workMs: 99999 })) break;
  }
  const passesBefore = sim.agc.workload.passes;
  runTo(sim, '102:38:12.1');
  const alarm = ev.find((e) => e.type === 'alarm');
  assert.equal(alarm.code, 0o1202);
  const restart = ev.find((e) => e.type === 'restart');
  assert.ok(restart.groups.some((g) => g.group === 5), 'group 5 (SERVICER) re-entered');
  assert.equal(sim.agc.pinball.state.monitor, null, 'monitor killed (MONSAVE zeroed)');
  assert.equal(d(sim).lights.prog, true);
  assert.equal(d(sim).lights.restart, false);
  runTo(sim, '102:38:16');
  assert.equal(vn(sim), 'V06N63', 'the guidance display is back');
  assert.ok(sim.agc.workload.passes > passesBefore, 'SERVICER passes resumed');
  assert.equal(sim.agc.mode, 63);
  runTo(sim, '102:41:33');
  assert.equal(sim.agc.mode, 64, 'and the descent goes on to P64');
  assert.ok(!ev.some((e) => e.type === 'alarm' && e.t > parseGET('102:38:13')), 'no further alarms without the RR fault');
});

test('a restart during the countdown re-creates the ignition tasks from the restart groups', () => {
  const sim = make({ vehicle: 'static', startGET: '102:32:30' });
  const burn = on(sim, ['burn']);
  runTo(sim, formatGET(TIG - 20, { tenths: true }));
  sim.agc.bailout(0o1202);
  runTo(sim, formatGET(TIG - 3, { tenths: true }));
  assert.equal(sim.agc.restart.count, 1);
  sim.agc.keys('P');
  runTo(sim, formatGET(TIG + 1, { tenths: true }));
  near(burn.find((e) => e.id === 'ullage').rel, -7.5, 0.05, 'ullage still at TIG-7.5');
  near(burn.find((e) => e.id === 'tig5').rel, -5, 0.05, 'TIG-5 still on time');
  near(burn.find((e) => e.id === 'ignition').rel, 0, 0.05, 'ignition on time');
});

// ----------------------------------------------------------- P64, LPD

test('replay: P64 at 102:41:32, flashing V06N64 until PRO, N64 R1 = TREDES and the LPD angle', () => {
  const sim = make({ startGET: '102:41:20' });
  const modes = on(sim, ['mode']);
  runTo(sim, '102:41:33');
  const m = modes.find((e) => e.mode === 64);
  near(m.t, APOLLO11_LANDING.p64, 0.05, 'P64 at the historical time');
  assert.equal(vn(sim), 'V06N64*');
  assert.equal(sim.agc.workload.phase, 'P64');
  assert.equal(d(sim).r[0].digits.slice(0, 2), '99', 'TREDES saturates at 99 s');
  runTo(sim, '102:42:33');
  sim.agc.keys('P');
  runTo(sim, '102:42:35');
  assert.equal(vn(sim), 'V06N64', 'static after PRO (P64CEED)');
  assert.equal(sim.agc.flags.REDFLAG, true);
  // LPD angle against the crew's readouts (ALSJ): 35° at 102:43:01, 33° at 102:43:07.
  runTo(sim, '102:43:01');
  near(Number(d(sim).r[0].digits.slice(3)), 35, 3, 'LPD angle at 102:43:01');
  runTo(sim, '102:43:07.5');
  near(Number(d(sim).r[0].digits.slice(3)), 33, 3, 'LPD angle at 102:43:07');
});

test('physics: the guidance flies P63 from PDI and switches to P64 when TTF > −62 s', () => {
  const sim = fromPreset('lm-pdi');
  const modes = on(sim, ['mode']);
  runTo(sim, '102:33:02');
  sim.agc.keys('P');
  runTo(sim, '102:38:44');
  sim.agc.keys('V57E');
  let atP64 = null;
  runTo(sim, '102:42:20', (s) => {
    if (!atP64 && s.agc.mode === 64) atP64 = { t: s.t, alt: s.vehicle.state.alt, ttg: s.agc.landing.ttf };
  });
  assert.ok(atP64, 'P64 reached');
  const p64 = modes.find((e) => e.mode === 64);
  near(p64.t, APOLLO11_LANDING.p64, 45, 'P64 time (Apollo 11: 102:41:32)');
  assert.ok(atP64.alt > 4500 * FT && atP64.alt < 10000 * FT, `high gate at ${(atP64.alt / FT).toFixed(0)} ft`);
  near(atP64.ttg, -172, 6, 'TTF after STARTP64 (−62 − 110 s)');
  assert.ok(sim.agc.nav.lrIncorporating !== undefined);
  assert.ok(Math.abs(sim.agc.nav.errAlt) < 300 * FT, 'V57: the estimate converged on the radar');
  assert.equal(vn(sim), 'V06N64*');
});

test('P64 LPD: clicks are ignored before PRO and move the landing site after it', () => {
  const sim = fromPreset('lm-highgate');
  runTo(sim, '102:41:36');
  assert.equal(sim.agc.mode, 64);
  sim.agc.crewInput('lpd', { dx: 0, dy: 2 });
  runTo(sim, '102:41:40');
  assert.equal(sim.agc.landing.siteShift.downrange, 0, 'before PRO: no redesignation');
  sim.agc.keys('P');
  runTo(sim, '102:41:43');
  assert.equal(sim.agc.flags.REDFLAG, true);
  sim.agc.crewInput('lpd', { dx: 0, dy: 2 });
  runTo(sim, '102:41:48');
  assert.ok(sim.agc.landing.siteShift.downrange > 0, `site moved ${sim.agc.landing.siteShift.downrange.toFixed(0)} m downrange (stick forward = farther)`);
  assert.ok(sim.agc.vehicleCommands().lpd.downrange > 0, 'the vehicle gets the shifted site');
});

// ----------------------------------------------------------- P66, P68

test('ROD switch: clicks outside ATT HOLD are discarded; ATT HOLD + click → P66; each click = 1 ft/s', () => {
  const sim = make({ startGET: '102:43:00', initialProgram: 64 });
  const modes = on(sim, ['mode']);
  runTo(sim, '102:43:01');
  sim.agc.crewInput('rodClick', 1);
  runTo(sim, '102:43:04');
  assert.equal(sim.agc.mode, 64, 'AUTO: GUILDRET discards the click');
  assert.equal(sim.agc.erasable.RODCOUNT, 0);
  sim.agc.crewInput('pgnsMode', 'attHold');
  runTo(sim, '102:43:05');
  assert.equal(sim.agc.mode, 64, 'ATT HOLD alone does not start P66');
  sim.agc.crewInput('rodClick', 1);
  const tClick = sim.t;
  runTo(sim, '102:43:08');
  const p66 = modes.find((e) => e.mode === 66);
  assert.ok(p66 && p66.t - tClick <= 2.1, 'P66 at the next guidance pass');
  assert.equal(vn(sim), 'V06N60');
  const L = sim.agc.landing;
  const hdotAtEntry = L.vdgVert - 1 * FPS;
  assert.ok(Math.abs(hdotAtEntry - sim.agc.nav.altRate) < 4 * FPS, 'VDGVERT started at the present altitude rate');
  const r0 = sim.snapshot().agc.crew.rodRate;
  sim.agc.crewInput('rodClick', 1);
  sim.agc.crewInput('rodClick', 1);
  runTo(sim, '102:43:10');
  near(sim.snapshot().agc.crew.rodRate - r0, 2 * FPS, 1e-9, 'two clicks = +2 ft/s');
  sim.agc.crewInput('rodClick', -3);
  runTo(sim, '102:43:12');
  near(sim.snapshot().agc.crew.rodRate - r0, -1 * FPS, 1e-9, 'three down = −3 ft/s');
});

test('physics low gate: ROD clicks fly the LM down; touchdown, ENGINE STOP, V37E68E → P68 (V06N43)', () => {
  const sim = fromPreset('lm-lowgate');
  runTo(sim, '102:43:23');
  assert.equal(sim.agc.mode, 66);
  const L = sim.agc.landing;
  // Dial the sink rate to about 3 ft/s.
  const clicks = Math.round((-3 * FPS - L.vdgVert) / FPS);
  sim.agc.crewInput('rodClick', clicks);
  let td = null;
  runTo(sim, '102:47:00', (s) => { if (!td && s.vehicle.state.touchdown) td = s.vehicle.state.touchdown; });
  assert.ok(td, 'touched down');
  assert.ok(Math.abs(td.vVert) < 5 * FPS, `vertical speed ${(td.vVert / FPS).toFixed(1)} ft/s`);
  assert.equal(sim.agc.vehicleCommands().engineOn, false, 'engine stopped after touchdown');
  assert.equal(sim.agc.mode, 66, 'P68 is never entered automatically');
  sim.agc.keys('V37E68E', { gapMs: 300 });
  runTo(sim, '102:47:04');
  assert.equal(sim.agc.mode, 68);
  assert.equal(vn(sim), 'V06N43*', '"NOW LOOK WHERE YOU ENDED UP"');
  assert.equal(sim.agc.workload.phase, 'landed');
  assert.equal(sim.agc.workload.averageG, false, 'V37 stopped Average-G');
  assert.equal(sim.agc.flags.SURFFLAG, true);
  near(sim.agc.erasable.LAT, 0.691, 0.05, 'latitude');
  near(sim.agc.erasable.LONG, 23.72, 0.1, 'longitude');
  sim.agc.keys('P');
  runTo(sim, '102:47:06');
  assert.equal(d(sim).verb, '37', 'PRO → GOTOPOOH: flashing V37');
  assert.equal(sim.agc.mode, 68);
});

test('replay landing: P68 shows the onboard landing-site solution (MR Table 5-IV)', () => {
  const sim = make({ startGET: '102:45:30', initialProgram: 66 });
  runTo(sim, '102:46:00');
  sim.agc.keys('V37E68E', { gapMs: 300 });
  runTo(sim, '102:46:04');
  assert.equal(sim.agc.mode, 68);
  assert.equal(d(sim).r[0].digits, '00065', 'R1 0.65° (0.649° N)');
  assert.equal(d(sim).r[1].digits, '02346', 'R2 23.46° E');
});

// -------------------------------------------------------- navigation

test('nav: DELTAH ≈ −2,900 ft at 102:38:09; V57 corrects the estimate with W = LRWH·(1 − H/LRHMAX)', () => {
  const sim = make({ startGET: '102:37:40' });
  runTo(sim, '102:37:44');
  assert.equal(d(sim).lights.alt, true, 'ALT lamp on before radar lock');
  runTo(sim, '102:38:10');
  assert.equal(d(sim).lights.alt, false, 'ALT lamp out once the radar data are good');
  near(sim.agc.erasable.DELTAH, -2884, 150, 'DELTAH (Cherry: −2,884 ft at TFI 304)');
  near(sim.agc.nav.errAlt / FT, 2884, 150, 'the estimate is high by that much');
  assert.equal(sim.agc.nav.lrIncorporating, false, 'no incorporation before V57');
  sim.agc.keys('V57E');
  runTo(sim, '102:38:14');
  assert.equal(sim.agc.flags.LRINH, true, 'V57: LR updates permitted');
  const inc = sim.agc.nav.lastIncorporation;
  assert.ok(inc, 'incorporated');
  const h = sim.agc.erasable.HCALC * FT;
  near(inc.weight, NAV_MODEL.lrwh * (1 - h / NAV_MODEL.lrhmax), 0.02, 'SERVICER weight');
  runTo(sim, '102:38:45');
  assert.ok(Math.abs(sim.agc.nav.errAlt) < 700 * FT, `converging: ${(sim.agc.nav.errAlt / FT).toFixed(0)} ft`);
});

test('the first V06N63 after ignition reads like Eyles’ 5559.7 / −2.2 / 49,971', () => {
  const sim = make({ startGET: '102:32:50' });
  runTo(sim, '102:33:02');
  sim.agc.keys('P');
  runTo(sim, '102:33:08.5');
  assert.equal(vn(sim), 'V06N63');
  const [r1, r2, r3] = d(sim).r;
  near(Number(r1.digits) / 10, 5559.7, 3, 'R1 velocity ft/s');
  near(Number(r2.sign + r2.digits) / 10, -2.2, 1.5, 'R2 altitude rate ft/s');
  near(Number(r3.digits), 49971, 60, 'R3 altitude ft');
});
