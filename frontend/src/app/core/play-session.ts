import { Service, computed, inject, signal } from '@angular/core';
import { YoutubePlayer } from './youtube-player';
import { Rewards } from './rewards';
import { SpeechRecognizer } from './speech-recognizer';
import { LyricLine, PlayMode, QuizLevel, Song } from './models/song.model';
import { Question } from './game/quiz';
import { ScoredWord } from './game/scoring';

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
 * - A：answer、finish 的填填看分支
 * - D：startSing、nextStop、finish 的唱唱看分支
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
    void word;
    throw new Error('TODO wave 2 (A): PlaySession.answer');
  }

  /** 結算（A：填填看全一次答對才 earn；D：唱唱看練習 🎤、挑戰 80% ⭐＋👑）。影片結束時也會呼叫。 */
  finish(): void {
    throw new Error('TODO wave 2 (A/D): PlaySession.finish');
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
