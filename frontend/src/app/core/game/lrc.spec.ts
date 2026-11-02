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

  it('Enhanced LRC：<mm:ss.xx> 從 text 拿掉，存成 stamps（字元位置＋秒）', () => {
    const [l] = parseLrc('[00:01.00] <00:01.00>red <00:01.50>fox <01:02.25>runs<01:03.00>');
    expect(l.text).toBe('red fox runs');
    expect(l.stamps).toEqual([
      { at: 0, t: 1 },
      { at: 4, t: 1.5 },
      { at: 8, t: 62.25 },
      { at: 12, t: 63 },
    ]);
  });

  it('沒有空白的語言也一樣：字元位置', () => {
    const [l] = parseLrc('[00:02]<00:02.00>ねこ<00:02.40>が<00:02.60>いる');
    expect(l.text).toBe('ねこがいる');
    expect(l.stamps!.map((s) => s.at)).toEqual([0, 2, 3]);
  });

  it('只有逐字時間沒有字的行略過；一般 LRC 沒有 stamps', () => {
    expect(parseLrc('[00:01]<00:01.00> <00:02.00>')).toEqual([]);
    expect(parseLrc('[00:01] a')[0]).not.toHaveProperty('stamps');
  });
});
