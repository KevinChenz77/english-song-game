import { Service, signal } from '@angular/core';
import { YTNamespace, loadYouTubeApi } from './youtube-api';

/**
 * YouTube iframe 包裝。不 inject PlaySession，callback 由 Play 傳入。
 * - iframe_api script 由共用的 loadYouTubeApi() 插入（只插一次）；onReady 後每 100ms 呼叫 onTick(currentTime)。
 * - Play 建立後呼叫 create()，DestroyRef.onDestroy 呼叫 destroy()。
 * - iOS：play() 必須在點擊事件的同步呼叫鏈裡被呼叫（不能點擊 → 改 signal → effect → play）。
 */
@Service()
export class YoutubePlayer {
  readonly ready = signal(false);
  readonly playing = signal(false);
  readonly error = signal(false); // 影片無法在這裡播放（onError）

  private p: YTNamespace = null;
  private timer?: ReturnType<typeof setInterval>;
  private gen = 0; // destroy() 之後才載好的 API 不再建立播放器

  create(el: HTMLElement, videoId: string, onTick: (t: number) => void, onEnded: () => void): void {
    this.destroy();
    const gen = this.gen;
    void loadYouTubeApi().then((YT) => {
      if (gen !== this.gen) return;
      // YT.Player 會把元素換成 iframe，所以給它一個自己建的子元素，不動 Angular 的節點
      const host = el.appendChild(document.createElement('div'));
      this.p = new YT.Player(host, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3 },
        events: {
          onReady: () => {
            this.ready.set(true);
            this.timer = setInterval(() => onTick(this.currentTime()), 100);
          },
          onStateChange: (e: { data: number }) => {
            this.playing.set(e.data === YT.PlayerState.PLAYING);
            if (e.data === YT.PlayerState.ENDED) onEnded();
          },
          onError: () => this.error.set(true),
        },
      });
    });
  }

  /** player.destroy()、clearInterval、ready/playing 設回 false。 */
  destroy(): void {
    this.gen++;
    clearInterval(this.timer);
    try {
      this.p?.destroy();
    } catch {
      /* 已經壞掉的播放器 */
    }
    this.p = null;
    this.ready.set(false);
    this.playing.set(false);
    this.error.set(false);
  }

  play(): void {
    if (this.ready()) this.p.playVideo();
  }

  pause(): void {
    if (this.ready()) this.p.pauseVideo();
  }

  seek(t: number): void {
    if (this.ready()) this.p.seekTo(Math.max(0, t), true);
  }

  /** 換影片版本（不自動播放）。 */
  cue(videoId: string): void {
    this.error.set(false);
    if (this.ready()) this.p.cueVideoById(videoId);
  }

  currentTime(): number {
    return this.ready() ? (this.p.getCurrentTime() ?? 0) : 0;
  }
}
