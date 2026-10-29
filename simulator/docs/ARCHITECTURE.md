# AGC Simulator — Architecture & Module Contracts

This document is the contract between the modules of the simulator. Every
module owner implements exactly the public API described here; anything not
listed is private to the module and may change freely.

## 1. Goals

1. A faithful **DSKY** (display & keyboard) driven by a behavioural model of
   the AGC's display software ("PINBALL GAME"), the Executive and the landing
   programs of **Luminary 099** (LM, Apollo 11) — and, for the Command Module
   chapter, **Comanche 055**.
2. A **demo mode** that replays historical events at their real Ground
   Elapsed Times (GET), narrates them, shows the crew/ground transcript, and
   highlights the *actual source lines in this repository* that implement
   what is happening.
3. An **interactive mode**: free DSKY use, plus a descent sandbox where the
   user flies P63 → P64 → P66 with a physics model and the real descent
   guidance law.
4. **Honesty.** This is a behavioural model, not an instruction-level emulator
   of the assembled rope. Where the model simplifies, the UI says so. All
   historical facts carry sources (see `docs/SOURCES.md`).

## 2. Ground rules

- Static site, vanilla JavaScript **ES modules**, no runtime dependencies, no
  build step. Works in current Chrome/Firefox/Safari.
- Served over HTTP **from the repository root** so that the source panel can
  `fetch('../Luminary099/<file>.agc')`. `node simulator/serve.mjs` does this.
- **Deterministic.** No `Math.random()` and no wall-clock reads inside the
  simulation; use `util/rng.js` (seeded) and the simulation clock. Seeking is
  implemented as *reset + fast re-simulation*, so determinism is required.
- Pure logic modules (`agc/`, `vehicle/`, `demo/director.js`, `data/`,
  `util/`) must **not touch the DOM** and must import cleanly in Node 22 so
  that `node --test simulator/test/` can exercise them.
- UI modules live in `ui/` and are the only ones that touch the DOM.
- Units: SI internally (m, m/s, kg, N, s). Convert to feet / ft/s / lb only
  for display or when ingesting historical data (`util/units.js`).
- Time: GET in **seconds** (float). `util/time.js` converts to/from
  `"hhh:mm:ss"` strings.

## 3. Directory layout

```text
simulator/
  index.html            app shell (layout containers, no logic)
  serve.mjs             zero-dependency static server rooted at the repo root
  README.md             how to run, what is modelled, credits
  css/                  base.css (tokens/layout) + one file per view
  js/
    main.js             bootstrap (creates App)
    app.js              App: modes, scenario list, frame loop, view wiring
    util/               bus.js, time.js, rng.js, units.js, keys.js
    agc/                the computer model (pure logic)
      agc.js            Agc: composition root of the computer model
      dsky-state.js     DskyState: what the DSKY currently shows
      display-format.js number → DSKY register formatting
      pinball.js        Pinball: keyboard & display software
      verbs.js          verb table (Luminary099, Comanche055)
      nouns.js          noun tables (Luminary099, Comanche055)
      alarms.js         alarm/abort code table + FAILREG model
      executive.js      Executive: core sets, VAC areas, priorities, load
      workload.js       which jobs/interrupt loads exist in which program
      restart.js        restart groups / phase table model, BAILOUT → ENEMA
      programs/         major-mode programs (P00, P63, P64, P66, P68, ...)
      guidance/         landing guidance law (Klumpp quadratic guidance)
    vehicle/            physics + replay providers of the vehicle state
    data/               historical datasets, source anchors, manifest
    demo/               Director (scenario player) + scenario scripts
    ui/                 DOM views
  tools/                generators (source manifest)
  test/                 node:test suites (*.test.mjs)
  docs/                 ARCHITECTURE.md, SOURCES.md
```

## 4. Shared utilities (`js/util/`) — already implemented

- `bus.js` — `createBus()` → `{ on(type, fn) → off, once, emit(type, payload) }`.
- `time.js` — `parseGET("102:38:26")` → seconds; `formatGET(s, {tenths})` →
  `"102:38:26"`; `formatMinSec`.
- `rng.js` — `createRng(seed)` → `{ next() ∈ [0,1), normal(mu, sigma), fork(label) }`.
- `units.js` — `FT`, `FPS`, `LB`, `LBF`, `NMI`, `toFt`, `fromFt`, ...
- `keys.js` — DSKY key names and keystroke-script parser:
  `parseKeys("V16N68E")` → `['VERB','1','6','NOUN','6','8','ENTR']`.
  Tokens: `V`=VERB, `N`=NOUN, `E`=ENTR, `P`=PRO, `C`=CLR, `R`=RSET,
  `K`=KEY REL, `+`, `-`, digits; whitespace ignored.

Key names (exact strings used everywhere): `'VERB' 'NOUN' '+' '-' '0'…'9'
'CLR' 'PRO' 'KEY REL' 'ENTR' 'RSET'`.

## 5. The simulation (`js/sim.js`)

```js
const sim = new Simulation({
  software: 'Luminary099' | 'Comanche055',
  vehicle: 'replay' | 'physics' | 'static',
  startGET,              // seconds
  seed,                  // number, default 1969
  replayTrack,           // for 'replay': a track from data/ (see §8)
  initialProgram,        // e.g. 0 or 63
});
sim.t                    // current GET (s)
sim.agc                  // Agc
sim.vehicle              // VehicleProvider (see §8)
sim.bus                  // event bus (shared with UI)
sim.step(dt)             // advance dt seconds using fixed substeps (10 ms)
sim.reset()              // back to construction state (same seed)
sim.snapshot()           // plain object used by tests and views
```

Order inside one 10 ms substep: `vehicle.step` → `agc.step` (programs,
pinball timers, executive, workload) → emit bus events produced in the step.

## 6. The computer model (`js/agc/`)

### 6.1 `DskyState` (`dsky-state.js`)

What the hardware would display; no behaviour.

```js
dsky.prog / dsky.verb / dsky.noun       // 2-char strings: digits or ' ' (blank)
dsky.r[0..2] = { sign: '+'|'-'|' ', digits: '12345' }  // 5 chars, digit or ' '
dsky.flashVerbNoun                       // boolean — VERB/NOUN digits flash
dsky.lights = {                          // booleans
  uplinkActy, noAtt, stby, keyRel, oprErr, prioDisp, noDap,
  temp, gimbalLock, prog, restart, tracker, alt, vel, compActy,
}
dsky.blanked                             // boolean — all EL digits off (e.g. TIG-35 s)
dsky.lampTest                            // boolean — V35 in progress
dsky.version                             // increments on every change
dsky.setProg(str) / setVerb / setNoun / setRegister(i, sign, digits)
dsky.setLight(name, on) / setFlash(on) / setBlanked(on) / setLampTest(on)
dsky.setAll8s() / blankDigits({ keepProg }) / setRegisterBlank(i) / clearAll()
dsky.snapshot()                          // deep copy
```

`compActy` mirrors "the Executive is not in the dummy job"; the executive
model drives it.

### 6.2 Display formatting (`display-format.js`)

```js
formatRegister(value, format) → { sign, digits }
```

`format` is one of the scale/format codes used by `nouns.js`:
`'XXXXX'` (integer, signed decimal), `'XXX.XX'`, `'XXXX.X'`, `'X.XXXX'`,
`'.XXXXX'`, `'XXbXX'` (min/sec, sign, blank in the middle), `'XXXXX OCT'`
(octal, no sign), `'BLANK'`. Values are already in display units (ft, ft/s,
deg, s...). Out-of-range values saturate to `99999`-style limits the way
PINBALL does. Truncation vs rounding follows PINBALL (see research notes).

### 6.3 `Pinball` (`pinball.js`)

Keyboard + display software. Owns all writes to `dsky.prog/verb/noun/r[]`
except the PROG number which `agc.setMajorMode()` writes.

```js
pinball.press(key)                       // one DSKY key (key name, §4)
pinball.pressScript('V37E63E', {gapMs}) // queue keys, one per `gapMs` (default 400 ms sim time)
pinball.step(dt)                         // timers: flashing, monitors, lamp test
pinball.showDisplay({ verb, noun, flash = false, priority = false,
                      onProceed, onTerminate, onEnter, onRecycle, source })
                                         // a program asks for a (flashing) V/N display
                                         // = GODSP / GOFLASH / GOPERF in PINBALL terms
pinball.monitor(verb, noun)              // start a V1x monitor (1 s refresh, via the executive)
pinball.endMonitor()
pinball.blankFor(seconds)                // blank R1-R3 + V/N (BURNBABY at TIG-35 s)
pinball.operatorError()                  // OPR ERR light + abort current entry
pinball.state                            // { entry: 'idle'|'verb'|'noun'|'data'|'loading', ... }
```

Programs register nouns' live values through the noun tables (§6.5); PINBALL
reads them whenever it refreshes a display.

### 6.4 Verbs (`verbs.js`)

`VERBS_LUMINARY099` / `VERBS_COMANCHE055`: `{ [num]: { name, kind, impl? } }`.
Implemented at minimum: V01–V07 & V11–V17 (display / monitor, octal &
decimal), V21–V25 (load), V32 (recycle), V33 (proceed), V34 (terminate),
V35 (lamp test), V36 (fresh start), V37 (change program), V05N09 (alarm
codes), V57 (LR update permit, LM), V82/V83 if simple. Anything else valid
but unimplemented shows the verb/noun and does nothing; anything invalid
lights OPR ERR exactly as PINBALL would.

### 6.5 Nouns (`nouns.js`)

```js
NOUNS_LUMINARY099[n] = {
  name: 'ALTITUDE RATE, ...',
  components: [ { label, unit, format, read: (agc) => number|null } ... ],  // 1-3
  anchor: 'noun.63',                       // anchor id (data/anchors/index.js)
}
```

`read(agc)` pulls from `agc.erasable` (named quantities the programs
maintain, e.g. `DELTAH`, `HDOTDISP`, `HCALC`, `TTFDISP`) and `agc.nav`.

### 6.6 Alarms (`alarms.js`)

```js
ALARMS_LUMINARY099 = { 0o1201: { text, routine, anchor }, 0o1202: {...}, ... }
agc.alarm(code)          // ALARM: store in FAILREG slots, light PROG, emit 'alarm'
agc.bailout(code)        // BAILOUT: alarm + software restart (restart.js)
agc.poodoo(code)         // POODOO: abort to P00-style idle (rarely used here)
```

FAILREG semantics: three registers shown by V05N09; R1 first alarm, R2
second, R3 most recent (confirm in research); RSET clears PROG light (and
the registers per source).

### 6.7 Executive (`executive.js`)

A time-budget model of the real Executive: fixed **core sets** and **VAC
areas**, priority scheduling, and memory-cycle stealing by counter
interrupts.

```js
const exec = new Executive({ coreSets, vacAreas, bus });   // counts from Luminary099 source
exec.requestJob({ name, prio, vac: boolean, workMs, restartGroup?, anchor?, onDone? })
    → job | null       // null when overflow → calls exec.onOverflow(0o1201|0o1202)
exec.setSteal(key, fraction)    // memory cycles stolen, e.g. ('rrCdu', 0.13)
exec.step(dt)                   // run jobs by priority with the CPU time left
exec.flush()                    // drop every job (software restart)
exec.snapshot() → {
  coreSets: [{ index, job: { id, name, prio, vacIndex } | null }],
  vacs:     [{ index, job: { id, name } | null }],
  load:     { total, parts: { [name]: fraction } },   // 1-second sliding window
  queue, idle, history: [{ t, total }] (last 120 s)
}
```

`workload.js` decides which recurring jobs/tasks exist (SERVICER every 2 s,
landing guidance, LR read, display monitor every 1 s when V16 is active,
T4RUPT/T5RUPT/T6RUPT interrupt loads, RR CDU cycle stealing when the
rendezvous radar fault is enabled). Its parameters must be calibrated so that
(a) the nominal descent stays below 100 %, (b) the Apollo 11 configuration
(RR stealing + V16N68 monitor) overflows, (c) the demo's alarms appear within
±2 s of their historical GETs, and (d) after each restart the load falls
back because the extra work was flushed.

### 6.8 Restart (`restart.js`)

Models phase tables / restart groups: programs register `restartGroup` +
`restartPoint` callbacks with `agc.restart.protect(group, phase, fn)`. A
software restart (`agc.bailout`) flushes the executive, keeps protected groups
(re-entering them at their last phase), drops everything else (e.g. a crew
V16 monitor), sets lights as the real ENEMA path does, and emits `'restart'`.

### 6.9 `Agc` (`agc.js`) — composition root

```js
const agc = new Agc({ software, bus, rng, vehicle });
agc.dsky, agc.pinball, agc.exec, agc.restart, agc.alarms
agc.mode                         // major mode number (e.g. 63)
agc.setMajorMode(n)              // MMDSPLAY: update PROG digits, emit 'mode'
agc.changeProgram(n)             // V37 path: validates (OPR ERR if illegal) & starts program n
agc.startProgram(n, { initial }) // start program n directly (scenario setup, automatic
                                 // transitions such as P63 → P64); no V37 validation
agc.vehicleCommands()            // → { throttle, thrustDir, engineOn, ullage, rod, lpd }
                                 //   read by Simulation every substep and fed to vehicle.step
agc.program                      // current program object
agc.erasable                     // { [name]: value } displayed quantities
agc.nav                          // AGC's navigated state (may differ from truth)
agc.flags                        // { LRBYPASS, ... } named flagbits
agc.key(key, { source }) / agc.keys(script, { source, gapMs })   // forward to pinball;
                                 // source 'user' | 'crew' (scenario keystrokes) — emits 'key'
agc.crewInput(name, value)       // crew-station controls (§11.3)
agc.t                            // current GET (s) as of the last step
agc.workload                     // Workload (§6.7)
agc.clock(t) / agc.setClock(v) / agc.fromClock(x) / agc.clockOffset
                                 // the AGC clock (TIME2/TIME1) = GET + clockOffset; a V25N36
                                 // load changes the offset. Erasable TIG/TEVENT are in the clock's
                                 // frame; tasks, the vehicle and the model's time axis stay on GET
agc.freshStart()                 // V36: SLAP1 — clears alarms, lights, jobs, goes to P00
agc.hardwareRestart(cause)       // GOJAM path (e.g. V69 TC trap): RESTART light + GOPROG
agc.step(t, dt)                  // programs + pinball + executive + workload
agc.snapshot()
```

### 6.9.1 `agc.snapshot()` shape (consumed by every view)

```js
{
  software: 'Luminary099',
  mode: 63, programName: 'BRAKING PHASE',
  dsky: DskyState.snapshot(),
  exec: Executive.snapshot(),                        // §6.7
  alarms: {
    failreg: [code|null, code|null, code|null],      // as shown by V05N09 (numbers; display in octal)
    last: { code, t, text } | null,
    history: [{ t, code, text, restart: boolean }],
  },
  restart: { count, lastT, lastReason, groups: [{ group, phase, active }] },
  erasable: { DELTAH, HCALC, HDOTDISP, VHORIZ, TTFDISP, RANGEDSP, LPDANGLE, LPDTIME, TIG, ... },
  nav: { alt, altRate, vHoriz, range, lrIncorporating },   // AGC's estimate (SI)
  burn: null | {                                      // BURNBABY sequencer state
    program, tig, tMinusTig,
    phase: 'pre'|'avg-g'|'ullage'|'v99'|'ignition'|'trim'|'throttle-up'|'burning'|'cutoff'|'done',
    events: [{ id, label, rel /* s from TIG */, t, done, anchor }],
  },
  guidance: null | { phase: 'braking'|'approach'|'rod'|'manual', ttg, throttleCmd, pitchCmd, lpd: { angle, time } },
  crew: { rodRate, pgnsMode, rrFault, lpdClicks: { dx, dy } },
  flags: { [name]: boolean },
}
```

Bus events emitted by the computer model: `'alarm' { code, t, text, restart }`,
`'restart' { t, reason, code }`, `'mode' { mode, prev, t }`,
`'burn' { id, label, t, rel }`, `'key' { key, t, source: 'crew'|'user' }`,
`'oprerr' { t, reason }`.

### 6.10 Programs (`programs/`)

```js
export default class P63 {
  static number = 63; static name = 'BRAKING PHASE'; static anchor = 'p63.entry';
  constructor(agc) {}
  enter() {}          // V37 or automatic transition
  step(t, dt) {}      // called every substep while active
  exit() {}
}
```

`programs/index.js` exports `PROGRAMS_LUMINARY099` / `PROGRAMS_COMANCHE055`
(maps number → class). `burnbaby.js` is a reusable ignition sequencer
(`new BurnBaby(agc, table).arm(tig)`) used by P63 (and P40/P42/P12 when
present), table-driven like the real routine (the `WHICH` table).

## 7. Guidance (`agc/guidance/landing-guidance.js`)

Pure functions implementing the Apollo lunar descent guidance (Klumpp):

```js
solveTtg({ rg, vg, target })        // TTF/8 cubic via Newton, returns TTG (s, negative)
accelCommand({ rg, vg, target, ttg }) → acg (vector, m/s^2)
thrustCommand({ acg, gravity, mass, ... }) → { throttle, thrustDir }
```

Vectors are `[x, y, z]` arrays in the guidance (landing-site) frame:
x = up, z = downrange, y = cross-range (state the frame in the code).

## 8. Vehicle providers (`js/vehicle/`)

Both providers expose the same read-only state:

```js
vehicle.state = {
  t, alt, altRate, vHoriz, vCross, range, downrange,   // m, m/s
  mass, thrust, throttle, fuelFrac, pitch, yaw,        // kg, N, 0..1, 0..1, deg
  engineOn, ullage, landed, contact,
  lr: { altValid, velValid, alt, altRate, vHoriz },    // landing-radar measurements
}
vehicle.step(dt, commands)   // commands from AGC/crew: { throttle, thrustDir, engineOn, ullage, rod, lpd }
vehicle.reset()
```

State semantics (as implemented in `js/vehicle/`):

- `alt` is footpad height above the local surface; the contact light comes on
  at 5.6 ft (probe length). In the replay, 102:45:39.9 is probe contact;
  `landed` follows after engine cutoff at 102:45:41.4.
- `range` is to the computer's aim point (Eagle ends ~1,100 ft beyond it:
  negative); the planned map site is in `SITES` of the track module.
- `downrange` is ground distance since the provider started.
- `throttle` is a fraction of the 10,500 lbf rated thrust.
- `pitch` = thrust-axis angle from local vertical, positive when braking;
  `yaw` = 0 face-down, 180 face-up.
- Extra fields: `vInertial`, `throttleCmd`, `propellant` (kg), `lowLevel`,
  `depleted`, `touchdown`, `phi`.
- Replay altitude is terrain-relative (what the DSKY showed once LR data were
  incorporated); the pre-LR altitude error lives in the AGC's `nav`.

Commands (`vehicle.step(dt, commands, t)`; the GET `t` wins over accumulated dt):

- `thrustDir` — unit vector in the landing-site guidance frame (x up, y
  cross-range, z downrange), as `thrustCommand` returns it; `null` holds attitude.
- `pitch`, `yaw` (deg) — used when `thrustDir` is absent (P66 attitude stand-in).
- `lpd = { downrange, crossrange }` (m) — cumulative landing-site shift.
- `throttle` (fraction of rated), `engineOn`, `ullage`; `rod` is ignored by vehicles.

- `ReplayVehicle` (`replay.js`) interpolates a historical track
  (`data/apollo11-descent.js`: GET-stamped keyframes in historical units,
  with source citations) and ignores commands.
- `LmPhysics` (`lm-physics.js`) integrates planar flight over a spherical
  Moon with the DPS engine model (thrust, throttle limits incl. the
  fixed-throttle-position region, mass flow from Isp), simple attitude-rate
  limits, landing-radar model, contact probes, and touchdown evaluation.

## 9. Demo director (`js/demo/`)

### 9.1 Scenario format

```js
export default {
  id: 'landing-1202', title: 'The 1202 Alarms', software: 'Luminary099',
  vehicle: 'replay', track: 'apollo11Descent',
  start: '102:37:30', end: '102:43:30', initialProgram: 63,
  speed: 2,                      // optional default playback speed
  agcOptions: { workload: { params } },  // optional, forwarded to new Agc(...)
  vehicleOptions: {},            // optional, forwarded to createVehicle(...)
  setup(sim) {},                 // optional deterministic initial state
  summary: 'One paragraph shown in the scenario picker.',
  events: [
    { at: '102:37:30', chapter: 'Before the alarm' },
    { at: '102:37:31', narrate: { title, body /* small HTML subset */, anchors: ['exec.novac'], focus: 'exec' } },
    { at: '102:38:05', keys: 'V16N68E', who: 'Aldrin' },
    { at: '102:38:22', say: { who: 'Armstrong', text: 'Program alarm.' } },
    { at: '102:38:22', action: (sim) => {} },          // deterministic state change
    { at: '102:38:26', hold: 4 },                      // pause N real seconds if "auto-pause" on
    { at: '102:38:30', spotlight: 'dsky.light.prog' }, // briefly highlight a UI element
  ],
};
```

`body` may contain `<b> <i> <code> <br> <ul> <li> <p>`; render with a
whitelist sanitizer.

### 9.2 `Director`

```js
const d = new Director({ bus, createSim: (scenario) => Simulation });
d.load(scenario)                 // builds sim at scenario.start
d.play() / d.pause() / d.toggle()
d.setSpeed(x)                    // 0.5 .. 60
d.seek(get)                      // reset + re-simulate deterministically to get (async, sliced)
d.cancelSeek()                   // abandon a running seek (used when leaving demo mode)
d.nextChapter() / d.prevChapter()
d.setAutoPause(on) / d.resume()  // reading holds on/off; skip the current hold
d.frame(realDt)                  // called by the app's rAF loop
d.state → { playing, speed, t, start, end, chapterIndex, chapters, holding,
            seeking, autoPause, ended, progress, nextEventIn, error }
```

**Reading holds.** With auto-pause on, before the next `narrate` fires the
director waits (in real time) until the current card has been on screen for
`min(35, 3 + 0.3 × words)` s; scripted `hold` events are minimums. Holds only
stop the clock at an event time, so they never change what is simulated —
seeks and frame sizes give identical states. A rewind restores the speed the
scenario (or the user) set before any later `speed` hint.

Events at or before `t` fire exactly once, in order; when seeking, `say` and
`narrate` events are replayed silently into the transcript/narration history
so the panels look as if the user had watched.

Bus events emitted (the UI listens): `'narrate'`, `'say'`, `'chapter'`,
`'source:show' {anchors}`, `'focus' {panel}`, `'spotlight' {target}`,
`'hold' {seconds}`, `'director:state'`, `'alarm'`, `'restart'`, `'mode'`.

## 10. Source anchors (`js/data/anchors/*.js`)

Anchors are split by owner to avoid edit conflicts; `js/data/anchors/index.js`
merges them into `ANCHORS` and throws on duplicate ids:
`exec.js` (Executive, Waitlist, alarms, restarts), `pinball.js` (keys,
verbs, nouns, lights), `programs.js` (BURNBABY, SERVICER, P63–P68, guidance,
throttle, LR), `cm.js` (Comanche055), `scenarios.js` (anything else a
scenario needs). Id prefixes: `exec. alarm. restart. waitlist. pinball. verb.
noun. dsky. burn. servicer. p63. p64. p65. p66. p68. guid. throttle. lr. cm.`

```js
export const ANCHORS = {
  'exec.novac.1202': { file: 'Luminary099/EXECUTIVE.agc', label: 'NOVAC2',
                       start: 160, end: 208, title: 'Find a core set — or 1202' },
};
```

`import { ANCHORS, getAnchor } from './data/anchors/index.js'`.

Rules (enforced by `test/anchors.test.mjs`): the file exists; `1 ≤ start ≤
end ≤ lines`; if `label` is given it appears at the start of line `start`
(AGC label column); every anchor referenced by scenarios, nouns, alarms and
programs exists.

## 11. UI (`js/ui/`)

Each view: `export function mountXxx(root, ctx) → { render(snapshot, ui), destroy() }`
where `ctx = { bus, app }`. `render` is called once per animation frame with
`sim.snapshot()` (may be `null` before a sim exists) and `ui = app.uiState()`;
it must diff to avoid DOM churn (e.g. compare `snapshot.agc.dsky.version`).

### 11.1 App API used by views (`js/app.js`, already implemented)

```js
app.mode                          // 'demo' | 'interactive'
app.pressKey(key)                 // DSKY key from the user (ignored with a toast in demo mode)
app.crewInput(name, value)        // crew-station control → sim.agc.crewInput(name, value)
app.director                      // Director (demo mode transport)
app.loadScenario(id) / app.startInteractive(presetId) / app.restartInteractive()
app.setInteractivePlaying(bool) / app.setInteractiveSpeed(x)
app.selectTab('trajectory'|'exec'|'ignition')
app.currentSim()
app.uiState() → { mode, scenario, scenarios, preset, presets, director, interactive, tab, vehicleKind }
```

Bus events the app itself emits: `'app:mode' { mode, scenario | preset, resumed? }`
(`resumed: true` when returning to the same interactive preset, whose sim is
kept), `'tab'`, `'toast' {text}`, and — in interactive mode — `'vehicle'
{ t, kind: 'lowLevel'|'depleted'|'touchdown', verdict?, vVert?, vHoriz?, tilt? }`
detected from snapshot edges (SI units). `ui.vehicleKind` gives the current
sim's vehicle kind (`'static'|'replay'|'physics'|'cmSps'`).

### 11.2 Data registries used by the app

- `js/data/tracks.js` — `export const TRACKS = { apollo11Descent: track, ... }`.
- `js/data/presets.js` — `export const PRESETS = [{ id, title, description,
  software, vehicle, startGET, track?, initialProgram?, vehicleOptions?,
  agcOptions?, setup?(sim) }]` — interactive-mode starting points.
- `js/demo/scenarios/index.js` — `export const SCENARIOS = [scenario, ...]`
  in display order.

### 11.3 Crew inputs (`agc.crewInput(name, value)`)

`'rodClick'` (±1 per ROD switch click), `'lpd'` (`{ dx, dy }` clicks of the
LPD hand controller), `'pgnsMode'` (`'auto'|'attHold'`), `'engineStop'`,
`'rrFault'` (boolean: rendezvous-radar CDU cycle stealing on/off),
`'abort'`. Unknown names are ignored.

- `dsky-view.js` — the DSKY: lamps, EL digits (SVG seven-segment in DSKY
  style), flashing, keypad (mouse/touch and physical keyboard mapping),
  `data-spot` hooks for spotlights (`dsky.light.prog`, `dsky.r1`, ...).
- `exec-view.js` — core sets, VAC areas, job list, load gauge with stacked
  contributors, alarm/restart log.
- `trajectory-view.js` — altitude vs. range profile, phase shading
  (P63/P64/P66), LM marker with attitude, historical markers.
- `instruments-view.js` — altitude/altitude-rate tapes, horizontal velocity,
  fuel, throttle, LR status (ALT/VEL lights), mission clock.
- `crew-view.js` — interactive crew controls: PRO/ENGINE ARM, ROD switch,
  LPD clicks, PGNS mode, RR switch fault toggle.
- `source-view.js` — fetch + syntax-highlight `.agc` files, highlight anchor
  ranges, link to GitHub, file browser using `data/source-manifest.js`.
- `narration-view.js`, `transcript-view.js`, `timeline-view.js`,
  `controls-view.js` — demo UI.

## 12. Testing

- `node --test simulator/test/` — pure-logic suites (formatting, pinball
  sequences, executive overflow & restart, guidance, director determinism,
  scenario validation, anchors).
- `simulator/test/e2e/` — Playwright smoke run (loads the app, plays each
  scenario at high speed, checks for console errors, takes screenshots).
