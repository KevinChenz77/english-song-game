import { RewardKey, SongProgress } from '../models/kid.model';
import { Song } from '../models/song.model';

/** 每首歌的獎勵：星星共 4 顆，每項只拿一次、拿到就不會不見。貼紙每首歌各拿一次。 */
export const REWARDS: Record<RewardKey, { star?: true; sticker?: string; msg: string }> = {
  listen: { star: true, msg: '🎧 聽完一整首歌了！' },
  singPractice: { sticker: '🎤', msg: '🎤 練習的 8 句都唸完了！' },
  singAll: { star: true, sticker: '👑', msg: '🏆 整首歌唱對 80% 以上！' },
  quizNormal: { star: true, msg: '🙂 填填看「普通」全對！' },
  quizHard: { star: true, msg: '🔥 填填看「挑戰」全對！' }, // 貼紙 = song.sticker
  expert: { msg: '💎 填填看「最難」全部一次打對！\n曲子小卡變成金色了 ✨' },
};

export const STAR_KEYS = (Object.keys(REWARDS) as RewardKey[]).filter((k) => REWARDS[k].star);

export const starCount = (p: SongProgress) => STAR_KEYS.filter((k) => p[k]).length;

/** 一首歌的星星字串：⭐☆，唱唱看達標掛 👑（不顯示分數）。 */
export const starStr = (p: SongProgress) =>
  '⭐'.repeat(starCount(p)) + '☆'.repeat(STAR_KEYS.length - starCount(p)) + (p.singAll ? ' 👑' : '');

export const rewardSticker = (key: RewardKey, song: Song) => (key === 'quizHard' ? song.sticker : REWARDS[key].sticker);

/** 慶祝畫面的文字。 */
export const rewardText = (key: RewardKey, sticker: string | undefined) =>
  REWARDS[key].msg + (REWARDS[key].star ? '\n得到一顆星星 ⭐' : '') + (sticker ? `\n獲得貼紙 ${sticker}` : '');
