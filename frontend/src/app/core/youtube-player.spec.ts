import { TestBed } from '@angular/core/testing';
import { YoutubePlayer } from './youtube-player';

describe('YoutubePlayer', () => {
  const w = window as unknown as { YT?: unknown };
  let Player: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Player = vi.fn();
    w.YT = { Player, PlayerState: { PLAYING: 1, ENDED: 0 } }; // API 已載入：loadYouTubeApi() 直接 resolve
  });
  afterEach(() => delete w.YT);

  it('create：API 載好後建立 YT.Player（controls:0、playsinline）', async () => {
    const yt = TestBed.inject(YoutubePlayer);
    yt.create(
      document.createElement('div'),
      'vid1',
      () => {},
      () => {},
    );
    await Promise.resolve();
    expect(Player).toHaveBeenCalledTimes(1);
    const opts = Player.mock.calls[0][1];
    expect(opts.videoId).toBe('vid1');
    expect(opts.playerVars).toMatchObject({ controls: 0, playsinline: 1 });
  });

  it('API 載好之前就 destroy()：不建立播放器', async () => {
    const yt = TestBed.inject(YoutubePlayer);
    yt.create(
      document.createElement('div'),
      'vid1',
      () => {},
      () => {},
    );
    yt.destroy();
    await Promise.resolve();
    expect(Player).not.toHaveBeenCalled();
    expect(yt.ready()).toBe(false);
  });
});
