import { Kid } from '../models/kid.model';
import { SaveData, SavedPlayer } from '../models/save-data.model';
import { AVATARS } from './avatars';
import { REWARDS } from './reward-rules';
import { len } from './text';

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
/** 頭像、貼紙是一個 emoji；組合 emoji 可能好幾個碼位，8 個以內都算。 */
const shortStr = (s: unknown): s is string => typeof s === 'string' && !!s && len(s) <= 8;
const MAX_STICKERS = 200;

/** 只留認得的獎勵鍵、值必須是 true。 */
const cleanProgress = (v: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(v).filter(([k, x]) => Object.hasOwn(REWARDS, k) && x === true));

/** 讀回來的資料不可信：格式不對回 null；songs、stickers、avatar 有怪東西就丟掉。 */
export function cleanSave(d: unknown): SavedPlayer[] | null {
  if (!isObj(d) || !Array.isArray(d['players'])) return null;
  const players: unknown[] = d['players'];
  if (!players.every((p) => isObj(p) && typeof p['name'] === 'string' && p['name'].trim())) return null;
  return (players as Record<string, unknown>[]).map((p) => ({
    name: (p['name'] as string).trim(),
    avatar: shortStr(p['avatar']) ? p['avatar'] : AVATARS[0],
    songs: isObj(p['songs'])
      ? Object.fromEntries(
          Object.entries(p['songs'])
            .filter((e): e is [string, Record<string, unknown>] => isObj(e[1]))
            .map(([id, v]) => [id, cleanProgress(v)]),
        )
      : {},
    stickers: Array.isArray(p['stickers']) ? p['stickers'].filter(shortStr).slice(0, MAX_STICKERS) : [],
  })) as SavedPlayer[];
}
