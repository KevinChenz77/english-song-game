import { Service, signal } from '@angular/core';

/**
 * YouTube iframe 包裝（第二波，負責人：E）。不 inject PlaySession，callback 由 Play 傳入。
 * - 第一次 create() 才插入 iframe_api script（只插一次）；onReady 後每 100ms 呼叫 onTick(currentTime)。
 * - Play 在 afterNextRender 呼叫 create()，DestroyRef.onDestroy 呼叫 destroy()。
 * - iOS：play() 必須在點擊事件的同步呼叫鏈裡被呼叫（不能點擊 → 改 signal → effect → play）。
 */
@Service()
export class YoutubePlayer {
  readonly ready = signal(false);
  readonly playing = signal(false);
  readonly error = signal(false); // 影片無法在這裡播放（onError）

  create(el: HTMLElement, videoId: string, onTick: (t: number) => void, onEnded: () => void): void {
    void [el, videoId, onTick, onEnded];
    throw new Error('TODO wave 2 (E): YoutubePlayer.create');
  }

  /** player.destroy()、clearInterval、ready/playing 設回 false。 */
  destroy(): void {
    throw new Error('TODO wave 2 (E): YoutubePlayer.destroy');
  }

  play(): void {
    throw new Error('TODO wave 2 (E): YoutubePlayer.play');
  }

  pause(): void {
    throw new Error('TODO wave 2 (E): YoutubePlayer.pause');
  }

  seek(t: number): void {
    void t;
    throw new Error('TODO wave 2 (E): YoutubePlayer.seek');
  }

  /** 換影片版本（不自動播放）。 */
  cue(videoId: string): void {
    void videoId;
    throw new Error('TODO wave 2 (E): YoutubePlayer.cue');
  }

  currentTime(): number {
    throw new Error('TODO wave 2 (E): YoutubePlayer.currentTime');
  }
}
