// "1202": the Executive overflows of the Apollo 11 descent.
//
// Nothing here forces an alarm. The rendezvous-radar CDU cycle stealing is
// switched on at the start (as it was on the real LM), the crew's DSKY
// keystrokes are replayed at the times of Cherry's DSKY log (crew-a11.js),
// and the alarms emerge from the Executive model (js/agc/executive.js +
// workload.js) running out of core sets or VAC areas. test/scenarios.test.mjs
// checks that they land within ±2 s of the Mission Report times.
//
// Research: web-1202-b.md (primary for the story and the myths),
// src-executive.md (the code path), web-timeline-b.md (voice).

import { defineScenario, say, rrFaultOn, alignedStart, A11_AGC_OPTIONS } from './lib.js';
import { crewEvents } from './crew-a11.js';

const START = alignedStart('102:37:40'); // on the flight's 2-s SERVICER grid (lib.js)
const END = '102:43:30';

export default defineScenario({
  id: 'alarms-1202',
  title: '1202: the Executive overflow',
  summary: 'Five program alarms in four and a half minutes — 1202, 1202, 1201, 1202, 1202 — and not one reason to abort. Watch the core sets and VAC areas fill on the Executive tab as the rendezvous radar steals memory cycles and SERVICER falls behind, see the software restart sweep the board and bring navigation back in milliseconds, hear Houston say “We’re Go on that alarm”, and sort the myths from the record.',
  software: 'Luminary099',
  vehicle: 'replay',
  track: 'apollo11Descent',
  // Executive-load calibration shared by every Apollo 11 replay (lib.js).
  agcOptions: A11_AGC_OPTIONS,
  start: START,
  end: END,
  initialProgram: 63,
  speed: 1,
  events: [
    { at: START, chapter: 'A hidden drain' },
    rrFaultOn(START),
    { at: START, focus: 'exec' },
    { at: '102:37:40.5', narrate: {
      title: 'Stolen memory cycles',
      body: '<p>Eagle is four and a half minutes into the burn, about 37,000 feet up. Since 102:10 the rendezvous-radar mode switch has been out of its <b>LGC</b> position (AUTO TRACK, then SLEW). In either position the radar’s angle resolvers were fed an 800 Hz supply locked in frequency but not in phase with the computer’s, so the two RR <b>CDUs</b> counted up and down continuously — up to 6,400 counts a second each. Every count steals one 11.7 µs memory cycle: about 15 % in theory, 13 % as MIT estimated.</p><p>Watch the “RR CDU” slice of the load bar.</p>',
      focus: 'exec',
    } },
    { at: '102:37:42', spotlight: 'exec.steal' },
    { at: '102:37:46', hold: 4 },

    { at: '102:37:50', narrate: {
      title: 'Core sets and VAC areas',
      body: '<p>The <b>Executive</b> runs jobs by priority (octal numbers; higher wins). Every job needs a <b>core set</b> — 12 registers holding its state — and Luminary 099 has <b>eight</b>. A job that uses the vector interpreter also needs a <b>VAC area</b>, a 43-word scratch pad; there are <b>five</b>. <code>NOVAC</code> asks for a core set only, <code>FINDVAC</code> for both.</p><p>The comment beside the search still says “SEVEN SETS OF ELEVEN REGISTERS” — it is stale; the erasable layout says eight of 12.</p>',
      anchors: ['exec.erasable.coresets', 'exec.erasable.vacs', 'exec.novac.1202'],
    } },
    { at: '102:37:53', spotlight: 'exec.coresets' },
    { at: '102:37:56', spotlight: 'exec.vacs' },
    { at: '102:38:00', hold: 4 },

    { at: '102:38:01', chapter: 'Verb 16 Noun 68' },
    say('lock-on'),
    { at: '102:38:05', narrate: {
      title: 'Aldrin keys V16N68',
      body: '<p>The landing radar has locked on. Aldrin keys <b>Verb 16 Noun 68</b> to watch <b>ΔH</b>, radar altitude minus the computer’s altitude, in R3 (Cherry’s DSKY log: 102:38:09, ΔH −2,884 ft).</p><p>Verb 16 is a monitor: every second the task <code>MONREQ</code> starts a <code>MONDO</code> job at priority 30 — above SERVICER’s 20 — and it takes a core set. Eyles: the monitor cut the spare time from about 13 % to “10% or less”. With 13 % stolen, that is not enough.</p>',
      anchors: ['exec.job.mondo', 'scn.noun.n68'],
    } },
    ...crewEvents(START, END),
    { at: '102:38:10', spotlight: 'dsky.r3' },
    say('lock-on-q'),
    say('delta-h'),
    { at: '102:38:12', narrate: {
      title: 'SERVICER gets last crack',
      body: '<p>Every 2 seconds the waitlist task <code>READACCS</code> reads the accelerometers and asks for a new <b>SERVICER</b> job (priority 20, <code>FINDVAC</code>): navigation, guidance, throttle, attitude, displays. It is the biggest job and the lowest-priority one, so when time runs short it is SERVICER that has not finished when the next READACCS, “running punctually”, schedules another (Eyles).</p><p>Each unfinished copy keeps its core set <i>and</i> its VAC area. Watch them stack up.</p>',
      anchors: ['servicer.readaccs'],
    } },
    { at: '102:38:14', spotlight: 'exec.load' },
    { at: '102:38:17', spotlight: 'exec.coresets' },
    say('copy-dh'),
    say('earth'),
    say('looking-at-dh'),

    // 1st alarm: emerges from the model at ~102:38:22 (MR Table 5-I).
    { at: '102:38:21', chapter: 'Program alarm 1202' },
    { at: '102:38:22.4', narrate: {
      title: '1202: no core sets',
      body: '<p>A job asks for a core set; <code>NOVAC2</code> looks at all eight and finds none free. <code>NEXTCORE</code> gives up: <code>TC BAILOUT1</code>, <code>OCT 1202</code> — “EXECUTIVE OVERFLOW - NO CORE SETS”.</p><p><code>BAILOUT1</code> stores 1202 in the alarm register, turns on the <b>PROG</b> lamp — the crew saw no number, only the lamp — and starts a <b>software restart</b>. Not a reboot, and not the RESTART lamp, which only a hardware restart lights.</p>',
      anchors: ['exec.nextcore', 'alarm.list.exec', 'alarm.bailout1'],
      focus: 'exec',
    } },
    { at: '102:38:22.6', spotlight: 'dsky.light.prog' },
    { at: '102:38:23', hold: 5 },
    { at: '102:38:24', narrate: {
      title: 'The software restart',
      body: '<p><code>ENEMA</code> clears the decks: all eight core sets and five VAC areas freed, the waitlist emptied, the DSKY digits blanked and — line 550 — <code>MONSAVE # KILL MONITOR</code>. Erasable memory is kept: the state vector, the guidance, the engine still burning.</p><p>Then <code>GOPROG3</code> reads the <b>phase tables</b>: each protected restart group is restarted from its last checkpoint — group 5 navigation (only the newest SERVICER), group 3 guidance. The V16N68 monitor was not protected, so it is gone; V06N63 comes back on the next pass.</p>',
      anchors: ['restart.enema', 'restart.kill-monitor', 'restart.goprog3', 'restart.servicer', 'guid.lunland'],
    } },
    { at: '102:38:25', spotlight: 'exec.coresets' },
    say('affirmative'),
    say('program-alarm'),
    say('looking-good-alarm'),
    { at: '102:38:27.5', narrate: {
      title: 'Verb 05 Noun 09',
      body: '<p>The code was not displayed automatically. Aldrin keyed <b>V05N09</b> (Cherry’s log: 102:38:27): R1 shows <b>01202</b>, in octal like every alarm code. The three registers keep the first, second and latest alarm since they were last cleared.</p><p>Then — our reconstruction, since the record does not time it — <kbd>RSET</kbd> to clear PROG and the registers, and <kbd>KEY REL</kbd> to give the DSKY back to the guidance display.</p>',
      anchors: ['alarm.failreg', 'alarm.rset', 'scn.pinball.keyrel'],
    } },
    { at: '102:38:28', spotlight: 'dsky.r1' },
    say('its-1202'),
    say('1202-lmp'),
    { at: '102:38:36', hold: 3 },

    { at: '102:38:38', chapter: 'Houston' },
    { at: '102:38:38.5', narrate: {
      title: 'Meanwhile, in Mission Control',
      body: '<p>Days before launch (5 July, by most accounts) a training run had ended in an unnecessary abort over a 1201. The controllers then studied every alarm; the handwritten list under the glass of Jack Garman’s console (NASA) says that for 1201 and 1202 the abort cue was <i>continuing occurrence</i>. Now, Eyles writes, “Garman said, ‘go’. Larson gave a thumbs-up” — Russ Larson of MIT — so guidance officer Steve Bales said go, Flight Director Gene Kranz said go, and CAPCOM Charlie Duke passed it up, about half a minute after the alarm.</p>',
    } },
    { at: '102:38:40', hold: 5 },
    say('give-reading'),
    { at: '102:38:45.5', narrate: {
      title: 'V57: let the radar in',
      body: '<p>Aldrin keys <b>Verb 57</b> (Mission Report: 102:38:45) — <code>LRON</code>, “PERMIT INCORPORATION OF LR DATA”. From now on SERVICER blends the radar’s altitude into its own estimate, and ΔH shrinks (the Mission Report: within about 30 seconds). Unlike a monitor, V57 costs almost nothing: it sets one flag and ends.</p>',
      anchors: ['lr.v57'],
    } },
    say('go-on-alarm'),
    { at: '102:38:53', spotlight: 'transcript' },
    { at: '102:38:54', narrate: {
      title: 'V16N68 again',
      body: '<p>Aldrin keys V16N68 a second time (Cherry: 102:38:51) to watch ΔH come down — Eyles says it read about 900 ft. The same monitor on the same overloaded computer: the core sets fill again. C. Tillman of Grumman, working from the telemetry, found that both P63 alarms came about 12 seconds after a monitor verb was keyed.</p>',
      anchors: ['exec.job.mondo'],
    } },
    { at: '102:38:58', spotlight: 'exec.coresets' },
    say('six-plus-25'),
    say('about-820'),
    { at: '102:39:02.4', narrate: {
      title: 'Second 1202',
      body: '<p>Same alarm, same restart — and again the restart <i>helps</i>: it flushes the SERVICER stubs that had piled up and kills the monitor that tipped the balance. In Eyles’ words, restart protection “primarily motivated by the possibility of hardware glitches synergistically provided a means to shed computational load”.</p>',
      anchors: ['exec.nextcore', 'restart.tables.5'],
    } },
    { at: '102:39:02.6', spotlight: 'dsky.light.prog' },
    say('six-plus-25b'),
    say('roger-copy-625'),
    say('six-plus-25c'),
    say('same-alarm'),
    { at: '102:39:15', narrate: {
      title: '“When we have a 16/68 up”',
      body: '<p>Aldrin has spotted the pattern. The monitor was the last straw, not the cause: MIT had designed for a 10 % time loss <i>with</i> a monitor verb running (Cherry), but the radar CDUs took about 15 %. Houston’s answer — “We’ll monitor your Delta-H” — took the load off the computer: no more V16N68 in P63, and no more alarms in P63.</p>',
    } },
    say('copy-same-alarm'),
    say('monitor-dh'),
    say('coming-down-q'),
    say('beautifully'),
    { at: '102:39:26', hold: 3 },

    { at: '102:39:30', chapter: 'Quiet braking' },
    { at: '102:39:30', speed: 8 },
    say('wow-throttle-down'),
    say('throttle-down-on-time'),
    { at: '102:39:40', narrate: {
      title: 'Fast-forward to high gate',
      body: '<p>Without the monitor, the braking phase runs on the edge but holds: SERVICER finishes inside its 2 seconds. We skip ahead at 8× to <b>P64</b>, the approach phase, where the margin is thinner still. On the way, the throttle comes down from its maximum at 102:39:31 — right on time (see <i>P63: the braking phase</i>).</p>',
    } },
    { at: '102:41:24', speed: 1 },

    { at: '102:41:30', chapter: 'P64: less than 10 %' },
    { at: '102:41:32.5', narrate: {
      title: 'P64: a thinner margin',
      body: '<p>High gate, 7,129 ft: <b>P64</b>. Eyles: “the essential software by itself left a duty-cycle margin of less than 10%”. And the new display, a flashing <b>V06N64</b>, is re-posted on every pass until the crew presses PRO — and a flashing display job asks for a VAC area: “IS THIS A FLASHING R DISPLAY … YES, MAKE DSPLAY JOB A VAC”. Cherry’s log shows that PRO only at 102:42:33. Watch the five VAC areas.</p>',
      anchors: ['p64.disps', 'exec.job.makeplay'],
      focus: 'exec',
    } },
    { at: '102:41:34', spotlight: 'exec.vacs' },
    say('p64'),
    say('attitude-check'),
    say('manual-good'),
    say('go-for-landing'),
    say('3000-at-70'),
    say('understand-go'),

    // 3rd alarm: 1201 at 102:42:18.
    { at: '102:42:18.4', narrate: {
      title: '1201: no VAC areas',
      body: '<p>This time a job that needs a VAC area finds all five taken: <code>FINDVAC2</code> checks <code>VAC1USE</code> … <code>VAC5USE</code>, then <code>TC BAILOUT1</code>, <code>OCT 1201</code> — “NO VAC AREAS”. Cherry: “some job like SERVICER was scheduled two and possibly three or four times” — and each copy, like each flashing-display job, holds a VAC area. No monitor is running: “We weren’t in 1668 at that point” (Aldrin, debriefing).</p><p>The restart works as before, but now it can only buy time: “Each time, the software restart flushed the Executive queue but could not shed load” (Eyles).</p>',
      anchors: ['exec.findvac.1201', 'exec.job.makeplay'],
    } },
    { at: '102:42:18.6', spotlight: 'exec.vacs' },
    { at: '102:42:19', hold: 4 },
    say('copy-3000'),
    say('program-alarm-1201'),
    say('1201-cdr'),
    say('go-1201'),
    { at: '102:42:26', narrate: {
      title: '“Same type”',
      body: '<p>Garman remembered shouting “Same type!” down the line; Duke passes it straight to the crew. Aldrin reads the code with V05N09 (Cherry: 102:42:21), clears it (our reconstruction), and at 102:42:33 finally presses <b>PRO</b> on the flashing V06N64: the display goes steady, landing-point redesignation is enabled, and one VAC consumer disappears.</p>',
      anchors: ['p64.disps'],
    } },
    { at: '102:42:33.5', spotlight: 'dsky.verb' },
    say('2000-feet'),
    say('looking-great-go'),

    // 4th and 5th alarms: 1202 at 102:42:43 and 102:42:58.
    { at: '102:42:43.4', narrate: {
      title: 'Fourth: 1202',
      body: '<p>Twenty-five seconds later the core sets run out again: <b>1202</b>. Aldrin reads it with V05N09 (Cherry: 102:42:45). There is no voice call for this one — the crew is busy: 1,400 ft, LPD 47°, a boulder field ahead. The flashing display is gone since the PRO at 102:42:33; the essential P64 work alone is more than the computer has time for.</p>',
      anchors: ['exec.nextcore'],
    } },
    { at: '102:42:43.6', spotlight: 'dsky.light.prog' },
    { at: '102:42:58.4', narrate: {
      title: 'Fifth and last: 1202',
      body: '<p>770 feet, 27 ft/s down (Eyles): the last alarm of the descent. Five alarms, and each time navigation, guidance, throttle and attitude came back from their last checkpoint within a fraction of a second; the engine never stopped. The relief came from the crew: at 102:43:13 Armstrong switched to attitude hold, “forestalling the next alarm”, and ten seconds later to P66, whose load was lighter (Eyles). No alarm followed.</p>',
      anchors: ['exec.nextcore', 'guid.guildenstern'],
    } },
    say('copy-1202'),
    { at: '102:43:00', hold: 4 },
    { at: '102:43:02', chapter: 'Myths and the record' },
    { at: '102:43:02', narrate: {
      title: 'Myths and the record (1)',
      body: '<ul><li><b>“The computer rebooted.”</b> No: a software restart; memory, state vector and engine were untouched, and the RESTART lamp stayed dark by design.</li><li><b>“Radar data overloaded it.”</b> No radar data were involved: the counts came from the radar’s angle counters, even with the radar switched off.</li><li><b>“The checklist error did it.”</b> The checklist put the switch in AUTO TRACK — the trigger; the cause was an 800 Hz phase mismatch found in LM-3 testing and never fixed.</li><li><b>“The master alarm sounded.”</b> No primary record we found confirms it.</li></ul>',
    } },
    { at: '102:43:10', hold: 5 },
    { at: '102:43:14', narrate: {
      title: 'Myths and the record (2)',
      body: '<ul><li><b>“Priority scheduling saved the landing.”</b> The priority Executive was Hal Laning’s design. What saved the landing was restart protection by <b>phase tables</b> (described by E. M. Copps of MIT in 1968): it brought back SERVICER, the <i>lowest</i>-priority job, and dropped the higher-priority monitor. It was the flight software of Margaret Hamilton’s team, built by many people.</li><li><b>“Aldrin’s display caused it.”</b> It tipped P63 over the edge; the three P64 alarms came with no monitor running.</li></ul>',
    } },
    say('540-feet'),
    { at: '102:43:24', spotlight: 'dsky.prog' },
  ],
});
