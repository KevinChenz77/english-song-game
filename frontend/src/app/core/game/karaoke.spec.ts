import { LANGS } from '../lang';
import { LyricLine, Token } from '../models/song.model';
import { MAX_PER_UNIT, karaokeTimes } from './karaoke';

// 自編句子／token（不放真實歌詞）
const en = (text: string, t: number, end: number, stamps?: LyricLine['stamps']): LyricLine => ({
  t,
  end,
  text,
  stamps,
  tokens: LANGS['en'].split(text),
});
const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 5));

describe('karaokeTimes', () => {
  it('英文沒有逐字時間：依音節分配，每音節最多 MAX_PER_UNIT 秒', () => {
    // red 1、fox 1、jumps 1、over 2
    close(karaokeTimes(en('red fox jumps over', 10, 14), {}), [10, 10.45, 10.9, 11.35]);
    expect(MAX_PER_UNIT).toBe(0.45);
  });

  it('句子短：span = end − t − TAIL', () => {
    close(karaokeTimes(en('red fox jumps over', 10, 11.3), {}), [10, 10.2, 10.4, 10.6]);
  });

  it('有逐字時間：stamp 之間依權重分配，最後一段照 A', () => {
    const l = en('red fox jumps over', 10, 14, [
      { at: 0, t: 10 },
      { at: 8, t: 12 },
    ]);
    close(karaokeTimes(l, {}), [10, 11, 12, 12.45]);
  });

  it('第一個 stamp 不在開頭：句子開頭當第一個錨點', () => {
    close(karaokeTimes(en('red fox', 10, 20, [{ at: 4, t: 13 }]), {}), [10, 13]);
  });

  it('日文 token 用音拍（小寫假名不算），英文 token 用英文音節', () => {
    const tokens: Token[] = [{ s: 'きょう' }, { s: 'は' }, { s: 'happy', l: 'en' }];
    const l: LyricLine = { t: 0, end: 10, text: 'きょうは happy', tokens };
    // 2、1、2 → span = 5 × 0.45
    close(karaokeTimes(l, { lang: 'ja' }), [0, 0.9, 1.35]);
  });
});
