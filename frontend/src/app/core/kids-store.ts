import { Service, signal } from '@angular/core';
import { Kid } from './models/kid.model';
import { load, save } from './storage';
import { nameOk } from './game/text';

/** 小朋友與進度（localStorage 'kids'）。每次變更產生新陣列／新物件並寫回。 */
@Service()
export class KidsStore {
  readonly kids = signal<Kid[]>(load<Kid[]>('kids', []));

  constructor() {
    // 獎勵規則改版：舊的星星和貼紙全部歸零（名字和頭像保留），只做一次
    if (!load('rewardsV2', false)) {
      this.set(this.kids().map((k) => ({ ...k, songs: {}, stickers: [] })));
      save('rewardsV2', true);
    }
  }

  byId(id: number) {
    return this.kids().find((k) => k.id === id);
  }

  /** 名字去空白後 1～10 字；不合格回 null。 */
  add(name: string, avatar: string, progress: Pick<Kid, 'songs' | 'stickers'> = { songs: {}, stickers: [] }): Kid | null {
    if (!nameOk(name)) return null;
    const kid: Kid = { id: this.nextId(), name: name.trim(), avatar, ...progress };
    this.set([...this.kids(), kid]);
    return kid;
  }

  remove(id: number) {
    this.set(this.kids().filter((k) => k.id !== id));
  }

  update(id: number, fn: (k: Kid) => Kid) {
    this.set(this.kids().map((k) => (k.id === id ? fn(k) : k)));
  }

  private set(ks: Kid[]) {
    this.kids.set(ks);
    save('kids', ks);
  }

  // 匯入時一次加好幾位，Date.now() 可能相同
  private nextId() {
    return Math.max(Date.now(), ...this.kids().map((k) => k.id + 1));
  }
}
