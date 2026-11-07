import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PlaySession } from './play-session';
import { YoutubePlayer } from './youtube-player';
import { Rewards } from './rewards';
import { SpeechRecognizer } from './speech-recognizer';
import { Pronunciation } from './pronunciation';
import { LrcLine, Song } from './models/song.model';
import { Question } from './game/quiz';

// 自編的句子（不用真的歌詞）。每句 2 秒，從 10 秒開始。
const TEXTS = [
  'the red kite flies high',
  'my cat sleeps all day',
  'we eat warm soup tonight',
  'a tiny frog jumps far',
  'the bus is late again',
  'she paints a blue door',
  'rain taps on the window',
  'he finds a shiny stone',
  'birds sing in the garden',
  'the moon looks very round',
];
const lines: LrcLine[] = TEXTS.map((text, i) => ({ t: 10 + i * 2, end: 12 + i * 2, text }));
const song = {
  id: 'demo',
  videos: [
    { id: 'vidA', label: 'A', offset: 1 },
    { id: 'vidB', label: 'B', offset: 0 },
  ],
  sticker: '⭐',
  quiz: { normal: ['kite', 'soup', 'door'], hard: [], expert: [] },
} as unknown as Song;
const other = { ...song, id: 'other' } as Song;

function setup() {
  const calls: string[] = [];
  const player = {
    ready: signal(true),
    playing: signal(true),
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    seek: (t: number) => calls.push(`seek ${t}`),
    cue: (id: string) => calls.push(`cue ${id}`),
  };
  const earned: string[] = [];
  const said: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: YoutubePlayer, useValue: player },
      {
        provide: Rewards,
        useValue: { earn: (_k: number, s: Song, key: string) => earned.push(`${s.id}:${key}`) },
      },
      { provide: SpeechRecognizer, useValue: { stop: () => {} } },
      {
        provide: Pronunciation,
        useValue: { say: (t: { s: string }) => said.push(t.s), prefetch: () => {} },
      },
    ],
  });
  const s = TestBed.inject(PlaySession);
  return { s, calls, earned, said, player };
}

describe('PlaySession', () => {
  beforeEach(() => localStorage.clear());

  it('open：停在唱唱看時開沒有語音辨識的語言（韓文），回到聽聽看', () => {
    const { s } = setup();
    s.mode.set('sing');
    s.open(1, { ...song, lang: 'ko' }, lines, {});
    expect(s.mode()).toBe('listen');
  });

  it('open：offset 用影片預設；換歌時 videoIndex 歸 0；setMode 回到開頭並暫停', () => {
    const { s, calls } = setup();
    s.open(1, song, lines, {});
    expect(s.offset()).toBe(1);
    s.setVideo(1);
    expect(s.videoIndex()).toBe(1);
    expect(calls).toContain('cue vidB');
    s.open(1, song, lines, {});
    expect(s.videoIndex()).toBe(1); // 同一首歌沿用
    s.open(1, other, lines, {});
    expect(s.videoIndex()).toBe(0);
    expect(calls.slice(-2)).toEqual(['seek 0', 'pause']);
  });

  it('setOffset：四捨五入到 0.1、存 off_<videoId>，下次 open 讀回來', () => {
    const { s } = setup();
    s.open(1, song, lines, {});
    s.setOffset(1 + 0.1 + 0.2); // 浮點誤差
    expect(s.offset()).toBe(1.3);
    expect(JSON.parse(localStorage.getItem('off_vidA')!)).toBe(1.3);
    s.open(1, other, lines, {});
    s.open(1, song, lines, {});
    expect(s.offset()).toBe(1.3);
  });

  it('onTick：扣 offset 算目前句；heard 只算照順序播到的（一次最多跳 3 句）', () => {
    const { s } = setup();
    s.open(1, song, lines, {}); // offset 1
    s.onTick(11.5); // 歌詞時間 10.5 → 第 0 句
    expect(s.currentLine()).toBe(0);
    s.onTick(15.5); // 14.5 → 第 2 句（跳 2 句，算）
    expect([...s.heard()]).toEqual([0, 1, 2]);
    s.onTick(25.5); // 24.5 → 第 7 句（拖進度條，不算）
    expect(s.currentLine()).toBe(7);
    expect([...s.heard()]).toEqual([0, 1, 2]);
  });

  it('聽聽看：聽到第 8 句（80%）才 earn(listen)；不會在句尾暫停；最後一句唱完仍亮著', () => {
    const { s, calls, earned } = setup();
    s.open(7, song, lines, {});
    s.setOffset(0);
    calls.length = 0;
    for (let t = 10; t < 24; t += 0.5) s.onTick(t); // 聽完第 0～6 句（7 句）
    expect(earned).toEqual([]);
    s.onTick(24.5); // 第 7 句 → 8/10
    expect(earned).toEqual(['demo:listen']); // 之後每句都會再呼叫，由 Rewards.earn 去重
    for (let t = 25; t < 40; t += 0.5) s.onTick(t);
    expect(earned.every((e) => e === 'demo:listen')).toBe(true);
    expect(s.currentLine()).toBe(9);
    expect(calls).not.toContain('pause');
    expect(s.finished()).toBe(false);
  });

  it('填填看：題目句尾 −0.15 秒暫停並設 active（存 index）；不 earn listen', () => {
    const { s, calls, earned } = setup();
    s.mode.set('quiz');
    s.open(1, song, lines, {});
    s.setOffset(0);
    const qs = s.questions() as Question[];
    expect(qs.map((q) => q.w)).toEqual(['kite', 'soup', 'door']);
    calls.length = 0;
    s.onTick(11.8); // 第 0 句結束 12，還沒到 11.85
    expect(s.active()).toBeNull();
    s.onTick(11.9);
    expect(s.active()).toBe(0);
    expect(calls).toEqual(['pause']);
    for (let t = 12; t < 29.5; t += 0.5) s.onTick(t); // 不超過最後一句（finishQuiz 是 A 的）
    expect(earned).toEqual([]);
    expect(s.heard().size).toBeGreaterThanOrEqual(8);
  });

  it('唱唱看：練習 = 前 8 句連續、挑戰 = 全部；過了最後一句 → finish()', () => {
    const { s } = setup();
    s.mode.set('sing');
    s.open(1, song, lines, {});
    expect(s.questions().map((q) => q.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    s.singAll.set(true);
    s.setMode('sing');
    expect(s.questions()).toHaveLength(10);
    // 全部答完後，過了最後一句的結尾就結算（finishSing 是 D 的，這裡只確認有呼叫）
    s.questions.set(s.questions().map((q) => ({ ...q, done: true })) as never);
    const finish = vi.spyOn(s, 'finish').mockImplementation(() => s.finished.set(true));
    s.setOffset(0);
    s.onTick(30.5);
    s.onTick(30.6);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('setMode：每次換玩法都產生新的 heard／questions，不就地修改', () => {
    const { s } = setup();
    s.open(1, song, lines, {});
    s.onTick(11.5);
    const h = s.heard();
    s.onTick(13.5);
    expect(s.heard()).not.toBe(h);
    expect(h.size).toBe(1);
    s.setMode('listen');
    expect(s.heard().size).toBe(0);
    expect(s.active()).toBeNull();
  });

  it('tapWord：norm 後發音、開小視窗；聽聽看播放中會先暫停；6 秒自動關', () => {
    vi.useFakeTimers();
    const { s, calls, said } = setup();
    s.open(1, song, lines, {});
    calls.length = 0;
    s.tapWord({ s: 'Kite,' });
    expect(said).toEqual(['kite']);
    expect(s.popWord()).toEqual({ s: 'kite' });
    expect(calls).toEqual(['pause']);
    s.tapWord({ s: '!!!' });
    expect(said).toEqual(['kite']);
    vi.advanceTimersByTime(5999);
    expect(s.popWord()).toEqual({ s: 'kite' });
    vi.advanceTimersByTime(1);
    expect(s.popWord()).toBeNull();
    vi.useRealTimers();
  });

  it('tapWord（ja）：小視窗顯示原本的片假名（只去標點），發音也用它', () => {
    const { s, said } = setup();
    s.song.set({ ...song, lang: 'ja' });
    s.tapWord({ s: 'ネコ！' }); // 自編的字
    expect(s.popWord()).toEqual({ s: 'ネコ' });
    expect(said).toEqual(['ネコ']);
  });

  it('holdPop：碰著小視窗就不自動關，離開後再等 6 秒', () => {
    vi.useFakeTimers();
    const { s } = setup();
    s.open(1, song, lines, {});
    s.tapWord({ s: 'kite' });
    vi.advanceTimersByTime(5000);
    s.holdPop(true);
    vi.advanceTimersByTime(60000);
    expect(s.popWord()).toEqual({ s: 'kite' });
    s.holdPop(false);
    vi.advanceTimersByTime(5999);
    expect(s.popWord()).toEqual({ s: 'kite' });
    vi.advanceTimersByTime(1);
    expect(s.popWord()).toBeNull();
    vi.useRealTimers();
  });

  it('editTranslation：存 tr_<songId> 並更新 translations', () => {
    const { s } = setup();
    s.open(1, song, lines, { [TEXTS[0]]: '舊的' });
    s.editTranslation(TEXTS[0], ' 新的 ');
    expect(s.translations()[TEXTS[0]]).toBe('新的');
    expect(JSON.parse(localStorage.getItem('tr_demo')!)).toEqual({ [TEXTS[0]]: '新的' });
  });
});
