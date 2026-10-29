// Source anchors the demo scenarios (js/demo/scenarios/*.js) need and no
// other anchor file defines. Most scenario cards point at the owners'
// anchors (burn.*, exec.*, alarm.*, restart.*, pinball.*, verb.*, p63.* …
// p68.*, lr.*, cm.*, src.*); these are the remaining lines a narration card
// shows. Every range was checked by hand against the listing in this
// repository (1-based line numbers); where `label` is given, line `start`
// begins with that label in the AGC label column (enforced by
// test/anchors.test.mjs).
//
// Prefix `scn.` keeps these ids clear of the per-owner prefixes, so the
// merge in anchors/index.js can never see a duplicate id.

const BBB = 'Luminary099/BURN_BABY_BURN--MASTER_IGNITION_ROUTINE.agc';
const AOI = 'Luminary099/ASSEMBLY_AND_OPERATION_INFORMATION.agc';
const FSR = 'Luminary099/FRESH_START_AND_RESTART.agc';

export const ANCHORS = {
  // ---------- nouns: the assembly notes' plain-language descriptions ----------
  'scn.noun.n68': {
    file: AOI, start: 423, end: 425,
    title: 'Noun 68: slant range, time to go, LR alt − computed alt (ΔH)',
  },
  'scn.noun.list.landing': {
    file: AOI, start: 399, end: 425,
    title: 'Nouns 60–68 of the landing programs',
  },
  'scn.pinball.nouns': {
    file: 'Luminary099/PINBALL_NOUN_TABLES.agc', start: 714, end: 731,
    title: 'Noun tables: where N60–N65 get their numbers (ECADRs)',
  },

  // ---------- V37: the program list (the FCADRs, with program names) ----------
  'scn.v37.table': {
    file: FSR, label: 'FCADRMM1', start: 1063, end: 1075,
    title: 'Programs V37 may select (P68 = LANDJUNK, P63 = P63LM)',
  },

  // ---------- P63 before BURNBABY ----------
  'scn.burn.v06n61': {
    file: BBB, start: 752, end: 758,
    title: 'Flashing V06N61: “reset his event timer to agree with TIG”',
  },
};
