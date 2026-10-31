import { parseLrc } from './lrc';

// 測試資料一律用假句子（不放真實歌詞）
describe('parseLrc', () => {
  it('解析時間、略過空白行、排序、end 規則（legacy #test）', () => {
    const L = parseLrc('[00:01.00] red fox runs\n[00:03.5]\n[01:02.25] the big blue boat\n[01:05.00] We can go, we can go');
    expect(L.length).toBe(3);
    expect(L[1].t).toBe(62.25);
    expect(L[0].end).toBe(62.25);
    expect(L[2]).toEqual({ t: 65, end: 70, text: 'We can go, we can go' });
  });

  it('沒依時間排的行會排好，沒有時間的行略過', () => {
    const L = parseLrc('[00:10.00] b\nno time\n[00:02] a');
    expect(L.map((l) => l.text)).toEqual(['a', 'b']);
    expect(L[0].end).toBe(10);
  });
});
