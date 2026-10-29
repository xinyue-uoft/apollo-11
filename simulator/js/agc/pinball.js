// PINBALL GAME BUTTONS AND LIGHTS — the AGC's keyboard and display program,
// as a behavioural model (ARCHITECTURE §6.3).
//
// Pinball talks to the rest of the computer only through the documented
// `agc` surface: agc.dsky (DskyState), agc.exec.requestJob, agc.erasable,
// agc.alarms, agc.mode, agc.t, agc.flags, agc.bus, agc.changeProgram,
// agc.freshStart, agc.hardwareRestart, agc.poodoo/alarm. Every member is
// optional, so tests can drive it with a small stand-in.
//
// What is modelled, routine by routine (Luminary099/PINBALL_GAME_BUTTONS_AND_
// LIGHTS.agc unless another file is named; Comanche055's PINBALL is the same
// code at different line numbers):
// - Each key is a KEYRUPT1 interrupt that snatches the time for noun 65 and
//   asks the Executive for a CHARIN job, NOVAC, priority CHRPRIO = 30
//   (KEYRUPT_UPRUPT.agc:35-55; :3414). We request that job from agc.exec;
//   the key takes effect when the job runs, and is lost if the Executive
//   has no core set for it (as on the real machine). PRO has no key code: it
//   is channel 32 bit 14, sampled by T4RUPT every 120 ms, which then
//   schedules PROCKEY at CHRPRIO (:384; T4RUPT_PROGRAM.agc:144-170).
// - CHARIN (:463-510): DSPLOCK := 1 (the crew owns the DSKY), KEY REL lamp
//   on if a program display is waiting for a response (CADRSTOR full) and
//   the key is not RSET, then the dispatch table.
// - Digit entry with DSPCOUNT, DECBRNCH, CLPASS exactly as NUM / 89TEST /
//   SIGNTEST / CLEAR / ENTER do (:516-898); verb/noun execution ENTPAS0 /
//   VERBTAB / VERBFAN (:903-1027); the noun tests TESTNN / MIXNOUN /
//   COMPTEST / DECTEST / NOUNTEST (:912-1052, :1240-1284); display verbs
//   (:1193-1384, :1706-1730); monitors MONITOR / MONREQ / MONDO / PASTEVB
//   (:2304-2452); loads ABCLOAD .. CLOAD, PUTCOM, LOADLV (:1733-1877,
//   :1932-2048); V37 MMCHANG / REQMM (:2767-2810); the response verbs VBPROC
//   / VBTERM / VBRESEQ / PROCKEY and RECALTST (:2860-2886, :3313-3343); KEY
//   REL (VBRELDSP, :2893-2937) and RELDSP (:3578-3597); V35 VBTSTLTS ..
//   TSTLTS3 (:3617-3714); RSET (ERROR, :3722-3787); the alarm exits
//   DSPALARM / ALMCYCLE / CHARALRM / FALTON (:2722-2765, :3426-3429); the
//   program interface NVSUB / BLANKDSP / NVSUBUSY / ENDIDLE (:2940-3168,
//   :3537-3552) and the display interface routines GODSP / GOFLASH / REGODSP
//   / GOPERF / CLOCPLAY / PRIODSP / CLEANDSP / PINBRNCH
//   (DISPLAY_INTERFACE_ROUTINES.agc:32-120, 640-1400).
//
// Simplifications (all invisible on the DSKY unless noted):
// - The display-interface bookkeeping (FLAGWRD4, NVSAVE, the display jobs'
//   sleeping) is reduced to: one display waiting for a response
//   (`waiting` = CADRSTOR), one display waiting for the DSKY to become free
//   (`dsplist` = DSPLIST, KEY REL lit), the last normal display (`normal` =
//   NVSAVE) and an active priority display. A new normal display evicts the
//   old sleeper (WITCHONE, DISPLAY_INTERFACE_ROUTINES.agc:1144-1157) — which
//   is why the real program's every-pass REGODSPR never hits the 1206 abort.
// - Relay-word output timing (T4RUPT sends one relay word per 120/20 ms)
//   is not modelled: a display appears whole, at the end of its job.
// - Memory words addressed by N01-N03/N10/N15 (machine address to be
//   specified) are read from `agc.memory.read(addr)` if the Agc offers it,
//   else as +0; the noun-07 bit set/reset load is accepted but not applied.

import { isKey, parseKeys } from '../util/keys.js';
import { formatRegister, octal5, twoDigits, BLANK_REGISTER, parseEntry, signOf } from './display-format.js';
import { verbTable, v37Programs, LOWVERB, FIRST_EXTENDED_VERB } from './verbs.js';
import { nounTable } from './nouns.js';

// ------------------------------------------------------------- constants

export const CHRPRIO = 0o30;          // CHRPRIO OCT 30000 (:3414)
export const MONDEL_S = 1.0;          // MONDEL OCT 144 = 100 cs (:2395)
export const MON_FIRST_S = 0.01;      // CAF ONE / TC WAITLIST — 1 cs (:2361-2366)
export const LAMP_TEST_S = 5.0;       // SHOLTS OCT 764 = 500 cs (:3671)
export const T4RUPT_S = 0.12;         // 120MRUPT (T4RUPT_PROGRAM.agc:108)
export const KEY_GAP_MS = 400;        // default pressScript spacing (ARCHITECTURE §6.3)
export const PRIO_RESPONSE_S = 2.0;   // "NO SOONER THAN 2 SECONDS" (DISPLAY_INTERFACE_ROUTINES.agc:434-439)

// Default CPU cost of PINBALL's own jobs when agc.workload.params does not
// give one (model calibration, not measured; see workload.js).
const DEFAULT_COST_MS = { CHARIN: 5, PROCKEY: 5, MONDO: 35, TSTLTS3: 3 };

// DSPCOUNT digit numbering (:393-412): VD1 23, VD2 22, ND1 21, ND2 20 (octal),
// R1D1..R1D5 16..12, R2D1..R2D5 11..5, R3D1..R3D5 4..0.
const VD1 = 0o23;
const VD2 = 0o22;
const ND1 = 0o21;
const ND2 = 0o20;
const RD1 = [0o16, 0o11, 0o4];        // R1D1, R2D1, R3D1 (:3377-3379)
// CRITCON: the last position of each field (:620-624), indexed by INREL.
const CRITCON = [VD2, ND2, 0o12, 0o5, 0o0];

// INRELTAB (:629-650): which register a DSPCOUNT belongs to. 0 VERBREG,
// 1 NOUNREG, 2 XREG (R1), 3 YREG (R2), 4 ZREG (R3).
function inrelOf(pos) {
  if (pos >= ND1 + 1) return 0;
  if (pos >= ND2) return 1;
  if (pos >= 0o12) return 2;
  if (pos >= 0o5) return 3;
  return 4;
}

// Character index of a DSPCOUNT inside its register (0 = D1).
function charIndex(pos) {
  const inrel = inrelOf(pos);
  if (inrel === 0) return VD1 - pos;
  if (inrel === 1) return ND1 - pos;
  return RD1[inrel - 2] - pos;
}

const BLANK5 = '     ';
const LOAD_VERB_FOR = [21, 22, 23];   // VBSP1LD..VBSP3LD (:1867-1869)

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

// ----------------------------------------------------------------- class

export class Pinball {
  constructor(agc = {}, { software } = {}) {
    this.agc = agc;
    this.software = software || agc.software || 'Luminary099';
    this.verbs = verbTable(this.software);
    this.nouns = nounTable(this.software);
    this.v37 = v37Programs(this.software);
    this._t = fin(agc.t) ? agc.t : 0;
    this.log = [];                    // recent PINBALL events, for tests and views
    this._reset({ initial: true });
  }

  // ======================================================= public API

  // One DSKY key (ARCHITECTURE §4 names). Returns false if the key was lost
  // (Executive overflow) — the key still "happened" for the crew.
  press(key, { source = 'user' } = {}) {
    if (!isKey(key)) throw new Error(`Unknown DSKY key ${JSON.stringify(key)}`);
    const t = this._now();
    // KEYRUPT1: TC LODSAMPT "TIME IS SNATCHED IN RUPT FOR NOUN 65"
    // (KEYRUPT_UPRUPT.agc:38) — also for PRO? No: PRO is not a KEYRUPT.
    if (key === 'PRO') {
      // Channel 32 bit 14, seen at the next 120-ms T4RUPT sample.
      const at = Math.ceil((t - 1e-9) / T4RUPT_S) * T4RUPT_S;
      this._proQueue.push({ at: Math.max(at, t), source });
      return true;
    }
    this.sampTime = t;
    return this._requestJob('CHARIN', () => this._charin(key, source), { anchor: 'pinball.charin' });
  }

  // Queue keys, one every gapMs of simulation time, the first one now.
  // Each key fires a 'key' bus event when it is pressed ({ key, t, source }).
  pressScript(script, { gapMs = KEY_GAP_MS, source = 'crew', emit = true } = {}) {
    const keys = Array.isArray(script) ? script.slice() : parseKeys(script);
    const t0 = this._now();
    const times = [];
    keys.forEach((key, i) => {
      if (!isKey(key)) throw new Error(`Unknown DSKY key ${JSON.stringify(key)}`);
      const at = t0 + (i * gapMs) / 1000;
      this._keyQueue.push({ at, key, source, emit, seq: this._seq++ });
      times.push(at);
    });
    this._keyQueue.sort((a, b) => a.at - b.at || a.seq - b.seq);
    this._drainKeys(t0);
    return times;
  }

  // Timers: scripted keys, the PRO sample, the monitor's MONREQ task, the
  // lamp test's 5-s TSTLTS2 task, the TIG-35 blanking hold.
  step(dt, t) {
    if (fin(t)) this._t = t;
    else {
      this._t += fin(dt) ? dt : 0;
      if (fin(this.agc.t) && this.agc.t > this._t) this._t = this.agc.t;
    }
    const now = this._t;
    this._drainKeys(now);
    while (this._proQueue.length && this._proQueue[0].at <= now + 1e-9) {
      const p = this._proQueue.shift();
      this._requestJob('PROCKEY', () => this._prockey(p.source), { anchor: 'pinball.prockey' });
    }
    // MONREQ (:2373-2393): every MONDEL, snatch the time for N65 and ask
    // for a MONDO job (CHRPRIO, NOVAC).
    const mon = this.monitor;
    if (mon && now + 1e-9 >= mon.nextAt) {
      mon.nextAt += MONDEL_S;
      if (mon.nextAt <= now) mon.nextAt = now + MONDEL_S;
      this.sampTime = now;
      this._requestJob('MONDO', () => this._mondo(mon), { anchor: 'pinball.mondo', group: 'monitor' });
    }
    // TSTLTS2 (:3673-3678): after SHOLTS, TSTLTS3 as a CHRPRIO job.
    const lt = this.lampTest;
    if (lt && !lt.ending && now + 1e-9 >= lt.endAt) {
      lt.ending = true;
      const ok = this._requestJob('TSTLTS3', () => this._lampTestEnd(lt), { anchor: 'pinball.v35' });
      if (!ok && this.lampTest === lt) this._lampTestEnd(lt);
    }
    if (this.blank && now + 1e-9 >= this.blank.until) {
      const held = this.blank.held;
      this.blank = null;
      if (held) this.showDisplay(held);
    }
    this._wakeDsplist();
  }

  // A program display (GODSP / GOFLASH / GOPERF / REGODSP / CLOCPLAY /
  // PRIODSP in DISPLAY_INTERFACE_ROUTINES.agc terms).
  //   verb, noun        the display (noun 0 = paste verb only)
  //   flash             wait for a response (ENDIDLE): onProceed (PRO/V33),
  //                     onTerminate (V34), onEnter (load complete, or ENTR
  //                     on a pasted PLEASE verb), onRecycle (V32; falls back
  //                     to onEnter)
  //   priority          PRIODSP: interrupts the normal display, which comes
  //                     back after the response
  //   blank             [r1, r2, r3] registers to blank (BLANKSUB bits)
  //   displayVerb       for a PLEASE verb (50, 97, 99 ...): the verb that
  //                     shows the noun first (default V06; V01 for N25,
  //                     V04 for N06 — GOPERF1/GOPERF4)
  //   checklist         N25 R1 code for a V50N25 (stored in DSPTEM1, GOPERF1)
  //   option            N06 option code for V04N06/V50N06 (OPTION1, GOPERF4)
  //   source            anchor id / label for the views
  // Returns 'shown' | 'waiting' (DSKY busy: KEY REL lit, shown on release)
  //       | 'kept' | 'dropped' | 'held' (TIG-35 blanking) | 'interrupted'.
  showDisplay(req = {}) {
    const r = this._normaliseReq(req);
    if (r.checklist !== undefined) this._setErasable('DSPTEM1', r.checklist);
    if (r.option !== undefined) this._setErasable('OPTION1', r.option);
    if (r.priority) return this._prioDisplay(r);
    if (this.blank) {
      this.blank.held = r;
      return 'held';
    }
    // A priority display holds the DSKY: the normal display sleeps until
    // the priority one is answered (MAKEPLAY: "PRIO OR MARK GOING",
    // DISPLAY_INTERFACE_ROUTINES.agc:783-786).
    if (this.prio) {
      this.prio.interrupted = r;
      this.normal = r;
      return 'interrupted';
    }
    // LINUSCHR (DISPLAY_INTERFACE_ROUTINES.agc:1299-1312): a REFLASH of the display already waiting in
    // ENDIDLE while the crew is busy ends the new request.
    if (r.flash && this.waiting && this.dsplock && sameDisplay(this.waiting.req, r)) {
      this.waiting.req = { ...this.waiting.req, ...pickCallbacks(r) };
      return 'kept';
    }
    // WITCHONE: KEY REL off, the old sleeping normal display is woken to
    // ENDOFJOB (its callbacks are never called).
    this._keyRel(false);
    if (this.waiting && !this.waiting.prio) this.waiting = null;
    if (this.dsplist && !this.dsplist.prio) this.dsplist = null;
    this.normal = r;
    const result = this._nvdsp({ req: r, prio: false });
    this._wakeDsplist();
    return result;
  }

  // Start a monitor (V11-V17) the way a program's NVSUB would.
  monitor(verb, noun, opts = {}) {
    return this.showDisplay({ ...opts, verb, noun });
  }

  // KILMONON (:3118-3121): the monitor stops (MONSAVE cleared at the next
  // MONREQ; the model drops it at once).
  endMonitor() {
    if (this.monitor) this._event('monitor-end', { verb: this.monitor.verb, noun: this.monitor.noun });
    this.monitor = null;
  }

  // BURNBABY at TIG-35 (BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc:784-788):
  // "THE DSKY IS BLANKED FOR 5 SECONDS AT TIG-35 TO INDICATE THAT AVERAGE G
  // IS STARTING". The code calls CLEANDSP (DISPLAY_INTERFACE_ROUTINES.agc:
  // 655-658): a display with no verb or noun, which JAMTERM terminates
  // (PINBALL :3173-3181: kill monitor, RELDSP, flash off) and whose
  // terminate exit does NVSUB -3, "BLANK EVERYTHING EXCEPT MM"
  // (CLEANEND / ENDRET, DISPLAY_INTERFACE_ROUTINES.agc:1171-1174, 1259-1274;
  // BLANKDSP :3047-3069). So
  // VERB, NOUN and R1-R3 go dark and PROG stays lit — this is not the
  // all-digits-dark `dsky.blanked` state. CLOKJOB repeats the CLEANDSP every
  // second until TIG-30; the model holds the blank for `seconds` and puts up
  // the last program display requested meanwhile when the hold ends.
  blankFor(seconds) {
    const t = this._now();
    // CLEANDSP cleans out all normal displays, active and inactive.
    if (this.waiting && !this.waiting.prio) this.waiting = null;
    if (this.dsplist && !this.dsplist.prio) this.dsplist = null;
    this.normal = null;
    this.endMonitor();
    this._reldsp();
    this._flash(false);
    if (!this._busy()) this._nvsubBlank(-3);
    this.blank = { until: t + Math.max(0, Number(seconds) || 0), held: null };
    this._event('blank', { seconds });
  }

  // FALTON + 'oprerr' (used by the Agc when V37's program check fails).
  // The digit entry is blocked as after any completed function.
  operatorError(reason = 'operator error') {
    this._falton(reason);
    this._block();
  }

  // The software (ENEMA) or hardware (GOJAM -> GOPROG) restart's STARTSB2
  // (FRESH_START_AND_RESTART.agc:428-579): every digit relay word blanked
  // (DSPOFF :531-537 — PROG too; GOPROG3's MMDSPLAY shows it again),
  // channel 11 lamps KEY REL, V/N FLASH, OPR ERR, UPLINK ACTY off (:428-430),
  // CADRSTOR, REQRET, CLPASS, DSPLOCK, MONSAVE/MONSAVE1 ("KILL MONITOR"),
  // VERBREG, NOUNREG, DSPLIST and FLAGWRD4 ("KILL INTERFACE DISPLAYS")
  // zeroed, DSPCOUNT = -VD1 (:540-577). The lamp word DSPTAB+11D (PROG,
  // TRACKER, ALT, VEL, NO ATT, GIMBAL LOCK) is not touched, and the TEST
  // ALARM channel-13 bit is cleared (CHAN13 WAND 74160, :463-465) — so a
  // lamp test cut short by a restart leaves its relay-word lamps lit.
  onRestart({ hardware = false } = {}) {
    const dsky = this.agc.dsky;
    const lt = this.lampTest;
    this._reset({ keepQueue: true });
    if (dsky) {
      dsky.blankDigits({ keepProg: false });
      dsky.setFlash(false);
      setLights(dsky, { keyRel: false, oprErr: false, uplinkActy: false });
      if (lt) {
        dsky.setLampTest(false);
        setLights(dsky, { stby: false, restart: hardware ? true : lt.saved.restart, temp: lt.saved.temp });
      }
    }
    this._event('restart', { hardware });
  }

  // SLAP1 (V36, FRESH_START_AND_RESTART.agc:38-178): the same PINBALL
  // clean-up plus a dark PROG (MODREG = -0, :108-109), FAILREG cleared
  // (:55-60) and the relay-word lamps off except GIMBAL LOCK and NO ATT
  // (:47-50). The Agc's freshStart() does the rest.
  onFreshStart() {
    const dsky = this.agc.dsky;
    this._reset({ keepQueue: true });
    if (dsky) {
      dsky.blankDigits({ keepProg: false });
      dsky.setFlash(false);
      dsky.setLampTest(false);
      setLights(dsky, {
        keyRel: false, oprErr: false, uplinkActy: false, temp: false,
        prog: false, tracker: false, alt: false, vel: false, stby: false,
      });
    }
  }

  get state() {
    const entry = this._entryState();
    const desc = (w) => (w ? { verb: w.req.verb, noun: w.req.noun, flash: !!w.req.flash, priority: !!w.prio, source: w.req.source || null } : null);
    return {
      entry,
      verb: this.verbReg,
      noun: this.nounReg,
      dsplock: this.dsplock,
      busy: this._busy(),
      monitor: this.monitor ? { verb: this.monitor.verb, noun: this.monitor.noun, external: this.monitor.external } : null,
      waiting: desc(this.waiting),
      dsplist: desc(this.dsplist),
      priority: this.prio ? desc({ req: this.prio.req, prio: true }) : null,
      lampTest: !!this.lampTest,
      blanking: this.blank ? { until: this.blank.until } : null,
      request: this.reqret ? this.reqret.kind : null,
      load: this.load ? { verb: this.load.verb, noun: this.load.noun, register: this.load.comps[this.load.step] + 1 } : null,
      sampTime: this.sampTime,
      queuedKeys: this._keyQueue.length,
    };
  }

  snapshot() {
    return this.state;
  }

  // ======================================================= internals

  _reset({ initial = false, keepQueue = false } = {}) {
    this.dsp = { pos: VD1, blocked: true };   // DSPCOUNT = -VD1
    this.verbReg = 0;                         // VERBREG
    this.nounReg = 0;                         // NOUNREG
    this.decbranch = 0;                       // DECBRNCH low 2 bits
    this.decBits = [false, false, false];     // DECBRNCH bits 5, 4, 3
    this.entries = [newEntry(), newEntry(), newEntry()]; // XREG / YREG / ZREG as keyed
    this.reqret = null;                       // REQRET < 0: { kind: 'load'|'mm'|'address' }
    this.clpass = 0;                          // CLPASS: 0 (+0), >0 (HIPASS), -1 (BIT15)
    this.verbSave = 0;                        // VERBSAVE
    this.dsplock = false;                     // DSPLOCK
    this._oldDsplock = false;                 // 21/22REG
    this.monitor = null;                      // MONSAVE/MONSAVE1/MONSAVE2
    this.waiting = null;                      // CADRSTOR (ENDIDLE)
    this.dsplist = null;                      // DSPLIST (NVSUBUSY)
    this.normal = null;                       // NVSAVE (last normal display)
    this.prio = null;                         // active priority display
    this.load = null;                         // load verb in progress
    this.address = null;                      // NOUNCADR for MCTBS nouns
    this.lampTest = null;
    this.blank = null;
    this._wake = null;                        // a DSPLIST display woken by RELDSP
    if (initial) {
      this.sampTime = null;
      this._seq = 0;
    }
    if (initial || !keepQueue) {
      this._keyQueue = [];
      this._proQueue = [];
    }
  }

  _now() {
    const t = this.agc.exec && typeof this.agc.exec.now === 'function' ? this.agc.exec.now() : this.agc.t;
    return fin(t) ? Math.max(t, this._t) : this._t;
  }

  _event(type, data = {}) {
    this.log.push({ t: this._now(), type, ...data });
    if (this.log.length > 200) this.log.shift();
  }

  _cost(name) {
    const jobs = this.agc.workload && this.agc.workload.params && this.agc.workload.params.jobs;
    const key = { CHARIN: 'charinMs', MONDO: 'mondoMs' }[name];
    if (jobs && key && fin(jobs[key])) return jobs[key];
    return DEFAULT_COST_MS[name] ?? 5;
  }

  // NOVAC at CHRPRIO through the Executive; without one, run at once.
  _requestJob(name, fn, { anchor = null, group = 'keys' } = {}) {
    const exec = this.agc.exec;
    if (!exec || typeof exec.requestJob !== 'function') {
      fn();
      return true;
    }
    const job = exec.requestJob({
      name, prio: CHRPRIO, vac: false, workMs: this._cost(name), source: 'pinball', group, anchor,
      onDone: () => fn(),
    });
    if (!job) {
      this._event('lost', { job: name });
      return false;
    }
    return true;
  }

  _drainKeys(now) {
    while (this._keyQueue.length && this._keyQueue[0].at <= now + 1e-9) {
      const k = this._keyQueue.shift();
      if (k.emit && this.agc.bus) this.agc.bus.emit('key', { key: k.key, t: k.at, source: k.source });
      this.press(k.key, { source: k.source });
    }
  }

  _busy() {
    return this.dsplock || !!(this.monitor && this.monitor.external);
  }

  _entryState() {
    if (this.lampTest) return 'idle';
    if (!this.dsp.blocked) {
      const inrel = inrelOf(this.dsp.pos);
      if (inrel === 0) return 'verb';
      if (inrel === 1) return 'noun';
      const e = this.entries[inrel - 2];
      return e.digits.length || e.sign ? 'data' : 'loading';
    }
    if (this.reqret) return 'loading';
    return 'idle';
  }

  // -------------------------------------------------- DSKY writes

  _dsky() {
    return this.agc.dsky || null;
  }

  _flash(on) {
    const d = this._dsky();
    if (d) d.setFlash(!!on);
  }

  _keyRel(on) {
    const d = this._dsky();
    if (d) d.setLight('keyRel', !!on);
  }

  _falton(reason) {
    const d = this._dsky();
    if (d) d.setLight('oprErr', true);
    const t = this._now();
    this._event('oprerr', { reason });
    if (this.agc.bus) this.agc.bus.emit('oprerr', { t, reason });
  }

  _showVerb(v) {
    const d = this._dsky();
    if (d) d.setVerb(twoDigits(v));
  }

  _showNoun(n) {
    const d = this._dsky();
    if (d) d.setNoun(twoDigits(n));
  }

  _setReg(i, reg) {
    const d = this._dsky();
    if (d) d.setRegister(i, reg);
  }

  _block() {
    this.dsp = { pos: VD1, blocked: true };
  }

  // DSPIN: one character at a DSPCOUNT position.
  _dspin(pos, ch) {
    const d = this._dsky();
    if (!d) return;
    const inrel = inrelOf(pos);
    const idx = charIndex(pos);
    if (inrel === 0) d.setVerb(replaceAt(d.verb, idx, ch));
    else if (inrel === 1) d.setNoun(replaceAt(d.noun, idx, ch));
    else {
      const i = inrel - 2;
      d.setRegister(i, d.r[i].sign, replaceAt(d.r[i].digits, idx, ch));
    }
  }

  _setErasable(name, value) {
    if (!this.agc.erasable) this.agc.erasable = {};
    this.agc.erasable[name] = value;
  }

  // -------------------------------------------------- CHARIN

  _charin(key, source) {
    this._oldDsplock = this.dsplock;          // XCH DSPLOCK / TS 21/22REG
    this.dsplock = true;                      // "BLOCK DISPLAY SYST"
    // "ALL KEYS EXCEPT ER TURN ON KR LITE IF CADRSTOR IS FULL" (:466-473)
    if (this.waiting && key !== 'RSET') this._keyRel(true);
    this._event('key', { key, source });
    if (/^[0-9]$/.test(key)) this._num(Number(key));
    else if (key === 'VERB') this._verbKey();
    else if (key === 'NOUN') this._nounKey();
    else if (key === '+' || key === '-') this._sign(key);
    else if (key === 'CLR') this._clear();
    else if (key === 'ENTR') this._enter();
    else if (key === 'RSET') this._error();
    else if (key === 'KEY REL') this._vbreldsp();
    this._wakeDsplist();
  }

  // VERB / NOUN (NVCOM, :658-674): register zeroed, digits blanked (2BLANK),
  // DECBRNCH = 1 (verb and noun codes are decimal), REQRET = 0 (pass 0).
  _verbKey() {
    this.verbReg = 0;
    this._startField(VD1);
    const d = this._dsky();
    if (d) d.setVerb('  ');
  }

  _nounKey() {
    this.nounReg = 0;
    this._startField(ND1);
    const d = this._dsky();
    if (d) d.setNoun('  ');
  }

  _startField(pos) {
    this.dsp = { pos, blocked: false };
    this.decbranch = 1;
    this.decBits = [false, false, false];
    this.reqret = null;
    this.load = null;
  }

  // NUM / 89TEST (:516-618).
  _num(d) {
    if (this.dsp.blocked) return;             // "BLOCK DATA IN IF DSPCOUNT IS -"
    if ((d === 8 || d === 9) && (this.decbranch & 3) === 0) {
      this._falton('8 or 9 in an octal field');   // 89TEST -> CHARALRM
      return;
    }
    const pos = this.dsp.pos;
    const inrel = inrelOf(pos);
    if (this.clpass >= 0) this.clpass = 0;    // "IF CLPASS IS + OR +0, MAKE IT +0"
    this._dspin(pos, String(d));
    // VERBREG/NOUNREG accumulate in decimal (DECBRNCH = 1 for them); the
    // R1-R3 words are kept as keyed and converted at the final ENTR
    // (DECTOBIN / the octal shift-and-add, :546-615).
    if (inrel === 0) this.verbReg = this.verbReg * 10 + d;
    else if (inrel === 1) this.nounReg = this.nounReg * 10 + d;
    else this.entries[inrel - 2].digits += String(d);
    if (pos === CRITCON[inrel]) this.dsp = { pos, blocked: true };   // ENDALL
    else this.dsp = { pos: pos - 1, blocked: false };                 // MORNUM
  }

  // POSGN / NEGSGN / SIGNTEST (:676-739): only at R1D1/R2D1/R3D1 and only
  // the first sign of a word; the sign relay turns on and the word becomes
  // decimal. Anything else is silently ignored.
  _sign(s) {
    if ((this.decbranch & 3) !== 0) return;
    if (this.dsp.blocked) return;
    const i = RD1.indexOf(this.dsp.pos);
    if (i < 0) return;
    const d = this._dsky();
    if (d) d.setRegister(i, s, d.r[i].digits);
    this.decbranch = s === '+' ? 1 : 2;
    this.decBits[i] = true;
    this.entries[i].sign = s;
    if (this.clpass >= 0) this.clpass = 0;
  }

  // CLEAR (:741-824).
  _clear() {
    let inrel = inrelOf(this.dsp.pos);
    if (this.clpass > 0) {
      // CLPASHI: back up to the previous register (REQRET += 3, VERBREG - 1).
      inrel -= 1;
      if (inrel < 2) return;                  // LEGALTST: nothing before R1
      if (this.load && this.load.step > 0) this.load.step -= 1;
      if (this.verbReg > 0) {
        this.verbReg -= 1;                    // DIM VERBREG / UPDATVB
        this._showVerb(this.verbReg);
      }
      this.reqret = { kind: 'load' };
    } else if (inrel < 2) {
      return;                                 // CLR in the verb/noun field: nothing
    }
    this._5blank(inrel - 2);
    this.clpass += 1;                         // INCR CLPASS ("SET FOR HIGHER PASS")
  }

  // 5BLANK (:801-824): blank a register and its sign, zero X/Y/ZREG, clear
  // its decimal bit and DECBRNCH's low bits, cursor at RxD1.
  _5blank(i) {
    this.entries[i] = newEntry();
    this.decBits[i] = false;
    this.decbranch = 0;
    this._setReg(i, BLANK_REGISTER);
    this.dsp = { pos: RD1[i], blocked: false };
  }

  // ENTER (:852-894).
  _enter() {
    this.clpass = 0;                          // ENTER: CAF ZERO / TS CLPASS
    if (!this.reqret) {
      this._entpas0(this.verbReg, this.nounReg, { internal: false });
      return;
    }
    const rr = this.reqret;
    if (rr.kind === 'mm') {
      this._acceptWord();
      this._mmchang1();
      return;
    }
    if ((this.decbranch & 3) !== 0 && !this.dsp.blocked) {
      // "IF DEC, ALARM IF L/ 5 CHAR IN FOR DATA, BUT LEAVE REQRET - AND
      // FLASH ON, SO OPERATOR CAN SUPPLY MISSING NUMERICAL CHARACTERS".
      this._falton('decimal entry needs 5 digits');
      return;
    }
    this._acceptWord();
    if (rr.kind === 'address') this._addressIn(rr);
    else if (rr.kind === 'load') this._loadWordIn();
  }

  // ACCEPTWD (:891-894): REQRET positive, flash off.
  _acceptWord() {
    this.reqret = null;
    this._flash(false);
  }

  // ENTPAS0 (:903-1027): execute a verb/noun. `ctx.internal` = NVSUB
  // (a program display): alarm conditions then abort with 01501 instead
  // of lighting OPR ERR (:2722-2747).
  _entpas0(verb, noun, ctx = {}) {
    this.decbranch = 0;
    this._block();
    this.verbSave = verb;
    const vt = this.verbs[verb];
    if (!vt) return this._dspalarm(`verb ${verb} does not exist`, ctx);
    if (verb < LOWVERB) {
      const nn = this.nouns[noun];
      if (!nn || !nn.inUse) return this._dspalarm(`noun ${twoDigits(noun)} not in use`, ctx);
      if ((nn.mctbs || nn.channel || nn.augment) && vt.kind !== 'spare') {
        return this._requestAddress(verb, noun, nn, ctx);
      }
    }
    return this._verbfan(verb, noun, ctx);
  }

  _verbfan(verb, noun, ctx) {
    const vt = this.verbs[verb];
    if (verb >= FIRST_EXTENDED_VERB) {
      this._reldsp();                         // VERBFAN: TC RELDSP, then GOEXTVB
      return this._extended(verb, noun, vt, ctx);
    }
    switch (vt.kind) {
      case 'spare':
        return this._dspalarm(`verb ${twoDigits(verb)} is spare`, ctx);
      case 'display':
        return this._displayVerb(verb, noun, ctx);
      case 'monitor':
        return this._monitorSetup(verb, noun, ctx);
      case 'load':
        return this._loadVerb(verb, noun, ctx);
      default:
        break;
    }
    switch (vt.handler) {
      case 'VBPROC': return this._response('proceed');
      case 'VBTERM': return this._response('terminate');
      case 'VBRESEQ': return this._response('recycle');
      case 'VBTSTLTS': return this._lampTestStart(ctx);
      case 'SLAP1': return this._freshStart();
      case 'MMCHANG': return this._mmchang();
      default:
        // V27, V30, V31: valid, not modelled.
        this._event('not-modelled', { verb, noun });
        return true;
    }
  }

  // DSPALARM / GODSPALM (:2722-2747).
  _dspalarm(reason, ctx = {}) {
    if (ctx.monitor) {
      // "IF THIS IS A MONITOR, KILL IT" — then FALTON and PASTEVB.
      if (this.monitor === ctx.monitor) this.monitor = null;
      this._falton(reason);
      this._pasteMonitorVerb(ctx.monitor);
      return false;
    }
    if (ctx.internal) {
      // NVSUB-initiated: TC POODOO / OCT 01501.
      this._event('abort', { code: 0o1501, reason });
      if (typeof this.agc.poodoo === 'function') this.agc.poodoo(0o1501);
      else if (typeof this.agc.alarm === 'function') this.agc.alarm(0o1501);
      return false;
    }
    this._falton(reason);
    return false;
  }

  // ALMCYCLE (:2751-2765): OPR ERR, redisplay the original verb and execute
  // it again (a load starts over at R1; V37 asks for the program again).
  _almcycle(reason, { verb = this.verbSave } = {}) {
    this._falton(reason);
    this.verbReg = verb;
    this._showVerb(verb);
    this.reqret = null;
    this.clpass = 0;
    this._entpas0(verb, this.nounReg, { internal: false });
  }

  // ---------------------------------------- machine address to be specified

  // REQADD (:926-948): N01-N03, N10, N15. The crew keys an octal address
  // into R3 (blank, flashing).
  _requestAddress(verb, noun, nn, ctx) {
    if (nn.augment) {
      this.address = (this.address ?? 0) + 1;     // "AUGMENT LAST MACHINE ADDRESS"
      return this._verbfan(verb, noun, ctx);
    }
    if (ctx.internal) {
      this.address = ctx.address ?? 0;
      return this._verbfan(verb, noun, ctx);
    }
    this.clpass = -1;                             // "SET CLPASS FOR PASS 0 ONLY"
    this.reqret = { kind: 'address', verb, noun };
    this._reqdat(2);
    return true;
  }

  _addressIn(rr) {
    if (this.decBits[2]) {
      this._almcycle('decimal machine address');  // "ALARM AND RECYCLE IF DECIMAL USED FOR MCTBS"
      return;
    }
    this._block();
    if (this.waiting) this._flash(true);          // flash stays on if ENDIDLE is full
    this.address = Number.parseInt(this.entries[2].digits || '0', 8);
    this._verbfan(rr.verb, rr.noun, { internal: false });
  }

  _memoryWord(addr) {
    const m = this.agc.memory;
    if (m && typeof m.read === 'function') {
      const v = m.read(addr);
      if (fin(v)) return v & 0o77777;
    }
    return 0;
  }

  // ----------------------------------------------------- display verbs

  // DSPA .. DSPABC (:1193-1238) and DECDSP (:1320-1384), DSPDPDEC (:1706-1730).
  _displayVerb(verb, noun, ctx) {
    const nn = this.nouns[noun];
    const vt = this.verbs[verb];
    const count = nn.count;
    const values = this._componentValues(nn);
    if (vt.octal) {
      // V01 DECTEST; V02/V03 DCOMPTST; V04/V05 COMPTEST then DECTEST.
      const need = Math.max(...vt.comps);
      if (verb === 4 || verb === 5) {
        if (count < need) return this._dspalarm('verb needs more components than the noun has', ctx);
        if (nn.decimalOnly) return this._dspalarm('octal verb with a decimal-only noun', ctx);
      } else {
        if (nn.decimalOnly) return this._dspalarm('octal verb with a decimal-only noun', ctx);
        if (count < need) return this._dspalarm('verb needs more components than the noun has', ctx);
      }
      if (verb <= 3) {
        this._setReg(0, { sign: ' ', digits: octal5(values[need - 1].word) });
      } else {
        vt.comps.forEach((c, i) => this._setReg(i, { sign: ' ', digits: octal5(values[c - 1].word) }));
      }
      return true;
    }
    if (verb === 7) {
      // DSPDPDEC: normal nouns only (mixed -> DSPALARM, :1716-1719); 10
      // decimal digits in R1-R2, sign in R1 (TEST ONLY; the model shows the
      // first component's integer value).
      if (nn.mixed) return this._dspalarm('V07 with a mixed noun', ctx);
      const v = values[0].value;
      if (!fin(v)) {
        this._setReg(0, BLANK_REGISTER);
        this._setReg(1, BLANK_REGISTER);
        return true;
      }
      const s = String(Math.min(9999999999, Math.round(Math.abs(v)))).padStart(10, '0');
      this._setReg(0, { sign: signOf(v), digits: s.slice(0, 5) });
      this._setReg(1, { sign: ' ', digits: s.slice(5) });
      return true;
    }
    // DECDSP: components shown from the last to R1 (DSPDCPUT counts DECOUNT
    // down); an octal-only component stops it with PREDSPAL.
    for (let k = count - 1; k >= 0; k--) {
      const c = nn.components[k];
      if (c.octalOnly) return this._dspalarm('decimal verb with an octal-only noun', ctx);
      this._setReg(k, formatRegister(values[k].value, c.format));
    }
    return true;
  }

  // Component values for a display: { value (display units), word (15-bit) }.
  _componentValues(nn) {
    return nn.components.map((c, k) => {
      if (nn.mctbs || nn.channel || nn.augment) {
        const w = this._memoryWord((this.address ?? 0) + k);
        // N01 fractional, N02 whole, N03 CDU degrees (NNTYPTAB :384-386).
        const value = c.routine === 1 ? onesValue(w) / 16384 : c.routine === 2 ? (w / 32768) * 360 : onesValue(w);
        return { value, word: w };
      }
      const value = c.read(this.agc);
      return { value, word: c.word(this.agc) };
    });
  }

  // ------------------------------------------------------- monitors

  // MONITOR (:2333-2371).
  _monitorSetup(verb, noun, ctx) {
    const external = !ctx.internal;
    const now = this._now();
    const old = this.monitor;
    this.dsplock = false;                       // "+0 INTO DSPLOCK SO MONITOR CAN RUN"
    if (!this.waiting) this._reldsp1();         // KEY REL off if CADRSTOR and DSPLIST empty
    this.monitor = {
      verb,
      noun,
      external,
      paste: ctx.paste ?? null,                 // NVMONOPT paste option (MONSAVE2)
      blank: ctx.blank ?? null,                 // NVMONOPT blank option
      // "IF MONSAVE WAS +, NO REQUEST": an existing MONREQ chain keeps its phase.
      nextAt: old ? old.nextAt : now + MON_FIRST_S,
      first: !old,
      source: ctx.source || null,
    };
    this._event('monitor', { verb, noun, external });
    return true;
  }

  // MONDO (:2397-2424) then PASTEVB (:2427-2445).
  _mondo(mon) {
    if (this.monitor !== mon) return;           // killed since MONREQ
    if (this.dsplock) {                         // MONBUSY: TC RELDSPON
      this._keyRel(true);
      return;
    }
    this.nounReg = mon.noun;
    this._showNoun(mon.noun);
    const dispVerb = mon.verb - 10;             // "CHANGE MONITOR VERB TO DISPLAY VERB"
    this.verbReg = dispVerb;
    const nn = this.nouns[mon.noun];
    if (!nn || !nn.inUse) {
      this._dspalarm('noun not in use', { monitor: mon });
      return;
    }
    const ok = this._displayVerb(dispVerb, mon.noun, { monitor: mon });
    if (ok) this._pasteMonitorVerb(mon);
  }

  _pasteMonitorVerb(mon) {
    const verb = mon.paste || mon.verb;
    this.verbReg = verb;
    this._showVerb(verb);
    this.reqret = null;                         // "ZERO REQRET SO THAT PASTED VERBS CAN BE EXECUTED"
    if (mon.blank) this._blanksub(mon.blank);
  }

  // BLANKSUB (:3201-3262): blank any of R1-R3.
  _blanksub(mask) {
    mask.forEach((b, i) => { if (b) this._setReg(i, BLANK_REGISTER); });
  }

  // ---------------------------------------------------------- loads

  // ABCLOAD .. CLOAD (:1746-1863).
  _loadVerb(verb, noun, ctx) {
    const nn = this.nouns[noun];
    const comps = this.verbs[verb].comps.map((c) => c - 1);
    if (verb === 24 || verb === 25 || verb === 22 || verb === 23) {
      const need = verb === 24 || verb === 22 ? 2 : 3;
      if (nn.count < need) return this._dspalarm('verb needs more components than the noun has', ctx);
    }
    if ((verb === 24 || verb === 25) && nn.noLoad) return this._dspalarm('V24/V25 with a NO LOAD noun', ctx);
    this.load = { verb, noun, comps, step: 0, internal: !!ctx.internal };
    if (verb === 22 || verb === 23) this.clpass = -1;   // "SET CLPASS FOR PASS0 ONLY"
    this._requestLoadWord();
    return true;
  }

  _requestLoadWord() {
    const L = this.load;
    const i = L.comps[L.step];
    if (L.comps.length > 1) {
      // CAF VBSPxLD / TC UPDATVB -1: VERB shows 21, 22, 23 in turn.
      this.verbReg = LOAD_VERB_FOR[i];
      this._showVerb(this.verbReg);
    }
    this.reqret = { kind: 'load' };
    this._reqdat(i);
  }

  // REQDATX/Y/Z (:1096-1107): cursor at RxD1, register blanked, flash on.
  _reqdat(i) {
    this._5blank(i);
    this._flash(true);
  }

  _loadWordIn() {
    const L = this.load;
    if (!L) return;
    L.step += 1;
    if (L.step < L.comps.length) {
      this._requestLoadWord();
      return;
    }
    this._putLoad();
  }

  // PUTXYZ / PUTXY / ALOAD..CLOAD, ALLDC/OC, PUTCOM (:1758-1932) and LOADLV.
  _putLoad() {
    const L = this.load;
    const nn = this.nouns[L.noun];
    // ALLDC/OC: all decimal or all octal.
    if (L.comps.length > 1) {
      const dec = L.comps.map((i) => this.decBits[i]);
      if (dec.some((x) => x) && !dec.every((x) => x)) {
        this._almcycle('mixed octal and decimal data');
        return;
      }
    }
    const values = [];
    const hms = nn.components[0] && nn.components[0].routine === 8;
    for (const i of L.comps) {
      const c = nn.components[i];
      if (!c) {
        this._almcycle('no such component');
        return;
      }
      const decimal = this.decBits[i];
      if (decimal) {
        if (c.routine === 0) {                 // SFINTABR +0: GOALMCYC
          this._almcycle('decimal data into an octal-only noun');
          return;
        }
        if (!c.loadable && !nn.mctbs && !nn.channel) {
          this._dspalarm('component cannot be loaded', {});   // LR POS, MIN/SEC, 2INT
          this.load = null;
          return;
        }
        const parsed = parseEntry(this.entries[i], c.format);
        if (!parsed.ok) {
          this._almcycle(parsed.reason);
          return;
        }
        values.push({ i, c, value: parsed.value, octal: false });
      } else {
        if (nn.decimalOnly) {                  // DCTSTCYC
          this._almcycle('octal data into a decimal-only noun');
          return;
        }
        if (c.routine === 8) {
          this._almcycle('HMS noun needs decimal data');
          return;
        }
        const word = Number.parseInt(this.entries[i].digits || '0', 8) & 0o77777;
        values.push({ i, c, value: word, octal: true });
      }
    }
    if (hms) {
      // HMSIN / ALL3DEC (:2199-2257): all three, decimal; V21-V23 recycle
      // as V25 (FORCEV25, :2298-2300).
      if (L.comps.length !== 3) {
        this._almcycle('HMS noun needs all 3 components', { verb: 25 });
        return;
      }
      const [h, m, s] = values.map((v) => v.value);
      const total = h * 3600 + m * 60 + s;
      if (Math.abs(total) > 745 * 3600 + 39 * 60 + 14.55 + 1e-9) {
        this._almcycle('time too large');
        return;
      }
      if (nn.mctbs || nn.channel) { /* not modelled */ } else values[0].c.write(this.agc, total);
    } else if (L.noun === 7) {
      // Noun 07 bit set/reset (:1776-1800): needs addressable erasable
      // memory, which the model does not have — accepted, not applied.
      this._event('not-modelled', { verb: L.verb, noun: 7 });
    } else if (!(nn.mctbs || nn.channel)) {
      for (const v of values) {
        if (v.octal && v.c.format !== 'XXXXX OCT') v.c.write(this.agc, onesValue(v.value));
        else v.c.write(this.agc, v.value);
      }
    }
    const loaded = values.map((v) => v.value);
    this.load = null;
    this._loadlv({ verb: L.verb, noun: L.noun, values: loaded });
  }

  // LOADLV (:1865-1873): DECBRNCH 0, LOADSTAT -0 ("data in"), RELDSP,
  // digits blocked, RECALTST.
  _loadlv(data) {
    this.decbranch = 0;
    this._reldsp();
    this._block();
    this._recaltst('enter', data);
  }

  // --------------------------------------------------- responses

  // VBPROC / VBTERM / VBRESEQ (:2860-2886): kill monitor, RELDSP, flash off,
  // RECALTST.
  _response(kind) {
    this.monitor = null;
    this._reldsp();
    this._flash(false);
    this._recaltst(kind);
    return true;
  }

  // PROCKEY (:2871-2878): REQRET = 0, digits blocked, then VBPROC.
  _prockey(source) {
    this._event('key', { key: 'PRO', source });
    this.reqret = null;
    this.load = null;
    this._block();
    this._response('proceed');
    this._wakeDsplist();
  }

  // RECALTST (:3313-3343): wake the display waiting in ENDIDLE, if any.
  _recaltst(kind, data = null) {
    const w = this.waiting;
    if (!w) return false;
    if (w.prio && this._now() - w.shownAt < PRIO_RESPONSE_S - 1e-9) {
      // TIMECHEK / KEEPPRIO (DISPLAY_INTERFACE_ROUTINES.agc:1244-1255, 739): a
      // priority display answered within 2 s is sent out again.
      this._event('prio-too-soon', { kind });
      this._showWaiting(w);
      return false;
    }
    this.waiting = null;
    this._reldsp();                            // RECAL3: TC RELDSP
    this._event('response', { kind, verb: w.req.verb, noun: w.req.noun });
    const r = w.req;
    const fn = kind === 'proceed' ? r.onProceed
      : kind === 'terminate' ? r.onTerminate
        : kind === 'recycle' ? (r.onRecycle || r.onEnter)
          : r.onEnter;
    if (w.prio) this._prioDone(w);
    if (typeof fn === 'function') fn({ kind, t: this._now(), ...(data || {}) });
    return true;
  }

  // ------------------------------------------------------ KEY REL

  // VBRELDSP (:2918-2937).
  _vbreldsp() {
    const d = this._dsky();
    if (d) d.setLight('uplinkActy', false);   // "TURN OFF UPACT LITE"
    if (this._oldDsplock && this.monitor && this.monitor.external) {
      // UNSUSPEN: just clear DSPLOCK; KEY REL off only if nothing waits.
      this.dsplock = false;
      if (!this.waiting) this._reldsp1();
      this._event('unsuspend', { verb: this.monitor.verb, noun: this.monitor.noun });
      return;
    }
    this._reldsp();                            // TSTLTS4
    if (this.waiting) this._pinbrnch();
  }

  // RELDSP (:3578-3597): DSPLOCK 0, external-monitor bit off, wake DSPLIST,
  // KEY REL off.
  _reldsp() {
    if (this.monitor) this.monitor.external = false;
    if (this.dsplist) {
      this._wake = this.dsplist;
      this.dsplist = null;
    }
    this._keyRel(false);
    this.dsplock = false;
  }

  // RELDSP1 (:3598-3608): DSPLOCK 0; KEY REL off only if DSPLIST is empty.
  _reldsp1() {
    if (!this.dsplist) this._keyRel(false);
    this.dsplock = false;
  }

  // A display job woken from DSPLIST runs after the current job.
  _wakeDsplist() {
    const w = this._wake;
    if (!w) return;
    this._wake = null;
    this._nvdsp(w);
  }

  // PINBRNCH (DISPLAY_INTERFACE_ROUTINES.agc:1026-1046): re-establish the
  // display waiting for a response; with none, ERASER blanks everything
  // but PROG (:1387-1390).
  _pinbrnch() {
    if (this.waiting) {
      this._showWaiting(this.waiting);
      return;
    }
    this._nvsubBlank(-3);
  }

  // ------------------------------------------------------ RSET

  // ERROR (:3732-3787), in order.
  _error() {
    this.dsplock = this._oldDsplock;           // "ERROR LIGHT RESET LEAVES DSPLOCK UNCHANGED"
    const d = this._dsky();
    if (d) {
      // CAUTION RESET (ch 11 bit 10) and the RSET key itself reset the
      // RESTART flip-flop; relay word 12 keeps only GIMBAL LOCK and NO ATT;
      // TEST ALARM off (STBY, RESTART); UPLINK ACTY and OPR ERR off.
      setLights(d, { restart: false, prog: false, tracker: false, alt: false, vel: false, stby: false, uplinkActy: false, oprErr: false });
    }
    // FAILREG, FAILREG +1, FAILREG +2 zeroed (:3782-3785).
    const a = this.agc.alarms;
    if (a && typeof a.reset === 'function') a.reset();
    else if (Array.isArray(a)) a.fill(0);
    else if (a && Array.isArray(a.failreg)) a.failreg.fill(0);
    this._event('rset');
  }

  // ------------------------------------------------------ V35

  // VBTSTLTS (:3623-3671).
  _lampTestStart(ctx) {
    if (this.software === 'Comanche055') {
      // Comanche055 VBTSTLTS first calls CHKPOOH: only in P00 (or a blank
      // MM), else ALM/END (Comanche055/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:
      // 3635-3636, EXTENDED_VERBS.agc:1007-1010).
      const mode = this.agc.mode;
      if (mode !== 0 && mode !== null && mode !== undefined) {
        this._falton('V35 only in P00');
        this._pinbrnch();
        return false;
      }
    }
    const d = this._dsky();
    const saved = d
      ? { restart: d.lights.restart, temp: d.lights.temp, gimbalLock: d.lights.gimbalLock, noAtt: d.lights.noAtt, stby: d.lights.stby }
      : { restart: false, temp: false, gimbalLock: false, noAtt: false, stby: false };
    if (d) {
      // TSTCON1 OCT 00175: ISS warning, UPLINK ACTY, TEMP, KEY REL, V/N
      // FLASH, OPR ERR. TSTCON2: LM OCT 40674 = VEL, NO ATT, ALT, GIMBAL
      // LOCK, TRACKER, PROG; CM OCT 40650 = NO ATT, GIMBAL LOCK, TRACKER,
      // PROG. TEST ALARM (ch 13 bit 10): the hardware lights STBY and RESTART.
      const lm = this.software !== 'Comanche055';
      setLights(d, {
        uplinkActy: true, temp: true, keyRel: true, oprErr: true,
        noAtt: true, gimbalLock: true, tracker: true, prog: true,
        alt: lm, vel: lm, stby: true, restart: true,
      });
      d.setFlash(true);
      d.setAll8s();                            // FULLDSP 05675 / FULLDSP1 07675
      d.setLampTest(true);
    }
    // "DSPLOCK IS LEFT BUSY (FROM KEYBOARD ACTION) UNTIL TSTLTS3 TO INSURE
    // THAT LIGHTS TEST WILL BE SEEN."
    this.dsplock = true;
    this.lampTest = { endAt: this._now() + LAMP_TEST_S, saved, ending: false };
    this._event('lamp-test', {});
    void ctx;
    return true;
  }

  // TSTLTS3 + TSTLTS4 (:3680-3714, :2926).
  _lampTestEnd(lt) {
    if (this.lampTest !== lt) return;
    this.lampTest = null;
    const d = this._dsky();
    if (d) {
      // TSTCON3: UPLINK ACTY, TEMP, OPR ERR off; TEST ALARM off; relay word 12
      // := NO ATT from channel 12 (coarse align). TEMP, GIMBAL LOCK and NO
      // ATT go back to what their drivers (T4RUPT, IMUMON) were showing —
      // the re-armed failure bits re-light a real failure within a pass.
      setLights(d, {
        uplinkActy: false, temp: lt.saved.temp, oprErr: false,
        stby: lt.saved.stby, restart: lt.saved.restart,
        prog: false, tracker: false, alt: false, vel: false,
        gimbalLock: lt.saved.gimbalLock, noAtt: lt.saved.noAtt,
      });
      d.setLampTest(false);
      // DSPMM: PROG shows MODREG (blank for -0). VERB, NOUN, R1-R3 keep their 8s.
      d.setProg(this._modeDigits());
    }
    this.monitor = null;                       // KILMONON
    this._flash(false);                        // FLASHOFF
    this._reldsp();                            // TSTLTS4 = RELDSP ...
    if (this.waiting) this._pinbrnch();        // ... and PINBRNCH if ENDIDLE waits
    this._wakeDsplist();
    this._event('lamp-test-end', {});
  }

  _modeDigits() {
    const m = this.agc.mode;
    return fin(m) ? twoDigits(m) : '  ';
  }

  // ------------------------------------------------------ V36 / V37

  // V36 -> SLAP1.
  _freshStart() {
    this.onFreshStart();
    if (typeof this.agc.freshStart === 'function') this.agc.freshStart();
    return true;
  }

  // MMCHANG / REQMM (:2777-2810): VERB 37, NOUN blank, V/N flashing; key 2
  // digits and ENTR.
  _mmchang() {
    this.reqret = { kind: 'mm' };
    this.dsp = { pos: ND1, blocked: false };
    this.nounReg = 0;
    this._showNoun(null);
    this._flash(true);
    this.decbranch = 1;
    return true;
  }

  // MMCHANG +1: "DEMAND THAT 2 NUM CHAR WERE PUNCHED IN", then V37.
  _mmchang1() {
    if (!(this.dsp.blocked && this.dsp.pos === ND2)) {
      this._almcycle('V37 needs exactly 2 digits');
      return;
    }
    const n = this.nounReg;
    this.nounReg = 0;
    this._showNoun(null);
    this._block();
    this._v37(n);
  }

  // V37 (FRESH_START_AND_RESTART.agc:739-787). A program not in the table
  // gets V37NONO: TC FALTON, then V37BAD: RELDSP and PINBRNCH (:978-980,
  // :766-770). A legal one goes through GOPROG2 -> STARTSB2 (:892-899,
  // :284), which wipes the display the way a restart does before the new
  // program's MM and displays come up.
  _v37(n) {
    this._event('v37', { program: n });
    if (!this.v37.includes(n)) {
      this._falton(`no program ${twoDigits(n)} in the V37 table`);
      this._reldsp();
      this._pinbrnch();
      return false;
    }
    const d = this._dsky();
    this._reset({ keepQueue: true });
    if (d) {
      d.blankDigits({ keepProg: false });
      d.setFlash(false);
      setLights(d, { keyRel: false, oprErr: false, uplinkActy: false });
    }
    let ok = true;
    if (typeof this.agc.changeProgram === 'function') ok = this.agc.changeProgram(n) !== false;
    if (!ok && d && !d.lights.oprErr) this._falton(`V37 ${twoDigits(n)} rejected`);
    return ok;
  }

  // ------------------------------------------------------ extended verbs

  _extended(verb, noun, vt, ctx) {
    switch (vt.kind) {
      case 'spare':
        // ALM/END: FALTON, then PINBRNCH (EXTENDED_VERBS.agc:145-147).
        this._falton(`verb ${verb} is spare`);
        this._pinbrnch();
        return false;
      case 'please':
        // GOLOADLV (EXTENDED_VERBS.agc:508-514): flash off, LOADLV — the
        // "PLEASE" verb keyed with ENTR answers the request ("enter").
        this._flash(false);
        this._loadlv({ verb, noun });
        return true;
      default:
        break;
    }
    if (vt.handler === 'VERB69') {
      this._event('v69', {});
      if (typeof this.agc.hardwareRestart === 'function') this.agc.hardwareRestart('V69');
      return true;
    }
    if (vt.flag) {
      // LRON / LROFF: UPFLAG / DOWNFLAG LRINH, then GOPIN -> PINBRNCH.
      if (!this.agc.flags) this.agc.flags = {};
      Object.assign(this.agc.flags, vt.flag);
      this._event('flag', { verb, ...vt.flag });
      this._pinbrnch();
      return true;
    }
    this._event('not-modelled', { verb, noun });
    void ctx;
    return true;
  }

  // ------------------------------------------------------ program displays

  _normaliseReq(req) {
    const r = { ...req };
    r.verb = Number(r.verb ?? 0);
    r.noun = Number(r.noun ?? 0);
    r.flash = !!r.flash;
    r.priority = !!r.priority;
    if (this.verbs[r.verb] && this.verbs[r.verb].kind === 'please' && r.noun !== 0) r.please = true;
    // A pasted verb (noun 0) is "ALWAYS ON FLASH" (DISPLAY_INTERFACE_ROUTINES.agc:1111-1117).
    if (r.noun === 0 && r.verb !== 0) r.flash = true;
    if (r.please) r.flash = true;
    return r;
  }

  // NVDSP (DISPLAY_INTERFACE_ROUTINES.agc:1048-1120) for one display record
  // { req, prio }.
  _nvdsp(rec) {
    if (this._busy()) {
      // NVMONOPT returned "busy" -> REST: if someone is in ENDIDLE, end;
      // else RESTSLEP -> NVSUBUSY: sleep in DSPLIST with KEY REL lit.
      if (this.waiting && this.waiting !== rec) return 'dropped';
      this.dsplist = rec;
      this._keyRel(true);
      return 'waiting';
    }
    this._showRecord(rec);
    return 'shown';
  }

  _showWaiting(w) {
    this._showRecord(w, { reestablish: true });
  }

  // NVSUB (:3009-3097) plus the display-interface second part.
  _showRecord(rec, { reestablish = false } = {}) {
    const r = rec.req;
    this.monitor = null;                       // NVSUB: TC KILMONON
    this.dsplock = false;
    this.clpass = 0;
    this.load = null;
    this.reqret = null;
    this._flash(false);                        // "IN CASE OF EXTENDED VERB NON-FLASH"
    let ok = true;
    if (r.please) {
      // GOPERF / CLOCPLAY: show the noun with a display verb, then paste the
      // PLEASE verb and flash (DISPLAY_INTERFACE_ROUTINES.agc:1121-1143).
      const dv = r.displayVerb ?? (r.noun === 25 ? 1 : r.noun === 6 ? 4 : 6);
      ok = this._nvsubExecute(dv, r.noun, rec);
      const blank = r.blank ?? (r.noun === 25 ? [false, true, true] : r.noun === 6 ? [false, false, true] : null);
      if (blank) this._blanksub(blank);
      this.verbReg = r.verb;
      this._showVerb(r.verb);
    } else if (r.verb === 0) {
      // "IF V'S =0, THE NEW NOUN CODE IS DISPLAYED ONLY"
      this.nounReg = r.noun;
      this._showNoun(r.noun);
    } else if (r.noun === 0) {
      // "IF N'S =0, THE NEW VERB CODE IS DISPLAYED ONLY", REQRET = 0.
      this.verbReg = r.verb;
      this._showVerb(r.verb);
    } else {
      ok = this._nvsubExecute(r.verb, r.noun, rec);
      if (r.blank) this._blanksub(r.blank);
    }
    if (!ok) return;
    if (r.flash) {
      this._flash(true);                       // FLASHSUB: TC FLASHON
      // ENDIDLE: CADRSTOR := the waiting display.
      this.waiting = { req: r, prio: !!rec.prio, shownAt: reestablish && this.waiting === rec ? rec.shownAt : this._now() };
      if (rec.prio) this.prio = this.prio || { req: r, interrupted: null };
    }
    this._event('display', { verb: r.verb, noun: r.noun, flash: r.flash, priority: !!rec.prio, source: r.source || null });
  }

  // NVSUB with a full verb/noun: VERB and NOUN lights, then ENTPAS0.
  _nvsubExecute(verb, noun, rec) {
    this.verbReg = verb;
    this.nounReg = noun;
    this._showVerb(verb);
    this._showNoun(noun);
    const r = rec.req;
    return this._entpas0(verb, noun, {
      internal: true, source: r.source, address: r.address,
      paste: r.monitorPaste ?? null, blank: r.monitorBlank ?? null,
    }) !== false;
  }

  // BLANKDSP (:3047-3069): -4 full blank, -3 leave MM, -2 leave MM and
  // verb, -1 R1-R3 only. Each also turns off the flash and zeroes REQRET.
  _nvsubBlank(code) {
    if (this._busy()) return false;
    this.monitor = null;
    const d = this._dsky();
    if (d) {
      for (let i = 0; i < 3; i++) d.setRegisterBlank(i);
      if (code <= -2) d.setNoun('  ');
      if (code <= -3) d.setVerb('  ');
      if (code <= -4) d.setProg('  ');
    }
    if (code <= -3) this.verbReg = 0;
    if (code <= -2) this.nounReg = 0;
    this.clpass = 0;
    this._block();
    this._flash(false);
    this.reqret = null;
    return true;
  }

  // PRIODSP (DISPLAY_INTERFACE_ROUTINES.agc:697-747): a priority
  // display interrupts the normal one and restores it after the response.
  // Two at once abort with 01502 (PRIOBORT).
  _prioDisplay(r) {
    if (this.prio && this.waiting && this.waiting.prio && !sameDisplay(this.prio.req, r)) {
      this._event('abort', { code: 0o1502 });
      if (typeof this.agc.poodoo === 'function') this.agc.poodoo(0o1502);
      else if (typeof this.agc.alarm === 'function') this.agc.alarm(0o1502);
      return 'dropped';
    }
    const interrupted = this.prio ? this.prio.interrupted : this.normal;
    if (this.waiting && !this.waiting.prio) this.waiting = null;   // the normal display is put to sleep
    if (this.dsplist && !this.dsplist.prio) this.dsplist = null;
    this.prio = { req: r, interrupted };
    const rec = { req: { ...r, flash: true }, prio: true };
    return this._nvdsp(rec);
  }

  _prioDone() {
    const p = this.prio;
    this.prio = null;
    if (p && p.interrupted) {
      // The interrupted normal display is woken and put up again.
      const r = p.interrupted;
      this.normal = r;
      this._nvdsp({ req: r, prio: false });
    }
  }
}

// ---------------------------------------------------------------- helpers

function newEntry() {
  return { sign: null, digits: '' };
}

function replaceAt(str, idx, ch) {
  const s = String(str);
  return s.slice(0, idx) + ch + s.slice(idx + 1);
}

function sameDisplay(a, b) {
  return !!a && !!b && a.verb === b.verb && a.noun === b.noun;
}

function pickCallbacks(r) {
  const out = {};
  for (const k of ['onProceed', 'onTerminate', 'onEnter', 'onRecycle']) if (typeof r[k] === 'function') out[k] = r[k];
  return out;
}

// A ones'-complement 15-bit word as a signed integer.
function onesValue(w) {
  const n = Number(w) & 0o77777;
  return n & 0o40000 ? -((~n) & 0o37777) : n;
}

// setLights() that tolerates a stand-in without it.
function setLights(dsky, map) {
  if (typeof dsky.setLights === 'function') dsky.setLights(map);
  else for (const [k, v] of Object.entries(map)) dsky.setLight(k, v);
}

