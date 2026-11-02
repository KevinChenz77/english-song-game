export interface SongVideo {
  id: string; // YouTube videoId
  label: string; // 下拉選單顯示，例如「Sing-Along 版」
  offset: number; // 預設歌詞時間差（秒）；>0 = 歌詞延後顯示
}

export type QuizLevel = 'normal' | 'hard' | 'expert';
export type PlayMode = 'listen' | 'quiz' | 'sing';

/** public/songs/<id>.json。歌詞和翻譯不放這裡，由後端 GET /api/songs/{id}/content 提供。 */
export interface Song {
  id: string; // 檔名＝id，只能 [a-z0-9-]
  title: string;
  artist: string;
  from: string;
  emoji: string;
  videos: SongVideo[]; // 第一支為預設
  karaoke?: { id: string; offset: number }; // 唱唱看伴奏（純音樂）影片；沒有就不放伴奏
  sticker: string; // 填填看「挑戰」全對的專屬貼紙
  quiz: Record<QuizLevel, string[]>; // 每個難度手動列的題目單字（普通 10、挑戰 20、最難 20）
  dict?: Record<string, string>; // 這首歌專用／覆蓋共用字典的解釋
}

export interface LyricLine {
  t: number;
  end: number;
  text: string;
}

/** 歌詞＋整句中文（伺服器翻譯，已套上本機家長修改）。 */
export interface SongContent {
  lines: LyricLine[];
  translations: Record<string, string>;
}
