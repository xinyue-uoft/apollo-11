// "Burn, Baby, Burn": the last minute before powered descent initiation and
// the first half-minute of the burn. Computer events come from the code's
// own timing (TIG = 102:33:05.01, Mission Report Table 9.6-V); captions at
// their ALSJ times. Research: src-ignition.md §2–6, web-timeline-b.md §1b.

import { defineScenario, say, rrFaultOn } from './lib.js';
import { crewEvents } from './crew-a11.js';

const START = '102:32:00';
const END = '102:34:20';

export default defineScenario({
  id: 'burn-baby-burn',
  title: 'Burn, Baby, Burn: powered descent ignition',
  summary: 'The last 65 seconds before Eagle’s descent engine lit, as the computer counted them: the countdown on Verb 06 Noun 62, the five-second blank that says Average-G has started, ullage, the flashing Verb 99 “please enable engine” that waits for Aldrin’s PRO, ignition at 10 % thrust and the throttle-up 26 seconds later — told through BURNBABY, the table-driven master ignition routine, its name and its mottos.',
  software: 'Luminary099',
  vehicle: 'replay',
  track: 'apollo11Descent',
  start: START,
  end: END,
  initialProgram: 63,
  speed: 1,
  events: [
    { at: START, chapter: 'Countdown' },
    rrFaultOn(START),
    { at: START, focus: 'ignition' },
    { at: '102:32:01', narrate: {
      title: 'Sixty-five seconds to ignition',
      body: '<p>Eagle is 50,000 feet above the Moon, coasting toward powered descent initiation (PDI). The program is <b>P63</b>, the braking phase; the burn has not started yet.</p><p>The DSKY shows <b>Verb 06 Noun 62</b>: R1 is the LM’s speed (about 5,560 ft/s), R2 the time from ignition in minutes and seconds, counting toward zero, R3 the velocity gained so far. Ignition is due at <b>102:33:05</b>. Watch R2 — and the timeline on the Ignition tab.</p>',
      anchors: ['scn.burn.p63table'],
      focus: 'ignition',
    } },
    { at: '102:32:03', spotlight: 'dsky.r2' },
    { at: '102:32:08', hold: 3 },

    { at: '102:32:10', narrate: {
      title: 'One routine for every engine',
      body: '<p><b>BURNBABY</b>, the master ignition routine, does everything “between the pre-ignition time check … and TIG + 26 seconds” for P12, P40, P42, P61 and P63. It is <i>table-driven</i>: each program puts the address of its own table in the register <code>WHICH</code>, and BURNBABY executes <code>INDEX WHICH</code> to pick the display, the ullage time and the post-ignition branch.</p><p>P63’s row says: countdown noun 62, ullage <code>DEC 2240</code> centiseconds after TIG−30, and branch to <code>P63IGN</code> at ignition.</p>',
      anchors: ['scn.burn.header', 'scn.burn.p63table'],
    } },
    { at: '102:32:12', spotlight: 'ignition.timeline' },
    say('engine-arm'),

    // TIG−35 = 102:32:30.0. The TIG-35 task blanks the DSKY; the clock job
    // that redraws the display runs once a second, so the blank shows up
    // within a second (src-ignition §17.9).
    { at: '102:32:28', narrate: {
      title: 'TIG−35: the DSKY goes dark',
      body: '<p>At 35 seconds before ignition the task <code>TIG-35</code> sets the display index to <code>BLANKDEX</code>, and for five seconds every digit goes out. The listing explains why: “THE DSKY IS BLANKED FOR 5 SECONDS AT TIG-35 TO INDICATE THAT AVERAGE G IS STARTING.”</p><p>Watch the DSKY: when the numbers come back at TIG−30, <b>Average-G</b> — the powered-flight navigation that integrates accelerometer readings every 2 seconds — is running.</p>',
      anchors: ['scn.burn.tig35', 'scn.burn.blank'],
    } },
    { at: '102:32:31', spotlight: 'dsky' },
    say('camera-q'),
    say('camera-a'),

    { at: '102:32:36', narrate: {
      title: 'TIG−30: Average-G is running',
      body: '<p>The <code>TIG-30</code> task brings the countdown back and arms the rest of the sequence: <code>TIG-5</code> in 24.9 s, the ullage task <code>ULLGTASK</code> 22.40 s later (table entry 6), and <code>PREREAD</code>, which starts navigation.</p><p>From now on the waitlist task <b>READACCS</b> reads the accelerometers every 2 s and starts the <b>SERVICER</b> job (priority 20 octal). SERVICER is the heartbeat of the descent — remember its name; it is at the centre of the 1202 story.</p>',
      anchors: ['scn.burn.tig30', 'scn.servicer.readaccs'],
    } },
    { at: '102:32:44', hold: 3 },

    say('descent-armed'),
    { at: '102:32:52', narrate: {
      title: 'Descent armed',
      body: '<p>Armstrong arms the descent engine with a panel switch. The ignition routine never reads that switch — it only asks the crew for permission and then sends the ENGINE ON signal. Per the Apollo Lunar Surface Journal, arming also brought on the DSKY’s <b>ALT</b> and <b>VEL</b> lamps: the landing radar had no data for the computer yet.</p>',
    } },
    { at: '102:32:54', spotlight: 'dsky.light.alt' },

    // Ullage: 2240 cs after TIG−29.9 s = TIG−7.5 s = 102:32:57.5
    // (Mission Report Table 5-I: propellant-settling firing 102:32:58).
    { at: '102:32:57.5', narrate: {
      title: 'Ullage',
      body: '<p><code>ULLGTASK</code> — “THIS COMES AT TIG-7.5” — turns on ullage: the RCS thrusters push the LM gently forward so the propellants settle at the bottom of the tanks before the engine draws on them. Mission Report: propellant-settling firing at 102:32:58.</p>',
      anchors: ['scn.burn.ullage'],
    } },

    // TIG−5 = 102:33:00.0: flashing V99N62.
    { at: '102:33:00.2', narrate: {
      title: 'Verb 99: “please enable engine”',
      body: '<p>At TIG−5 the task <code>TIG-5</code> switches the display to <b>Verb 99 Noun 62</b>, flashing. The computer will not light the engine on its own: it waits for the crew. PRO means go; Verb 34 would terminate; ENTER would recycle the request.</p><p>Watch VERB flash — and Aldrin’s PRO key.</p>',
      anchors: ['scn.burn.tig5', 'scn.burn.v99'],
    } },
    { at: '102:33:00.5', spotlight: 'dsky.verb' },
    say('alt-light-on'),
    ...crewEvents(START, END),
    { at: '102:33:02.6', spotlight: 'dsky.key.pro' },
    say('proceed-cdr'),

    // TIG = 102:33:05.01.
    { at: '102:33:05.2', narrate: {
      title: 'Ignition: 102:33:05',
      body: '<p>At TIG the task <code>TIG-0</code> schedules the throttle-up for 26 s later, finds that the astronaut has answered (<code>ASTNFLAG</code>), and falls into <code>IGNITION</code>, which sets bit 13 of output channel 11: ENGINE ON. <code>P63IGN</code> then “ASSASSINATE[S] CLOKTASK” and puts up <b>Verb 06 Noun 63</b>: speed, altitude rate, altitude.</p><p>The engine starts at minimum thrust — “10 percent” by the crew’s call (the Mission Report measured 13 %).</p>',
      anchors: ['scn.burn.tig0', 'scn.burn.ignition', 'scn.burn.p63ign'],
    } },
    { at: '102:33:06', spotlight: 'dsky.noun' },
    say('proceed'),
    say('ignition-cdr'),
    say('ignition'),
    { at: '102:33:12', hold: 3 },

    { at: '102:33:13', narrate: {
      title: 'Twenty-six seconds of trim',
      body: '<p>For 26 seconds the engine stays at minimum thrust and guidance is <i>not</i> connected. Don Eyles explains why: the gimbals “moved to align the thrust vector with the spacecraft’s center of mass”. The ignition algorithm had already accounted for this trim period when it chose the ignition time (TIG = guidance start − ZOOMTIME).</p><p>Watch R3: about 50,000 feet, and slowly falling.</p>',
      anchors: ['scn.burn.p63ign'],
    } },
    { at: '102:33:15', spotlight: 'dsky.r3' },
    say('on-time'),
    say('throttle-up'),

    // ZOOM at nominal TIG + ZOOMTIME (26 s) = 102:33:31.
    { at: '102:33:31.2', narrate: {
      title: 'Throttle up',
      body: '<p><code>P63ZOOM</code> connects the landing guidance (<code>LUNLAND</code>) to every SERVICER pass and calls <code>FLATOUT</code>: “4096 PULSES”, more than the throttle can take, so the engine runs against its hardware stop — the <b>fixed throttle position</b>, about 9,800 lb of thrust. Mission Report: fixed throttle position at 102:33:31, “after 26 seconds”.</p><p>From here until the landing the computer flies the LM with this thrust and its attitude.</p>',
      anchors: ['scn.burn.zoom', 'scn.throttle.flatout'],
    } },
    { at: '102:33:32', spotlight: 'inst.throttle' },
    say('lost-them'),

    { at: '102:33:44', chapter: 'Why “Burn, Baby, Burn”?' },
    { at: '102:33:44', narrate: {
      title: 'The name and the mottos',
      body: '<p>A note added by the transcribers in 2009 records Don Eyles’ account: the name traces back to 1965 and the Los Angeles riots, inspired by the disc jockey <b>Magnificent Montague</b>, who shouted “Burn, baby! BURN!” when spinning the hottest new records.</p><p>The 1969 header is signed “CONCEIVED AND EXECUTED, AND (NOTA BENE) … MAINTAINED BY ADLER AND EYLES”, under the Garter motto <i>HONI SOIT QUI MAL Y PENSE</i> (“shamed be he who thinks evil of it”). Above the tables: <i>NOLI SE TANGERE</i> — a play on “touch me not”.</p>',
      anchors: ['scn.burn.naming', 'scn.burn.header'],
    } },
    { at: '102:33:50', hold: 5 },
    say('got-you-now'),
  ],
});
