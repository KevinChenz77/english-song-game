import { Service, computed, inject, signal } from '@angular/core';
import { YoutubePlayer } from './youtube-player';
import { Rewards } from './rewards';
import { SpeechRecognizer } from './speech-recognizer';
import { LyricLine, PlayMode, QuizLevel, Song } from './models/song.model';
import { Question } from './game/quiz';
import { ScoredWord, scoreLine } from './game/scoring';
import { STOP, norm } from './game/text';
import { BackingTrack } from './backing-track';

/** 唱唱看的一句。 */
export interface SingStop {
  i: number;
  endT: number;
  done: boolean;
  tries: number;
  passed?: boolean; // 過關後重唱沒過也保留 true
  result?: { words: ScoredWord[]; score: number };
  state?: 'ready' | 'rec' | 'busy' | 'pass' | 'fail'; // 唱唱看畫面狀態（D）；沒有 = ready
  msg?: string; // 錄音／辨識失敗時給小朋友的提示（D）
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
  private readonly backing = inject(BackingTrack); // 唱唱看伴奏（D）
  private singRun = 0; // 唱唱看錄音／辨識的次數；舊的結果對不上就丟掉（D）

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

  /** 唱唱看結算（D）：練習 🎤、挑戰 80% ⭐＋👑，寫 singSummary。跳過的句子先回去補唸（makeup）。 */
  private finishSing(): void {
    const qs = this.questions() as SingStop[];
    if (!qs.length || this.finished()) return;
    const left = qs.findIndex((q) => !q.done);
    if (left >= 0) {
      if (!this.makeup()) {
        this.makeup.set(true);
        this.singJump(qs[left].i);
      }
      return;
    }
    this.finished.set(true);
    const passed = qs.filter((q) => q.passed).length;
    const score = Math.round((passed / qs.length) * 100);
    const missed = [
      ...new Set(
        qs.flatMap((q) =>
          (q.result?.words ?? [])
            .filter((w) => w.ok === 'miss')
            .map((w) => norm(w.t))
            .filter((w) => !STOP.has(w)),
        ),
      ),
    ].slice(0, 8);
    this.singSummary.set({ passed, total: qs.length, score, missed });
    const kidId = this.kidId();
    const song = this.song();
    if (kidId === null || !song) return;
    if (!this.singAll()) this.rewards.earn(kidId, song, 'singPractice');
    else if (score >= 80) this.rewards.earn(kidId, song, 'singAll'); // Whisper 偶爾會聽錯字，所以 80% 句子過關就算
  }

  /**
   * 「🎤 換你唸」（D）。必須在點擊當下同步呼叫 recognizer.record()，之前不能有 await。
   * 順序：同步 record() → 暫停影片 → 同步伴奏 play()，之後才 await。onLevel 收 0～1 音量。
   */
  async startSing(onLevel: (level: number) => void = () => {}): Promise<void> {
    const idx = this.active();
    const stop = idx === null ? undefined : this.singStopAt(idx);
    if (idx === null || !stop || stop.state === 'rec' || stop.state === 'busy') return; // 連點不重複錄
    const run = ++this.singRun;
    const line = this.lines()[stop.i];
    try {
      speechSynthesis.cancel(); // ponytail: 單字發音的 <audio> 沒停；Pronunciation 有 stop() 時改呼叫它
    } catch {
      /* 沒有 speechSynthesis */
    }
    this.patchStop(idx, { state: 'rec', msg: undefined });
    const rec = this.recognizer.record(onLevel); // 先開麥克風，再開伴奏，都在點擊當下
    this.player.pause();
    this.backing.play(line.t);
    // 只在這句還是同一次錄音／辨識時才寫回（換模式、跳過後就丟掉結果）
    const still = (state: SingStop['state']) =>
      run === this.singRun && this.active() === idx && this.singStopAt(idx)?.state === state;
    const retry = (state: SingStop['state'], msg: string) => {
      if (still(state)) this.patchStop(idx, { state: 'ready', msg });
    };
    let audio: Float32Array | null;
    try {
      audio = await rec;
    } catch (e) {
      const err = e as Error;
      return retry(
        'rec',
        err.name === 'NotAllowedError'
          ? '麥克風被擋住了，請在瀏覽器的網站設定裡允許使用麥克風。'
          : '麥克風打不開：' + err.message,
      );
    } finally {
      this.backing.stop();
    }
    if (!audio) return retry('rec', '好像沒聽到喔，靠近一點再唸一次 🎤');
    if (!still('rec')) return;
    this.patchStop(idx, { state: 'busy' });
    let text: string;
    try {
      text = await this.recognizer.transcribe(audio);
    } catch {
      return retry('busy', '辨識失敗了，再試一次');
    }
    if (!text) return retry('busy', '好像沒聽到喔，靠近一點再唸一次 🎤');
    if (!still('busy')) return;
    const result = scoreLine(line.text, text);
    this.patchStop(
      idx,
      result.score >= 0.7
        ? { result, state: 'pass', passed: true }
        : { result, state: 'fail', tries: stop.tries + 1 },
    );
  }

  /** 中斷唱唱看的錄音／辨識（D）：離開唱唱看面板時呼叫；進行中的結果丟掉，這句回到 ready。 */
  cancelSing(): void {
    this.singRun++;
    this.recognizer.stop();
    this.backing.stop();
    const idx = this.active();
    const s = idx === null ? undefined : this.singStopAt(idx);
    if (idx !== null && (s?.state === 'rec' || s?.state === 'busy'))
      this.patchStop(idx, { state: 'ready' });
  }

  /** 下一句／跳過（D）。點擊時同步呼叫，同步 player.play()。 */
  nextStop(): void {
    const idx = this.active();
    if (idx === null) return;
    this.backing.stop();
    this.patchStop(idx, { done: true });
    this.active.set(null);
    const left = (this.questions() as SingStop[]).find((q) => !q.done);
    if (!left) {
      this.player.pause();
      this.finish();
    } else if (this.makeup()) this.singJump(left.i);
    else this.player.play(); // 在點擊當下播放，iOS 才不會擋
  }

  private singStopAt(idx: number): SingStop | undefined {
    return (this.questions() as SingStop[])[idx];
  }

  private patchStop(idx: number, p: Partial<SingStop>): void {
    this.questions.update((qs) =>
      (qs as SingStop[]).map((q, n) => (n === idx ? { ...q, ...p } : q)),
    );
  }

  /** 跳回第 i 句前 0.3 秒播放（補唸）。 */
  private singJump(i: number): void {
    this.player.seek(this.lines()[i].t + this.offset() - 0.3);
    this.player.play();
  }
}
