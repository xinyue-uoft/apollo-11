// "P66 and touchdown": manual attitude, automatic throttle, every callout,
// the quantity light, contact, shutdown and P68. Research: web-timeline-b.md
// §1b (voice, MR event times), web-trajectory-b.md §1.3, §3, §5.2
// (propellant, touchdown), web-1202-b.md §5.3 (ROD switch).

import { defineScenario, say, rrFaultOn, alignedStart } from './lib.js';
import { crewEvents } from './crew-a11.js';

const START = alignedStart('102:43:00'); // on the flight's 2-s SERVICER grid (lib.js)
const END = '102:47:15';

export default defineScenario({
  id: 'p66-touchdown',
  title: 'P66 and touchdown',
  summary: 'The last two and a half minutes: Armstrong takes the attitude, the computer keeps the sink rate he dials in one foot per second at a time, Aldrin reads out height, rate and speed from the DSKY, the low-fuel light starts the count to “Bingo” — and at 102:45:40, “Contact Light”. Then shutdown, “413 is in”, “The Eagle has landed”, and P68 working out where they are.',
  software: 'Luminary099',
  vehicle: 'replay',
  track: 'apollo11Descent',
  start: START,
  end: END,
  initialProgram: 64,
  speed: 1,
  events: [
    { at: START, chapter: 'Low gate' },
    rrFaultOn(START),
    { at: START, focus: 'trajectory' },
    { at: '102:43:00.5', narrate: {
      title: '750 feet, and a boulder field',
      body: '<p>P64 is still flying the LM toward the computer’s landing site — and that site is in a field of boulders around West crater. The last of five program alarms came two seconds ago. Watch Aldrin’s callouts in the transcript: they are the DSKY’s numbers, altitude from R3 and descent rate from R2, and the LPD angle from R1.</p>',
      focus: 'trajectory',
    } },
    { at: '102:43:02', spotlight: 'trajectory.lm' },
    say('35-degrees'),
    ...crewEvents(START, END),
    say('okay-cdr'),
    say('700-feet'),
    say('rocky'),
    say('600-feet'),
    { at: '102:43:13.3', narrate: {
      title: 'ATT HOLD',
      body: '<p>Armstrong switches the PGNS mode control to <b>attitude hold</b> (Mission Report: 102:43:13, about 600 feet) and pitches nearly upright to fly on over the rocks. The guidance program keeps the throttle; GUILDENSTERN, the auto-modes monitor, watches for the next move.</p>',
      anchors: ['guid.guildenstern'],
    } },
    { at: '102:43:14', spotlight: 'crew' },
    say('going-to'),
    say('540-feet'),

    { at: '102:43:20', chapter: 'P66: rate of descent' },
    { at: '102:43:22.3', narrate: {
      title: 'P66: one foot per second per click',
      body: '<p>In attitude hold, one click of the <b>ROD</b> (rate of descent) switch makes <code>GUILDENSTERN</code> start <b>P66</b> (102:43:22, about 400 feet). P66 takes the present descent rate as its target; every click moves the target by 1 ft/s (pad load <code>RODSCALE</code>; up slows the descent, down speeds it). Each second <code>RODTASK</code> starts <code>RODCOMP</code>, which folds in the clicks, and the throttle holds the new rate while Armstrong flies the attitude by hand. His later clicks were not logged one by one; the replay follows the reconstructed trajectory.</p>',
      anchors: ['guid.guildenstern', 'p66.rodtask'],
    } },
    { at: '102:43:23', spotlight: 'crew.rod' },
    { at: '102:43:25', narrate: {
      title: 'Verb 06 Noun 60',
      body: '<p>The display is now <b>V06N60</b> (<code>VERTDISP</code>): R1 horizontal velocity, R2 altitude rate, R3 altitude. Aldrin’s “N forward” callouts start here. In P66 the display is refreshed by every <code>RODCOMP</code>, once a second instead of every two. Watch the three registers against his voice.</p>',
      anchors: ['p66.vertdisp'],
    } },
    { at: '102:43:25.5', spotlight: 'dsky.r1' },
    say('400-feet'),
    say('no-problem'),
    say('350-feet'),
    say('330-feet'),
    say('pegged'),
    say('300-feet'),
    { at: '102:43:47', narrate: {
      title: 'Looking for a place',
      body: '<p>Armstrong flies on past the boulders looking for a clear spot, slowing as he goes. In the end he set Eagle down about 1,100 feet beyond the point the automatic landing would have reached (Mission Report). Below 500 feet the landing took about 2½ minutes; the nominal automatic plan allowed 104 seconds.</p>',
    } },
    say('270-feet'),
    say('fuel-q'),
    say('eight-percent'),
    say('good-area'),
    say('shadow'),
    say('250-feet'),

    // LR data not good 102:44:11–21 (Mission Report Table 5-I).
    { at: '102:44:11.3', narrate: {
      title: 'ALT and VEL lights',
      body: '<p>At about 240 feet the landing radar briefly loses its signal — a zero-Doppler condition while Armstrong maneuvers (Mission Report) — and the computer lights the DSKY’s <b>ALT</b> and <b>VEL</b> lamps: “no good radar data”. It keeps navigating with its accelerometers. The lamps go out again at 102:44:21.</p>',
    } },
    { at: '102:44:12', spotlight: 'dsky.light.alt' },
    say('alt-vel-lights'),
    say('220-feet'),
    say('11-forward'),
    say('200-feet'),
    say('that-crater'),
    say('5-5-down'),

    // Low-level light 102:44:28 (Mission Report Table 5-I; §9.8: 102:44:30.4).
    { at: '102:44:28.3', chapter: 'Quantity light' },
    { at: '102:44:28.3', narrate: {
      title: 'The low-level light',
      body: '<p>A sensor in a descent tank uncovers — about 5.6 % left — and the <b>DESCENT QUANTITY</b> light comes on (a panel caution light, not the computer). In Houston it starts a count of about 94 seconds to “<b>Bingo</b>”: from then on, land within 20 seconds or abort. Propellant slosh tripped it early, by roughly 20 seconds; Eagle actually had more than the light implied.</p>',
    } },
    { at: '102:44:29', spotlight: 'inst.fuel' },
    say('good-spot'),
    say('160-feet'),
    say('9-forward'),
    say('120-feet'),
    say('100-feet'),
    say('75-feet'),
    say('sixty-seconds'),
    { at: '102:45:03', narrate: {
      title: '“60 seconds”',
      body: '<p>Duke’s call is the time left to Bingo, not to empty tanks. At engine cutoff about 45 seconds of firing time remained (Mission Report §9.8). The radar drops out once more at about 75 feet (102:44:59 – 102:45:03), and Aldrin calls the lamp.</p>',
    } },
    say('vel-light'),
    say('60-feet'),
    say('dust'),
    say('30-feet'),
    say('4-forward'),
    say('thirty-seconds'),
    say('drifting-forward'),

    // Touchdown 102:45:39.9 (Mission Report §5.4).
    { at: '102:45:39', chapter: 'Contact' },
    say('contact-light'),
    { at: '102:45:40.2', narrate: {
      title: 'Contact light',
      body: '<p>A probe below a footpad touches the surface and the blue <b>LUNAR CONTACT</b> lights come on — panel lights, not the DSKY. Touchdown: <b>102:45:39.9</b>, 1.7 ft/s down, 2.1 ft/s sideways (Mission Report). The engine is cut at 102:45:41.4, after 756 seconds of burning. About 770 pounds of propellant were left.</p>',
    } },
    { at: '102:45:41', hold: 4 },
    say('shutdown'),
    say('engine-stop'),
    say('aca-detent'),
    say('detent-auto'),
    say('413-is-in'),
    { at: '102:45:48', narrate: {
      title: '“413 is in”',
      body: '<p>The post-landing switch list: mode controls to auto, engine command override off, engine arm off. “413 is in” is not the AGC at all: Aldrin has keyed address 413 into the <b>Abort Guidance System</b>, the LM’s backup computer: +10000 at address 413 is its lunar-surface flag (O’Brien, in the Apollo Lunar Surface Journal).</p>',
    } },
    say('copy-you-down'),
    say('engine-arm-off'),
    say('eagle-has-landed'),
    { at: '102:46:00', hold: 5 },
    say('breathing-again'),
    say('thank-you'),
    say('looking-good-here'),
    say('busy'),
    say('smooth-touchdown'),

    { at: '102:46:40', chapter: 'P68' },
    { at: '102:46:41', narrate: {
      title: 'P68: “now look where you ended up”',
      body: '<p>P68, landing confirmation, is selected with Verb 37 — when the crew keyed it is not recorded; here it is illustrative. <code>LANDJUNK</code> sets the surface flag, computes latitude, longitude and altitude of the landing site from the navigated state, and flashes <b>V06N43</b>, under the comment “ASTRONAUT: NOW LOOK WHERE YOU ENDED UP”. Eagle was about 6.6 km beyond its target, mostly because of the 21,000-foot navigation error at PDI.</p>',
      anchors: ['p68.entry', 'scn.v37.table'],
    } },
    { at: '102:46:52', spotlight: 'dsky.noun' },
    say('stay-t1'),
    say('understand-stay'),
  ],
});
