// Ground Elapsed Time helpers. GET is kept in seconds (float) everywhere.

export function parseGET(text) {
  if (typeof text === 'number') return text;
  const parts = String(text).trim().split(':').map(Number);
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) {
    throw new Error(`Bad GET "${text}" (expected hhh:mm:ss[.s])`);
  }
  const [h, m, s] = parts;
  return h * 3600 + m * 60 + s;
}

export function formatGET(seconds, { tenths = false } = {}) {
  const sign = seconds < 0 ? '-' : '';
  let s = Math.abs(seconds);
  if (!tenths) s = Math.floor(s + 1e-6);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s - h * 3600 - m * 60;
  const secText = tenths
    ? sec.toFixed(1).padStart(4, '0')
    : String(Math.floor(sec)).padStart(2, '0');
  return `${sign}${String(h).padStart(3, '0')}:${String(m).padStart(2, '0')}:${secText}`;
}

// "mm:ss" (or "-mm:ss") for countdowns such as time to ignition.
export function formatMinSec(seconds) {
  const sign = seconds < 0 ? '-' : '+';
  const s = Math.floor(Math.abs(seconds) + 1e-6);
  return `${sign}${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
