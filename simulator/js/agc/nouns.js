// Noun tables of Luminary099 (LM) and Comanche055 (CM) — ARCHITECTURE §6.5.
//
// The rows below are the PINBALL noun tables themselves, transcribed by a
// script from Luminary099/PINBALL_NOUN_TABLES.agc and
// Comanche055/PINBALL_NOUN_TABLES.agc: the NNADTAB word, the NNTYPTAB word,
// for mixed nouns (40-99) the three IDADDTAB addresses and the RUTMXTAB
// word, plus the listing line numbers and the comments that name the noun
// and its components. Everything else — number of components, DECIMAL ONLY
// / NO LOAD, which scale-factor routine and constant each component uses,
// hence the register format and the display unit — is decoded here exactly
// the way PINBALL decodes it (Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:
// 1143-1190, the format notes of PINBALL_NOUN_TABLES.agc:31-137):
//   NNADTAB, normal noun (00-39): ECADR of the first component; +0 = not
//     in use; 40000 = machine address to be specified (N01-N03); 77776 =
//     channel to be specified (N10); 77777 = augment last address (N15).
//   NNADTAB, mixed noun (40-99): component code in bits 15-11, IDADDTAB
//     index in bits 10-1.
//   Component code: bits 2-1 = components - 1; bit 4 = DECIMAL ONLY;
//     bit 5 = NO LOAD.
//   NNTYPTAB, normal: component code (15-11), SF routine (10-6), SF
//     constant (5-1). Mixed: SF constants of components 3, 2, 1.
//   RUTMXTAB (mixed): SF routines of components 3, 2, 1.
//
// Each decoded noun:
//   { noun, name, inUse, mixed, decimalOnly, noLoad, count, mctbs, channel,
//     augment, components: [{ label, unit, format, read(agc), key, routine,
//     constant, dp, loadable, octalOnly, word(agc), write(agc, v) }],
//     anchor, line, raw }
// `read(agc)` returns the value in DISPLAY units (ft, ft/s, deg, nmi, s,
// lb ...) or null when the model has no value (a blank register). Values
// come from `agc.erasable[name]` under the listing's own erasable names
// (e.g. DELTAH, HDOTDISP, HCALC, TTFDISP, RANGEDSP, TTOGO, VGDISP, DVTOTAL,
// TIG), with these simulator conventions:
//   - 'NAME+k' (the k-th word after NAME) is looked up as the key
//     'NAME+k' first; if `erasable.NAME` is an array, element k (SP) or
//     k/2 (DP) is used — so programs may store vectors as arrays
//     (VGBODY = [x, y, z] serves N85).
//   - TIME2 (N36) is the AGC clock: GET (`agc.t`, as the ground's clock
//     updates kept it) plus `agc.clockOffset`. Loading N36 (V25N36) sets
//     that offset, so the clock keeps counting from the loaded value (the
//     hardware counter TIME2/TIME1 never stops; Agc.clock).
//   - SAMPTIME (N65) is the time PINBALL snatched at the last keystroke or
//     monitor cycle (KEYRUPT1 / MONREQ: TC LODSAMPT,
//     Luminary099/KEYRUPT_UPRUPT.agc:38, PINBALL :2373).
//   - FAILREG (N09) comes from `agc.alarms` (FAILREG, +1, +2).
//   - N64 R1, FUNNYDSP = TREDES / LOOKANGL (Luminary099/ERASABLE_ASSIGNMENTS.
//     agc:2536-2547): erasable LPDTIME and LPDANGLE (simulator names; the
//     listing's TREDES and LOOKANGL, or an array FUNNYDSP, also work).
//   - N63 R3 HCALC1 falls back to HCALC (SERVICER copies HCALC into HCALC1,
//     Luminary099/SERVICER.agc:810-816).
//   - N66 R2, the LR antenna position read from channel 33 bits 7-6
//     (LRPOSOUT), is erasable LRPOS (1 or 2).
//   - N34 TIME OF EVENT reads TEVENT first (DSPTEM1 is a shared buffer that
//     also holds the N25 checklist code).
// `erasableNames(software)` lists every name read, with units.

import { formatRegister, toWord } from './display-format.js';

// [noun, NNADTAB, NNTYPTAB, IDADDTAB[3] | null, RUTMXTAB | null,
//  NNADTAB line, [first, last] IDADDTAB line | null, name, more comments]
// Luminary099/PINBALL_NOUN_TABLES.agc:206-376 (NNADTAB), :383-525 (NNTYPTAB),
// :653-835 (IDADDTAB), :840-901 (RUTMXTAB).
const RAW_LUMINARY099 = [
  [0, 0o00000, 0o00000, null, null, 206, null, 'NOT IN USE', []],
  [1, 0o40000, 0o04040, null, null, 207, null, 'SPECIFY MACHINE ADDRESS (FRACTIONAL)', []],
  [2, 0o40000, 0o04140, null, null, 208, null, 'SPECIFY MACHINE ADDRESS (WHOLE)', []],
  [3, 0o40000, 0o04102, null, null, 209, null, 'SPECIFY MACHINE ADDRESS (DEGREES)', []],
  [4, 'DSPTEM1', 0o00504, null, null, 210, null, 'ANGULAR ERROR/DIFFERENCE', []],
  [5, 'DSPTEM1', 0o00504, null, null, 211, null, 'ANGULAR ERROR/DIFFERENCE', []],
  [6, 'OPTION1', 0o04000, null, null, 212, null, 'OPTION CODE', []],
  [7, 'XREG', 0o04000, null, null, 213, null, 'ECADR OF WORD TO BE MODIFIED', ['ONES FOR BITS TO BE MODIFIED', '1 TO SET OR 0 TO RESET SELECTED BITS']],
  [8, 'ALMCADR', 0o04000, null, null, 216, null, 'ALARM DATA', []],
  [9, 'FAILREG', 0o04000, null, null, 217, null, 'ALARM CODES', []],
  [10, 0o77776, 0o00000, null, null, 218, null, 'CHANNEL TO BE SPECIFIED', []],
  [11, 'TCSI', 0o24400, null, null, 219, null, 'TIG OF CSI (HRS,MIN,SEC)', []],
  [12, 'OPTIONX', 0o02000, null, null, 220, null, 'OPTION CODE', ['(USED BY EXTENDED VERBS ONLY)']],
  [13, 'TCDH', 0o24400, null, null, 222, null, 'TIG OF CDH (HRS,MIN,SEC)', []],
  [14, 'DSPTEMX', 0o04140, null, null, 223, null, 'CHECKLIST', ['(USED BY EXTENDED VERBS ONLY)']],
  [15, 0o77777, 0o00000, null, null, 225, null, 'INCREMENT MACHINE ADDRESS', []],
  [16, 'DSPTEMX', 0o24400, null, null, 226, null, 'TIME OF EVENT (HRS,MIN,SEC)', []],
  [17, 0o00000, 0o00000, null, null, 227, null, 'SPARE', []],
  [18, 'FDAIX', 0o04102, null, null, 228, null, 'AUTO MANEUVER BALL ANGLES', []],
  [19, 0o00000, 0o00000, null, null, 229, null, 'SPARE', []],
  [20, 'CDUX', 0o04102, null, null, 230, null, 'ICDU ANGLES', []],
  [21, 'PIPAX', 0o04140, null, null, 231, null, 'PIPAS', []],
  [22, 'THETAD', 0o04102, null, null, 232, null, 'NEW ICDU ANGLES', []],
  [23, 0o00000, 0o00000, null, null, 233, null, 'SPARE', []],
  [24, 'DSPTEM2+1', 0o24400, null, null, 234, null, 'DELTA TIME FOR AGC CLOCK (HRS,MIN,SEC)', []],
  [25, 'DSPTEM1', 0o04140, null, null, 235, null, 'CHECKLIST', ['(USED WTIH PLEASE PERFORM ONLY)']],
  [26, 'DSPTEM1', 0o04000, null, null, 237, null, 'PRIO/DELAY, ADRES, BBCON', []],
  [27, 'SMODE', 0o00140, null, null, 238, null, 'SELF TEST ON/OFF SWITCH', []],
  [28, 0o00000, 0o00000, null, null, 240, null, 'SPARE', []],
  [29, 0o00000, 0o00000, null, null, 241, null, 'SPARE', []],
  [30, 0o00000, 0o00000, null, null, 242, null, 'SPARE', []],
  [31, 0o00000, 0o00000, null, null, 243, null, 'SPARE', []],
  [32, '-TPER', 0o24400, null, null, 244, null, 'TIME TO PERIGEE (HRS,MIN,SEC)', []],
  [33, 'TIG', 0o24400, null, null, 245, null, 'TIME OF IGNITION (HRS,MIN,SEC)', []],
  [34, 'DSPTEM1', 0o24400, null, null, 246, null, 'TIME OF EVENT (HRS,MIN,SEC)', []],
  [35, 'TTOGO', 0o24400, null, null, 247, null, 'TIME TO GO TO EVENT (HRS,MIN,SEC)', []],
  [36, 'TIME2', 0o24400, null, null, 248, null, 'TIME OF AGC CLOCK (HRS,MIN,SEC)', []],
  [37, 'TTPI', 0o24400, null, null, 249, null, 'TIG OF TPI (HRS,MIN,SEC)', []],
  [38, 'TET', 0o24400, null, null, 250, null, 'TIME OF STATE BEING INTEGRATED', []],
  [39, 0o00000, 0o00000, null, null, 251, null, 'SPARE', ['NN MIXED NOUNS']],
  [40, 0o64000, 0o24500, ['TTOGO', 'VGDISP', 'DVTOTAL'], 0o16351, 256, [653, 655], 'TIME TO IGNITION/CUTOFF', ['VG', 'DELTA V (ACCUMULATED)']],
  [41, 0o02003, 0o00542, ['DSPTEM1', 'DSPTEM1+1', 0], 0o00142, 259, [656, 658], 'TARGET AZIMUTH', ['ELEVATION']],
  [42, 0o24006, 0o24410, ['HAPO', 'HPER', 'VGDISP'], 0o16347, 261, [659, 661], 'APOGEE', ['PERIGEE', 'DELTA V (REQUIRED)']],
  [43, 0o24011, 0o20204, ['LAT', 'LONG', 'ALT'], 0o16512, 264, [662, 664], 'LATITUDE', ['LONGITUDE', 'ALTITUDE']],
  [44, 0o64014, 0o00410, ['HAPOX', 'HPERX', 'TFF'], 0o22347, 267, [665, 667], 'APOGEE', ['PERIGEE', 'TFF']],
  [45, 0o64017, 0o10000, ['TRKMKCNT', 'TTOGO', '+MGA'], 0o24443, 270, [668, 670], 'MARKS', ['TTI OF NEXT BURN', 'MGA']],
  [46, 0o00022, 0o00000, ['DAPDATR1', 0, 0], 0o00000, 273, [671, 673], 'AUTOPILOT CONFIGURATION', []],
  [47, 0o22025, 0o00306, ['LEMMASS', 'CSMMASS', 0], 0o00553, 274, [674, 676], 'LEM WEIGHT', ['CSM WEIGHT']],
  [48, 0o22030, 0o01367, ['PITTIME', 'ROLLTIME', 0], 0o00143, 276, [677, 679], 'GIMBAL PITCH TRIM', ['GIMBAL ROLL TRIM']],
  [49, 0o24033, 0o00510, ['R22DISP', 'R22DISP+2', 'WHCHREAD'], 0o06347, 278, [680, 682], 'DELTA R', ['DELTA V', 'RADAR DATA SOURCE CODE']],
  [50, 0o00000, 0o00000, [0, 0, 0], 0o00000, 281, [683, 685], 'SPARE', []],
  [51, 0o22041, 0o00204, ['ALPHASB', 'BETASB', 0], 0o00512, 282, [686, 688], 'S-BAND ANTENNA PITCH', ['YAW']],
  [52, 0o00044, 0o00004, ['ACTCENT', 0, 0], 0o00012, 284, [689, 691], 'CENTRAL ANGLE OF ACTIVE VEHICLE', []],
  [53, 0o00000, 0o00000, [0, 0, 0], 0o00000, 285, [692, 694], 'SPARE', []],
  [54, 0o24052, 0o10507, ['RANGE', 'RRATE', 'RTHETA'], 0o24344, 286, [695, 698], 'RANGE', ['RANGE RATE', 'THETA']],
  [55, 0o24055, 0o10200, ['NN', 'ELEV', 'CENTANG'], 0o24503, 289, [699, 701], 'NO. OF APSIDAL CROSSINGS', ['ELEVATION ANGLE', 'CENTRAL ANGLE']],
  [56, 0o02060, 0o00204, ['RR-AZ', 'RR-ELEV', 0], 0o00512, 293, [702, 704], 'RR LOS AZIMUTH', ['ELEVATION']],
  [57, 0o20063, 0o00010, ['DELTAR', 0, 0], 0o00007, 295, [705, 707], 'DELTA R', []],
  [58, 0o24066, 0o24510, ['POSTTPI', 'DELVTPI', 'DELVTPF'], 0o16347, 296, [708, 710], 'PERIGEE ALT', ['DELTA V TPI', 'DELTA V TPF']],
  [59, 0o24071, 0o24512, ['DVLOS', 'DVLOS+2', 'DVLOS+4'], 0o16347, 299, [711, 713], 'DELTA VELOCITY LOS', []],
  [60, 0o24074, 0o60512, ['VHORIZ', 'HDOTDISP', 'HCALC'], 0o10347, 300, [714, 716], 'HORIZONTAL VELOCITY', ['ALTITUDE RATE', 'COMPUTED ALTITUDE']],
  [61, 0o64077, 0o54000, ['TTFDISP', 'TTOGO', 'OUTOFPLN'], 0o24451, 303, [717, 719], 'TIME TO GO IN BRAKING PHASE', ['TIME TO IGNITION', 'CROSS RANGE DISTANCE']],
  [62, 0o64102, 0o24012, ['ABVEL', 'TTOGO', 'DVTOTAL'], 0o16447, 306, [720, 722], 'ABSOLUTE VALUE OF VELOCITY', ['TIME TO IGNITION', 'DELTA V (ACCUMULATED)']],
  [63, 0o24105, 0o60512, ['ABVEL', 'HDOTDISP', 'HCALC1'], 0o10347, 309, [723, 725], 'ABSOLUTE VALUE OF VELOCITY', ['ALTITUDE RATE', 'COMPUTED ALTITUDE']],
  [64, 0o64110, 0o60500, ['FUNNYDSP', 'HDOTDISP', 'HCALC'], 0o10354, 312, [726, 728], 'TIME LEFT FOR REDESIGNATION -- LPD ANGLE', ['ALTITUDE RATE', 'COMPUTED ALTITUDE']],
  [65, 0o24113, 0o00000, ['SAMPTIME', 'SAMPTIME', 'SAMPTIME'], 0o20410, 315, [729, 731], 'SAMPLED AGC TIME (HRS,MIN,SEC)', ['(FETCHED IN INTERRUPT)']],
  [66, 0o62116, 0o00016, ['RSTACK+6', 0, 0], 0o00304, 317, [732, 734], 'LR RANGE', ['POSITION']],
  [67, 0o04121, 0o53223, ['RSTACK', 'RSTACK+2', 'RSTACK+4'], 0o10204, 319, [735, 737], 'LRVX', ['LRVY', 'LRVZ']],
  [68, 0o64124, 0o60026, ['RANGEDSP', 'TTFDISP', 'DELTAH'], 0o10452, 322, [738, 740], 'SLANT RANGE TO LANDING SIGHT', ['TIME TO GO IN BRAKING PHASE', 'LR ALTITUDE -- COMPUTED ALTITUDE']],
  [69, 0o00000, 0o00000, [0, 0, 0], 0o00000, 325, [741, 743], 'SPARE', []],
  [70, 0o04132, 0o00000, ['AOTCODE', 'AOTCODE+1', 'AOTCODE+2'], 0o00000, 326, [744, 746], 'AOT DETENT CODE/STAR CODE', []],
  [71, 0o04135, 0o00000, ['AOTCODE', 'AOTCODE+1', 'AOTCODE+2'], 0o00000, 327, [748, 750], 'AOT DETENT CODE/STAR CODE', []],
  [72, 0o02140, 0o00102, ['CDUT', 'CDUS', 0], 0o00115, 328, [751, 753], 'RR 360 -- TRUNNION ANGLE', ['SHAFT ANGLE']],
  [73, 0o02143, 0o00102, ['TANG', 'TANG+1', 0], 0o00115, 330, [754, 756], 'NEW RR 360 -- TRUNNION ANGLE', ['SHAFT ANGLE']],
  [74, 0o64146, 0o10200, ['TTOGO', 'YAW', 'PITCH'], 0o24511, 332, [757, 759], 'TIME TO IGNITION', ['YAWAFTER VEHICLE RISE', 'PITCH AFTER VEHICLE RISE']],
  [75, 0o64151, 0o00010, ['DIFFALT', 'T1TOT2', 'T2TOT3'], 0o22447, 335, [760, 762], 'DELTA ALTITUDE CDH', ['DELTA TIME (CDH-CSI OR TPI-CDH)', 'DELTA TIME (TPI-CDH OR TPI-NOMTPI)']],
  [76, 0o24154, 0o20512, ['ZDOTD', 'RDOTD', 'XRANGE'], 0o16347, 338, [763, 765], 'DESIRED HORIZONTAL VELOCITY', ['DESIRED RADIAL VELOCITY', 'CROSS-RANGE DISTANCE']],
  [77, 0o62157, 0o00500, ['TTOGO', 'YDOT', 0], 0o00351, 342, [766, 768], 'TIME TO ENGINE CUTOFF', ['VELOCITY NORMAL TO CSM PLANE']],
  [78, 0o02162, 0o00654, ['RSTACK', 'RSTACK+2', 0], 0o00204, 344, [769, 771], 'RR RANGE', ['RANGE RATE']],
  [79, 0o24165, 0o00102, ['CURSOR', 'SPIRAL', 'POSCODE'], 0o06102, 346, [772, 774], 'CURSOR ANGLE', ['SPIRAL ANGLE', 'POSITION CODE']],
  [80, 0o02170, 0o00200, ['DATAGOOD', 'OMEGAD', 0], 0o00503, 349, [775, 777], 'DATA INDICATOR', ['OMEGA']],
  [81, 0o24173, 0o24512, ['DELVLVC', 'DELVLVC+2', 'DELVLVC+4'], 0o16347, 351, [778, 780], 'DELTA V (LV)', []],
  [82, 0o24176, 0o24512, ['DELVLVC', 'DELVLVC+2', 'DELVLVC+4'], 0o16347, 352, [781, 783], 'DELTA V (LV)', []],
  [83, 0o24201, 0o24512, ['DELVIMU', 'DELVIMU+2', 'DELVIMU+4'], 0o16347, 353, [784, 786], 'DELTA V (BODY)', []],
  [84, 0o24204, 0o24512, ['DELVOV', 'DELVOV+2', 'DELVOV+4'], 0o16347, 354, [787, 789], 'DELTA V (OTHER VEHICLE)', []],
  [85, 0o24207, 0o24512, ['VGBODY', 'VGBODY+2', 'VGBODY+4'], 0o16347, 355, [790, 792], 'VG (BODY)', []],
  [86, 0o24212, 0o24512, ['DELVLVC', 'DELVLVC+2', 'DELVLVC+4'], 0o16347, 356, [793, 795], 'VG (LV)', []],
  [87, 0o02215, 0o00102, ['AZ', 'EL', 0], 0o00102, 357, [796, 799], 'BACKUP OPTICS LOS AZIMUTH', ['ELEVATION']],
  [88, 0o24220, 0o00000, ['STARAD', 'STARAD+2', 'STARAD+4'], 0o02041, 359, [800, 802], 'HALF UNIT SUN OR PLANET VECTOR', []],
  [89, 0o24223, 0o16143, ['LANDLAT', 'LANDLONG', 'LANDALT'], 0o10347, 360, [803, 805], 'LANDMARK LATITUDE', ['LONGITUDE/2', 'ALTITUDE']],
  [90, 0o24226, 0o10507, ['RANGE', 'RRATE', 'RTHETA'], 0o24344, 363, [806, 808], 'Y', ['Y DOT', 'PSI']],
  [91, 0o04231, 0o10450, ['P21ALT', 'P21VEL', 'P21GAM'], 0o24507, 366, [809, 811], 'ALTITUDE', ['VELOCITY', 'FLIGHT PATH ANGLE']],
  [92, 0o00000, 0o00000, [0, 0, 0], 0o00000, 369, [812, 814], 'SPARE', []],
  [93, 0o04237, 0o06143, ['OGC', 'OGC+2', 'OGC+4'], 0o16347, 370, [815, 817], 'DELTA GYRO ANGLES', []],
  [94, 0o00000, 0o00000, [0, 0, 0], 0o00000, 371, [818, 820], 'SPARE', []],
  [95, 0o00000, 0o00000, [0, 0, 0], 0o00000, 372, [821, 823], 'SPARE', []],
  [96, 0o00000, 0o00000, [0, 0, 0], 0o00000, 373, [824, 826], 'SPARE', []],
  [97, 0o04253, 0o00000, ['DSPTEM1', 'DSPTEM1+1', 'DSPTEM1+2'], 0o06143, 374, [827, 829], 'SYSTEM TEST INPUTS', []],
  [98, 0o04256, 0o00000, ['DSPTEM2', 'DSPTEM2+1', 'DSPTEM2+2'], 0o06043, 375, [830, 832], 'SYSTEM TEST RESULTS', []],
  [99, 0o24261, 0o71572, ['WWPOS', 'WWVEL', 'WWBIAS'], 0o24247, 376, [833, 835], 'RMS IN POSITION', []],
];

// Comanche055/PINBALL_NOUN_TABLES.agc:186-363 (NNADTAB), :370-516
// (NNTYPTAB), :608-791 (IDADDTAB), :797-858 (RUTMXTAB).
const RAW_COMANCHE055 = [
  [0, 0o00000, 0o00000, null, null, 186, null, 'NOT IN USE', []],
  [1, 0o40000, 0o04040, null, null, 187, null, 'SPECIFY MACHINE ADDRESS (FRACTIONAL)', []],
  [2, 0o40000, 0o04140, null, null, 188, null, 'SPECIFY MACHINE ADDRESS (WHOLE)', []],
  [3, 0o40000, 0o04102, null, null, 189, null, 'SPECIFY MACHINE ADDRESS (DEGREES)', []],
  [4, 0o00000, 0o00000, null, null, 190, null, 'SPARE', []],
  [5, 'DSPTEM1', 0o00504, null, null, 191, null, 'ANGULAR ERROR/DIFFERENCE', []],
  [6, 'OPTION1', 0o02000, null, null, 192, null, 'OPTION CODE', []],
  [7, 'XREG', 0o04000, null, null, 193, null, 'ECADR OF WORD TO BE MODIFIED', ['ONES FOR BITS TO BE MODIFIED', '1 TO SET OR 0 TO RESET SELECTED BITS']],
  [8, 'ALMCADR', 0o04000, null, null, 196, null, 'ALARM DATA', []],
  [9, 'FAILREG', 0o04000, null, null, 197, null, 'ALARM CODES', []],
  [10, 0o77776, 0o00000, null, null, 198, null, 'CHANNEL TO BE SPECIFIED', []],
  [11, 'TCSI', 0o24400, null, null, 199, null, 'TIG OF CSI (HRS,MIN,SEC)', []],
  [12, 'OPTIONX', 0o02000, null, null, 200, null, 'OPTION CODE', ['(USED BY EXTENDED VERBS ONLY)']],
  [13, 'TCDH', 0o24400, null, null, 202, null, 'TIG OF CDH (HRS,MIN,SEC)', []],
  [14, 0o00000, 0o00000, null, null, 203, null, 'SPARE', []],
  [15, 0o77777, 0o00000, null, null, 204, null, 'INCREMENT MACHINE ADDRESS', []],
  [16, 'DSPTEMX', 0o24400, null, null, 205, null, 'TIME OF EVENT (HRS,MIN,SEC)', []],
  [17, 'CPHIX', 0o04102, null, null, 206, null, 'ASTRONAUT TOTAL ATTITUDE', []],
  [18, 'THETAD', 0o04102, null, null, 207, null, 'AUTO MANEUVER BALL ANGLES', []],
  [19, 'THETAD', 0o04102, null, null, 208, null, 'BYPASS ATTITUDE TRIM MANEUVER', []],
  [20, 'CDUX', 0o04102, null, null, 209, null, 'ICDU ANGLES', []],
  [21, 'PIPAX', 0o04140, null, null, 210, null, 'PIPAS', []],
  [22, 'THETAD', 0o04102, null, null, 211, null, 'NEW ICDU ANGLES', []],
  [23, 0o00000, 0o00000, null, null, 212, null, 'SPARE', []],
  [24, 'DSPTEM2+1', 0o24400, null, null, 213, null, 'DELTA TIME FOR AGC CLOCK(HRS,MIN,SEC)', []],
  [25, 'DSPTEM1', 0o04140, null, null, 214, null, 'CHECKLIST', ['(USED WITH PLEASE PERFORM ONLY)']],
  [26, 'DSPTEM1', 0o04000, null, null, 216, null, 'PRIO/DELAY, ADRES, BBCON', []],
  [27, 'SMODE', 0o00140, null, null, 217, null, 'SELF TEST ON/OFF SWITCH', []],
  [28, 0o00000, 0o00000, null, null, 219, null, 'SPARE', []],
  [29, 'DSPTEM1', 0o20102, null, null, 220, null, 'XSM LAUNCH AZIMUTH', []],
  [30, 'DSPTEM1', 0o04140, null, null, 221, null, 'TARGET CODES', []],
  [31, 'DSPTEM1', 0o24400, null, null, 222, null, 'TIME OF LANDING SITE (HRS,MIN,SEC)', []],
  [32, '-TPER', 0o24400, null, null, 223, null, 'TIME TO PERIGEE (HRS,MIN,SEC)', []],
  [33, 'TIG', 0o24400, null, null, 224, null, 'TIME OF IGNITION (HRS,MIN,SEC)', []],
  [34, 'DSPTEM1', 0o24400, null, null, 225, null, 'TIME OF EVENT (HRS,MIN,SEC)', []],
  [35, 'TTOGO', 0o24400, null, null, 226, null, 'TIME TO GO TO EVENT (HRS,MIN,SEC)', []],
  [36, 'TIME2', 0o24400, null, null, 227, null, 'TIME OF AGC CLOCK (HRS,MIN,SEC)', []],
  [37, 'TTPI', 0o24400, null, null, 228, null, 'TIG OF TPI (HRS,MIN,SEC)', []],
  [38, 'TET', 0o24400, null, null, 229, null, 'TIME OF STATE VECTOR', []],
  [39, 'T3TOT4', 0o24400, null, null, 230, null, 'DELTA TIME TO TRANSFER (HRS,MIN,SEC)', ['NN  MIXED NOUNS']],
  [40, 0o64000, 0o24500, ['TTOGO', 'VGDISP', 'DVTOTAL'], 0o16351, 234, [608, 610], 'TIME TO IGNITION/CUTOFF', ['VG', 'DELTA V (ACCUMULATED)']],
  [41, 0o02003, 0o00542, ['DSPTEM1', 'DSPTEM1+1', 0], 0o00142, 237, [611, 613], 'TARGET AZIMUTH', ['ELEVATION']],
  [42, 0o24006, 0o24410, ['HAPO', 'HPER', 'VGDISP'], 0o16347, 239, [614, 616], 'APOGEE', ['PERIGEE', 'DELTA V (REQUIRED)']],
  [43, 0o24011, 0o20204, ['LAT', 'LONG', 'ALT'], 0o16512, 242, [617, 619], 'LATITUDE', ['LONGITUDE', 'ALTITUDE']],
  [44, 0o64014, 0o00410, ['HAPOX', 'HPERX', 'TFF'], 0o22347, 245, [620, 622], 'APOGEE', ['PERIGEE', 'TFF']],
  [45, 0o64017, 0o10000, ['VHFCNT', 'TTOGO', '+MGA'], 0o24454, 248, [623, 626], 'MARKS (VHF - OPTICS)', ['TTI OF NEXT BURN', 'MGA']],
  [46, 0o02022, 0o00000, ['DAPDATR1', 'DAPDATR2', 0], 0o00000, 251, [627, 629], 'AUTOPILOT CONFIGURATION', []],
  [47, 0o22025, 0o00306, ['CSMMASS', 'LEMMASS', 0], 0o00553, 252, [630, 632], 'THIS VEHICLE WEIGHT', ['OTHER VEHICLE WEIGHT']],
  [48, 0o22030, 0o00614, ['PACTOFF', 'YACTOFF', 0], 0o00143, 254, [633, 635], 'PITCH TRIM', ['YAW TRIM']],
  [49, 0o24033, 0o00510, ['N49DISP', 'N49DISP+2', 'N49DISP+4'], 0o06347, 256, [636, 638], 'DELTA R', ['DELTA V', 'VHF OR OPTICS CODE']],
  [50, 0o64036, 0o00417, ['RSP-RREC', 'HPERX', 'TFF'], 0o22347, 259, [639, 641], 'SPLASH ERROR', ['PERIGEE', 'TFF']],
  [51, 0o22041, 0o00204, ['RHOSB', 'GAMMASB', 0], 0o00512, 262, [642, 644], 'S-BAND ANTENNA PITCH', ['YAW']],
  [52, 0o00044, 0o00004, ['ACTCENT', 0, 0], 0o00012, 264, [645, 647], 'CENTRAL ANGLE OF ACTIVE VEHICLE', []],
  [53, 0o24047, 0o10507, ['RANGE', 'RRATE', 'RTHETA'], 0o24344, 265, [648, 650], 'RANGE', ['RANGE RATE', 'PHI']],
  [54, 0o24052, 0o10507, ['RANGE', 'RRATE', 'RTHETA'], 0o24344, 269, [651, 653], 'RANGE', ['RANGE RATE', 'THETA']],
  [55, 0o24055, 0o10200, ['NN1', 'ELEV', 'CENTANG'], 0o24503, 272, [654, 656], 'PERIGEE CODE', ['ELEVATION ANGLE', 'CENTRAL ANGLE']],
  [56, 0o22060, 0o00444, ['RTEGAM2D', 'RTEDVD', 0], 0o00512, 275, [657, 659], 'REENTRY ANGLE,', ['DELTA V']],
  [57, 0o20063, 0o00010, ['DELTAR', 0, 0], 0o00007, 277, [660, 662], 'DELTA R', []],
  [58, 0o24066, 0o24510, ['POSTTPI', 'DELVTPI', 'DELVTPF'], 0o16347, 278, [663, 665], 'PERIGEE ALT', ['DELTA V TPI', 'DELTA V TPF']],
  [59, 0o24071, 0o24512, ['DVLOS', 'DVLOS+2', 'DVLOS+4'], 0o16347, 281, [666, 668], 'DELTA VELOCITY LOS', []],
  [60, 0o24074, 0o10440, ['GMAX', 'VPRED', 'GAMMAEI'], 0o24503, 282, [669, 671], 'GMAX', ['VPRED', 'GAMMA EI']],
  [61, 0o24077, 0o00204, ['LAT(SPL)', 'LNG(SPL)', 'HEADSUP'], 0o06512, 285, [672, 674], 'IMPACT LATITUDE', ['IMPACT LONGITUDE', 'HEADS UP/DOWN']],
  [62, 0o24102, 0o20451, ['VMAGI', 'HDOT', 'ALTI'], 0o16512, 288, [676, 678], 'INERTIAL VEL MAG (V1)', ['ALT RATE CHANGE (HDOT)', 'ALT ABOVE PAD RADIUS (H)']],
  [63, 0o64105, 0o00457, ['RTGO', 'VIO', 'TTE'], 0o22507, 291, [679, 681], 'RANGE 297,431 TO SPLASH (RTGO)', ['PREDICTED INERT VEL (VIO)', 'TIME TO GO TO 297,431 (TTE)']],
  [64, 0o24110, 0o36460, ['D', 'VMAGI', 'RTGON64'], 0o16505, 294, [682, 684], 'DRAG ACCELERATION', ['INERTIAL VELOCITY (VI)', 'RANGE TO SPLASH']],
  [65, 0o24113, 0o00000, ['SAMPTIME', 'SAMPTIME', 'SAMPTIME'], 0o20410, 297, [685, 687], 'SAMPLED AGC TIME (HRS,MIN,SEC)', ['(FETCHED IN INTERRUPT)']],
  [66, 0o24116, 0o37044, ['ROLLC', 'XRNGERR', 'DNRNGERR'], 0o16352, 299, [688, 690], 'COMMAND BANK ANGLE (BETA)', ['CROSS RANGE ERROR', 'DOWN RANGE ERROR']],
  [67, 0o24121, 0o10217, ['RTGON67', 'LAT', 'LONG'], 0o24507, 302, [691, 693], 'RANGE TO TARGET', ['PRESENT LATITUDE', 'PRESENT LONGITUDE']],
  [68, 0o24124, 0o34444, ['ROLLC', 'VMAGI', 'RDOT'], 0o24512, 305, [694, 696], 'COMMAND BANK ANGLE (BETA)', ['INERTIAL VELOCITY (VI)', 'ALT RATE CHANGE (RDOT)']],
  [69, 0o24127, 0o35004, ['ROLLC', 'Q7', 'VL'], 0o24252, 308, [697, 699], 'BETA', ['DL', 'VL']],
  [70, 0o04132, 0o00000, ['STARCODE', 'LANDMARK', 'HORIZON'], 0o00000, 311, [700, 702], 'STAR CODE', ['LANDMARK DATA', 'HORIZON DATA']],
  [71, 0o04135, 0o00000, ['STARCODE', 'LANDMARK', 'HORIZON'], 0o00000, 314, [703, 705], 'STAR CODE', ['LANDMARK', 'HORIZON']],
  [72, 0o24140, 0o00404, ['THETZERO', 'DELHITE', 'OPTION2'], 0o06352, 317, [706, 708], 'DELT ANG', ['DELT ALT', 'SEARCH OPTION']],
  [73, 0o04143, 0o10450, ['P21ALT', 'P21VEL', 'P21GAM'], 0o24507, 321, [709, 711], 'ALTITUDE', ['VELOCITY', 'FLIGHT PATH ANGLE']],
  [74, 0o04146, 0o40444, ['ROLLC', 'VMAGI', 'D'], 0o12512, 324, [712, 714], 'COMMAND BANK ANGLE (BETA)', ['INERTIAL VELOCITY (VI)', 'DRAG ACCELERATION']],
  [75, 0o64151, 0o00010, ['DIFFALT', 'T1TOT2', 'T2TOT3'], 0o22447, 327, [715, 717], 'DELTA ALTITUDE CDH', ['DELTA TIME (CDH-CSI OR TPI-CDH)', 'DELTA TIME (TPI-CDH OR TPI-NOMTPI)']],
  [76, 0o00000, 0o00000, [0, 0, 0], 0o00000, 330, [718, 720], 'SPARE', []],
  [77, 0o00000, 0o00000, [0, 0, 0], 0o00000, 331, [721, 723], 'SPARE', []],
  [78, 0o00000, 0o00000, [0, 0, 0], 0o00000, 332, [724, 727], 'SPARE', []],
  [79, 0o00000, 0o00000, [0, 0, 0], 0o00000, 333, [728, 730], 'SPARE', []],
  [80, 0o64170, 0o22440, ['TTOGO', 'VGDISP', 'DVTOTAL'], 0o24511, 334, [731, 733], 'TIME TO IGNITION/CUTOFF', ['VG', 'DELTA V (ACCUMULATED)']],
  [81, 0o24173, 0o24512, ['DELVLVC', 'DELVLVC+2', 'DELVLVC+4'], 0o16347, 337, [734, 736], 'DELTA V (LV)', []],
  [82, 0o24176, 0o24512, ['DELVLVC', 'DELVLVC+2', 'DELVLVC+4'], 0o16347, 338, [737, 739], 'DELTA V (LV)', []],
  [83, 0o24201, 0o24512, ['DELVIMU', 'DELVIMU+2', 'DELVIMU+4'], 0o16347, 339, [740, 742], 'DELTA V (BODY)', []],
  [84, 0o24204, 0o24512, ['DELVOV', 'DELVOV+2', 'DELVOV+4'], 0o16347, 340, [743, 745], 'DELTA V (OTHER VEHICLE)', []],
  [85, 0o24207, 0o24512, ['VGBODY', 'VGBODY+2', 'VGBODY+4'], 0o16347, 341, [746, 748], 'VG (BODY)', []],
  [86, 0o24212, 0o22451, ['DELVLVC', 'DELVLVC+2', 'DELVLVC+4'], 0o24512, 342, [749, 751], 'DELTA V (LV)', []],
  [87, 0o02215, 0o00102, ['MRKBUF1+3', 'MRKBUF1+5', 0], 0o00302, 343, [752, 754], 'MARK DATA SHAFT', ['TRUNION']],
  [88, 0o24220, 0o00000, ['STARSAV3', 'STARSAV3+2', 'STARSAV3+4'], 0o32655, 345, [755, 757], 'HALF UNIT SUN OR PLANET VECTOR', []],
  [89, 0o24223, 0o16143, ['LANDLAT', 'LANDLONG', 'LANDALT'], 0o10347, 346, [758, 760], 'LANDMARK LATITUDE', ['LONGITUDE/2', 'ALTITUDE']],
  [90, 0o24226, 0o10507, ['RANGE', 'RRATE', 'RTHETA'], 0o24344, 349, [761, 763], 'Y', ['Y DOT', 'PSI']],
  [91, 0o02231, 0o00102, ['CDUS', 'CDUT', 0], 0o00302, 352, [764, 766], 'OCDU ANGLES SHAFT', ['TRUNION']],
  [92, 0o02234, 0o00102, ['SAC', 'PAC', 0], 0o00302, 354, [767, 769], 'NEW OPTICS ANGLES SHAFT', ['TRUNION']],
  [93, 0o04237, 0o06143, ['OGC', 'OGC+2', 'OGC+4'], 0o16347, 356, [770, 772], 'DELTA GYRO ANGLES', []],
  [94, 0o02242, 0o00102, ['MRKBUF1+3', 'MRKBUF1+5', 0], 0o00302, 357, [773, 775], 'NEW OPTICS ANGLES SHAFT', ['TRUNNION']],
  [95, 0o04245, 0o04102, ['PRAXIS', 'PRAXIS+1', 'PRAXIS+2'], 0o04102, 359, [776, 779], 'PREFERRED ATTITUDE ICDU ANGLES', []],
  [96, 0o04250, 0o04102, ['CPHIX', 'CPHIX+1', 'CPHIX+2'], 0o04102, 360, [780, 782], '+X-AXIS ATTITUDE ICDU ANGLES', []],
  [97, 0o04253, 0o00000, ['DSPTEM1', 'DSPTEM1+1', 'DSPTEM1+2'], 0o06143, 361, [783, 785], 'SYSTEM TEST INPUTS', []],
  [98, 0o04256, 0o00000, ['DSPTEM2', 'DSPTEM2+1', 'DSPTEM2+2'], 0o06043, 362, [786, 788], 'SYSTEM TEST RESULTS', []],
  [99, 0o24261, 0o01162, ['WWPOS', 'WWVEL', 'WWOPT'], 0o06247, 363, [789, 791], 'RMS IN POSITION', []],
];

// ---------------------------------------------------------------- codes

// SF routine code numbers (Luminary099/PINBALL_NOUN_TABLES.agc:42-61;
// Comanche055/PINBALL_NOUN_TABLES.agc:46-65 — codes 6 and 13 differ).
export const SF_ROUTINES = Object.freeze({
  Luminary099: ['OCTAL ONLY', 'FRAC', 'CDU DEG', 'ARITH', 'DP1', 'DP2', 'LR POSITION', 'DP3',
    'HMS', 'MIN/SEC', 'DP4', 'ARITH1', '2INT', '360-CDU'],
  Comanche055: ['OCTAL ONLY', 'FRAC', 'CDU DEG', 'ARITH', 'DP1', 'DP2', 'Y OPTICS DEG', 'DP3',
    'HMS', 'MIN/SEC', 'DP4', 'ARITH1', '2INT', 'DP FRAC'],
});

// DPTEST: which routines read a double-precision word (Luminary099/
// PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:1076-1094; Comanche055 :1031-1049).
const DP_ROUTINES = Object.freeze({
  Luminary099: new Set([4, 5, 7, 10]),
  Comanche055: new Set([4, 5, 7, 10, 13]),
});

// SF constant code numbers -> [name, display format, unit]
// (Luminary099/PINBALL_NOUN_TABLES.agc:63-118; Comanche055 :67-100).
// Code 0 means WHOLE with ARITH but DP TIME SEC with DP1; code 2 means CDU
// degrees or (CM) Y-optics degrees depending on the routine; see
// formatFor() below.
const SF_CONSTANTS = Object.freeze({
  Luminary099: {
    0: ['WHOLE', 'XXXXX', ''], 1: ['SPARE', 'XXXXX', ''],
    2: ['CDU DEGREES', 'XXX.XX CDU', 'deg'], 3: ['DP DEGREES (90)', 'XX.XXX', 'deg'],
    4: ['DP DEGREES (360)', 'XXX.XX', 'deg'], 5: ['DEGREES (180)', 'XXX.XX', 'deg'],
    6: ['WEIGHT2', 'XXXXX', 'lb'], 7: ['POSITION5', 'XXX.XX', 'nmi'],
    8: ['POSITION4', 'XXXX.X', 'nmi'], 9: ['VELOCITY2', 'XXXXX', 'ft/s'],
    10: ['VELOCITY3', 'XXXX.X', 'ft/s'], 11: ['ELEVATION DEGREES', 'XX.XXX', 'deg'],
    12: ['RENDEZVOUS RADAR RANGE', 'XXX.XX', 'nmi'], 13: ['RENDEZVOUS RADAR RANGE RATE', 'XXXXX', 'ft/s'],
    14: ['LANDING RADAR ALTITUDE', 'XXXXX', 'ft'], 15: ['INITIAL/FINAL ALTITUDE', 'XXXXX', 'ft'],
    16: ['ALTITUDE RATE', 'XXXXX', 'ft/s'], 17: ['FORWARD/LATERAL VELOCITY', 'XXXXX', 'ft/s'],
    18: ['ROTATIONAL HAND CONTROLLER ANGLE RATES', 'XXXXX', 'deg/s'],
    19: ['LANDING RADAR VELX', 'XXXXX', 'ft/s'], 20: ['LANDING RADAR VELY', 'XXXXX', 'ft/s'],
    21: ['LANDING RADAR VELZ', 'XXXXX', 'ft/s'], 22: ['POSITION7', 'XXXX.X', 'nmi'],
    23: ['TRIM DEGREES2', 'XXX.XX', 'deg'], 24: ['COMPUTED ALTITUDE', 'XXXXX', 'ft'],
    25: ['DP DEGREES', 'XXXX.X', 'deg'], 26: ['POSITION9', 'XXXX.X', 'ft'],
    27: ['VELOCITY4', 'XXXX.X', 'ft/s'],
    // The listing writes "XXX.XXX RADIANS" (six digits, which a register
    // cannot show); three decimals are assumed.
    28: ['RADIANS', 'XX.XXX', 'rad'],
  },
  Comanche055: {
    0: ['WHOLE', 'XXXXX', ''], 1: ['SPARE', 'XXXXX', ''],
    2: ['CDU DEGREES', 'XXX.XX CDU', 'deg'], 3: ['DP DEGREES (90)', 'XX.XXX', 'deg'],
    4: ['DP DEGREES (360)', 'XXX.XX', 'deg'], 5: ['DEGREES (180)', 'XXX.XX', 'deg'],
    6: ['WEIGHT2', 'XXXXX', 'lb'], 7: ['POSITION5', 'XXX.XX', 'nmi'],
    8: ['POSITION4', 'XXXX.X', 'nmi'], 9: ['VELOCITY2', 'XXXXX', 'ft/s'],
    10: ['VELOCITY3', 'XXXX.X', 'ft/s'], 11: ['ELEVATION DEGREES', 'XX.XXX', 'deg'],
    12: ['TRIM DEGREES', 'XXX.XX', 'deg'],
    13: ['INERTIA / THRUST MOMENT', 'XXXXX', 'x100 slug ft² / ft lb'],
    14: ['VELOCITY/2VS', 'XXXXX', 'ft/s'], 15: ['POSITION6', 'XXXX.X', 'nmi'],
    16: ['DRAG ACCELERATION', 'XXX.XX', 'g'], 17: ['POSITION8', 'XXXX.X', 'nmi'],
    18: ['POSITION9', 'XXXXX', 'ft'], 19: ['VELOCITY4', 'XXXX.X', 'ft/s'],
  },
});

const HMS_FORMATS = ['HMS.H', 'HMS.M', 'HMS.S'];
const HMS_UNITS = ['h', 'min', 's'];
const HMS_LABELS = ['HOURS', 'MINUTES', 'SECONDS'];

// Register format + unit of one component from its SF routine and constant.
function formatFor(software, routine, constant, k) {
  const sfc = SF_CONSTANTS[software][constant] || ['?', 'XXXXX', ''];
  switch (routine) {
    case 0: return { format: 'XXXXX OCT', unit: 'octal' };
    case 1: return { format: '.XXXXX', unit: '' };
    case 2: return { format: 'XXX.XX CDU', unit: 'deg' };
    case 6:
      return software === 'Comanche055'
        ? { format: 'XX.XXX', unit: 'deg' }          // Y OPTICS DEGREES (XX.XXX MAX 89.999)
        : { format: '+0000X', unit: 'position' };    // LR POSITION (+0000X)
    case 8: return { format: HMS_FORMATS[k], unit: HMS_UNITS[k] };
    case 9: return { format: 'XXbXX', unit: 'min:s' };
    case 12: return { format: '+XXbYY', unit: '' };
    case 13:
      return software === 'Comanche055'
        ? { format: '.XXXXX', unit: '' }             // DP STRAIGHT FRACTIONAL
        : { format: 'XXX.XX CDU', unit: 'deg' };     // 360-CDU DEGREES
    default:
      // ARITH / DP1-DP4 / ARITH1: the SF constant decides; code 0 with DP1
      // is "DP TIME SEC (XXX.XX SEC)".
      if (constant === 0 && routine === 4) return { format: 'XXX.XX', unit: 's' };
      return { format: sfc[1], unit: sfc[2] };
  }
}

// ------------------------------------------------------------- readers

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Well-known consecutive erasable names (ERASABLE_ASSIGNMENTS.agc).
const CONSECUTIVE = {
  'CDUX+1': 'CDUY', 'CDUX+2': 'CDUZ', 'PIPAX+1': 'PIPAY', 'PIPAX+2': 'PIPAZ',
  'FDAIX+1': 'FDAIY', 'FDAIX+2': 'FDAIZ', 'OPTION1+1': 'OPTION2', 'OPTION1+2': 'OPTION3',
  'ALMCADR+2': 'ERCOUNT',
};

// Simulator fallbacks: [listing name] -> other erasable names tried after it.
const FALLBACKS = {
  HCALC1: ['HCALC'],
  'RSTACK+6': [],
};

function splitName(name) {
  const m = /^(.*?)\+(\d+)$/.exec(name);
  return m ? { base: m[1], off: Number(m[2]) } : { base: name, off: 0 };
}

// Look up one erasable word by listing name (see the header for the rules).
// A vector stored as an array under NAME serves NAME (element 0) and
// NAME+k (element k, or k/2 for double-precision words); scalars stored
// under 'NAME+k' keys work too. { whole: true } returns a stored array as
// is (N64's two-integer FUNNYDSP).
export function readErasable(agc, name, { dp = false, whole = false } = {}) {
  const e = agc && agc.erasable;
  if (!e) return null;
  const tryKey = (key) => {
    if (Object.prototype.hasOwnProperty.call(e, key)) {
      const v = e[key];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  };
  let v = tryKey(name);
  if (v === undefined && CONSECUTIVE[name]) v = tryKey(CONSECUTIVE[name]);
  if (v === undefined) {
    const { base, off } = splitName(name);
    if (off > 0) {
      const arr = tryKey(base);
      if (Array.isArray(arr)) {
        const idx = dp ? off / 2 : off;
        if (Number.isInteger(idx)) v = arr[idx];
      }
    }
  }
  if (v === undefined) {
    for (const alt of FALLBACKS[name] || []) {
      v = tryKey(alt);
      if (v !== undefined) break;
    }
  }
  if (Array.isArray(v)) return whole ? v : num(v[0]);
  return num(v);
}

function writeErasable(agc, name, value, { dp = false } = {}) {
  if (!agc || !agc.erasable) return;
  const e = agc.erasable;
  const { base, off } = splitName(name);
  if (off > 0 && !Object.prototype.hasOwnProperty.call(e, name) && Array.isArray(e[base])) {
    const idx = dp ? off / 2 : off;
    if (Number.isInteger(idx)) {
      e[base][idx] = value;
      return;
    }
  }
  if (CONSECUTIVE[name] && !Object.prototype.hasOwnProperty.call(e, name)) {
    e[CONSECUTIVE[name]] = value;
    return;
  }
  e[name] = value;
}

function failreg(agc, k) {
  const a = agc && agc.alarms;
  let regs = null;
  if (Array.isArray(a)) regs = a;
  else if (a && typeof a.registers === 'function') regs = a.registers();
  else if (a && Array.isArray(a.failreg)) regs = a.failreg;
  if (regs) return Number(regs[k] || 0) & 0o77777;
  const v = readErasable(agc, k ? `FAILREG+${k}` : 'FAILREG');
  return v === null ? 0 : v;
}

// TIME2/TIME1 (N36): GET plus the offset of the last clock load. The
// present time is the Executive's (inside a job, the job's own instant).
function clockNow(agc) {
  const t = agc && agc.exec && typeof agc.exec.now === 'function' ? agc.exec.now() : agc && agc.t;
  return num(t);
}

function readClock(agc) {
  const t = clockNow(agc);
  if (t === null) return readErasable(agc, 'TIME2');
  return t + (num(agc.clockOffset) ?? 0);
}

// V25N36: the counter is set and counts on from the loaded value.
function loadClock(agc, value) {
  const t = clockNow(agc);
  if (t === null) writeErasable(agc, 'TIME2', value, { dp: true });
  else agc.clockOffset = value - t;
}

// The reader for one component.
function makeReader(software, noun, name, routine, k, dp) {
  if (name === 0 || name === '0' || name === null) {
    // IDADDTAB +0: a spare component — except N66 R2 in Luminary099, the LR
    // position read from channel 33 by LRPOSOUT (:1422-1429).
    if (software === 'Luminary099' && routine === 6) return (agc) => readErasable(agc, 'LRPOS');
    return () => null;
  }
  if (name === 'TIME2') return (agc) => readClock(agc);
  if (name === 'SAMPTIME') {
    return (agc) => {
      const p = agc && agc.pinball;
      if (p && num(p.sampTime) !== null) return p.sampTime;
      return readErasable(agc, 'SAMPTIME');
    };
  }
  const base = typeof name === 'string' ? splitName(name).base : null;
  if (base === 'FAILREG') return (agc) => failreg(agc, k);
  if (base === 'ALMCADR') {
    // Alarm data: the model does not keep ALMCADR; unknown words read +0.
    const key = ['ALMCADR', 'ALMCADR+1', 'ERCOUNT'][k];
    return (agc) => {
      const v = readErasable(agc, key);
      return v === null ? 0 : v;
    };
  }
  if (software === 'Luminary099' && noun === 64 && name === 'FUNNYDSP') {
    // TREDES in D1D2, LOOKANGL in D4D5 (FUNNYDSP = DELTAH +2, TREDES =
    // FUNNYDSP, LOOKANGL = FUNNYDSP +1).
    return (agc) => {
      const arr = readErasable(agc, 'FUNNYDSP', { whole: true });
      if (Array.isArray(arr)) return arr;
      const t = readErasable(agc, 'LPDTIME') ?? readErasable(agc, 'TREDES');
      const a = readErasable(agc, 'LPDANGLE') ?? readErasable(agc, 'LOOKANGL');
      if (t === null && a === null) return null;
      return [t ?? 0, a ?? 0];
    };
  }
  if (noun === 34 && name === 'DSPTEM1') {
    return (agc) => readErasable(agc, 'TEVENT') ?? readErasable(agc, 'DSPTEM1');
  }
  const transform = software === 'Luminary099' && routine === 13 ? (v) => (v === null ? null : 360 - v) : null;
  return (agc) => {
    const v = readErasable(agc, name, { dp });
    if (Array.isArray(v)) return null;
    return transform ? transform(v) : v;
  };
}

// --------------------------------------------------------------- decode

const LABEL_FIXES = {
  Luminary099: {
    68: ['SLANT RANGE TO LANDING SITE'],              // AOI :423 ("SIGHT" in the table comment)
    74: [null, 'YAW AFTER VEHICLE RISE'],              // AOI :434
  },
  Comanche055: {},
};

function cleanLabel(s) {
  return String(s).replace(/\s+/g, ' ').replace(/ -- /g, ' - ').replace(/,$/, '').trim();
}

function decode(software, row) {
  const [n, nnad, nntyp, idadd, rutmx, line, idLines, rawName, more] = row;
  const mixed = n >= 40;
  const prefix = software === 'Comanche055' ? 'noun.cmc.' : 'noun.';
  const anchor = prefix + String(n).padStart(2, '0');
  const notes = more.filter((m) => /^\(/.test(m));
  const extraLabels = more.filter((m) => !/^\(/.test(m) && !/^NN\b/.test(m));
  let compCode;
  let inUse;
  let mctbs = false;
  let channel = false;
  let augment = false;
  if (mixed) {
    inUse = nnad !== 0;
    compCode = (nnad >> 10) & 0o37;
  } else {
    inUse = nnad !== 0;
    compCode = (nntyp >> 10) & 0o37;
    if (nnad === 0o40000) mctbs = true;
    if (nnad === 0o77776) channel = true;
    if (nnad === 0o77777) augment = true;
  }
  const count = inUse ? (compCode & 3) + 1 : 0;
  const decimalOnly = !!(compCode & 0o10);
  const noLoad = !!(compCode & 0o20);

  const labelsIn = [rawName, ...extraLabels].map(cleanLabel);
  const fixes = LABEL_FIXES[software][n] || [];
  fixes.forEach((f, i) => { if (f) labelsIn[i] = f; });

  const components = [];
  for (let k = 0; k < count; k++) {
    let routine;
    let constant;
    let name;
    if (mixed) {
      routine = (rutmx >> (5 * k)) & 0o37;
      constant = (nntyp >> (5 * k)) & 0o37;
      name = idadd[k];
    } else {
      routine = (nntyp >> 5) & 0o37;
      constant = nntyp & 0o37;
      const base = typeof nnad === 'string' ? nnad : null;
      const dpN = DP_ROUTINES[software].has(routine);
      if (!base) name = null;
      else if (routine === 8) name = base;                       // HMS: one DP time
      else {
        const { base: b, off } = splitName(base);
        const o = off + (dpN ? 2 * k : k);
        name = o ? `${b}+${o}` : b;
      }
    }
    const dp = DP_ROUTINES[software].has(routine);
    const { format, unit } = formatFor(software, routine, constant, k);
    let label;
    if (routine === 8) label = HMS_LABELS[k];
    else if (labelsIn[k]) label = labelsIn[k];
    else if (count > 1 && labelsIn.length === 1) {
      // One name for several words: X/Y/Z for the CDUX/PIPAX/FDAIX-style
      // triples, otherwise the component number.
      const xyz = !mixed && typeof nnad === 'string' && /X$/.test(nnad);
      label = xyz ? `${labelsIn[0]} ${['X', 'Y', 'Z'][k]}` : `${labelsIn[0]} (${k + 1})`;
    }
    else label = `COMPONENT ${k + 1}`;
    const octalOnly = routine === 0;
    // SFINTABR: LR position, min/sec and 2INT cannot be loaded
    // (Luminary099/PINBALL_GAME_BUTTONS_AND_LIGHTS.agc:2034-2048).
    const loadable = !mctbs && !channel && !augment && !(software === 'Luminary099' && routine === 6)
      && routine !== 9 && routine !== 12 && name !== null && name !== 0;
    const read = makeReader(software, n, mctbs || channel || augment ? null : name, routine, k, dp);
    const comp = {
      index: k,
      label,
      unit,
      format,
      key: typeof name === 'string' ? name : null,
      routine,
      routineName: SF_ROUTINES[software][routine] || '?',
      constant,
      constantName: (SF_CONSTANTS[software][constant] || ['?'])[0],
      dp,
      octalOnly,
      loadable,
      read,
    };
    // The 15-bit word an octal display shows. The model keeps values in
    // display units, so the word is reconstructed for SP scales whose
    // scaling is simple (octal, whole, fraction, CDU degrees); for DP
    // quantities PINBALL shows only the minor (low) word, which the model
    // does not have — those read +0 (a simplification).
    comp.word = (agc) => {
      const v = read(agc);
      if (v === null || Array.isArray(v)) return 0;
      if (routine === 0 || (routine === 3 && constant === 0) || routine === 11) return toWord(v);
      if (routine === 1) return toWord(v * 16384);
      if (routine === 2 || (software === 'Luminary099' && routine === 13)) {
        let a = v % 360;
        if (a < 0) a += 360;
        return Math.round((a / 360) * 32768) & 0o77777;
      }
      if (dp) return 0;
      return toWord(v);
    };
    comp.write = (agc, value) => {
      if (comp.key === 'TIME2') loadClock(agc, value);
      else if (comp.key) writeErasable(agc, comp.key, value, { dp });
    };
    components.push(Object.freeze(comp));
  }

  const name = inUse ? (mixed || count === 1 ? labelsIn.slice(0, Math.max(1, Math.min(count, labelsIn.length))).join(', ') : labelsIn[0]) : 'SPARE';
  return Object.freeze({
    noun: n,
    name,
    notes: notes.map(cleanLabel),
    inUse,
    mixed,
    count,
    decimalOnly,
    noLoad,
    mctbs,
    channel,
    augment,
    components: Object.freeze(components),
    anchor,
    line,
    idaddLines: idLines,
    raw: Object.freeze({ nnad, nntyp, idadd, rutmx }),
  });
}

function buildTable(software, rows) {
  const t = {};
  for (const row of rows) t[row[0]] = decode(software, row);
  for (let n = 0; n < 100; n++) if (!t[n]) throw new Error(`${software}: noun ${n} missing`);
  return Object.freeze(t);
}

export const NOUNS_LUMINARY099 = buildTable('Luminary099', RAW_LUMINARY099);
export const NOUNS_COMANCHE055 = buildTable('Comanche055', RAW_COMANCHE055);

export function nounTable(software = 'Luminary099') {
  return software === 'Comanche055' ? NOUNS_COMANCHE055 : NOUNS_LUMINARY099;
}

export function getNoun(software, n) {
  return nounTable(software)[n] || null;
}

// The register content one component would show with a decimal verb.
export function formatComponent(comp, agc) {
  return formatRegister(comp.read(agc), comp.format);
}

// Every erasable name a software's nouns read: [{ name, nouns: [n...],
// unit, format, label }], sorted by name. (For the program engineers: these
// are the keys to fill in `agc.erasable`, in display units.)
export function erasableNames(software = 'Luminary099') {
  const map = new Map();
  for (const noun of Object.values(nounTable(software))) {
    for (const c of noun.components) {
      if (!c.key) continue;
      const k = c.key;
      if (!map.has(k)) map.set(k, { name: k, nouns: [], unit: c.unit, format: c.format, label: c.label });
      map.get(k).nouns.push(noun.noun);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
