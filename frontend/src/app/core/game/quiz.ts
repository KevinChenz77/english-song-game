import { LyricLine, Song, Token } from '../models/song.model';
import { tokLang } from '../lang';
import { shuffle } from './text';

export interface Question {
  i: number; // 第幾句
  k: number; // 句中第幾個 token
  w: string; // 答案（該 token 語言 norm 過）
  tok: Token; // 答案的 token（最難聽發音要唸它的讀音）
  opts: string[]; // 3 個選項（含答案）
  endT: number; // 這句結束的時間
  done: boolean;
  tries: number;
}

/**
 * 依清單出題：清單裡每個字找一句「包含這個字、而且還沒被用過」的歌詞（依歌詞順序找第一句），
 * 找不到就略過並 console.warn；最後依句子順序排列。
 * 選項的干擾字從同一個清單（同一個難度）挑 2 個。
 */
export function pickQuestions(lines: LyricLine[], words: string[], song: Pick<Song, 'lang'>): Question[] {
  const used = new Set<number>();
  const others = [...new Set(words)];
  const out: Question[] = [];
  const hit = (w: string) => (t: Token) => tokLang(t, song).norm(t.s) === w;
  for (const w of words) {
    const i = lines.findIndex((l, n) => !used.has(n) && l.tokens.some(hit(w)));
    if (i < 0) {
      console.warn(`填填看：找不到包含「${w}」而且還沒用過的句子，略過`);
      continue;
    }
    used.add(i);
    const k = lines[i].tokens.findIndex(hit(w));
    const opts = shuffle([w, ...shuffle(others.filter((x) => x !== w)).slice(0, 2)]);
    out.push({ i, k, w, tok: lines[i].tokens[k], opts, endT: lines[i].end, done: false, tries: 0 });
  }
  return out.sort((a, b) => a.i - b.i);
}
