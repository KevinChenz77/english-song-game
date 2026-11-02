import { TestBed } from '@angular/core/testing';
import { PlaySession, SingStop } from './play-session';
import { YoutubePlayer } from './youtube-player';
import { Rewards } from './rewards';
import { SpeechRecognizer, isHallucination } from './speech-recognizer';
import { BackingTrack } from './backing-track';
import { LyricLine, Song } from './models/song.model';
import { SingPanel } from '../features/play/sing-panel';

// 自編句子（公開 repo 不放真歌詞）
const lines: LyricLine[] = [
  { t: 1, end: 3, text: 'The purple cat jumps high' },
  { t: 3, end: 5, text: 'My robot likes green soup' },
  { t: 5, end: 7, text: 'We paint the moon at night' },
  { t: 7, end: 9, text: 'Tiny boats sail far away' },
  { t: 9, end: 11, text: 'Happy frogs sing loudly today' },
];
const song = { id: 'demo', karaoke: { id: 'kara1', offset: -1 } } as Song;

describe('PlaySession 唱唱看', () => {
  let s: PlaySession;
  let calls: string[];
  let earn: ReturnType<typeof vi.fn>;
  let recResult: Promise<Float32Array | null>;
  let heard: string;

  beforeEach(() => {
    calls = [];
    earn = vi.fn();
    recResult = Promise.resolve(new Float32Array(10));
    heard = '';
    TestBed.configureTestingModule({
      providers: [
        {
          provide: YoutubePlayer,
          useValue: {
            play: () => calls.push('play'),
            pause: () => calls.push('pause'),
            seek: (t: number) => calls.push(`seek ${t.toFixed(1)}`),
          },
        },
        { provide: Rewards, useValue: { earn } },
        {
          provide: SpeechRecognizer,
          useValue: {
            record: () => (calls.push('record'), recResult),
            transcribe: async () => heard,
            stop: () => {},
            load: () => Promise.resolve(),
            note: () => '',
          },
        },
        {
          provide: BackingTrack,
          useValue: {
            play: (t: number) => calls.push(`kara ${t}`),
            stop: () => calls.push('karaStop'),
            create: () => {},
            destroy: () => {},
            on: () => true,
          },
        },
      ],
    });
    s = TestBed.inject(PlaySession);
    s.kidId.set(1);
    s.song.set(song);
    s.lines.set(lines);
    s.mode.set('sing');
    stops(5);
  });

  /** 模擬 E 的 setMode('sing')：每句一站。 */
  const stops = (n: number) =>
    s.questions.set(lines.slice(0, n).map((l, i) => ({ i, endT: l.end, done: false, tries: 0 })));
  const q = (i: number) => (s.questions() as SingStop[])[i];

  it('換你唸：同步 record() → 暫停影片 → 伴奏，在第一個 await 之前', () => {
    s.active.set(1);
    void s.startSing();
    expect(calls).toEqual(['record', 'pause', 'kara 3']);
    expect(q(1).state).toBe('rec');
  });

  it('唸對 ≥70% 過關；過關後重唱沒過仍保留 passed', async () => {
    s.active.set(0);
    heard = 'the purple cat jumps';
    await s.startSing();
    expect(q(0)).toMatchObject({ state: 'pass', passed: true, tries: 0 });
    expect(calls).toContain('karaStop');
    heard = 'banana';
    await s.startSing();
    expect(q(0)).toMatchObject({ state: 'fail', passed: true, tries: 1 });
    expect(q(0).result!.words.filter((w) => w.ok === 'miss').length).toBeGreaterThan(0);
  });

  it('沒聽到／幻覺字串／麥克風被擋：回到 ready 並給提示', async () => {
    s.active.set(0);
    recResult = Promise.resolve(null);
    await s.startSing();
    expect(q(0)).toMatchObject({ state: 'ready', msg: '好像沒聽到喔，靠近一點再唸一次 🎤' });
    recResult = Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    await s.startSing();
    expect(q(0).msg).toContain('麥克風被擋住了');
    expect(isHallucination('Thank you.')).toBe(true);
    expect(isHallucination('[BLANK_AUDIO]')).toBe(true);
    expect(isHallucination('tiny boats')).toBe(false);
  });

  it('辨識中跳過：結果丟掉，不寫回', async () => {
    s.active.set(0);
    heard = 'the purple cat jumps high';
    const p = s.startSing();
    s.nextStop();
    await p;
    expect(q(0).result).toBeUndefined();
    expect(q(0).done).toBe(true);
  });

  it('下一句：標記 done、同步 play()', () => {
    s.active.set(0);
    calls = [];
    s.nextStop();
    expect(q(0).done).toBe(true);
    expect(s.active()).toBeNull();
    expect(calls).toEqual(['karaStop', 'play']);
  });

  it('跳過的句子最後回去補唸，補完才結算', () => {
    s.offset.set(0.5);
    for (const i of [0, 2, 3, 4]) {
      s.active.set(i);
      s.nextStop();
    }
    calls = [];
    s.finish(); // 影片播完
    expect(s.makeup()).toBe(true);
    expect(calls).toEqual(['seek 3.2', 'play']);
    expect(s.singSummary()).toBeNull();
    s.finish(); // 每個 tick 都可能再呼叫，不能重複 seek
    expect(calls).toEqual(['seek 3.2', 'play']);
    s.active.set(1);
    s.nextStop();
    expect(s.singSummary()).toMatchObject({ passed: 0, total: 5, score: 0 });
    expect(earn).toHaveBeenCalledWith(1, song, 'singPractice');
  });

  it('補唸時下一句跳回下一個漏掉的句子', () => {
    s.makeup.set(true);
    s.questions.update((qs) => qs.map((x, n) => ({ ...x, done: n !== 2 && n !== 4 })));
    s.active.set(2);
    calls = [];
    s.nextStop();
    expect(calls).toEqual(['karaStop', 'seek 8.7', 'play']);
  });

  const finishWith = (passedN: number) => {
    s.questions.update((qs) =>
      qs.map((x, n) => ({
        ...x,
        done: true,
        passed: n < passedN,
        result: {
          words: [
            { t: 'Purple,', ok: 'miss' as const },
            { t: 'the', ok: 'miss' as const },
          ],
          score: 0,
        },
      })),
    );
    s.finish();
  };

  it('挑戰：80% 句子過關才 earn singAll；要多練的字去掉 STOP 字', () => {
    s.singAll.set(true);
    finishWith(4);
    expect(s.singSummary()).toEqual({ passed: 4, total: 5, score: 80, missed: ['purple'] });
    expect(earn).toHaveBeenCalledWith(1, song, 'singAll');
  });

  it('挑戰：沒到 80% 不給獎勵', () => {
    s.singAll.set(true);
    finishWith(3);
    expect(s.singSummary()!.score).toBe(60);
    expect(earn).not.toHaveBeenCalled();
  });

  it('練習：唸完就 earn singPractice（不看分數）', () => {
    finishWith(0);
    expect(earn).toHaveBeenCalledWith(1, song, 'singPractice');
    expect(s.finished()).toBe(true);
  });

  it('面板：練習失敗 3 次後跳過按鈕變「不扣分」，挑戰一律「先跳過」', async () => {
    const fixture = TestBed.createComponent(SingPanel);
    const text = () => (fixture.nativeElement as HTMLElement).textContent!;
    await fixture.whenStable();
    expect(text()).toContain('🎯 練習前 8 句');
    s.active.set(0);
    s.questions.update((qs) =>
      qs.map((x, n) =>
        n
          ? x
          : {
              ...x,
              state: 'fail' as const,
              tries: 3,
              result: { words: [{ t: 'cat', ok: 'miss' as const }], score: 0 },
            },
      ),
    );
    await fixture.whenStable();
    expect(text()).toContain('⏭ 跳過（不扣分）');
    expect(text()).toContain('差一點！這幾個字再唸清楚一點：cat');
    expect(text()).toContain('🎵 伴奏');
    s.singAll.set(true);
    await fixture.whenStable();
    expect(text()).toContain('⏭ 先跳過');
  });
});
