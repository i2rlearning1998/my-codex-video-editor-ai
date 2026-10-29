// LOC-008: a pseudo-locale for layout testing. English text gets accents (so
// untranslated text is easy to spot) and grows by 40 percent (translations are
// often longer). {placeholders} are kept as they are.
const ACCENTS: Record<string, string> = {
  a: 'á',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ł',
  m: 'ɱ',
  n: 'ñ',
  o: 'ó',
  p: 'þ',
  q: 'ǫ',
  r: 'ŕ',
  s: 'š',
  t: 'ţ',
  u: 'ú',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
};
const accent = (letter: string) => {
  const mapped = ACCENTS[letter.toLowerCase()];
  if (!mapped) return letter;
  return letter === letter.toLowerCase() ? mapped : mapped.toUpperCase();
};
const FILL = 'ẽẽẽẽẽẽẽẽ';
export const PSEUDO_GROWTH = 1.4;

export function pseudoLocalize(text: string): string {
  const parts = text.split(/(\{\w+\})/);
  const body = parts
    .map((part) =>
      /^\{\w+\}$/.test(part) ? part : [...part].map(accent).join(''),
    )
    .join('');
  const letters = [...text.replace(/\{\w+\}/g, '')].length;
  if (!letters) return body;
  const extra = Math.ceil(letters * (PSEUDO_GROWTH - 1));
  // The extra letters join the last word, so lines wrap as longer text would.
  let filler = '';
  while ([...filler].length < extra) filler += FILL;
  return body + [...filler].slice(0, extra).join('');
}
