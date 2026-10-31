/** 單字列不顯示太基本的字（遊戲規則）。 */
export const STOP = new Set(
  "a an the and it i you me my is am be to of in on at for with that this them they they're it's i'm i'll you'll do don't can can't not have some all how now well what who one no".split(
    ' ',
  ),
);

/** 小寫、彎引號轉直引號、只留字母與 '，去掉頭尾的 '。 */
export const norm = (w: string) =>
  w
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z']/g, '')
    .replace(/^'+|'+$/g, '');

/** 查中文；複數查不到就退回原形。dict = 共用字典合併歌曲專屬字典。 */
export const lookup = (w: string, dict: Record<string, string>) =>
  dict[w] || (w.endsWith('s') && dict[w.slice(0, -1)]) || null;

export const shuffle = <T>(a: T[]): T[] => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 以字為單位（emoji 算一個字），和伺服器的 len() 一致。 */
export const len = (s: string) => [...s].length;

/** 小朋友名字、雲端存檔名字：去空白後 1～10 字。 */
export const nameOk = (s: string) => {
  const n = len(s.trim());
  return n >= 1 && n <= 10;
};

/** 密碼 4～64 字（不 trim，與後端相同）。 */
export const passwordOk = (s: string) => len(s) >= 4 && len(s) <= 64;
