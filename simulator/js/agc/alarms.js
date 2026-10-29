// Alarm and abort codes, and the FAILREG alarm registers.
//
// The tables are transcribed from the alarm lists in the listings
// ("ALARM CODES FOR LUMINARY", Luminary099/ASSEMBLY_AND_OPERATION_INFORMATION.agc:
// 896-1021, and "ALARM CODES FOR 504", Comanche055/ASSEMBLY_AND_OPERATION_
// INFORMATION.agc:867-959). `line` is the line of the code in that file.
// `cls` is the class from the listing's legend:
//   'restart'  — "*  AN ABORT CODE THAT RESULTS IN A SOFTWARE RESTART" (BAILOUT)
//   'p00'      — "** A MORE SERIOUS ABORT CODE THAT RESULTS IN THE PROGRAM GOING TO R00" (POODOO)
//   'priority' — "P  A PRIORITY ALARM" (PRIOLARM: flashes V05N09)
//   'alarm'    — "ALL OTHERS ARE NON-ABORTIVE" (ALARM: PROG lamp only)
// (Luminary099 legend :1014-1021. Comanche055 marks every abort with one
// "*" and names the routine in an extra column, which is what `cls` follows.)
//
// Codes are numbers written in octal (0o1202); the DSKY shows them as five
// octal digits (01202) — use formatAlarmCode().
//
// AlarmRegisters models FAILREG, FAILREG+1, FAILREG+2
// (Luminary099/ERASABLE_ASSIGNMENTS.agc:430) and the fill rule in
// Luminary099/ALARM_AND_ABORT.agc:63-99:
//   CHKFAIL1: FAILREG empty    -> store there and PROGLARM (light PROG)
//   CHKFAIL2: FAILREG+1 empty  -> store there
//   FAIL3:    FAILREG+2 empty  -> store there
//   MULTFAIL: otherwise FAILREG+2 = code + BIT15 (the most recent alarm,
//             flagged; it reads 41202 in octal on V05N09)
// PROGLARM (:85-87) runs only for the first alarm since the registers were
// cleared (RSET, PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:3782-3786, or a fresh
// start). V05N09 shows R1 = FAILREG, R2 = FAILREG+1, R3 = FAILREG+2
// (PINBALL_NOUN_TABLES.agc:217).

export const ALARM_CLASSES = Object.freeze({
  restart: 'Abort: software restart (BAILOUT)',
  p00: 'Abort: program goes to P00 (POODOO)',
  priority: 'Priority alarm (flashing V05N09)',
  alarm: 'Non-abortive alarm (PROG lamp only)',
});

const BIT15 = 0o40000;

// Plain-English notes for the codes a viewer is likely to meet. These are
// explanations, not quotations from the listing.
const PLAIN = {
  0o1201: 'A job that needs a VAC area (scratch space for interpretive code) was requested, but all 5 VAC areas were in use. The Executive gave up and restarted the software.',
  0o1202: 'A job was requested, but all core sets (8 in the LM, 7 in the CM) were taken by jobs that had not finished. The Executive gave up and restarted the software.',
  0o1203: 'A ninth timed task was requested while the Waitlist already held its maximum of 9.',
  0o1204: 'A task was scheduled with a zero or negative delay — a programming error; the program goes to P00.',
  0o1107: 'After a restart the two redundant copies of a restart-phase word disagreed, so erasable memory is suspect and the computer does a fresh start.',
  0o1520: 'V37 (change program) was keyed when a program change is not allowed.',
  0o1210: 'Two programs tried to use the same device at the same time.',
  0o1406: 'The descent guidance or the ignition algorithm could not solve its equation.',
  0o1703: 'There was not enough time left to integrate the state vector before ignition, so TIG was moved.',
};

const ANCHOR = {
  0o1201: 'exec.findvac.1201',
  0o1202: 'exec.novac.1202',
  0o1203: 'waitlist.1203',
  0o1204: 'waitlist.1204',
  0o1107: 'restart.goprog3',
  0o1103: 'alarm.poodoo',
};

const RAW_LUMINARY099 = {
  0o105: { text: 'AOTMARK SYSTEM IN USE', cls: 'p00', setBy: '', line: 902 },
  0o107: { text: 'MORE THAN 5 MARK PAIRS', cls: 'alarm', setBy: 'AOTMARK', line: 903 },
  0o111: { text: 'MARK MISSING', cls: 'alarm', setBy: 'AOTMARK', line: 904 },
  0o112: { text: 'MARK OR MARK REJECT NOT BEING ACCEPTED', cls: 'alarm', setBy: 'AOTMARK', line: 905 },
  0o113: { text: 'NO INBITS', cls: 'alarm', setBy: 'AOTMARK', line: 906 },
  0o114: { text: 'MARK MADE BUT NOT DESIRED', cls: 'alarm', setBy: 'AOTMARK', line: 907 },
  0o115: { text: 'NO MARKS IN LAST PAIR TO REJECT', cls: 'alarm', setBy: 'AOTMARK', line: 908 },
  0o206: { text: 'ZERO ENCODE NOT ALLOWED WITH COARSE ALIGN + GIMBAL LOC', cls: 'alarm', setBy: 'IMU MODE SWITCHING', line: 909, end: 910 },
  0o207: { text: 'ISS TURNON REQUEST NOT PRESENT FOR 90 SEC', cls: 'alarm', setBy: 'T4RUPT', line: 911 },
  0o210: { text: 'IMU NOT OPERATING', cls: 'alarm', setBy: 'IMU MODE SWITCH, IMU-2, RD2, P51, P57', line: 912 },
  0o211: { text: 'COARSE ALIGN ERROR', cls: 'alarm', setBy: 'IMU MODE SWITCH', line: 913 },
  0o212: { text: 'PIPA FAIL BUT PIPA IS NOT BEING USED', cls: 'alarm', setBy: 'IMU MODE SWITCH, T4RPT', line: 914 },
  0o213: { text: 'IMU NOT OPERATING WITH TURN-ON REQUEST', cls: 'alarm', setBy: 'T4RUPT', line: 915 },
  0o214: { text: 'PROGRAM USING IMU WHEN TURNED OFF', cls: 'alarm', setBy: 'T4RUPT', line: 916 },
  0o217: { text: 'BAD RETURN FROM IMUSTALL', cls: 'alarm', setBy: 'P51, P52, P57', line: 917 },
  0o220: { text: 'IMU NOT ALIGNED - NO REFSMMAT', cls: 'alarm', setBy: 'R02, R47', line: 918 },
  0o401: { text: 'DESIRED GIMBAL ANGLE YIELDS GIMBAL LOCK', cls: 'alarm', setBy: 'INF ALIGN, IMU-2, FINDCDUW', line: 919, end: 920 },
  0o402: { text: 'FINDCDUW NOT CONTROLLING ATTITUDE', cls: 'alarm', setBy: 'FINDCDUW', line: 921 },
  0o404: { text: 'TWO STARS NOT AVAILABLE IN ANY DETENT', cls: 'alarm', setBy: 'R59, LUNAR SURFACE', line: 922 },
  0o405: { text: 'TWO STARS NOT AVAILABLE', cls: 'alarm', setBy: 'P52', line: 923 },
  0o421: { text: 'W-MATRIX OVERFLOW', cls: 'alarm', setBy: 'INTEGRV', line: 924 },
  0o430: { text: 'ACCELERATION OVERFLOW IN INTEGRATION', cls: 'p00', setBy: 'ORBITAL INTEGRATION', line: 925 },
  0o501: { text: 'RADAR ANTENNA OUT OF LIMITS', cls: 'priority', setBy: 'R23', line: 926 },
  0o502: { text: 'BAD RADAR GIMBAL ANGLE INPUT', cls: 'alarm', setBy: 'V41N72', line: 927 },
  0o503: { text: 'RADAR ANTENNA DESIGNATE FAIL', cls: 'priority', setBy: 'R21, NON-P IN V41N72', line: 928 },
  0o510: { text: 'RADAR AUTO DESCRETE NOT PRESENT', cls: 'alarm', setBy: 'R25', line: 929 },
  0o511: { text: 'LR NOT IN POSITION 2 OR REPOSITIONING', cls: 'alarm', setBy: 'SERVICER', line: 930 },
  0o514: { text: 'RR GOES OUT OF AUTO MODE WHILE IN USE', cls: 'priority', setBy: 'P20', line: 931 },
  0o515: { text: 'RR CDU FAIL DISCRETE PRESENT', cls: 'alarm', setBy: 'R25', line: 932 },
  0o520: { text: 'RADAR RUPT NOT EXPECTED AT THIS TIME', cls: 'alarm', setBy: 'RADAR READ', line: 933 },
  0o521: { text: 'COULD NOT READ RADAR', cls: 'alarm', setBy: 'P20', line: 934 },
  0o522: { text: 'LANDING RADAR POSITION CHANGE', cls: 'alarm', setBy: 'RADAR READ', line: 935 },
  0o523: { text: 'LR ANTENNA DIDN\'T ACHIEVE POSITION 2', cls: 'priority', setBy: 'SERVICER, V60 (NON-P IN V60)', line: 936 },
  0o525: { text: 'DELTA THETA GREATER THAN 3 DEGREES', cls: 'priority', setBy: 'R22', line: 937 },
  0o526: { text: 'RANGE GREATER THAN 400 NAUT. MILES', cls: 'priority', setBy: 'P20, P22', line: 938 },
  0o527: { text: 'LOS NOT IN MODE II COVERAGE WHILE ON LUNAR SURFACE OR VEHICLE MANEUVER REQUIRED', cls: 'priority', setBy: 'R21, R24; R24 (20)', line: 939, end: 941 },
  0o530: { text: 'LOS NOT IN MODE2 COVERAGE ON LUNAR SURFACE AFTER 600 SECS.', cls: 'priority', setBy: 'R21', line: 942, end: 943 },
  0o600: { text: 'IMAGINARY ROOTS ON FIRST ITERATION', cls: 'alarm', setBy: 'P32, P72', line: 944 },
  0o601: { text: 'PERIGEE ALTITUDE CSI LT PMIN1', cls: 'alarm', setBy: 'P32, P72.', line: 945 },
  0o602: { text: 'PERIGEE ALTITUDE CDH LT PMIN2', cls: 'alarm', setBy: 'P32, P72.', line: 949 },
  0o603: { text: 'CSI TO CDH TIME LT TMIN12', cls: 'alarm', setBy: 'P32, P72, P33, P73', line: 950 },
  0o604: { text: 'CDH TO TPI TIME LT TMIN23 OR COMPUTED CDH TIME GREATER THAN INPUT TP1 TIME', cls: 'alarm', setBy: 'P32, P72,', line: 951, end: 952 },
  0o605: { text: 'NUMBER OF ITERATIONS EXCEEDS LOOP MAXIMUM', cls: 'alarm', setBy: 'P32, P72', line: 953 },
  0o606: { text: 'DV EXCEEDS MAXIMUM', cls: 'alarm', setBy: 'P32, P72', line: 954 },
  0o607: { text: 'NO SOLN FROM TIME-THETA OR TIME-RADIUS', cls: 'p00', setBy: 'TIMETHET, TIMERAD', line: 955 },
  0o611: { text: 'NO TIG FOR GIVEN ELEV ANGLE', cls: 'alarm', setBy: 'P34, P74', line: 956 },
  0o701: { text: 'ILLEGAL OPTION CODE SELECTED', cls: 'alarm', setBy: 'P57', line: 957 },
  0o777: { text: 'PIPA FAIL CAUSED THE ISS WARNING', cls: 'alarm', setBy: 'T4RUPT', line: 958 },
  0o1102: { text: 'AGC SELF TEST ERROR', cls: 'alarm', setBy: 'SELF CHECK', line: 959 },
  0o1103: { text: 'UNUSED CCS BRANCH EXECUTED', cls: 'p00', setBy: 'ABORT', line: 960 },
  0o1104: { text: 'DELAY ROUTINE BUSY', cls: 'restart', setBy: 'EXEC', line: 961 },
  0o1105: { text: 'DOWNLINK TOO FAST', cls: 'alarm', setBy: 'T4RUPT', line: 962 },
  0o1106: { text: 'UPLINK TOO FAST', cls: 'alarm', setBy: 'T4RUPT', line: 963 },
  0o1107: { text: 'PHASE TABLE FAILURE. ASSUME ERASABLE MEMORY IS SUSPECT.', cls: 'alarm', setBy: 'RESTART', line: 964, end: 965 },
  0o1201: { text: 'EXECUTIVE OVERFLOW - NO VAC AREAS', cls: 'restart', setBy: 'EXEC', line: 966 },
  0o1202: { text: 'EXECUTIVE OVERFLOW - NO CORE SETS', cls: 'restart', setBy: 'EXEC', line: 967 },
  0o1203: { text: 'WAITLIST OVERFLOW - TOO MANY TASKS', cls: 'restart', setBy: 'WAITLIST', line: 968 },
  0o1204: { text: 'WAITLIST, VARDELAY, FIXDELAY, OR LONGCALL CALLED WITH ZERO OR NEGATIVE DELTA-TIME', cls: 'p00', setBy: 'WAITLIST ROUTINES', line: 969, end: 970 },
  0o1206: { text: 'SECOND JOB ATTEMPTS TO GO TO SLEEP VIA KYBD AND DISPLAY PROGRAM', cls: 'p00', setBy: 'PINBALL', line: 971, end: 972 },
  0o1207: { text: 'NO VAC AREAS FOR MARKS', cls: 'restart', setBy: 'AOTMARK', line: 973 },
  0o1210: { text: 'TWO PROGRAMS USING DEVICE AT SAME TIME', cls: 'restart', setBy: 'MODE SWITCHING', line: 974 },
  0o1211: { text: 'ILLEGAL INTERRUPT OF EXTENDED VERB', cls: 'restart', setBy: 'AOTMARK', line: 975 },
  0o1301: { text: 'ARCSIN-ARCCOS ARGUMENT TOO LARGE', cls: 'alarm', setBy: 'INTERPRETER', line: 976 },
  0o1302: { text: 'SQRT CALLED WITH NEGATIVE ARGUMENT', cls: 'p00', setBy: 'INTERPRETER', line: 977 },
  0o1406: { text: 'BAD RETURN FROM ROOTPSRS', cls: 'alarm', setBy: 'DESCENT GUIDANCE EQS.; IGNITION ALGORITHM (POODOO)', line: 978, end: 979, note: '1406 IS A POODOO DURING THE IGNITION ALGORITHM AND AN ALARM DURING THE ACTUAL GUIDANCE PHASE.' },
  0o1407: { text: 'VG INCREASING (DELTA-V ACCUMULATED .GT. 90 DEGREES AWAY FROM DESIRED THRUST VECTOR.)', cls: 'alarm', setBy: 'S40.8', line: 984, end: 986 },
  0o1410: { text: 'UNINTENTIONAL OVERFLOW IN GUIDANCE', cls: 'alarm', setBy: 'DESCENT GUIDANCE EQS.', line: 987 },
  0o1412: { text: 'DESCENT IGNALG NOT CONVERGING', cls: 'alarm', setBy: 'P63', line: 988 },
  0o1501: { text: 'KEYBOARD AND DISPLAY ALARM DURING INTERNAL USE (NVSUB). ABORT', cls: 'p00', setBy: 'PINBALL', line: 989, end: 990 },
  0o1502: { text: 'ILLEGAL FLASHING DISPLAY', cls: 'p00', setBy: 'GOPLAY', line: 991 },
  0o1520: { text: 'V37 REQUEST NOT PERMITTED AT THIS TIME', cls: 'alarm', setBy: 'V37', line: 992 },
  0o1600: { text: 'OVERFLOW IN DRIFT TEST', cls: 'alarm', setBy: 'IMU 4', line: 993 },
  0o1601: { text: 'BAD IMU TORQUE', cls: 'alarm', setBy: 'OPT PRE ALIGN CALIB; IMU 4 (LEM)', line: 994, end: 995 },
  0o1703: { text: 'IGNITION TIME SLIPPED', cls: 'alarm', setBy: 'MIDTOAVE', line: 996 },
  0o1706: { text: 'INCORRECT PROGRAM REQUESTED FOR VEHICLE CONFIGURATION', cls: 'alarm', setBy: 'P40, P42', line: 997, end: 998 },
  0o2000: { text: 'DAP STILL IN PROGRESS AT NEXT TIMES RUPT', cls: 'restart', setBy: 'DAP', line: 1002 },
  0o2001: { text: 'JET FAILURES HAVE DISABLED Y-Z TRANS.', cls: 'alarm', setBy: 'DAP', line: 1003 },
  0o2002: { text: 'JET FAILURES HAVE DISABLED X TRANSLATION', cls: 'alarm', setBy: 'DAP', line: 1004 },
  0o2003: { text: 'JET FAILURES HAVE DISABLED P-ROTATION', cls: 'alarm', setBy: 'DAP', line: 1005 },
  0o2004: { text: 'JET FAILURES HAVE DISABLED U-V ROTATION', cls: 'alarm', setBy: 'DAP', line: 1006 },
  0o3777: { text: 'ICDU FAIL CAUSED THE ISS WARNING', cls: 'alarm', setBy: 'T4RUPT', line: 1007 },
  0o4777: { text: 'ICDU, PIPA FAILS CAUSED THE ISS WARNING', cls: 'alarm', setBy: 'T4RUPT', line: 1008 },
  0o7777: { text: 'IMU FAIL CAUSED THE ISS WARNING', cls: 'alarm', setBy: 'T4RUPT', line: 1009 },
  0o10777: { text: 'IMU, PIPA FAILS CAUSED THE ISS WARNING', cls: 'alarm', setBy: 'T4RUPT', line: 1010 },
  0o13777: { text: 'IMU, ICDU FAILS CAUSED THE ISS WARNING', cls: 'alarm', setBy: 'T4RUPT', line: 1011 },
  0o14777: { text: 'IMU, ICDU, PIPA FAILS CAUSED THE ISS WARNING', cls: 'alarm', setBy: 'T4RUPT', line: 1012 },
};

const RAW_COMANCHE055 = {
  0o110: { text: 'NO MARK SINCE LAST MARK REJECT', cls: 'alarm', setBy: 'SXTMARK', routine: 'ALARM', line: 875 },
  0o112: { text: 'MARK NOT BEING ACCEPTED', cls: 'alarm', setBy: 'SXTMARK', routine: 'ALARM', line: 876 },
  0o113: { text: 'NO INBITS', cls: 'alarm', setBy: 'SXTMARK', routine: 'ALARM', line: 877 },
  0o114: { text: 'MARK MADE BUT NOT DESIRED', cls: 'alarm', setBy: 'SXTMARK', routine: 'ALARM', line: 878 },
  0o115: { text: 'OPTICS TORQUE REQUESTWITH SWITCH NOT AT CGC', cls: 'alarm', setBy: 'EXT VERB OPTICS CDU', routine: 'ALARM', line: 879, end: 880 },
  0o116: { text: 'OPTICS SWITCH ALTERED BEFORE 15 SEC ZERO TIME ELAPSED.', cls: 'alarm', setBy: 'T4RUPT', routine: 'ALARM', line: 881, end: 882 },
  0o117: { text: 'OPTICS TORQUE REQUEST WITH OPTICS NOT AVAILABLE (OPTIND=-0)', cls: 'alarm', setBy: 'EXT VERB OPTICS CDU', routine: 'ALARM', line: 883, end: 884 },
  0o120: { text: 'OPTICS TORQUE REQUEST WITH OPTICS NOT ZEROED', cls: 'alarm', setBy: 'T4RUPT', routine: 'ALARM', line: 885, end: 886 },
  0o121: { text: 'CDUS NO GOOD AT TIME OF MARK', cls: 'alarm', setBy: 'SXTMARK', routine: 'ALARM', line: 887 },
  0o122: { text: 'MARKING NOT CALLED FOR', cls: 'alarm', setBy: 'SXTMARK', routine: 'ALARM', line: 888 },
  0o124: { text: 'P17 TPI SEARCH - NO SAFE PERICTR HERE.', cls: 'alarm', setBy: 'TPI SEARCH', routine: 'ALARM', line: 889 },
  0o205: { text: 'BAD PIPA READING', cls: 'alarm', setBy: 'SERVICER', routine: 'ALARM', line: 890 },
  0o206: { text: 'ZERO ENCODE NOT ALLOWED WITH COARSE ALIGN + GIMBAL LOCK', cls: 'alarm', setBy: 'IMU MODE SWITCHING', routine: 'ALARM', line: 891, end: 892 },
  0o207: { text: 'ISS TURNON REQUEST NOT PRESENT FOR 90 SEC', cls: 'alarm', setBy: 'T4RUPT', routine: 'ALARM', line: 893 },
  0o210: { text: 'IMU NOT OPERATING', cls: 'alarm', setBy: 'IMU MODE SWITCH, IMU-2, R02, P51', routine: 'ALARM,VARALARM', line: 894 },
  0o211: { text: 'COARSE ALIGN ERROR - DRIVE > 2 DEGREES', cls: 'alarm', setBy: 'IMU MODE SWITCH', routine: 'ALARM', line: 895 },
  0o212: { text: 'PIPA FAIL BUT PIPA IS NOT BEING USED', cls: 'alarm', setBy: 'IMU MODE SWITCH,T4RPT', routine: 'ALARM', line: 896 },
  0o213: { text: 'IMU NOT OPERATING WITH TURN-ON REQUEST', cls: 'alarm', setBy: 'T4RUPT', routine: 'ALARM', line: 897 },
  0o214: { text: 'PROGRAM USING IMU WHEN TURNED OFF', cls: 'alarm', setBy: 'T4RUPT', routine: 'ALARM', line: 898 },
  0o215: { text: 'PREFERRED ORIENTATION NOT SPECIFIED', cls: 'alarm', setBy: 'P52,P54', routine: 'ALARM', line: 899 },
  0o217: { text: 'BAD RETURN FROM STALL ROUTINES.', cls: 'alarm', setBy: 'CURTAINS', routine: 'ALARM2', line: 900 },
  0o220: { text: 'IMU NOT ALIGNED - NO REFSMMAT', cls: 'alarm', setBy: 'R02,P51', routine: 'VARALARM', line: 901 },
  0o401: { text: 'DESIRED GIMBAL ANGLES YIELD GIMBAL LOCK', cls: 'alarm', setBy: 'IMF ALIGN, IMU-2', routine: 'ALARM', line: 902 },
  0o404: { text: 'TARGET OUT OF VIEW - TRUN ANGLE > 90 DEG', cls: 'priority', setBy: 'R52', routine: 'PRIOLARM', line: 903 },
  0o405: { text: 'TWO STARS NOT AVAILABLE', cls: 'alarm', setBy: 'P52,P54', routine: 'ALARM', line: 904 },
  0o406: { text: 'REND NAVIGATION NOT OPERATING', cls: 'alarm', setBy: 'R21,R23', routine: 'ALARM', line: 905 },
  0o407: { text: 'AUTO OPTICS REQUEST TRUN ANGLE > 50 DEG.', cls: 'alarm', setBy: 'R52', routine: 'ALARM', line: 906 },
  0o421: { text: 'W-MATRIX OVERFLOW', cls: 'alarm', setBy: 'INTEGRV', routine: 'VARALARM', line: 907 },
  0o430: { text: 'INTEG. ABORT DUE TO SUBSURFACE S. V.', cls: 'p00', setBy: 'ALL CALLS TO INTEG', routine: 'POODOO', line: 908 },
  0o600: { text: 'IMAGINARY ROOTS ON FIRST ITERATION', cls: 'alarm', setBy: 'P32, P72', routine: 'VARALARM', line: 909 },
  0o601: { text: 'PERIGEE ALTITUDE LT PMIN1', cls: 'alarm', setBy: 'P32,P72,', routine: 'VARALARM', line: 910 },
  0o602: { text: 'PERIGEE ALTITUDE LT PMIN2', cls: 'alarm', setBy: 'P32,P72,', routine: 'VARALARM', line: 911 },
  0o603: { text: 'CSI TO CDH TIME LT PMIN22', cls: 'alarm', setBy: 'P32,P72,P33,P73', routine: 'VARALARM', line: 912 },
  0o604: { text: 'CDH TO TPI TIME LT PMIN23', cls: 'alarm', setBy: 'P32,P72', routine: 'VARALARM', line: 913 },
  0o605: { text: 'NUMBER OF ITERATIONS EXCEEDS LOOP MAXIMUM', cls: 'alarm', setBy: 'P32,P72,P37', routine: 'VARALARM', line: 914 },
  0o606: { text: 'DV EXCEEDS MAXIMUM', cls: 'alarm', setBy: 'P32,P72', routine: 'VARALARM', line: 915 },
  0o607: { text: 'NO SOLN FROM TIME-THETA OR TIME-RADIUS', cls: 'p00', setBy: 'TIMETHET,TIMERAD', routine: 'POODOO', line: 916 },
  0o610: { text: 'LAMBDA LESS THAN UNITY', cls: 'p00', setBy: 'P37', routine: 'POODOO', line: 918 },
  0o611: { text: 'NO TIG FOR GIVEN ELEV ANGLE', cls: 'alarm', setBy: 'P34,P74', routine: 'VARALARM', line: 919 },
  0o612: { text: 'STATE VECTOR IN WRONG SPHERE OF INFLUENCE', cls: 'alarm', setBy: 'P37', routine: 'VARALARM', line: 920 },
  0o613: { text: 'REENTRY ANGLE OUT OF LIMITS', cls: 'alarm', setBy: 'P37', routine: 'VARALARM', line: 921 },
  0o777: { text: 'PIPA FAIL CAUSED ISS WARNING.', cls: 'alarm', setBy: 'T4RUPT', routine: 'VARALARM', line: 922 },
  0o1102: { text: 'CMC SELF TEST ERROR', cls: 'alarm', setBy: '', routine: 'ALARM2', line: 923 },
  0o1103: { text: 'UNUSED CCS BRANCH EXECUTED', cls: 'p00', setBy: 'ABORT', routine: 'POODOO', line: 924 },
  0o1104: { text: 'DELAY ROUTINE BUSY', cls: 'restart', setBy: 'EXEC', routine: 'BAILOUT', line: 925 },
  0o1105: { text: 'DOWNLINK TOO FAST', cls: 'alarm', setBy: 'T4RUPT', routine: 'ALARM', line: 926 },
  0o1106: { text: 'UPLINK TOO FAST', cls: 'alarm', setBy: 'T4RUPT', routine: 'ALARM', line: 927 },
  0o1107: { text: 'PHASE TABLE FAILURE. ASSUME ERASABLE MEMORY IS DESTROYED', cls: 'alarm', setBy: 'RESTART (sic RESATRT)', routine: 'ALARM', line: 928, end: 929 },
  0o1201: { text: 'EXECUTIVE OVERFLOW-NO VAC AREAS', cls: 'restart', setBy: 'EXEC', routine: 'BAILOUT', line: 930 },
  0o1202: { text: 'EXECUTIVE OVERFLOW-NO CORE SETS', cls: 'restart', setBy: 'EXEC', routine: 'BAILOUT', line: 931 },
  0o1203: { text: 'WAITLIST OVERFLOW-TOO MANY TASKS', cls: 'restart', setBy: 'WAITLIST', routine: 'BAILOUT', line: 932 },
  0o1204: { text: 'NEGATIVE OR ZERO WAITLIST CALL', cls: 'p00', setBy: 'WAITLIST', routine: 'POODOO', line: 933 },
  0o1206: { text: 'SECOND JOB ATTEMPTS TO GO TO SLEEP VIA KEYBOARD AND DISPLAY PROGRAM', cls: 'p00', setBy: 'PINBALL', routine: 'POODOO', line: 934, end: 935 },
  0o1207: { text: 'NO VAC AREA FOR MARKS', cls: 'restart', setBy: 'SXTMARK', routine: 'BAILOUT', line: 936 },
  0o1210: { text: 'TWO PROGRAMS USING DEVICE AT SAME TIME', cls: 'p00', setBy: 'IMU MODE SWITCH', routine: 'POODOO', line: 937 },
  0o1211: { text: 'ILLEGAL INTERRUPT OF EXTENDED VERB', cls: 'restart', setBy: 'SXTMARK', routine: 'BAILOUT', line: 938 },
  0o1301: { text: 'ARCSIN-ARCCOS ARGUMENT TOO LARGE', cls: 'alarm', setBy: 'INTERPRETER', routine: 'ALARM', line: 939 },
  0o1302: { text: 'SQRT CALLED WITH NEGATIVE ARGUMENT.ABORT', cls: 'p00', setBy: 'INTERPRETER', routine: 'POODOO', line: 940 },
  0o1407: { text: 'VG INCREASING', cls: 'alarm', setBy: 'S40.8', routine: 'ALARM', line: 941 },
  0o1426: { text: 'IMU UNSATISFACTORY', cls: 'alarm', setBy: 'P61, P62', routine: 'ALARM', line: 942 },
  0o1427: { text: 'IMU REVERSED', cls: 'alarm', setBy: 'P61, P62', routine: 'ALARM', line: 943 },
  0o1501: { text: 'KEYBOARD AND DISPLAY ALARM DURING INTERNAL USE (NVSUB). ABORT.', cls: 'p00', setBy: 'PINBALL', routine: 'POODOO', line: 944, end: 945 },
  0o1502: { text: 'ILLEGAL FLASHING DISPLAY', cls: 'p00', setBy: 'GOPLAY', routine: 'POODOO', line: 946 },
  0o1520: { text: 'V37 REQUEST NOT PERMITTED AT THIS TIME', cls: 'alarm', setBy: 'V37', routine: 'ALARM', line: 947 },
  0o1521: { text: 'P01 ILLEGALLY SELECTED', cls: 'p00', setBy: 'P01, P07', routine: 'POODOO', line: 948 },
  0o1600: { text: 'OVERFLOW IN DRIFT TEST', cls: 'alarm', setBy: 'OPT PRE ALIGN CALIB', routine: 'ALARM', line: 949 },
  0o1601: { text: 'BAD IMU TORQUE', cls: 'alarm', setBy: 'OPT PRE ALIGN CALIB', routine: 'ALARM', line: 950 },
  0o1602: { text: 'BAD OPTICS DURING VERIFICATION', cls: 'alarm', setBy: 'OPTALGN CALIB (CSM)', routine: 'ALARM', line: 951 },
  0o1703: { text: 'INSUF. TIME FOR INTEG., TIG WAS SLIPPED', cls: 'alarm', setBy: 'R41', routine: 'ALARM', line: 952 },
  0o3777: { text: 'ICDU FAIL CAUSED THE ISS WARNING', cls: 'alarm', setBy: 'T4RUPT', routine: 'VARALARM', line: 953 },
  0o4777: { text: 'ICDU , PIPA FAILS CAUSED THE ISS WARNING', cls: 'alarm', setBy: 'T4RUPT', routine: 'VARALARM', line: 954 },
  0o7777: { text: 'IMU FAIL CAUSED THE ISS WARNING', cls: 'alarm', setBy: 'T4RUPT', routine: 'VARALARM', line: 955 },
  0o10777: { text: 'IMU , PIPA FAILS CAUSED THE ISS WARNING', cls: 'alarm', setBy: 'T4RUPT', routine: 'VARALARM', line: 956 },
  0o13777: { text: 'IMU , ICDU FAILS CAUSED THE ISS WARNING', cls: 'alarm', setBy: 'T4RUPT', routine: 'VARALARM', line: 957 },
  0o14777: { text: 'IMU,ICDU,PIPA FAILS CAUSED THE ISSWNING', cls: 'alarm', setBy: 'T4RUPT', routine: 'VARALARM', line: 958 },
};

function build(raw, file) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const code = Number(k);
    out[code] = Object.freeze({
      code,
      octal: formatAlarmCode(code),
      ...v,
      file,
      plain: PLAIN[code] || null,
      anchor: ANCHOR[code] || null,
      routine: v.routine || routineFor(v.cls),
    });
  }
  return Object.freeze(out);
}

function routineFor(cls) {
  return { restart: 'BAILOUT', p00: 'POODOO', priority: 'PRIOLARM', alarm: 'ALARM' }[cls] || 'ALARM';
}

export const ALARMS_LUMINARY099 = build(RAW_LUMINARY099, 'Luminary099/ASSEMBLY_AND_OPERATION_INFORMATION.agc');
export const ALARMS_COMANCHE055 = build(RAW_COMANCHE055, 'Comanche055/ASSEMBLY_AND_OPERATION_INFORMATION.agc');

export function alarmTable(software = 'Luminary099') {
  return software === 'Comanche055' ? ALARMS_COMANCHE055 : ALARMS_LUMINARY099;
}

// Five octal digits, as V05N09 shows them: 0o1202 -> '01202'.
export function formatAlarmCode(code) {
  const n = Number(code) & 0o77777;
  return n.toString(8).padStart(5, '0');
}

// Everything the UI needs to show one code. Unknown codes still get a
// description (the bit-15 "more than three alarms" flag is understood).
export function describeAlarm(code, software = 'Luminary099') {
  const n = Number(code) || 0;
  const multi = (n & BIT15) !== 0;
  const base = n & ~BIT15 & 0o77777;
  const entry = alarmTable(software)[base];
  return {
    code: base,
    octal: formatAlarmCode(n),
    multi,
    text: entry ? entry.text : 'UNKNOWN ALARM CODE',
    cls: entry ? entry.cls : 'alarm',
    classText: ALARM_CLASSES[entry ? entry.cls : 'alarm'],
    setBy: entry ? entry.setBy : '',
    plain: entry ? entry.plain : null,
    anchor: entry ? entry.anchor : null,
    file: entry ? entry.file : null,
    line: entry ? entry.line : null,
  };
}

// ----------------------------------------------------------------------
// FAILREG
// ----------------------------------------------------------------------

export class AlarmRegisters {
  // `dsky` (optional): PROG lamp on the first alarm. `bus` (optional):
  // emits 'alarm' { code, t, text, restart }. `now` (optional): () => GET.
  constructor({ software = 'Luminary099', dsky = null, bus = null, now = null, historyLimit = 200 } = {}) {
    this.software = software;
    this.dsky = dsky;
    this.bus = bus;
    this.now = now;
    this.historyLimit = historyLimit;
    // The three registers as stored: 0 = empty (+0), as V05N09 shows 00000.
    this.failreg = [0, 0, 0];
    this.last = null;
    this.history = [];
    this.count = 0;
  }

  // ALARM / BAILOUT / POODOO all log through CHKFAIL1. Returns
  // { first, slot } — `first` means PROGLARM ran (PROG lamp turned on).
  alarm(code, { t, restart = false, source = null } = {}) {
    const n = Number(code) & 0o77777;
    const time = typeof t === 'number' ? t : (this.now ? this.now() : 0);
    const f = this.failreg;
    let slot;
    let first = false;
    if (f[0] === 0) {
      f[0] = n;            // CHKFAIL1: LXCH FAILREG
      slot = 0;
      first = true;        // TCF PROGLARM
    } else if (f[1] === 0) {
      f[1] = n;            // CHKFAIL2
      slot = 1;
    } else if ((f[2] & 0o37777) === 0) {
      f[2] = n;            // FAIL3 (MASK POSMAX ignores the bit-15 flag)
      slot = 2;
    } else {
      f[2] = (n | BIT15) & 0o77777; // MULTFAIL: CA L / AD BIT15 / TS FAILREG +2
      slot = 2;
    }
    // PROGLARM sets bit 9 (PROG lamp) of DSPTAB+11D (ALARM_AND_ABORT.agc:85-87).
    if (first && this.dsky && typeof this.dsky.setLight === 'function') this.dsky.setLight('prog', true);
    const info = describeAlarm(n, this.software);
    const rec = { t: time, code: n, octal: info.octal, text: info.text, cls: info.cls, restart: !!restart, slot, source };
    this.last = rec;
    this.history.push(rec);
    if (this.history.length > this.historyLimit) this.history.shift();
    this.count += 1;
    if (this.bus) this.bus.emit('alarm', { code: n, t: time, text: info.text, restart: !!restart, octal: info.octal });
    return { first, slot };
  }

  // RSET (PINBALL ERROR routine): zero FAILREG..+2 (:3782-3786) and turn
  // off the PROG lamp (:3738-3741). The lamp part is done here only when a
  // dsky was given; PINBALL may also do it itself.
  reset() {
    this.failreg[0] = 0;
    this.failreg[1] = 0;
    this.failreg[2] = 0;
    if (this.dsky && typeof this.dsky.setLight === 'function') this.dsky.setLight('prog', false);
  }

  // Fresh start (SLAP1 zeroes FAILREG..+2, FRESH_START_AND_RESTART.agc:55-60).
  // The history (a simulator log, not AGC memory) is kept unless asked.
  clear({ history = false } = {}) {
    this.reset();
    if (history) {
      this.history.length = 0;
      this.last = null;
      this.count = 0;
    }
  }

  // V05N09 registers as numbers (0 for an empty register).
  registers() {
    return this.failreg.slice();
  }

  // ARCHITECTURE §6.9.1: failreg as [code|null, ...] (null = empty).
  snapshot() {
    return {
      failreg: this.failreg.map((v) => (v === 0 ? null : v)),
      last: this.last ? { code: this.last.code, t: this.last.t, text: this.last.text } : null,
      history: this.history.map((h) => ({ t: h.t, code: h.code, text: h.text, restart: h.restart })),
      count: this.count,
    };
  }
}
