# Sources and notes for the demo

Everything the demo says — narration, captions, times, numbers, the source
lines it highlights — comes from the sources below. This file lists them,
records which source was preferred where they disagree, and says plainly what
the simulator models and what it simplifies.

The research behind it was done for this project and cross-checked against
the listings in this repository (`Luminary099/`, `Comanche055/`). Line
numbers below are 1-based and refer to the files as they are in this
repository.

## 1. Bibliography

### Primary records of the flight

| Key | Source |
| --- | --- |
| **MR** | *Apollo 11 Mission Report*, MSC-00171, NASA Manned Spacecraft Center, November 1969. Table 5-I "Lunar descent event times", §4.10.3, §5.2–5.4, §9.6.4, §9.8, §9.11, §9.13.1, §13.1, §16.2.5 "Computer alarms during descent", Table 9.6-V, Table A-I. <https://www.nasa.gov/wp-content/uploads/static/apollo50th/pdf/A11_MissionReport.pdf> (mirror: <https://apollojournals.org/alsj/a11/A11_MissionReport.pdf>) |
| **ALSJ** | Eric M. Jones (ed.), *Apollo Lunar Surface Journal*, "The First Lunar Landing" (rev. 10 May 2018) and "Post-landing Activities" — the corrected transcript, which merges the air-to-ground tape and the LM onboard tape, with commentary by Jones, Ken Glover, Paul Fjeld, Frank O'Brien and others. <https://www.apollojournals.org/alsj/a11/a11.landing.html>, <https://www.apollojournals.org/alsj/a11/a11.postland.html> |
| **TEC** | *Apollo 11 Technical Air-to-Ground Voice Transcription* (GOSS Net 1), July 1969, pp. 310–317. <https://www.apollojournals.org/afj/ap11fj/pdf/a11-transcript-technical.pdf> |
| **ONB** | *Apollo 11 Onboard Voice Transcription* (LM DSE tape), Day 5 pp. 171–179. <https://www.apollojournals.org/afj/ap11fj/pdf/a11-transcript-onboard.pdf> |
| **AFJ** | *Apollo 11 Flight Journal* (D. Woods et al.), "Undocking and the Descent Orbit". <https://www.apollojournals.org/afj/ap11fj/17day5-undock-doi.html> |
| **DBRF** | *Apollo 11 Technical Crew Debriefing*, 31 July 1969, Vol. I §9. <https://www.apollojournals.org/alsj/a11/A11TechCrewDebrfV1_ALSJ.pdf> |
| **AFJ-LOI** | *Apollo 11 Flight Journal*, "Approach" (LOI-1 PAD, 072:51:24) and "Lunar Orbit Insertion" (Columbia's onboard tape during LOI-1). <https://apollojournals.org/afj/ap11fj/11day4-approach.html>, <https://apollojournals.org/afj/ap11fj/12day4-loi1.html> |
| **AIRT** | *Apollo 11 In Real Time* (air-to-ground and onboard transcript data). <https://apolloinrealtime.org/11/> |

### Engineering documents

| Key | Source |
| --- | --- |
| **CHERRY** | G. W. Cherry (MIT Instrumentation Laboratory, Luminary project director), letter AG# 370-69, 4 August 1969, "Exegesis of the 1201 and 1202 Alarms Which Occurred During the Mission G Lunar Landing" — includes the job table and a DSKY event log in seconds from ignition. <http://www.ibiblio.org/apollo/Documents/CherryApollo11Exegesis.pdf> |
| **TILLMAN** | C. Tillman (Grumman), memo LAV-500-940, 31 July 1969, "Program Alarms in Powered Descent – Apollo 11", from MSFN downlink data. <http://www.ibiblio.org/apollo/Documents/Memo-Tillman690731_text.pdf> |
| **COPPS** | E. M. Copps, "Recovery from Transient Failures of the AGC", MIT/IL E-2307, August 1968. <http://klabs.org/history/history_docs/mit_docs/1033.pdf> |
| **GARMAN LIST** | The handwritten alarm list under the glass of Jack Garman's console (photograph). <http://klabs.org/history/apollo_11_alarms/console/index.htm> |
| **DD260** | Hopkins & Thaler, AGC Digital Development memo 260 rev. B (1966), hardware restart causes and the RESTART lamp. <http://www.ibiblio.org/apollo/Documents/dd_memo_260.pdf> |
| **BEN70** | F. V. Bennett, *Apollo Lunar Descent and Ascent Trajectories*, NASA TM X-58040, March 1970. <https://ntrs.nasa.gov/api/citations/19700024568/downloads/19700024568.pdf> |
| **BEN72** | F. V. Bennett, *Apollo Experience Report – Mission Planning for LM Descent and Ascent*, NASA TN D-6846, 1972. |
| **KLUMPP** | A. R. Klumpp, *Apollo Lunar-Descent Guidance*, MIT/Draper R-695, June 1971 (describes a slightly later Luminary; used only for the design intent). |
| **PAD** | Grumman *LM Data Book* Vol. II, Table LM5/4.5.1-1, "G Prelaunch Erasable Load (LUMINARY 99)" — the Apollo 11 pad-load values (LOWCRIT, TENDBRAK, RODSCALE …). <https://www.ibiblio.org/apollo/Documents/Luminary99PadLoads.pdf> |
| **TRW** | TRW Note 70-FMT-819, *Apollo Mission 11 Trajectory Reconstruction and Postflight Analysis*, 1970. |
| **AER-DPS** | Hammock, Currie, Fisher, *Apollo Experience Report – Descent Propulsion System*, NASA TN D-7143, 1973. |

### Accounts and oral histories

| Key | Source |
| --- | --- |
| **EYLES** | Don Eyles, "Tales from the Lunar Module Guidance Computer", AAS 04-064 (2004). <https://www.doneyles.com/LM/Tales.html> (a klabs copy exists; where they differ — "Verb 90 Noun 50" vs "Verb 5 Noun 9" — the doneyles.com text, V05N09, is used) |
| **GARMAN OH** | J. Garman, NASA JSC Oral History, 27 March 2001. |
| **KRANZ OH** | E. Kranz, NASA JSC Oral History, 8 January 1999. |
| **HERSCH** | M. Hersch, "Troubleshooting 101: 1201, actually (and 1202, too)", *Air & Space*, 2009 (date of the 5 July simulation). |
| Others | F. Martin (1994) and P. Adler (1998) recollections on the ALSJ — read, but not relied on where the documents above disagree with them. |

### The listings

`Luminary099/*.agc` (Luminary 1A build 099, "Assemble revision 001 of AGC
program LMY99 by NASA 2021112-061, 16:27 JULY 14, 1969") and
`Comanche055/*.agc`. Every code statement in the narration was checked in
these files; the exact ranges are the anchors in
`js/data/anchors/*.js` (the demo's own ones are in `anchors/scenarios.js`).

## 2. Conventions used in the demo

- **Two clocks.** Computer and spacecraft events (alarms, program changes,
  ignition, throttle changes, lamps) happen at the **Mission Report**
  telemetry times (MR Table 5-I and Table 9.6-V). Voice captions play at
  their **ALSJ** times. Voice lags telemetry by 0–13 s: "Program Alarm" is
  heard at 102:38:26 for an alarm at 102:38:22; "We got good lock-on" at
  102:38:04 for "LR data good" at 102:37:51. This is not an error.
- **Quotes** live in `js/data/transcript-a11.js`, one entry per utterance,
  with the source and the alternative TEC/ONB wording or time. ALSJ wording
  is preferred. ALSJ's editorial insertions are shown in square brackets
  (ALSJ writes them in parentheses), its stage directions ("(Pause)",
  "(To Houston)", "(With some urgency in his voice)") are moved to the
  entry's note, "(Garbled)" becomes "[garbled]". Where ALSJ gives no time
  for a line, the time comes from TEC or ONB and the entry says so.
- **Crew keystrokes** live in `js/demo/scenarios/crew-a11.js`. Each is marked
  `record` (documented, with its time) or `inferred` (implied by the record;
  time illustrative). Times are when the entry took effect (ENTR/PRO); the
  scripted keystrokes are back-timed at 0.4 s per key so the last key lands
  there. The two V05N09E readouts after the P64 alarms are keyed at 0.3 s
  per key (an assumed cadence), so that the keying starts after the
  modelled alarm and ENTR still falls inside the whole second Cherry's log
  gives.
- **Start times.** A scenario that starts in mid-descent starts on the
  2-second navigation grid of the real flight (READACCS every 2 s from
  TIG − 29.9 s = 102:32:35.11, `BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc`
  `D29.9SEC`, `SERVICER.agc:72-74`), e.g. 102:37:39.11 rather than
  102:37:40. The computer model begins its navigation cycle at the instant a
  scenario starts; on the flight's grid, the Executive model sees the same
  load at the same instants in every scenario (`alignedStart` in
  `js/demo/scenarios/lib.js`).
- **Octal.** Alarm codes and priorities are octal, as in the code: 1202 is
  octal 1202 (decimal 642) and is shown on the DSKY as `01202`; "PRIO 20" is
  octal 20.

## 3. Notes by scenario

### 3.1 Meet the DSKY (`dsky-basics`)

- **Illustration, not history.** The clock is parked at 102:00:00 and every
  keystroke is ours. The scenario says so on its first card.
- Lamp layout, colours, flash rate (1.28 s, 75 % on), the 5.00-s lamp test:
  research report web-dsky-b; `PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:3617-3714`
  (`VBTSTLTS`, `SHOLTS OCT 764`). After the test the 8s stay in VERB, NOUN and
  R1–R3 until overwritten (reading of the code; no independent statement).
- Each key is an interrupt that queues a `CHARIN` job at priority 30:
  `KEYRUPT_UPRUPT.agc:35-55`. PRO has no key code; T4RUPT samples channel
  32 every 120 ms (`T4RUPT_PROGRAM.agc:144-170`).
- V16 refreshes once a second: `MONDEL OCT 144 # FOR 1 SEC MONITOR INTERVALS`
  (`PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:2395`). Noun 36 = AGC clock, noun 65
  = sampled time, "TIME IS SNATCHED IN RUPT FOR NOUN 65"
  (`KEYRUPT_UPRUPT.agc:38`).
- V05N09 = FAILREG, FAILREG+1, FAILREG+2 in octal (`PINBALL_NOUN_TABLES.agc`,
  `ERASABLE_ASSIGNMENTS.agc:430`); first, second and most recent alarm
  (`ALARM_AND_ABORT.agc:63-99`).
- V08 is a spare verb: `VERBTAB` → `GODSPALM` → `DSPALARM` → `FALTON`
  (`PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:986-1027, 2732-2745, 3426-3429`).
- RSET = `ERROR` (`:3732-3787`): PROG and OPR ERR off, FAILREG zeroed,
  display redrawn.
- V37: exactly two digits (`MMCHANG`, `:2777-2796`); the programs V37 may
  select (`FRESH_START_AND_RESTART.agc:1063-1093`). P63 first flashes V06N61
  ("PRIMARILY USED BY THE CREW IN P63 TO RESET HIS EVENT TIMER TO AGREE WITH
  TIG", `BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc:752-758`). V34
  terminates through `GOTOPOOH`, which flashes V37 (`FRESH_START_AND_RESTART.agc:617-671`).
- Eagle's P63 selection at ~102:10:32–36 (behind the Moon): AFJ/ONB ("Okay,
  we ready to go to P63?"). The keying second is not recorded.

### 3.2 Burn, Baby, Burn (`burn-baby-burn`)

- TIG 102:33:05.01 (MR Table 9.6-V; MR Table 5-I 102:33:05; the PAD said
  102:33:04.36). Ullage 102:32:58 (MR), i.e. TIG−7.5 s by the code's
  `DEC 2240` cs after TIG−29.9 s. Fixed throttle 102:33:31 (MR, "crew
  report"), TIG + `ZOOMTIME` 26 s.
- Blank at TIG−35, back at TIG−30: code comment at
  `BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc:784-788` and Eyles ("At 35
  seconds the display went blank, and at 30 seconds reappeared"). The clock
  job redraws once per second, so on the real DSKY each change can appear up
  to a second late (research src-ignition §17.9). What goes blank: `BLANKDEX`
  → `CLEANDSP`, whose path ends in `ENDRET`'s "BLANK EVERYTHING EXCEPT MM"
  (`CLEANEND` → `JAMTERM` → `ENDRET`, `DISPLAY_INTERFACE_ROUTINES.agc:
  1171-1176, 1272-1273`; `BLANKDSP` −3 "LEAVE MODE", PINBALL `:3043-3069`):
  verb, noun and the three registers; the program number stays.
- V99N62 at TIG−5 and PRO: code `:768-781`, `:816-819`; Eyles ("Now he keyed
  PROCEED"). The PRO time is not recorded to the second: it must lie between
  the flash (102:33:00) and ignition on time (102:33:05.01); ONB has
  "Proceed" at 102:33:02, so the demo keys it at 102:33:02.5. **Inferred.**
- Minimum thrust "10 percent" (crew, ALSJ) vs 13 % (MR §9.8.1). The narration
  says "10 percent by the crew's call (the Mission Report measured 13 %)".
- Fixed-throttle thrust: Eyles 9,870 lb; the LGC's own model `FMAXPOS` 9,769
  lbf (`CONTROLLED_CONSTANTS.agc`); the narration says "about 9,800 lb".
- **ALT lamp at "Descent armed".** ALSJ commentary (Woods) says arming the
  engine brought on "two indicator lights on the DSKY" (read as ALT and VEL;
  the lamps are not named). The code tells a more precise
  story, which the demo follows: SERVICER, running since TIG−30, enables
  landing-radar altitude reads below 50,000 ft of computed altitude
  (`SERVICER.agc:899-932`, the check labelled `35KCHK` actually indexes
  `50KFT`); with no radar lock the reads fail and `R12LITES`
  (`P20-P25.agc:5115-5180`) lights **ALT**. Aldrin called "Altitude light's
  on" (102:33:03; ONB 102:32:58); the MR has 50,000 ft at 102:32:55.
- **VEL lamp at PDI: the model follows the code.** `R12LITES`
  (`P20-P25.agc:5115-5122`, run every SERVICER pass) lights VEL iff the
  velocity data-fail bit is set (RADMODES bit 8, `LRVELBIT`,
  `FLAGWORD_ASSIGNMENTS.agc:1161-1163`; `VLIGHT`/`BOTHLITS`, `:5173-5177`).
  Only `DATAFAIL` sets it, after a failed *velocity* read
  (`P20-P25.agc:2875-2878, 3048-3056`); `GOODRAD` clears it (`:2882-2888`);
  fresh start leaves it clear (`RMODINIT OCT 00102`,
  `FRESH_START_AND_RESTART.agc:393-397, 601`); and velocity reads are
  requested only in `VALTCHK` below 2,000 ft/s (`SERVICER.agc:1375-1394`,
  research src-landing §10.6). So at PDI only ALT can light, and the computer
  model (`js/agc/nav.js`) lights each lamp only after a requested read of its
  own quantity has failed: VEL stays dark until the 102:44:11 radar dropout
  (the track's velocity data are good from 102:38:48, before reads start at
  ≈102:38:56). The dissenting source is secondary: the ALSJ commentary at
  102:33:03, after David Woods, says "two indicator lights on the DSKY come
  on" when the engine is armed — the code ties neither lamp to engine arm —
  while the crew called only "Altitude light's on" (102:33:03) and
  "Altitude light's out" (102:38:11). The narration gives both.
- The 00500 code (LR antenna not in position 1) and "PLEASE CRANK THE SILLY
  THING AROUND": `THE_LUNAR_LANDING.agc:239-255`; Aldrin's report at
  102:26:55 ("we got a 500 alarm (code) early in the program … That wasn't
  an alarm; that was a code", 102:27:09). Its exact time is unknown.
- Naming story: the transcribers' 2009 note at
  `BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc:33-45` (mod history: "Onno's
  notes on the naming of this function, which he got from Don Eyles"). Authors and mottos: `:53-72`. "Honi soit qui mal y pense" is
  the motto of the Order of the Garter. "NOLI SE TANGERE" is read as a play
  on *noli me tangere* ("touch me not"); that reading is the research's, not
  the code's.

### 3.3 P63: the braking phase (`p63-braking`)

- PDI state: ~260 nmi from the site (MR §5.1, BEN70), ~50,000 ft (MR: BET
  49,376 ft, PGNCS 49,955 ft), 5,560 ft/s (BEN70; Eyles' first N63 reading
  5,559.7 ft/s).
- SERVICER every 2 s: `SERVICER.agc:72-74, 79-104, 175-182`; Average-G
  equations and AVGEXIT sequence: research src-ignition §13.
- Guidance: TTF/8 cubic and QUADGUID (`LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:489-600`);
  targets from PAD. "Time-to-go divided by 8 … a scaling for fixed-point
  arithmetic": TTF/8 is time-to-go/8 in the code's own name and scaling
  (research src-landing §1); calling it a scaling choice is our wording.
- "A little long": landmarks ~3 s early (MR §5.3); PGNCS ~21,000 ft uprange
  at PDI (MR §5.2); landed ~6.6 km (3.6 nmi) long (MR Table 5-IV, derived in
  research web-trajectory-b §3.1; ALSJ "about 6.6 km (4.0 miles)").
- Yaw-around: "Rolling over" 102:36:46 (ALSJ); in progress 102:36:57,
  complete 102:37:59 (MR). Slow because the rate-scale switch was left at
  5 °/s (Fjeld in ALSJ; DBRF).
- The RR switch to SLEW at 102:35:38 (Fjeld). **Contested causation:** the
  ALSJ commentary says the SLEW selection led to the alarms; MR §16.2.5 and
  Eyles show AUTO TRACK (selected at 102:10:16) had the same effect. The demo
  follows MR/Eyles and switches the drain on from the start of every LM
  scenario.
- LR data good 102:37:51 at ~37,000 ft (MR); ΔH "minus 2,900" (crew), ~2,800
  (MR §5.3); BEN70 gives −2,200 as the initial Δh — not used on screen.
- DELTAH is only in Noun 68 R3 in Luminary 099 (`PINBALL_NOUN_TABLES.agc:740`;
  research src-landing §0.1). ALSJ's gloss that N68 R3 is velocity is wrong.
- V57 (`EXTENDED_VERBS.agc:431-435`); MR "Enable radar updates" 102:38:45;
  Cherry's log 102:38:43. Altitude-update weight `W_H = LRWH·(1 − H/LRHMAX)`
  (`SERVICER.agc:1186-1204`), i.e. larger nearer the ground. ΔH converged
  within ~30 s (MR §5.3). Velocity updates below 2,000 ft/s from 102:38:50
  (MR).
- Throttle recovery 102:39:31, 386 s after ignition vs 384 s predicted (MR
  §5.3); `LOWCRIT` 5,985 lbf (57 %) (PAD); logic `THROTTLE_CONTROL_ROUTINES.agc:63-112`.
- P64 at 102:41:32, 7,129 ft, 125 ft/s (MR §5.3; Eyles writes 7,400 ft);
  switch when TTF > −62 s (`TENDBRAK` 6200 cs, PAD; code
  `LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:692-709`).
- "P64" call: ALSJ attributes it to Armstrong; TEC, ONB and Aldrin's
  debriefing ("41:35-P64") to Aldrin. The caption follows ALSJ.

### 3.4 1202: the Executive overflow (`alarms-1202`)

- **The five alarms** (MR Table 5-I, confirmed by Cherry's log and Tillman):
  1202 at 102:38:22, 1202 at 102:39:02, 1201 at 102:42:18, 1202 at 102:42:43,
  1202 at 102:42:58. The ALSJ commentary misquotes two of them (it gives
  102:39:02 for the first and 102:41:32 — the P64 entry — for the 1201). No
  1203 occurred (Tillman).
- Cause: RR CDUs counting because the ATCA 800 Hz excitation was
  frequency-locked but not phase-locked to the PGNS reference (MR §16.2.5;
  Eyles; Tillman); 6,400 pulses/s per CDU × 2 × 11.72 µs = 15 % (MR, Cherry);
  ~13 % assumed by MIT, 13.36 % Grumman worst case (Eyles). It happens with
  the radar off ("regardless of whether the rendezvous radar itself was
  powered up", Eyles). Found in LM-3 launch-site testing and never
  corrected (Eyles).
- Margins: >15 % before LR, ~13 % after, "10% or less" with V16N68, "less
  than 10%" in P64 (Eyles); MIT designed for 10 % TLOSS "with a monitor verb
  running" (Cherry).
- 8 core sets, 5 VAC areas (`ERASABLE_ASSIGNMENTS.agc:373-383, 430-443`;
  Eyles; Cherry). The `SEVEN SETS OF ELEVEN REGISTERS` comment at
  `EXECUTIVE.agc:157` is stale (research src-executive §0).
- 1201 = no VAC areas (`EXECUTIVE.agc:133-147`), 1202 = no core sets
  (`:201-208`), both through `BAILOUT1` (`ALARM_AND_ABORT.agc:189-196`).
- Restart: `ENEMA`/`STARTSB2` (`FRESH_START_AND_RESTART.agc:281-288, 531-562`,
  "KILL MONITOR" at line 550), `GOPROG3` (`:290-350`), restart tables
  (`RESTART_TABLES.agc:249-278`), SERVICER and guidance protection
  (`SERVICER.agc:175-182`, `LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:117-121`).
  "Only the most recent incarnation of the SERVICER job" (Eyles).
- The crew saw the PROG lamp, not RESTART. RESTART is a hardware-restart lamp
  (DD260); Copps (1968): for Executive-overload restarts "the restart warning
  light is not lit". The code display came only when Aldrin keyed V05N09
  (Eyles; Cherry's log). Apollo 11 showed plain `01202`, not the "3"-prefixed
  codes of later Luminary versions.
- **Crew keystrokes** (Cherry's log, TFI → GET with TIG 102:33:05): V16N68E
  102:38:09 (ΔH −2,884), V05N09E 102:38:27, V57E 102:38:43 (MR 102:38:45),
  V16N68E 102:38:51, V05N09E 102:42:21 (R1 = 1201), PRO on flashing V06N64
  102:42:33, V05N09E 102:42:45 (R1 = 1202). The log's TFI are whole
  seconds; the demo puts ENTR at 102:42:21.4 and 102:42:45.4. The second V05N09 (after the
  second alarm) is Eyles', time not recorded. **RSET and KEY REL are
  inferred:** FAILREG must have been cleared between the second and third
  alarms and again between the third and fourth (Cherry's log shows R1 =
  1201, then R1 = 1202); KEY REL is what returns a program display after a
  crew display. Their times are illustrative.
- "Both P63 alarms came about 12 seconds after a monitor verb" (Tillman).
  "Same type": Garman OH. The go chain "Garman said, 'go'. Larson gave a
  thumbs-up …" is Eyles' text. The Flight-loop wording itself (e.g. Bales'
  "We're go on that, Flight") was not verified against a loop transcript and
  is not used.
- The 5 July simulation (Hersch, CBS, Kranz's book; Garman OH says "May or
  June"); the alarm code is "a 1201" in Hersch and Kranz's book, while Koos,
  who ran the simulation, recalled "a program alarm, 1202, or 1201" (Koos OH
  2023), so the narration hedges it. The go/no-go criterion "continuing
  occurrence" (GARMAN LIST: the BAILOUT group 1201/1202 sits under
  "CONTINUING OCCURRENCE OF:", with "DUTY CYCLE MAY DEGRADE PGNCS … WATCH FOR
  OTHER CUES … SWITCH TO AGS … MAY HELP" — not an abort call by itself; MR
  §13.1: "bailout-type alarms such as these would not prevent continuing the
  flight").
- P64: flashing displays ask for a VAC area — `GODSPRS1 … # IS THIS A
  FLASHING R DISPLAY … YES, MAKE DSPLAY JOB A VAC` → `SPVAC`
  (`DISPLAY_INTERFACE_ROUTINES.agc:833-856`; `REFLASHR` sets `REDOMASK` =
  bits 4 and 14, `:661-663`, `:1400`). That this contributed to the 1201 is a
  research hypothesis consistent with Cherry ("some job like SERVICER was
  scheduled two and possibly three or four times") — the demo says what the
  code does and lets the model show the effect.
- ATT HOLD "forestalling the next alarm" and P66 lighter (Eyles). Armstrong
  switched to ATT HOLD to fly past the crater ("To avoid the crater", MR
  §5.3; Eyles: "after deciding that he could not stop short of the
  crater"); the load relief was a side effect, and the narration says so.
- Duke's "Roger. 1202. We copy it." is logged at TEC 102:42:58, the fifth
  alarm's own (computer-determined) second, so it most likely acknowledges
  the fourth (102:42:43), seen on telemetry; neither P64 1202 has a crew
  voice report. The quote plays at its TEC time and the fifth-alarm card says
  so.
- **Myths** (research web-1202-b §6): "rebooted" — no; "radar data" — no
  (the RR CDUs fed the LGC's angle counters "regardless of whether the
  rendezvous radar itself was powered up", Eyles — a conditional: on Apollo
  11 the radar was powered, AFJ 102:06:24); "checklist error" — the trigger,
  not the root cause; "master alarm" —
  unverified (Garman OH 2001 claims it; no primary C&W record found), so the
  demo does not claim it; "Margaret Hamilton's priority scheduling saved it"
  — oversimplified and misattributed: two designs worked together. Hal
  Laning's priority-driven Executive put the shortfall on SERVICER ("there
  was no collapse", Eyles 2004), and the software restart with phase-table
  restart protection, which Copps described in 1968, shed the backlog: it
  restored SERVICER (lowest priority) and dropped the higher-priority monitor,
  by restart group rather than by priority (research web-1202 §10 rates the
  claim "partly true", web-1202-b §6 "misattributed / oversimplified").
  Margaret Hamilton led the flight-software effort,
  so "her team's software" is fair, but her phrase "priority displays of 1201
  and 1202 alarms" does not match Luminary 1A (the crew keyed V05N09).

### 3.5 P64: approach and the landing point designator (`p64-approach`)

- N64 R1 = TREDES and LOOKANGL (`ERASABLE_ASSIGNMENTS.agc:2546-2547`); flashing
  until PRO (`LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:856-885`).
- LPD increments ½° elevation, 2° azimuth (`ELEACH`/`AZEACH`,
  `:1210-1212`; Fjeld in ALSJ). Klumpp's 1° counts describe a later version.
  In attitude hold `COUNT'EM` skips redesignation (`:1174-1178`).
- PRO on V06N64 at 102:42:33 (Cherry's log, TFI 568). The debriefing
  remembers "we proceeded on the flashing 64" "very shortly" after P64; the
  log is preferred.
- LPD readouts 47° (102:42:33–36), 35° (102:43:01), 33° (102:43:07), possibly
  30° (102:43:16, uncertain) — ALSJ/TEC.
- West crater and its boulders: ALSJ commentary ("possibly as he sees West
  Crater"). "1000 at 30": ALSJ merges it into the 102:42:37 entry; ONB puts
  it at 102:42:51, which matches TRW's ~990 ft at 102:42:50 — the caption
  uses 102:42:51.
- One landing-point redesignation at 102:43:09 (MR Table 5-I); Armstrong: "I
  didn't (use the LPD to) redesignate" (ALSJ 1991 review); Eyles "apparently
  one inadvertent redesignation". Not replayed (direction unknown).
- ATT HOLD check 102:41:53–102:42:03 and manual takeover 102:43:13 (MR;
  Eyles 102:43:08 at 650 ft); pitch ~18° → ~5–6° (ALSJ/MR via research).

### 3.6 P66 and touchdown (`p66-touchdown`)

- P66 needs ATT HOLD **and** a ROD click (`LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:194-208`);
  STARTP66 sets the target rate to the current one (`:143-148`); RODCOMP
  each second (`:934-953`); `RODSCALE` 1.0 ft/s per click (PAD); "A flick
  upward slowed the descent by one foot per second" (Eyles). P66 at
  102:43:22, ~400 ft (MR; Eyles 102:43:20, 430 ft). Luminary 099's P66 has
  no automatic horizontal nulling; attitude is manual (research src-landing
  §0.9).
- V06N60 R1 is Noun 60 "HORIZONTAL VELOCITY"
  (`ASSEMBLY_AND_OPERATION_INFORMATION.agc:399`), ECADR `VHORIZ`
  (`PINBALL_NOUN_TABLES.agc:714`), stored by `VHORCOMP` as a magnitude
  (`ABVAL`, `LUNAR_LANDING_GUIDANCE_EQUATIONS.agc:1102-1110`), cross-range
  included — the narration says "horizontal velocity", even where Aldrin's
  callouts say "N forward". The forward and lateral components (`FORVEL`,
  `LATVEL`, `ERASABLE_ASSIGNMENTS.agc:2570-2571`) drive the cross-pointer
  meter, not the DSKY.
- PROG after the fifth alarm (102:42:58): no V05N09 or RSET is logged after
  it (Cherry; research web-1202-b §2.5), so when the crew cleared the last
  PROG light is not recorded. Every replay shows it the same way: PROG stays
  lit with FAILREG = 01202 to the end — `p66-touchdown`, which starts after
  the alarm, sets that state at its first instant (`lastAlarmShowing`,
  `js/demo/scenarios/lib.js`) — and the narration says the time is not
  recorded.
- ~1,100 ft beyond the automatic aim point (MR §5.3; BEN70); ~2 min 28 s
  below 500 ft vs 104 s nominal (BEN70).
- LR data not good 102:44:11–21 and 102:44:59–102:45:03 (MR Table 5-I;
  zero-Doppler, MR §9.11); lamps steady on when data fail (`P20-P25.agc:5115-5180`).
- Low-level light 102:44:28 (MR Table 5-I; MR §9.8 102:44:30.4; Fjeld
  102:44:31): the DES QTY light, one of the red Warning lights at the top of
  Panel 1, not a yellow Caution light (ALSJ commentary after 102:44:45);
  5.6 % sensor (AER-DPS); ~94 s to Bingo, land within 20 s or abort (Fjeld in
  ALSJ). How early slosh latched it, the sources disagree, and the narration
  gives the range: about 20 s (BEN72), "nearly 30 seconds" / "half a minute"
  (Fjeld in ALSJ), while MR §9.8's own comparison — "indicated time of 45
  seconds to propellant depletion compares favorably with the postflight
  calculated value of 50 seconds to oxidizer tank 2 depletion" — implies
  only about 5 s.
- "Eight percent" (102:44:00) is ALSJ's reading (from D. R. Lunsford); ONB
  hears "Wait just a minute" and TEC has nothing — flagged in the quote's
  note.
- Touchdown 102:45:39.9, 1.7 ft/s down, 2.1 ft/s left (MR §5.4: "Landing on
  the surface occurred at 102:45:39.9 … (motions after first footpad
  touchdown)") — the footpads, with the engine still running ("engine
  shutdown occurring almost simultaneously with touchdown", MR §3; Armstrong:
  "We actually had the engine running until touchdown", ALSJ). The lunar
  contact light (67-in probes) is therefore earlier: ≈102:45:36.6, derived
  where the track passes 5.6 ft at ≈1.6 ft/s; Aldrin's call at 102:45:40 is
  the voice, which lags telemetry by 0–13 s (Armstrong's onboard "Shutdown"
  is logged at 102:45:43 against the 102:45:41.40 cutoff). An earlier version
  of the track read the MR time as the contact light and let the LM fall
  ≈3 ft after cutoff, which Armstrong says did not happen. Engine cutoff
  102:45:41.40, burn 756.39 s (MR Table 9.6-V); 770 lb propellant left (MR
  §9.13.1), not all of it usable (≈100 lb unusable, ALSJ commentary via
  research web-trajectory-b); "the indicated time of 45 seconds to propellant
  depletion" is the light-based count (MR §9.8; postflight 50 s to oxidizer
  tank 2 depletion). At hover (≈8.8 lb/s) the 770 lb would last ≈85 s
  [DER], so the two
  numbers are not equivalent and the narration does not equate them.
- "413 is in": AGS DEDA address 413 = +10000, the lunar-surface flag (O'Brien
  in ALSJ). Not the AGC.
- "The Eagle has landed": ALSJ 102:45:58 (TEC 102:45:59 / 102:46:04). Duke's
  "Roger, Twan... Tranquility" (ALSJ; TEC omits "Twan"). "Thank you" at
  102:46:16: ALSJ says Aldrin, TEC/ONB say Armstrong — caption follows ALSJ.
- P68 only via V37E68E (`FRESH_START_AND_RESTART.agc:1070`); `LANDJUNK`
  (`THE_LUNAR_LANDING.agc:286-322`), "ASTRONAUT: NOW LOOK WHERE YOU ENDED
  UP". The keying time is not recorded (Aldrin reads Noun 43 at 102:48:10);
  the demo keys it at 102:46:50 — **illustrative**.

### 3.7 The whole descent (`full-descent`)

Compact versions of 3.2–3.6; same sources, same crew schedule. Garman's "As
long as it doesn't reoccur, it's fine" is from his 2001 oral history (a
recollection, labelled as such on screen).

### 3.8 Columbia's SPS burn: Lunar Orbit Insertion (`cm-loi`)

- Runs on the Command Module programs (`js/agc/programs/cm/p40.js`) and SPS
  vehicle; `setup` loads the LOI-1 PAD and starts P40 at its countdown, like
  the "LOI-1 burn" interactive preset.
- PAD (AFJ "Approach", read up by McCandless at 072:51:24, read back at
  072:53:54): TIG 075:49:49.65, ΔVT 2917.3 ft/s, burn time 6:02, "No
  ullage". LOS 075:41:23 — the burn was behind the Moon, "out of
  communications" (AFJ "Lunar Orbit Insertion").
- Actual (MR Table 8.6-II, Table 7-V, via research src-comanche §3): ignition
  075:49:50.37, cutoff 075:55:47.90, 357.53 s ("the longest [SPS] engine
  firing was for 357.5 seconds", MR §8.8 Service Propulsion; the descent
  engine's 756.3 s, §9.8.1, was longer), 2,917.5 ft/s, orbit 169.7 × 60.0 nmi. The model
  ignites at the PAD TIG once PRO has been given (the code's rule,
  `Comanche055/P40-P47.agc:503-516`); the 0.7 s to the Mission Report's
  ignition time is not explained by our sources.
- Code: `TIGBLNK` (`P40-P47.agc:350-366`), `TIGAVEG` "UNBLANK DISPLAY"
  (`:456-474`), `TIG-5` "WILL CAUSE V99 FLASH" (`:480-497`), `TIG-0` "CHECK
  ASTN FLAG FOR V99 RESPONSE" and `SPSON` "TURN ON SPS ENGINE" (`:503-528`),
  "0.4 SECOND DELAY FOR THRUST BUILDUP" (`:546-583`), `S40.8` and `TIG :=
  PIPTIME + TGO` (`:1646-1738`), `S40.81` / `FOURSEC` (`:1719-1770`),
  `SPSOFF`, "2.5 SECOND DELAY FOR SPS TAILOFF", `POSTBURN` V16N40, `TIGNOW`
  V16N85 (`:176-200, 647-695`), `FENG` 20,500 lbf (`:320`; the "20,000 LBS"
  comment at `:57` is stale), `3MDOT` comment 63.8 lb/s (`:344`), seven core
  sets (`Comanche055/EXECUTIVE.agc:161`, `NO.CORES DEC 6`). Anchors are the
  `cm.*` ones in `js/data/anchors/cm.js`.
- Voice: the CM onboard tape as printed in AFJ "Lunar Orbit Insertion"
  (`12day4-loi1.html`), checked against the page text. "Proceed" at
  075:49:46 is attributed there to "Armstrong/Collins", so the demo has
  Collins key it (he had said "I'll proceed on the 99" at 075:48:37). The PRO
  on the flashing V16N40 after the burn is inferred from Aldrin's "Look at the
  residuals. Proceed." (075:56:17); who pressed it is not recorded.
- Residuals "minus 1, minus 1, plus 1" = −0.1, −0.1, +0.1 ft/s (research
  src-comanche §3); not trimmed ("we're not going to trim them").
- LOI-2 080:11:36.75, 16.88 s; TEI 135:23:42.28, 151.41 s (MR Table 8.6-II).

## 4. What is modelled, and what is simplified

**Modelled from the listings** (behaviour, not instruction-level
emulation): the DSKY's display and lamp logic and the PINBALL verb–noun
language; the Executive's 8 core sets and 5 VAC areas, priorities, NOVAC /
FINDVAC and the 1201/1202 checks in the code's order; the Waitlist; BAILOUT
and the software restart with restart groups and phase tables; the BURNBABY
sequence with its table-driven timings; the program flow P63 → P64 → P66 and
P68; the V16 monitor, V57 and the crew responses to flashing displays.

**Simplified or calibrated:**

- **Job costs are calibration, not measurements.** No source gives the CPU
  time of SERVICER or of a display job. The costs in `js/agc/workload.js`
  were chosen to reproduce Eyles' duty-cycle margins (>15 %, ~13 %, ≤10 %,
  <10 %) and Cherry's 10 % design tolerance. The RR CDU drain is 13 % (MIT's
  figure; theory 15 %, Grumman 13.36 %).
- **The alarms emerge from that model** — nothing in the scenarios forces an
  alarm — but their exact second depends on the calibration and on the crew
  keystroke times. The Apollo 11 scenarios pass a small calibration to the
  model (`A11_WORKLOAD_PARAMS` in `js/demo/scenarios/lib.js`: P64 guidance
  pass 759 ms instead of 760, LPD logic 1 ms instead of 10, display job 35
  ms instead of 30), found by sweeping those three costs; neighbouring
  values give the same times. With it the model gives 1202 at 102:38:23.1
  (MR 102:38:22), 1202 at 102:39:03.1 (102:39:02), 1201 at 102:42:17.1
  (102:42:18), 1202 at 102:42:43.1 (102:42:43) and 1202 at **102:42:55.1**
  (102:42:58). The test suite checks ±2 s, with one documented exception:
  the last 1202 comes 2.9 s early, because after the fourth restart the
  model fills its core sets again in 12 s where the flight took 15 s. No
  combination tried in the sweep put all five within ±2 s, and the demo
  does not force the alarm. Which job's request failed
  at each real alarm is not documented (research src-executive §15.3); the
  demo never names one.
- **Replay vehicle.** In the demo the spacecraft follows the reconstructed
  Apollo 11 trajectory (`js/data/apollo11-descent.js`, from MR, BEN70, TRW
  and the crew's DSKY callouts) and ignores the computer's commands; the
  computer's displays are derived from it. Altitudes shown by the DSKY are
  the PGNCS view (after radar updates, roughly height above the local
  terrain), which can read a few hundred feet higher than the reconstructed
  height above the landing-site radius.
- **Crew inputs** are replayed at documented times where the record has
  them; RSET and KEY REL after alarm readouts, the PRO on V99 (to the
  second), the ROD click direction and V37E68E are inferred (see
  `crew-a11.js`). Armstrong's many later ROD clicks and his hand-controller
  attitude commands are not replayed individually.
- **Restart duration.** No measurement survives; the research estimates
  10–20 ms from the code path. The narration says "milliseconds" or "a
  fraction of a second".
- **Display timing.** The real DSKY changed one relay word per 20–120 ms and
  countdown displays updated on a 1-s clock job; the model updates digits
  when PINBALL writes them.
- **Not modelled:** the Abort Guidance System (so "413 is in" is narrated,
  not simulated); the master caution and warning system; the landing analog
  displays' needles; the communications dropouts.

## 5. Apollo 11 numbers used on screen (quick reference)

| Item | Value | Source |
| --- | --- | --- |
| PDI ignition | 102:33:05.01 | MR Table 9.6-V |
| Ullage start | 102:32:58 | MR Table 5-I |
| Fixed throttle position | 102:33:31 | MR Table 5-I |
| LR data good | 102:37:51 | MR Table 5-I |
| V57 (radar updates) | 102:38:45 | MR Table 5-I |
| Alarms | 1202 102:38:22; 1202 102:39:02; 1201 102:42:18; 1202 102:42:43; 1202 102:42:58 | MR Table 5-I |
| Throttle recovery | 102:39:31 (386 s, predicted 384 s) | MR Table 5-I, §5.3 |
| P64 / high gate | 102:41:32, 7,129 ft, −125 ft/s | MR §5.3 |
| ATT HOLD (manual) | 102:43:13 | MR Table 5-I |
| P66 | 102:43:22 | MR Table 5-I |
| Low-level light | 102:44:28 | MR Table 5-I |
| Lunar contact light | ≈102:45:36.6 (derived; called 102:45:40) | track [DER], ALSJ |
| Touchdown (footpads) | 102:45:39.9 | MR §5.4 |
| Engine cutoff | 102:45:41.40 (756.39 s) | MR Table 9.6-V |
| Propellant left | 770 lb (MR §9.13.1); light-based count ~45 s to depletion (MR §9.8) | MR §9.13.1, §9.8 |
