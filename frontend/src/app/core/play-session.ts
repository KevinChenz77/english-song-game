import { Service, computed, inject, signal } from '@angular/core';
import { YoutubePlayer } from './youtube-player';
import { Rewards } from './rewards';
import { SpeechRecognizer } from './speech-recognizer';
import { LrcLine, LyricLine, PlayMode, QuizLevel, Song, Token } from './models/song.model';
import { Question, pickQuestions } from './game/quiz';
import { ScoredWord, isPractice, scoreChars, scoreLine, wordKey } from './game/scoring';
import { langOf, tokLang, tokenize } from './lang';
import { BackingTrack } from './backing-track';
import { Pronunciation } from './pronunciation';
import { Sfx } from './sfx';
import { load, save } from './storage';
import { saveTranslation } from './translations';
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
  state?: 'ready' | 'rec' | 'busy' | 'pass' | 'fail'; // 唱唱看畫面狀態（D）；沒有 = ready
  msg?: string; // 錄音／辨識失敗時給小朋友的提示（D）
}

export interface SingSummary {
  passed: number;
  total: number;
  score: number;
  missed: Token[]; // 要多練的字（en：norm 過的字；ja：原本的 token，帶讀音）
}

const SAY_MAX_MS = 3000; // 答對後最多等單字唸多久

/**
 * 遊玩流程的唯一真相（architecture §4）。第二波各自只填自己負責的方法：
 * - E：open、onTick、setMode、setVideo、setOffset、tapWord（聽聽看）
 * - A：answer、finishQuiz（填填看）
 * - D：startSing、nextStop、finishSing（唱唱看，含原唱）
 * 規則：流程不用 effect 驅動；陣列／物件 signal 一律 set()/update() 產生新值，不就地修改。
 * 這些 signal 只由本服務的方法寫入（parentOpen 例外，由 Play 的 <details> toggle 寫）。
 * iOS：nextStop() 等由點擊直接呼叫的方法，內部要同步呼叫 player.play()／recognizer.record()，不能先 await。
 * 例外：answer() 答對後等單字唸完才 play()，不在點擊的同步鏈上；若 iOS 擋下，小朋友可按 ▶ 播放。
 */
@Service()
export class PlaySession {
  private readonly player = inject(YoutubePlayer);
  private readonly rewards = inject(Rewards);
  private readonly recognizer = inject(SpeechRecognizer);
  private readonly pron = inject(Pronunciation);
  private readonly backing = inject(BackingTrack); // 唱唱看原唱（D）
  private readonly sfx = inject(Sfx);
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

  /** 目前句 index（-1 = 還沒開始）。唯一來源，由 time 推出；最後一句唱完後仍停在最後一句（同舊版）。 */
  readonly currentLine = computed(() => {
    const t = this.time(),
      ls = this.lines();
    let i = -1;
    while (i + 1 < ls.length && ls[i + 1].t <= t) i++;
    return i;
  });

  /** 點單字的小視窗（s 是 Lang.show 過的 token；null = 關閉）。6 秒自動關。 */
  private readonly _popWord = signal<Token | null>(null);
  readonly popWord = this._popWord.asReadonly();
  private popTimer?: ReturnType<typeof setTimeout>;
  private prevLine = -1; // onTick 上一次的目前句（記 heard 用；拖進度條跳太多不算）
  // 🔁 重播後停下來要再唸一次答案。不用 active.set(null)：題目畫面、按錯的選項會在重播時消失
  private resay = false;
  private sayRun = 0; // 答對後等單字唸完；新的答對、換玩法／換歌時遞增，等完發現變了就不做後續

  /** 開新的一局（E）。換了歌：videoIndex 歸 0；offset 讀 off_<videoId> 或預設。mode/quizLevel/singAll 沿用。依歌曲語言填 tokens。 */
  open(
    kidId: number,
    song: Song,
    lines: LrcLine[],
    translations: Record<string, string>,
    tokens?: Record<string, Token[]>, // 後端的斷詞＋讀音（SongContent.tokens）
  ): void {
    this.closePop(); // 上一局留下的單字小視窗不要帶過來
    if (this.makeup()) this.finishQuiz(); // 補答最後一題還在等唸完：先結算，獎勵才記在舊歌
    if (this.song()?.id !== song.id) this.videoIndex.set(0);
    this.kidId.set(kidId);
    this.song.set(song);
    this.lines.set(tokenize(lines, song, tokens));
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
      // 最難聽發音：剛停下來時唸一次答案（不是點擊，iOS 可能擋；畫面有「🔊 再聽一次」）
      if ((this.active() !== n || this.resay) && this.listenExpert())
        this.sayAnswer(this.quizQs()[n]);
      this.resay = false;
      this.active.set(n);
    }
    if (t > lines[lines.length - 1].end && !this.finished()) this.finish();
  }

  /** 切換玩法並重新出題（E）。填填看依 quizLevel、唱唱看依 singAll（練習 = 前 8 句）。影片回到開頭並暫停。 */
  setMode(m: PlayMode): void {
    if (this.makeup()) this.finishQuiz(); // 補答最後一題還在等唸完：下面會取消後續，先結算才不會掉獎勵
    this.cancelSing(); // 換玩法時丟掉進行中的錄音／辨識、停原唱
    this.sayRun++;
    const lines = this.lines(),
      song = this.song();
    this.mode.set(m);
    if (m === 'quiz' && song) {
      const qs = pickQuestions(lines, song.quiz[this.quizLevel()], song);
      this.questions.set(qs);
      // 先慢慢查好答案的字典發音（只有 dictAudio 的語言）
      this.pron.prefetch(
        qs
          .filter((q) => tokLang(q.tok, song).dictAudio)
          .slice(0, 8)
          .map((q) => q.w),
      );
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
  tapWord(t: Token): void {
    const L = tokLang(t, this.song() ?? {});
    const w = L.norm(t.s);
    if (!w) return;
    if (this.mode() === 'listen' && this.player.playing()) this.player.pause();
    const p = { ...t, s: L.show(t.s) }; // 顯示原本的字形（片假名留著）；en 的 show 就是 norm
    this.pron.say(p, L);
    this._popWord.set(p);
    this.holdPop(false);
  }

  /** 手指／滑鼠／鍵盤焦點在小視窗上時 hold=true：不自動關；離開後重新算 6 秒（WCAG 2.2.1）。 */
  holdPop(hold: boolean): void {
    clearTimeout(this.popTimer);
    if (!hold) this.popTimer = setTimeout(() => this._popWord.set(null), 6000);
  }

  closePop(): void {
    clearTimeout(this.popTimer);
    this._popWord.set(null);
  }

  private savedOffset(): number {
    const v = this.song()?.videos[this.videoIndex()];
    return v ? load('off_' + v.id, v.offset) : 0;
  }

  /** 填填看作答（A）。點擊／Enter 時同步呼叫；答對後同步唸單字，唸完（最多等 SAY_MAX_MS）才繼續播歌，聲音才不會疊在一起。 */
  answer(word: string): void {
    const n = this.active();
    const q = n === null ? undefined : this.quizQs()[n];
    if (n === null || !q || q.done) return;
    if (word !== q.w) {
      this.sfx.wrong();
      this.questions.set(this.quizQs().map((x, k) => (k === n ? { ...x, tries: x.tries + 1 } : x)));
      return;
    }
    const qs = this.quizQs().map((x, k) => (k === n ? { ...x, done: true } : x));
    this.questions.set(qs);
    this.active.set(null);
    const last = !qs.some((x) => !x.done);
    if (!last) this.sfx.correct(); // 最後一題會接慶祝音效，不要疊在一起
    const left = qs.find((x) => !x.done);
    const run = ++this.sayRun;
    // 答對唸一次單字；字典查很久或沒收到唸完事件時不能卡住
    void Promise.race([
      this.sayAnswer(q),
      new Promise((done) => setTimeout(done, SAY_MAX_MS)),
    ]).then(() => {
      if (run !== this.sayRun || this.finished()) return;
      if (!this.makeup()) this.player.play();
      else if (left) this.jumpTo(left);
      else this.finishQuiz();
    });
  }

  /** 填填看「最難」而且這首歌的最難是聽發音選字（langOf(song).expert === 'listen'）。 */
  listenExpert(): boolean {
    return (
      this.mode() === 'quiz' &&
      this.quizLevel() === 'expert' &&
      langOf(this.song() ?? {}).expert === 'listen'
    );
  }

  /** 唸題目的答案（照 token 自己的語言：日文唸讀音、日文歌裡的英文字照英文）。「🔊 再聽一次」點擊時同步呼叫。 */
  sayAnswer(q: Question): Promise<void> {
    return this.pron.say({ ...q.tok, s: q.w }, tokLang(q.tok, this.song() ?? {}));
  }

  private quizQs(): Question[] {
    return this.mode() === 'quiz' ? (this.questions() as Question[]) : [];
  }

  /** 跳回某題那句的開頭，同步 play()。🔁 再聽一次是點擊時同步呼叫；補答時是答對後等單字唸完才呼叫，不在點擊同步鏈上。 */
  jumpTo(q: Question): void {
    this.resay = true; // 最難聽發音：重播到句尾停下時再唸一次答案
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
    const song = this.song();
    const passed = qs.filter((q) => q.passed).length;
    const score = Math.round((passed / qs.length) * 100);
    const seen = new Set<string>();
    const missed: Token[] = [];
    for (const w of qs.flatMap((q) => q.result?.words ?? [])) {
      const key = wordKey(w, song ?? {});
      if (w.ok !== 'miss' || !isPractice(w, song ?? {}) || seen.has(key)) continue;
      seen.add(key);
      missed.push(w.tok ?? { s: key }); // en 照舊顯示 norm 過的字
    }
    missed.splice(8);
    this.singSummary.set({ passed, total: qs.length, score, missed });
    const kidId = this.kidId();
    if (kidId === null || !song) return;
    if (!this.singAll()) this.rewards.earn(kidId, song, 'singPractice');
    else if (score >= 80) this.rewards.earn(kidId, song, 'singAll'); // Whisper 偶爾會聽錯字，所以 80% 句子過關就算
  }

  /**
   * 「🎤 換你唸」（D）。必須在點擊當下同步呼叫 recognizer.record()，之前不能有 await。
   * 順序：同步 record() → 暫停影片 → 同步原唱 play()，之後才 await。onLevel 收 0～1 音量。
   */
  async startSing(onLevel: (level: number) => void = () => {}): Promise<void> {
    const idx = this.active();
    const stop = idx === null ? undefined : this.singStopAt(idx);
    if (idx === null || !stop || stop.state === 'rec' || stop.state === 'busy') return; // 連點不重複錄
    const run = ++this.singRun;
    const line = this.lines()[stop.i];
    const song = this.song();
    const L = langOf(song ?? {}); // 模型、評分、門檻跟歌曲語言
    this.pron.stop(); // 開始錄音前停掉單字發音
    this.patchStop(idx, { state: 'rec', msg: undefined });
    const rec = this.recognizer.record(onLevel); // 先開麥克風，再開原唱，都在點擊當下
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
      text = await this.recognizer.transcribe(audio, L);
    } catch {
      return retry('busy', '辨識失敗了，再試一次');
    }
    if (!text) return retry('busy', '好像沒聽到喔，靠近一點再唸一次 🎤');
    if (!still('busy')) return;
    const result =
      L.asr.unit === 'char'
        ? scoreChars(line.tokens, text, song ?? {})
        : scoreLine(line.text, text);
    if (result.score >= L.asr.pass) this.sfx.correct();
    this.patchStop(
      idx,
      result.score >= L.asr.pass
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
