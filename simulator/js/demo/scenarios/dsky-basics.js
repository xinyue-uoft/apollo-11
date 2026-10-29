// "Meet the DSKY": an ILLUSTRATION, not a historical replay. The clock is
// parked in the coast before powered descent, the vehicle does not move, and
// every keystroke is ours — chosen to show the verb–noun language and the
// PINBALL code behind it. Research: web-dsky-b.md §3 (lamp test 5.00 s,
// flashing, RSET), src-executive.md §8 (V05N09, RSET), the listings.

import { defineScenario, keysEndingAt } from './lib.js';

const START = '102:00:00';
const END = '102:03:00';

export default defineScenario({
  id: 'dsky-basics',
  title: 'Meet the DSKY',
  summary: 'An illustrated tour of the Apollo Guidance Computer’s display and keyboard — not a replay of real events. Learn the verb–noun language, watch the lamp test, monitor the computer’s clock, read the alarm registers the way Aldrin did during the landing, make an operator error on purpose, and change programs with Verb 37, while the source panel shows the PINBALL code that handles every key.',
  software: 'Luminary099',
  vehicle: 'static',
  start: START,
  end: END,
  initialProgram: 0,
  speed: 1,
  events: [
    { at: START, chapter: 'The DSKY' },
    { at: '102:00:00.5', narrate: {
      title: 'Meet the DSKY',
      body: '<p><i>This chapter is an illustration, not a historical replay: nothing here happened at these times.</i></p><p>The <b>DSKY</b> (“disky”, display and keyboard) was the crew’s window into the Apollo Guidance Computer. On the left, status and caution lamps. On the right, green electroluminescent digits: <b>PROG</b>, the program now running (00 means idle); <b>VERB</b> and <b>NOUN</b>; and three signed five-digit registers, <b>R1</b>–<b>R3</b>. Below, 19 keys.</p>',
    } },
    { at: '102:00:02', spotlight: 'dsky' },
    { at: '102:00:06', hold: 4 },
    { at: '102:00:10', narrate: {
      title: 'A language of verbs and nouns',
      body: '<p>Every request is a sentence: a <b>verb</b> says what to do (06 display, 16 monitor, 21–25 load, 37 change program), a <b>noun</b> says what to do it with (36 the clock, 63 the landing quantities, 09 the alarm codes). You key <kbd>VERB</kbd> 1 6 <kbd>NOUN</kbd> 3 6 <kbd>ENTR</kbd> — “monitor the clock”.</p><p>The source panel shows the verb list from the program’s own assembly notes.</p>',
      anchors: ['src.lum.verb-list', 'scn.noun.list.landing', 'scn.pinball.nouns'],
    } },
    { at: '102:00:12', spotlight: 'dsky.verb' },
    { at: '102:00:14', spotlight: 'dsky.noun' },
    { at: '102:00:20', hold: 3 },

    { at: '102:00:22', chapter: 'Lamp test' },
    { at: '102:00:22', narrate: {
      title: 'Verb 35: test lights',
      body: '<p>Each key press raises an interrupt, <code>KEYRUPT1</code>, which asks the Executive for a small job, <code>CHARIN</code> (priority 30 octal), to decode the key. That is <b>PINBALL GAME BUTTONS AND LIGHTS</b>, the keyboard and display program.</p><p>Verb 35 runs <code>VBTSTLTS</code>: every lamp on, every digit an 8, the verb and noun flashing — for exactly 5 seconds (<code>SHOLTS</code> = 500 centiseconds). Watch the whole DSKY.</p>',
      anchors: ['exec.job.charin', 'scn.pinball.charin', 'scn.pinball.lamptest'],
    } },
    keysEndingAt('102:00:28', 'V35E', 'Crew'),
    { at: '102:00:28.5', spotlight: 'dsky' },

    { at: '102:00:36', chapter: 'A monitor: the clock' },
    { at: '102:00:36', narrate: {
      title: 'Verb 16 Noun 36: the computer’s clock',
      body: '<p>Verb 16 is a <b>monitor</b>: the display refreshes itself once a second. In the code, <code>MONITOR</code> starts a waitlist task, <code>MONREQ</code>, that re-arms itself every second (<code>MONDEL OCT 144</code> = 100 centiseconds) and each time asks the Executive for a job, <code>MONDO</code>, to redraw the numbers.</p><p>Noun 36 is the AGC clock: hours in R1, minutes in R2, seconds in R3. Watch R3 tick. Remember that monitor job — it reappears in the 1202 story.</p>',
      anchors: ['exec.job.mondo'],
    } },
    keysEndingAt('102:00:44', 'V16N36E', 'Crew'),
    { at: '102:00:45', spotlight: 'dsky.r3' },
    { at: '102:00:48', hold: 3 },

    { at: '102:00:52', narrate: {
      title: 'Noun 65 and KEY REL',
      body: '<p>Noun 65 is <i>sampled</i> time: the keyboard interrupt snatches the clock at the moment you press a key (“TIME IS SNATCHED IN RUPT FOR NOUN 65”).</p><p><kbd>KEY REL</kbd> (key release) hands the DSKY back to the computer. When a program wants to show something while the crew is using the keyboard, the KEY REL lamp flashes; pressing the key brings the program’s display back. You will see Aldrin do this after reading an alarm.</p>',
      anchors: ['exec.job.charin', 'scn.pinball.keyrel'],
    } },
    keysEndingAt('102:00:58', 'V16N65E', 'Crew'),
    keysEndingAt('102:01:06', 'K', 'Crew'),
    { at: '102:01:05.5', spotlight: 'dsky.key.keyrel' },

    { at: '102:01:12', chapter: 'Reading alarms' },
    { at: '102:01:12', narrate: {
      title: 'Verb 05 Noun 09: the alarm codes',
      body: '<p>Verb 05 displays three components in <b>octal</b>; noun 09 is <code>FAILREG</code>, the three alarm-code registers. R1 holds the first alarm since they were last cleared, R2 the second, R3 the most recent. No sign in front of the digits means octal.</p><p>Right now all three read 00000. During the landing Aldrin keyed exactly this, and R1 read <b>01202</b>.</p>',
      anchors: ['alarm.noun09', 'alarm.erasable.failreg', 'alarm.failreg'],
    } },
    keysEndingAt('102:01:18', 'V05N09E', 'Crew'),
    { at: '102:01:19', spotlight: 'dsky.r1' },
    { at: '102:01:22', hold: 3 },

    { at: '102:01:26', chapter: 'Operator error' },
    { at: '102:01:26', narrate: {
      title: 'OPR ERR',
      body: '<p>Verb 08 is a spare. In <code>VERBTAB</code>, PINBALL’s verb table, its entry is <code>GODSPALM</code>, which ends in <code>FALTON</code>: “TURN ON OPERATOR ERROR LIGHT”. The computer simply refuses the sentence. Let’s key V08 N36 ENTR and watch the <b>OPR ERR</b> lamp.</p>',
      anchors: ['scn.pinball.verbtab', 'scn.pinball.oprerr', 'scn.pinball.falton'],
    } },
    keysEndingAt('102:01:34', 'V08N36E', 'Crew'),
    { at: '102:01:34.5', spotlight: 'dsky.light.oprErr' },
    { at: '102:01:38', narrate: {
      title: 'RSET',
      body: '<p><kbd>RSET</kbd> runs PINBALL’s <code>ERROR</code> routine: it turns off OPR ERR and the PROG alarm lamp, clears the three alarm registers and redraws every digit. After an alarm the crew read the code with V05N09 and then cleared it with RSET.</p>',
      anchors: ['alarm.rset'],
    } },
    keysEndingAt('102:01:44', 'R', 'Crew'),
    { at: '102:01:43.5', spotlight: 'dsky.key.rset' },

    { at: '102:01:50', chapter: 'Changing program' },
    { at: '102:01:50', narrate: {
      title: 'Verb 37: change program',
      body: '<p>Programs (“major modes”) are selected with Verb 37 followed by the program number: <kbd>V</kbd>37<kbd>E</kbd>63<kbd>E</kbd>. <code>MMCHANG</code> insists on exactly two digits and checks them against the list of programs the crew may call — P63 is <code>P63LM</code>, the braking phase that starts powered descent. Eagle’s crew selected it this way at about 102:10:35, behind the Moon (onboard tape).</p><p>Watch PROG change from 00 to 63.</p>',
      anchors: ['scn.pinball.v37', 'scn.v37.table'],
    } },
    keysEndingAt('102:02:00', 'V37E63E', 'Crew'),
    { at: '102:02:00.5', spotlight: 'dsky.prog' },
    { at: '102:02:04', narrate: {
      title: 'A flashing display asks a question',
      body: '<p>When the verb and noun <b>flash</b>, the computer is asking the crew something and waiting. P63 first shows a flashing <b>Verb 06 Noun 61</b> — time to go in the braking phase, time from ignition, cross-range — “primarily used by the crew in P63 to reset his event timer to agree with TIG”.</p><p>A flashing display has three answers: <kbd>PRO</kbd> or Verb 33 (proceed), Verb 32 (recycle) and Verb 34 (terminate). <kbd>ENTR</kbd> answers only a load request or a “please” verb such as V50 or V99.</p>',
      anchors: ['scn.burn.v06n61', 'p63.entry'],
    } },
    { at: '102:02:06', spotlight: 'dsky.verb' },
    { at: '102:02:12', hold: 3 },
    { at: '102:02:16', narrate: {
      title: 'PRO, then Verb 34',
      body: '<p><kbd>PRO</kbd> is special: it has no key code. The keyboard sets an input bit (channel 32) that the T4RUPT interrupt samples every 120 ms. Pressing it here accepts the display, and P63 moves on to its next request.</p><p>We are not going to the Moon in this chapter, so we then key <b>Verb 34</b>, terminate. P63 gives up through <code>GOTOPOOH</code> (“go to P-double-oh”), which flashes <b>Verb 37</b>: “which program next?”</p>',
      anchors: ['src.gotopooh'],
    } },
    keysEndingAt('102:02:22', 'P', 'Crew'),
    { at: '102:02:21.5', spotlight: 'dsky.key.pro' },
    keysEndingAt('102:02:34', 'V34E', 'Crew'),
    { at: '102:02:36', narrate: {
      title: 'Ready',
      body: '<p>That is the whole vocabulary the crew used during the landing: displays and monitors (V06, V16), alarm codes (V05N09), RSET and KEY REL, PRO on a flashing request, and V37 to choose a program. Next, watch it used for real in <b>Burn, Baby, Burn</b> and <b>1202: the Executive overflow</b> — or switch to Interactive mode and key the DSKY yourself.</p>',
    } },
    { at: '102:02:38', spotlight: 'narration' },
  ],
});
