import { TestBed } from '@angular/core/testing';
import { LyricsPanel } from './lyrics-panel';
import { PlaySession } from '../../core/play-session';
import { YoutubePlayer } from '../../core/youtube-player';
import { Rewards } from '../../core/rewards';
import { parseLrc } from '../../core/game/lrc';
import { tokenize } from '../../core/lang';

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
});
