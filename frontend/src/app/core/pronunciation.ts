import { Service } from '@angular/core';
import { load, save } from './storage';

// macOS / iOS 的第一個英文聲音常是 Albert、Bubbles 這類趣味機器人聲，要挑自然的
const GOOD_VOICES =
  /premium|enhanced|natural|neural|google us english|samantha|ava|allison|aria|jenny|zoe/i;
const FUNNY_VOICES =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|fred|good news|jester|junior|organ|ralph|superstar|trinoids|whisper|wobble|zarvox|grandma|grandpa|rocko|kathy/i;
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

/**
 * 單字真人發音：Free Dictionary API（Wikimedia Commons 錄音），查不到才用 speechSynthesis。
 * 快取 aud2 = { word: mp3網址 | '' }（'' = 查過沒有）；限流、伺服器錯誤、網路錯誤都不記，下次再查。
 */
@Service()
export class Pronunciation {
  private readonly aud = load<Record<string, string>>('aud2', {});
  private readonly audio = new Audio();
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    try {
      this.pickVoice();
      speechSynthesis.onvoiceschanged = () => this.pickVoice();
    } catch {
      /* 沒有 speechSynthesis */
    }
    // iOS 要在點擊當下先播過一次，之後非同步拿到網址才播得出來
    document.addEventListener(
      'pointerdown',
      () => {
        this.audio.src = SILENT;
        this.audio.play().catch(() => {});
      },
      { once: true },
    );
  }

  /** 唸一個字（norm 過的）。點擊時同步呼叫：快取裡有就當下播。 */
  say(w: string): void {
    if (Object.hasOwn(this.aud, w)) return this.playUrl(w, this.aud[w]);
    void this.url(w).then((u) => this.playUrl(w, u));
  }

  /** 先慢慢查好發音（每 500ms 一個），避免被限流。 */
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

  private playUrl(w: string, url: string | null): void {
    if (!url) return this.speak(w);
    this.audio.src = url;
    this.audio.play().catch(() => this.speak(w));
  }

  private speak(text: string): void {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.8;
      if (this.voice) u.voice = this.voice;
      speechSynthesis.speak(u);
    } catch {
      /* 沒有 speechSynthesis */
    }
  }

  private pickVoice(): void {
    const en = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-');
    const vs = speechSynthesis
      .getVoices()
      .filter((v) => en(v).startsWith('en') && !FUNNY_VOICES.test(v.name));
    const us = vs.filter((v) => /en-US/i.test(en(v)));
    this.voice =
      us.find((v) => GOOD_VOICES.test(v.name)) ||
      vs.find((v) => GOOD_VOICES.test(v.name)) ||
      us[0] ||
      vs[0] ||
      null;
  }
}
