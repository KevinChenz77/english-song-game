import { LANGS, langOf, tokLang, tokenize, wordLang } from './lang';
import { lookup } from './game/text';

// 自編的字／句子（不放真實歌詞）
describe('LANGS / tokLang', () => {
  it('沒有 lang 的歌＝en；token 有 l 就用那個語言', () => {
    expect(langOf({})).toBe(LANGS['en']);
    expect(tokLang({ s: 'ねこ' }, { lang: 'ja' })).toBe(LANGS['ja']);
    expect(tokLang({ s: 'cat', l: 'en' }, { lang: 'ja' })).toBe(LANGS['en']);
    expect(tokLang({ s: 'cat' }, {})).toBe(LANGS['en']);
  });

  it('en split＝以空白切（和以前一樣）', () => {
    expect(LANGS['en'].split('Red fox, runs')).toEqual([{ s: 'Red' }, { s: 'fox,' }, { s: 'runs' }]);
    expect(tokenize([{ t: 1, end: 2, text: 'a b' }], {})[0].tokens).toEqual([{ s: 'a' }, { s: 'b' }]);
  });

  it('ja split：空白是邊界，拉丁字母的 token 標 l: en', () => {
    const toks = LANGS['ja'].split('ねこ happy');
    expect(toks.map((t) => t.s).join('')).toBe('ねこhappy');
    expect(toks.at(-1)).toEqual({ s: 'happy', l: 'en' });
  });

  it('wordLang：符合別的語言的 match 才換語言', () => {
    expect(wordLang("can't", { lang: 'ja' })).toBe(LANGS['en']);
    expect(wordLang('ねこ', { lang: 'ja' })).toBe(LANGS['ja']);
    expect(wordLang('fox', {})).toBe(LANGS['en']);
  });

  it('wordLang：歌曲語言的 match 優先（假的拉丁字母語言不會搶英文歌的字）', () => {
    LANGS['xx'] = { ...LANGS['en'], code: 'xx' };
    try {
      expect(wordLang('fox', {})).toBe(LANGS['en']);
      expect(wordLang('fox', { lang: 'xx' })).toBe(LANGS['xx']);
      expect(LANGS['en'].split('red fox')).toEqual([{ s: 'red' }, { s: 'fox' }]);
    } finally {
      delete LANGS['xx'];
    }
  });

  it('沒有 Intl.Segmenter（舊瀏覽器）：ja 退回空白切，en 不受影響', () => {
    const seg = Intl.Segmenter;
    Reflect.set(Intl, 'Segmenter', undefined);
    try {
      expect(LANGS['ja'].split('ねこが いる')).toEqual([{ s: 'ねこが' }, { s: 'いる' }]);
      expect(LANGS['en'].split('red fox')).toEqual([{ s: 'red' }, { s: 'fox' }]);
    } finally {
      Reflect.set(Intl, 'Segmenter', seg);
    }
  });

  it('ja norm：NFKC、片假名轉平假名、去標點', () => {
    expect(LANGS['ja'].norm('ネコ、！')).toBe('ねこ');
    expect(LANGS['ja'].norm('ＡＢ')).toBe('ab');
  });

  it('forms：en 複數退回原形，ja 只查原形', () => {
    expect(lookup('cats', { cat: '貓' }, LANGS['en'].forms)).toBe('貓');
    expect(lookup('ねこs', { ねこ: '貓' }, LANGS['ja'].forms)).toBeNull();
  });

  it('units：en 母音群（字尾單獨的 e 不算）、ja 音拍', () => {
    const en = (s: string) => LANGS['en'].units({ s });
    expect(['make', 'the', 'over', 'free', 'happy'].map(en)).toEqual([1, 1, 2, 1, 2]);
    expect(LANGS['ja'].units({ s: '学校', r: 'がっこう' })).toBe(4);
    expect(LANGS['ja'].units({ s: 'きょう' })).toBe(2);
    expect(LANGS['ja'].units({ s: 'ラーメン' })).toBe(4);
  });
});

describe('tokenize', () => {
  // 自編的句子（不是歌詞）
  const lines = [
    { t: 1, end: 2, text: '山へ' },
    { t: 2, end: 3, text: 'ねこ' },
  ];

  it('有後端 tokens 的句子用它，沒有的句子用 split', () => {
    const out = tokenize(lines, { lang: 'ja' }, { '山へ': [{ s: '山', r: 'やま', ro: 'yama' }, { s: 'へ', ro: 'e' }] });
    expect(out[0].tokens).toEqual([{ s: '山', r: 'やま', ro: 'yama' }, { s: 'へ', ro: 'e' }]);
    expect(out[1].tokens).toEqual(LANGS['ja'].split('ねこ'));
  });

  it('英文：沒有後端 tokens＝空白切（不變）', () => {
    const en = [{ t: 1, end: 2, text: 'red fox runs' }];
    expect(tokenize(en, {}, undefined)[0].tokens).toEqual([{ s: 'red' }, { s: 'fox' }, { s: 'runs' }]);
    expect(tokenize(en, {}, {})[0].tokens).toEqual([{ s: 'red' }, { s: 'fox' }, { s: 'runs' }]);
  });
});
