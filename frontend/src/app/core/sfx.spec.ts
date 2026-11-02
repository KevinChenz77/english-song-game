import { TestBed } from '@angular/core/testing';
import { Sfx } from './sfx';
import { PlaySession } from './play-session';
import { YoutubePlayer } from './youtube-player';
import { Rewards } from './rewards';
import { parseLrc } from './game/lrc';
import { Question } from './game/quiz';

describe('Sfx', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('預設關；關著時不建立 AudioContext；開關存 sfxOn', () => {
    const Ctx = vi.fn();
    vi.stubGlobal('AudioContext', Ctx);
    const sfx = TestBed.inject(Sfx);
    expect(sfx.on()).toBe(false);
    sfx.correct();
    sfx.wrong();
    sfx.celebrate();
    expect(Ctx).not.toHaveBeenCalled();
    sfx.toggle();
    expect(sfx.on()).toBe(true);
    expect(JSON.parse(localStorage.getItem('sfxOn')!)).toBe(true);
  });

  it('answer()：答對叮、答錯咚', () => {
    const sfx = { correct: vi.fn(), wrong: vi.fn(), celebrate: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: Sfx, useValue: sfx },
        { provide: YoutubePlayer, useValue: { play: vi.fn(), pause: vi.fn(), seek: vi.fn() } },
        { provide: Rewards, useValue: { earn: vi.fn() } },
      ],
    });
    const s = TestBed.inject(PlaySession);
    // 假句子（不放真實歌詞）
    const lines = parseLrc('[00:01] red fox runs\n[00:03] we can go now');
    s.lines.set(lines);
    s.mode.set('quiz');
    const q: Question = { i: 0, k: 0, w: 'fox', opts: ['fox', 'x'], endT: lines[0].end, done: false, tries: 0 };
    s.questions.set([q]);
    s.active.set(0);
    s.answer('x');
    expect(sfx.wrong).toHaveBeenCalledTimes(1);
    expect(sfx.correct).not.toHaveBeenCalled();
    s.answer('fox');
    expect(sfx.correct).toHaveBeenCalledTimes(1);
  });
});
