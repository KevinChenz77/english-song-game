import { buildSave, cleanSave, sameName } from './save-data';

describe('buildSave（legacy #test）', () => {
  it('不含 id', () => {
    const SV = buildSave([{ id: 1, name: '小明', avatar: '🐱', songs: { letitgo: { listen: true } }, stickers: ['🎤'] }]);
    expect(SV.version).toBe(1);
    expect(SV.savedAt).toBeTruthy();
    expect(SV.players).toHaveLength(1);
    expect('id' in SV.players[0]).toBe(false);
    expect(SV.players[0].songs['letitgo'].listen).toBe(true);
  });
});

describe('sameName（legacy #test）', () => {
  it('去空白比對', () => {
    expect(sameName([{ name: ' 小明 ' }], '小明 ')).toBeTruthy();
    expect(sameName([{ name: '小明' }], '小華')).toBeUndefined();
  });
});

describe('cleanSave（legacy #test＋壞資料）', () => {
  it('名字不是字串 → null', () => {
    expect(cleanSave({ players: [{ name: 1 }] })).toBeNull();
  });

  it('丟掉怪的 songs、stickers，名字去空白', () => {
    const r = cleanSave({ players: [{ name: ' 小華 ', songs: { a: null, b: {} }, stickers: 'x' }] });
    expect(r).toEqual([{ name: '小華', avatar: '🐱', songs: { b: {} }, stickers: [] }]);
  });

  it.each([null, undefined, 'x', 1, [], {}, { players: 'x' }, { players: [null] }, { players: [{ name: '  ' }] }])(
    '%j → null',
    (d) => expect(cleanSave(d)).toBeNull(),
  );

  it('只留認得的獎勵鍵且值為 true；頭像、貼紙太長丟掉；貼紙最多 200 個', () => {
    const r = cleanSave({
      players: [
        {
          name: 'a',
          avatar: 'x'.repeat(9),
          songs: { s: { listen: true, expert: true, quizHard: 'yes', bogus: true, singAll: false } },
          stickers: ['🎤', 'y'.repeat(9), ...Array(300).fill('👑')],
        },
      ],
    })!;
    expect(r[0].avatar).toBe('🐱');
    expect(r[0].songs).toEqual({ s: { listen: true, expert: true } });
    expect(r[0].stickers).toHaveLength(200);
    expect(r[0].stickers[0]).toBe('🎤');
  });

  it('songs 是陣列、stickers 混雜非字串', () => {
    const r = cleanSave({ players: [{ name: 'a', avatar: '', songs: [], stickers: ['🎤', 3, null] }] });
    expect(r).toEqual([{ name: 'a', avatar: '🐱', songs: {}, stickers: ['🎤'] }]);
  });
});
