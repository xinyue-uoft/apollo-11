// "Columbia's SPS burn": Lunar Orbit Insertion LOI-1, Comanche 055 P40.
// Runs on engineer D2's CM programs (js/agc/programs/cm/p40.js) and SPS
// vehicle (js/vehicle/cm-sps.js): `setup` loads the LOI-1 PAD and starts P40
// in its countdown stage, as the "LOI-1 burn" interactive preset does.
//
// Times: PAD TIG 075:49:49.65 (AFJ, read up at 072:51:24); Mission Report
// Table 8.6-II: ignition 075:49:50.37, cutoff 075:55:47.90, 357.53 s; Table
// 7-V: ΔV 2,917.5 ft/s, orbit 169.7 × 60.0 nmi (research src-comanche §3).
// The model ignites at the PAD TIG once PRO was given (the code's rule:
// Comanche055/P40-P47.agc:503-516); the 0.7 s difference to the Mission
// Report's ignition time is not explained by the sources we have.
// Voice: AFJ, Columbia's onboard tape (transcript-a11.js).

import { defineScenario, say, keysEndingAt } from './lib.js';
import { setupLoi1 } from '../../data/presets-cm.js';

const START = '075:48:30';
const END = '075:56:45';

export default defineScenario({
  id: 'cm-loi',
  title: 'Columbia’s SPS burn: Lunar Orbit Insertion',
  summary: 'Behind the Moon, out of contact with Earth, Columbia’s computer — Comanche 055 — fires the Service Module’s big engine for almost six minutes to put Apollo 11 into lunar orbit. Watch program P40 count down on Verb 06 Noun 40, blank the DSKY, flash Verb 99 for Collins’ PRO, steer the 20,500-lb SPS every two seconds, shut it down on time and show the residuals that made Collins take back “any bad things I ever said about MIT”.',
  software: 'Comanche055',
  vehicle: 'cmSps',
  vehicleOptions: { initial: 'loi1' },
  start: START,
  end: END,
  initialProgram: null,
  // Deterministic: PAD into erasable memory, P40 started at its countdown
  // (the director re-runs setup whenever it resets the simulation).
  setup: (sim) => setupLoi1(sim, { stage: 'countdown' }),
  speed: 1,
  events: [
    { at: START, chapter: 'Columbia' },
    { at: START, focus: 'ignition' },
    { at: '075:48:30.5', narrate: {
      title: 'Lunar Orbit Insertion',
      body: '<p>Apollo 11 is behind the Moon, out of radio contact since 075:41:23, coming in too fast to stay. The Command Module’s computer runs <b>Comanche 055</b>, and the program is <b>P40</b>, SPS thrusting. Houston read up the burn earlier: ignition at 075:49:49.65, 2,917.3 ft/s, 6 minutes 2 seconds.</p><p>The DSKY shows <b>Verb 06 Noun 40</b>: R1 time from ignition (minutes and seconds), R2 the velocity still to be gained, R3 the velocity gained so far.</p>',
      anchors: ['cm.p40.header', 'cm.info.noun40'],
      focus: 'ignition',
    } },
    { at: '075:48:32', spotlight: 'dsky' },
    say('loi-proceed-on-99'),
    { at: '075:48:40', narrate: {
      title: 'Not BURNBABY',
      body: '<p>The LM’s ignition routine is table-driven; Comanche’s P40 runs its own countdown, with the same rhythm: <code>TIGBLNK</code> blanks the DSKY at TIG−35 s, <code>TIGAVEG</code> starts Average-G at TIG−30 s, <code>TIG-5</code> flashes Verb 99, and <code>TIG-0</code> lights the engine only if the crew has said yes. The CM computer also has one core set fewer than the LM: <code>NO.CORES DEC 6</code>, seven sets.</p>',
      anchors: ['cm.p40.countdown', 'cm.p40.tigblnk', 'cm.exec.coresets'],
    } },
    { at: '075:48:48', hold: 4 },
    { at: '075:48:55', narrate: {
      title: 'A countdown that runs every second',
      body: '<p><code>CLOKTASK</code> is a waitlist task that re-arms itself every second; each time its job computes <code>TTOGO = TIME2 − TIG</code> and refreshes the display chosen by <code>NVWORD1</code>: V06N40, nothing, V99 or V97. Watch R1 count down and R2, the velocity to be gained — the whole burn, 2,917 ft/s, is still ahead.</p>',
      anchors: ['cm.p40.clock', 'cm.p40.clockjob'],
    } },
    { at: '075:48:57', spotlight: 'dsky.r1' },

    // TIGBLNK at TIG − 29.96 − 5.00 = 075:49:14.69.
    { at: '075:49:13', chapter: 'TIG−35' },
    say('loi-dsky-blank'),
    { at: '075:49:15', narrate: {
      title: 'TIG−35: blank',
      body: '<p><code>TIGBLNK</code> clears <code>NVWORD1</code> and starts a job that blanks the whole DSKY, then schedules <code>TIGAVEG</code> five seconds later. Armstrong calls it: “35 seconds; DSKY’s blank”. As in the LM, the dark display tells the crew the computer is about to start measuring the burn.</p>',
      anchors: ['cm.p40.tigblnk'],
    } },
    { at: '075:49:16', spotlight: 'dsky' },
    { at: '075:49:20', narrate: {
      title: 'TIG−30: Average-G',
      body: '<p><code>TIGAVEG</code> — “UNBLANK DISPLAY” — puts V06N40 back, schedules <code>TIG-5</code> in 24.96 s and starts navigation through <code>PREREAD</code>: from now on SERVICER reads the accelerometers every 2 seconds. Before ignition its exit, <code>STEERING</code>, only updates the velocity to be gained.</p>',
      anchors: ['cm.p40.tigaveg', 'cm.servicer.readaccs'],
    } },
    say('loi-splendor'),
    say('loi-plaster'),
    say('loi-8-seconds'),

    // TIG−5 = 075:49:44.65.
    { at: '075:49:44.8', narrate: {
      title: 'Verb 99 Noun 40',
      body: '<p><code>TIG-5</code>: “WILL CAUSE V99 FLASH”. The clock job now pastes Verb 99 over the countdown, flashing: <i>please enable engine</i>. It also starts <code>S40.13</code>, which works out how long the burn will be. PRO sets the astronaut flag; ENTER would skip the SPS burn; Verb 34 would end P40. The Flight Journal: “during those 5 seconds, pressing the Proceed key confirms that the burn should go ahead on time.”</p>',
      anchors: ['cm.p40.tig5', 'cm.p40.engreqst', 'cm.p40.v99p'],
    } },
    { at: '075:49:45', spotlight: 'dsky.verb' },
    say('loi-99'),
    keysEndingAt('075:49:46', 'P', 'Collins'),
    { at: '075:49:46.1', spotlight: 'dsky.key.pro' },
    say('loi-standby-tig'),

    // TIG = 075:49:49.65 in the model.
    { at: '075:49:50', narrate: {
      title: 'SPSON',
      body: '<p><code>TIG-0</code> finds the astronaut flag (“CHECK ASTN FLAG FOR V99 RESPONSE”) and falls into <code>IGNITION</code>; <code>SPSON</code> — <code>CAF BIT13 / WOR DSALMOUT</code>, “TURN ON SPS ENGINE”. The engine gives 20,500 lb (<code>FENG</code>). After “0.4 SECOND DELAY FOR THRUST BUILDUP” the thrust-vector-control autopilot takes over; at 2 s steering starts and the RCS jets are switched off. (Mission Report: ignition 075:49:50.37.)</p>',
      anchors: ['cm.p40.tig0', 'cm.p40.spson', 'cm.p40.dotvcon', 'cm.p40.feng'],
      focus: 'ignition',
    } },
    say('loi-burning'),
    say('loi-chamber'),
    say('loi-steering'),
    { at: '075:50:05', narrate: {
      title: 'Steering every 2 seconds',
      body: '<p>Each SERVICER pass runs <code>STEERING</code> → <code>S40.8</code>: subtract the measured velocity change from the velocity to be gained, compute the time to go from the SPS exhaust velocity, and steer to null the error. P40 then writes <code>TIG := PIPTIME + TGO</code> — so R1 now counts down to <i>cutoff</i>, R2 falls in 2-second steps and R3 climbs.</p>',
      anchors: ['cm.p40.steering', 'cm.p40.s408', 'cm.p40.tgocalc'],
    } },
    { at: '075:50:07', spotlight: 'dsky.r2' },
    { at: '075:50:14', hold: 3 },
    { at: '075:50:18', chapter: 'Six minutes' },
    { at: '075:50:18', narrate: {
      title: 'The longest burn',
      body: '<p>This was the longest engine firing of the mission: 357.5 seconds (Mission Report). We fast-forward at 8× while the computer steers and the crew watch the chamber pressure and the propellant gauges. The spacecraft gets lighter by about 64 lb every second (the code’s <code>3MDOT</code> comment: 63.8 lb/s), so the same thrust pushes it harder and harder.</p>',
      anchors: ['cm.p40.feng'],
    } },
    { at: '075:50:20', speed: 8 },
    { at: '075:55:28', speed: 1 },
    { at: '075:55:30', chapter: 'Cutoff' },
    say('loi-10-seconds'),
    say('loi-count'),
    { at: '075:55:43', narrate: {
      title: 'The last four seconds',
      body: '<p>When the time to go falls below four seconds (<code>FOURSEC</code>), <code>S40.81</code> stops steering and holds attitude, and the next pass schedules <code>ENGINOFF</code> on the waitlist for exactly the time remaining — a timed cutoff, not a measured one. Collins counts the seconds down aloud.</p>',
      anchors: ['cm.p40.s4081', 'cm.p40.steering'],
    } },
    say('loi-shutdown'),
    { at: '075:55:50', narrate: {
      title: 'Shutdown',
      body: '<p><code>SPSOFF</code> clears channel 11 bit 13. After a “2.5 SECOND DELAY FOR SPS TAILOFF” the RCS autopilot is back and <code>POSTBURN</code> flashes <b>Verb 16 Noun 40</b> with the final numbers. Mission Report: cutoff 075:55:47.90 after 357.53 s; 2,917.5 ft/s gained; orbit 169.7 by 60.0 nautical miles. Apollo 11 is in lunar orbit. (The simulator, which ignites at the PAD time, cuts off about a second earlier.)</p>',
      anchors: ['cm.p40.enginoff', 'cm.p40.spsoff', 'cm.p40.postburn'],
    } },
    { at: '075:55:52', spotlight: 'dsky.verb' },
    { at: '075:55:56', hold: 4 },
    say('loi-residuals'),
    // PRO on the flashing V16N40 (AFJ: "Look at the residuals. Proceed.";
    // who pressed it is not recorded — illustrative, inferred).
    keysEndingAt('075:56:18', 'P', 'Collins'),
    say('loi-no-trim'),
    { at: '075:56:21', narrate: {
      title: 'Residuals: Noun 85',
      body: '<p>PRO leads to <code>TIGNOW</code>: flashing <b>Verb 16 Noun 85</b>, the velocity still to be gained in the spacecraft’s own axes — the residuals, which the crew could trim with the RCS. Collins reads “minus 1, minus 1, plus 1”: tenths of a foot per second, −0.1, −0.1, +0.1. Not worth trimming. The simulator’s simpler engine model leaves slightly different residuals on its display.</p>',
      anchors: ['cm.p40.tignow', 'cm.info.noun85', 'cm.p40.calcn85'],
    } },
    { at: '075:56:22', spotlight: 'dsky.r1' },
    say('loi-minus-1'),
    say('loi-mit'),
    { at: '075:56:31', hold: 4 },
    say('loi-ems'),
    { at: '075:56:38', narrate: {
      title: 'Three burns, one program',
      body: '<p>P40 flew all three of Columbia’s big burns: this LOI-1; LOI-2 at 080:11:36, 16.9 seconds to round off the orbit; and the trans-Earth injection at 135:23:42, 151.4 seconds, for home. Next: the Lunar Module’s computer, Luminary 099, and the powered descent — start with <i>Burn, Baby, Burn</i>.</p>',
    } },
  ],
});
