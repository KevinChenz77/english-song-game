import { Component, inject, input, DestroyRef } from '@angular/core';
import { PlaySession } from '../../core/play-session';
import { Pronunciation } from '../../core/pronunciation';
import { lookup } from '../../core/game/text';
import { Dicts, tokLang } from '../../core/lang';
import { Token } from '../../core/models/song.model';

/** 點單字的小視窗（PlaySession.tapWord 打開，6 秒自動關；碰著／鍵盤焦點在上面時不關；🔊 重播）。 */
@Component({
  selector: 'app-word-pop',
  template: `
    @if (session.popWord(); as t) {
      <div
        #pop
        class="pop"
        role="status"
        (pointerenter)="hold(true, kbd)"
        (pointerleave)="hold(false, kbd)"
        (focusin)="hold(over, isKbd($event.target))"
        (focusout)="hold(over, pop.contains(next($event)))"
      >
        <div class="txt">
          <b>{{ t.s }}</b>
          <span>{{ zh(t) || '（還沒有中文解釋）' }}</span>
        </div>
        <button type="button" class="say" aria-label="再聽一次" (click)="pron.say(t.s)">🔊</button>
        <button type="button" class="ghost" aria-label="關閉" (click)="session.closePop()">✕</button>
      </div>
    }
  `,
  styles: `
    .pop {
      position: fixed;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      /* left:50% 讓 shrink-to-fit 只剩半個螢幕寬，手機上中文會一字一行；寬度自己給 */
      width: max-content;
      max-width: min(560px, calc(100vw - 32px));
      background: var(--ink);
      color: #fff;
      padding: var(--sp-3) var(--sp-4);
      border-radius: var(--r-lg);
      display: flex;
      gap: var(--sp-3);
      align-items: center;
      font-size: 20px;
      box-shadow: var(--sh-2);
      z-index: 10;
    }
    .txt {
      flex: 1;
      min-width: 8em;
    }
    b {
      display: block;
      font-size: 26px;
      line-height: 1.2;
    }
    span {
      display: block;
      line-height: 1.4;
    }
    button {
      flex: none;
    }
    .say {
      min-width: var(--tap-kid);
      min-height: var(--tap-kid);
      border-radius: var(--r-pill);
      font-size: 30px;
      padding: 0;
    }
  `,
})
export class WordPop {
  readonly dicts = input.required<Dicts>();
  protected readonly session = inject(PlaySession);
  protected readonly pron = inject(Pronunciation);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.session.closePop()); // 離開遊玩畫面時關掉，避免停住的計時
  }

  /** t.s 已 norm 過（PlaySession.tapWord）。 */
  protected zh(t: Token) {
    const L = tokLang(t, this.session.song() ?? {});
    return lookup(t.s, this.dicts()[L.code] ?? {}, L.forms);
  }

  /** 手指／滑鼠在上面，或鍵盤焦點（:focus-visible；點按鈕得到的焦點不算，免得點過 🔊 就永遠不關）。 */
  protected over = false;
  protected kbd = false;
  protected hold(over: boolean, kbd: boolean) {
    this.over = over;
    this.kbd = kbd;
    this.session.holdPop(over || kbd);
  }
  protected isKbd(t: EventTarget | null) {
    return t instanceof Element && t.matches(':focus-visible');
  }
  protected next(e: FocusEvent) {
    return e.relatedTarget instanceof Node ? e.relatedTarget : null;
  }
}
