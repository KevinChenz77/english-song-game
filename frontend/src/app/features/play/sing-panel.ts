import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { PlaySession, SingStop } from '../../core/play-session';
import { SpeechRecognizer } from '../../core/speech-recognizer';
import { BackingTrack } from '../../core/backing-track';
import { YoutubePlayer } from '../../core/youtube-player';
import { norm } from '../../core/game/text';

/** 唱唱看面板（D）。狀態都在 PlaySession，這裡只有音量條。顯示時＝進入唱唱看：載模型、建伴奏。 */
@Component({
  selector: 'app-sing-panel',
  templateUrl: './sing-panel.html',
  styleUrl: './sing-panel.css',
})
export class SingPanel {
  protected readonly session = inject(PlaySession);
  protected readonly recognizer = inject(SpeechRecognizer);
  protected readonly backing = inject(BackingTrack);
  private readonly player = inject(YoutubePlayer);
  protected readonly norm = norm;

  protected readonly level = signal(0);
  protected readonly stops = computed(() => this.session.questions() as SingStop[]);
  protected readonly stop = computed(() => {
    const i = this.session.active();
    return i === null ? null : (this.stops()[i] ?? null);
  });
  protected readonly line = computed(() => {
    const s = this.stop();
    return s ? this.session.lines()[s.i] : null;
  });
  protected readonly progress = computed(() => {
    const qs = this.stops();
    return Math.min(qs.filter((q) => q.done).length + 1, qs.length);
  });
  /** 沒過時提示的前兩個字。 */
  protected readonly missHint = computed(() =>
    (this.stop()?.result?.words ?? [])
      .filter((w) => w.ok === 'miss')
      .slice(0, 2)
      .map((w) => norm(w.t))
      .join('、'),
  );

  constructor() {
    void this.recognizer.load().catch(() => {}); // 失敗訊息在 recognizer.note
    this.backing.create(this.session.song()?.karaoke);
    inject(DestroyRef).onDestroy(() => {
      this.recognizer.stop();
      this.backing.destroy();
    });
  }

  protected choose(all: boolean): void {
    this.session.singAll.set(all);
    this.session.setMode('sing');
  }

  /** 「🎤 換你唸」：同步進 startSing（iOS 麥克風＋伴奏要在點擊當下）。 */
  protected sing(): void {
    this.level.set(0);
    void this.session.startSing((v) => this.level.set(v));
  }

  protected listenAgain(): void {
    const l = this.line();
    if (!l) return;
    this.player.seek(l.t + this.session.offset() - 0.3);
    this.player.play();
  }
}
