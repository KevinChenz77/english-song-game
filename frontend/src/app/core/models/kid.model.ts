export type RewardKey = 'listen' | 'quizNormal' | 'quizHard' | 'expert' | 'singPractice' | 'singAll';
export type SongProgress = Partial<Record<RewardKey, true>>;

export interface Kid {
  id: number; // Date.now()，只在本機用，不上傳
  name: string;
  avatar: string;
  songs: Record<string, SongProgress>; // key = song.id
  stickers: string[]; // 依獲得順序，可重複（每首歌各自的 🎤／👑／專屬貼紙）
}
