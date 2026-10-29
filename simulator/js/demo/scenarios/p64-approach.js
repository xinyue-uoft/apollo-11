// "P64: approach and the landing point designator", high gate to the
// switch to P66. Research: web-1202-b.md §5.2–5.3 (LPD, Cherry's DSKY log),
// web-trajectory-b.md §4.4 (LPD angles, increments), web-timeline-b.md.

import { defineScenario, say, rrFaultOn, alignedStart, A11_AGC_OPTIONS } from './lib.js';
import { crewEvents } from './crew-a11.js';

const START = alignedStart('102:41:20'); // on the flight's 2-s SERVICER grid (lib.js)
const END = '102:43:30';

export default defineScenario({
  id: 'p64-approach',
  title: 'P64: approach and the landing point designator',
  summary: 'From high gate at 7,000 feet to 400 feet: the LM pitches up so the crew can see where the computer is taking them, the flashing Verb 06 Noun 64 offers the landing point designator, Aldrin calls “47 degrees”, Armstrong sees a crater ringed with boulders — and three more program alarms come and go before he takes over.',
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
    { at: START, chapter: 'High gate' },
    rrFaultOn(START),
    { at: START, focus: 'trajectory' },
    { at: '102:41:20.5', narrate: {
      title: 'The approach phase',
      body: '<p>Eagle is about 8,000 feet up, still braking hard, about 4 nautical miles from the site the computer is aiming at. At <b>high gate</b> guidance switches to <b>P64</b>, the approach phase: new targets near the landing site, a steeper, slower path, and the LM pitched up far enough that the commander can see, through his window, the spot the computer is heading for. For about two minutes he can move it.</p>',
      focus: 'trajectory',
    } },
    { at: '102:41:22', spotlight: 'trajectory' },
    say('eight-thirty'),
    { at: '102:41:28', hold: 3 },

    { at: '102:41:32.3', narrate: {
      title: 'Flashing V06N64',
      body: '<p>PROG 64 (Mission Report: 102:41:32, 7,129 ft). The display is <b>Verb 06 Noun 64</b>, flashing. R1 holds two numbers: the seconds left in which a redesignation is allowed, and the <b>LPD angle</b> in degrees; R2 is the altitude rate, R3 the altitude.</p><p>The flash asks a question: “may I accept landing-point redesignations?” Until the crew presses PRO, <code>P64DISPS</code> re-posts the flashing display on every pass.</p>',
      anchors: ['p64.entry', 'p64.disps'],
    } },
    { at: '102:41:33', spotlight: 'dsky.r1' },
    say('p64'),
    say('copy-p64'),
    { at: '102:41:40', narrate: {
      title: 'How the LPD works',
      body: '<p>The commander’s window carries a scale of angles. With his eye on the reticle, the LPD angle in R1 tells him where on that scale the computer’s landing site appears. Don’t like it? Each click of the hand controller moves the aim: fore or aft by half a degree of look angle (farther or nearer), left or right by 2° (<code>ELEACH</code>, <code>AZEACH</code>). The task <code>REDESMON</code> counts the clicks; the next guidance pass moves the target, until the redesignation time in R1 runs out.</p>',
      anchors: ['p64.countem'],
    } },
    { at: '102:41:42', spotlight: 'crew.lpd' },
    { at: '102:41:50', hold: 3 },
    say('attitude-check'),
    say('nine-minutes'),
    ...crewEvents(START, END),
    { at: '102:41:54', narrate: {
      title: 'A handling check',
      body: '<p>Armstrong flips the PGNS mode switch to <b>ATT HOLD</b> for ten seconds (Mission Report: 102:41:53 to 102:42:03) to feel the LM’s response by hand, then back to AUTO. Note the crew has still not pressed PRO on the flashing Noun 64.</p>',
    } },
    say('manual-good'),
    say('go-for-landing'),
    say('3000-at-70'),
    say('understand-go'),

    { at: '102:42:16', chapter: 'Alarms again' },
    { at: '102:42:18.4', narrate: {
      title: '1201',
      body: '<p>A <b>1201</b> — Executive overflow, no VAC areas. In P64 the essential software alone left less than 10 % spare time, and with the radar CDUs still stealing about 13 %, SERVICER copies stack up; the flashing display’s job needs a VAC area too. The software restart flushes the queue and the computer flies on. Houston: “Same type. We’re Go.” (Details: <i>1202: the Executive overflow</i>.)</p>',
      anchors: ['exec.findvac.1201', 'exec.job.makeplay'],
    } },
    { at: '102:42:18.6', spotlight: 'dsky.light.prog' },
    say('copy-3000'),
    say('program-alarm-1201'),
    say('1201-cdr'),
    say('go-1201'),
    say('2000-feet'),
    say('give-lpd'),
    { at: '102:42:33.2', narrate: {
      title: '“Give me an LPD”',
      body: '<p>At 2,000 feet Armstrong asks for the angle, and Aldrin — who has just read the alarm code and pressed <b>PRO</b> on the flashing Noun 64 (Cherry’s DSKY log: 102:42:33) — reads it from R1: <b>47 degrees</b>. Sighting along 47° on his window, Armstrong can see where the computer is taking them: toward a crater surrounded by a field of boulders — West crater (ALSJ commentary). “Pretty rocky area,” he says at 700 feet.</p>',
      anchors: ['p64.disps'],
    } },
    say('lpd-47-a'),
    say('give-lpd-2'),
    say('roger-lpd'),
    say('lpd-47-b'),
    say('not-bad-area'),
    say('looking-great-go'),
    { at: '102:42:43.4', narrate: {
      title: '1202, and again 1202',
      body: '<p>Two more Executive overflows follow, both <b>1202</b> (no core sets): at 102:42:43 and 102:42:58, at about 1,400 and 770 feet. Aldrin reads the first with V05N09 (Cherry: 102:42:45). Each restart takes a fraction of a second; guidance, throttle and the LPD display come straight back. PROG stays lit after the last one: when the crew cleared it is not recorded.</p>',
      anchors: ['exec.nextcore'],
    } },
    { at: '102:42:43.6', spotlight: 'dsky.light.prog' },
    say('1000-at-30'),
    say('copy-1202'),
    say('35-degrees'),
    say('okay-cdr'),
    say('700-feet'),
    { at: '102:43:09', narrate: {
      title: 'One redesignation',
      body: '<p>The telemetry logs one landing-point redesignation at 102:43:09. Armstrong said later he did not use the LPD to redesignate; Eyles calls it “apparently one inadvertent redesignation”. We do not replay it: its direction is not recorded. Four seconds later it could not have happened at all: in attitude hold <code>COUNT’EM</code> skips the redesignation logic (“ARE WE IN ATTITUDE-HOLD?”).</p>',
      anchors: ['p64.countem'],
    } },
    say('rocky'),
    say('600-feet'),
    { at: '102:43:13.3', narrate: {
      title: 'Attitude hold: Armstrong takes over',
      body: '<p>At about 600 feet (Mission Report: 102:43:13) Armstrong switches to <b>ATT HOLD</b> and flies the attitude himself, pitching almost upright (from about 18° to 5°) so that the LM keeps its forward speed and flies on over the boulder field; the computer still runs the throttle. Eyles notes that this also eased the computer’s load, “forestalling the next alarm”. Ten seconds later, one click of the rate-of-descent switch starts <b>P66</b>.</p>',
      anchors: ['guid.guildenstern'],
    } },
    { at: '102:43:14', spotlight: 'crew' },
    say('going-to'),
    say('540-feet'),
    { at: '102:43:22.3', spotlight: 'dsky.prog' },
    say('400-feet'),
  ],
});
