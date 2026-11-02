import { Component, ElementRef, afterRenderEffect, inject, viewChild } from '@angular/core';
import { Rewards } from '../core/rewards';

/** 慶祝畫面：讀 Rewards.celebration（連續獲得時文字已疊加）；用 <dialog> 當真正的 modal。 */
@Component({
  selector: 'app-celebration',
  template: `
    <dialog #dlg aria-labelledby="celeT" (close)="rewards.dismiss()">
      @if (rewards.celebration(); as c) {
        <div class="big" aria-hidden="true">{{ c.emoji }}</div>
        <p id="celeT">{{ c.text }}</p>
        <button #ok type="button" (click)="rewards.dismiss()">好耶！</button>
      }
    </dialog>
  `,
  styles: `
    dialog {
      border-radius: 24px;
      padding: 28px;
      text-align: center;
      font-size: 22px;
      max-width: 420px;
    }
    .big {
      font-size: 64px;
    }
    p {
      white-space: pre-line;
    }
  `,
})
export class Celebration {
  protected readonly rewards = inject(Rewards);
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
