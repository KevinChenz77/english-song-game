import { Component, computed, input } from '@angular/core';
import { SongProgress } from '../core/models/kid.model';
import { Song } from '../core/models/song.model';
import { starStr } from '../core/game/reward-rules';

/** 曲子小卡：emoji、標題、出處、星星（👑）；「最難」全對 → 金色流動外框（styles.css 的 .card.gold）。 */
@Component({
  selector: 'app-song-card',
  host: { class: 'card', '[class.gold]': 'progress().expert' },
  template: `
    <div class="big">{{ song().emoji }}</div>
    <b class="title">{{ song().title }}</b>
    <div class="from">{{ song().from }}</div>
    <div class="stars">{{ stars() }}</div>
  `,
  styles: `
    :host {
      min-height: 220px;
      gap: var(--sp-2);
      text-align: center;
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
  readonly song = input.required<Pick<Song, 'emoji' | 'title' | 'from'>>();
  readonly progress = input<SongProgress>({});
  protected readonly stars = computed(() => starStr(this.progress()));
}
