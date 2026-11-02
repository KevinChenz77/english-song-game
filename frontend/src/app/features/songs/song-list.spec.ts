import { groupStickers } from './song-list';

describe('groupStickers', () => {
  it('同種疊起來、照第一次出現的順序', () => {
    expect(groupStickers(['🎤', '❄️', '🎤', '👑', '🎤'])).toEqual([
      { emoji: '🎤', n: 3 },
      { emoji: '❄️', n: 1 },
      { emoji: '👑', n: 1 },
    ]);
    expect(groupStickers([])).toEqual([]);
  });
});
