// BURNBABY — "BURN, BABY, BURN -- MASTER IGNITION ROUTINE" of Luminary 099
// (Luminary099/BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc, "BBB" below;
// research src-ignition.md §3-§9, §14).
//
// One routine performs "ALL FUNCTIONS IMMEDIATELY ASSOCIATED WITH APS OR DPS
// IGNITION ... BETWEEN THE PRE-IGNITION TIME CHECK ... AND TIG + 26 SECONDS"
// (BBB:53-56) for P12, P40, P42, P61 and P63. What differs between programs
// lives in TABLES: the user puts the address of its table in WHICH and the
// routine executes `INDEX WHICH` / `TCF n`, `CA n`, `DCA n` (BBB:58-62). This
// model keeps that design: the tables below are the listing's tables (same
// offsets, same meanings, octal offsets as in the source comments), and the
// sequencer picks the display, the ullage delay, the guidance exit and the
// program-specific branches out of them.
//
// Timing (all relative to TIG, from the constants of the listing):
//   CALLT-35   after the pre-ignition integration: LONGCALL TIG-35 at
//              TIG − 29.9 − 5 s (D29.9SEC 2DEC 2990, BBB:956; 5SEC)
//   TIG-35     TIG − 34.9 s: DSKY blank (DISPDEX = BLANKDEX)        BBB:250-263
//   TIG-30     TIG − 29.9 s: countdown back, Average-G starts
//              (PREREAD), ullage task in table(6) cs                 BBB:292-343
//   ULLGTASK   TIG − 29.9 + 22.40 = TIG − 7.5 s (P63, DEC 2240)      BBB:347-350
//   TIG-5      TIG − 29.9 + 24.9 = TIG − 5.0 s: V99Nxx flashes      BBB:354-386
//   TIG-0      TIG + 0.0 s: IGNITION if the crew has keyed PRO       BBB:390-440
//   ULLAGOFF   ignition + 0.50 s (FIXDELAY 50)                      BBB:530-533
//   P63ZOOM    nominal TIG + ZOOMTIME (26 s pad load): guidance on,
//              FLATOUT — maximum thrust                              BBB:394-406, 564-570
//   CLOKTASK   every 1.00 s, 0.02 s after each whole second before
//              TIG (STCLOK3's remainder arithmetic): CLOKJOB shows
//              the display DISPDEX selects                           BBB:674-788
// Display changes made by tasks therefore appear at the next CLOKJOB
// (≤ 1 s later): the blank shows from TIG−33.98, V99 from TIG−4.98.
//
// Restart protection follows the PHASCHNG calls of the listing (group 4:
// the sequence, 4.24/4.25/4.15/4.2/4.7/4.23/4.5; group 1: ULLGTASK 1.3;
// group 3: ZOOM 3.3; group 6: CLOKTASK 6.3 — RESTART_TABLES.agc, research
// src-ignition.md §14). After a software restart every pending task is put
// back at its original absolute time (or at once if that time has passed),
// which is what RESTARTS/FINDTIME do with TBASEn (RESTARTS_ROUTINE.agc:
// 120-137).
//
// Simplifications: the pre-ignition integration is a CPU-time job, not an
// integration; DVMON/COMFAIL (V97 engine-fail logic) is not modelled; the
// P40AUTO mode check looks only at the PGNS mode switch.

import { parseGET } from '../../../util/time.js';

// ---------- the WHICH tables (BBB:68-153; NOLI SE TANGERE) ----------

// Each table is indexed by the decimal value of the octal offset in the
// source comments: (0)..(7), then (11)=9, (12)=10, (13)=11, (14)=12. A
// 2CADR takes two words, (7) and (10) (src-ignition.md §3.2).
function table(name, line, entries) {
  const words = new Array(13).fill(null);
  for (const [off, w] of Object.entries(entries)) words[Number(off)] = Object.freeze(w);
  return Object.freeze({ name, line, words: Object.freeze(words) });
}

export const IGNITION_TABLES = Object.freeze({
  P12TABLE: table('P12TABLE', 74, {
    0o0: { VN: '0674' }, 0o1: { TCF: 'ULLGNOT' }, 0o2: { TCF: 'COMFAIL3' }, 0o3: { TCF: 'GOCUTOFF' },
    0o4: { TCF: 'TASKOVER' }, 0o5: { TCF: 'P12SPOT' }, 0o6: { DEC: 0 }, 0o7: { '2CADR': 'SERVEXIT' },
    0o11: { TCF: 'DISPCHNG' }, 0o12: { TCF: 'WAITABIT' }, 0o13: { TCF: 'P12IGN' },
  }),
  P40TABLE: table('P40TABLE', 88, {
    0o0: { VN: '0640' }, 0o1: { TCF: 'ULLGNOT' }, 0o2: { TCF: 'COMFAIL4' }, 0o3: { TCF: 'GOPOST' },
    0o4: { TCF: 'TASKOVER' }, 0o5: { TCF: 'P40SPOT' }, 0o6: { DEC: 2240 }, 0o7: { '2CADR': 'STEERING' },
    0o11: { TCF: 'P40SJUNK' }, 0o12: { TCF: 'WAITABIT' }, 0o13: { TCF: 'P40IGN' }, 0o14: { TCF: 'REP40ALM' },
  }),
  // P41's table starts at offset (5): P41ADRES = P41TABLE −5 (BBB:944).
  P41TABLE: table('P41TABLE', 104, {
    0o5: { TCF: 'P41SPOT' }, 0o6: { DEC: -1 }, 0o7: { '2CADR': 'CALCN85' },
    0o11: { TCF: 'COMMON' }, 0o12: { TCF: 'TIGTASK' },
  }),
  P42TABLE: table('P42TABLE', 112, {
    0o0: { VN: '0640' }, 0o1: { TCF: 'WANTAPS' }, 0o2: { TCF: 'COMFAIL4' }, 0o3: { TCF: 'GOPOST' },
    0o4: { TCF: 'TASKOVER' }, 0o5: { TCF: 'P42SPOT' }, 0o6: { DEC: 2640 }, 0o7: { '2CADR': 'STEERING' },
    0o11: { TCF: 'P40SJUNK' }, 0o12: { TCF: 'WAITABIT' }, 0o13: { TCF: 'P42IGN' }, 0o14: { TCF: 'P42STAGE' },
  }),
  P63TABLE: table('P63TABLE', 127, {
    0o0: { VN: '0662' }, 0o1: { TCF: 'ULLGNOT' }, 0o2: { TCF: 'COMFAIL3' }, 0o3: { TCF: 'V99RECYC' },
    0o4: { TCF: 'TASKOVER' }, 0o5: { TCF: 'P63SPOT' }, 0o6: { DEC: 2240 }, 0o7: { '2CADR': 'SERVEXIT' },
    0o11: { TCF: 'DISPCHNG' }, 0o12: { TCF: 'WAITABIT' }, 0o13: { TCF: 'P63IGN' },
  }),
  ABRTABLE: table('ABRTABLE', 142, {
    0o0: { VN: '0663' }, 0o1: { TCF: 'ULLGNOT' }, 0o2: { TCF: 'COMFAIL3' }, 0o3: { TCF: 'GOCUTOFF' },
    0o4: { TCF: 'TASKOVER' }, 0o5: { NOOP: true }, 0o6: { NOOP: true }, 0o7: { NOOP: true },
    0o11: { TCF: 'DISPCHNG' }, 0o12: { TCF: 'WAITABIT' }, 0o13: { TCF: 'ABRTIGN' },
  }),
});

// `INDEX WHICH` + operand: the table word at an (octal) offset.
export function indexWhich(which, offset) {
  const w = which.words[offset];
  if (!w) throw new Error(`${which.name} has no word at offset (${offset.toString(8)})`);
  return w;
}

// VN constants are written VVNN in decimal digits ("VN 0662" = V06 N62).
export function decodeVN(vn) {
  const s = String(vn).padStart(4, '0');
  return { verb: Number(s.slice(0, 2)), noun: Number(s.slice(2, 4)) };
}

// ---------- constants of the ignition routine ----------

export const BURN_TIMING = Object.freeze({
  D29_9SEC: 29.90,      // 2DEC 2990: integrate to TIG − 29.9 s (BBB:956)
  S24_9SEC: 24.90,      // DEC 2490: TIG-30 → TIG-5 (BBB:958)
  FIVESEC: 5.00,        // 5SEC: TIG-35 → TIG-30, TIG-5 → TIG-0 (BBB:250-252, :360-362)
  ULLAGOFF: 0.50,       // FIXDELAY DEC 50 after light-up (BBB:530-533)
  ZOOMTIME: 26.00,      // pad load ZOOMTIME 2600 cs (ERASABLE_ASSIGNMENTS.agc:2092; LM Data Book)
  CLOCK: 1.00,          // CLOKTASK FIXDELAY DEC 100 (BBB:714-716)
  CLOCK_OFFSET: 0.02,   // "+ TWO" cs in STCLOK3 (BBB:686-696)
  TIMEDELT: 20.00,      // 2DEC 2000: TDEC1 must be ≥ 20 s ahead (INTEGRATION_INITIALIZATION.agc:1023)
  IGNITE_DELAY: 0.01,   // TWIDDLE IGNITION in BIT1 = 1 cs after a late PRO (BBB:860-869)
});

// DISPDEX values: negative = display, +0 = clock runs without display,
// positive = kill the clock (BBB:705-788; ASTNDEX THE_LUNAR_LANDING.agc:263).
export const DISPDEX = Object.freeze({
  VB97DEX: 0o35,        // V97Nxx flashing: perform engine-fail procedure
  ASTNDEX: 0o25,        // V06N61 flashing: set the event timer (P63 only)
  CNTDNDEX: 0o17,       // V06Nxx countdown, noun from table (0)
  VB99DEX: 0o13,        // V99Nxx flashing: please enable engine
  BLANKDEX: 2,          // blank DSKY (CLEANDSP)
});

// Job priorities (octal, BBB): CLOKJOB PRIO27 NOVAC (:711-714).
const PRIO = Object.freeze({ CLOKJOB: 0o27, MIDTOAV1: 0o13 });

// CPU cost of the clock job incl. its display (model estimate, not from
// the listing; same order as one 3-register display in workload.js).
const CLOKJOB_MS = 25;
const MIDTOAV_MS = 1500;   // pre-ignition integration, model estimate

export const TIG_APOLLO11 = parseGET('102:33:05.01'); // MR Table 9.6-V

const PHASE_ORDER = ['pre', 'avg-g', 'ullage', 'v99', 'ignition', 'trim', 'throttle-up', 'burning', 'cutoff', 'done'];

export class BurnBaby {
  // host: the LmProgram that owns the burn (P63); it provides schedule(),
  // cancel(), job(), show(), flash(), protect(), goToPooh() and the
  // callbacks onIgnition(t), onZoom(t), onAverageG(t).
  constructor(host, which = IGNITION_TABLES.P63TABLE) {
    this.host = host;
    this.agc = host.agc;
    this.which = which;
    this.program = Number(String(which.name).match(/P(\d\d)/)?.[1]) || host.constructor.number;
    this.tig = null;            // TIG on the tasks' GET axis (erasable TIG: Agc.clock frame)
    this.tigNominal = null;     // GOBLTIME: nominal TIG (BBB:169-171)
    this.dispdex = 1;           // clock not running
    this.blanking = false;
    this.flags = { IGNFLAG: false, ASTNFLAG: false, ENGONFLG: false, ULLAGE: false };
    this.avegexit = 'SERVEXIT';
    this.armed = false;
    this.ignitionT = null;
    this.zoomT = null;
    this.events = [];
    this.pending = new Map();   // task name -> { at, fn } (restart re-creation)
    this.clockNext = null;
    this.restartT = null;
  }

  get t() {
    return this.agc.t;
  }

  get vn() {
    return decodeVN(indexWhich(this.which, 0o0).VN);   // INDEX WHICH / CA 0
  }

  // ---------- tasks with restart re-creation ----------

  task(name, at, fn) {
    this.pending.set(name, { at, fn });
    this.host.schedule(name, at, (t) => {
      this.pending.delete(name);
      fn(t);
    });
  }

  kill(name) {
    this.pending.delete(name);
    this.host.cancel(name);
  }

  // After a software restart: put every pending task back (FINDTIME).
  reenter(t) {
    if (this.restartT === t) return;
    this.restartT = t;
    for (const [name, p] of [...this.pending]) {
      if (!this.host.hasTask(name)) this.task(name, Math.max(p.at, t + 0.01), p.fn);
    }
    if (this.dispdex <= 0 && !this.host.hasTask('CLOKTASK')) this.scheduleClock(t);
  }

  // ---------- the countdown clock (STCLOK / CLOKTASK / CLOKJOB) ----------

  // STCLOK2: DISPDEX := A and start CLOKTASK in step with TIG.
  startClock(dispdex, tig = this.tig) {
    this.dispdex = dispdex;
    if (Number.isFinite(tig)) this.tig = tig;
    this.scheduleClock(this.t);
  }

  // First clock tick after time x: STCLOK3 schedules CLOKTASK at
  // ((TIG − TIME2) mod 1 s) + 2 cs, i.e. at TIG − n + 0.02 s.
  nextTick(x) {
    const n = Math.floor(this.tig - x + BURN_TIMING.CLOCK_OFFSET - 1e-9);
    return this.tig - n + BURN_TIMING.CLOCK_OFFSET;
  }

  scheduleClock(now) {
    const next = this.nextTick(now);
    this.clockNext = next;
    this.host.schedule('CLOKTASK', next, (t) => this.clokTask(t), { costMs: 0.3 });
    this.host.protect(6, '6.3', (tt) => this.reenter(tt), { label: 'CLOKTASK countdown clock', anchor: 'burn.cloktask' });
  }

  clokTask(t) {
    // CCS DISPDEX: positive → KILLCLOK (kill group 6).
    if (this.dispdex > 0) {
      this.host.unprotect(6);
      this.clockNext = null;
      return;
    }
    this.host.job('CLOKJOB', {
      prio: PRIO.CLOKJOB, vac: false, workMs: CLOKJOB_MS, anchor: 'burn.cloktask',
      onDone: (tt) => this.clokJob(tt),
    });
    // FIXDELAY DEC 100 → CLOKTASK again.
    const next = t + BURN_TIMING.CLOCK;
    this.clockNext = next;
    this.host.schedule('CLOKTASK', next, (tt) => this.clokTask(tt), { costMs: 0.3 });
  }

  // CLOKJOB: TTOGO = TIME2 − TIG, then the display DISPDEX asks for
  // (BBB:725-731; erasable TIG and the clock, so a clock load shows here).
  clokJob(t) {
    const tig = this.agc.erasable.TIG;
    this.agc.erasable.TTOGO = this.agc.clock(t) - (Number.isFinite(tig) ? tig : this.agc.clock(this.tig));
    if (this.dispdex >= 0) return;          // +0: keep running, no display
    const d = -this.dispdex;
    const { verb, noun } = this.vn;
    if (d !== DISPDEX.BLANKDEX) this.blanking = false;
    if (d === DISPDEX.CNTDNDEX) {
      this.host.show(verb, noun, { source: 'burn.dispdex' });          // REGODSP V06Nxx
    } else if (d === DISPDEX.VB99DEX) {
      this.flashV99();
    } else if (d === DISPDEX.BLANKDEX) {
      if (!this.blanking) {
        // CLEANDSP: blank everything but the major mode; it stays blank
        // until the first CLOKJOB after TIG-30 shows the countdown again.
        this.blanking = true;
        const back = this.nextTick(this.tig - BURN_TIMING.D29_9SEC);
        this.agc.pinball?.blankFor?.(Math.max(0.5, back - t + 0.1));
      }
    } else if (d === DISPDEX.ASTNDEX) {
      this.host.onAstnClock?.(t);
    }
  }

  // −13 entry: "CS BIT9 / TS NVWORD1 # INDICATE VERB 99 PASTE", CLOCPLAY
  // (BBB:772-781): V99 with the noun of the countdown display, flashing.
  flashV99() {
    this.host.flash(99, this.vn.noun, {
      terminate: () => this.stopClok(),
      proceed: () => this.proceed(),
      enter: () => this.enter(),
    }, { id: 'V99', source: 'burn.v99' });
  }

  // ---------- the sequence ----------

  // BURNBABY / B*RNB*B* / P63SPOT (BBB:159-183). opts.at: when the
  // pre-ignition integration ends (CALLT-35) — default: a CPU-time job.
  arm(tig, { initial = false } = {}) {
    const agc = this.agc;
    this.armed = true;
    this.tig = tig;
    this.tigNominal = tig;          // GOBLTIME (BBB:169-171)
    agc.erasable.TIG = agc.clock(tig);
    agc.erasable.DVTOTAL = 0;       // "EXTIRPATE JUNK LEFT IN DVTOTAL" (BBB:162-164)
    this.flags.ENGONFLG = false;    // ENGINOF3 pre-arm (BBB:173-176)
    this.buildEvents();
    this.host.protect(4, '4.24', (t) => this.reenter(t), { label: 'BURNBABY', anchor: 'burn.entry' });
    this.mark('burnbaby', { quiet: initial });
    if (initial) return;
    // P63SPOT = P41SPOT: integrate the state to TDEC1 = TIG − 29.9 s.
    this.host.job('MIDTOAV1', {
      prio: PRIO.MIDTOAV1, vac: true, workMs: MIDTOAV_MS, anchor: 'burn.integrate',
      onDone: (t) => this.integrated(t),
    });
  }

  // MIDTOAV1 done (BBB:211-220): TDEC1 at least TIMEDELT ahead, else alarm
  // 1703 and TIG slipped to "29.9 seconds after the time to which we did
  // integrate", which MIDTOAV2 makes now + TIMEDELT.
  integrated(t) {
    const tdec1 = this.tig - BURN_TIMING.D29_9SEC;
    if (tdec1 < t + BURN_TIMING.TIMEDELT) {
      this.agc.alarm(0o1703);
      this.setTig(t + BURN_TIMING.TIMEDELT + BURN_TIMING.D29_9SEC);
    }
    this.callT35(t);
  }

  setTig(tig) {
    this.tig = tig;
    this.tigNominal = tig;
    this.agc.erasable.TIG = this.agc.clock(tig);
    this.buildEvents();
  }

  // CALLT-35 (BBB:222-246): LONGCALL TIG-35; P63 starts its countdown.
  callT35(t) {
    const tig = this.tig;
    this.task('TIG-35', tig - BURN_TIMING.D29_9SEC - BURN_TIMING.FIVESEC, (tt) => this.tig35(tt));
    this.host.protect(4, '4.25', (tt) => this.reenter(tt), { label: 'TIG-35 task (4.25SPOT)', anchor: 'burn.callt35' });
    // "INITIALIZE ABVEL FOR P63 DISPLAY" (BBB:242-245).
    this.host.onCountdown?.(t);
    if (this.program === 63) {
      // CHECKMM 63: "P63 CAN START DISPLAYING NOW."
      this.startClock(-DISPDEX.CNTDNDEX);
    } else if (this.dispdex > 0) {
      this.startClock(-DISPDEX.CNTDNDEX);
    }
    this.mark('callt35', { at: t });
  }

  tig35(t) {
    const tig = this.tig;
    this.task('TIG-30', tig - BURN_TIMING.D29_9SEC, (tt) => this.tig30(tt));
    this.host.protect(4, '4.15', (tt) => this.reenter(tt), { label: 'TIG-30 task (4.15SPOT)', anchor: 'burn.tig35' });
    this.dispdex = -DISPDEX.BLANKDEX;     // "BLANK DSKY FOR 5 SECONDS"
    this.mark('tig35', { at: t });
  }

  tig30(t) {
    const tig = this.tig;
    this.task('TIG-5', tig - BURN_TIMING.D29_9SEC + BURN_TIMING.S24_9SEC, (tt) => this.tig5(tt));
    this.dispdex = -DISPDEX.CNTDNDEX;     // "START UP CLOKTASK AGAIN"
    const ull = indexWhich(this.which, 0o6).DEC;   // INDEX WHICH / CA 6
    if (ull > 0) {
      this.task('ULLGTASK', t + ull / 100, (tt) => this.ullgTask(tt));
      this.host.protect(1, '1.3', (tt) => this.reenter(tt), { label: 'ULLGTASK (1.3SPOT)', anchor: 'burn.ullgtask' });
    }
    // INDEX WHICH / TCF 1 → ULLGNOT (WANTAPS for P42 first).
    this.ullgNot(t);
    this.mark('tig30', { at: t });
  }

  // ULLGNOT (BBB:321-343): AVEGEXIT from table (7); 4.2; PREREAD unless
  // SERVICER is already going (REDO4.2).
  ullgNot(t) {
    this.avegexit = indexWhich(this.which, 0o7)['2CADR'];
    this.host.protect(4, '4.2', (tt) => this.reenter(tt), { label: 'TIG-5 task (4.2SPOT)', anchor: 'burn.ullgnot' });
    const wl = this.agc.workload;
    if (wl && !wl.averageG) wl.startAverageG?.();
    this.host.onAverageG?.(t);
  }

  ullgTask(t) {
    this.flags.ULLAGE = true;             // ONULLAGE (BBB:667-670)
    this.host.unprotect(1);
    this.mark('ullage', { at: t });
  }

  tig5(t) {
    const tig = this.tig;
    this.task('TIG-0', tig, (tt) => this.tig0(tt));
    this.flags.IGNFLAG = false;           // "RESET IGNFLAG AND ASINFLAG"
    this.flags.ASTNFLAG = false;
    // INDEX WHICH / TCF 11 → DISPCHNG (P63) / P40SJUNK (P40, P42).
    this.dispdex = -DISPDEX.VB99DEX;
    this.host.protect(4, '4.7', (tt) => this.reenter(tt), { label: 'TIG-0 task (4.7SPOT)', anchor: 'burn.tig5' });
    this.mark('tig5', { at: t });
  }

  tig0(t) {
    this.flags.IGNFLAG = true;            // "TIG HAS ARRIVED"
    if (this.program === 63) {
      // "IN P63 CASE, THROTTLE-UP IS ZOOMTIME AFTER NOMINAL IGNITION, NOT ACTUAL"
      this.scheduleZoom(t + BURN_TIMING.ZOOMTIME);
    }
    if (this.flags.ASTNFLAG) {
      this.ignition(t);
    } else {
      // INDEX WHICH / BZF 12 → WAITABIT: kill group 4; V99 keeps flashing.
      this.host.unprotect(4);
      this.mark('tig0', { at: t, label: 'TIG: no PRO yet — the engine waits, V99 keeps flashing' });
    }
  }

  scheduleZoom(at) {
    this.task('P63ZOOM', at, (tt) => this.zoom(tt));
    this.host.protect(3, '3.3', (tt) => this.reenter(tt), { label: 'ZOOM throttle-up (3.3SPOT)', anchor: 'burn.zoom' });
  }

  // IGNITION (BBB:414-440) and, for P63, P63IGN → P42IGN → DVMONCON.
  ignition(t) {
    if (this.flags.ENGONFLG) return;
    this.flags.ENGONFLG = true;           // engine on: CHAN11 bit 13
    this.ignitionT = t;
    this.agc.erasable.TEVENT = this.agc.clock(t);   // TEVENT := TIME2 (BBB:423-425)
    // P63IGN (BBB:442-471): AVGEXIT := P63DISPS −2, kill the clock, TIG := TIME2.
    this.avegexit = 'P63DISPS-2';
    this.dispdex = 0o7777;                // CA Z → positive: KILLCLOK at the next tick
    this.tig = t;
    this.agc.erasable.TIG = this.agc.clock(t);
    // DVMONCON (BBB:520-528).
    this.flags.IGNFLAG = false;
    this.flags.ASTNFLAG = false;
    this.host.protect(4, '4.5', (tt) => this.reenter(tt), { label: 'ULLAGOFF (4.5SPOT)', anchor: 'burn.dvmoncon' });
    this.task('ULLAGOFF', t + BURN_TIMING.ULLAGOFF, (tt) => this.ullagOff(tt));
    this.mark('ignition', { at: t });
    this.host.onIgnition?.(t);
  }

  ullagOff(t) {
    this.flags.ULLAGE = false;            // NOULLAGE
    this.host.unprotect(4);               // WAITABIT: kill group 4
    this.mark('ullageOff', { at: t });
  }

  // P63ZOOM (BBB:564-584): AVEGEXIT := LUNLAND; FLATOUT; group 3 off.
  zoom(t) {
    this.avegexit = 'LUNLAND';
    this.zoomT = t;
    this.host.unprotect(3);
    this.mark('zoom', { at: t });
    this.host.onZoom?.(t);
  }

  // ---------- crew responses to V99 (BBB:790-877) ----------

  // *PROCEED: ASTNFLAG; IGNITE: after TIG ignite at once (4.23), before TIG
  // restore the countdown display (IGNITE1).
  proceed() {
    const t = this.t;
    this.flags.ASTNFLAG = true;
    this.mark('pro', { at: t, insert: true, label: 'PRO: the crew okays ignition (ASTNFLAG)' });
    if (this.flags.IGNFLAG) {
      this.task('IGNITION', t + BURN_TIMING.IGNITE_DELAY, (tt) => this.ignition(tt));
      this.host.protect(4, '4.23', (tt) => this.reenter(tt), { label: 'IGNITION (4.23SPOT)', anchor: 'burn.ignite' });
    } else {
      this.dispdex = -DISPDEX.CNTDNDEX;
    }
  }

  // *ENTER → INDEX WHICH / TCF 3: P63 V99RECYC flashes V99 again; P40/P42
  // would go to GOPOST, P12 to GOCUTOFF (not modelled here).
  enter() {
    const branch = indexWhich(this.which, 0o3).TCF;
    if (branch === 'V99RECYC') this.flashV99();
    else this.flashV99();
  }

  // STOPCLOK → NULLCLOK → GOTOPOOH: ullage off and killed "NOT EVEN IF
  // THERE'S A RESTART", clock killed, flashing V37. The model also drops
  // the remaining ignition tasks (in the listing TIG-0 would still run and
  // find no PRO: no ignition either way).
  stopClok() {
    this.flags.ULLAGE = false;
    this.kill('ULLGTASK');
    this.host.unprotect(1);
    this.dispdex = 0o7777;
    for (const name of ['TIG-35', 'TIG-30', 'TIG-5', 'TIG-0', 'P63ZOOM', 'IGNITION']) this.kill(name);
    this.armed = false;
    this.mark('terminate', { at: this.t, insert: true, label: 'V34: terminated — no ignition (GOTOPOOH)' });
    this.host.goToPooh();
  }

  // ---------- mid-flight start (scenario / preset set-up) ----------

  // Put the sequencer where it would be at time t for an on-time burn with
  // the crew's PRO in time (Apollo 11): tasks still to come are scheduled,
  // past ones are marked done.
  restoreAt(t, tig) {
    this.armed = true;
    this.tig = tig;
    this.tigNominal = tig;
    this.agc.erasable.TIG = this.agc.clock(tig);
    if (!Number.isFinite(this.agc.erasable.DVTOTAL)) this.agc.erasable.DVTOTAL = 0;
    this.buildEvents();
    const T = BURN_TIMING;
    const rel = t - tig;
    const done = (id) => this.mark(id, { at: this.eventTime(id), quiet: true });
    done('burnbaby');
    done('callt35');
    if (rel < -T.D29_9SEC - T.FIVESEC) {
      this.callT35(t);
      return;
    }
    done('tig35');
    if (rel < -T.D29_9SEC) {
      this.task('TIG-30', tig - T.D29_9SEC, (tt) => this.tig30(tt));
      this.host.protect(4, '4.15', (tt) => this.reenter(tt), { label: 'TIG-30 task (4.15SPOT)', anchor: 'burn.tig35' });
      this.startClock(-DISPDEX.BLANKDEX);
      return;
    }
    done('tig30');
    this.avegexit = indexWhich(this.which, 0o7)['2CADR'];
    const wl = this.agc.workload;
    if (wl && !wl.averageG) wl.startAverageG?.();
    // SERVICER on the 2-s grid this burn's PREREAD set up at TIG − 29.9 s.
    wl?.alignCycle?.(tig - T.D29_9SEC);
    const ullAt = tig - T.D29_9SEC + indexWhich(this.which, 0o6).DEC / 100;
    if (rel < -T.FIVESEC) {
      this.task('TIG-5', tig - T.D29_9SEC + T.S24_9SEC, (tt) => this.tig5(tt));
      this.host.protect(4, '4.2', (tt) => this.reenter(tt), { label: 'TIG-5 task (4.2SPOT)', anchor: 'burn.ullgnot' });
      if (t < ullAt) {
        this.task('ULLGTASK', ullAt, (tt) => this.ullgTask(tt));
        this.host.protect(1, '1.3', (tt) => this.reenter(tt), { label: 'ULLGTASK (1.3SPOT)', anchor: 'burn.ullgtask' });
      } else {
        this.flags.ULLAGE = true;
        done('ullage');
      }
      this.startClock(-DISPDEX.CNTDNDEX);
      return;
    }
    done('ullage');
    done('tig5');
    if (rel < 0) {
      this.flags.ULLAGE = true;
      this.task('TIG-0', tig, (tt) => this.tig0(tt));
      this.host.protect(4, '4.7', (tt) => this.reenter(tt), { label: 'TIG-0 task (4.7SPOT)', anchor: 'burn.tig5' });
      this.startClock(-DISPDEX.VB99DEX);
      return;
    }
    // Ignited on time (Apollo 11: PRO before TIG).
    this.flags.ENGONFLG = true;
    this.ignitionT = tig;
    this.agc.erasable.TEVENT = this.agc.clock(tig);
    this.avegexit = 'P63DISPS-2';
    this.dispdex = 0o7777;
    done('ignition');
    if (rel < T.ULLAGOFF) {
      this.flags.ULLAGE = true;
      this.task('ULLAGOFF', tig + T.ULLAGOFF, (tt) => this.ullagOff(tt));
    } else {
      done('ullageOff');
    }
    if (this.program === 63) {
      if (rel < T.ZOOMTIME) this.scheduleZoom(tig + T.ZOOMTIME);
      else {
        this.avegexit = 'LUNLAND';
        this.zoomT = tig + T.ZOOMTIME;
        done('zoom');
      }
    }
  }

  // ---------- events for snapshot.burn (ARCHITECTURE §6.9.1) ----------

  buildEvents() {
    const T = BURN_TIMING;
    const ullDec = indexWhich(this.which, 0o6).DEC;
    const tig = this.tigNominal;
    const ev = (id, label, rel, anchor) => ({ id, label, rel, t: tig + rel, done: false, anchor });
    const { verb, noun } = this.vn;
    const nn = String(noun).padStart(2, '0');
    const list = [
      ev('callt35', `Countdown on V${String(verb).padStart(2, '0')}N${nn} (CALLT-35)`, -T.D29_9SEC - T.FIVESEC - 1, 'burn.callt35'),
      ev('tig35', 'TIG−35: DSKY blanked for 5 s — “Average-G is starting”', -T.D29_9SEC - T.FIVESEC, 'burn.tig35'),
      ev('tig30', 'TIG−30: Average-G (SERVICER every 2 s) starts; countdown back', -T.D29_9SEC, 'burn.tig30'),
    ];
    if (ullDec > 0) list.push(ev('ullage', `Ullage on (ULLGTASK, ${ullDec} cs after TIG−30)`, -T.D29_9SEC + ullDec / 100, 'burn.ullgtask'));
    list.push(
      ev('tig5', `TIG−5: V99N${nn} flashes — please enable engine`, -T.D29_9SEC + T.S24_9SEC, 'burn.tig5'),
      ev('ignition', 'Ignition: ENGINE ON (channel 11 bit 13) at minimum thrust', 0, 'burn.ignition'),
      ev('ullageOff', 'Ullage off, 0.5 s after light-up', T.ULLAGOFF, 'burn.dvmoncon'),
    );
    if (this.program === 63) {
      list.push(ev('zoom', 'TIG+26: P63ZOOM — guidance on, throttle up (FLATOUT)', T.ZOOMTIME, 'burn.zoom'));
    }
    this.events = list;
  }

  eventTime(id) {
    const e = this.events.find((x) => x.id === id);
    return e ? e.t : this.t;
  }

  mark(id, { at = this.t, quiet = false, insert = false, label = null } = {}) {
    let e = this.events.find((x) => x.id === id);
    const tig = this.tigNominal ?? this.tig ?? at;
    if (!e && (insert || label)) {
      const anchors = { pro: 'burn.proceed', terminate: 'burn.responses', tig0: 'burn.tig0', burnbaby: 'burn.entry' };
      e = { id, label: label || id, rel: at - tig, t: at, done: false, anchor: anchors[id] || 'burn.entry' };
      this.events.push(e);
      this.events.sort((a, b) => a.rel - b.rel);
    }
    if (e) {
      e.done = true;
      e.t = at;
      e.rel = at - tig;
      if (label) e.label = label;
    }
    if (!quiet && e) {
      this.agc.bus?.emit?.('burn', { id, label: e.label, t: at, rel: at - tig, program: this.program, anchor: e.anchor });
    }
  }

  phase() {
    const t = this.t;
    if (!this.armed && !this.flags.ENGONFLG) return 'done';
    const engine = this.host.engineOn?.() ?? this.flags.ENGONFLG;
    if (this.flags.ENGONFLG) {
      if (!engine) return 'cutoff';
      const it = this.ignitionT ?? this.tig;
      if (this.zoomT !== null && t >= this.zoomT) return t < this.zoomT + 4 ? 'throttle-up' : 'burning';
      if (t < it + 1) return 'ignition';
      return this.program === 63 ? 'trim' : 'burning';
    }
    if (this.dispdex === -DISPDEX.VB99DEX || this.flags.IGNFLAG) return 'v99';
    if (this.flags.ULLAGE) return 'ullage';
    if (this.events.find((e) => e.id === 'tig30')?.done) return 'avg-g';
    return 'pre';
  }

  snapshot() {
    const tig = this.tigNominal ?? this.tig;
    if (!Number.isFinite(tig)) return null;
    const phase = this.phase();
    return {
      program: this.program,
      table: this.which.name,
      tig,
      tMinusTig: this.t - tig,
      phase,
      phaseIndex: PHASE_ORDER.indexOf(phase),
      dispdex: this.dispdex,
      flags: { ...this.flags },
      avegexit: this.avegexit,
      ignitionT: this.ignitionT,
      zoomT: this.zoomT,
      events: this.events.map((e) => ({ ...e })),
    };
  }
}
