import { charDist, scoreLine } from './scoring';

// 測試資料一律用假句子（不放真實歌詞）
describe('scoreLine（legacy #test 的情況）', () => {
  it('全對', () => {
    const S = scoreLine('We can go, we can go', 'we can go we can go');
    expect(S.score).toBe(1);
    expect(S.words.every((w) => w.ok === 'exact')).toBe(true);
  });

  it('near 半分（glows/glow）、漏字 miss', () => {
    const S = scoreLine('The lamp glows red by the old door', 'the lamp glow red by the old');
    expect(S.score).toBe(6.5 / 8);
    expect(S.words[2].ok).toBe('near');
    expect(S.words[7].ok).toBe('miss');
  });

  it('縮寫展開', () => {
    expect(scoreLine("Don't feed the cat", 'do not feed the cat').score).toBe(1);
  });

  it('空字串', () => {
    expect(scoreLine('Red fox runs', '').score).toBe(0);
  });

  it('連字號', () => {
    expect(scoreLine('The lamp glows', 'the lamp-glows.').score).toBe(1);
  });
});

describe('charDist', () => {
  it('Levenshtein 距離', () => {
    expect(charDist('glow', 'glows')).toBe(1);
    expect(charDist('kitten', 'sitting')).toBe(3);
    expect(charDist('', 'abc')).toBe(3);
    expect(charDist('lamp', 'lamp')).toBe(0);
  });
});
