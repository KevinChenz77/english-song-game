import { Service, inject, signal } from '@angular/core';
import { KidsStore } from './kids-store';
import { Sfx } from './sfx';
import { RewardKey } from './models/kid.model';
import { Song } from './models/song.model';
import { REWARDS, rewardSticker, rewardText } from './game/reward-rules';

export interface Celebration {
  emoji: string;
  text: string;
}

@Service()
export class Rewards {
  private readonly kids = inject(KidsStore);
  private readonly sfx = inject(Sfx);

  /** 慶祝畫面內容；null = 關閉。連續獲得時文字疊加。 */
  private readonly _celebration = signal<Celebration | null>(null);
  readonly celebration = this._celebration.asReadonly();

  /** 每首歌每項只拿一次；有貼紙就加到這位小朋友的貼紙（每首歌各自一份）。 */
  earn(kidId: number, song: Song, key: RewardKey) {
    const kid = this.kids.byId(kidId);
    if (!kid || kid.songs[song.id]?.[key]) return;
    const sticker = rewardSticker(key, song);
    this.kids.update(kidId, (k) => ({
      ...k,
      songs: { ...k.songs, [song.id]: { ...k.songs[song.id], [key]: true } },
      stickers: sticker ? [...k.stickers, sticker] : k.stickers,
    }));
    const text = rewardText(key, sticker);
    this._celebration.update((c) => ({
      emoji: sticker || (REWARDS[key].star ? '⭐' : '💎'),
      text: c ? `${c.text}\n${text}` : text,
    }));
    this.sfx.celebrate();
  }

  dismiss() {
    this._celebration.set(null);
  }
}
