import { HttpClient } from '@angular/common/http';
import { Service, inject, resource } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Song } from './models/song.model';

/**
 * 歌曲清單（public/songs/index.json）與每個語言的共用字典（public/songs/dict.<code>.json）。
 * 單首歌的 json 不在這裡：由 Play 元件用自己的 httpResource field 讀 `songs/<id>.json`。
 */
@Service()
export class SongCatalog {
  private readonly http = inject(HttpClient);
  private idsPromise?: Promise<string[]>;
  private readonly dicts = new Map<string, Promise<Record<string, string>>>();

  /** 選歌畫面的順序。guard 用它判斷歌是否存在。失敗不快取，下次重抓。 */
  ids(): Promise<string[]> {
    return (this.idsPromise ??= firstValueFrom(this.http.get<string[]>('songs/index.json')).catch((e) => {
      this.idsPromise = undefined;
      throw e;
    }));
  }

  /** 選歌畫面的卡片：每首都抓 json（ponytail：超過幾十首再讓 index 帶摘要）。 */
  readonly songs = resource({
    loader: async () =>
      Promise.all((await this.ids()).map((id) => firstValueFrom(this.http.get<Song>(`songs/${id}.json`)))),
  });

  /** 一個語言所有歌共用的 { word: 中文 }；查字時再疊上 song.dict。每個語言抓一次；失敗不快取、回 {}。 */
  dict(code: string): Promise<Record<string, string>> {
    let p = this.dicts.get(code);
    if (!p) {
      p = firstValueFrom(this.http.get<Record<string, string>>(`songs/dict.${code}.json`)).catch(() => {
        this.dicts.delete(code);
        return {};
      });
      this.dicts.set(code, p);
    }
    return p;
  }
}
