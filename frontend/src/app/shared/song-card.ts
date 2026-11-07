import { Component, computed, input } from '@angular/core';
import { SongProgress } from '../core/models/kid.model';
import { Song } from '../core/models/song.model';
import { starStr } from '../core/game/reward-rules';
import { langOf } from '../core/lang';

/** 曲子小卡：emoji、標題、出處、星星（👑）；「最難」全對 → 金色流動外框（styles.css 的 .card.gold）。 */
@Component({
  selector: 'app-song-card',
  host: { class: 'card', '[class.gold]': 'progress().expert' },
  template: `
    @if (lang(); as L) {
      <span class="lang">{{ L.name }}</span>
    }
    <div class="big">{{ song().emoji }}</div>
    <b class="title" [attr.lang]="lang()?.code">{{ song().title }}</b>
    <div class="from">{{ song().from }}</div>
    <div class="stars">{{ stars() }}</div>
  `,
  styles: `
    :host {
      min-height: 220px;
      gap: var(--sp-2);
      text-align: center;
    }
    .lang {
      position: absolute;
      top: var(--sp-2);
      right: var(--sp-2);
      font-size: var(--fs-sm);
      line-height: 1;
      padding: 4px 8px;
      border-radius: var(--r-pill);
      background: var(--bg);
      color: var(--ink-2);
    }
    .big {
      font-size: 72px;
    }
    .title {
      font-size: var(--fs-lg);
      line-height: 1.25;
    }
    .from {
      font-size: var(--fs-sm);
      color: var(--ink-2);
    }
    .stars {
      font-size: var(--fs-lg);
      letter-spacing: 2px;
    }
  `,
})
export class SongCard {
  readonly song = input.required<Pick<Song, 'emoji' | 'title' | 'from' | 'lang'>>();
  readonly progress = input<SongProgress>({});
  /** 非英文歌才標語言（不做篩選，歌少）。 */
  protected readonly lang = computed(() => {
    const L = langOf(this.song());
    return L && L.code !== 'en' ? L : null;
  });
  protected readonly stars = computed(() => starStr(this.progress()));
}
