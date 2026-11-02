import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { PlaySession } from '../../core/play-session';
import { YoutubePlayer } from '../../core/youtube-player';
import { SongCatalog } from '../../core/song-catalog';
import { Question } from '../../core/game/quiz';
import { lookup, norm } from '../../core/game/text';
import { QuizLevel } from '../../core/models/song.model';

const LEVELS: QuizLevel[] = ['normal', 'hard', 'expert'];
const LABEL: Record<QuizLevel, string> = { normal: '🙂 普通', hard: '🔥 挑戰', expert: '💎 最難' };

/** 填填看面板（負責人：A）。讀寫 PlaySession；只有畫面上的暫時狀態（答錯的按鈕、答對訊息）放這裡。 */
@Component({
  selector: 'app-quiz-panel',
  templateUrl: './quiz-panel.html',
  styleUrl: './quiz-panel.css',
})
export class QuizPanel {
  protected readonly s = inject(PlaySession);
  private readonly player = inject(YoutubePlayer);
  private readonly catalog = inject(SongCatalog);

  protected readonly levels = LEVELS;
  protected readonly label = LABEL;
  protected readonly qs = computed(() => this.s.questions() as Question[]);
  protected readonly doneN = computed(() => this.qs().filter((q) => q.done).length);
  protected readonly q = computed(() => {
    const n = this.s.active();
    return n === null ? null : (this.qs()[n] ?? null);
  });
  protected readonly words = computed(() => {
    const q = this.q();
    return q ? this.s.lines()[q.i].text.split(/\s+/) : [];
  });
  /** 這題按錯的選項；換題就清空。 */
  protected readonly wrong = linkedSignal<number | null, ReadonlySet<string>>({
    source: () => this.s.active(),
    computation: () => new Set(),
  });
  /** 「✅ 答對了！」訊息；進入補答或重新開始時清掉。 */
  protected readonly msg = linkedSignal(() => (this.s.makeup(), this.s.finished(), ''));
  protected readonly num = computed(() => Math.min(this.doneN() + 1, this.qs().length));
  /** 結算：一定顯示成績（獎勵由 PlaySession.finishQuiz 給）。 */
  protected readonly result = computed(() => {
    const n = this.qs().length,
      first = this.qs().filter((q) => !q.tries).length;
    return (
      `${LABEL[this.s.quizLevel()]}：一次就答對 ${first} / ${n} 題` +
      (first === n ? '，全對！' : `，全部答對可以拿到${this.reward()}喔！`)
    );
  });

  private readonly input = viewChild<ElementRef<HTMLInputElement>>('inp');

  constructor() {
    // 最難：出新題時游標放進輸入框
    afterRenderEffect(() => {
      this.s.active();
      this.input()?.nativeElement.focus();
    });
  }

  protected zh(w: string): string {
    return (lookup(w, { ...this.catalog.dict.value(), ...this.s.song()?.dict }) || '').split(
      '（',
    )[0];
  }

  protected desc(l: QuizLevel): string {
    const sticker = this.s.song()?.sticker ?? '';
    return {
      normal: '10 題，全對得 ⭐',
      hard: `20 題，全對得 ⭐＋${sticker} 貼紙`,
      expert: '20 題自己打字，全對得金色小卡',
    }[l];
  }

  protected blanks(w: string): string {
    return '＿ '.repeat(w.length - 1);
  }

  private reward(): string {
    const sticker = this.s.song()?.sticker ?? '';
    return { normal: '一顆星星', hard: `一顆星星和 ${sticker} 貼紙`, expert: '金色小卡' }[
      this.s.quizLevel()
    ];
  }

  protected setLevel(l: QuizLevel): void {
    this.s.quizLevel.set(l);
    this.s.setMode('quiz');
  }

  protected again(q: Question): void {
    this.player.seek(this.s.lines()[q.i].t + this.s.offset() - 0.3);
    this.player.play();
  }

  /** 選擇題：點擊時同步呼叫 answer()（答對時 answer 內同步 play()）。 */
  protected choose(q: Question, w: string): void {
    this.s.answer(w);
    if (w === q.w) this.ok(q);
    else this.wrong.update((s) => new Set(s).add(w));
  }

  /** 最難：Enter 與「確定」都直接呼叫，全程同步（iOS）。 */
  protected submit(q: Question, inp: HTMLInputElement): void {
    const w = norm(inp.value);
    if (w) this.s.answer(w);
    if (w === q.w) return this.ok(q);
    inp.value = '';
    inp.focus();
  }

  private ok(q: Question): void {
    this.msg.set(`✅ 答對了！${q.w} ${this.zh(q.w)}`);
  }
}
