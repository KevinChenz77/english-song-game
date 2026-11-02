import { Component, computed, inject, input, numberAttribute } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KidsStore } from '../../core/kids-store';
import { SongCatalog } from '../../core/song-catalog';
import { SongCard } from '../../shared/song-card';

/** 同一種貼紙疊成一格：[{ emoji, n }]，照第一次拿到的順序。 */
export function groupStickers(stickers: readonly string[]) {
  const m = new Map<string, number>();
  for (const s of stickers) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m].map(([emoji, n]) => ({ emoji, n }));
}

/** 選歌：每首歌一張小卡（各自的星星／金框），貼紙本（每首歌各自拿，可重複，同種疊起來 ×N）。 */
@Component({
  imports: [RouterLink, SongCard],
  selector: 'app-song-list',
  templateUrl: './song-list.html',
  styleUrl: './song-list.css',
})
export class SongList {
  readonly kidId = input.required({ transform: numberAttribute });
  protected readonly catalog = inject(SongCatalog);
  private readonly store = inject(KidsStore);
  protected readonly kid = computed(() => this.store.byId(this.kidId()));
  protected readonly stickers = computed(() => groupStickers(this.kid()?.stickers ?? []));
}
