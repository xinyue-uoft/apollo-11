# AGC Simulator

A browser-based simulator of the Apollo Guidance Computer and its DSKY,
built around the Apollo 11 flight software in this repository. It replays
the landing of *Eagle* at the real Ground Elapsed Times — the ignition, the
1202 alarms, P63, P64, P66 — with explanations, the air-to-ground transcript
and the **actual lines of Luminary 099 and Comanche 055** that were running,
highlighted as it happens. You can also take the keyboard yourself and fly
the descent.

## Run it

You need Node.js (18 or newer to serve the app, 22 or newer to run the
tests); there is nothing to install.

```sh
npm run sim                 # or: node simulator/serve.mjs
```

Then open <http://localhost:8011/simulator/>. The tiny server in
`serve.mjs` serves the repository root so that the source panel can read the
`.agc` listings. Any static web server rooted at the repository works too
(for example GitHub Pages serving the branch root). Opening `index.html`
straight from disk does not, because browsers block ES modules on `file://`.

## What is in it

### Demo mode

| Scenario | Ground Elapsed Time | What you see |
| --- | --- | --- |
| Meet the DSKY | illustration | Verbs and nouns, the lamp test, monitors, OPR ERR, RSET, V37 |
| Burn, Baby, Burn | 102:32:00 – 102:34:20 | The master ignition routine: TIG−35 s blanking, Average-G, ullage, V99 "please enable engine", ignition, throttle-up |
| P63: the braking phase | 102:33:09 – 102:41:40 | Guidance every 2 s, yaw-around, landing radar and Delta-H, V57, throttle-down, high gate |
| 1202: the Executive overflow | 102:37:39 – 102:43:30 | The rendezvous-radar cycle stealing, V16N68, core sets and VAC areas filling up, BAILOUT, the software restart, "We're Go on that alarm" |
| P64: approach and the LPD | 102:41:19 – 102:43:30 | The landing point designator, the 1201, the boulder field |
| P66 and touchdown | 102:42:59 – 102:47:15 | Rate-of-descent mode, the callouts, "60 seconds", contact light, "The Eagle has landed" |
| The whole descent | 102:32:00 – 102:46:30 | PDI to Tranquility Base in one run |
| Columbia's SPS burn | 075:48:30 – 075:56:45 | Comanche 055's P40 flying Lunar Orbit Insertion |

The alarms in the 1202 scenario are not scripted: they emerge from the
Executive model (8 core sets, 5 VAC areas, priorities, the radar's stolen
memory cycles) and land within a few seconds of the Mission Report times.

### Interactive mode

Key the DSKY with the mouse or the keyboard (`V` verb, `N` noun, `E` enter,
`P` proceed, `C` clear, `R` reset, `K` key release, digits and `+`/`-`).
Start from P00, from five minutes before powered descent, from high gate or
low gate, or from Columbia's LOI burn. The descent sandbox flies a physics
model with the real Luminary guidance law and the targets loaded for
Apollo 11; you answer V99 with PRO, permit radar updates with V57, use the
landing point designator in P64, and land in P66 with the rate-of-descent
switch. Turn on the rendezvous-radar fault and watch the 1202s come back.

## How faithful is it?

This is a **behavioural model**, not an instruction-level emulator of the
assembled rope. The display software (PINBALL), the Executive, the Waitlist,
the restart machinery, the ignition sequence and the landing programs follow
the listings closely, with the source lines cited in the code; the job CPU
costs are calibrated to the published duty-cycle margins. In demo mode the
spacecraft follows the reconstructed Apollo 11 trajectory. Every historical
statement on screen has a source: see [docs/SOURCES.md](docs/SOURCES.md),
which also lists what is simplified.

## Code map

- `js/agc/` — the computer: DSKY state, PINBALL (verbs, nouns, display
  formats), Executive, Workload, restarts, alarms, navigation estimate, the
  LM programs (BURNBABY, P63–P68) and the CM programs (P40, P61–P67).
- `js/vehicle/` — the replayed Apollo 11 track, the LM physics model, the
  landing radar and the CSM SPS model.
- `js/demo/` — the scenario director and the scenarios.
- `js/data/` — the descent track, transcript, presets and source anchors.
- `js/ui/` — the DSKY, trajectory, Executive, ignition, instruments, crew,
  narration, transcript, timeline and source views.
- `docs/ARCHITECTURE.md` — module contracts.

## Tests

```sh
npm run test:sim                      # node:test suites (model, scenarios, anchors)
node simulator/test/e2e/smoke.mjs     # headless browser smoke run (needs Playwright)
```

The anchor tests check that every highlighted range still points at the
right label in the listings, so a proofing change that shifts lines in
`Luminary099/` or `Comanche055/` shows up in CI.

## Credits

The listings are the public-domain transcriptions in this repository (see
the top-level README). The DSKY's proportions follow dimensions measured
from Riley Rainey's CAD transcription of the MIT drawings
([agc-mechanical-cad](https://github.com/rrainey/agc-mechanical-cad), CC
BY-SA 4.0) and the Virtual AGC project's documentation; nothing from those
files is redistributed here. The history draws on the Apollo Lunar
Surface Journal, the Apollo Flight Journal, the Apollo 11 Mission Report,
Don Eyles' "Tales from the Lunar Module Guidance Computer", and the
engineering memos cited in [docs/SOURCES.md](docs/SOURCES.md).
