import { LrcLine } from '../models/song.model';

const sec = (m: string, s: string) => Number(m) * 60 + parseFloat(s);

/**
 * 解析 LRC（含 Enhanced LRC 的 <mm:ss.xx> 逐字時間）：略過沒有時間或空白的行，依時間排序；
 * end = 下一句開始，最後一句 +5 秒。逐字時間從 text 拿掉，存成 stamps（at＝text 裡的字元位置）。
 */
export function parseLrc(s: string): LrcLine[] {
  const out: LrcLine[] = [];
  for (const ln of s.split('\n')) {
    const m = ln.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (!m) continue;
    let raw = '';
    const stamps: { at: number; t: number }[] = [];
    for (const part of m[3].split(/(<\d+:[\d.]+>)/)) {
      const st = part.match(/^<(\d+):(\d+(?:\.\d+)?)>$/);
      if (st) stamps.push({ at: raw.length, t: sec(st[1], st[2]) });
      else raw += part;
    }
    const text = raw.trim();
    if (!text) continue;
    const lead = raw.length - raw.trimStart().length;
    const l: LrcLine = { t: sec(m[1], m[2]), end: 0, text };
    if (stamps.length)
      l.stamps = stamps.map((x) => ({ at: Math.min(Math.max(0, x.at - lead), text.length), t: x.t }));
    out.push(l);
  }
  out.sort((a, b) => a.t - b.t);
  return out.map((l, i) => ({ ...l, end: out[i + 1] ? out[i + 1].t : l.t + 5 }));
}
