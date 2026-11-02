import { charDist, scoreChars, scoreLine } from './scoring';

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

// 自編的日文句子（不是歌詞）
describe('scoreChars（日文逐字）', () => {
  const ja = { lang: 'ja' };
  const toks = [
    { s: 'ねこ' },
    { s: 'が' },
    { s: '学校', r: 'がっこう' },
    { s: 'へ' },
    { s: 'happy', l: 'en' },
  ];
  const ok = (heard: string) => scoreChars(toks, heard, ja).words.map((w) => w.ok);

  it('原文或讀音出現＝exact；片假名、標點、空白、大小寫不影響', () => {
    expect(ok('ネコが、がっこう へ Happy!')).toEqual(['exact', 'exact', 'exact', 'exact', 'exact']);
    expect(scoreChars(toks, 'ねこが学校へhappy', ja).score).toBe(1);
  });

  it('假名被寫成漢字（ねこ→猫）＝near；沒唸到＝miss；英文 token 只比原文；助詞照樣標色但不算分', () => {
    expect(ok('猫が学校へ')).toEqual(['near', 'exact', 'exact', 'exact', 'miss']);
    expect(scoreChars(toks, '猫が学校へ', ja).score).toBe(0.5); // (ねこ 0.5＋学校 1＋happy 0) / 3
  });

  it('不相干但有助詞的句子不會過 0.6；正確句子寫成漢字照樣過', () => {
    const T = (x: string) => x.split(' ').map((p) => ({ s: p }));
    const line = T('ぼく は ねこ と うみ に いく よ ね');
    const r = scoreChars(line, 'わたしはいぬとやまにいったよね', ja);
    const all = r.words.reduce((n, w) => n + (w.ok === 'exact' ? 1 : w.ok === 'near' ? 0.5 : 0), 0);
    expect(all / r.words.length).toBeGreaterThanOrEqual(0.6); // 助詞也算的話會過
    expect(r.score).toBeLessThan(0.6);
    const kanji = [{ s: 'ねこ' }, { s: 'が' }, { s: '学校', r: 'がっこう' }, { s: 'へ' }, { s: '行く', r: 'いく' }];
    expect(scoreChars(kanji, '猫が学校へ行く', ja).score).toBeGreaterThanOrEqual(0.6);
  });

  it('全是助詞的句子：退回全部算分', () => {
    expect(scoreChars([{ s: 'が' }, { s: 'の' }], 'が', ja).score).toBe(0.5);
  });

  it('讀音對到一半＝near；空字串＝0；結果帶 token（畫面標讀音）', () => {
    expect(ok('ねがっこ')[0]).toBe('near');
    expect(scoreChars(toks, '', ja).score).toBe(0);
    expect(scoreChars(toks, '', ja).words[2].tok).toBe(toks[2]);
  });

  it('只有標點的 token 不算分', () => {
    expect(scoreChars([{ s: 'ねこ' }, { s: '！' }], 'ねこ', ja)).toMatchObject({
      score: 1,
      words: [{ t: 'ねこ' }],
    });
  });
});
