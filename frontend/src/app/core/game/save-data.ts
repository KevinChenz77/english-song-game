import { Kid } from '../models/kid.model';
import { SaveData, SavedPlayer } from '../models/save-data.model';
import { AVATARS } from './avatars';

/** 組出要上傳的存檔：只放玩家進度，不放 id。 */
export const buildSave = (ks: Kid[]): SaveData => ({
  version: 1,
  savedAt: new Date().toISOString(),
  players: ks.map(({ name, avatar, songs, stickers }) => ({ name, avatar, songs, stickers })),
});

/** 找這台裝置上同名的小朋友（名字去空白後比對）。 */
export const sameName = <T extends { name: string }>(ks: T[], name: string) =>
  ks.find((k) => k.name.trim() === name.trim());

const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);

/** 讀回來的資料不可信：格式不對回 null；songs、stickers 有怪東西就丟掉。 */
export function cleanSave(d: unknown): SavedPlayer[] | null {
  if (!isObj(d) || !Array.isArray(d['players'])) return null;
  const players: unknown[] = d['players'];
  if (!players.every((p) => isObj(p) && typeof p['name'] === 'string' && p['name'].trim())) return null;
  return (players as Record<string, unknown>[]).map((p) => ({
    name: (p['name'] as string).trim(),
    avatar: typeof p['avatar'] === 'string' && p['avatar'] ? p['avatar'] : AVATARS[0],
    songs: isObj(p['songs']) ? Object.fromEntries(Object.entries(p['songs']).filter(([, v]) => isObj(v))) : {},
    stickers: Array.isArray(p['stickers']) ? p['stickers'].filter((s) => typeof s === 'string') : [],
  })) as SavedPlayer[];
}
