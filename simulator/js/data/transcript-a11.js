// Apollo 11 powered descent, the voice record used by the demo scenarios.
//
// Every line is copied from the research report web-timeline-b.md, which
// cross-checks three primary records:
//   ALSJ — Eric M. Jones, Apollo Lunar Surface Journal, "The First Lunar
//          Landing" (corrected transcript; merges the air-to-ground tape and
//          the LM onboard (DSE) intercom tape);
//   TEC  — Apollo 11 Technical Air-to-Ground Voice Transcription (GOSS Net 1);
//   ONB  — Apollo 11 Onboard Voice Transcription (LM DSE tape).
// Wording and time are ALSJ's unless `src` says otherwise; `alt` records how
// TEC/ONB differ. ONB clock times run 1–8 s earlier than ALSJ/TEC.
//
// Text conventions (so a caption never puts words in anyone's mouth):
//   - the words are ALSJ's, spelling and capitalisation included;
//   - ALSJ's editorial insertions that clarify the speech, written "(Thrust)"
//     in ALSJ, are kept but shown in square brackets: "[Thrust]";
//   - pure stage directions — "(Pause)", "(Long Pause)", "(To Houston)",
//     "(With some urgency in his voice)", "(static)" — are not words and are
//     moved to `note`;
//   - "(Garbled)" is kept as "[garbled]".
// `channel` is 'air-to-ground' (heard in Houston) or 'onboard' (intercom,
// recorded on the LM tape only).
//
// Voice lags the telemetry: the computer events in the scenarios use the
// Mission Report's event times, the captions use these voice times
// (web-timeline-b.md "Timing rule for the demo").

export const SPEAKERS = Object.freeze({
  Armstrong: { role: 'CDR', name: 'Neil Armstrong', station: 'Eagle' },
  Aldrin: { role: 'LMP', name: 'Edwin “Buzz” Aldrin', station: 'Eagle' },
  Duke: { role: 'CAPCOM', name: 'Charlie Duke', station: 'Houston' },
  Collins: { role: 'CMP', name: 'Michael Collins', station: 'Columbia' },
});

const AG = 'air-to-ground';
const OB = 'onboard';

function q(id, t, who, text, extra = {}) {
  return Object.freeze({
    id, t, who, role: SPEAKERS[who].role, text,
    src: extra.src || 'ALSJ',
    channel: extra.channel || AG,
    ...(extra.note ? { note: extra.note } : {}),
    ...(extra.alt ? { alt: extra.alt } : {}),
  });
}

// LOI-1 lines (Columbia, Comanche 055 P40) are from the Apollo 11 Flight
// Journal, "Lunar Orbit Insertion" (12day4-loi1.html), which prints the
// Command Module's onboard (DSE) tape: the burn took place behind the Moon,
// out of contact with Earth (loss of signal at 075:41:23). Checked against
// the page text; `src: AFJ`.
const AFJ = { src: 'AFJ (CM onboard tape)', channel: 'onboard' };

export const TRANSCRIPT_A11 = Object.freeze([
  // ---------- Columbia: Lunar Orbit Insertion, LOI-1 (AFJ) ----------
  q('loi-proceed-on-99', '075:48:37', 'Collins', 'I\'ll proceed on the 99.', AFJ),
  q('loi-dsky-blank', '075:49:14', 'Armstrong', '35 seconds; DSKY\'s blank, EMS Mode, Normal. Okay.', AFJ),
  q('loi-splendor', '075:49:26', 'Collins', 'Yes, the Moon is there, boy - in all its splendor.', AFJ),
  q('loi-plaster', '075:49:32', 'Collins', 'Plaster of paris gray to me.', AFJ),
  q('loi-8-seconds', '075:49:42', 'Aldrin', '8 seconds.', AFJ),
  q('loi-99', '075:49:45', 'Collins', '99...',
    { ...AFJ, note: 'AFJ 075:49:46 "Proceed." is attributed to "Armstrong/Collins".' }),
  q('loi-standby-tig', '075:49:48', 'Collins', 'Stand by for TIG.', AFJ),
  q('loi-burning', '075:49:51', 'Armstrong', 'Burning. We\'re looking good.', AFJ),
  q('loi-chamber', '075:50:00', 'Aldrin', 'It\'s good. 95, 95.',
    { ...AFJ, note: 'Answering Collins: "read your chamber pressure?"' }),
  q('loi-steering', '075:50:03', 'Armstrong', 'PUGS is oscillating around. Okay, we\'re steering.', AFJ),
  q('loi-10-seconds', '075:55:38', 'Armstrong', '10 seconds.', AFJ),
  q('loi-count', '075:55:40', 'Collins', 'Okay. 9, 8, 7, 6, 5, 4, 3...', AFJ),
  q('loi-shutdown', '075:55:49', 'Armstrong', 'Shutdown.', AFJ),
  q('loi-residuals', '075:56:17', 'Aldrin', 'Look at the residuals. Proceed.', AFJ),
  q('loi-no-trim', '075:56:20', 'Collins', 'Proceed? Copy them down; we\'re not going to trim them.', AFJ),
  q('loi-minus-1', '075:56:23', 'Collins', '[Garble] minus 1, minus 1, plus 1. Jesus!',
    { ...AFJ, note: 'The Noun 85 residuals: −0.1, −0.1, +0.1 ft/s (research src-comanche §3).' }),
  q('loi-mit', '075:56:29', 'Collins', 'I take back any bad things I ever said about MIT - which I never have.', AFJ),
  q('loi-ems', '075:56:37', 'Collins', 'Okay, EMS says minus 6.8.', AFJ),

  // ---------- before PDI ----------
  q('go-pdi', '102:28:08', 'Duke', 'Eagle, Houston. If you read, you\'re Go for powered descent. Over.',
    { note: 'Relayed by Collins at 102:28:18 and 102:28:34; Duke repeats at 102:28:51.' }),
  q('ignition-3-30', '102:29:33', 'Duke', 'Mark. 3:30 \'til ignition.'),

  // ---------- ignition ----------
  q('engine-arm', '102:32:25', 'Aldrin', 'Engine Arm, Descent. 40 seconds.',
    { channel: OB, alt: 'ONB 102:32:22. TEC 102:32:24 hears "OMNI\'s in." instead.' }),
  q('camera-q', '102:32:34', 'Armstrong', 'Is the [16mm] camera running?', { channel: OB, alt: 'ONB 102:32:30' }),
  q('camera-a', '102:32:35', 'Aldrin', 'Camera\'s running. [garbled]', { channel: OB }),
  q('descent-armed', '102:32:50', 'Armstrong', 'Okay, the override at 5 seconds. Descent armed.',
    { channel: OB, note: 'ALSJ: "(Pause)" between the sentences.',
      alt: 'ONB: 102:32:46 "OVERRIDE at 5 seconds", 102:32:54 "DESCENT, ARMED."' }),
  q('alt-light-on', '102:33:03', 'Aldrin', 'Altitude light\'s on.',
    { alt: 'ONB 102:32:58: "ALTITUDE lights, ON? ... proceed?"' }),
  q('proceed-cdr', '102:33:05', 'Armstrong', '[garbled] proceed.',
    { channel: OB, alt: 'ONB 102:33:02: "Proceed. 1, 0 -"' }),
  q('proceed', '102:33:08', 'Aldrin', 'Proceed. One, Zero.',
    { note: 'Aldrin keyed PRO on the flashing V99N62 (Eyles).' }),
  q('ignition-cdr', '102:33:11', 'Armstrong', 'Ignition.',
    { channel: OB, alt: 'ONB 102:33:07: "IGNITION. 10 percent."' }),
  q('ignition', '102:33:11', 'Aldrin', 'Ignition. [Thrust] 10 percent',
    { note: 'ALSJ: "(Pause; static)" follows.', alt: 'TEC 102:33:09: "... 10 ... 10 percent ..."' }),
  q('on-time', '102:33:19', 'Armstrong', 'Just about on time.',
    { channel: OB, alt: 'ONB 102:33:14 attributes it to the LMP.' }),
  q('throttle-up', '102:33:25', 'Aldrin', '[garbled] light is on. 24, 25, 26, Throttle up. Looks good!',
    { channel: OB, note: 'ALSJ: "(Pause)" after "light is on."',
      alt: 'ONB 102:33:21: "OVERRIDE is ON. 24. FLASH. THROTTLE, up."' }),
  q('lost-them', '102:33:41', 'Duke', 'Columbia, Houston. We\'ve lost them. Tell them to go aft Omni. Over.'),
  q('got-you-now', '102:34:16', 'Duke', 'Eagle, we[\'ve] got you now. It\'s looking good. Over.',
    { note: 'ALSJ: "(Pause) Eagle..." follows.' }),
  q('rod-good', '102:34:22', 'Aldrin', 'Okay, rate of descent looks good.', { note: 'ALSJ: "(To Neil)".' }),
  q('everything-good', '102:34:25', 'Duke', 'Eagle, Houston. Everything\'s looking good here. Over.'),

  // ---------- braking phase ----------
  q('two-minutes', '102:34:55', 'Armstrong', 'Okay. [garbled] Two minutes [into the burn]; going good.',
    { channel: OB, alt: 'ONB 102:34:49: "Coming up on 2 minutes; going good. AGS\'s good?"' }),
  q('ags-pgns', '102:35:01', 'Aldrin', 'AGS and PGNS agree very closely.', { alt: 'TEC 102:34:59' }),
  q('slew', '102:35:38', 'Armstrong', 'You\'re Slew? Okay.',
    { channel: OB, note: 'ALSJ: "(Pause)" follows. Rendezvous-radar mode switch AUTO TRACK → SLEW (Fjeld/ALSJ).',
      alt: 'ONB 102:35:31–32: "To SLEW?" / "SLEW."' }),
  q('three-min-early', '102:36:11', 'Armstrong', 'Okay, we went by the three-minute point early. We\'re [going to land] long.',
    { channel: OB, alt: 'ONB 102:36:03: "...early. A little off."' }),
  q('little-long', '102:36:18', 'Armstrong', 'Our position checks down range show us to be a little long.',
    { note: 'ALSJ: "(To Houston)".' }),
  q('rolling-over', '102:36:46', 'Armstrong', 'Roger, about 3 seconds long. Rolling over. Okay, now watch that signal strength.',
    { channel: OB, note: 'ALSJ: "(Pause)" after "Rolling over."',
      alt: 'ONB 102:36:44: "About 2 seconds off - rolling over."' }),
  q('go-continue', '102:37:22', 'Duke', 'Roger. You are Go. You are Go to continue powered descent. You are Go to continue powered descent.'),
  q('data-dropout', '102:37:35', 'Duke', 'And, Eagle, Houston. We\'ve got data dropout. You\'re still looking good.',
    { note: 'ALSJ: "(Long Pause; static fades)" follows.' }),
  q('lock-on', '102:38:04', 'Aldrin', 'Okay. We got good [landing radar] lock-on.',
    { alt: 'TEC 102:38:04: "... PGNS. We got good lock-on. Altitude light OUT. DELTA-H is minus 2 900." ALSJ notes this call lags the Mission Report\'s "LR data good" (102:37:51) by 13 s.' }),
  q('lock-on-q', '102:38:09', 'Armstrong', 'We got a lock-on?', { channel: OB, alt: 'ONB 102:38:05' }),
  q('delta-h', '102:38:11', 'Aldrin', 'Yeah. Altitude light\'s out. Delta-H is minus 2,900.',
    { note: 'ALSJ: "(Pause)" before "Delta-H".',
      alt: 'ONB: "Altitude light\'s out" 102:38:06; "DELTA-H is minus 2900" 102:38:12. Mission Report: about 2,800 ft.' }),
  q('copy-dh', '102:38:18', 'Duke', 'Roger. We copy.'),
  q('earth', '102:38:20', 'Aldrin', 'Got the Earth straight out our front window.'),
  q('looking-at-dh', '102:38:21', 'Armstrong', 'Sure do. Houston, [I hope] you\'re looking at our Delta-H.',
    { alt: 'TEC 102:38:23 (CDR): "Houston, you\'re looking at our DELTA-H?" ONB 102:38:22 attributes it, with "Program alarm.", to the LMP.' }),
  q('affirmative', '102:38:25', 'Duke', 'That\'s affirmative.'),
  q('program-alarm', '102:38:26', 'Armstrong', 'Program Alarm.',
    { note: 'ALSJ: "(With the slightest touch of urgency)".', alt: 'TEC 102:38:26 CDR: "PROGRAM ALARM." ONB 102:38:22 (LMP).' }),
  q('looking-good-alarm', '102:38:28', 'Duke', 'It\'s looking good to us. Over.'),
  q('its-1202', '102:38:30', 'Armstrong', 'It\'s a 1202.',
    { note: 'ALSJ: "(To Houston)".', alt: 'ONB 102:38:29 CDR: "1202; 1202."' }),
  q('1202-lmp', '102:38:32', 'Aldrin', '1202.', { note: 'ALSJ: "(Pause)" follows.' }),
  q('give-reading', '102:38:42', 'Armstrong', 'What is it? Let\'s incorporate [the landing radar data]. Give us a reading on the 1202 Program Alarm.',
    { note: 'ALSJ: "(To Buzz)" before the first sentence and "(To Houston)" before the last.',
      alt: 'ALSJ merges the onboard and air-to-ground lines. ONB 102:38:40 CDR "What is it?"; ONB 102:38:42 LMP "That\'s in core ..."; TEC 102:38:48 CDR "Give us a reading on the 1202 PROGRAM ALARM."' }),
  q('go-on-alarm', '102:38:53', 'Duke', 'Roger. We got you...We\'re Go on that alarm.',
    { note: 'ALSJ: "(With some urgency in his voice)" before "We\'re Go".', alt: 'TEC 102:38:53: "Roger. We got - We\'re GO on that alarm."' }),
  q('six-plus-25', '102:39:01', 'Duke', '6 plus 25. Throttle down...',
    { note: 'The predicted throttle-down, 6 min 25 s after ignition.' }),
  q('about-820', '102:39:02', 'Aldrin', 'Okay. Looks like about 820...',
    { note: 'ALSJ: "(Listens)". Probably a ΔH reading (inference; Eyles: ΔH had fallen to ~900 ft).' }),
  q('six-plus-25b', '102:39:03', 'Duke', '...6 plus 25, throttle down.'),
  q('roger-copy-625', '102:39:06', 'Aldrin', 'Roger. Copy.', { alt: 'TEC 102:39:06 gives CDR: "Roger. Copy. 6 plus 25."' }),
  q('six-plus-25c', '102:39:08', 'Armstrong', '6 plus 25.'),
  q('same-alarm', '102:39:14', 'Aldrin', 'Same alarm, and it appears to come up when we have a 16/68 up.',
    { alt: 'TEC: "...when we have a 1668 up." ONB 102:39:12.' }),
  q('copy-same-alarm', '102:39:17', 'Duke', 'Roger. Copy.', { note: 'ALSJ: "(Pause)" follows.' }),
  q('monitor-dh', '102:39:20', 'Duke', 'Eagle, Houston. We\'ll monitor your Delta-H.', { alt: 'TEC 102:39:23' }),
  q('coming-down-q', '102:39:21', 'Armstrong', 'Were we...Was it [the large Delta-H reading] coming down?',
    { channel: OB, alt: 'ONB 102:39:19' }),
  q('beautifully', '102:39:24', 'Aldrin', 'Yes, it\'s coming down beautifully.', { alt: 'TEC: "... worked out beautifully."' }),
  q('dh-looks-good', '102:39:29', 'Armstrong', 'Roger, it looks good now.'),
  q('dh-good-to-us', '102:39:30', 'Duke', 'Roger. Delta-H is looking good to us.'),
  q('wow-throttle-down', '102:39:34', 'Aldrin', 'Wow! Throttle down...', { alt: 'TEC: "Ah! Throttle down - -"' }),
  q('throttle-down-on-time', '102:39:35', 'Armstrong', 'Throttle down on time.', { alt: 'TEC: "Throttle down on time!"' }),
  q('copy-throttle-down', '102:39:36', 'Duke', 'Roger. We copy throttle down...'),
  q('feel-it', '102:39:38', 'Aldrin', 'You can feel it in here when it throttles down. Better than the [stationary] simulator.'),
  q('ags-pgns-close', '102:39:48', 'Aldrin', 'AGS and PGNS look real close.'),
  q('seven-minutes', '102:40:08', 'Duke', 'At 7 minutes, you\'re looking great to us, Eagle.'),
  q('descent-2', '102:40:49', 'Duke', 'Eagle, Houston. It\'s Descent 2 fuel to Monitor. Over.'),
  q('switchover', '102:41:01', 'Aldrin', 'Give us an estimated switchover time please, Houston.',
    { note: 'Aldrin avoids V16N68 (time-to-go) and asks the ground instead (O\'Brien in ALSJ). ALSJ corrected "pitchover" to "switchover" in 2014.' }),
  q('eight-minutes', '102:41:05', 'Duke', 'Roger. Standby. You\'re looking great at 8 minutes.'),
  q('at-7000', '102:41:10', 'Aldrin', 'You\'re at 7000, [garbled]. Looking good.',
    { alt: 'TEC: "At 7000 -". ONB 102:41:08: "Okay, 7000, ... Looks good."' }),
  q('thirty-to-p64', '102:41:12', 'Duke', 'Eagle, you\'ve got 30 seconds to P64.'),
  q('eight-thirty', '102:41:27', 'Duke', 'Eagle, Houston. Coming up 8:30; you\'re looking great.', { note: 'ALSJ: "(Pause)" follows.' }),

  // ---------- approach phase (P64) ----------
  q('p64', '102:41:35', 'Armstrong', 'P64.',
    { alt: 'TEC and ONB (102:41:33) attribute "P64" to the LMP (Aldrin); Aldrin\'s debriefing: "41:35-P64".' }),
  q('copy-p64', '102:41:37', 'Duke', 'We copy.', { note: 'ALSJ: "(Long Pause)" follows.' }),
  q('attitude-check', '102:41:51', 'Armstrong', 'Okay. 5000 [feet altitude]. 100 feet per second [descent rate] is good. Going to check my attitude control. Attitude control is good',
    { channel: OB, alt: 'ONB 102:41:40: "... 5000, 100 feet per second is good, and I\'m going to check my attitude control."' }),
  q('nine-minutes', '102:41:51', 'Duke', 'Eagle, you\'re looking great. Coming up 9 minutes.', { note: 'ALSJ: "(Pause)" follows.' }),
  q('manual-good', '102:42:05', 'Armstrong', 'Manual attitude control is good.',
    { alt: 'ONB 102:42:01: "...manual attitude control is good. Okay, 3070."' }),
  q('go-for-landing', '102:42:08', 'Duke', 'Roger. Copy. Eagle, Houston. You\'re Go for landing. Over.',
    { note: 'ALSJ: "(Pause)" after "Roger. Copy."', alt: 'TEC: "Roger. Copy." 102:42:08, then "Eagle, Houston. You\'re GO for landing. Over." 102:42:10.' }),
  q('3000-at-70', '102:42:13', 'Armstrong', 'Okay. 3000 at 70.', { channel: OB, alt: 'ONB 102:42:01 "3070"' }),
  q('understand-go', '102:42:17', 'Aldrin', 'Roger. Understand. Go for landing. 3000 feet.',
    { note: 'ALSJ: "(Respoding [sic] to Charlie)" before, "(To Neil)" before "3000 feet."',
      alt: 'TEC 102:42:17 (LMP): "Roger. Understand. GO for landing. 3000 feet. PROGRAM ALARM."' }),
  q('copy-3000', '102:42:19', 'Duke', 'Copy.'),
  q('program-alarm-1201', '102:42:19', 'Aldrin', 'Program Alarm. 1201',
    { note: 'ALSJ: "(Pause)" before "1201".', alt: 'ONB 102:42:15: "...Go for landing, 3000 feet. Program alarm - 1201."' }),
  q('1201-cdr', '102:42:24', 'Armstrong', '1201. Okay, 2000 at 50.',
    { note: 'ALSJ: "(Pause)", then "Okay, 2000 at 50." is from the onboard tape.', alt: 'ONB 102:42:22: "1201. Okay. 2050."' }),
  q('go-1201', '102:42:25', 'Duke', 'Roger. 1201 alarm. We\'re Go. Same type. We\'re Go.',
    { note: 'ALSJ: "(Pause)" after "1201 alarm."', alt: 'TEC: "Roger. 1201 alarm. We\'re GO. Same type. We\'re GO."' }),
  q('2000-feet', '102:42:31', 'Aldrin', '2000 feet. 2000 feet.',
    { alt: 'TEC 102:42:31 (one line): "2000 feet. 2000 feet. Into the AGS, 47 degrees."' }),
  q('give-lpd', '102:42:32', 'Armstrong', 'Give me an LPD [angle].',
    { channel: OB, note: 'ALSJ: "(With some urgency in his voice, possibly as he sees West Crater)".', alt: 'ONB 102:42:30' }),
  q('lpd-47-a', '102:42:33', 'Aldrin', 'Into the AGS. 47 degrees.',
    { src: 'ALSJ wording; time from ONB', note: 'ALSJ gives no time ("102:42:??"); ONB 102:42:32. ALSJ: "(Then reading the LPD from the PNGS as displayed on the DSKY)" before "47 degrees".' }),
  q('give-lpd-2', '102:42:34', 'Armstrong', 'Give me an LPD.',
    { src: 'ALSJ wording; time from ONB', note: 'ALSJ: "(Repeating his request...)". ALSJ gives no time; ONB 102:42:33.' }),
  q('roger-lpd', '102:42:35', 'Duke', 'Roger.'),
  q('lpd-47-b', '102:42:36', 'Aldrin', '47 degrees.',
    { src: 'ALSJ wording; time from TEC', note: 'ALSJ: "(Repeating the LPD readout)". ALSJ gives no time; TEC 102:42:36, ONB 102:42:35.' }),
  q('not-bad-area', '102:42:37', 'Armstrong', '47. That\'s not a bad looking area. [garbled] Okay.',
    { channel: OB, note: 'ALSJ: "(Confirming Buzz\'s LPD readout)". ALSJ continues the same entry with "1000 at 30 is good. What\'s LPD?" (see 1000-at-30).',
      alt: 'ONB: 102:42:37 "47."; 102:42:38 "That\'s not a bad-looking area. Okay."' }),
  q('looking-great-go', '102:42:41', 'Duke', 'Eagle, looking great. You\'re Go.', { note: 'ALSJ: "(Long Pause)" follows.' }),
  q('1000-at-30', '102:42:51', 'Armstrong', '1000 at 30 is good. What\'s LPD?',
    { channel: OB, src: 'ALSJ wording; time from ONB', note: 'ALSJ merges this into its 102:42:37 entry; ONB places "1030 is good." at 102:42:51 and "What\'s LPD?" at 102:42:55.' }),
  q('copy-1202', '102:42:58', 'Duke', 'Roger. 1202. We copy it.',
    { src: 'ALSJ wording; time from TEC', note: 'ALSJ merges it into the 102:42:41 entry after "(Long Pause)". Logged in the fifth alarm\'s second (TEC 102:42:58; AIRT 102:43:00), so it most likely acknowledges the fourth (102:42:43), seen on telemetry; no crew voice report of either P64 1202 is recorded.' }),
  q('35-degrees', '102:43:01', 'Aldrin', '35 degrees. 35 degrees. 750. Coming down at 23.', { alt: 'ONB 102:42:58' }),
  q('okay-cdr', '102:43:07', 'Armstrong', 'Okay.', { channel: OB }),
  q('700-feet', '102:43:07', 'Aldrin', '700 feet, 21 down, 33 degrees.', { alt: 'ONB 102:43:06' }),
  q('rocky', '102:43:10', 'Armstrong', 'Pretty rocky area.', { channel: OB, alt: 'ONB 102:43:08' }),
  q('600-feet', '102:43:11', 'Aldrin', '600 feet, down at 19.'),
  q('going-to', '102:43:15', 'Armstrong', 'I\'m going to...', { channel: OB }),
  q('540-feet', '102:43:16', 'Aldrin', '540 feet, down at...[LPD angle is] 30. Down at 15.',
    { note: 'ALSJ: "(Pause)" follows. Whether "30" is an LPD angle is uncertain.',
      alt: 'TEC 102:43:15: "540 feet, down at - 30. Down at 15."' }),

  // ---------- P66 and touchdown ----------
  q('400-feet', '102:43:26', 'Aldrin', 'Okay, 400 feet, down at 9 [feet per second]. 58 [feet per second] forward.',
    { alt: 'TEC 102:43:26 "At 400 feet, down at 9." + 102:43:29 "... forward." ONB 102:43:25 "Okay, 400 feet, down to 9, 58 forward."' }),
  q('no-problem', '102:43:32', 'Armstrong', 'No problem.', { channel: OB }),
  q('350-feet', '102:43:33', 'Aldrin', '350 feet, down at 4.'),
  q('330-feet', '102:43:35', 'Aldrin', '330, three and a half down.',
    { note: 'ALSJ: "(Pause)" follows.', alt: 'TEC: "30, ... one-half down." ONB 102:43:31: "...330 - 6-1/2 down."' }),
  q('pegged', '102:43:42', 'Aldrin', 'Okay, you\'re pegged on horizontal velocity.', { alt: 'TEC: "We\'re pegged on horizontal velocity."' }),
  q('300-feet', '102:43:46', 'Aldrin', '300 feet [altitude], down 3 1/2 [feet per second], 47 [feet per second] forward. Slow it up.',
    { alt: 'ONB 102:43:44' }),
  q('270-feet', '102:43:52', 'Aldrin', '1 1/2 down. Ease her down. 270.',
    { alt: 'TEC: "On 1 a minute, 1 1/2 down." ONB: "1 a minute, 1-1/2 down. Moving out." / 102:43:55 "270."' }),
  q('fuel-q', '102:43:58', 'Armstrong', 'Okay, how\'s the fuel?', { alt: 'TEC 102:43:57 CDR: "70."' }),
  q('eight-percent', '102:44:00', 'Aldrin', 'Eight percent.',
    { note: 'ALSJ adopted "Eight percent" from D. R. Lunsford\'s listening.', alt: 'ONB 102:43:59: "Wait just a minute." Not in TEC.' }),
  q('good-area', '102:44:02', 'Armstrong', 'Okay. Here\'s a...Looks like a good area here.',
    { channel: OB, alt: 'ONB 102:44:00: "Okay, Ed, this looks like a good area here."' }),
  q('shadow', '102:44:04', 'Aldrin', 'I got the shadow out there.', { alt: 'TEC: "Watch your shadow out there."' }),
  q('250-feet', '102:44:07', 'Aldrin', '250 [feet altitude], down at 2 1/2, 19 forward.',
    { note: 'ALSJ: "(Pause)" follows.', alt: 'TEC: "50, down at 2 1/2, 19 forward."' }),
  q('alt-vel-lights', '102:44:13', 'Aldrin', 'Altitude [and] velocity lights [on].', { alt: 'TEC: "Altitude-velocity light."' }),
  q('220-feet', '102:44:16', 'Aldrin', '3 1/2 down, 220 feet, 13 forward.', { note: 'ALSJ: "(Pause)" follows.' }),
  q('11-forward', '102:44:23', 'Aldrin', '11 forward. Coming down nicely.'),
  q('200-feet', '102:44:24', 'Aldrin', '200 feet, 4 1/2 down.'),
  q('that-crater', '102:44:25', 'Armstrong', 'Gonna be right over that crater.', { channel: OB }),
  q('5-5-down', '102:44:26', 'Aldrin', '5 1/2 down.'),
  q('good-spot', '102:44:29', 'Armstrong', 'I got a good spot [garbled].', { channel: OB }),
  q('160-feet', '102:44:31', 'Aldrin', '160 feet, 6 1/2 down.', { alt: 'TEC: "160, 6 - 6 1/2 down."' }),
  q('9-forward', '102:44:33', 'Aldrin', '5 1/2 down, 9 forward. You\'re looking good.', { alt: 'TEC: "...That\'s good."' }),
  q('120-feet', '102:44:40', 'Aldrin', '120 feet.'),
  q('100-feet', '102:44:45', 'Aldrin', '100 feet, 3 1/2 down, 9 forward. Five percent. Quantity light.',
    { alt: 'TEC: "100 feet, 3 1/2 down, 9 forward. Five percent." ("Quantity light" not in TEC).' }),
  q('75-feet', '102:44:54', 'Aldrin', 'Okay. 75 feet. And it\'s looking good. Down a half, 6 forward.',
    { alt: 'TEC: "There\'s looking good."' }),
  q('sixty-seconds', '102:45:02', 'Duke', '60 seconds [of fuel left before the \'Bingo\' call].'),
  q('vel-light', '102:45:04', 'Aldrin', '[Velocity] light\'s on.', { alt: 'TEC 102:45:04: "Lights on. ..."' }),
  q('60-feet', '102:45:08', 'Aldrin', '60 feet, down 2 1/2. 2 forward. 2 forward. That\'s good.',
    { note: 'ALSJ: "(Pause)" after "down 2 1/2."' }),
  q('dust', '102:45:17', 'Aldrin', '40 feet, down 2 1/2. Picking up some dust.',
    { src: 'ALSJ wording; time from TEC', note: 'ALSJ gives no time for this line.', alt: 'TEC 102:45:17: "...Kicking up some dust." ONB 102:45:13: "Picking up some dust".' }),
  q('30-feet', '102:45:21', 'Aldrin', '30 feet, 2 1/2 down. [garbled] shadow.',
    { alt: 'TEC: "Faint shadow."' }),
  q('4-forward', '102:45:25', 'Aldrin', '4 forward. 4 forward. Drifting to the right a little. 20 feet, down a half.',
    { alt: 'ONB 102:45:26: "20 feet, down a half..."' }),
  q('thirty-seconds', '102:45:31', 'Duke', '30 seconds [until the \'Bingo\' call].'),
  q('drifting-forward', '102:45:32', 'Aldrin', 'Drifting forward just a little bit; that\'s good. [garbled]',
    { note: 'ALSJ: "(Pause)" follows.', alt: 'TEC: 102:45:32 CDR "Forward drift?" / 102:45:33 LMP "Yes." / 102:45:34 LMP "Okay."' }),
  q('contact-light', '102:45:40', 'Aldrin', 'Contact Light.', { alt: 'TEC 102:45:40 "CONTACT LIGHT." Not in ONB.',
    note: 'The lamps came on a few seconds before the call, when a 67-in probe touched (≈102:45:36.6, derived in apollo11-descent.js); the footpads touched at 102:45:39.9 (MR §5.4), the engine still running.' }),
  q('shutdown', '102:45:43', 'Armstrong', 'Shutdown', { channel: OB, alt: 'ONB 102:45:41 CDR: "SHUTDOWN." Not in TEC.' }),
  q('engine-stop', '102:45:44', 'Aldrin', 'Okay. Engine Stop.', { alt: 'TEC 102:45:43' }),
  q('aca-detent', '102:45:45', 'Aldrin', 'ACA out of Detent.'),
  q('detent-auto', '102:45:46', 'Armstrong', 'Out of Detent. Auto.'),
  q('413-is-in', '102:45:47', 'Aldrin', 'Mode Control, both Auto. Descent Engine Command Override, Off. Engine Arm, Off. 413 is in.',
    { note: '"413 is in": the lunar-surface flag keyed into the Abort Guidance System\'s DEDA (CLR 413 ENTR +10000 ENTR) — not the AGC (O\'Brien in ALSJ).',
      alt: 'TEC puts "413 is in." on its own line at 102:45:5x.' }),
  q('copy-you-down', '102:45:57', 'Duke', 'We copy you down, Eagle.',
    { note: 'ALSJ: "(Reporting that Houston has received telemetry confirming engine shutdown and that they have heard Buzz\'s transmission regarding address 413)".' }),
  q('engine-arm-off', '102:45:58', 'Armstrong', 'Engine arm is off.',
    { channel: OB, note: 'ALSJ: "(Pause)" follows, then the switch to voice-activated comm.', alt: 'ONB 102:45:52' }),
  q('eagle-has-landed', '102:45:58', 'Armstrong', 'Houston, Tranquility Base here. The Eagle has landed.',
    { alt: 'TEC: "Houston, Tranquility Base here." 102:45:59; "THE EAGLE HAS LANDED." 102:46:04. ONB 102:45:58.' }),
  q('breathing-again', '102:46:06', 'Duke', 'Roger, Twan...Tranquility. We copy you on the ground. You got a bunch of guys about to turn blue. We\'re breathing again. Thanks a lot.',
    { note: 'ALSJ: "(Responding to Neil\'s transmission but momentarily tongue-tied)" and "(correcting himself)".', alt: 'TEC 102:46:06 (no "Twan").' }),
  q('thank-you', '102:46:16', 'Aldrin', 'Thank you.', { alt: 'TEC and ONB (102:46:14) attribute this to the CDR (Armstrong); ALSJ judges it Buzz.' }),
  q('looking-good-here', '102:46:18', 'Duke', 'You\'re looking good here.'),
  q('busy', '102:46:23', 'Armstrong', 'Okay. Let\'s get on with it. Okay. We\'re going to be busy for a minute.',
    { note: 'ALSJ: "(To Buzz)" before "Let\'s get on with it." and "(To Houston)" before the last sentence.' }),
  q('smooth-touchdown', '102:46:38', 'Aldrin', 'Very smooth touchdown.', { note: 'ALSJ: "(Pause)" follows.' }),
  q('stay-t1', '102:47:06', 'Duke', 'Roger, Eagle. And you are Stay for... ...T1. Over. Eagle, you are Stay for T1.',
    { note: 'ALSJ spans 102:47:06 and 102:47:09. T1 = the first lift-off opportunity.' }),
  q('understand-stay', '102:47:12', 'Armstrong', 'Roger. Understand, Stay for T1.'),
]);

const BY_ID = new Map(TRANSCRIPT_A11.map((e) => [e.id, e]));

// The transcript entry with this id (throws on a typo, so a scenario can
// never quote a line that is not in the record).
export function quote(id) {
  const entry = BY_ID.get(id);
  if (!entry) throw new Error(`transcript-a11: no quote "${id}"`);
  return entry;
}

// A scenario `say` event for quote `id`, at the quote's own GET unless `at`
// is given (only used when two records disagree; see the quote's note).
export function sayEvent(id, { at } = {}) {
  const e = quote(id);
  return {
    at: at ?? e.t,
    say: {
      who: e.who, role: e.role, text: e.text, src: e.src, channel: e.channel, id: e.id,
      ...(e.note ? { note: e.note } : {}),
      ...(e.alt ? { alt: e.alt } : {}),
    },
  };
}

// True if `who`/`text` is exactly one of the lines above (used by tests).
export function isTranscriptLine(who, text) {
  return TRANSCRIPT_A11.some((e) => e.who === who && e.text === text);
}
