import { Component, inject, input } from '@angular/core';
import { PlaySession } from '../../core/play-session';
import { Pronunciation } from '../../core/pronunciation';
import { lookup } from '../../core/game/text';

/** 點單字的小視窗（PlaySession.tapWord 打開，3 秒自動關、🔊 重播）。 */
@Component({
  selector: 'app-word-pop',
  template: `
    @if (session.popWord(); as w) {
      <div class="pop" role="status">
        <b>{{ w }}</b>
        <span>{{ lookup(w, dict()) || '（還沒有中文解釋）' }}</span>
        <button type="button" aria-label="再聽一次" (click)="pron.say(w)">🔊</button>
        <button type="button" class="ghost" aria-label="關閉" (click)="session.closePop()">
          ✕
        </button>
      </div>
    }
  `,
  styles: `
    .pop {
      position: fixed;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      background: var(--ink);
      color: #fff;
      padding: 14px 18px;
      border-radius: 18px;
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 20px;
      box-shadow: 0 6px 20px #0004;
      max-width: calc(100% - 32px);
      z-index: 10;
    }
    b {
      font-size: 26px;
    }
    button {
      min-height: 44px;
      padding: 6px 12px;
    }
  `,
})
export class WordPop {
  readonly dict = input.required<Record<string, string>>();
  protected readonly session = inject(PlaySession);
  protected readonly pron = inject(Pronunciation);
  protected readonly lookup = lookup;
}
