// Source anchors for the Executive, the Waitlist, alarms and restarts
// (prefixes `exec.` `alarm.` `restart.` `waitlist.`). Every range was read in
// this repository (1-based line numbers); test/anchors.test.mjs re-checks
// that the files exist, the ranges fit and `label` begins line `start`.
// Research: src-executive.md §3-§14, web-1202-b.md §1.5, §2.

const L = 'Luminary099/';
const C = 'Comanche055/';

export const ANCHORS = {
  // ---------------- Executive: entry points ----------------
  'exec.novac': {
    file: `${L}EXECUTIVE.agc`, start: 37, end: 48, label: 'NOVAC',
    title: 'NOVAC: request a job that needs a core set only',
    note: 'Adds FAKEPRET to the priority: a basic-language job gets a fake work area instead of a VAC area.',
  },
  'exec.findvac': {
    file: `${L}EXECUTIVE.agc`, start: 52, end: 68, label: 'FINDVAC',
    title: 'FINDVAC / SPVAC: request a job that needs a core set and a VAC area',
    note: 'Any job that runs interpretive (vector/matrix) code needs a VAC area for its push-down list.',
  },
  'exec.jobsleep': {
    file: `${L}EXECUTIVE.agc`, start: 90, end: 103, label: 'JOBSLEEP',
    title: 'JOBSLEEP / JOBWAKE: a sleeping job keeps its core set',
  },
  'exec.priochng': {
    file: `${L}EXECUTIVE.agc`, start: 107, end: 113, label: 'PRIOCHNG',
    title: 'PRIOCHNG: a running job changes its own priority',
  },
  'exec.fakepret': {
    file: `${L}EXECUTIVE.agc`, start: 126, end: 126, label: 'FAKEPRET',
    title: 'FAKEPRET: the fake work-area address of NOVAC jobs',
    note: 'The low 9 bits of a PRIORITY word hold the work-area address; FAKEPRET lies below every VAC area, so at equal priority a VAC job outranks a NOVAC job.',
  },
  'exec.findvac.1201': {
    file: `${L}EXECUTIVE.agc`, start: 133, end: 153, label: 'FINDVAC2',
    title: 'Find a VAC area — or 1201',
    note: 'CCS VAC1USE … VAC5USE in order; when all five are in use: TC BAILOUT1, OCT 1201 “NO VAC AREAS”.',
  },
  'exec.vacfound': {
    file: `${L}EXECUTIVE.agc`, start: 149, end: 153, label: 'VACFOUND',
    title: 'VACFOUND: reserve the VAC area and put its address in the priority word',
  },
  'exec.novac.1202': {
    file: `${L}EXECUTIVE.agc`, start: 155, end: 208, label: 'NOVAC2',
    title: 'Find a core set — or 1202',
    note: 'NO.CORES DEC 7 runs the loop 7…0: eight core sets. The comment “SEVEN SETS OF ELEVEN REGISTERS” is stale.',
  },
  'exec.setloc': {
    file: `${L}EXECUTIVE.agc`, start: 189, end: 199, label: 'SETLOC',
    title: 'SETLOC: does the new job outrank the running one?',
    note: 'Compares whole PRIORITY words (priority + work-area address); a switch is signalled through NEWJOB.',
  },
  'exec.nextcore': {
    file: `${L}EXECUTIVE.agc`, start: 201, end: 208, label: 'NEXTCORE',
    title: 'NEXTCORE: no core set left — TC BAILOUT1, OCT 1202',
  },
  'exec.chanjob': {
    file: `${L}EXECUTIVE.agc`, start: 214, end: 255, label: 'CHANJOB',
    title: 'CHANJOB: swap core set 0 with the chosen job',
    note: 'The running job always occupies core set 0.',
  },
  'exec.endjob': {
    file: `${L}EXECUTIVE.agc`, start: 371, end: 441, label: 'ENDJOB1',
    title: 'ENDOFJOB: free the core set and VAC area, scan for the next job',
  },
  'exec.ej1': {
    file: `${L}EXECUTIVE.agc`, start: 443, end: 457, label: 'EJ1',
    title: 'EJ1: keep the highest priority word (the first of equals wins)',
  },
  'exec.dummyjob': {
    file: `${L}EXECUTIVE.agc`, start: 464, end: 486, label: 'DUMMYJOB',
    title: 'DUMMYJOB: nothing to do — the COMP ACTY lamp goes off',
  },

  // ---------------- Executive: erasable memory ----------------
  'exec.erasable.coresets': {
    file: `${L}ERASABLE_ASSIGNMENTS.agc`, start: 374, end: 383,
    title: 'The core sets: eight sets of 12 registers',
    note: 'MPAC, MODE, LOC, BANKSET, PUSHLOC, PRIORITY — then ERASE +83D for the other seven sets. The “(84D)” header is stale.',
  },
  'exec.erasable.vacs': {
    file: `${L}ERASABLE_ASSIGNMENTS.agc`, start: 432, end: 443,
    title: 'The five VAC areas (43 words each, plus a use word)',
  },
  'exec.erasable.newjob': {
    file: `${L}ERASABLE_ASSIGNMENTS.agc`, start: 217, end: 218,
    title: 'NEWJOB at address 67, watched by the night-watchman hardware',
  },
  'exec.interp-newjob': {
    file: `${L}INTERPRETER.agc`, start: 74, end: 84, label: 'DANZIG',
    title: 'The interpreter tests NEWJOB between every instruction',
  },

  // ---------------- Jobs and tasks of the descent ----------------
  'exec.job.servicer': {
    file: `${L}SERVICER.agc`, start: 79, end: 104, label: 'READACCS',
    title: 'READACCS (every 2 s) creates SERVICER: CA PRIO20 / TC FINDVAC',
    note: 'The task does not check whether the previous SERVICER has finished.',
  },
  'exec.job.guidance': {
    file: `${L}LUNAR_LANDING_GUIDANCE_EQUATIONS.agc`, start: 117, end: 121, label: 'LUNLAND',
    title: 'LUNLAND: guidance protected as a PRIO21 job (restart group 3)',
  },
  'exec.job.makeplay': {
    file: `${L}DISPLAY_INTERFACE_ROUTINES.agc`, start: 833, end: 856, label: 'GODSPRS1',
    title: 'The display job: NOVAC at the user’s priority, or SPVAC for a flashing display',
    note: '“IS THIS A FLASHING R DISPLAY … YES, MAKE DSPLAY JOB A VAC”.',
  },
  'exec.makeplay.prio33': {
    file: `${L}DISPLAY_INTERFACE_ROUTINES.agc`, start: 742, end: 747, label: 'MAKEPLAY',
    title: 'MAKEPLAY raises itself to PRIO33 once it runs',
  },
  'exec.job.mondo': {
    file: `${L}PINBALL_GAME_BUTTONS_AND_LIGHTS.agc`, start: 2373, end: 2395, label: 'MONREQ',
    title: 'The V16 monitor: MONREQ every second creates MONDO (NOVAC, priority 30)',
  },
  'exec.monitor.start': {
    file: `${L}PINBALL_GAME_BUTTONS_AND_LIGHTS.agc`, start: 2333, end: 2371, label: 'MONITOR',
    title: 'MONITOR: Verb 16 starts the once-a-second refresh',
  },
  'exec.job.charin': {
    file: `${L}KEYRUPT_UPRUPT.agc`, start: 35, end: 55, label: 'KEYRUPT1',
    title: 'Every DSKY key press becomes a CHARIN job (NOVAC, priority 30)',
  },
  'exec.job.lrhjob': {
    file: `${L}SERVICER.agc`, start: 664, end: 687, label: 'LRHTASK',
    title: 'LRHTASK: an LR altitude read job ~50 ms before each READACCS',
  },
  'exec.lrhjob.sleep': {
    file: `${L}SERVICER.agc`, start: 1533, end: 1536, label: 'LRHJOB',
    title: 'LRHJOB sleeps about 95 ms holding its core set',
  },
  'exec.job.readv': {
    file: `${L}SERVICER.agc`, start: 1389, end: 1392, label: 'READV',
    title: 'READV: SERVICER asks for a velocity read job (PRIO32 NOVAC)',
  },
  'exec.job.lrvjob': {
    file: `${L}SERVICER.agc`, start: 1471, end: 1483, label: 'LRVJOB',
    title: 'LRVJOB sleeps about 500 ms while the LR samples velocity',
  },
  'exec.job.higatjob': {
    file: `${L}SERVICER.agc`, start: 1621, end: 1628, label: 'HIGATJOB',
    title: 'HIGATJOB: reposition the LR antenna, sleep until it has moved',
  },
  'exec.job.gyro': {
    file: `${L}IMU_COMPENSATION_PACKAGE.agc`, start: 103, end: 110,
    title: '1/GYRO: gyro torquing job, “PRIO GREATER THAN SERVICER”',
  },
  'exec.job.rodcomp': {
    file: `${L}LUNAR_LANDING_GUIDANCE_EQUATIONS.agc`, start: 934, end: 946, label: 'RODTASK',
    title: 'P66: RODTASK every second creates RODCOMP (PRIO22 FINDVAC)',
  },
  'exec.r10r11': {
    file: `${L}P70-P71.agc`, start: 36, end: 49, label: 'R10,R11',
    title: 'R10,R11: landing analog displays four times a second (a task, no core set)',
  },

  // ---------------- Comanche055 ----------------
  'exec.cm.novac2': {
    file: `${C}EXECUTIVE.agc`, start: 154, end: 162, label: 'NOVAC2',
    title: 'Comanche 055: NO.CORES DEC 6 — seven core sets',
  },
  'exec.cm.1202': {
    file: `${C}EXECUTIVE.agc`, start: 200, end: 205, label: 'NEXTCORE',
    title: 'Comanche 055: no core set — TC BAILOUT, OCT 1202',
  },
  'exec.cm.coresets': {
    file: `${C}ERASABLE_ASSIGNMENTS.agc`, start: 1620, end: 1627, label: 'MPAC',
    title: 'Comanche 055 core sets: “SEVEN SETS OF 12 REGISTERS EACH”',
  },

  // ---------------- Alarms ----------------
  'alarm.alarm': {
    file: `${L}ALARM_AND_ABORT.agc`, start: 50, end: 99, label: 'ALARM',
    title: 'ALARM: store the code in FAILREG, light PROG on the first alarm',
  },
  'alarm.failreg': {
    file: `${L}ALARM_AND_ABORT.agc`, start: 66, end: 99, label: 'CHKFAIL1',
    title: 'The FAILREG fill rule: first, second, then the latest alarm',
    note: 'With all three registers in use, MULTFAIL writes the newest code plus bit 15 into FAILREG+2.',
  },
  'alarm.proglarm': {
    file: `${L}ALARM_AND_ABORT.agc`, start: 85, end: 87, label: 'PROGLARM',
    title: 'PROGLARM: turn on the PROG lamp (bit 9 of DSPTAB+11D)',
  },
  'alarm.priolarm': {
    file: `${L}ALARM_AND_ABORT.agc`, start: 117, end: 126, label: 'PRIOLARM',
    title: 'PRIOLARM: an alarm that flashes V05N09 itself',
  },
  'alarm.bailout': {
    file: `${L}ALARM_AND_ABORT.agc`, start: 133, end: 149, label: 'BAILOUT',
    title: 'BAILOUT → WHIMPER → ENEMA: alarm, then software restart',
  },
  'alarm.poodoo': {
    file: `${L}ALARM_AND_ABORT.agc`, start: 150, end: 177, label: 'POODOO',
    title: 'POODOO: alarm, then abort to P00 (GOPOODOO)',
  },
  'alarm.bailout1': {
    file: `${L}ALARM_AND_ABORT.agc`, start: 189, end: 196, label: 'BAILOUT1',
    title: 'BAILOUT1: the entry the Executive and Waitlist use for 1201/1202/1203',
  },
  'alarm.list': {
    file: `${L}ASSEMBLY_AND_OPERATION_INFORMATION.agc`, start: 896, end: 1021,
    title: 'Alarm codes for Luminary',
  },
  'alarm.list.exec': {
    file: `${L}ASSEMBLY_AND_OPERATION_INFORMATION.agc`, start: 966, end: 968,
    title: '01201 / 01202 / 01203: Executive and Waitlist overflow',
  },
  'alarm.legend': {
    file: `${L}ASSEMBLY_AND_OPERATION_INFORMATION.agc`, start: 1014, end: 1021,
    title: 'Legend: * software restart, ** go to R00, P priority alarm',
  },
  'alarm.list.cm': {
    file: `${C}ASSEMBLY_AND_OPERATION_INFORMATION.agc`, start: 867, end: 959,
    title: 'Alarm codes for Comanche 055 (“ALARM CODES FOR 504”)',
  },
  'alarm.noun09': {
    file: `${L}PINBALL_NOUN_TABLES.agc`, start: 216, end: 217,
    title: 'Noun 08 (alarm data) and Noun 09 (alarm codes = FAILREG)',
  },
  'alarm.erasable.failreg': {
    file: `${L}ERASABLE_ASSIGNMENTS.agc`, start: 426, end: 430,
    title: 'FAILREG: three alarm-code registers',
  },
  'alarm.rset': {
    file: `${L}PINBALL_GAME_BUTTONS_AND_LIGHTS.agc`, start: 3732, end: 3787, label: 'ERROR',
    title: 'RSET: PROG lamp off, FAILREG zeroed',
  },

  // ---------------- Restarts ----------------
  'restart.whimper': {
    file: `${L}ALARM_AND_ABORT.agc`, start: 144, end: 149, label: 'WHIMPER',
    title: 'WHIMPER: leave interrupt mode and go to ENEMA',
  },
  'restart.enema': {
    file: `${L}FRESH_START_AND_RESTART.agc`, start: 281, end: 289, label: 'ENEMA',
    title: 'ENEMA: the software restart',
  },
  'restart.goprog3': {
    file: `${L}FRESH_START_AND_RESTART.agc`, start: 290, end: 350, label: 'GOPROG3',
    title: 'GOPROG3: check the phase tables, redisplay the mode, restart the groups',
    note: 'A disagreement between PHASEn and -PHASEn is alarm 1107 and a fresh start.',
  },
  'restart.nxtrst': {
    file: `${L}FRESH_START_AND_RESTART.agc`, start: 323, end: 346,
    title: 'NXTRST: every active restart group is restarted (groups 6 … 1)',
  },
  'restart.startsb2': {
    file: `${L}FRESH_START_AND_RESTART.agc`, start: 428, end: 431, label: 'STARTSB2',
    title: 'STARTSB2: “DURING SOFTWARE RESTART, DO NOT DISTURB” engine and ISS bits',
  },
  'restart.wipe-waitlist': {
    file: `${L}FRESH_START_AND_RESTART.agc`, start: 475, end: 505,
    title: 'Restart: every Waitlist task discarded',
  },
  'restart.wipe-exec': {
    file: `${L}FRESH_START_AND_RESTART.agc`, start: 507, end: 529,
    title: 'Restart: all eight core sets and five VAC areas freed',
  },
  'restart.kill-monitor': {
    file: `${L}FRESH_START_AND_RESTART.agc`, start: 532, end: 562, label: 'DSPOFF',
    title: 'Restart: DSKY blanked, the monitor killed (MONSAVE), interface displays killed',
  },
  'restart.goprog': {
    file: `${L}FRESH_START_AND_RESTART.agc`, start: 206, end: 219, label: 'GOPROG',
    title: 'GOPROG: the hardware restart (REDOCTR counts it)',
  },
  'restart.setinfl': {
    file: `${L}FRESH_START_AND_RESTART.agc`, start: 249, end: 263, label: 'SETINFL',
    title: 'Hardware restart: PROG, GIMBAL LOCK and NO ATT lamps left intact',
  },
  'restart.slap1': {
    file: `${L}FRESH_START_AND_RESTART.agc`, start: 38, end: 60, label: 'SLAP1',
    title: 'SLAP1: fresh start (V36)',
  },
  'restart.go-vector': {
    file: `${L}INTERRUPT_LEAD_INS.agc`, start: 29, end: 35,
    title: 'Address 4000: where a hardware restart (GOJAM) begins',
  },
  'restart.v69': {
    file: `${L}EXTENDED_VERBS.agc`, start: 81, end: 81, label: 'VERB69',
    title: 'Verb 69: TC to itself — the TC trap forces a hardware restart',
  },
  'restart.restarts': {
    file: `${L}RESTARTS_ROUTINE.agc`, start: 35, end: 59, label: 'RESTARTS',
    title: 'RESTARTS: turn a phase into jobs and tasks again',
  },
  'restart.findtime': {
    file: `${L}RESTARTS_ROUTINE.agc`, start: 120, end: 137, label: 'FINDTIME',
    title: 'FINDTIME: restarted tasks keep their schedule (TBASE)',
  },
  'restart.phaschng': {
    file: `${L}PHASE_TABLE_MAINTENANCE.agc`, start: 228, end: 239, label: 'PHASCHNG',
    title: 'PHASCHNG: register a restart point (“waypoint”)',
  },
  'restart.phase-types': {
    file: `${L}PHASE_TABLE_MAINTENANCE.agc`, start: 174, end: 179,
    title: 'Phase-change word layouts: types A, B and C',
  },
  'restart.mmdsplay': {
    file: `${L}PHASE_TABLE_MAINTENANCE.agc`, start: 45, end: 75, label: 'MMDSPLAY',
    title: 'MMDSPLAY: put the major mode back on the PROG digits (DSPMMJB, PRIO30)',
  },
  'restart.tables.5': {
    file: `${L}RESTART_TABLES.agc`, start: 249, end: 278, label: '5.2SPOT',
    title: 'Restart table, group 5: REREADAC and SERVICER',
  },
  'restart.tables.2': {
    file: `${L}RESTART_TABLES.agc`, start: 155, end: 157, label: '2.21SPOT',
    title: 'Restart table, group 2: R10,R11 every 0.25 s',
  },
  'restart.servicer': {
    file: `${L}SERVICER.agc`, start: 175, end: 179, label: 'SERVICER',
    title: 'SERVICER protects itself: PHASCHNG OCT 16035 (5.3 + job GETABVAL)',
  },
  'restart.quikfaz5': {
    file: `${L}SERVICER.agc`, start: 1412, end: 1419, label: 'QUIKFAZ5',
    title: 'QUIKFAZ5: move SERVICER’s restart point forward',
  },
  'restart.lunland': {
    file: `${L}LUNAR_LANDING_GUIDANCE_EQUATIONS.agc`, start: 117, end: 121, label: 'LUNLAND',
    title: '“PROTECT GUIDANCE WITH PRIO 21 JUST HIGHER THAN SERVICER’S PRIORITY”',
  },
  'restart.dispexit': {
    file: `${L}LUNAR_LANDING_GUIDANCE_EQUATIONS.agc`, start: 835, end: 837, label: 'DISPEXIT',
    title: 'DISPEXIT: “KILL GROUP 3: DISPLAYS WILL BE RESTORED BY NEXT GUIDANCE CYCLE”',
  },
  'restart.fastchng': {
    file: `${L}LUNAR_LANDING_GUIDANCE_EQUATIONS.agc`, start: 1423, end: 1429, label: 'FASTCHNG',
    title: 'FASTCHNG: move the guidance restart point forward',
  },

  // ---------------- Waitlist ----------------
  'waitlist.header': {
    file: `${L}WAITLIST.agc`, start: 59, end: 62,
    title: 'Waitlist rules: 1 cs to 162.5 s, 9 tasks maximum, interrupts inhibited',
  },
  'waitlist.entry': {
    file: `${L}WAITLIST.agc`, start: 129, end: 138, label: 'WAITLIST',
    title: 'WAITLIST: schedule a task',
  },
  'waitlist.endtask': {
    file: `${L}WAITLIST.agc`, start: 174, end: 174, label: 'ENDTASK',
    title: 'ENDTASK: the dummy task that fills empty slots',
  },
  'waitlist.1203': {
    file: `${L}WAITLIST.agc`, start: 334, end: 336, label: 'FILLED',
    title: 'FILLED: “NO ROOM IN THE INN” — BAILOUT1, OCT 01203',
  },
  'waitlist.t3rupt': {
    file: `${L}WAITLIST.agc`, start: 380, end: 417, label: 'T3RUPT',
    title: 'T3RUPT: a task is due — dispatch it',
  },
  'waitlist.taskover': {
    file: `${L}WAITLIST.agc`, start: 424, end: 439, label: 'TASKOVER',
    title: 'TASKOVER: end of a task',
  },
  'waitlist.1204': {
    file: `${L}WAITLIST.agc`, start: 561, end: 563, label: 'WAITPOOH',
    title: 'WAITPOOH: zero or negative delay — POODOO 01204',
  },
};
