import { LyricLine } from '../models/song.model';

/** 解析 LRC：略過沒有時間或空白的行，依時間排序；end = 下一句開始，最後一句 +5 秒。 */
export function parseLrc(s: string): LyricLine[] {
  const out: { t: number; text: string }[] = [];
  for (const ln of s.split('\n')) {
    const m = ln.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (m && m[3].trim()) out.push({ t: Number(m[1]) * 60 + parseFloat(m[2]), text: m[3].trim() });
  }
  out.sort((a, b) => a.t - b.t);
  return out.map((l, i) => ({ ...l, end: out[i + 1] ? out[i + 1].t : l.t + 5 }));
}
