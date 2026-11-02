import { Component, inject } from '@angular/core';
import { Rewards } from '../core/rewards';

/** 慶祝畫面：讀 Rewards.celebration（連續獲得時文字已疊加）。 */
@Component({
  selector: 'app-celebration',
  template: `
    @if (rewards.celebration(); as c) {
      <div class="cele" role="alertdialog" aria-live="assertive">
        <div class="box">
          <div class="big">{{ c.emoji }}</div>
          <p>{{ c.text }}</p>
          <button type="button" (click)="rewards.dismiss()">好耶！</button>
        </div>
      </div>
    }
  `,
  styles: `
    .cele {
      position: fixed;
      inset: 0;
      background: #16324fcc;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      z-index: 10;
    }
    .box {
      background: #fff;
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
}
