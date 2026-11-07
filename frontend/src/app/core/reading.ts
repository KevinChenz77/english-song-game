import { Service, signal } from '@angular/core';
import { Lang, ReadingMode } from './lang';
import { Token } from './models/song.model';
import { load, save } from './storage';

const MODES: readonly ReadingMode[] = ['hira', 'romaji', 'off'];

/**
 * 讀音輔助（ruby）：切換順序跟語言（Lang.reading），每台裝置記住一個模式（localStorage `reading`）。
 * 語言沒有的模式（韓文沒有平假名）就用它的第一個。
 */
@Service()
export class Reading {
  // 存檔被改壞（不是三種之一）就回到平假名
  private readonly saved = load<ReadingMode>('reading', 'hira');
  readonly mode = signal<ReadingMode>(MODES.includes(this.saved) ? this.saved : 'hira');

  /** 這個語言實際用的模式。 */
  modeOf(L: Lang): ReadingMode {
    const m = this.mode();
    return L.reading?.includes(m) ? m : (L.reading?.[0] ?? 'off');
  }

  /** 這個語言按一下之後的模式。只在有讀音的語言呼叫。 */
  after(L: Lang): ReadingMode {
    const ms = L.reading!;
    return ms[(ms.indexOf(this.modeOf(L)) + 1) % ms.length];
  }

  next(L: Lang): void {
    this.mode.set(this.after(L));
    save('reading', this.mode());
  }

  /** 這個 token 要標的讀音：平假名只有含漢字的 token 有（t.r），羅馬拼音每個都有。 */
  of(t: Token, L: Lang): string | undefined {
    const m = this.modeOf(L);
    return m === 'hira' ? t.r : m === 'romaji' ? t.ro : undefined;
  }
}
