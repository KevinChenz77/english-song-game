import { LyricLine, Song } from '../models/song.model';
import { tokLang } from '../lang';

// ponytail：兩個常數是調整用的旋鈕，實際聽幾首再調（docs/multilingual.md §5.1）
export const TAIL = 0.3; // 句尾留白（秒）
export const MAX_PER_UNIT = 0.45; // 每個音節／音拍最多幾秒（後面接長間奏時不會慢慢拖）

/**
 * 卡拉 OK：每個 token 的開始秒數。
 * 有逐字時間（stamps）：token 依它在 text 裡的位置落在哪兩個 stamp 之間，就在那段時間裡依權重分配；
 * 沒有：整句 span = min(end − t − TAIL, Σunits × MAX_PER_UNIT) 依權重（tokLang().units）分配。
 */
export function karaokeTimes(line: LyricLine, song: Pick<Song, 'lang'>): number[] {
  const units = line.tokens.map((t) => tokLang(t, song).units(t));
  // 每個 token 在 text 裡的開始位置
  let p = 0;
  const pos = line.tokens.map((t) => {
    const i = line.text.indexOf(t.s, p);
    if (i >= 0) p = i + t.s.length;
    return i >= 0 ? i : p;
  });
  const anchors = [...(line.stamps ?? [])];
  if (!anchors.length || anchors[0].at > 0) anchors.unshift({ at: 0, t: line.t });
  const out: number[] = [];
  anchors.forEach((a, j) => {
    const next = anchors[j + 1];
    const ks = pos.flatMap((x, k) => (x >= a.at && (!next || x < next.at) ? [k] : []));
    const sum = ks.reduce((s, k) => s + units[k], 0);
    const span = next ? next.t - a.t : Math.max(0, Math.min(line.end - a.t - TAIL, sum * MAX_PER_UNIT));
    let acc = 0;
    for (const k of ks) {
      out[k] = a.t + (span * acc) / sum;
      acc += units[k];
    }
  });
  return out;
}
