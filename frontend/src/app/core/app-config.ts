import { InjectionToken } from '@angular/core';

/** 執行期設定，main.ts 啟動前從 public/config.json 讀入。 */
export interface AppConfig {
  apiBaseUrl: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

/** config.json 內容不可信：缺 apiBaseUrl 就丟錯，不默默用空字串。 */
export function checkConfig(cfg: unknown): AppConfig {
  const url = (cfg as Partial<AppConfig> | null)?.apiBaseUrl;
  if (typeof url !== 'string' || !url) throw new Error('config.json 缺少 apiBaseUrl');
  return { apiBaseUrl: url.replace(/\/+$/, '') };
}
