import { Service, signal } from '@angular/core';

/** 語音辨識 pipeline（transformers.js 的回傳型別只寫用得到的）。 */
type Asr = (audio: Float32Array) => Promise<{ text: string }>;

// 變數＋@vite-ignore：不讓建置工具打包，執行期才從 CDN 載入（architecture §11 風險 1）
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/+esm';
const VOICE_RMS = 0.015; // ponytail: 固定的說話音量門檻，教室太吵或麥克風太小聲時調這個值

/**
 * 錄音＋Whisper 辨識（搬 legacy record / to16k / loadASR / transcribe）。
 *
 * iOS 規則：「🎤 換你唸」的 click handler 必須「同步」呼叫 record()，
 * 呼叫之前不能有 await、setTimeout、Promise.then，也不能改 signal 再讓 effect 去呼叫。
 * record() 自己也必須在第一個 await 之前同步做完 getUserMedia() 與 new AudioContext()，
 * 否則 Safari 會因為不在使用者手勢裡而拒絕麥克風／音訊。
 * 要先載入模型就先呼叫 load()（切到唱唱看時），不要在點擊時 await load() 再 record()。
 */
@Service()
export class SpeechRecognizer {
  /** 模型下載／準備／失敗的提示文字；'' = 沒事。 */
  readonly note = signal('');
  private actx: AudioContext | null = null;
  private stopRec: (() => void) | null = null;
  private asr: Promise<Asr> | null = null;

  /**
   * 開始錄音，回傳 16kHz 單聲道音訊；有聲音的部分太短（<0.4 秒）回傳 null（當成沒唸）。
   * onLevel 收 0～1 音量（給音量條）。點擊時同步呼叫。
   * 唸完停 1.2 秒、最長 8 秒、4 秒沒聲音就自動結束。
   */
  async record(onLevel: (level: number) => void): Promise<Float32Array | null> {
    this.stopRec?.(); // 上一次錄音還沒結束：先收掉，不開第二個 stream
    if (!navigator.mediaDevices)
      throw new Error('需要 HTTPS 網址（或在電腦上用 localhost）才能使用麥克風');
    const W = window as unknown as { webkitAudioContext?: typeof AudioContext };
    const actx = (this.actx ??= new (window.AudioContext || W.webkitAudioContext!)()); // 要在點擊當下建立，iOS 才不會擋
    void actx.resume();
    const media = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }); // 同步呼叫，await 在後面
    // 還在等麥克風權限時被 stop()：拿到 stream 後馬上關掉
    let cancelled = false;
    const cancel = (this.stopRec = () => {
      cancelled = true;
      this.stopRec = null;
    });
    const stream = await media.catch((e) => {
      if (this.stopRec === cancel) this.stopRec = null;
      throw e;
    });
    if (cancelled) {
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }
    const src = actx.createMediaStreamSource(stream);
    // ponytail: ScriptProcessorNode 已棄用，照搬舊版；瀏覽器移除時改 AudioWorklet
    const proc = actx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    const sec = 4096 / actx.sampleRate;
    let voiced = 0;
    let silent = 0;
    let total = 0;
    let ended = false;
    return new Promise((resolve) => {
      const done = () => {
        if (ended) return;
        ended = true;
        this.stopRec = null;
        proc.disconnect();
        src.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        void actx.suspend(); // 不錄時不佔音訊裝置；下次 record() 會 resume()
        if (voiced * sec < 0.4) return resolve(null); // 有聲音的部分太短：當成沒唸，避免 Whisper 亂產生文字
        const buf = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
        let o = 0;
        for (const c of chunks) {
          buf.set(c, o);
          o += c.length;
        }
        resolve(to16k(buf, actx.sampleRate));
      };
      this.stopRec = done;
      proc.onaudioprocess = (e) => {
        const d = new Float32Array(e.inputBuffer.getChannelData(0));
        chunks.push(d);
        total += sec;
        const rms = Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length);
        onLevel(Math.min(1, rms * 8));
        if (rms > VOICE_RMS) {
          voiced++;
          silent = 0;
        } else if (voiced) silent += sec;
        if ((voiced && silent > 1.2) || total > 8 || (!voiced && total > 4)) done();
      };
      src.connect(proc);
      proc.connect(actx.destination);
    });
  }

  /** 結束錄音（「✅ 唸完了」、離開畫面、換模式時）；錄到的聲音照常回傳。 */
  stop(): void {
    this.stopRec?.();
  }

  /** 載入 Whisper（切到唱唱看時呼叫，只載一次；失敗下次可重試）。含暖機。 */
  load(): Promise<Asr> {
    return (this.asr ??= (async () => {
      const url = TRANSFORMERS_URL;
      const { pipeline } = await import(/* @vite-ignore */ url);
      const files: Record<string, [number, number]> = {};
      const asr: Asr = await pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-tiny.en',
        {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: (p: {
            status: string;
            file: string;
            loaded: number;
            total: number;
          }) => {
            if (p.status !== 'progress' || !p.total) return;
            files[p.file] = [p.loaded, p.total];
            const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
            this.note.set(
              `語音模型下載中 ${Math.round((l / t) * 100)}%（只有第一次需要，約 41MB）`,
            );
          },
        },
      );
      this.note.set('語音模型準備中…');
      await asr(new Float32Array(16000)); // 先暖機一次：第一次辨識要編譯 WASM，會慢好幾秒
      this.note.set('');
      return asr;
    })().catch((e) => {
      this.asr = null;
      this.note.set('語音模型載入失敗，請確認網路後重新點「唱唱看」');
      throw e;
    }));
  }

  /** 辨識 16kHz 音訊；沒聽到東西回傳 ''。 */
  async transcribe(audio: Float32Array): Promise<string> {
    // 前後補 0.5 秒靜音：錄音一開始就是說話聲時，Whisper 會漏掉第一個字
    const padded = new Float32Array(audio.length + 16000);
    padded.set(audio, 8000);
    const t = (await (await this.load())(padded)).text.trim();
    return isHallucination(t) ? '' : t;
  }
}

/** Whisper 沒聽到東西時常冒出這些。 */
export const isHallucination = (t: string) => /^(\[.*\]|\(.*\)|thank you\.?|you\.?|\.+)$/i.test(t);

async function to16k(buf: Float32Array, sr: number): Promise<Float32Array> {
  if (sr === 16000) return buf;
  const off = new OfflineAudioContext(1, Math.ceil((buf.length * 16000) / sr), 16000);
  const b = off.createBuffer(1, buf.length, sr);
  b.copyToChannel(buf as Float32Array<ArrayBuffer>, 0);
  const s = off.createBufferSource();
  s.buffer = b;
  s.connect(off.destination);
  s.start();
  return (await off.startRendering()).getChannelData(0);
}
