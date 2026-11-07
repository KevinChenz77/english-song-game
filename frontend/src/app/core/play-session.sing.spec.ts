import { TestBed } from '@angular/core/testing';
import { PlaySession, SingStop } from './play-session';
import { YoutubePlayer } from './youtube-player';
import { Rewards } from './rewards';
import { SpeechRecognizer, isHallucination } from './speech-recognizer';
import { BackingTrack } from './backing-track';
import { Song, Token } from './models/song.model';
import { LANGS, tokenize } from './lang';
import { SingPanel } from '../features/play/sing-panel';

// 自編句子（公開 repo 不放真歌詞）
const lines = tokenize([
  { t: 1, end: 3, text: 'The purple cat jumps high' },
  { t: 3, end: 5, text: 'My robot likes green soup' },
  { t: 5, end: 7, text: 'We paint the moon at night' },
  { t: 7, end: 9, text: 'Tiny boats sail far away' },
  { t: 9, end: 11, text: 'Happy frogs sing loudly today' },
], {});
const song = { id: 'demo', videos: [] as Song['videos'] } as Song;

describe('PlaySession 唱唱看', () => {
  let s: PlaySession;
  let calls: string[];
  let earn: ReturnType<typeof vi.fn>;
  let recResult: Promise<Float32Array | null>;
  let heard: string;
  let transcribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    calls = [];
    earn = vi.fn();
    recResult = Promise.resolve(new Float32Array(10));
    heard = '';
    transcribe = vi.fn(async () => heard);
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
            transcribe,
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
    expect(isHallucination('さて、この動画を見てくれてありがとう!', LANGS['ja'])).toBe(true);
    expect(isHallucination('ご視聴ありがとうございました', LANGS['ja'])).toBe(true);
    expect(isHallucination('ねこにありがとう', LANGS['ja'])).toBe(false);
    expect(isHallucination('ねこが見てくれてうれしい', LANGS['ja'])).toBe(false);
  });

  it('連點換你唸：只錄一次', async () => {
    s.active.set(0);
    const p = s.startSing();
    void s.startSing();
    expect(calls.filter((c) => c === 'record')).toHaveLength(1);
    await p;
  });

  it('cancelSing：辨識中的結果丟掉，這句回到 ready 可以再唸', async () => {
    s.active.set(0);
    heard = 'the purple cat jumps high';
    const p = s.startSing();
    s.cancelSing();
    expect(q(0).state).toBe('ready');
    await p;
    expect(q(0).result).toBeUndefined();
    expect(q(0).state).toBe('ready');
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
    expect(s.singSummary()).toEqual({ passed: 4, total: 5, score: 80, missed: [{ s: 'purple' }] });
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
    expect(text()).toContain('🎵 原唱');
    s.singAll.set(true);
    await fixture.whenStable();
    expect(text()).toContain('⏭ 先跳過');
  });
});

describe('PlaySession 唱唱看（日文）', () => {
  // 自編句子（不是歌詞）
  const jaLine = { t: 1, end: 3, text: 'ねこが学校へ行く' };
  const toks: Token[] = [
    { s: 'ねこ', ro: 'neko' },
    { s: 'が', ro: 'ga' },
    { s: '学校', r: 'がっこう', ro: 'gakkou' },
    { s: 'へ', ro: 'e' },
    { s: '行く', r: 'いく', ro: 'iku' },
  ];
  const jaSong = { id: 'ja-demo', videos: [] as Song['videos'], lang: 'ja' } as Song;
  let s: PlaySession;
  let heard: string;
  let transcribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    heard = '';
    transcribe = vi.fn(async () => heard);
    TestBed.configureTestingModule({
      providers: [
        { provide: YoutubePlayer, useValue: { play: () => {}, pause: () => {}, seek: () => {} } },
        { provide: Rewards, useValue: { earn: () => {} } },
        {
          provide: SpeechRecognizer,
          useValue: {
            record: () => Promise.resolve(new Float32Array(10)),
            transcribe,
            stop: () => {},
            load: vi.fn(() => Promise.resolve()),
            note: () => '',
          },
        },
        {
          provide: BackingTrack,
          useValue: {
            play: () => {},
            stop: () => {},
            create: () => {},
            destroy: () => {},
            on: () => false,
          },
        },
      ],
    });
    s = TestBed.inject(PlaySession);
    s.kidId.set(1);
    s.song.set(jaSong);
    s.lines.set(tokenize([jaLine], jaSong, { [jaLine.text]: toks }));
    s.mode.set('sing');
    s.questions.set([{ i: 0, endT: 3, done: false, tries: 0 }]);
    s.active.set(0);
  });
  const q = () => (s.questions() as SingStop[])[0];

  it('用 ja 模型辨識、scoreChars 評分、門檻 0.6（英文 0.7 會沒過）', async () => {
    heard = 'ねこが学校';
    await s.startSing();
    expect(transcribe).toHaveBeenCalledWith(expect.any(Float32Array), LANGS['ja']);
    expect(q().result!.score).toBeCloseTo(2 / 3); // 助詞（が、へ）不算分
    expect(q()).toMatchObject({ state: 'pass', passed: true });
    expect(q().result!.words.map((w) => w.ok)).toEqual(['exact', 'exact', 'exact', 'miss', 'miss']);
  });

  it('要多練的字：token（帶讀音），去掉助詞', () => {
    s.questions.update((qs) =>
      qs.map((x) => ({
        ...x,
        done: true,
        result: {
          score: 0,
          words: toks.map((t) => ({
            t: t.s,
            tok: t,
            ok: t.s === 'ねこ' ? ('exact' as const) : ('miss' as const),
          })),
        },
      })),
    );
    s.finish();
    expect(s.singSummary()!.missed).toEqual([toks[2], toks[4]]);
  });

  it('面板：lang="ja"、平假名讀音 ruby、字之間不插空白；結果也標讀音', async () => {
    const fixture = TestBed.createComponent(SingPanel);
    await fixture.whenStable();
    expect(TestBed.inject(SpeechRecognizer).load).toHaveBeenCalledWith(LANGS['ja']);
    const sent = () => (fixture.nativeElement as HTMLElement).querySelector('.sent')!;
    expect(sent().getAttribute('lang')).toBe('ja');
    expect([...sent().querySelectorAll('rt')].map((r) => r.textContent)).toEqual([
      'がっこう',
      'いく',
    ]);
    expect([...sent().querySelectorAll('.tk')].map((e) => e.textContent).join('|')).toBe(
      'ねこ|が|学校がっこう|へ|行くいく',
    );
    expect(sent().textContent!.trim()).not.toMatch(/ねこ\s+が/);
    heard = 'ねこが学校';
    await s.startSing();
    await fixture.whenStable();
    expect(sent().querySelector('.sw-miss rt')?.textContent).toBe('いく');
    expect(sent().querySelectorAll('.sw-ok').length).toBe(3);
    expect(sent().textContent!.trim()).not.toMatch(/ねこ\s+が/);
  });
});

describe('SpeechRecognizer 換語言', () => {
  it('同一個模型只載一次；換語言先丟掉舊的，ja 固定 japanese、濾日文幻覺', async () => {
    const dispose = vi.fn(async () => {});
    const runs: unknown[][] = [];
    const notes: string[] = [];
    let heardJa = 'ご視聴ありがとうございました';
    const r = TestBed.inject(SpeechRecognizer);
    const pipeline = vi.fn(
      async (_task: string, _model: string, o: { progress_callback: (p: object) => void }) => {
        o.progress_callback({ status: 'progress', file: 'a', loaded: 5, total: 10 });
        notes.push(r.note());
        return Object.assign(async (...a: unknown[]) => (runs.push(a), { text: heardJa }), {
          dispose,
        });
      },
    );
    vi.spyOn(
      r as unknown as { pipelineFn: () => Promise<unknown> },
      'pipelineFn',
    ).mockResolvedValue(pipeline);
    const en = r.load(LANGS['en']);
    expect(r.load(LANGS['en'])).toBe(en);
    await en;
    expect(runs[0][1]).toBeUndefined(); // en 暖機：和以前一樣不給語言
    await r.load(LANGS['ja']);
    expect(dispose).toHaveBeenCalledTimes(1); // en 的被丟掉
    expect(pipeline.mock.calls.map((c) => c[1])).toEqual([
      LANGS['en'].asr.model,
      LANGS['ja'].asr.model,
    ]);
    expect(notes[0]).toContain('約 41MB');
    expect(notes[1]).toContain(`約 ${LANGS['ja'].asr.mb}MB`);
    expect(await r.transcribe(new Float32Array(10), LANGS['ja'])).toBe('');
    expect(runs.at(-1)![1]).toEqual({ language: 'japanese', task: 'transcribe' });
    heardJa = 'ねこがいる';
    expect(await r.transcribe(new Float32Array(10), LANGS['ja'])).toBe('ねこがいる');
    expect(pipeline).toHaveBeenCalledTimes(2);
    expect(r.note()).toBe('');
  });
});

describe('SpeechRecognizer.record', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('等麥克風權限時被 stop()：拿到 stream 馬上關掉、回傳 null', async () => {
    const trackStop = vi.fn();
    let grant!: (s: unknown) => void;
    const getUserMedia = vi.fn(() => new Promise((r) => (grant = r)));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal(
      'AudioContext',
      class {
        resume = () => Promise.resolve();
      },
    );
    const r = TestBed.inject(SpeechRecognizer);
    const p = r.record(() => {});
    expect(getUserMedia).toHaveBeenCalledTimes(1); // 同步呼叫（iOS）
    r.stop();
    grant({ getTracks: () => [{ stop: trackStop }] });
    expect(await p).toBeNull();
    expect(trackStop).toHaveBeenCalled();
  });
});
