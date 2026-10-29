// Registry of historical tracks for the replay vehicle (ARCHITECTURE
// §11.2). Scenarios and presets name a track by its key here
// (`track: 'apollo11Descent'`); app.js passes TRACKS[key] to the
// Simulation as `replayTrack`.

import { APOLLO11_DESCENT } from './apollo11-descent.js';

export const TRACKS = Object.freeze({
  apollo11Descent: APOLLO11_DESCENT,
});

export function getTrack(id) {
  const track = TRACKS[id];
  if (!track) throw new Error(`Unknown track "${id}" (data/tracks.js has: ${Object.keys(TRACKS).join(', ')})`);
  return track;
}
