import { Service, signal } from '@angular/core';
import { LANGS, Lang, ReadingMode } from './lang';
import { Token } from './models/song.model';
import { load, save } from './storage';

/** 每個語言各記一個模式：日文沿用舊的 key，其他語言 reading_<code>。 */
const key = (L: Lang) => (L.code === 'ja' ? 'reading' : `reading_${L.code}`);

/** 存檔被改壞（不是這個語言的模式）就回到它的第一個。 */
const saved = (L: Lang, ms: readonly ReadingMode[]) => {
  const m = load<ReadingMode>(key(L), ms[0]);
  return ms.includes(m) ? m : ms[0];
};

/** 讀音輔助（ruby）：切換順序跟語言（Lang.reading），每台裝置記住（localStorage）。 */
@Service()
export class Reading {
  private readonly modes = signal(
    Object.fromEntries(
      Object.values(LANGS).flatMap((L) => (L.reading ? [[L.code, saved(L, L.reading)]] : [])),
    ) as Record<string, ReadingMode>,
  );

  /** 這個語言目前的模式；沒有讀音的語言是 off。 */
  modeOf(L: Lang): ReadingMode {
    return this.modes()[L.code] ?? 'off';
  }

  /** 這個語言按一下之後的模式。只在有讀音的語言呼叫。 */
  after(L: Lang): ReadingMode {
    const ms = L.reading!;
    return ms[(ms.indexOf(this.modeOf(L)) + 1) % ms.length];
  }

  next(L: Lang): void {
    const m = this.after(L);
    this.modes.update((all) => ({ ...all, [L.code]: m }));
    save(key(L), m);
  }

  /** 這個 token 要標的讀音：平假名只有含漢字的 token 有（t.r），羅馬拼音每個都有。 */
  of(t: Token, L: Lang): string | undefined {
    const m = this.modeOf(L);
    return m === 'hira' ? t.r : m === 'romaji' ? t.ro : undefined;
  }
}
