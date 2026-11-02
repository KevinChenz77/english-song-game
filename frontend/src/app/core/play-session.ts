import { Service, computed, inject, signal } from '@angular/core';
import { YoutubePlayer } from './youtube-player';
import { Rewards } from './rewards';
import { SpeechRecognizer } from './speech-recognizer';
import { LyricLine, PlayMode, QuizLevel, Song } from './models/song.model';
import { Question, pickQuestions } from './game/quiz';
import { norm } from './game/text';
import { Pronunciation } from './pronunciation';
import { load, save } from './storage';
import { saveTranslation } from './translations';
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
  private readonly pron = inject(Pronunciation);

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

  /** 目前句 index（-1 = 還沒開始）。唯一來源，由 time 推出；最後一句唱完後仍停在最後一句（同舊版）。 */
  readonly currentLine = computed(() => {
    const t = this.time(),
      ls = this.lines();
    let i = -1;
    while (i + 1 < ls.length && ls[i + 1].t <= t) i++;
    return i;
  });

  /** 點單字的小視窗（norm 過的字；null = 關閉）。3 秒自動關。 */
  private readonly _popWord = signal<string | null>(null);
  readonly popWord = this._popWord.asReadonly();
  private popTimer?: ReturnType<typeof setTimeout>;
  private prevLine = -1; // onTick 上一次的目前句（記 heard 用；拖進度條跳太多不算）

  /** 開新的一局（E）。換了歌：videoIndex 歸 0；offset 讀 off_<videoId> 或預設。mode/quizLevel/singAll 沿用。 */
  open(kidId: number, song: Song, lines: LyricLine[], translations: Record<string, string>): void {
    if (this.song()?.id !== song.id) this.videoIndex.set(0);
    this.kidId.set(kidId);
    this.song.set(song);
    this.lines.set(lines);
    this.translations.set(translations);
    this.parentOpen.set(false); // 新畫面的 <details> 是關的
    this.offset.set(this.savedOffset());
    this.setMode(this.mode());
  }

  /**
   * YoutubePlayer 每 100ms 呼叫（E）：t 是影片時間，扣掉 offset 成歌詞時間。
   * 記錄 heard、聽聽看聽完 80% earn('listen')；填填看／唱唱看：唱到題目句尾 −0.15 秒暫停並設 active，
   * 超過最後一句 → finish()（finished() 為 true 後不再呼叫）。
   */
  onTick(t: number): void {
    const lines = this.lines();
    if (!lines.length) return;
    t -= this.offset();
    this.time.set(t);
    const i = this.currentLine();
    if (i >= 0 && i !== this.prevLine) {
      // 只算照順序播到的句子（容許計時器變慢時一次跳 3 句），拖進度條不算
      if (i > this.prevLine && i - this.prevLine <= 3) {
        const s = new Set(this.heard());
        for (let k = this.prevLine + 1; k <= i; k++) s.add(k);
        this.heard.set(s);
        const need = lines.length * 0.8;
        const kidId = this.kidId(),
          song = this.song();
        // 每多聽一句都會再呼叫；Rewards.earn 每首歌每項只給一次
        if (this.mode() === 'listen' && s.size >= need && kidId !== null && song)
          this.rewards.earn(kidId, song, 'listen');
      }
      this.prevLine = i;
    }
    if (this.mode() === 'listen') return;
    // 填填看和唱唱看共用：唱到句尾就停下來
    const n = this.questions().findIndex((q) => !q.done && t >= q.endT - 0.15 && t < q.endT + 1.5);
    if (n >= 0) {
      if (this.player.playing()) this.player.pause();
      this.active.set(n);
    }
    if (t > lines[lines.length - 1].end && !this.finished()) this.finish();
  }

  /** 切換玩法並重新出題（E）。填填看依 quizLevel、唱唱看依 singAll（練習 = 前 8 句）。影片回到開頭並暫停。 */
  setMode(m: PlayMode): void {
    const lines = this.lines(),
      song = this.song();
    this.mode.set(m);
    if (m === 'quiz' && song) {
      const qs = pickQuestions(lines, song.quiz[this.quizLevel()]);
      this.questions.set(qs);
      this.pron.prefetch(qs.slice(0, 8).map((q) => q.w)); // 先慢慢查好答案的發音
    } else if (m === 'sing') {
      this.questions.set(
        (this.singAll() ? lines : lines.slice(0, 8)).map((l, i) => ({
          i,
          endT: l.end,
          done: false,
          tries: 0,
        })),
      );
    } else this.questions.set([]);
    this.recognizer.stop();
    this.active.set(null);
    this.heard.set(new Set());
    this.prevLine = -1;
    this.time.set(-1);
    this.makeup.set(false);
    this.finished.set(false);
    this.singSummary.set(null);
    this.player.seek(0);
    this.player.pause();
  }

  /** 換影片版本（E）。 */
  setVideo(i: number): void {
    this.videoIndex.set(i);
    this.offset.set(this.savedOffset());
    const v = this.song()?.videos[i];
    if (v) this.player.cue(v.id);
    this.setMode(this.mode());
  }

  /** 調歌詞時間差並存 off_<videoId>（E）。四捨五入到 0.1 秒；>0 = 歌詞延後顯示。 */
  setOffset(v: number): void {
    const o = Math.round(v * 10) / 10;
    this.offset.set(o);
    const id = this.song()?.videos[this.videoIndex()]?.id;
    if (id) save('off_' + id, o);
  }

  /** 家長修改一句的中文（存 tr_<songId>，覆蓋伺服器翻譯）。 */
  editTranslation(line: string, zh: string): void {
    const song = this.song();
    if (!song) return;
    saveTranslation(song.id, line, zh);
    this.translations.update((t) => ({ ...t, [line]: zh.trim() }));
  }

  /** 點單字：發音＋小視窗（E）。點擊時同步呼叫（iOS 發音要在手勢裡）。聽聽看播放中會先暫停。 */
  tapWord(token: string): void {
    const w = norm(token);
    if (!w) return;
    if (this.mode() === 'listen' && this.player.playing()) this.player.pause();
    this.pron.say(w);
    this._popWord.set(w);
    clearTimeout(this.popTimer);
    this.popTimer = setTimeout(() => this._popWord.set(null), 3000);
  }

  closePop(): void {
    clearTimeout(this.popTimer);
    this._popWord.set(null);
  }

  private savedOffset(): number {
    const v = this.song()?.videos[this.videoIndex()];
    return v ? load('off_' + v.id, v.offset) : 0;
  }

  /** 填填看作答（A）。點擊／Enter 時同步呼叫，答對後同步 player.play()。 */
  answer(word: string): void {
    void word;
    throw new Error('TODO wave 2 (A): PlaySession.answer');
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
    throw new Error('TODO wave 2 (A): PlaySession.finishQuiz');
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
