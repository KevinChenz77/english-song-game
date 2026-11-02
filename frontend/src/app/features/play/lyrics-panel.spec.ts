import { TestBed } from '@angular/core/testing';
import { LyricsPanel } from './lyrics-panel';
import { PlaySession } from '../../core/play-session';
import { YoutubePlayer } from '../../core/youtube-player';
import { Rewards } from '../../core/rewards';
import { parseLrc } from '../../core/game/lrc';

// 假句子（不放真實歌詞）
const lines = parseLrc('[00:01] red fox runs\n[00:03] the big blue boat');

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
  f.componentRef.setInput('dict', { fox: '狐狸' });
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
    expect(tap).toHaveBeenCalledWith('fox');
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
