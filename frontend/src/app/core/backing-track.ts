import { Service, signal } from '@angular/core';
import { YTNamespace, loadYouTubeApi } from './youtube-api';
import { load, save } from './storage';
import { Song } from './models/song.model';

const KARA_VOL = 30;

/**
 * 唱唱看的伴奏（搬 legacy makeKara / karaPlay / karaStop）：另一個藏起來的 YouTube 播放器，
 * 小朋友唸的時候小聲播純音樂；沒有伴奏影片或不能播就安靜跳過。
 * 時間差存 off_<karaoke id>（家長調過才有），沒有就用 song.karaoke.offset。
 */
@Service()
export class BackingTrack {
  /** 「🎵 伴奏：開/關」，存 localStorage karaOn。 */
  readonly on = signal(load('karaOn', true));
  private karaoke: Song['karaoke'] | null = null;
  private yt: YTNamespace = null;
  private host: HTMLElement | null = null;
  private ready = false;

  /** 切到唱唱看時呼叫；只試一次（id 格式不對時 YouTube 會直接丟錯）。 */
  create(karaoke: Song['karaoke']): void {
    if (!karaoke || this.karaoke) return;
    this.karaoke = karaoke;
    void loadYouTubeApi().then((YT) => {
      if (this.karaoke !== karaoke || this.host) return; // 已經 destroy 或換歌
      this.host = document.createElement('div');
      this.host.setAttribute('aria-hidden', 'true');
      this.host.style.cssText =
        'position:fixed;left:-300px;top:0;width:200px;height:200px;pointer-events:none';
      const el = this.host.appendChild(document.createElement('div'));
      document.body.append(this.host);
      try {
        this.yt = new YT.Player(el, {
          videoId: karaoke.id,
          width: 200,
          height: 200,
          playerVars: { playsinline: 1, controls: 0, disablekb: 1 },
          events: { onReady: () => (this.ready = true), onError: () => (this.ready = false) },
        });
      } catch {
        /* 不能播就算了 */
      }
    });
  }

  /** 從歌詞時間 t 開始播（t 前 0.3 秒）。要在點擊當下同步呼叫，iOS 才不會擋。 */
  play(t: number): void {
    const k = this.karaoke;
    if (!this.on() || !this.ready || !k) return;
    try {
      this.yt.seekTo(t + load('off_' + k.id, k.offset) - 0.3, true);
      this.yt.setVolume(KARA_VOL);
      this.yt.playVideo();
    } catch {
      /* 不能播就算了 */
    }
  }

  stop(): void {
    if (this.ready)
      try {
        this.yt.pauseVideo();
      } catch {
        /* 不能播就算了 */
      }
  }

  toggle(): void {
    this.on.update((v) => !v);
    save('karaOn', this.on());
    if (!this.on()) this.stop();
  }

  /** 離開唱唱看：拆掉播放器，下次 create() 重新建立。 */
  destroy(): void {
    try {
      this.yt?.destroy();
    } catch {
      /* 已經壞了 */
    }
    this.host?.remove();
    this.yt = this.host = this.karaoke = null;
    this.ready = false;
  }
}
