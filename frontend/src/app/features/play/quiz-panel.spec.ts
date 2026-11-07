import { TestBed } from '@angular/core/testing';
import { QuizPanel } from './quiz-panel';
import { PlaySession } from '../../core/play-session';
import { YoutubePlayer } from '../../core/youtube-player';
import { Rewards } from '../../core/rewards';
import { parseLrc } from '../../core/game/lrc';
import { tokenize } from '../../core/lang';
import { Question } from '../../core/game/quiz';
import { Song } from '../../core/models/song.model';
import { Pronunciation } from '../../core/pronunciation';

// 假句子（不放真實歌詞）
const lines = tokenize(parseLrc('[00:01] red fox runs\n[00:03] the big blue boat'), {});
const q = (i: number, k: number, w: string, opts: string[]): Question => ({
  i,
  k,
  w,
  tok: { s: w },
  opts,
  endT: lines[i].end,
  done: false,
  tries: 0,
});

async function setup(level: 'normal' | 'expert' = 'normal') {
  const player = { play: vi.fn(), pause: vi.fn(), seek: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: YoutubePlayer, useValue: player },
      { provide: Rewards, useValue: { earn: vi.fn() } },
      { provide: Pronunciation, useValue: { say: vi.fn(), prefetch: vi.fn() } },
    ],
  });
  const s = TestBed.inject(PlaySession);
  // 假題目單字：題數故意不是 10／20，難度卡要顯示實際數量
  const quiz = {
    normal: ['fox', 'boat'],
    hard: Array(18).fill('fox'),
    expert: Array(19).fill('boat'),
  };
  s.song.set({ id: 'demo', sticker: '❄️', dict: { boat: '船' }, quiz } as unknown as Song);
  s.lines.set(lines);
  s.translations.set({ 'red fox runs': '紅狐狸在跑' });
  s.mode.set('quiz');
  s.quizLevel.set(level);
  s.questions.set([
    q(0, 1, 'fox', ['cat', 'fox', 'boat']),
    q(1, 3, 'boat', ['boat', 'fox', 'cat']),
  ]);
  const f = TestBed.createComponent(QuizPanel);
  // Play 傳進來的字典＝共用字典，歌曲語言那一份疊上 song.dict
  f.componentRef.setInput('dicts', { en: { fox: '狐狸', cat: '貓（動物）', boat: '船' } });
  await f.whenStable();
  const el: HTMLElement = f.nativeElement;
  const btn = (t: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes(t))!;
  return { s, player, f, el, btn };
}

describe('QuizPanel', () => {
  it('還沒開始：顯示難度（挑戰帶這首歌的貼紙），點了改 quizLevel 並 setMode', async () => {
    const { s, f, el, btn } = await setup();
    expect(el.querySelector('.prog')).toBeNull(); // 還沒出題不顯示「第 1 / N 題」
    expect(el.textContent).toContain('按 ▶ 播放');
    expect(btn('挑戰').textContent).not.toContain('（');
    s.active.set(0);
    await f.whenStable();
    expect(el.querySelector('.prog')!.textContent).toContain('第 1 / 2 題');
    s.active.set(null);
    await f.whenStable();
    expect(btn('挑戰').textContent).toContain('❄️');
    const setMode = vi.spyOn(s, 'setMode').mockImplementation(() => undefined);
    btn('最難').click();
    expect(s.quizLevel()).toBe('expert');
    expect(setMode).toHaveBeenCalledWith('quiz');
  });

  it('難度卡顯示實際出得出來的題數（不是寫死 10／20，也不是清單長度）', async () => {
    const { btn } = await setup();
    // 兩句假歌詞：fox、boat 各只有一句，所以挑戰（18 個 fox）、最難（19 個 boat）都只出得了 1 題
    expect(btn('普通').textContent).toContain('2 題');
    expect(btn('挑戰').textContent).toContain('1 題');
    expect(btn('最難').textContent).toContain('1 題');
    expect(btn('挑戰').textContent).not.toContain('18 題');
  });

  it('選擇題：中文提示；答錯停用＋答案提示；答對顯示答對，唸完 play()', async () => {
    const { s, player, f, el, btn } = await setup();
    s.active.set(0);
    await f.whenStable();
    expect(el.querySelector('.zhq')!.textContent).toContain('紅狐狸在跑');
    expect(btn('cat').textContent).toContain('貓');
    expect(btn('cat').textContent).not.toContain('動物');
    btn('cat').click();
    await f.whenStable();
    expect(btn('cat').disabled).toBe(true);
    expect(btn('fox').classList).toContain('hint');
    expect(el.textContent).toContain('再想想 🤔');
    btn('fox').click();
    await f.whenStable();
    await vi.waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(el.querySelector('.yay')!.textContent).toContain('✅ 答對了！fox 狐狸');
    expect(el.querySelector('.modes')).toBeNull(); // 答到一半不能換難度
  });

  it('最難：Enter 送出；錯 2 次給答案', async () => {
    const { s, player, f, el } = await setup('expert');
    s.active.set(1);
    await f.whenStable();
    const inp = () => el.querySelector('input')!;
    expect(el.querySelector('.hint')!.textContent).toContain('b ＿ ＿ ＿ （4 個字母）船');
    expect(el.querySelector('.sent')!.textContent).not.toContain('boat'); // 答案不在 DOM
    expect(el.querySelector('.sent')!.textContent).toContain('空格');
    for (const w of ['ship', 'raft']) {
      const old = inp();
      old.value = w;
      old.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await f.whenStable();
      // 每次答錯都換一個新的輸入框（重新晃動、清空）
      expect(inp()).not.toBe(old);
      expect(inp().classList).toContain('wrong');
      expect(inp().value).toBe('');
    }
    expect(el.querySelector('.hint')!.textContent).toContain('答案是「boat」');
    inp().value = ' Boat ';
    inp().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await vi.waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
  });

  it('結束：顯示成績與難度按鈕', async () => {
    const { s, f, el } = await setup();
    s.questions.update((qs) => qs.map((x, n) => ({ ...x, done: true, tries: n })));
    s.finished.set(true);
    await f.whenStable();
    expect(el.textContent).toContain('🙂 普通：一次就答對 1 / 2 題，全部答對可以拿到一顆星星喔！');
    expect(el.querySelector('.modes')).not.toBeNull();
  });

  it('英文最難：難度卡寫「自己打字」', async () => {
    const { btn } = await setup();
    expect(btn('最難').textContent).toContain('自己打字');
  });
});

describe('QuizPanel 最難聽發音選字（ja）', () => {
  // 自編的日文句子（不是歌詞）
  const ja = tokenize(parseLrc('[00:01] しろい 猫 が いる\n[00:03] happy な いぬ'), { lang: 'ja' });
  const tok = { s: '猫', r: 'ねこ' };

  async function setupJa() {
    const player = { play: vi.fn(), pause: vi.fn(), seek: vi.fn() };
    const earn = vi.fn();
    const say = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: YoutubePlayer, useValue: player },
        { provide: Rewards, useValue: { earn } },
        { provide: Pronunciation, useValue: { say, prefetch: vi.fn() } },
      ],
    });
    const s = TestBed.inject(PlaySession);
    const quiz = { normal: ['いぬ'], hard: ['いぬ'], expert: ['いぬ'] };
    s.kidId.set(1);
    s.song.set({ id: 'jademo', lang: 'ja', sticker: '🌸', quiz } as unknown as Song);
    s.lines.set(ja);
    s.translations.set({ [ja[0].text]: '有一隻白貓' });
    s.mode.set('quiz');
    s.quizLevel.set('expert');
    s.questions.set([
      { ...q(0, 1, '猫', ['猫', 'いぬ', 'とり']), tok, endT: ja[0].end },
      { ...q(1, 0, 'happy', ['happy', 'いぬ', '猫']), tok: { s: 'happy', l: 'en' }, endT: ja[1].end },
    ]);
    const f = TestBed.createComponent(QuizPanel);
    f.componentRef.setInput('dicts', { ja: { 猫: '貓', いぬ: '狗', とり: '鳥' }, en: { happy: '快樂' } });
    await f.whenStable();
    const el: HTMLElement = f.nativeElement;
    const btn = (t: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent!.includes(t))!;
    return { s, f, el, btn, say, earn, player };
  }

  it('難度卡寫「聽發音選字」，不寫打字', async () => {
    const { btn } = await setupJa();
    expect(btn('最難').textContent).toContain('聽發音選字');
    expect(btn('最難').textContent).not.toContain('打字');
  });

  it('沒有輸入框；選項只有原文（沒有中文、沒有讀音）；整句中文照常顯示', async () => {
    const { s, f, el, btn } = await setupJa();
    s.active.set(0);
    await f.whenStable();
    expect(el.querySelector('input')).toBeNull();
    expect(el.querySelector('.hint')).toBeNull();
    expect(el.querySelector('.opts small, .opts rt')).toBeNull();
    expect(btn('とり').textContent!.trim()).toBe('とり');
    expect(el.querySelector('.zhq')!.textContent).toContain('有一隻白貓');
  });

  it('🔊 再聽一次：點擊當下同步唸，日文 token 用 ja', async () => {
    const { s, f, btn, say } = await setupJa();
    s.active.set(0);
    await f.whenStable();
    const hear = btn('🔊');
    expect(hear.textContent).toContain('聽這個字');
    hear.click();
    expect(say).toHaveBeenCalledTimes(1); // 同一個 click 裡，沒有等 Promise
    expect(say.mock.calls[0][0]).toEqual({ s: '猫', r: 'ねこ' });
    expect(say.mock.calls[0][1].code).toBe('ja');
  });

  it('選項顯示歌詞裡的字形（片假名不變平假名）；句子不插空白、標 lang', async () => {
    const { s, f, el } = await setupJa();
    // 自編的字：答案ネコ（norm＝ねこ），干擾字いぬ在歌詞裡、とり不在
    s.questions.update((qs) => [
      { ...qs[0], w: 'ねこ', opts: ['ねこ', 'いぬ', 'とり'], tok: { s: 'ネコ' } },
      qs[1],
    ]);
    s.active.set(0);
    await f.whenStable();
    const opts = [...el.querySelectorAll('.opts b')];
    expect(opts.map((b) => b.textContent!.trim())).toEqual(['ネコ', 'いぬ', 'とり']);
    expect(opts.map((b) => b.getAttribute('lang'))).toEqual(['ja', 'ja', 'ja']);
    const sent = el.querySelector('.sent')!;
    expect(sent.getAttribute('lang')).toBe('ja');
    expect(sent.textContent!.replace(/\s+$/, '')).not.toMatch(/しろい\s/);
  });

  it('日文歌裡的英文 token：🔊 走英文', async () => {
    const { s, f, btn, say } = await setupJa();
    s.active.set(1);
    await f.whenStable();
    btn('🔊').click();
    expect(say.mock.calls[0][1].code).toBe('en');
  });

  it('全部一次答對 → earn(expert)', async () => {
    const { s, f, btn, earn, player } = await setupJa();
    s.active.set(0);
    await f.whenStable();
    btn('猫').click();
    await vi.waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    s.active.set(1);
    await f.whenStable();
    btn('happy').click();
    s.finish(); // 影片播完
    expect(earn).toHaveBeenCalledWith(1, s.song(), 'expert');
  });
});
