import { Component, computed, inject, input, numberAttribute } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KidsStore } from '../../core/kids-store';
import { SongCatalog } from '../../core/song-catalog';
import { starStr } from '../../core/game/reward-rules';

/** 選歌（佔位：第二波做 song-card、金框、我的貼紙樣式）。 */
@Component({
  imports: [RouterLink],
  selector: 'app-song-list',
  templateUrl: './song-list.html',
})
export class SongList {
  readonly kidId = input.required({ transform: numberAttribute });
  protected readonly catalog = inject(SongCatalog);
  private readonly store = inject(KidsStore);
  protected readonly kid = computed(() => this.store.byId(this.kidId()));
  protected readonly starStr = starStr;
}
