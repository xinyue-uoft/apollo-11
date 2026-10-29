#!/usr/bin/env node
// Generates simulator/js/data/source-manifest.js: one entry per listing file
// (and README) of Luminary099/ and Comanche055/, with its line count, the
// listing pages it covers, its place in the assembly (MAIN.agc include
// order and the "log section" group it belongs to) and a one-line
// description for the source panel's file browser.
//
//   node simulator/tools/gen-manifest.mjs           (rewrites the manifest)
//   node simulator/tools/gen-manifest.mjs --check   (exit 1 if out of date)
//
// Where the metadata comes from:
// - order + pages: the `$FILE.agc  # pp. a-b` includes of each MAIN.agc;
// - section + official title: the log-section table near the top of
//   ASSEMBLY_AND_OPERATION_INFORMATION.agc ("TABLE OF SUBROUTINE LOG
//   SECTIONS" in Luminary099:52-147, "SUBROUTINE CALLS" in Comanche055:33-112),
//   which lists the rope's sections (LUMERASE, LNYAIDE, ... / COMERASE,
//   COMAID, ...) in the same order as the includes;
// - description: the yaYUL file headers only say "Part of the source code
//   for Luminary 1A build 099", so the one-liners below are summaries of each
//   file's own header comments (PROGRAM NAME / FUNCTIONAL DESCRIPTION blocks
//   and the first comment after the page marker). Files without an entry fall
//   back to that first descriptive comment, extracted automatically.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const OUTPUT = 'simulator/js/data/source-manifest.js';

export const PROGRAMS = {
  Luminary099: {
    id: 'Luminary099',
    title: 'Luminary 099',
    vehicle: 'Lunar Module “Eagle”',
    // Luminary099/*.agc headers, e.g. EXECUTIVE.agc:26-29
    assembly: 'Assemble revision 001 of AGC program LMY99 by NASA 2021112-061, 16:27 JULY 14, 1969',
    aka: 'Luminary 1A',
    logTable: 'TABLE OF SUBROUTINE LOG SECTIONS',
  },
  Comanche055: {
    id: 'Comanche055',
    title: 'Comanche 055',
    vehicle: 'Command Module “Columbia”',
    // Comanche055/*.agc headers, e.g. CONTRACT_AND_APPROVALS.agc:22-23
    assembly: 'Assemble revision 055 of AGC program Comanche by NASA 2021113-051, 10:28 APR. 1, 1969',
    aka: 'Colossus 2A',
    logTable: 'SUBROUTINE CALLS',
  },
};

// One-line summaries keyed by file name; a "Program/NAME" key overrides the
// shared entry for one program. Keep them short and factual.
const DESCRIPTIONS = {
  'README.md': 'How the transcription was made and the index of source files with their listing pages.',
  'MAIN.agc': 'The include list that assembles every file below into one program, in listing order with page numbers.',
  'CONTRACT_AND_APPROVALS.agc': 'Title page — “Colossus 2A” — and the approvals signed 28 March 1969 by Margaret H. Hamilton and others.',
  'ASSEMBLY_AND_OPERATION_INFORMATION.agc': 'Title page, the table of log sections and the crew reference lists: verbs, nouns, alarm codes, checklist and option codes.',
  'TAGS_FOR_RELATIVE_SETLOC.agc': 'Memory bank layout: the tags that place each section in a fixed-memory bank.',
  'CONTROLLED_CONSTANTS.agc': 'Controlled mission constants: DPS and APS engine parameters, landing-radar and other tuning values.',
  'INPUT_OUTPUT_CHANNEL_BIT_DESCRIPTIONS.agc': 'What every bit of the I/O channels means: DSKY lamps, engine on/off, switches, radar and IMU discretes.',
  'FLAGWORD_ASSIGNMENTS.agc': 'The named bit flags (flagwords) that programs set and test, with their meanings.',
  'ERASABLE_ASSIGNMENTS.agc': 'The erasable-memory map: every variable, the Executive’s core sets and VAC areas, FAILREG, restart phase tables.',
  'INTERRUPT_LEAD_INS.agc': 'The interrupt vectors at address 4000: restart (GOJAM), timers T6/T5/T3/T4, keyboard, uplink, downlink, radar.',
  'T4RUPT_PROGRAM.agc': 'T4RUPT: the 120 ms output cycle that drives the DSKY relays and lamps and monitors the IMU and other discretes.',
  'RCS_FAILURE_MONITOR.agc': 'Watches the RCS jet-failure switches and updates the autopilot’s jet masks.',
  'DOWNLINK_LISTS.agc': 'Telemetry downlink lists: which memory words are sent to the ground in each phase of the mission.',
  'AGS_INITIALIZATION.agc': 'R47: sends the state vector and time to the Abort Guidance System (AGS) to initialise it.',
  'FRESH_START_AND_RESTART.agc': 'Fresh start (V36), hardware restart (GOPROG) and software restart (ENEMA) — and GOTOPOOH, the way back to P00.',
  'RESTART_TABLES.agc': 'Restart tables: for each restart group and phase, which job or task to restart and at what priority.',
  'AOTMARK.agc': 'Alignment Optical Telescope (AOT) star-sighting marks.',
  'SXTMARK.agc': 'SXTMARK: star and landmark marks made by the astronaut with the optics.',
  'EXTENDED_VERBS.agc': 'The extended verbs (VERB 40 and up): fan-out table and the routines they start, e.g. V57, V69, V82, V83, V99.',
  'PINBALL_NOUN_TABLES.agc': 'Noun tables: which memory words each noun shows, in how many components, with what scaling and format.',
  'LEM_GEOMETRY.agc': 'Builds the LM and CSM state vectors (conic plus deviations) for navigation and downlink.',
  'CSM_GEOMETRY.agc': 'Optics geometry: sextant shaft and trunnion angles to line-of-sight vectors; state-vector helpers.',
  'IMU_COMPENSATION_PACKAGE.agc': 'IMU error compensation: gyro drift and accelerometer (PIPA) bias corrections.',
  'R63.agc': 'R63 (V89): points an LM axis along the line of sight to the CSM.',
  'ATTITUDE_MANEUVER_ROUTINE.agc': 'KALCMANU: plans automatic attitude maneuvers for the digital autopilot.',
  'GIMBAL_LOCK_AVOIDANCE.agc': 'Detects attitudes that would drive the IMU toward gimbal lock.',
  'KALCMANU_STEERING.agc': 'KALCMANU steering: new attitude commands for the autopilot every second of a maneuver.',
  'SYSTEM_TEST_STANDARD_LEAD_INS.agc': 'Lead-ins that let system-test programs run from erasable memory.',
  'IMU_PERFORMANCE_TEST_2.agc': 'IMU performance tests (ground test programs).',
  'IMU_PERFORMANCE_TESTS_4.agc': 'IMU performance tests (ground test programs).',
  'IMU_CALIBRATION_AND_ALIGNMENT.agc': 'IMU calibration and alignment tests and routines.',
  'PINBALL_GAME_BUTTONS_AND_LIGHTS.agc': 'PINBALL GAME: the keyboard and display program — verb/noun entry, displays, monitors, lamp test, RSET.',
  'R60_62.agc': 'R60/R62: maneuver the spacecraft to a specified attitude.',
  'S-BAND_ANTENNA_FOR_LM.agc': 'R05: pointing angles for the LM’s S-band antenna.',
  'S-BAND_ANTENNA_FOR_CM.agc': 'Pointing angles for the CM’s S-band antenna.',
  'RADAR_LEADIN_ROUTINES.agc': 'Radar sampling: reading the rendezvous and landing radars.',
  'P20-P25.agc': 'Rendezvous radar navigation (P20), lunar-surface navigation (P22), preferred tracking attitude (P25) and radar routines.',
  'P30_P37.agc': 'P30: external delta-V maneuver targeting.',
  'P30-P37.agc': 'P30 external delta-V targeting and related routines.',
  'P32-P35_P72-P75.agc': 'Rendezvous targeting: coelliptic sequence initiation and constant delta height (P32/P33, P72/P73).',
  'P32-P33_P72-P73.agc': 'Rendezvous targeting: coelliptic sequence initiation and constant delta height (P32/P33, P72/P73).',
  'GENERAL_LAMBERT_AIMPOINT_GUIDANCE.agc': 'General Lambert aimpoint maneuver guidance (P31).',
  'GROUND_TRACKING_DETERMINATION_PROGRAM.agc': 'P21: ground track determination.',
  'P34-35_P74-75.agc': 'Rendezvous targeting: transfer phase initiation and midcourse (P34/P35, P74/P75).',
  'R31.agc': 'R31 (V83): rendezvous parameter display.',
  'P76.agc': 'P76: target delta-V — updates the other vehicle’s state vector after its burn.',
  'R30.agc': 'R30 (V82): orbit parameter display — apocenter, pericenter, time of free fall.',
  'STABLE_ORBIT.agc': 'Stable orbit rendezvous programs (P38/P78, P39/P79).',
  'BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc': 'BURNBABY: the table-driven master ignition routine — countdown, Average-G start, ullage, “please enable engine”, ignition.',
  'P40-P47.agc': 'Thrusting programs: P40 (DPS), P41 (RCS), P42 (APS) and P47 thrust monitor.',
  'Comanche055/P40-P47.agc': 'Thrusting programs: P40 (SPS), P41 (RCS) and P47 (thrust monitor).',
  'Comanche055/P20-P25.agc': 'Rendezvous navigation (P20), orbital navigation (P22) and cislunar midcourse navigation (P23).',
  'Comanche055/P51-P53.agc': 'IMU alignment programs P51, P52 and the backup alignments P53/P54.',
  'Comanche055/EXTENDED_VERBS.agc': 'The extended verbs (VERB 40 and up): the fan-out table and the routines they start.',
  'THE_LUNAR_LANDING.agc': 'P63 set-up: the ignition algorithm that finds the time of powered-descent ignition, then hands over to BURNBABY; and P68 landing confirmation.',
  'THROTTLE_CONTROL_ROUTINES.agc': 'Throttle control: turns guidance’s thrust request into DPS throttle commands.',
  'LUNAR_LANDING_GUIDANCE_EQUATIONS.agc': 'Landing guidance P63–P67: the quadratic guidance law, landing-radar updates, LPD redesignation, ROD, auto-mode monitor.',
  'P70-P71.agc': 'P70/P71: descent-engine and ascent-engine aborts.',
  'P12.agc': 'P12: powered ascent from the lunar surface.',
  'ASCENT_GUIDANCE.agc': 'Ascent guidance used by P12 and the aborts P70/P71.',
  'SERVICER.agc': 'SERVICER: Average-G navigation every 2 s in powered flight (PREREAD, READACCS) and landing-radar incorporation.',
  'SERVICER207.agc': 'SERVICER: Average-G navigation every 2 s in powered flight (PREREAD, READACCS).',
  'LANDING_ANALOG_DISPLAYS.agc': 'R10: drives the LM’s analog displays during landing — altitude, altitude rate and velocity cross-pointers.',
  'FINDCDUW--GUIDAP_INTERFACE.agc': 'FINDCDUW: turns guidance’s thrust-direction command into autopilot attitude commands.',
  'P51-P53.agc': 'IMU alignment programs (P51, P52) and the lunar-surface alignment P57.',
  'LUNAR_AND_SOLAR_EPHEMERIDES_SUBROUTINES.agc': 'LSPOS: positions of the Sun and the Moon.',
  'DOWN_TELEMETRY_PROGRAM.agc': 'Down telemetry: sends the downlink list words to the ground (DOWNRUPT).',
  'DOWN-TELEMETRY_PROGRAM.agc': 'Down telemetry: sends the downlink list words to the ground (DOWNRUPT).',
  'INTER-BANK_COMMUNICATION.agc': 'BANKCALL, POSTJUMP and friends: calling code in another memory bank.',
  'INTERPRETER.agc': 'The interpreter: a virtual machine for vector, matrix and double-precision math, used by navigation and guidance.',
  'FIXED_FIXED_CONSTANT_POOL.agc': 'Constants in fixed-fixed memory used by every bank: bit masks, priorities (PRIO20 …), common numbers.',
  'INTERPRETIVE_CONSTANT.agc': 'Constants used by interpretive code.',
  'INTERPRETIVE_CONSTANTS.agc': 'Constants used by interpretive code.',
  'SINGLE_PRECISION_SUBROUTINES.agc': 'Single-precision sine and cosine.',
  'EXECUTIVE.agc': 'The Executive: priority job scheduling with core sets and VAC areas — alarms 1201/1202 when they run out.',
  'WAITLIST.agc': 'The Waitlist: timed tasks driven by T3RUPT (at most 9 at a time) — alarm 1203 when it is full.',
  'LATITUDE_LONGITUDE_SUBROUTINES.agc': 'Conversions between position vectors and latitude, longitude and altitude.',
  'PLANETARY_INERTIAL_ORIENTATION.agc': 'Conversions between planet-fixed and inertial coordinates (RP-TO-R, R-TO-RP).',
  'MEASUREMENT_INCORPORATION.agc': 'Incorporates navigation measurements into the state vector (INCORP1/INCORP2).',
  'CONIC_SUBROUTINES.agc': 'Conic (two-body) orbit routines: Kepler, Lambert, time-theta.',
  'INTEGRATION_INITIALIZATION.agc': 'Sets up numerical integration of the LM and CSM state vectors.',
  'ORBITAL_INTEGRATION.agc': 'Numerical integration of the state vectors.',
  'INFLIGHT_ALIGNMENT_ROUTINES.agc': 'Inflight alignment math, e.g. gyro torque angles (CALCGTA).',
  'POWERED_FLIGHT_SUBROUTINES.agc': 'Powered-flight helpers: CDU angle trigonometry (CDUTRIG) and matrix conversions.',
  'TIME_OF_FREE_FALL.agc': 'Time-of-free-fall and conic time routines.',
  'STAR_TABLES.agc': 'The navigation star catalogue: unit vectors of the numbered stars.',
  'AGC_BLOCK_TWO_SELF_CHECK.agc': 'Self-check: the AGC’s built-in instruction and memory tests.',
  'AGC_BLOCK_TWO_SELF-CHECK.agc': 'Self-check: the AGC’s built-in instruction and memory tests.',
  'PHASE_TABLE_MAINTENANCE.agc': 'Restart protection: PHASCHNG records each group’s phase; NEWMODEX updates the PROG display.',
  'RESTARTS_ROUTINE.agc': 'RESTARTS: after a restart, re-creates each active group’s job or task from the phase tables.',
  'IMU_MODE_SWITCHING_ROUTINES.agc': 'IMU zeroing, coarse and fine alignment and mode switching.',
  'KEYRUPT_UPRUPT.agc': 'KEYRUPT and UPRUPT: every DSKY key press (or uplinked key) starts a PINBALL job.',
  'DISPLAY_INTERFACE_ROUTINES.agc': 'How programs ask for DSKY displays: GODSP, GOFLASH, GOPERF, priority displays.',
  'SERVICE_ROUTINES.agc': 'Utility routines such as UPFLAG/DOWNFLAG and job delays.',
  'ALARM_AND_ABORT.agc': 'ALARM, BAILOUT, POODOO: store alarm codes in FAILREG, light PROG, restart or abort to P00.',
  'UPDATE_PROGRAM.agc': 'P27: ground uplink updates of state vectors and other data.',
  'RTB_OP_CODES.agc': 'Routines called from interpretive code with RTB (e.g. LOADTIME).',
  'RT8_OP_CODES.agc': 'Routines called from interpretive code with RTB (e.g. LOADTIME).',
  'T6-RUPT_PROGRAMS.agc': 'T6RUPT: times the RCS jet firings for the LM autopilot.',
  'DAP_INTERFACE_SUBROUTINES.agc': 'Subroutines that let mission programs set the mode of, and talk to, the LM autopilot.',
  'DAPIDLER_PROGRAM.agc': 'DAPIDLER: runs 10 times a second until the autopilot can start, then initialises it.',
  'P-AXIS_RCS_AUTOPILOT.agc': 'LM autopilot: RCS jet control about the P axis (T5RUPT, nominally every 100 ms).',
  'Q_R-AXIS_RCS_AUTOPILOT.agc': 'LM autopilot: RCS jet control about the Q and R axes, and translation.',
  'TJET_LAW.agc': 'LM autopilot: the jet-firing time law.',
  'KALMAN_FILTER.agc': 'LM autopilot: tallies the jet torques commanded each pass (RATELOOP) for the rate filter and the downlink.',
  'TRIM_GIMBAL_CONTROL_SYSTEM.agc': 'LM autopilot: trims the descent engine’s gimbal to keep thrust through the centre of mass.',
  'AOSTASK_AND_AOSJOB.agc': '1/ACCS: recomputes autopilot parameters when mass, deadband, configuration or offset accelerations change.',
  'SPS_BACK-UP_RCS_CONTROL.agc': 'SPSRCS: RCS attitude control of the docked LM+CSM stack.',
  'ANGLFIND.agc': 'KALCMANU: computes the attitude-maneuver axis and angle for the CSM.',
  'AUTOMATIC_MANEUVERS.agc': 'CSM RCS autopilot: attitude errors and minimum-impulse control.',
  'CM_BODY_ATTITUDE.agc': 'CM body attitude angles for entry.',
  'CM_ENTRY_DIGITAL_AUTOPILOT.agc': 'The CM entry autopilot.',
  'ENTRY_LEXICON.agc': 'Variables and constants of the entry programs.',
  'REENTRY_CONTROL.agc': 'Entry guidance: targeting and the phases of atmospheric entry.',
  'P61-P67.agc': 'Entry programs P61–P67.',
  'P37_P70.agc': 'P37: return-to-Earth targeting.',
  'P11.agc': 'P11: Earth orbit insertion monitor (launch).',
  'TPI_SEARCH.agc': 'TPI search: the minimum-velocity transfer from a given TPI time.',
  'LUNAR_LANDMARK_SELECTION_FOR_CM.agc': 'A one-page section (no code in this listing).',
  'JET_SELECTION_LOGIC.agc': 'CSM RCS autopilot: which jets to fire for each rotation and translation command.',
  'RCS-CSM_DIGITAL_AUTOPILOT.agc': 'The CSM RCS digital autopilot.',
  'RCS-CSM_DAP_EXECUTIVE_PROGRAMS.agc': 'CSM RCS autopilot housekeeping, e.g. the gimbal-to-body matrices once a second.',
  'MYSUBS.agc': 'Small arithmetic subroutines used by the TVC autopilot.',
  'TVCINITIALIZE.agc': 'Thrust vector control (SPS burns): autopilot initialisation and start-up.',
  'TVCEXECUTIVE.agc': 'Thrust vector control: the TVC executive (gains, centre-of-gravity correction).',
  'TVCMASSPROP.agc': 'Thrust vector control: mass properties of the CSM (and docked LM).',
  'TVCRESTARTS.agc': 'Thrust vector control: restart protection.',
  'TVCDAPS.agc': 'Thrust vector control: the pitch and yaw TVC autopilot filters.',
  'TVCSTROKETEST.agc': 'Thrust vector control: the gimbal stroke test.',
  'TVCROLLDAP.agc': 'Thrust vector control: the roll autopilot during SPS burns.',
};

// ---------- helpers (also used by the tests) ----------

// Line count as the source panel shows it: a trailing newline does not start
// another line.
export function countLines(text) {
  if (!text) return 0;
  const n = text.split('\n').length;
  return text.endsWith('\n') ? n - 1 : n;
}

export function listSourceFiles(root = REPO_ROOT) {
  const out = [];
  for (const program of Object.keys(PROGRAMS)) {
    const names = readdirSync(join(root, program))
      .filter((n) => n.endsWith('.agc') || n === 'README.md')
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) out.push(`${program}/${name}`);
  }
  return out;
}

const norm = (s) => s.toUpperCase().replace(/\.AGC$/, '').replace(/[^A-Z0-9]/g, '');

// Includes of MAIN.agc in order: [{ name, pages, section? }].
function parseMain(text) {
  const out = [];
  let section = null;
  for (const line of text.split('\n')) {
    const inc = /^\$(\S+\.agc)\s*(?:#\s*pp?\.\s*([\d\s-]+))?/.exec(line);
    if (inc) {
      out.push({ name: inc[1], pages: inc[2] ? inc[2].replace(/\s+/g, '') : null, section });
      continue;
    }
    // Comanche055/MAIN.agc marks its sections ("# COMERASE", "# COMAID", ...).
    const sec = /^#\s+([A-Z][A-Z0-9]+)\s*$/.exec(line);
    if (sec) section = sec[1];
  }
  return out;
}

// The log-section table: [{ section, title }] in assembly order.
function parseLogTable(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.replace(/^#\s*/, '').trim() === heading);
  if (start < 0) return [];
  const out = [];
  let section = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^#\s*Page\s+\d+/.test(line)) continue;
    const sec = /^#\t([^\t\s].*?)\s*$/.exec(line);
    const log = /^#\t\t(\S.*?)\s*$/.exec(line);
    if (log) out.push({ section, title: log[1].replace(/\s{2,}/g, ' ') });
    else if (sec) section = sec[1];
    else if (out.length) break;          // blank "#" line ends the table
  }
  return out;
}

// First descriptive comment after the first "# Page" marker (fallback only).
function headerSummary(lines) {
  const page = lines.findIndex((l) => /^#\s*Page\s+\d+/.test(l));
  for (let i = page + 1; i > 0 && i < Math.min(lines.length, page + 80); i++) {
    const l = lines[i];
    if (!/^#[^#]/.test(l) || /^#\s*Page\s/.test(l)) continue;
    const text = l.replace(/^#\s*/, '').replace(/\s+/g, ' ').trim();
    if (/[A-Z]{3,}/.test(text) && !/^[*\s-]+$/.test(text) && text.length > 8) {
      const t = text.replace(/^(PROGRAM NAME|SUBROUTINE NAME|NAME)\s*[:.\-]+\s*/i, '');
      return t.charAt(0) + t.slice(1).toLowerCase();
    }
  }
  return null;
}

function humanTitle(name) {
  return name.replace(/\.agc$/, '').replace(/--/g, ' — ').replace(/_/g, ' ');
}

export function buildManifest(root = REPO_ROOT) {
  const files = [];
  for (const program of Object.keys(PROGRAMS)) {
    const dir = join(root, program);
    const main = existsSync(join(dir, 'MAIN.agc')) ? parseMain(readFileSync(join(dir, 'MAIN.agc'), 'utf8')) : [];
    const aoi = join(dir, 'ASSEMBLY_AND_OPERATION_INFORMATION.agc');
    const table = existsSync(aoi) ? parseLogTable(readFileSync(aoi, 'utf8'), PROGRAMS[program].logTable) : [];
    const names = readdirSync(dir).filter((n) => n.endsWith('.agc') || n === 'README.md');
    const byNorm = new Map(names.map((n) => [norm(n), n]));

    // MAIN.agc include → actual file (a few include names differ from the
    // transcribed file names, e.g. LAMBERT_AIMPOINT_GUIDANCE.agc vs
    // GENERAL_LAMBERT_AIMPOINT_GUIDANCE.agc, TRIM_GIMBAL_CNTROL_SYSTEM.agc).
    const resolveInclude = (inc) => {
      if (names.includes(inc)) return inc;
      const n = norm(inc);
      if (byNorm.has(n)) return byNorm.get(n);
      return names.find((f) => norm(f).endsWith(n) || n.endsWith(norm(f)))
        || names.find((f) => editDistance(norm(f), n) <= 2) || null;
    };

    // The log-section table lists the files in include order, but not every
    // include has a row (Comanche055's LUNAR_LANDMARK_SELECTION_FOR_CM has
    // none) and the "log cards" at the start have none, so align the two
    // lists by name, looking a few rows ahead.
    const info = new Map();
    let j = 0;
    let lastSection = null;
    main.forEach((inc, i) => {
      const file = resolveInclude(inc.name);
      if (!file) return;
      let row = null;
      for (let k = j; k < Math.min(table.length, j + 4); k++) {
        if (sameTitle(file, table[k].title)) {
          row = table[k];
          j = k + 1;
          break;
        }
      }
      if (row) lastSection = row.section;
      info.set(file, {
        order: i + 1,
        pages: inc.pages,
        section: row?.section || inc.section || (j > 0 ? lastSection : null),
        logTitle: row?.title || null,
      });
    });

    for (const name of names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      const text = readFileSync(join(dir, name), 'utf8');
      const lines = text.split('\n');
      const meta = info.get(name) || {};
      const headerPages = /^#\s*Pages?:\s*(\S+)/m.exec(text)?.[1] || null;
      files.push({
        file: `${program}/${name}`,
        program,
        name,
        title: meta.logTitle || (name === 'README.md' ? 'README' : humanTitle(name)),
        section: meta.section || null,
        order: meta.order || null,
        pages: meta.pages || (headerPages ? headerPages.replace(/^0+(\d)/, '$1').replace(/-0+(\d)/, '-$1') : null),
        lines: countLines(text),
        description: DESCRIPTIONS[`${program}/${name}`] || DESCRIPTIONS[name]
          || (name.endsWith('.agc') ? headerSummary(lines) : null) || '',
      });
    }
  }
  return { programs: PROGRAMS, files };
}

// Levenshtein distance; names are short. Catches MAIN.agc's
// TRIM_GIMBAL_CNTROL_SYSTEM and table titles such as "R60,R62" (R60_62.agc),
// "RTB OP CODES" (RT8_OP_CODES.agc), "IMU PERFORMANCE TESTS 2".
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, k) => k);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let k = 1; k <= b.length; k++) {
      cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Does a log-section title name this file? ("STABLE ORBIT - P38-P39" names
// STABLE_ORBIT.agc; "P34-P35, P74-P75" names P34-35_P74-75.agc.)
function sameTitle(file, title) {
  const a = norm(file);
  const b = norm(title);
  return a === b || b.startsWith(a) || editDistance(a, b) <= 2;
}

// JS literal with single-quoted strings and bare keys (repository style).
function toJs(value) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) return `[${value.map(toJs).join(', ')}]`;
  const body = Object.entries(value)
    .map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : toJs(k)}: ${toJs(v)}`)
    .join(', ');
  return `{ ${body} }`;
}

export function renderManifest({ programs, files }) {
  const progs = Object.values(programs).map(({ logTable, ...p }) => `  ${p.id}: ${toJs(p)},`);
  const lines = [
    '// GENERATED by simulator/tools/gen-manifest.mjs — do not edit by hand.',
    '// Every listing file (and README) of Luminary099/ and Comanche055/: line',
    '// count, listing pages, place in the assembly (MAIN.agc order, log section)',
    '// and a one-line description. Regenerate with:',
    '//   node simulator/tools/gen-manifest.mjs',
    '',
    'export const PROGRAMS = {',
    ...progs,
    '};',
    '',
    'export const MANIFEST = [',
    ...files.map((f) => `  ${toJs(f)},`),
    '];',
    '',
    'const BY_FILE = new Map(MANIFEST.map((entry) => [entry.file, entry]));',
    '',
    '// Manifest entry for a repo-relative path such as',
    "// 'Luminary099/EXECUTIVE.agc', or null.",
    'export function getManifestEntry(file) {',
    '  return BY_FILE.get(file) || null;',
    '}',
    '',
  ];
  return lines.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const manifest = buildManifest();
  const text = renderManifest(manifest);
  const out = join(REPO_ROOT, OUTPUT);
  const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
  if (check) {
    if (current !== text) {
      console.error(`${OUTPUT} is out of date — run: node simulator/tools/gen-manifest.mjs`);
      process.exit(1);
    }
    console.log(`${OUTPUT} is up to date (${manifest.files.length} files).`);
    return;
  }
  if (current !== text) writeFileSync(out, text);
  const total = manifest.files.reduce((sum, f) => sum + f.lines, 0);
  const missing = manifest.files.filter((f) => !f.description).map((f) => f.file);
  console.log(`${current === text ? 'Unchanged' : 'Wrote'} ${OUTPUT}: ${manifest.files.length} files, ${total} lines.`);
  if (missing.length) console.log(`No description for: ${missing.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
