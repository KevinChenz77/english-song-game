import { Service } from '@angular/core';

/**
 * 錄音＋Whisper 辨識（第二波實作，搬 legacy record / to16k / loadASR / transcribe）。
 *
 * iOS 規則：「🎤 換你唸」的 click handler 必須「同步」呼叫 record()，
 * 呼叫之前不能有 await、setTimeout、Promise.then，也不能改 signal 再讓 effect 去呼叫。
 * record() 自己也必須在第一個 await 之前同步做完 getUserMedia() 與 new AudioContext()，
 * 否則 Safari 會因為不在使用者手勢裡而拒絕麥克風／音訊。
 * 要先載入模型就先呼叫 load()（切到唱唱看時），不要在點擊時 await load() 再 record()。
 */
@Service()
export class SpeechRecognizer {
  /** 開始錄音，回傳 16kHz 單聲道音訊；onLevel 收 0～1 音量（給音量條）。點擊時同步呼叫。 */
  record(onLevel: (level: number) => void): Promise<Float32Array> {
    void onLevel;
    return Promise.reject(new Error('SpeechRecognizer.record: 第二波實作'));
  }

  /** 停止錄音（離開畫面、換模式時）。 */
  stop(): void {
    /* 第二波實作 */
  }
}
