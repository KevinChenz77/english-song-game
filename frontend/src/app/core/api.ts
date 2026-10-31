import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from './app-config';
import { SaveData } from './models/save-data.model';
import { SongContent } from './models/song.model';
import { parseLrc } from './game/lrc';
import { localTranslations } from './translations';

export const NET_ERR = '存檔伺服器連不到，請稍後再試';
const BAD_REQ = '名字要 1～10 個字、密碼至少 4 個字';
const BUSY = '錯太多次了，請 10 分鐘後再試';
const SERVER = '存檔伺服器出了點問題，請稍後再試';
export const MSG: Record<'save' | 'load', Record<number, string>> = {
  save: { 400: BAD_REQ, 401: '這個名字已經有人用了，或密碼不對', 413: '存檔太大了，請聯絡家長或管理者', 429: BUSY, 500: SERVER },
  load: { 400: BAD_REQ, 401: '密碼不對喔', 404: '找不到這個名字的存檔', 429: BUSY, 500: SERVER },
};
export const LYRICS_ERR = '歌詞抓不到 😢 請確認網路後再試一次。';
export const LYRICS_MISSING = '這首歌的歌詞還沒準備好 😢';

/** HTTP 狀態 → 給小朋友／家長看的中文訊息。0 或沒列到的 = 連不到。 */
export const cloudMessage = (kind: 'save' | 'load', status: number) => MSG[kind][status] || NET_ERR;

const status = (e: unknown) => (e instanceof HttpErrorResponse ? e.status : 0);

/** 後端 API。失敗一律丟 Error，message 是可直接顯示的中文。 */
@Service()
export class Api {
  private readonly http = inject(HttpClient);
  private readonly base = inject(APP_CONFIG).apiBaseUrl;

  async save(name: string, password: string, data: SaveData): Promise<{ created: boolean }> {
    try {
      return await firstValueFrom(this.http.post<{ created: boolean }>(`${this.base}/api/save`, { name, password, data }));
    } catch (e) {
      throw new Error(cloudMessage('save', status(e)));
    }
  }

  async load(name: string, password: string): Promise<unknown> {
    try {
      return (await firstValueFrom(this.http.post<{ data: unknown }>(`${this.base}/api/load`, { name, password }))).data;
    } catch (e) {
      throw new Error(cloudMessage('load', status(e)));
    }
  }

  /** 歌詞＋整句中文；本機家長修改（tr_<songId>）覆蓋伺服器的翻譯。 */
  async content(songId: string): Promise<SongContent> {
    let r: { lrc: string; translations: Record<string, string> };
    try {
      r = await firstValueFrom(this.http.get<typeof r>(`${this.base}/api/songs/${encodeURIComponent(songId)}/content`));
    } catch (e) {
      throw new Error(status(e) === 404 ? LYRICS_MISSING : LYRICS_ERR);
    }
    const lines = parseLrc(r.lrc ?? '');
    if (!lines.length) throw new Error(LYRICS_MISSING);
    return { lines, translations: { ...r.translations, ...localTranslations(songId) } };
  }
}
