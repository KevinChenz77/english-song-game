import { TestBed } from '@angular/core/testing';
import { PlaySession } from './play-session';
import { YoutubePlayer } from './youtube-player';
import { Rewards } from './rewards';
import { Question } from './game/quiz';
import { parseLrc } from './game/lrc';
import { Song } from './models/song.model';

// 假句子（不放真實歌詞）
const lines = parseLrc('[00:01] red fox runs\n[00:03] the big blue boat\n[00:05] we can go now');
const q = (i: number, w: string): Question => ({
  i,
  k: 0,
  w,
  opts: [w, 'x', 'y'],
  endT: lines[i].end,
  done: false,
  tries: 0,
});

function setup(level: 'normal' | 'hard' | 'expert' = 'normal') {
  const player = { play: vi.fn(), pause: vi.fn(), seek: vi.fn() };
  const rewards = { earn: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: YoutubePlayer, useValue: player },
      { provide: Rewards, useValue: rewards },
    ],
  });
  const s = TestBed.inject(PlaySession);
  // 繞過 E 的 setMode：直接放題目
  s.kidId.set(1);
  s.song.set({ id: 'demo', sticker: '❄️' } as Song);
  s.lines.set(lines);
  s.offset.set(1);
  s.mode.set('quiz');
  s.quizLevel.set(level);
  s.questions.set([q(0, 'fox'), q(2, 'go')]);
  return { s, player, rewards, qs: () => s.questions() as Question[] };
}

describe('PlaySession 填填看', () => {
  it('答錯：tries+1、不播放、active 不變；不就地修改', () => {
    const { s, player, qs } = setup();
    const before = qs();
    s.active.set(0);
    s.answer('cat');
    expect(qs()[0].tries).toBe(1);
    expect(before[0].tries).toBe(0);
    expect(s.active()).toBe(0);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('答對：done、active 清掉、同步 play()；已答過的再按沒反應', () => {
    const { s, player, qs } = setup();
    s.active.set(0);
    s.answer('fox');
    expect(qs()[0].done).toBe(true);
    expect(s.active()).toBeNull();
    expect(player.play).toHaveBeenCalledTimes(1);
    s.answer('fox');
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('補答中答對、還有漏的：跳到下一題那句（不是直接播放下去）', () => {
    const { s, player } = setup();
    s.finish(); // 兩題都漏了
    expect(player.seek).toHaveBeenLastCalledWith(lines[0].t + 1 - 0.3);
    player.seek.mockClear();
    player.play.mockClear();
    s.active.set(0);
    s.answer('fox');
    expect(player.seek).toHaveBeenCalledExactlyOnceWith(lines[2].t + 1 - 0.3);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(s.finished()).toBe(false);
  });

  it('有漏答：finish 進入補答並跳回那句；補完全部一次答對才 earn', () => {
    const { s, player, rewards } = setup('hard');
    s.active.set(0);
    s.answer('fox');
    s.finish(); // 影片播完，第 2 題被拖過去
    expect(s.makeup()).toBe(true);
    expect(s.finished()).toBe(false);
    expect(player.seek).toHaveBeenLastCalledWith(lines[2].t + 1 - 0.3);
    s.active.set(1);
    s.answer('go');
    expect(s.finished()).toBe(true);
    expect(rewards.earn).toHaveBeenCalledWith(1, s.song(), 'quizHard');
    s.finish();
    expect(rewards.earn).toHaveBeenCalledTimes(1);
  });

  it('有答錯過：結算但不給獎勵；最難全對給 expert', () => {
    const a = setup();
    a.s.active.set(0);
    a.s.answer('x');
    a.s.answer('fox');
    a.s.active.set(1);
    a.s.answer('go');
    a.s.finish();
    expect(a.s.finished()).toBe(true);
    expect(a.rewards.earn).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    const b = setup('expert');
    for (const [n, w] of [
      [0, 'fox'],
      [1, 'go'],
    ] as const) {
      b.s.active.set(n);
      b.s.answer(w);
    }
    b.s.finish();
    expect(b.rewards.earn).toHaveBeenCalledWith(1, b.s.song(), 'expert');
  });
});
