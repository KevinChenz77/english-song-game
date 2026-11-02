import { Service, computed, inject, signal } from '@angular/core';
import { YoutubePlayer } from './youtube-player';
import { Rewards } from './rewards';
import { SpeechRecognizer } from './speech-recognizer';
import { LyricLine, PlayMode, QuizLevel, Song } from './models/song.model';
import { Question } from './game/quiz';
import { ScoredWord } from './game/scoring';
import { RewardKey } from './models/kid.model';

const QUIZ_REWARD: Record<QuizLevel, RewardKey> = {
  normal: 'quizNormal',
  hard: 'quizHard',
  expert: 'expert',
};

/** 唱唱看的一句。 */
export interface SingStop {
  i: number;
  endT: number;
  done: boolean;
  tries: number;
  passed?: boolean; // 過關後重唱沒過也保留 true
  result?: { words: ScoredWord[]; score: number };
}

export interface SingSummary {
  passed: number;
  total: number;
  score: number;
  missed: string[];
}

/**
 * 遊玩流程的唯一真相（architecture §4）。第二波各自只填自己負責的方法：
 * - E：open、onTick、setMode、setVideo、setOffset、tapWord（聽聽看）
 * - A：answer、finishQuiz（填填看）
 * - D：startSing、nextStop、finishSing（唱唱看，含伴奏）
 * 規則：流程不用 effect 驅動；陣列／物件 signal 一律 set()/update() 產生新值，不就地修改。
 * 這些 signal 只由本服務的方法寫入（parentOpen 例外，由 Play 的 <details> toggle 寫）。
 * iOS：answer()、nextStop() 等由點擊直接呼叫的方法，內部要同步呼叫 player.play()／recognizer.record()，不能先 await。
 */
@Service()
export class PlaySession {
  private readonly player = inject(YoutubePlayer);
  private readonly rewards = inject(Rewards);
  private readonly recognizer = inject(SpeechRecognizer);

  readonly kidId = signal<number | null>(null);
  readonly song = signal<Song | null>(null);
  readonly lines = signal<LyricLine[]>([]);
  readonly translations = signal<Record<string, string>>({});
  readonly mode = signal<PlayMode>('listen'); // 換歌沿用
  readonly quizLevel = signal<QuizLevel>('normal'); // 換歌沿用
  readonly singAll = signal(false); // 換歌沿用；false = 練習前 8 句
  readonly videoIndex = signal(0); // 換歌重設 0
  readonly offset = signal(0); // off_<videoId> 或影片預設
  readonly time = signal(0); // onTick 寫入的歌詞時間（已扣 offset）
  readonly questions = signal<Question[] | SingStop[]>([]);
  readonly active = signal<number | null>(null); // 目前停下來的題目 index（不存物件參考）
  readonly heard = signal<ReadonlySet<number>>(new Set());
  readonly makeup = signal(false); // 補答跳過的題目
  readonly finished = signal(false);
  readonly singSummary = signal<SingSummary | null>(null);
  readonly parentOpen = signal(false);

  /** 目前句 index（-1 = 還沒開始）。唯一來源，由 time 推出。 */
  readonly currentLine = computed(() => {
    const t = this.time();
    return this.lines().findIndex((l) => t >= l.t && t < l.end);
  });

  /** 開新的一局（E）。換了歌：videoIndex 歸 0；offset 讀 off_<videoId> 或預設。 */
  open(kidId: number, song: Song, lines: LyricLine[], translations: Record<string, string>): void {
    void [kidId, song, lines, translations, this.player, this.rewards, this.recognizer];
    throw new Error('TODO wave 2 (E): PlaySession.open');
  }

  /** YoutubePlayer 每 100ms 呼叫（E）：寫 time、記錄 heard、聽完 80% earn('listen')、句尾暫停設 active、最後一句後 finish()。 */
  onTick(t: number): void {
    void t;
    throw new Error('TODO wave 2 (E): PlaySession.onTick');
  }

  /** 切換玩法並重新出題（E）。 */
  setMode(m: PlayMode): void {
    void m;
    throw new Error('TODO wave 2 (E): PlaySession.setMode');
  }

  /** 換影片版本（E）。 */
  setVideo(i: number): void {
    void i;
    throw new Error('TODO wave 2 (E): PlaySession.setVideo');
  }

  /** 調歌詞時間差並存 off_<videoId>（E）。 */
  setOffset(v: number): void {
    void v;
    throw new Error('TODO wave 2 (E): PlaySession.setOffset');
  }

  /** 點單字：發音＋小視窗（E）。點擊時同步呼叫。 */
  tapWord(word: string): void {
    void word;
    throw new Error('TODO wave 2 (E): PlaySession.tapWord');
  }

  /** 填填看作答（A）。點擊／Enter 時同步呼叫，答對後同步 player.play()。 */
  answer(word: string): void {
    const n = this.active();
    const q = n === null ? undefined : this.quizQs()[n];
    if (n === null || !q || q.done) return;
    if (word !== q.w) {
      this.questions.set(this.quizQs().map((x, k) => (k === n ? { ...x, tries: x.tries + 1 } : x)));
      return;
    }
    const qs = this.quizQs().map((x, k) => (k === n ? { ...x, done: true } : x));
    this.questions.set(qs);
    this.active.set(null);
    // 在點擊當下就播放，iOS 才不會擋
    const left = qs.find((x) => !x.done);
    if (!this.makeup()) this.player.play();
    else if (left) this.jumpTo(left);
    else this.finishQuiz();
  }

  private quizQs(): Question[] {
    return this.mode() === 'quiz' ? (this.questions() as Question[]) : [];
  }

  /** 跳回某題那句的開頭（補答用），同步 play()。 */
  private jumpTo(q: Question): void {
    this.player.seek(this.lines()[q.i].t + this.offset() - 0.3);
    this.player.play();
  }

  /** 結算，影片結束時也會呼叫。分派到 finishQuiz（A）／finishSing（D），兩人各改各的，不碰這個方法。 */
  finish(): void {
    const m = this.mode();
    if (m === 'quiz') this.finishQuiz();
    else if (m === 'sing') this.finishSing();
    else this.finished.set(true);
  }

  /** 填填看結算（A）：該難度全一次答對才 earn。 */
  private finishQuiz(): void {
    const qs = this.quizQs();
    if (!qs.length || this.finished()) return;
    const left = qs.find((q) => !q.done);
    if (left) {
      // 拖進度條跳過的題目，最後回去補問
      if (!this.makeup()) {
        this.makeup.set(true);
        this.jumpTo(left);
      }
      return;
    }
    this.finished.set(true);
    const kidId = this.kidId(),
      song = this.song();
    if (kidId === null || !song || qs.some((q) => q.tries)) return;
    this.rewards.earn(kidId, song, QUIZ_REWARD[this.quizLevel()]);
  }

  /** 唱唱看結算（D）：練習 🎤、挑戰 80% ⭐＋👑，寫 singSummary。 */
  private finishSing(): void {
    throw new Error('TODO wave 2 (D): PlaySession.finishSing');
  }

  /** 「🎤 換你唸」（D）。必須在點擊當下同步呼叫 recognizer.record()，之前不能有 await。 */
  startSing(): void {
    throw new Error('TODO wave 2 (D): PlaySession.startSing');
  }

  /** 下一句／跳過（D）。點擊時同步呼叫，同步 player.play()。 */
  nextStop(): void {
    throw new Error('TODO wave 2 (D): PlaySession.nextStop');
  }
}
