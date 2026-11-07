import index from '../../../public/songs/index.json';
import { QuizLevel, Song } from './models/song.model';
import { REWARDS } from './game/reward-rules';
import { lookup } from './game/text';
import { Dicts, LANGS, langOf, wordLang } from './lang';

/**
 * 檢查 public/songs/ 每首歌的設定（加歌清單見 docs/adding-a-song.md），依歌曲語言（core/lang.ts）。
 * 每首 json 和每個語言的字典用 esbuild 的 glob 動態 import 讀，index.json 列了但檔案不存在就會失敗。
 */
const ids: string[] = index;
const YT_ID = /^[\w-]{11}$/;
const json = async <T>(name: string): Promise<T> => (await import(`../../../public/songs/${name}.json`)).default;
const load = (id: string) => json<Song>(id);
const dictFile = (code: string) => `dict.${code}`;

/** 填填看題目字的問題（空＝沒問題）：題數在歌曲語言的 quizRange 裡；每個字的語言＝wordLang，用它的 norm、字典。 */
function quizProblems(song: Song, dicts: Dicts): string[] {
  const out: string[] = [];
  for (const [level, [min, max]] of Object.entries(langOf(song).quizRange) as [QuizLevel, [number, number]][]) {
    const words = song.quiz[level];
    if (words.length < min || words.length > max) out.push(`${level}: ${words.length} 題（要 ${min}～${max}）`);
    for (const w of words) {
      const L = wordLang(w, song);
      if (L.norm(w) !== w) out.push(`${level}: ${w} 要寫成 ${L.norm(w)}`);
      else if (!lookup(w, { ...dicts[L.code], ...(L === langOf(song) ? song.dict : {}) }, L.forms))
        out.push(`${level}: ${w} 沒有中文（加到 ${dictFile(L.code)}.json 或這首歌的 dict）`);
    }
  }
  return out;
}

describe('quizProblems（自編的日文歌，不是真的歌）', () => {
  const ja = ['ねこ', 'いぬ', 'そら', 'うみ', 'やま', 'happy'];
  const dicts: Dicts = { ja: { ねこ: '貓', いぬ: '狗', そら: '天空', うみ: '海', やま: '山' }, en: { happy: '快樂' } };
  const song = { lang: 'ja', quiz: { normal: ja, hard: [...ja, ...ja], expert: [...ja, ...ja] } } as unknown as Song;

  it('日文題數 6～10／10～20，英文字查 en 字典', () => {
    expect(quizProblems(song, dicts)).toEqual([]);
  });

  it('同樣的題目當英文歌：題數不夠；字典查不到、沒 norm 過的會列出來', () => {
    expect(quizProblems({ ...song, lang: undefined }, dicts).length).toBeGreaterThan(0);
    const bad = { ...song, quiz: { ...song.quiz, normal: ['ネコ', 'Happy', 'とり', ...ja.slice(3)] } };
    expect(quizProblems(bad, dicts)).toEqual([
      'normal: ネコ 要寫成 ねこ',
      'normal: Happy 要寫成 happy',
      'normal: とり 沒有中文（加到 dict.ja.json 或這首歌的 dict）',
    ]);
  });
});

describe('public/songs 歌曲資料', () => {
  let songs: Song[];
  const dicts: Dicts = {};
  beforeAll(async () => {
    songs = await Promise.all(ids.map(load));
    for (const code of Object.keys(LANGS)) {
      const d = await json<Record<string, string>>(dictFile(code)).catch(() => null);
      if (d) dicts[code] = d;
    }
  });

  it('index.json：至少一首、id 格式對、不重複', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id, id).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每個語言的字典：key 排序、用該語言 norm 過、中文不是空的；歌用到的語言一定要有字典', () => {
    const used = new Set(songs.flatMap((s) => Object.values(s.quiz).flat().map((w) => wordLang(w, s).code)));
    for (const code of used) expect(dicts[code], `缺 ${dictFile(code)}.json`).toBeTruthy();
    for (const [code, d] of Object.entries(dicts)) {
      const keys = Object.keys(d);
      expect(keys, code).toEqual([...keys].sort());
      for (const [w, zh] of Object.entries(d)) {
        expect(LANGS[code].norm(w), `${code}: ${w}`).toBe(w);
        expect(zh.trim(), `${code}: ${w}`).not.toBe('');
      }
    }
  });

  it('每首歌的貼紙都不一樣，也不跟 🎤／👑 撞', () => {
    const stickers = songs.map((s) => s.sticker);
    const shared = Object.values(REWARDS).map((r) => r.sticker);
    expect(new Set(stickers).size, stickers.join(' ')).toBe(stickers.length);
    for (const s of stickers) expect(shared, s).not.toContain(s);
  });

  for (const id of ids) {
    describe(id, () => {
      let song: Song;
      beforeAll(async () => (song = await load(id)));

      it('id＝檔名，必填欄位都有，lang 沒寫或在 LANGS 裡', () => {
        expect(song.id).toBe(id);
        for (const k of ['title', 'artist', 'from', 'emoji', 'sticker'] as const)
          expect(song[k]?.trim(), k).toBeTruthy();
        if (song.lang !== undefined) expect(Object.keys(LANGS), 'lang').toContain(song.lang);
      });

      it('歌詞來源：lrclibId（正整數）和 localLrc: true 剛好一個', () => {
        const { lrclibId, localLrc } = song;
        expect((lrclibId !== undefined) !== (localLrc !== undefined), 'lrclibId／localLrc 剛好一個').toBe(true);
        if (lrclibId !== undefined) expect(Number.isInteger(lrclibId) && lrclibId > 0, 'lrclibId').toBe(true);
        if (localLrc !== undefined) expect(localLrc, 'localLrc').toBe(true);
      });

      it('影片：至少一支，videoId 11 碼、有 label、offset 是數字', () => {
        expect(song.videos.length).toBeGreaterThan(0);
        for (const v of song.videos) {
          expect(v.id).toMatch(YT_ID);
          expect(v.label.trim()).toBeTruthy();
          expect(typeof v.offset).toBe('number');
        }
      });

      it('readings（選填）：日文只能是平假名、韓文只能是羅馬拼音', () => {
        const { readings } = song as Song & { readings?: Record<string, string> };
        for (const [w, r] of Object.entries(readings ?? {})) expect(r, w).toMatch(song.lang === 'ko' ? /^[a-z]+$/ : /^[ぁ-ゖー]+$/);
      });

      it('填填看：題數在歌曲語言的 quizRange 裡，每個字用它的語言 norm 過、查得到中文', () => {
        expect(quizProblems(song, dicts)).toEqual([]);
      });
    });
  }
});
