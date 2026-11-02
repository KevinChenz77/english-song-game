import { Component, ElementRef, afterRenderEffect, inject, viewChild } from '@angular/core';
import { Rewards } from '../core/rewards';

/** 12 片彩紙的序號（--i 錯開角度和時間）。 */
const PIECES = Array.from({ length: 12 }, (_, i) => i);

/** 慶祝畫面：讀 Rewards.celebration（連續獲得時文字已疊加）；用 <dialog> 當真正的 modal。 */
@Component({
  selector: 'app-celebration',
  template: `
    <dialog #dlg aria-labelledby="celeT" (close)="rewards.dismiss()">
      @if (rewards.celebration(); as c) {
        <div class="burst" aria-hidden="true">
          @for (i of pieces; track i) {
            <i [style.--i]="i"></i>
          }
        </div>
        <div class="big" aria-hidden="true">{{ c.emoji }}</div>
        <div id="celeT" class="msgs">
          @for (line of c.text.split('\\n'); track $index) {
            <p [style.--i]="$index">{{ line }}</p>
          }
        </div>
        <button #ok type="button" (click)="rewards.dismiss()">好耶！</button>
      }
    </dialog>
  `,
  styles: `
    dialog {
      position: relative;
      padding: var(--sp-8) var(--sp-6) var(--sp-6);
      text-align: center;
      background: linear-gradient(180deg, var(--hl-bg), var(--card) 55%);
      box-shadow: var(--sh-2);
      border: 4px solid var(--hl);
    }
    /* D3：淺一點的 backdrop，看得到後面的畫面 */
    dialog::backdrop {
      background: #16324f66;
    }
    .big {
      position: relative;
      font-size: 96px;
      line-height: 1.1;
      animation: pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    .big::before {
      content: '';
      position: absolute;
      inset: 50% auto auto 50%;
      width: 150px;
      height: 150px;
      translate: -50% -50%;
      z-index: -1;
      border-radius: 50%;
      background: radial-gradient(var(--hl) 0 35%, transparent 70%);
    }
    .msgs {
      margin: var(--sp-4) 0 var(--sp-6);
      display: grid;
      gap: var(--sp-2);
    }
    p {
      margin: 0;
      padding: var(--sp-2) var(--sp-3);
      border-radius: var(--r-md);
      background: var(--card);
      box-shadow: var(--sh-1);
      font-size: var(--fs-lg);
      font-weight: 700;
      line-height: 1.35;
      animation: rise 0.35s ease-out both;
      animation-delay: calc(0.25s + var(--i) * 0.08s);
    }
    button {
      width: 100%;
      min-height: var(--tap-kid);
      font-size: var(--fs-xl);
      font-weight: 800;
      border-radius: var(--r-pill);
      box-shadow: var(--sh-2);
      animation: rise 0.3s ease-out 0.4s both;
    }
    /* 彩紙：只在卡片範圍內飛，不撐出捲軸也不影響後面的版面 */
    .burst {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      border-radius: inherit;
    }
    i {
      position: absolute;
      left: 50%;
      top: 90px;
      width: 12px;
      height: 18px;
      margin: -9px 0 0 -6px;
      border-radius: 3px;
      background: var(--hl);
      opacity: 0;
      animation: fly 1.2s cubic-bezier(0.2, 0.7, 0.3, 1) both;
      animation-delay: calc(var(--i) * 0.02s);
    }
    i:nth-child(3n + 2) {
      background: var(--accent);
      border-radius: 50%;
      width: 12px;
      height: 12px;
    }
    i:nth-child(3n) {
      background: var(--good);
    }
    i:nth-child(4n) {
      background: var(--focus);
    }
    @keyframes pop {
      0% {
        transform: scale(0) rotate(-15deg);
      }
      60% {
        transform: scale(1.2) rotate(15deg);
      }
      100% {
        transform: scale(1) rotate(0);
      }
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
    }
    @keyframes fly {
      0% {
        opacity: 1;
        transform: rotate(calc(var(--i) * 30deg)) translateY(0) scale(0.4);
      }
      70% {
        opacity: 1;
      }
      100% {
        opacity: 0;
        transform: rotate(calc(var(--i) * 30deg)) translateY(-170px) rotate(240deg) scale(1);
      }
    }
    /* 不要動畫：彩紙不出現，其他直接是靜態的亮色卡片 */
    @media (prefers-reduced-motion: reduce) {
      .burst {
        display: none;
      }
      .big,
      p,
      button {
        animation: none;
      }
    }
  `,
})
export class Celebration {
  protected readonly rewards = inject(Rewards);
  protected readonly pieces = PIECES;
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private readonly ok = viewChild<ElementRef<HTMLButtonElement>>('ok');

  constructor() {
    // 只同步 DOM：signal 有內容就開 modal，null 就關
    afterRenderEffect(() => {
      const d = this.dlg().nativeElement;
      if (this.rewards.celebration()) {
        if (!d.open) d.showModal();
        this.ok()?.nativeElement.focus();
      } else if (d.open) d.close();
    });
  }
}
