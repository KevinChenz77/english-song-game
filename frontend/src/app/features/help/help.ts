import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SongProgress } from '../../core/models/kid.model';
import { SongCatalog } from '../../core/song-catalog';
import { SongCard } from '../../shared/song-card';

const ALL4: SongProgress = { listen: true, quizNormal: true, quizHard: true, singAll: true };

/** 遊戲說明：玩法、獎勵表、範例小卡（用清單第一首歌）。 */
@Component({
  imports: [RouterLink, SongCard],
  selector: 'app-help',
  templateUrl: './help.html',
  styleUrl: './help.css',
})
export class Help {
  private readonly catalog = inject(SongCatalog);
  protected readonly sample = computed(() => (this.catalog.songs.hasValue() ? this.catalog.songs.value()[0] : undefined));
  protected readonly cards: { p: SongProgress; cap: string }[] = [
    { p: {}, cap: '剛開始' },
    { p: { listen: true, quizNormal: true }, cap: '拿到 2 顆星' },
    { p: { listen: true, quizNormal: true, singAll: true }, cap: '唱唱看「挑戰整首」唱對 80% 以上：多一顆星，還掛上 👑' },
    { p: ALL4, cap: '4 顆星全拿到' },
    { p: { ...ALL4, expert: true }, cap: '「最難」全對：金色流動外框' },
  ];
}
