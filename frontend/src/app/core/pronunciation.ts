import { Service } from '@angular/core';
import { load, save } from './storage';
import { Lang } from './lang';
import { Token } from './models/song.model';

const FUNNY_VOICES =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|fred|good news|jester|junior|organ|ralph|superstar|trinoids|whisper|wobble|zarvox|grandma|grandpa|rocko|kathy/i;
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

/**
 * 單字發音。有 dictAudio 的語言（en）：Free Dictionary API（Wikimedia Commons 錄音），查不到才用 speechSynthesis；
 * 其他語言直接用該語言的 speechSynthesis 聲音，唸讀音（token 的 r）。
 * 快取 aud2 = { word: mp3網址 | '' }（'' = 查過沒有）；限流、伺服器錯誤、網路錯誤都不記，下次再查。
 */
@Service()
export class Pronunciation {
  private readonly aud = load<Record<string, string>>('aud2', {});
  private readonly audio = new Audio();
  private readonly voices = new Map<string, SpeechSynthesisVoice>(); // 每個語言挑一次

  constructor() {
    try {
      speechSynthesis.onvoiceschanged = () => this.voices.clear();
    } catch {
      /* 沒有 speechSynthesis */
    }
    // iOS 要在點擊當下先播過一次，之後非同步拿到網址、或不是點擊時（最難聽發音停下來）才播得出來
    document.addEventListener(
      'pointerdown',
      () => {
        this.audio.src = SILENT;
        this.audio.play().catch(() => {});
        try {
          speechSynthesis.speak(new SpeechSynthesisUtterance(''));
        } catch {
          /* 沒有 speechSynthesis */
        }
      },
      { once: true },
    );
  }

  /**
   * 唸一個 token；L＝這個 token 的語言（tokLang）。dictAudio 語言用 s 查字典（要 norm 過）。
   * 點擊時同步呼叫：快取裡有、或直接 TTS 時當下就唸。
   */
  say(t: Token, L: Lang): void {
    if (!L.dictAudio) return this.speak(t.r ?? t.s, L);
    const w = t.s;
    if (Object.hasOwn(this.aud, w)) return this.playUrl(w, this.aud[w], L);
    void this.url(w).then((u) => this.playUrl(w, u, L));
  }

  /** 先慢慢查好英文字典發音（每 500ms 一個），避免被限流。只傳 dictAudio 語言的字。 */
  prefetch(words: string[]): void {
    words.forEach((w, n) => setTimeout(() => void this.url(w), n * 500));
  }

  /** 停掉正在唸的（開始錄音前）。 */
  stop(): void {
    this.audio.pause();
    try {
      speechSynthesis.cancel();
    } catch {
      /* 沒有 speechSynthesis */
    }
  }

  /** mp3 網址；'' = 沒有錄音；null = 這次查不到（不記錄）。 */
  async url(w: string): Promise<string | null> {
    if (Object.hasOwn(this.aud, w)) return this.aud[w];
    const forms = [w];
    if (/..s$/.test(w)) forms.push(w.slice(0, -1));
    if (/...ing$/.test(w)) forms.push(w.slice(0, -3));
    let failed = false;
    for (const f of forms) {
      let r: Response;
      // 查不到的字回 404 時沒有 CORS 標頭，fetch 會直接丟錯，所以出錯也繼續試下一個形式
      try {
        r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(f));
      } catch {
        failed = true;
        continue;
      }
      if (r.status === 404) continue;
      if (!r.ok) return null; // 被限流或伺服器錯誤
      // 字典 API 自己的音檔主機常壞（502），改用它標的 Wikimedia Commons 原始錄音
      type Phonetic = { audio?: string; sourceUrl?: string };
      const ps = ((await r.json()) as { phonetics?: Phonetic[] }[])
        .flatMap((e) => e.phonetics || [])
        .filter((p) => /curid=\d+/.test(p.sourceUrl || ''));
      const p = ps.find((p) => /-us\.mp3$/.test(p.audio || '')) || ps[0];
      if (!p) continue;
      try {
        const id = p.sourceUrl!.match(/curid=(\d+)/)![1];
        const c = await (
          await fetch(
            `https://commons.wikimedia.org/w/api.php?action=query&pageids=${id}&prop=videoinfo&viprop=url|derivatives&format=json&origin=*`,
          )
        ).json();
        const vi = (
          Object.values(c.query.pages)[0] as {
            videoinfo: { url: string; derivatives?: { src: string }[] }[];
          }
        ).videoinfo[0];
        return this.remember(
          w,
          (vi.derivatives || []).map((d) => d.src).find((s) => /\.mp3$/.test(s)) || vi.url,
        );
      } catch {
        return null;
      }
    }
    return failed ? null : this.remember(w, '');
  }

  private remember(w: string, url: string): string {
    this.aud[w] = url;
    save('aud2', this.aud);
    return url;
  }

  private playUrl(w: string, url: string | null, L: Lang): void {
    if (!url) return this.speak(w, L);
    this.audio.src = url;
    this.audio.play().catch(() => this.speak(w, L));
  }

  private speak(text: string, L: Lang): void {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = L.tts.lang;
      u.rate = L.tts.rate;
      const v = this.voice(L);
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch {
      /* 沒有 speechSynthesis */
    }
  }

  /** 該語言的自然聲音：先找地區相同（en-US／ja-JP）且在 good 名單的，避開趣味聲音。找不到不快取（聲音清單可能還沒載入）。 */
  private voice(L: Lang): SpeechSynthesisVoice | undefined {
    const hit = this.voices.get(L.code);
    if (hit) return hit;
    const tag = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();
    const vs = speechSynthesis
      .getVoices()
      .filter((v) => tag(v).startsWith(L.code) && !FUNNY_VOICES.test(v.name));
    const local = vs.filter((v) => tag(v) === L.tts.lang.toLowerCase());
    const good = (v: SpeechSynthesisVoice) => L.tts.good.test(v.name);
    const v = local.find(good) || vs.find(good) || local[0] || vs[0];
    if (v) this.voices.set(L.code, v);
    return v;
  }
}
