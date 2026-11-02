import { Service, signal } from '@angular/core';
import { load, save } from './storage';

const VOL = 0.12; // 小聲：不要蓋過歌

/**
 * 音效：Web Audio 振盪器即時產生，不用音檔。預設關，家長在「⚙️ 家長設定」打開（存 sfxOn）。
 * iOS：AudioContext 只建一個、重複使用；每次 pointerdown（點擊當下）恢復它，之後非同步才響得出來。
 * 關掉或瀏覽器沒有 Web Audio 時，全部安靜地不做事。
 */
@Service()
export class Sfx {
  readonly on = signal(load('sfxOn', false));
  private ctx?: AudioContext;

  constructor() {
    // 任何點擊或按鍵都順便解鎖（iOS 要在手勢裡 resume）；root 單例，不用移除
    for (const t of ['pointerdown', 'keydown'])
      document.addEventListener(t, () => this.on() && this.audio(), { capture: true });
  }

  /** 家長設定的開關。點擊時同步呼叫；打開時順便解鎖並試聽一聲「叮」。 */
  toggle(): void {
    this.on.update((v) => !v);
    save('sfxOn', this.on());
    this.correct();
  }

  /** 答對「叮」：兩個上升的亮音。 */
  correct(): void {
    this.tones([1047, 1568], 0.07, 0.18, 'sine');
  }

  /** 答錯「咚」：一個低低的柔和音，不嚇人。 */
  wrong(): void {
    this.tones([196], 0, 0.22, 'triangle', 0.7);
  }

  /** 慶祝：短短的三和弦琶音。 */
  celebrate(): void {
    this.tones([523, 659, 784, 1047], 0.09, 0.3, 'triangle');
  }

  private tones(freqs: number[], step: number, dur: number, type: OscillatorType, vol = 1): void {
    if (!this.on()) return;
    const ctx = this.audio();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + 0.01;
      freqs.forEach((f, i) => {
        const t = t0 + i * step;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(VOL * vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
      });
    } catch {
      /* 播不了就算了 */
    }
  }

  private audio(): AudioContext | undefined {
    try {
      const W = window as unknown as { webkitAudioContext?: typeof AudioContext };
      this.ctx ??= new (window.AudioContext || W.webkitAudioContext!)();
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return this.ctx;
    } catch {
      return undefined; // 沒有 Web Audio
    }
  }
}
