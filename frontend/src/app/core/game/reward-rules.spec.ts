import { Song } from '../models/song.model';
import { STAR_KEYS, rewardSticker, rewardText, starCount, starStr } from './reward-rules';

const song = { id: 'letitgo', sticker: '❄️' } as Song;

describe('reward-rules', () => {
  it('4 顆星：listen、singAll、quizNormal、quizHard', () => {
    expect([...STAR_KEYS].sort()).toEqual(['listen', 'quizHard', 'quizNormal', 'singAll']);
  });

  it('starCount / starStr（⭐☆ 與 👑）', () => {
    expect(starStr({})).toBe('☆☆☆☆');
    expect(starStr({ listen: true, quizNormal: true })).toBe('⭐⭐☆☆');
    expect(starStr({ listen: true, singAll: true })).toBe('⭐⭐☆☆ 👑');
    expect(starCount({ expert: true, singPractice: true })).toBe(0);
  });

  it('貼紙：挑戰 = 這首歌的專屬貼紙，唱唱看 🎤／👑', () => {
    expect(rewardSticker('quizHard', song)).toBe('❄️');
    expect(rewardSticker('singPractice', song)).toBe('🎤');
    expect(rewardSticker('singAll', song)).toBe('👑');
    expect(rewardSticker('listen', song)).toBeUndefined();
  });

  it('慶祝文字', () => {
    expect(rewardText('singAll', '👑')).toBe('🏆 整首歌唱對 80% 以上！\n得到一顆星星 ⭐\n獲得貼紙 👑');
    expect(rewardText('expert', undefined)).not.toContain('星星');
  });
});
