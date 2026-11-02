import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { QuizPanel } from './quiz-panel';
import { PlaySession } from '../../core/play-session';
import { YoutubePlayer } from '../../core/youtube-player';
import { Rewards } from '../../core/rewards';
import { SongCatalog } from '../../core/song-catalog';
import { parseLrc } from '../../core/game/lrc';
import { Question } from '../../core/game/quiz';
import { Song } from '../../core/models/song.model';

// 假句子（不放真實歌詞）
const lines = parseLrc('[00:01] red fox runs\n[00:03] the big blue boat');
const q = (i: number, k: number, w: string, opts: string[]): Question => ({
  i,
  k,
  w,
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
      {
        provide: SongCatalog,
        useValue: { dict: { value: signal({ fox: '狐狸', cat: '貓（動物）' }) } },
      },
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

  it('難度卡顯示這首歌實際的題數（不是寫死 10／20）', async () => {
    const { btn } = await setup();
    expect(btn('普通').textContent).toContain('2 題');
    expect(btn('挑戰').textContent).toContain('18 題');
    expect(btn('最難').textContent).toContain('19 題');
    expect(btn('挑戰').textContent).not.toContain('20 題');
  });

  it('選擇題：中文提示；答錯停用＋答案提示；答對同步 play() 並顯示答對', async () => {
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
    expect(player.play).toHaveBeenCalledTimes(1); // 同一個 click 裡
    await f.whenStable();
    expect(el.querySelector('.yay')!.textContent).toContain('✅ 答對了！fox 狐狸');
    expect(el.querySelector('.modes')).toBeNull(); // 答到一半不能換難度
  });

  it('最難：Enter 同步送出；錯 2 次給答案', async () => {
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
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('結束：顯示成績與難度按鈕', async () => {
    const { s, f, el } = await setup();
    s.questions.update((qs) => qs.map((x, n) => ({ ...x, done: true, tries: n })));
    s.finished.set(true);
    await f.whenStable();
    expect(el.textContent).toContain('🙂 普通：一次就答對 1 / 2 題，全部答對可以拿到一顆星星喔！');
    expect(el.querySelector('.modes')).not.toBeNull();
  });
});
