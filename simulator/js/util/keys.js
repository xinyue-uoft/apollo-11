// DSKY key names and the compact keystroke-script notation used by
// scenarios: V=VERB N=NOUN E=ENTR P=PRO C=CLR R=RSET K=KEY REL, + - 0-9.

export const KEYS = Object.freeze([
  'VERB', 'NOUN', '+', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'CLR', 'PRO', 'KEY REL', 'ENTR', 'RSET',
]);

const LETTERS = {
  V: 'VERB', N: 'NOUN', E: 'ENTR', P: 'PRO', C: 'CLR', R: 'RSET', K: 'KEY REL',
};

export function isKey(name) {
  return KEYS.includes(name);
}

export function parseKeys(script) {
  const out = [];
  for (const ch of String(script).toUpperCase()) {
    if (/\s/.test(ch)) continue;
    if (LETTERS[ch]) out.push(LETTERS[ch]);
    else if (/[0-9+-]/.test(ch)) out.push(ch);
    else throw new Error(`Unknown key "${ch}" in keystroke script "${script}"`);
  }
  return out;
}

// Physical keyboard → DSKY key (used by the DSKY view).
export const KEYBOARD_MAP = Object.freeze({
  v: 'VERB', n: 'NOUN', '+': '+', '=': '+', '-': '-', _: '-',
  0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  c: 'CLR', Backspace: 'CLR', p: 'PRO', k: 'KEY REL', e: 'ENTR', Enter: 'ENTR', r: 'RSET',
});
