// "P63: the braking phase", from just after ignition to high gate.
// The alarms happen here too (same crew keystrokes, same radar drain as the
// real flight) but are only flagged; the 1202 scenario tells their story.
// Research: src-ignition.md §6, §13 (SERVICER), web-trajectory-b.md §3–4
// (milestones, guidance targets), web-timeline-b.md (voice).

import { defineScenario, say, rrFaultOn, alignedStart } from './lib.js';
import { crewEvents } from './crew-a11.js';

const START = alignedStart('102:33:10'); // on the flight's 2-s SERVICER grid (lib.js)
const END = '102:41:40';

export default defineScenario({
  id: 'p63-braking',
  title: 'P63: the braking phase',
  summary: 'Eight and a half minutes of braking, from 50,000 feet and 5,560 ft/s to “high gate” at 7,000 feet: how SERVICER navigates every 2 seconds, how the quadratic guidance solves for time-to-go, why the LM rolls over to face up, what the landing radar’s ΔH of −2,900 feet meant, Verb 57, and the throttle-down that came right on time.',
  software: 'Luminary099',
  vehicle: 'replay',
  track: 'apollo11Descent',
  start: START,
  end: END,
  initialProgram: 63,
  speed: 2,
  events: [
    { at: START, chapter: 'Braking' },
    rrFaultOn(START),
    { at: START, focus: 'trajectory' },
    { at: '102:33:10.5', narrate: {
      title: 'P63: kill the orbital speed',
      body: '<p>Eagle lit its descent engine at 102:33:05, about 260 nautical miles before the landing site, at 50,000 feet and 5,560 ft/s. The braking phase, program <b>P63</b>, has one job: take off most of that speed as efficiently as possible, and deliver the LM to <b>high gate</b>, about 7,000 feet up and 4½ nautical miles from the site, about 8½ minutes later.</p><p>The DSKY shows <b>V06N63</b>: R1 speed, R2 altitude rate, R3 altitude. The Trajectory tab draws the path.</p>',
      anchors: ['p63.entry'],
      focus: 'trajectory',
    } },
    { at: '102:33:12', spotlight: 'trajectory' },
    { at: '102:33:18', hold: 3 },
    say('on-time'),
    say('throttle-up'),
    { at: '102:33:31.2', narrate: {
      title: 'Full throttle',
      body: '<p>Twenty-six seconds after ignition <code>P63ZOOM</code> connects guidance and drives the throttle to its stop, the <b>fixed throttle position</b> (about 9,800 lb). For most of P63 the engine stays there: guidance steers by pointing the thrust, not by throttling. (The ignition itself is the subject of <i>Burn, Baby, Burn</i>.)</p>',
      anchors: ['burn.zoom', 'throttle.flatout'],
    } },
    { at: '102:33:32', spotlight: 'inst.throttle' },

    { at: '102:33:40', chapter: 'Every two seconds' },
    { at: '102:33:40', narrate: {
      title: 'SERVICER: navigation every 2 seconds',
      body: '<p>Every 2 seconds the waitlist task <code>READACCS</code> reads the accelerometers (PIPAs) and starts the <b>SERVICER</b> job. SERVICER runs <b>Average-G</b>: it adds the measured velocity change and integrates position with gravity averaged over the 2-second step. Then it exits into <code>LUNLAND</code>: guidance, then <code>THROTTLE</code>, then the attitude command, then <code>DISPEXIT</code>, which puts V06N63 back on the DSKY.</p><p>On the Executive tab you can see SERVICER appear every 2 seconds.</p>',
      anchors: ['servicer.readaccs', 'guid.lunland', 'guid.dispexit'],
    } },
    { at: '102:33:44', focus: 'exec' },
    { at: '102:33:45', spotlight: 'exec.coresets' },
    { at: '102:33:52', hold: 3 },
    { at: '102:33:56', focus: 'trajectory' },
    { at: '102:33:56', narrate: {
      title: 'Quadratic guidance and TTF/8',
      body: '<p>The guidance law (Allan Klumpp’s) aims at a <b>target</b>: a position, velocity, acceleration and jerk a little beyond high gate. Each pass it first solves for <b>time-to-go</b> — the time at which a smooth trajectory from here meets the target — a cubic equation solved by Newton’s method. The code carries it as <code>TTF/8</code> — time-to-go divided by 8, a scaling for the computer’s fixed-point arithmetic.</p><p>Then <code>QUADGUID</code> computes the acceleration needed to stay on that trajectory.</p>',
      anchors: ['guid.ttf8cl', 'guid.quadguid', 'guid.tables'],
    } },
    { at: '102:34:06', hold: 3 },
    { at: '102:34:10', speed: 8 },
    say('got-you-now'),
    say('rod-good'),
    say('everything-good'),
    say('two-minutes'),
    say('ags-pgns'),
    { at: '102:35:20', speed: 2 },

    { at: '102:35:30', chapter: 'Long, and rolling over' },
    say('slew'),
    { at: '102:35:40', narrate: {
      title: 'An innocent switch',
      body: '<p>“You’re Slew? Okay.” The rendezvous-radar switch moves from AUTO TRACK to SLEW. MIT’s software team did not know (Cherry) that in both positions the radar’s angle counters were quietly stealing about 13 % of the computer’s memory cycles. In this braking phase there is still enough spare time — but remember the striped slice on the Executive tab. <i>1202: the Executive overflow</i> tells what happened next.</p>',
    } },
    { at: '102:35:42', focus: 'exec' },
    { at: '102:35:43', spotlight: 'exec.steal' },
    { at: '102:35:52', focus: 'trajectory' },
    say('three-min-early'),
    say('little-long'),
    { at: '102:36:20', narrate: {
      title: '“A little long”',
      body: '<p>Armstrong timed landmarks through the window: Eagle passed them about 3 seconds early. The computer’s position at PDI was about 21,000 feet uprange of the truth (Mission Report). The landing radar will correct altitude and velocity — but not position along the track, so Eagle will land about 6.6 km (4 miles) beyond the planned site.</p>',
    } },
    { at: '102:36:22', spotlight: 'trajectory.site' },
    say('rolling-over'),
    { at: '102:36:50', narrate: {
      title: 'Yaw-around: face up',
      body: '<p>Until now the crew rode face down, windows toward the surface, to time landmarks. Now Armstrong yaws the LM 180° about the thrust axis to <b>face up</b>, so the landing radar’s beams can reach the ground. It went slowly: the rate-scale switch had been left at 5 °/s instead of 25 (Mission Report: in progress 102:36:57, complete 102:37:59).</p>',
    } },
    say('go-continue'),

    { at: '102:37:45', chapter: 'Radar' },
    { at: '102:37:51.2', narrate: {
      title: 'Landing radar: data good',
      body: '<p>At 102:37:51, about 37,000 feet up, the landing radar reports good data and the <b>ALT</b> lamp goes out. The radar measures height above the actual ground; the computer has been flying on its own estimate carried down from orbit. The difference, <b>ΔH</b>, is about −2,900 feet (Mission Report: about 2,800).</p><p>The computer will not use the radar until the crew says so: <b>Verb 57</b>.</p>',
      anchors: ['scn.noun.n68', 'lr.v57'],
    } },
    { at: '102:37:52', spotlight: 'dsky.light.alt' },
    ...crewEvents(START, END),
    say('lock-on'),
    say('delta-h'),
    { at: '102:38:12', narrate: {
      title: 'Verb 16 Noun 68',
      body: '<p>Aldrin has keyed <b>V16N68</b>, a once-a-second monitor: R1 slant range to the landing site, R2 time to go in the braking phase, R3 <b>ΔH</b>, radar altitude minus computed altitude. In Luminary 099 this is the only display of ΔH — a later version moved it into Noun 63 — so Aldrin has to run it as a monitor, refreshed every second. Watch R3.</p>',
      anchors: ['scn.noun.n68'],
    } },
    { at: '102:38:13', spotlight: 'dsky.r3' },
    say('looking-at-dh'),
    { at: '102:38:22.5', narrate: {
      title: 'Program alarm',
      body: '<p>The PROG lamp: a <b>1202</b>, “Executive overflow — no core sets”. The computer restarts its software in milliseconds and flies on; the monitor is gone and V06N63 is back. Houston will say go 31 seconds later. The whole story — and the second alarm at 102:39:02 — is in <i>1202: the Executive overflow</i>.</p>',
      anchors: ['exec.nextcore'],
    } },
    { at: '102:38:23', spotlight: 'dsky.light.prog' },
    say('program-alarm'),
    say('its-1202'),
    say('give-reading'),
    { at: '102:38:46', narrate: {
      title: 'Verb 57: let the radar in',
      body: '<p>Aldrin keys <b>Verb 57</b> (Mission Report: 102:38:45): <code>LRON</code> sets the flag that lets SERVICER incorporate radar data. Each pass now moves the computed altitude part of the way toward the radar’s — the lower the LM, the more weight the radar gets — and from 102:38:50, below 2,000 ft/s, the radar’s velocities are blended in too. ΔH converged in about 30 seconds.</p>',
      anchors: ['lr.v57'],
    } },
    say('go-on-alarm'),
    say('six-plus-25'),
    say('same-alarm'),
    say('monitor-dh'),
    say('beautifully'),

    { at: '102:39:28', chapter: 'Throttle recovery' },
    { at: '102:39:31.2', narrate: {
      title: 'Throttle down — on time',
      body: '<p>So far the engine has been at its fixed maximum. Each pass, <code>THROTTLE</code> compares the thrust guidance asks for with a pad-loaded threshold (about 5,985 lb, 57 %). At 102:39:31 the demand drops below it, and the throttle comes back into the throttleable range — the “throttle recovery”, 386 s after ignition against 384 s predicted. From now on the throttle moves every pass.</p>',
      anchors: ['throttle.regions'],
    } },
    { at: '102:39:32', spotlight: 'inst.throttle' },
    say('wow-throttle-down'),
    say('throttle-down-on-time'),
    say('feel-it'),
    { at: '102:39:44', speed: 8 },
    say('seven-minutes'),
    say('descent-2'),
    { at: '102:40:56', speed: 2 },
    say('switchover'),
    { at: '102:41:03', narrate: {
      title: 'Asking the ground',
      body: '<p>Aldrin needs the time to go until P64 — which is in R2 of Noun 68. But both alarms came with V16N68 up, so he asks Houston instead (O’Brien, in the Apollo Lunar Surface Journal). Grumman’s post-flight memo notes that the guidance officer recognised monitor verbs as a significant load, and the ground offered to watch the altitudes for the crew.</p>',
    } },
    say('at-7000'),
    say('thirty-to-p64'),
    say('eight-thirty'),

    { at: '102:41:30', chapter: 'High gate' },
    { at: '102:41:32.3', narrate: {
      title: 'High gate: P64',
      body: '<p>When the time-to-go of the braking target falls to about 62 seconds (<code>TENDBRAK</code>), guidance switches to the approach targets: <code>STARTP64</code>. PROG reads <b>64</b>. Mission Report: 102:41:32, 7,129 feet, coming down at 125 ft/s. The LM pitches toward upright so the crew can see the landing area through the window, and a flashing V06N64 appears — the next chapter.</p>',
      anchors: ['p64.entry', 'guid.tables'],
    } },
    { at: '102:41:33', spotlight: 'dsky.prog' },
    say('p64'),
  ],
});
