import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { PlaySession } from '../../core/play-session';
import { Question, pickQuestions } from '../../core/game/quiz';
import { lookup } from '../../core/game/text';
import { Dicts, tokLang, wordLang } from '../../core/lang';
import { LyricLine, QuizLevel, Song } from '../../core/models/song.model';

/** 難度卡（icon、名稱、一行短說明）與結算的獎勵文字。題數＝實際出得出來的題目數（找不到句子的字會被略過）。 */
const LEVELS = (
  song: Song | null,
  lines: LyricLine[],
): Record<
  QuizLevel,
  { icon: string; name: string; label: string; line: string; reward: string }
> => {
  const n = (l: QuizLevel) => pickQuestions(lines, song?.quiz?.[l] ?? [], song ?? {}).length,
    st = song?.sticker ?? '';
  return {
    normal: {
      icon: '🙂',
      name: '普通',
      label: '🙂 普通',
      line: `${n('normal')} 題・全對 ⭐`,
      reward: '一顆星星',
    },
    hard: {
      icon: '🔥',
      name: '挑戰',
      label: '🔥 挑戰',
      line: `${n('hard')} 題・全對 ⭐${st}`,
      reward: `一顆星星和 ${st} 貼紙`,
    },
    expert: {
      icon: '💎',
      name: '最難',
      label: '💎 最難',
      line: `${n('expert')} 題・自己打字・🏅`,
      reward: '金色小卡',
    },
  };
};

/** 填填看面板（負責人：A）。讀寫 PlaySession；只有畫面上的暫時狀態（答錯的按鈕、答對訊息）放這裡。 */
@Component({
  selector: 'app-quiz-panel',
  templateUrl: './quiz-panel.html',
  styleUrl: './quiz-panel.css',
})
export class QuizPanel {
  /** 每個語言的共用字典（歌曲語言那一份已疊上 song.dict）。 */
  readonly dicts = input.required<Dicts>();
  protected readonly s = inject(PlaySession);

  protected readonly keys: QuizLevel[] = ['normal', 'hard', 'expert'];
  protected readonly levels = computed(() => LEVELS(this.s.song(), this.s.lines()));
  protected readonly level = computed(() => this.levels()[this.s.quizLevel()]);
  protected readonly qs = computed(() => this.s.questions() as Question[]);
  protected readonly doneN = computed(() => this.qs().filter((q) => q.done).length);
  protected readonly num = computed(() => Math.min(this.doneN() + 1, this.qs().length));
  protected readonly q = computed(() => {
    const n = this.s.active();
    return n === null ? null : (this.qs()[n] ?? null);
  });
  protected readonly words = computed(() => {
    const q = this.q();
    return q ? this.s.lines()[q.i].tokens : [];
  });
  /** 這題按錯的選項；換題就清空。 */
  protected readonly wrong = linkedSignal<number | null, ReadonlySet<string>>({
    source: () => this.s.active(),
    computation: () => new Set(),
  });
  /** 「✅ 答對了！」訊息；進入補答或重新開始時清掉。 */
  protected readonly msg = linkedSignal({
    source: () => [this.s.makeup(), this.s.finished()],
    computation: () => '',
  });
  /** 結算：一定顯示成績（獎勵由 PlaySession.finishQuiz 給）。 */
  protected readonly result = computed(() => {
    const n = this.qs().length,
      first = this.qs().filter((q) => !q.tries).length,
      l = this.level();
    return (
      `${l.label}：一次就答對 ${first} / ${n} 題` +
      (first === n ? '，全對！' : `，全部答對可以拿到${l.reward}喔！`)
    );
  });

  private readonly input = viewChild<ElementRef<HTMLInputElement>>('inp');

  constructor() {
    // 最難：出新題或答錯（輸入框依 tries 重建、重新晃動）時游標放進輸入框
    afterRenderEffect(() => this.input()?.nativeElement.focus());
  }

  /** 題目字／選項的中文；字的語言照 wordLang（選項只有字串）。 */
  protected zh(w: string): string {
    const L = wordLang(w, this.s.song() ?? {});
    return (lookup(w, this.dicts()[L.code] ?? {}, L.forms) || '').split('（')[0];
  }

  protected blanks(w: string): string {
    return '＿ '.repeat(w.length - 1);
  }

  protected setLevel(l: QuizLevel): void {
    this.s.quizLevel.set(l);
    this.s.setMode('quiz');
  }

  /** 選擇題：點擊時同步呼叫 answer()（答對時 answer 內同步 play()）。 */
  protected choose(q: Question, w: string): void {
    this.s.answer(w);
    if (w === q.w) this.ok(q);
    else this.wrong.update((s) => new Set(s).add(w));
  }

  /** 最難：Enter 與「確定」都直接呼叫，全程同步（iOS）。答錯時 tries 變了，輸入框會重建。 */
  protected submit(q: Question, inp: HTMLInputElement): void {
    const w = tokLang(q.tok, this.s.song() ?? {}).norm(inp.value);
    if (!w) return inp.focus();
    this.s.answer(w);
    if (w === q.w) this.ok(q);
  }

  private ok(q: Question): void {
    this.msg.set(`✅ 答對了！${q.w} ${this.zh(q.w)}`);
  }
}
