import { Service, signal } from '@angular/core';
import { Lang } from './lang';
import { Token } from './models/song.model';
import { load, save } from './storage';

export type ReadingMode = 'hira' | 'romaji' | 'off';
const NEXT: Record<ReadingMode, ReadingMode> = { hira: 'romaji', romaji: 'off', off: 'hira' };

/** 讀音輔助（ruby）：平假名 → 羅馬拼音 → 關，預設平假名，每台裝置記住（localStorage `reading`）。 */
@Service()
export class Reading {
  // 存檔被改壞（不是三種之一）就回到平假名
  private readonly saved = load<ReadingMode>('reading', 'hira');
  readonly mode = signal<ReadingMode>(Object.hasOwn(NEXT, this.saved) ? this.saved : 'hira');

  next(): void {
    this.mode.update((m) => NEXT[m]);
    save('reading', this.mode());
  }

  /** 這個 token 要標的讀音：只有有讀音的語言；平假名只有含漢字的 token 有（t.r），羅馬拼音每個都有。 */
  of(t: Token, L: Lang): string | undefined {
    if (!L.reading) return undefined;
    const m = this.mode();
    return m === 'hira' ? t.r : m === 'romaji' ? t.ro : undefined;
  }
}
