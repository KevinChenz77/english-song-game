import { LrcLine, LyricLine, QuizLevel, Song, Token } from './models/song.model';
import { STOP, enForms, norm } from './game/text';

/**
 * 每個語言的行為只在這裡（docs/multilingual.md §3）。第 0 步只放得到的欄位；
 * 讀音、TTS、ASR 等欄位由第一／二期的分支加。
 */
export interface Lang {
  code: string; // BCP 47：'en' | 'ja'；也用在 dict.<code>.json、[attr.lang]
  name: string; // 選歌卡片標籤
  spaced: boolean; // token 之間顯示空白（ja 不插空白，改 CSS 小間距）
  reading: boolean; // 有讀音輔助（ruby）可切換
  match?: RegExp; // 這個語言的字出現在別的語言的歌裡時怎麼認
  split(text: string): Token[]; // 後端沒給 tokens 時的斷詞
  norm(s: string): string; // 比對／查字典的 key
  show(s: string): string; // 顯示用（小視窗、選項）：en 同 norm；ja 保留片假名／漢字，只去標點空白
  stop: ReadonlySet<string>; // 不放進單字 chip、不列為「要多練」
  forms(w: string): string[]; // 查字典依序試的字形
  expert: 'typed' | 'listen'; // 填填看「最難」的玩法
  quizRange: Record<QuizLevel, [number, number]>; // 每個難度的題目字數
  units(t: Token): number; // 卡拉 OK 權重：en 音節、ja 音拍
  dictAudio: boolean; // Free Dictionary 真人錄音（只有英文）
  tts: { lang: string; good: RegExp; rate: number }; // speechSynthesis：語言、好聽的聲音名單、速度
}

const SMALL_KANA = /[ゃゅょぁぃぅぇぉゎ]/;

/** NFKC → 小寫 → 片假名轉平假名 → 去標點、符號、空白。 */
const jaNorm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\p{P}\p{S}\s]/gu, '');

/** 用到才建（舊瀏覽器沒有 Intl.Segmenter：退回空白切的段落，英文永遠不碰它）。 */
let jaSeg: Intl.Segmenter | undefined;
const jaWords = (p: string) =>
  typeof Intl.Segmenter === 'function'
    ? [...(jaSeg ??= new Intl.Segmenter('ja', { granularity: 'word' })).segment(p)].map((x) => x.segment)
    : [p];

export const LANGS: Record<string, Lang> = {
  en: {
    code: 'en',
    name: '英文',
    spaced: true,
    reading: false,
    match: /^[A-Za-z][A-Za-z'’]*$/,
    split: (text) => text.split(/\s+/).map((s) => tag(s, 'en')),
    norm,
    show: norm,
    stop: STOP,
    forms: enForms,
    expert: 'typed',
    quizRange: { normal: [10, 10], hard: [18, 20], expert: [18, 20] },
    dictAudio: true,
    // macOS / iOS 的第一個英文聲音常是 Albert、Bubbles 這類趣味機器人聲，要挑自然的
    tts: {
      lang: 'en-US',
      good: /premium|enhanced|natural|neural|google us english|samantha|ava|allison|aria|jenny|zoe/i,
      rate: 0.8,
    },
    // ponytail：母音群數粗估音節（字尾單獨的 e 不算），夠用來分配時間
    units: (t) => Math.max(1, (norm(t.s).replace(/([^aeiouy])e$/, '$1').match(/[aeiouy]+/g) ?? []).length),
  },
  ja: {
    code: 'ja',
    name: '日文',
    spaced: false,
    reading: true,
    // 保底用：正常情況後端會給 tokens。空白永遠是 token 邊界。
    split: (text) =>
      text
        .split(/\s+/)
        .flatMap(jaWords)
        .map((s) => tag(s, 'ja')),
    norm: jaNorm,
    show: (s) => s.normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, ''),
    stop: new Set('は が を に へ で と も の や よ ね か な です ます だ た て'.split(' ')),
    forms: (w) => [w],
    expert: 'listen',
    quizRange: { normal: [6, 10], hard: [10, 20], expert: [10, 20] },
    dictAudio: false,
    tts: { lang: 'ja-JP', good: /kyoko|o-ren|otoya|hattori|premium|enhanced|nanami|google 日本語/i, rate: 0.8 },
    // 音拍：讀音的假名數，小寫的ゃゅょぁぃぅぇぉ不算（っ、ー、ん算一拍）
    units: (t) => Math.max(1, [...jaNorm(t.r ?? t.s)].filter((c) => !SMALL_KANA.test(c)).length),
  },
};

/** 每個語言 code 一份 { 字: 中文 }（歌曲語言那一份已疊上 song.dict）。 */
export type Dicts = Record<string, Record<string, string>>;

export const langOf = (s: Pick<Song, 'lang'>) => LANGS[s.lang ?? 'en'];
export const tokLang = (t: Token, s: Pick<Song, 'lang'>) => (t.l ? LANGS[t.l] : langOf(s));

/**
 * 一個字（原文或題目字）的語言：歌曲語言的 match 認得就是歌曲語言（同樣是拉丁字母的語言不會搶走英文歌的字）；
 * 否則符合別的語言的 match 就是那個語言；都不符合＝歌曲語言。
 */
export const wordLang = (w: string, s: Pick<Song, 'lang'>) => {
  const own = langOf(s);
  if (own.match?.test(w)) return own;
  return Object.values(LANGS).find((L) => L !== own && L.match?.test(w)) ?? own;
};

/** 歌詞填 tokens：後端有給這句的 tokens 就用它，沒有就用歌曲語言的 split。 */
export const tokenize = (
  lines: LrcLine[],
  s: Pick<Song, 'lang'>,
  server?: Record<string, Token[]>,
): LyricLine[] =>
  lines.map((l) => ({
    ...l,
    tokens: (server && Object.hasOwn(server, l.text) && server[l.text]) || langOf(s).split(l.text),
  }));

/** split 用：外語 token 標 l。 */
const tag = (s: string, code: string): Token => {
  const L = wordLang(s, { lang: code });
  return L.code === code ? { s } : { s, l: L.code };
};
