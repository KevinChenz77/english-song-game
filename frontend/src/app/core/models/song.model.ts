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
  lang?: string; // core/lang.ts 的 LANGS code；沒寫＝'en'
  lrclibId?: number; // LRCLIB 歌詞 id，backend/tools/build_content.py 用來抓歌詞（和 localLrc 剛好一個）
  localLrc?: true; // LRCLIB 沒有這首：歌詞只在內容工程師本機 data/lrc/<id>.lrc
  title: string;
  artist: string;
  from: string;
  emoji: string;
  videos: SongVideo[]; // 第一支為預設
  karaoke?: { id: string; offset: number }; // 唱唱看伴奏（純音樂）影片；沒有就不放伴奏
  sticker: string; // 填填看「挑戰」全對的專屬貼紙
  quiz: Record<QuizLevel, string[]>; // 每個難度手動列的題目單字（字數範圍＝LANGS[lang].quizRange）
  dict?: Record<string, string>; // 這首歌專用／覆蓋共用字典的解釋
}

/** 一個可以點的字：原文、讀音（平假名，有漢字才有）、羅馬拼音、這個 token 的語言（和歌曲不同時才有）。 */
export interface Token {
  s: string;
  r?: string;
  ro?: string;
  l?: string;
}

/** parseLrc 的一句。stamps＝Enhanced LRC 逐字時間：at＝text 裡的字元位置，t＝秒。 */
export interface LrcLine {
  t: number;
  end: number;
  text: string;
  stamps?: { at: number; t: number }[];
}

/** 遊玩用的一句：tokens 由 PlaySession.open()（tokenize）依歌曲語言填。 */
export interface LyricLine extends LrcLine {
  tokens: Token[];
}

/** 歌詞＋整句中文（伺服器翻譯，已套上本機家長修改）。 */
export interface SongContent {
  lines: LrcLine[];
  translations: Record<string, string>;
  tokens?: Record<string, Token[]>; // 後端預先算好的斷詞＋讀音（以去掉逐字時間的原句當 key）；沒有就前端 split
}
