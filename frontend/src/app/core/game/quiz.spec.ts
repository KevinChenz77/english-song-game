import { parseLrc } from './lrc';
import { pickQuestions } from './quiz';
import { tokenize } from '../lang';

// 測試資料一律用假句子（不放真實歌詞）
const L = tokenize(parseLrc('[00:01.00] red fox runs\n[00:03.5]\n[01:02.25] the big blue boat\n[01:05.00] We can go, we can go'), {});

describe('pickQuestions（每首歌手動列字）', () => {
  it('fox 在第 0 句、go 在第 2 句第 2 個詞，選項 3 個含答案；找不到的字略過', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const Q = pickQuestions(L, ['fox', 'blue', 'go', 'cat'], {});
    // 新規則沒有間隔限制，所以 blue 也會出題；cat 找不到 → 略過並警告
    expect(Q.map((q) => q.w)).toEqual(['fox', 'blue', 'go']);
    expect(Q[0]).toMatchObject({ i: 0, k: 1 });
    expect(Q[2]).toMatchObject({ i: 2, k: 2, endT: 70, done: false, tries: 0 });
    expect(Q.every((q) => q.opts.length === 3 && q.opts.includes(q.w))).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('cat');
    warn.mockRestore();
  });

  it('同一句不重複使用；同一個字列兩次就找兩句不同的', () => {
    const lines = tokenize(parseLrc('[00:01] go go\n[00:02] fox\n[00:03] we go'), {});
    const Q = pickQuestions(lines, ['go', 'go', 'fox'], {});
    expect(Q.map((q) => [q.i, q.w])).toEqual([
      [0, 'go'],
      [1, 'fox'],
      [2, 'go'],
    ]);
  });

  it('依句子順序排列，不是清單順序', () => {
    const Q = pickQuestions(L, ['go', 'fox'], {});
    expect(Q.map((q) => q.i)).toEqual([0, 2]);
  });

  it('干擾字只從同一份清單挑、不會是答案本身', () => {
    const words = ['fox', 'blue', 'go'];
    for (const q of pickQuestions(L, words, {})) {
      expect(new Set(q.opts).size).toBe(3);
      expect(q.opts.every((o) => words.includes(o))).toBe(true);
    }
  });

  it('找不到的字略過並 console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(pickQuestions(L, ['cat', 'fox', 'fox'], {})).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(2); // cat、第二個 fox（唯一一句已用過）
    warn.mockRestore();
  });
});
