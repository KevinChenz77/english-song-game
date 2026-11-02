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
    <b>{{ song().title }}</b>
    <div>{{ song().from }}</div>
    <div>{{ stars() }}</div>
  `,
})
export class SongCard {
  readonly song = input.required<Pick<Song, 'emoji' | 'title' | 'from'>>();
  readonly progress = input<SongProgress>({});
  protected readonly stars = computed(() => starStr(this.progress()));
}
