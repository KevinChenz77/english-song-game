import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { PlaySession } from '../../core/play-session';
import { YoutubePlayer } from '../../core/youtube-player';
import { STOP, lookup, norm } from '../../core/game/text';

/** 歌詞：目前句高亮＋自動捲動、卡拉 OK 逐字亮、填空、▶ seek、單字 chip、中文（家長模式可改）。 */
@Component({
  selector: 'app-lyrics-panel',
  templateUrl: './lyrics-panel.html',
  styleUrl: './lyrics-panel.css',
})
export class LyricsPanel {
  /** 共用字典疊上 song.dict。 */
  readonly dict = input.required<Record<string, string>>();
  protected readonly session = inject(PlaySession);
  private readonly player = inject(YoutubePlayer);
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');

  /** 每句的字、填空位置、單字 chip（只在歌詞／題目／字典變的時候重算）。 */
  protected readonly rows = computed(() => {
    const dict = this.dict();
    const qs = this.session.questions();
    return this.session.lines().map((l, i) => {
      const q = qs.find((q) => q.i === i);
      const blank = q && 'k' in q ? q : null; // 填填看的題目才有空格
      const seen = new Set<string>();
      const chips: { w: string; zh: string }[] = [];
      const words = l.text.split(/\s+/).map((tok, k) => {
        const n = norm(tok),
          m = lookup(n, dict);
        if (m && !STOP.has(n) && !seen.has(n) && n !== blank?.w) {
          // 填空題的答案不放進單字列
          seen.add(n);
          chips.push({ w: n, zh: m.split('（')[0] });
        }
        return { tok, known: !!m, blank: blank?.k === k };
      });
      return {
        l,
        words,
        chips,
        blankOk: !!blank?.done,
        passed: !!(q && 'passed' in q && q.passed),
      };
    });
  });

  /** 卡拉 OK：目前句依時間比例已亮起的字數。 */
  protected readonly sung = computed(() => {
    const i = this.session.currentLine();
    if (i < 0) return 0;
    const l = this.session.lines()[i],
      n = l.text.split(/\s+/).length,
      t = this.session.time();
    const dur = Math.min(l.end - l.t, n * 0.5 + 0.8);
    return Math.ceil(Math.min(1, (t - l.t) / dur) * n);
  });

  constructor() {
    // 目前句捲到中間
    afterRenderEffect(() => {
      const i = this.session.currentLine();
      const box = this.box().nativeElement,
        r = box.querySelector<HTMLElement>(`[data-line="${i}"]`);
      if (r)
        // 平滑與否交給 CSS scroll-behavior（reduced-motion 時關掉）
        box.scrollTo({ top: r.offsetTop - box.clientHeight / 2 + r.clientHeight / 2 });
    });
  }

  /** ▶：從這句開始播。點擊當下同步 play()（iOS）。 */
  protected seek(t: number): void {
    if (!this.player.ready()) return;
    this.player.seek(t + this.session.offset());
    this.player.play();
  }

  /** 家長設定打開時才能改中文，避免小朋友誤觸。 */
  protected editZh(text: string): void {
    if (!this.session.parentOpen()) return;
    const v = prompt('修改這句的中文翻譯：\n' + text, this.session.translations()[text] || '');
    if (v != null) this.session.editTranslation(text, v);
  }
}
