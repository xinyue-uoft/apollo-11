// Restart groups (phase tables), the software restart and the hardware
// restart.
//
// In the AGC, programs register "waypoints" with PHASCHNG: for each of six
// restart groups the erasable pair PHASEn/-PHASEn says what to re-create if
// the computer restarts now (Luminary099/PHASE_TABLE_MAINTENANCE.agc:228-239,
// RESTART_TABLES.agc, RESTARTS_ROUTINE.agc:35-59). Here a program registers
// the same thing as a callback: protect(group, phase, reenter).
//
// Software restart (1201/1202/1203 ...): BAILOUT/BAILOUT1 log the code
// (FAILREG, PROG lamp) and go to WHIMPER -> ENEMA (ALARM_AND_ABORT.agc:
// 133-149, 189-196; FRESH_START_AND_RESTART.agc:281-289). STARTSB1/STARTSB2
// empty the Waitlist, free every core set and VAC area, blank the DSKY,
// kill the crew's monitor and the interface displays (:399-562). GOPROG3
// re-displays the major mode (MMDSPLAY) and re-creates each active group
// from its phase (:290-341). What survives: all other erasable memory — the
// state vector, guidance variables, FAILREG, the lamp word (so PROG stays
// lit), engine on/off — and the phase tables themselves. The RESTART lamp is
// NOT lit: only the hardware GOJAM sets that flip-flop (research
// src-executive §8.2; Copps 1968, research web-1202-b §2.5).
//
// Hardware restart (GOJAM, e.g. V69's TC trap, EXTENDED_VERBS.agc:81): the
// GO vector at 4000 (INTERRUPT_LEAD_INS.agc:32-35) -> GOPROG: INCR REDOCTR,
// the same STARTSUB clean-up, RESTART lamp on (PROG, GIMBAL LOCK, NO ATT
// kept, FRESH_START_AND_RESTART.agc:249-263), then GOPROG3.
//
// Duration: the code path is a few hundred instructions; the research
// estimates 10-20 ms (web-1202-b §2.4, an inference — no measured figure).
// The model charges `restartMs` of interrupt-level CPU time.

export const GROUPS = Object.freeze([1, 2, 3, 4, 5, 6]);

export class RestartModel {
  // `agc` provides (all optional, used when present): exec, alarms, dsky,
  // pinball, workload, bus, mode, t, program.
  constructor(agc, { restartMs = 15 } = {}) {
    this.agc = agc;
    this.restartMs = restartMs;
    this.groups = new Map();
    for (const g of GROUPS) this.groups.set(g, blankGroup(g));
    this.count = 0;          // software + hardware restarts
    this.softwareCount = 0;
    this.redoctr = 0;        // REDOCTR: hardware restarts only (GOPROG :206)
    this.lastT = null;
    this.lastReason = null;
    this.lastCode = null;
    this.lastHardware = false;
    this.history = [];
    this._pending = false;
  }

  // ------------------------------------------------------------ phases

  // PHASCHNG: group `group` (1-6) is now at `phase` — a string as written in
  // the listings ('5.3', '4.21') or a number; on a restart call
  // `reenter(t, { group, phase, hardware })`. meta (optional):
  // { label, anchor } for the UI, `owner` for clearIfOwner().
  protect(group, phase, reenter, meta = {}) {
    const g = this.groups.get(group);
    if (!g) throw new Error(`Restart group ${group} does not exist (1-6)`);
    g.phase = phase === undefined || phase === null ? '' : String(phase);
    g.reenter = typeof reenter === 'function' ? reenter : null;
    g.active = true;
    g.label = meta.label || g.label || '';
    g.anchor = meta.anchor || null;
    g.owner = meta.owner || null;
    g.since = this._now();
  }

  // Phase G.0: group inactive (e.g. DISPEXIT "KILL GROUP 3",
  // LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:835-837).
  clear(group) {
    const g = this.groups.get(group);
    if (!g) return;
    Object.assign(g, blankGroup(group));
  }

  // Clear a group only if `owner` still owns it (two modules may share a
  // group over time; a stale clear must not kill a newer registration).
  clearIfOwner(group, owner) {
    const g = this.groups.get(group);
    if (g && g.owner === owner) this.clear(group);
  }

  isProtected(group) {
    return !!this.groups.get(group)?.active;
  }

  // ------------------------------------------------------------ restarts

  // BAILOUT path. `code` may be null (ABORT = WHIMPER with no code).
  software(code = null, { reason } = {}) {
    if (this._pending) return; // the machine is already restarting
    const agc = this.agc;
    const t = this._now();
    if (code !== null && code !== undefined) {
      this._alarm(code, t, true);
    }
    this._schedule({ hardware: false, code, reason: reason || reasonFor(code) });
  }

  bailout(code) {
    this.software(code);
  }

  // GOJAM path: `cause` e.g. 'V69', 'night watchman', 'parity'.
  hardware(cause = 'hardware restart') {
    if (this._pending) return;
    this._schedule({ hardware: true, code: null, reason: String(cause) });
  }

  // POODOO: alarm, kill the groups and restart with nothing to re-create;
  // the program then goes to P00 (GOPOODOO, ALARM_AND_ABORT.agc:150-177).
  // Calls agc.startProgram(0) if the Agc offers it.
  poodoo(code) {
    if (this._pending) return;
    const t = this._now();
    if (code !== null && code !== undefined) this._alarm(code, t, false);
    for (const g of GROUPS) this.clear(g);
    this._schedule({ hardware: false, code, reason: `POODOO ${fmt(code)}`, toP00: true });
  }

  // V36 fresh start (SLAP1): forget everything, including REDOCTR and
  // FAILREG (FRESH_START_AND_RESTART.agc:38-60). The Agc does the rest
  // (lamps, P00).
  freshStart() {
    const agc = this.agc;
    for (const g of GROUPS) this.clear(g);
    if (agc.exec) {
      agc.exec.restartPending = false;
      agc.exec.flush();
    }
    if (agc.alarms && typeof agc.alarms.clear === 'function') agc.alarms.clear();
    if (agc.workload && typeof agc.workload.onFreshStart === 'function') agc.workload.onFreshStart();
    this.redoctr = 0;
    this._pending = false;
  }

  _alarm(code, t, restart) {
    const agc = this.agc;
    if (agc.alarms && typeof agc.alarms.alarm === 'function') {
      agc.alarms.alarm(code, { t, restart });
    } else if (agc.bus) {
      agc.bus.emit('alarm', { code, t, text: '', restart });
    }
  }

  // The destructive part runs at the executive's next safe point: BAILOUT
  // never returns to the code that made the failing request.
  _schedule(info) {
    const exec = this.agc.exec;
    this._pending = true;
    if (exec) {
      exec.restartPending = true;
      exec.atSafePoint(() => this._run(info));
    } else {
      this._run(info);
    }
  }

  _run({ hardware, code, reason, toP00 = false }) {
    const agc = this.agc;
    const exec = agc.exec;
    const dsky = agc.dsky;
    const t = this._now();
    this._pending = false;

    // STARTSB1/STARTSB2: waitlist and executive emptied.
    if (exec) {
      exec.restartPending = false;
      exec.flush();
    }

    // Channel 11 outbits cleared by STARTSB2 (:428-430): COMP ACTY, UPLINK
    // ACTY, TEMP?, KEY REL, V/N FLASH, OPR ERR. (TEMP is re-driven by T4RUPT
    // from the IMU temperature, so it is left alone here.) The lamp word
    // DSPTAB+11D — PROG, NO ATT, GIMBAL LOCK, TRACKER, ALT, VEL — is not
    // touched by a software restart.
    if (dsky && typeof dsky.setLight === 'function') {
      for (const lamp of ['compActy', 'uplinkActy', 'keyRel', 'oprErr']) setLamp(dsky, lamp, false);
      if (hardware) {
        setLamp(dsky, 'restart', true);
        this.redoctr += 1; // INCR REDOCTR (:206)
      }
    }

    // PINBALL clean-up: DSPOFF blanks every digit relay word, MONSAVE and
    // MONSAVE1 zeroed (KILL MONITOR), FLAGWRD4 zeroed (interface displays),
    // verb/noun entry abandoned (:531-562).
    if (agc.pinball && typeof agc.pinball.onRestart === 'function') {
      agc.pinball.onRestart({ hardware });
    } else if (dsky) {
      blankDsky(dsky);
    }
    if (agc.workload && typeof agc.workload.onRestart === 'function') {
      agc.workload.onRestart(t, { hardware });
    }

    // The restart code itself.
    if (exec) exec.chargeInterrupt('restart', this.restartMs);

    // GOPROG3: MMDSPLAY first (DSPMMJB, PRIO30 NOVAC — PHASE_TABLE_
    // MAINTENANCE.agc:45-48, :66-75), then the active groups in the order of
    // the NUMGRPS loop: 6, 5, 4, 3, 2, 1 (FRESH_START_AND_RESTART.agc:323-338).
    const mode = agc.mode;
    if (exec) {
      exec.requestJob({
        name: 'DSPMMJB', prio: 0o30, vac: false, workMs: 2, group: 'display',
        anchor: 'restart.mmdsplay', source: 'restart',
        onDone: () => redisplayMode(agc, mode),
      });
    } else {
      redisplayMode(agc, mode);
    }

    const reentered = [];
    if (!toP00) {
      for (const g of [...GROUPS].reverse()) {
        const grp = this.groups.get(g);
        if (!grp.active) continue;
        reentered.push({ group: g, phase: grp.phase, label: grp.label || '', owner: grp.owner || null });
        if (grp.reenter) {
          try {
            grp.reenter(t, { group: g, phase: grp.phase, hardware });
          } catch (err) {
            // A broken callback must not take the whole simulation down.
            if (typeof console !== 'undefined') console.error(`restart group ${g} re-entry failed`, err);
          }
        }
      }
    }

    this.count += 1;
    if (!hardware) this.softwareCount += 1;
    this.lastT = t;
    this.lastReason = reason;
    this.lastCode = code ?? null;
    this.lastHardware = hardware;
    const rec = { t, reason, code: code ?? null, hardware, groups: reentered };
    this.history.push(rec);
    if (this.history.length > 50) this.history.shift();
    if (agc.bus) agc.bus.emit('restart', { t, reason, code: code ?? null, hardware, groups: reentered });

    if (toP00 && typeof agc.startProgram === 'function') agc.startProgram(0);
  }

  _now() {
    const agc = this.agc;
    if (agc.exec && typeof agc.exec.now === 'function') return agc.exec.now();
    return typeof agc.t === 'number' ? agc.t : 0;
  }

  get pending() {
    return this._pending;
  }

  // ARCHITECTURE §6.9.1 `restart`.
  snapshot() {
    return {
      count: this.count,
      softwareCount: this.softwareCount,
      redoctr: this.redoctr,
      lastT: this.lastT,
      lastReason: this.lastReason,
      lastCode: this.lastCode,
      lastHardware: this.lastHardware,
      pending: this._pending,
      groups: GROUPS.map((g) => {
        const x = this.groups.get(g);
        return { group: g, phase: x.phase, active: x.active, label: x.label, anchor: x.anchor };
      }),
      history: this.history.slice(-10),
    };
  }
}

function blankGroup(group) {
  return { group, phase: `${group}.0`, reenter: null, active: false, label: '', anchor: null, owner: null, since: null };
}

function setLamp(dsky, name, on) {
  if (dsky.lights && dsky.lights[name] === on) return;
  dsky.setLight(name, on);
}

function blankDsky(dsky) {
  if (typeof dsky.setProg === 'function') dsky.setProg('  ');
  if (typeof dsky.setVerb === 'function') dsky.setVerb('  ');
  if (typeof dsky.setNoun === 'function') dsky.setNoun('  ');
  if (typeof dsky.setRegister === 'function') for (let i = 0; i < 3; i++) dsky.setRegister(i, ' ', '     ');
  if (typeof dsky.setFlash === 'function') dsky.setFlash(false);
}

// MMDSPLAY: put the major mode back in the PROG digits.
function redisplayMode(agc, mode) {
  const m = typeof agc.mode === 'number' ? agc.mode : mode;
  if (typeof m !== 'number' || !agc.dsky || typeof agc.dsky.setProg !== 'function') return;
  agc.dsky.setProg(String(m).padStart(2, '0'));
}

function fmt(code) {
  return code === null || code === undefined ? '' : Number(code).toString(8).padStart(5, '0');
}

function reasonFor(code) {
  if (code === null || code === undefined) return 'software restart (ABORT)';
  return `software restart after alarm ${fmt(code)}`;
}
