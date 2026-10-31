import { norm } from './text';

export type WordMark = 'exact' | 'near' | 'miss';
export interface ScoredWord {
  t: string;
  ok: WordMark;
}

/** 縮寫展開後再比對。 */
export const EXPAND: Record<string, string> = {
  "don't": 'do not',
  "can't": 'can not',
  cannot: 'can not',
  "couldn't": 'could not',
  "won't": 'will not',
  "i'm": 'i am',
  "it's": 'it is',
  "they're": 'they are',
  "i'll": 'i will',
  "you'll": 'you will',
  "let's": 'let us',
  gonna: 'going to',
  wanna: 'want to',
};
const expand = (w: string) => (EXPAND[w] || w).split(' ');

/** Levenshtein 字元距離。 */
export function charDist(a: string, b: string): number {
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0), prev[j] + 1, cur[j - 1] + 1);
    prev = cur;
  }
  return prev[b.length];
}

/** 逐字對齊評分：只差一個字母（4 個字母以上的字）算「接近」給半分。 */
export function scoreLine(expected: string, heard: string): { words: ScoredWord[]; score: number } {
  const toks = expected.split(/\s+/).filter((t) => norm(t));
  const E: string[] = [];
  const owner: number[] = [];
  toks.forEach((t, k) =>
    expand(norm(t)).forEach((w) => {
      E.push(w);
      owner.push(k);
    }),
  );
  const H = heard.split(/[\s-]+/).map(norm).filter(Boolean).flatMap(expand); // Whisper 有時會輸出 lamp-glows 這種連字號
  const sub = (a: string, b: string) => (a === b ? 0 : a.length >= 4 && charDist(a, b) <= 1 ? 0.5 : 1);
  const D = Array.from({ length: E.length + 1 }, (_, i) => Array.from({ length: H.length + 1 }, (_, j) => i + j));
  for (let i = 1; i <= E.length; i++)
    for (let j = 1; j <= H.length; j++)
      D[i][j] = Math.min(D[i - 1][j - 1] + sub(E[i - 1], H[j - 1]), D[i - 1][j] + 1, D[i][j - 1] + 1);
  const marks: WordMark[] = E.map(() => 'miss');
  for (let i = E.length, j = H.length; i > 0 && j > 0; ) {
    const c = sub(E[i - 1], H[j - 1]);
    if (D[i][j] === D[i - 1][j - 1] + c) {
      marks[i - 1] = c === 0 ? 'exact' : c === 0.5 ? 'near' : 'miss';
      i--;
      j--;
    } else if (D[i][j] === D[i - 1][j] + 1) i--;
    else j--;
  }
  const rank = { exact: 0, near: 1, miss: 2 };
  const words: ScoredWord[] = toks.map((t) => ({ t, ok: 'exact' }));
  marks.forEach((m, n) => {
    const w = words[owner[n]];
    if (rank[m] > rank[w.ok]) w.ok = m;
  });
  const score = E.length ? marks.reduce((s, m) => s + (m === 'exact' ? 1 : m === 'near' ? 0.5 : 0), 0) / E.length : 0;
  return { words, score };
}
