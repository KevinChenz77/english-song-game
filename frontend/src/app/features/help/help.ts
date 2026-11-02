import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SongProgress } from '../../core/models/kid.model';
import { STAR_KEYS, starCount } from '../../core/game/reward-rules';
import { SongCatalog } from '../../core/song-catalog';
import { SongCard } from '../../shared/song-card';

const ALL_STARS: SongProgress = Object.fromEntries(STAR_KEYS.map((k) => [k, true]));
const SOME: SongProgress = { listen: true, quizNormal: true };

/** 遊戲說明：上面小朋友版（三張玩法卡＋範例小卡），下面「給家長看」（獎勵表、規則、雲端、隱私）。範例用清單第一首歌。 */
@Component({
  imports: [RouterLink, SongCard],
  selector: 'app-help',
  templateUrl: './help.html',
  styleUrl: './help.css',
})
export class Help {
  private readonly catalog = inject(SongCatalog);
  protected readonly maxStars = STAR_KEYS.length;
  protected readonly sample = computed(() => (this.catalog.songs.hasValue() ? this.catalog.songs.value()[0] : undefined));
  protected readonly cards: { p: SongProgress; cap: string }[] = [
    { p: {}, cap: '剛開始' },
    { p: SOME, cap: `拿到 ${starCount(SOME)} 顆星` },
    { p: { ...SOME, singAll: true }, cap: '唱得好，戴上 👑' },
    { p: ALL_STARS, cap: '星星全拿到！' },
    { p: { ...ALL_STARS, expert: true }, cap: '最難全對：變金色 ✨' },
  ];
}
