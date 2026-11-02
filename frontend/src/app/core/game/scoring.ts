import { norm } from './text';
import { Song, Token } from '../models/song.model';
import { langOf, tokLang } from '../lang';

export type WordMark = 'exact' | 'near' | 'miss';
export interface ScoredWord {
  t: string;
  ok: WordMark;
  tok?: Token; // scoreChars 才有：畫面要標讀音、點字要查讀音
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

/**
 * 不用空白斷詞的語言（ja）逐字評分（multilingual §6.3）。兩邊都用歌曲語言的 norm（片假名→平假名、去標點）。
 * token 的原文或讀音出現在聽到的文字裡＝exact（Whisper 常把假名寫成漢字或反過來）；
 * 否則看它的讀音在逐字對齊裡對到幾成，≥ 一半＝near。外語 token（英文）只比原文。分數＝token 平均。
 * ponytail：子字串比對是粗略規則，同一句重複的詞可能被重複算到；不夠準再改逐字讀音對齊。
 */
export function scoreChars(
  tokens: Token[],
  heard: string,
  song: Pick<Song, 'lang'>,
): { words: ScoredWord[]; score: number } {
  const L = langOf(song);
  const toks = tokens.filter((t) => L.norm(t.s));
  const H = [...L.norm(heard)];
  const heardStr = H.join('');
  const E: string[] = [];
  const owner: number[] = [];
  toks.forEach((t, k) =>
    [...L.norm(tokLang(t, song) === L ? (t.r ?? t.s) : t.s)].forEach((c) => {
      E.push(c);
      owner.push(k);
    }),
  );
  // 逐字 Levenshtein（同 charDist），回溯找出每個目標字有沒有對到。
  // Whisper 常把假名寫成漢字（いぬ→犬）：聽到的一個漢字可以免費對掉 1～2 個目標字（最多算 near，exact 只看子字串）
  const kanji = H.map((c) => /\p{Script=Han}/u.test(c));
  const D = Array.from({ length: E.length + 1 }, (_, i) =>
    Array.from({ length: H.length + 1 }, (_, j) => i + j),
  );
  const step = (i: number, j: number): [number, number, number][] => {
    const c: [number, number, number][] = [
      [i - 1, j - 1, E[i - 1] === H[j - 1] ? 0 : 1],
      [i - 1, j, 1],
      [i, j - 1, 1],
    ];
    if (kanji[j - 1])
      c.push([i - 1, j - 1, 0], ...(i >= 2 ? [[i - 2, j - 1, 0] as [number, number, number]] : []));
    return c;
  };
  for (let i = 1; i <= E.length; i++)
    for (let j = 1; j <= H.length; j++)
      D[i][j] = Math.min(...step(i, j).map(([a, b, c]) => D[a][b] + c));
  const hit = toks.map(() => 0);
  for (let i = E.length, j = H.length; i > 0 && j > 0;) {
    const [a, b, c] = step(i, j).find(([a, b, c]) => D[i][j] === D[a][b] + c)!;
    if (c === 0) for (let n = a; n < i; n++) hit[owner[n]]++;
    [i, j] = [a, b];
  }
  const len = toks.map((_, k) => owner.filter((o) => o === k).length);
  const words: ScoredWord[] = toks.map((t, k) => ({
    t: t.s,
    tok: t,
    ok: [t.s, tokLang(t, song) === L ? t.r : undefined].some(
      (x) => x && L.norm(x) && heardStr.includes(L.norm(x)),
    )
      ? 'exact'
      : hit[k] * 2 >= len[k]
        ? 'near'
        : 'miss',
  }));
  const score = words.length
    ? words.reduce((s, w) => s + (w.ok === 'exact' ? 1 : w.ok === 'near' ? 0.5 : 0), 0) /
      words.length
    : 0;
  return { words, score };
}
