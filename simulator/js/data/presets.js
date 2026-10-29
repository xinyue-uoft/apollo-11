// Interactive-mode starting points (ARCHITECTURE §11.2): the Lunar Module
// presets of the descent sandbox, then the Command Module presets of
// js/data/presets-cm.js.
//
// The LM presets fly the physics vehicle (js/vehicle/lm-physics.js), which
// starts from the historical Apollo 11 track at the preset's GET
// (stateFromTrack), so each starting point is consistent with what Eagle
// actually did. The computer is put where it was at that moment
// (agc.startProgram(n, { initial: true }), programs/lm/landing.js): TIG is
// Apollo 11's 102:33:05.01 (MR Table 9.6-V); a start after the time the
// crew keyed V57 (102:38:45) has landing-radar updates permitted.

import { PRESETS_CM } from './presets-cm.js';

const A11_TIG = '102:33:05.01';

export const PRESETS_LM = [
  {
    id: 'lm-p00',
    title: 'DSKY only (P00)',
    description: [
      'Eagle’s computer (Luminary 099) idling in P00 at 102:10:30 GET, coasting in the descent orbit — Aldrin selected P63 at about 102:10:32 on Apollo 11.',
      'Try V35E (lamp test), V16N36E (the AGC clock, updated every second; KEY REL or V34E to stop), V05N09E (alarm codes), and an illegal entry such as V37E99E (OPR ERR, cleared with RSET).',
      'V37E63E starts P63 the way the crew did: flashing V06N61 (PRO), V50N25 00014 (ENTR skips the fine alignment), V50N18 (PRO maneuvers, ENTR when done), then the V06N62 countdown to the 102:33:05 ignition — 22 minutes away, so use the 10× speed.',
    ].join(' '),
    software: 'Luminary099',
    vehicle: 'physics',
    track: 'apollo11Descent',
    startGET: '102:10:30',
    initialProgram: 0,
  },
  {
    id: 'lm-pdi',
    title: 'Before PDI (P63, TIG−5 min)',
    description: [
      'P63 at 102:28:00 GET, five minutes before powered descent initiation, counting down on V06N62 (R2 = time to ignition). The physics LM flies whatever the computer commands — the real descent guidance law, on the computer’s own estimate.',
      'At TIG−35 s the DSKY goes blank (Average-G is starting); at TIG−5 s V99N62 flashes — press PRO or the engine will not light. After 26 s at minimum thrust the guidance throttles up.',
      'When the radar locks on (ALT lamp out, about 4¾ min after ignition) key V16N68E to watch ΔH in R3 and V57E to let the computer use the radar — without V57 it keeps believing it is ≈3,000 ft higher. At high gate press PRO on the flashing V06N64.',
      'Turn on the RR switch fault (crew panel) to load the computer the way Apollo 11’s rendezvous radar did, and watch for 1202s on the Executive tab.',
    ].join(' '),
    software: 'Luminary099',
    vehicle: 'physics',
    track: 'apollo11Descent',
    startGET: '102:28:00',
    initialProgram: 63,
    agcOptions: { tig: A11_TIG },
  },
  {
    id: 'lm-highgate',
    title: 'High gate (P64)',
    description: [
      'P64 at high gate, 102:41:32 GET: about 7,100 ft up, descending at 125 ft/s, landing radar data in use. V06N64 flashes — press PRO to allow landing-point redesignation.',
      'R1 shows the seconds left for redesignation and the LPD angle (where to look along the window scale). Each LPD click moves the aim point 0.5° fore/aft or 2° left/right; the guidance turns toward the new site.',
      'Switch the PGNS mode to ATT HOLD and click the ROD switch to take over in P66, or let the computer continue into P65 (automatic vertical descent at 3 ft/s).',
    ].join(' '),
    software: 'Luminary099',
    vehicle: 'physics',
    track: 'apollo11Descent',
    startGET: '102:41:32',
    initialProgram: 64,
    agcOptions: { tig: A11_TIG },
  },
  {
    id: 'lm-lowgate',
    title: 'Low gate (P66)',
    description: [
      'P66 at 102:43:22 GET, where Armstrong took over: about 430 ft, 11 ft/s down, 60 ft/s forward, PGNS mode in ATT HOLD. V06N60 shows forward velocity, altitude rate and altitude.',
      'Each click of the ROD switch changes the commanded descent rate by 1 ft/s (up = slower); the computer throttles to hold it. Luminary 099 does not fly the attitude in P66 — here a stand-in for the commander’s hand controller nulls the forward speed.',
      'After the contact light, ENGINE STOP (a stand-in pushes it 1.5 s after touchdown if you do not). Then key V37E68E for P68: flashing V06N43 shows where the computer thinks you landed.',
    ].join(' '),
    software: 'Luminary099',
    vehicle: 'physics',
    track: 'apollo11Descent',
    startGET: '102:43:22',
    initialProgram: 66,
    agcOptions: { tig: A11_TIG, pgnsMode: 'attHold' },
  },
];

export const PRESETS = [...PRESETS_LM, ...PRESETS_CM];
