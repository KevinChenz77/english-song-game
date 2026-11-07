import { TestBed } from '@angular/core/testing';
import { LyricsPanel } from './lyrics-panel';
import { PlaySession } from '../../core/play-session';
import { YoutubePlayer } from '../../core/youtube-player';
import { Rewards } from '../../core/rewards';
import { parseLrc } from '../../core/game/lrc';
import { LANGS, tokenize } from '../../core/lang';
import { Reading } from '../../core/reading';
import { LyricLine, Song } from '../../core/models/song.model';

// 假句子（不放真實歌詞）
const lines = tokenize(parseLrc('[00:01] red fox runs\n[00:03] the big blue boat'), {});

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      { provide: YoutubePlayer, useValue: { ready: () => true, play: vi.fn(), seek: vi.fn() } },
      { provide: Rewards, useValue: { earn: vi.fn() } },
    ],
  });
  const s = TestBed.inject(PlaySession);
  s.lines.set(lines);
  s.translations.set({ 'red fox runs': '紅狐狸在跑' });
  const f = TestBed.createComponent(LyricsPanel);
  f.componentRef.setInput('dicts', { en: { fox: '狐狸' } });
  await f.whenStable();
  return { s, f, el: f.nativeElement as HTMLElement };
}

describe('LyricsPanel', () => {
  it('每個單字是按鈕，點了同步呼叫 tapWord', async () => {
    const { s, el } = await setup();
    const tap = vi.spyOn(s, 'tapWord').mockImplementation(() => undefined);
    const words = el.querySelectorAll<HTMLButtonElement>('button.w');
    expect(words.length).toBe(7);
    words[1].click();
    expect(tap).toHaveBeenCalledWith({ s: 'fox' });
  });

  it('卡拉 OK：依 karaokeTimes 亮字（每音節 0.45 秒，不是每字 0.5 秒）', async () => {
    const { s, f, el } = await setup();
    s.time.set(1.5); // 第 0 句 red/fox/runs 從 1、1.45、1.9 秒開始
    await f.whenStable();
    const sung = [...el.querySelectorAll('[data-line="0"] .w.sung')].map((b) => b.textContent);
    expect(sung).toEqual(['red', 'fox']);
  });

  it('沒有翻譯：小朋友看不到提示，家長模式才出現「＋ 填翻譯」', async () => {
    const { s, f, el } = await setup();
    expect(el.textContent).toContain('紅狐狸在跑');
    expect(el.textContent).not.toContain('填翻譯');
    expect(el.querySelectorAll('.zh').length).toBe(1);
    s.parentOpen.set(true);
    await f.whenStable();
    const empty = el.querySelectorAll('button.zh.empty');
    expect(empty.length).toBe(1);
    expect(empty[0].textContent).toContain('＋ 填翻譯');
  });

  it('英文歌：沒有 ruby、沒有讀音按鈕、字間保留空白', async () => {
    const { el } = await setup();
    expect(el.querySelector('ruby')).toBeNull();
    expect(el.querySelector('button.reading')).toBeNull();
    expect(el.querySelector('[data-line="0"] .en')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '▶ red fox runs',
    );
  });
});

describe('LyricsPanel 日文讀音', () => {
  // 自編的句子（不是歌詞）：漢字有平假名讀音、假名只有羅馬拼音、英文 token 標 l
  const ja: LyricLine[] = [
    {
      t: 1,
      end: 4,
      text: '山へ go',
      tokens: [
        { s: '山', r: 'やま', ro: 'yama' },
        { s: 'へ', ro: 'e' },
        { s: 'go', l: 'en' },
      ],
    },
  ];

  async function setupJa() {
    localStorage.removeItem('reading');
    const r = await setup();
    r.s.song.set({ id: 'x', lang: 'ja' } as Song);
    r.s.lines.set(ja);
    await r.f.whenStable();
    const rts = () => [...r.el.querySelectorAll('rt')].map((x) => x.textContent);
    const toggle = r.el.querySelector<HTMLButtonElement>('button.reading')!;
    return { ...r, rts, toggle };
  }
  afterEach(() => localStorage.removeItem('reading'));

  it('預設平假名：只有漢字有 ruby；羅馬拼音：日文 token 都有；關：沒有；英文 token 永遠沒有', async () => {
    const { f, el, rts, toggle } = await setupJa();
    expect(el.querySelector('.en')?.getAttribute('lang')).toBe('ja');
    expect(el.querySelectorAll('button.w')[2].getAttribute('lang')).toBe('en');
    expect(el.querySelector('.en')?.textContent).toContain('山やまへgo'); // token 之間不插空白
    expect(rts()).toEqual(['やま']);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    toggle.click();
    await f.whenStable();
    expect(rts()).toEqual(['yama', 'e']);

    toggle.click();
    await f.whenStable();
    expect(rts()).toEqual([]);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    toggle.click();
    await f.whenStable();
    expect(rts()).toEqual(['やま']);
  });

  it('localStorage reading 被改壞（toString、亂字）→ 平假名，切換照常', () => {
    for (const bad of ['"toString"', '"x"', '7']) {
      localStorage.setItem('reading', bad);
      TestBed.resetTestingModule();
      const r = TestBed.inject(Reading);
      expect(r.modeOf(LANGS['ja'])).toBe('hira');
      r.next(LANGS['ja']);
      expect(r.modeOf(LANGS['ja'])).toBe('romaji');
    }
  });

  it('韓文沒有平假名：預設羅馬拼音，只在羅馬拼音和關之間切換', () => {
    const r = TestBed.inject(Reading);
    const ko = LANGS['ko'];
    const t = { s: '나무', ro: 'namu' };
    expect(r.modeOf(ko)).toBe('romaji');
    expect(r.of(t, ko)).toBe('namu');
    r.next(ko);
    expect(r.of(t, ko)).toBeUndefined();
    r.next(ko);
    expect(r.of(t, ko)).toBe('namu');
    expect(r.of({ s: 'tree', ro: 'x' }, LANGS['en'])).toBeUndefined();
  });

  it('韓文按過不影響日文：各記各的', () => {
    const r = TestBed.inject(Reading);
    r.next(LANGS['ko']);
    expect(r.modeOf(LANGS['ko'])).toBe('off');
    expect(r.modeOf(LANGS['ja'])).toBe('hira');
    expect(localStorage.getItem('reading_ko')).toBe('"off"');
    expect(localStorage.getItem('reading')).toBeNull();
  });

  it('切換存在 localStorage reading（每台裝置記住）', async () => {
    const { f, toggle } = await setupJa();
    toggle.click();
    await f.whenStable();
    expect(localStorage.getItem('reading')).toBe('"romaji"');
    TestBed.resetTestingModule();
    expect(TestBed.inject(Reading).modeOf(LANGS['ja'])).toBe('romaji');
  });
});
