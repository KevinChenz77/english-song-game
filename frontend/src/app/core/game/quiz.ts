import { LyricLine } from '../models/song.model';
import { norm, shuffle } from './text';

export interface Question {
  i: number; // 第幾句
  k: number; // 句中第幾個詞（以空白切）
  w: string; // 答案（norm 過）
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
export function pickQuestions(lines: LyricLine[], words: string[]): Question[] {
  const used = new Set<number>();
  const others = [...new Set(words)];
  const out: Question[] = [];
  for (const w of words) {
    const i = lines.findIndex((l, n) => !used.has(n) && l.text.split(/\s+/).some((t) => norm(t) === w));
    if (i < 0) {
      console.warn(`填填看：找不到包含「${w}」而且還沒用過的句子，略過`);
      continue;
    }
    used.add(i);
    const k = lines[i].text.split(/\s+/).findIndex((t) => norm(t) === w);
    const opts = shuffle([w, ...shuffle(others.filter((x) => x !== w)).slice(0, 2)]);
    out.push({ i, k, w, opts, endT: lines[i].end, done: false, tries: 0 });
  }
  return out.sort((a, b) => a.i - b.i);
}
