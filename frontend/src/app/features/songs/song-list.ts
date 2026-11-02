import { Component, computed, inject, input, numberAttribute } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KidsStore } from '../../core/kids-store';
import { SongCatalog } from '../../core/song-catalog';
import { SongCard } from '../../shared/song-card';

/** 選歌：每首歌一張小卡（各自的星星／金框），我的貼紙（每首歌各自拿，可重複）。 */
@Component({
  imports: [RouterLink, SongCard],
  selector: 'app-song-list',
  templateUrl: './song-list.html',
  styles: `
    a {
      display: grid;
      color: inherit;
      text-decoration: none;
      border-radius: 20px;
    }
    .stickers {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 8px;
      font-size: 22px;
      margin-top: 16px;
    }
  `,
})
export class SongList {
  readonly kidId = input.required({ transform: numberAttribute });
  protected readonly catalog = inject(SongCatalog);
  private readonly store = inject(KidsStore);
  protected readonly kid = computed(() => this.store.byId(this.kidId()));
}
