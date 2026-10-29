// Cross-cutting source anchors (prefix `src.`): title pages and assembly
// notes, the include lists, the interpreter, T4RUPT and the interrupt
// vectors, and the famous comments of the listings. Every range below was
// checked against the files in this repository (1-based line numbers);
// test/anchors.test.mjs re-checks them, including that `label` starts line
// `start`.
//
// Optional `note` is one sentence the source panel shows under the header.

export const ANCHORS = {
  // ---------- title pages, headers, assembly notes ----------

  'src.lum.title': {
    file: 'Luminary099/ASSEMBLY_AND_OPERATION_INFORMATION.agc', start: 27, end: 40,
    title: 'Luminary title page: “intended for use in the LM during the manned lunar landing mission”',
    note: 'Page 1 of the listing: MIT Instrumentation Laboratory, NASA contract NAS 9-4065; the program is referred to as Luminary 1A.',
  },
  'src.lum.header': {
    file: 'Luminary099/ASSEMBLY_AND_OPERATION_INFORMATION.agc', start: 1, end: 25,
    title: 'How this listing reached us: the transcription header',
    note: 'Transcribed from scans of a hardcopy at the MIT Museum; the printout is “revision 001 of AGC program LMY99”, made 16:27 July 14, 1969.',
  },
  'src.lum.log-sections': {
    file: 'Luminary099/ASSEMBLY_AND_OPERATION_INFORMATION.agc', start: 52, end: 147,
    title: 'Table of subroutine log sections (the program’s table of contents)',
    note: 'The rope’s sections — LUMERASE, LNYAIDE, LEMP20S, LEMP30S, KISSING, FLY, LEMP50S, SKIPPER, LMDAP — in assembly order.',
  },
  'src.lum.verb-list': {
    file: 'Luminary099/ASSEMBLY_AND_OPERATION_INFORMATION.agc', start: 161, end: 269,
    title: 'Verb list for Luminary (regular and extended verbs)',
  },
  'src.lum.noun-list': {
    file: 'Luminary099/ASSEMBLY_AND_OPERATION_INFORMATION.agc', start: 272, end: 321,
    title: 'Noun list for Luminary (first page of normal nouns)',
  },
  'src.lum.alarm-codes': {
    file: 'Luminary099/ASSEMBLY_AND_OPERATION_INFORMATION.agc', start: 896, end: 1021,
    title: 'Alarm codes for Luminary (incl. 01201/01202 and the * / ** / P legend)',
  },
  'src.lum.main': {
    file: 'Luminary099/MAIN.agc', start: 1, end: 91,
    title: 'MAIN.agc: every file of Luminary 099 in assembly order, with listing pages',
    note: 'The original was one monolithic assembly; the transcribers split it into these files and join them again by inclusion.',
  },
  'src.cmc.contract': {
    file: 'Comanche055/CONTRACT_AND_APPROVALS.agc', start: 28, end: 73,
    title: 'Comanche 055 title page: “Colossus 2A” and the approvals',
    note: 'Submitted 28 March 1969 by Margaret H. Hamilton, Colossus programming leader, and approved by Lickly, Martin, Sears, Battin, Hoag and Ragan.',
  },
  'src.cmc.header': {
    file: 'Comanche055/CONTRACT_AND_APPROVALS.agc', start: 1, end: 23,
    title: 'Comanche 055 transcription header',
    note: 'The printout is “revision 055 of AGC program Comanche by NASA 2021113-051”, 10:28 April 1, 1969.',
  },
  'src.cmc.log-sections': {
    file: 'Comanche055/ASSEMBLY_AND_OPERATION_INFORMATION.agc', start: 31, end: 122,
    title: 'Comanche 055 subroutine calls (the program’s table of contents)',
  },
  'src.cmc.main': {
    file: 'Comanche055/MAIN.agc', start: 1, end: 99,
    title: 'MAIN.agc: every file of Comanche 055 in assembly order, with listing pages',
  },

  // ---------- interrupts, T4RUPT, I/O ----------

  'src.leadins': {
    file: 'Luminary099/INTERRUPT_LEAD_INS.agc', start: 29, end: 86,
    title: 'Interrupt lead-ins at address 4000: GO (restart), T6, T5, T3, T4, keys, uplink, downlink, radar, RUPT10',
  },
  'src.t4rupt.entry': {
    file: 'Luminary099/T4RUPT_PROGRAM.agc', label: 'T4RUPT', start: 35, end: 48,
    title: 'T4RUPT: the display/output interrupt (“GOES 7(-1)0 AROUND AND AROUND”)',
    note: 'Each regular T4RUPT (every 120 ms, 120MRUPT) steps DSRUPTSW 7, 6, … 0 and round again, picking one slot of T4JUMP, so the slots repeat every 0.96 s.',
  },
  'src.t4rupt.lamps': {
    file: 'Luminary099/T4RUPT_PROGRAM.agc', label: 'CDRVE', start: 80, end: 90,
    title: 'CDRVE: writes the lamp relay word (DSPTAB+11D) to OUT0',
  },
  'src.t4rupt.dspout': {
    file: 'Luminary099/T4RUPT_PROGRAM.agc', label: 'DSPOUTSB', start: 95, end: 141,
    title: 'DSPOUT: sends changed DSKY digits to the display relays',
  },
  'src.t4rupt.proceed': {
    file: 'Luminary099/T4RUPT_PROGRAM.agc', start: 144, end: 170,
    title: 'The PRO button is sampled every 120 ms; a new press starts PINBALL (PROCKEY)',
  },
  'src.t4rupt.t4jump': {
    file: 'Luminary099/T4RUPT_PROGRAM.agc', label: 'T4JUMP', start: 175, end: 185,
    title: 'T4JUMP: the once-per-0.96-second jobs (RCS monitor, RR check, IMU monitor, DAP)',
  },
  'src.io.chan11': {
    file: 'Luminary099/INPUT_OUTPUT_CHANNEL_BIT_DESCRIPTIONS.agc', start: 53, end: 71,
    title: 'Channel 11: DSKY lamps (COMP ACTY, UPLINK ACTY, TEMP, KEY REL, flash, OPR ERR) and engine on/off',
  },

  // ---------- the interpreter ----------

  'src.interp.intpret': {
    file: 'Luminary099/INTERPRETER.agc', label: 'INTPRET', start: 43, end: 56,
    title: 'INTPRET: entry to the interpreter',
    note: '“TC INTPRET” switches a job from machine code to interpretive code — the vector, matrix and double-precision language of navigation and guidance.',
  },
  'src.interp.danzig': {
    file: 'Luminary099/INTERPRETER.agc', label: 'DANZIG', start: 74, end: 95,
    title: 'DANZIG: dispatch the next interpretive op — and yield if a higher-priority job is waiting (NEWJOB)',
  },
  'src.interp.exit': {
    file: 'Luminary099/INTERPRETER.agc', label: 'EXIT', start: 755, end: 758,
    title: 'EXIT: leave interpretive mode and return to machine code',
  },

  // ---------- the famous comments ----------

  'src.burnbaby.naming': {
    file: 'Luminary099/BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc', start: 34, end: 45,
    title: 'Why “BURN, BABY, BURN”: the naming story (2009 transcriber’s note)',
    note: 'A “##” annotation added in 2009: Don Eyles traced the name to 1965 and DJ Magnificent Montague’s “Burn, baby! BURN!”.',
  },
  'src.burnbaby.mottos': {
    file: 'Luminary099/BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc', start: 53, end: 72,
    title: 'Master ignition routine header: by Adler and Eyles — HONI SOIT QUI MAL Y PENSE, NOLI SE TANGERE',
    note: '“Honi soit qui mal y pense” is the motto of the Order of the Garter; “Noli se tangere”, above the tables, plays on the Latin “noli me tangere” (touch me not).',
  },
  'src.burnbaby.hello': {
    file: 'Luminary099/BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc', label: 'P40AUTO', start: 904, end: 925,
    title: '“HELLO THERE.” … “GOODBYE. COME AGAIN SOON.” — P40AUTO checks PGNCS/auto modes',
  },
  'src.burnbaby.pooh': {
    file: 'Luminary099/BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc', label: '?', start: 954, end: 954,
    title: 'A label named “?”, equal to GOTOPOOH',
  },
  'src.landing.flagorgy': {
    file: 'Luminary099/THE_LUNAR_LANDING.agc', label: 'FLAGORGY', start: 64, end: 73,
    title: 'FLAGORGY — “DIONYSIAN FLAG WAVING”: P63 sets and clears its flags',
  },
  'src.landing.crank': {
    file: 'Luminary099/THE_LUNAR_LANDING.agc', label: 'P63SPOT3', start: 239, end: 255,
    title: '“ASTRONAUT: PLEASE CRANK THE SILLY THING AROUND” … “OFF TO SEE THE WIZARD”',
    note: 'If the landing-radar antenna is not in position 1, P63 flashes checklist code 00500 (“switch LR antenna to position 1”) and on PRO checks again — “SEE IF HE’S LYING” — before jumping to BURNBABY.',
  },
  'src.landing.ended-up': {
    file: 'Luminary099/THE_LUNAR_LANDING.agc', start: 317, end: 322,
    title: 'P68: “ASTRONAUT: NOW LOOK WHERE YOU ENDED UP” (flashing V06N43)',
  },
  'src.guidance.guildenstern': {
    file: 'Luminary099/LUNAR_LANDING_GUIDANCE_EQUATIONS.agc', start: 124, end: 142,
    title: 'GUILDENSTERN: the auto-modes monitor (R13)',
    note: 'Its stated philosophy: the manual-throttle discrete appearing selects P67 and disappearing selects P66; the attitude-hold discrete selects P66 unless already in P67 (lines 194–208 also require a ROD switch click before P66).',
  },
  'src.guidance.hope': {
    file: 'Luminary099/LUNAR_LANDING_GUIDANCE_EQUATIONS.agc', label: 'VRTSTART', start: 174, end: 185,
    title: '“TEMPORARY, I HOPE HOPE HOPE” — entering the vertical phase (P65/P66/P67)',
  },
  'src.pinball.shakespeare': {
    file: 'Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc', start: 216, end: 225,
    title: '“…MEN ABOUT THEE THAT USUALLY TALK OF A NOUN AND A VERB” — Shakespeare in PINBALL',
    note: 'The listing cites Henry 6, Act 2, Scene 4; a transcriber’s note points out it is Henry VI, Part 2, Act IV, Scene VII.',
  },
  'src.cmc.pinball.shakespeare': {
    file: 'Comanche055/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc', start: 179, end: 185,
    title: 'The same Shakespeare quotation in the Command Module’s PINBALL',
  },
  'src.gotopooh': {
    file: 'Luminary099/FRESH_START_AND_RESTART.agc', start: 617, end: 650,
    title: 'GOTOPOOH: back to P00 (“POOH”), with a flashing V37 request',
  },
};
