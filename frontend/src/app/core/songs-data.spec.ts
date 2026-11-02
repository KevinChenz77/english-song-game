import index from '../../../public/songs/index.json';
import dict from '../../../public/songs/dict.json';
import { QuizLevel, Song } from './models/song.model';
import { REWARDS } from './game/reward-rules';
import { lookup, norm } from './game/text';

/**
 * 檢查 public/songs/ 每首歌的設定（加歌清單見 docs/adding-a-song.md）。
 * 每首 json 用 esbuild 的 glob 動態 import 讀，index.json 列了但檔案不存在就會失敗。
 */
const ids: string[] = index;
const QUIZ: Record<QuizLevel, [number, number]> = {
  normal: [10, 10],
  hard: [18, 20],
  expert: [18, 20],
};
const YT_ID = /^[\w-]{11}$/;
const load = async (id: string): Promise<Song> =>
  (await import(`../../../public/songs/${id}.json`)).default;

describe('public/songs 歌曲資料', () => {
  it('index.json：至少一首、id 格式對、不重複', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id, id).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dict.json：key 依字母排序、norm 過、中文不是空的', () => {
    const keys = Object.keys(dict);
    expect(keys).toEqual([...keys].sort());
    for (const [w, zh] of Object.entries(dict)) {
      expect(norm(w), w).toBe(w);
      expect(zh.trim(), w).not.toBe('');
    }
  });

  it('每首歌的貼紙都不一樣，也不跟 🎤／👑 撞', async () => {
    const stickers = (await Promise.all(ids.map(load))).map((s) => s.sticker);
    const shared = Object.values(REWARDS).map((r) => r.sticker);
    expect(new Set(stickers).size, stickers.join(' ')).toBe(stickers.length);
    for (const s of stickers) expect(shared, s).not.toContain(s);
  });

  for (const id of ids) {
    describe(id, () => {
      let song: Song;
      beforeAll(async () => (song = await load(id)));

      it('id＝檔名，必填欄位都有', () => {
        expect(song.id).toBe(id);
        for (const k of ['title', 'artist', 'from', 'emoji', 'sticker'] as const)
          expect(song[k]?.trim(), k).toBeTruthy();
        // lrclibId 正在另一條分支加：還沒有就跳過，有的話必須是正整數。全部歌都有之後改成必填。
        const lrclibId = (song as Song & { lrclibId?: unknown }).lrclibId;
        if (lrclibId !== undefined)
          expect(Number.isInteger(lrclibId) && (lrclibId as number) > 0, 'lrclibId').toBe(true);
      });

      it('影片：至少一支，videoId 11 碼、有 label、offset 是數字；karaoke 選填', () => {
        expect(song.videos.length).toBeGreaterThan(0);
        for (const v of song.videos) {
          expect(v.id).toMatch(YT_ID);
          expect(v.label.trim()).toBeTruthy();
          expect(typeof v.offset).toBe('number');
        }
        if (song.karaoke) {
          expect(song.karaoke.id).toMatch(YT_ID);
          expect(typeof song.karaoke.offset).toBe('number');
        }
      });

      it('填填看：題數（普通 10、挑戰／最難 18～20），每個字都 norm 過、查得到中文', () => {
        const d = { ...dict, ...song.dict };
        for (const [level, [min, max]] of Object.entries(QUIZ) as [QuizLevel, [number, number]][]) {
          const words = song.quiz[level];
          expect(words.length, level).toBeGreaterThanOrEqual(min);
          expect(words.length, level).toBeLessThanOrEqual(max);
          for (const w of words) {
            expect(norm(w), `${level}: ${w}`).toBe(w);
            expect(
              lookup(w, d),
              `${level}: ${w} 沒有中文（加到 dict.json 或這首歌的 dict）`,
            ).toBeTruthy();
          }
        }
      });
    });
  }
});
