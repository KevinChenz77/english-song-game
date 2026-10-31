// localStorage JSON 讀寫。鍵名沿用舊版：kids、rewardsV2、tr_<songId>、aud2、off_<videoId>、cloudName。
// 私密瀏覽或空間滿時會丟例外，一律吞掉。

export function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
}

export function save(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 存不了就算了 */
  }
}
