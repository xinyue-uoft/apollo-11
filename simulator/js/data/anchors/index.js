// Source anchors: named line ranges of the Luminary099/ and Comanche055/
// listings that the source panel highlights (ARCHITECTURE §10). Each owner
// keeps its anchors in its own file to avoid edit conflicts; this module
// merges them into one frozen registry and refuses duplicate ids, so two
// owners can never silently define the same id differently.
//
//   import { ANCHORS, getAnchor, listAnchors } from './data/anchors/index.js';
//
// Anchor shape: { file, start, end, title, label?, note? } — `file` is
// repo-relative, `start`/`end` are 1-based inclusive line numbers, `label`
// (optional) is the AGC label that begins line `start`. The merged entries
// also carry `id` and `owner` (the file they came from).

import { ANCHORS as CORE } from './core.js';
import { ANCHORS as EXEC } from './exec.js';
import { ANCHORS as PINBALL } from './pinball.js';
import { ANCHORS as PROGRAMS } from './programs.js';
import { ANCHORS as CM } from './cm.js';
import { ANCHORS as SCENARIOS } from './scenarios.js';

// Owner name → its anchors. Adding an anchor file means adding it here (the
// anchors test fails when a file in this folder is not merged).
export const ANCHOR_SOURCES = Object.freeze({
  core: CORE,
  exec: EXEC,
  pinball: PINBALL,
  programs: PROGRAMS,
  cm: CM,
  scenarios: SCENARIOS,
});

// Merge per-owner maps; throws on a duplicate id (naming both owners) or on
// an entry that is not an object.
export function mergeAnchors(sources) {
  const merged = {};
  const ownerOf = {};
  for (const [owner, anchors] of Object.entries(sources)) {
    for (const [id, anchor] of Object.entries(anchors || {})) {
      if (Object.prototype.hasOwnProperty.call(merged, id)) {
        throw new Error(`Duplicate source anchor id "${id}" (defined in anchors/${ownerOf[id]}.js and anchors/${owner}.js)`);
      }
      if (!anchor || typeof anchor !== 'object') {
        throw new Error(`Source anchor "${id}" in anchors/${owner}.js is not an object`);
      }
      ownerOf[id] = owner;
      merged[id] = Object.freeze({ ...anchor, id, owner });
    }
  }
  return Object.freeze(merged);
}

export const ANCHORS = mergeAnchors(ANCHOR_SOURCES);

const SORTED = Object.freeze(Object.keys(ANCHORS).sort().map((id) => ANCHORS[id]));

// The anchor with this id, or null (never throws: views show a notice for
// an unknown id instead of failing).
export function getAnchor(id) {
  if (typeof id !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(ANCHORS, id) ? ANCHORS[id] : null;
}

// Every anchor, sorted by id.
export function listAnchors() {
  return SORTED;
}
