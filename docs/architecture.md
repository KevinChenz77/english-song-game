# 唱歌學英文：Angular 版架構

> 功能規格 = `legacy/index.html`（舊 demo，約 1100 行）。Angular 版要**行為完全一致**，有疑問以舊版為準（容易漏的細節見 §5.5）。
> 原則：最簡單可行、不做沒要求的抽象、平台內建優先（`<dialog>`、`prompt()`、`confirm()`、Web Audio、`speechSynthesis`、CSS 動畫），**不加 UI 套件、不加狀態管理套件**。
> API 規格以 TPM 的 **API contract v2** 為準；與本文件衝突時以它為準。

## 0. 設計審查後的 PO 決定（2026-11-01，已反映到下面各節）

1. **歌詞和整句翻譯改從我們的後端拿**：`GET ${apiBaseUrl}/api/songs/{songId}/content` → `{ lrc, translations }`。前端不再呼叫 LRCLIB、MyMemory；`Lyrics`、`Translation` 服務取消，改為 `Api.content()`（§4）。家長在本機修改的翻譯仍存 `tr_<songId>`，**覆蓋**伺服器翻譯。歌詞與譯文不放進儲存庫任何檔案（版權＋公開 repo）。
2. **填填看題目單字每首歌手動列**：`song.quiz = { normal: string[], hard: string[], expert: string[] }`（10／18～20／18～20 字）。出題規則見 §5.1（取代舊的規則推導）。
   - ⚠️ `letitgo.json` 的 `quiz` 是**暫用清單**：用 legacy 規則對目前 LRCLIB 歌詞實際跑出來的字（含重複的 `go`、`let`），等教育顧問的正式清單替換。
3. **名字長度**：小朋友名字、雲端存檔名字都是去空白後 **1～10 字**（`[...s].length`）。密碼 4～64 不變。
4. **星星分歌顯示**（不再跨歌加總；`totalStars` 不搬）；**貼紙每首歌都能拿**：一首歌一個 🎤／👑／專屬貼紙，`kid.stickers` 可重複。
5. **網域**：舊版進度用 💾 雲端存檔搬到新版，不寫搬移程式。
6. **💾 存檔按鈕要和同一列的其他按鈕上下對齊**：做法見 §3「第一列對齊」。

---

## 1. 專案結構

```
english song/
├─ legacy/index.html     # 舊 demo（規格，不再修改）
├─ backend/              # 只提供 /api/save、/api/load、/api/health
├─ frontend/             # Angular 專案（靜態網站）
└─ docs/architecture.md
```

| | frontend | backend |
|---|---|---|
| 負責 | 所有畫面、遊戲邏輯、歌曲資料（`public/songs/`）、外部 API（YouTube、字典、Whisper） | 帳號＋存檔 API、歌詞＋翻譯 API（content.db）、密碼雜湊、限流、CORS（`ALLOWED_ORIGINS`，預設 `http://localhost:4200`，已完成） |
| 部署 | Railway 服務 A（靜態檔） | Railway 服務 B（見 §12） |
| 本機開發 | `ng serve` → http://localhost:4200 | 埠 **8001**（8000 被舊 demo 的靜態伺服器佔用） |

### `ng new` 指令（在專案根目錄執行，會建立 `frontend/`）

```bash
ng new frontend \
  --style=css --routing --ssr=false --zoneless \
  --test-runner=vitest --ai-config=claude-code \
  --skip-git --prefix=app --interactive=false
```

- `--ssr=false`：家用、純前端的互動遊戲，要用麥克風、AudioContext、YouTube iframe、localStorage，全部只在瀏覽器存在；不需要 SEO。開 SSR 只會多一個 Node 伺服器、到處要包 `isPlatformBrowser`。
- `--style=css`：舊版就是純 CSS（自訂屬性、`@property`、keyframes），美術動效也用原生 CSS。
- `--zoneless`：v22 預設，明寫只是保險。狀態全部用 signals。
- `--test-runner=vitest`：v22 預設。
- `--ai-config=claude-code`：本機 CLI 22.2 的選項名稱是 `claude-code`。
- `--skip-git`：git 放在專案根目錄（frontend 與 backend 同一個 repo）。
- 檔名用預設 2025 風格：`kid-picker.ts` / class `KidPicker`，無 `.component` 後綴；型別檔用 `.model.ts`。
- 實際執行（Angular CLI 22.2.1）：上面的參數與 `ng new --help` 完全相符，原樣執行即可。元件用 `ng g component features/<區>/<名> --flat`、服務用 `ng g service core/<名>`、型別用 `ng g interface core/models/<名> --type=model` 產生。

---

## 2. 路由

`app.config.ts`：`provideRouter(routes, withComponentInputBinding())`、`provideHttpClient()`（v21 起預設就用 fetch，不寫 `withFetch()`）。

| 網址 | 畫面 | 載入方式 | 說明 |
|---|---|---|---|
| `/` | `KidPicker` 選小朋友 | 直接載入 | 首頁 |
| `/help` | `Help` 遊戲說明 | `loadComponent` | |
| `/kids/:kidId` | `SongList` 選歌 | 直接載入 | guard：kid 不存在 → 回 `/` |
| `/kids/:kidId/play/:songId` | `Play` 遊玩 | `loadComponent`（最大的一塊，含唱唱看） | guard 同上；歌不在 `songs/index.json`（或清單讀不到）→ 回選歌 |
| `**` | → `/` | | |

- kidId 放網址，重新整理不會掉人，不需要另存「目前小朋友」。
- guard 寫成 `app.routes.ts` 裡的一個 `CanActivateFn`：先 `Number(route.paramMap.get('kidId'))`，不是有限數字或 `KidsStore.byId()` 找不到 → `router.parseUrl('/')`。元件端用 `kidId = input.required({ transform: numberAttribute })`。
- 玩法、難度、影片版本不放網址，放在 `PlaySession`（舊版離開再回來會沿用上次的玩法）。
- 正式環境用 path 路由，靜態主機要設「找不到的路徑回 `index.html`」（§12）。

---

## 3. 元件

全部 standalone、OnPush（v22 預設）、`input()`/`output()`、`@if/@for/@switch`、`inject()`。selector 前綴 `app-`。

```
src/app/
├─ app.ts / app.html / app.css      # 外框：<router-outlet>、💾 存檔按鈕、<app-cloud-dialog>、<app-celebration>
├─ app.routes.ts / app.config.ts
├─ core/        # 服務、純函式、型別（§4、§5）
├─ shared/
│  ├─ song-card.ts                  # 曲子小卡（emoji、標題、星星字串、👑、gold 金框）。選歌與說明頁共用
│  └─ celebration.ts                # 慶祝畫面（讀 Rewards.celebration signal；連續獲得時疊加文字）
└─ features/
   ├─ kids/kid-picker.ts            # 小朋友卡片、✕ 刪除（confirm）、新增表單＋頭像選擇、❓ 📥 按鈕
   ├─ help/help.ts                  # 說明文字、獎勵表、5 張範例小卡（用 SongCard）
   ├─ songs/song-list.ts            # 「嗨 🐱 小明」、歌曲卡片清單、我的貼紙
   ├─ cloud/cloud-dialog.ts         # 存檔／匯入 <dialog>＋同名比較 <dialog>
   └─ play/
      ├─ play.ts                    # 遊玩容器：分頁、影片區（含透明遮罩 shield）、▶ 按鈕、狀態訊息、家長設定 <details>、歌詞載入失敗＋重試
      ├─ lyrics-panel.ts            # 歌詞：目前句高亮＋自動捲動、卡拉 OK 逐字亮、空格、▶ seek、單字 chip、中文（家長模式可改）
      ├─ word-pop.ts                # 點單字的小視窗（6 秒自動關；指標或鍵盤焦點在上面時不關〔holdPop〕、🔊 重播）
      ├─ quiz-panel.ts              # 填填看：難度選擇、選擇題、最難打字題、結果
      └─ sing-panel.ts              # 唱唱看：練習／挑戰選擇、音量條、逐字著色、過關／重試／跳過、總結
```

**不用 `@defer`**：`Play` 整條路由已經 lazy 載入；`PlaySession` 靜態 import `SpeechRecognizer`，在 Play 裡 defer `sing-panel` 也拆不出東西。真正大的 Whisper（transformers.js 4.3.1＋英文約 41MB／日文約 80MB 模型）本來就在執行期從 CDN 動態載入，不進 bundle。

### 家長設定
直接寫在 `play.html` 的 `<details>`，`(toggle)` 同步到 `session.parentOpen`，`lyrics-panel` 依此決定中文能不能點（`prompt()` 修改）。不另拆元件。

### cloud-dialog（Signal Forms）
- 名字、密碼用 `form()`＋`validate()`，規則直接用 `core/game/text.ts` 的 `nameOk()`（去空白後 **1～10 字**，`[...s].length`，emoji 算 1 個字）與 `passwordOk()`（4–64，不 trim）。與後端（API v2）一致；`kid-picker` 新增小朋友也用同一個 `nameOk()`（`KidsStore.add()` 內也會再檢查）。
- 同名比較：對每位同名玩家依序 `await` 一個 Promise，第二個 `<dialog>` 的 `close` 事件 resolve；Esc＝保留這台。

### iOS 手勢規則（所有元件都適用）
`player.play()`、`new AudioContext()`、單字發音的靜音解鎖，**必須在點擊事件的同步呼叫鏈裡**執行。
- 不可以「點擊 → 改 signal → `effect` 再播放」。
- 最難模式打字題：`submit()` 是**同步**函式（`(keydown.enter)` 與「確定」按鈕都直接呼叫），比對答案後同步呼叫 `session.answer()`，`answer()` 內同步唸單字。中間不能有 `await`、`setTimeout`、Promise。
- 選擇題、「下一句」、「再聽一次」同理。
- **例外：填填看答對後等單字唸完才 `player.play()`**（最多等 3 秒），單字才不會和歌疊在一起。這個 `play()` 不在點擊同步鏈上；若 iOS 擋下，小朋友可按 ▶ 播放。
- 唱唱看「🎤 換你唸」：click handler **同步**呼叫 `SpeechRecognizer.record()`，之前不能有任何 `await`（模型要先在切到唱唱看時 `load()`，不要點擊時 `await load()` 再錄）。`record()` 本身也要在第一個 `await` 前同步做完 `getUserMedia()` 與 `new AudioContext()`。介面與註解已寫在 `core/speech-recognizer.ts`。

### 第一列對齊（💾 存檔）
💾 放在 `app.html` 外框（`.shell` 是 `position: relative`、`max-width: 1100px`、`padding: 16px`），`.save` 絕對定位在右上、高 `--top-row`（56px）並垂直置中。每個畫面的**第一個元素一律是 `<div class="bar">`**（`styles.css`）：`min-height: --top-row`、`align-items: center`、右邊留 110px；直接放在 `.bar` 裡的按鈕上下各補 4px、其他子元素（h1、分頁、星星）撐到 56px 置中。所以不管換不換行，第一行的中心線都和 💾 一樣（已在 375px 與 1200px 寬實測：中心都在 y=44）。第二波改畫面時不要拿掉 `.bar` 或改它的 margin-top。

---

## 4. 服務

全部 `@Service()`（root 單例）。讀資料優先 `httpResource`；有快取／備援／重試邏輯的才寫在服務裡用 `HttpClient`，元件端用 `resource()` 接。

| 檔案（`core/`） | Class | 責任 |
|---|---|---|
| `app-config.ts` | `APP_CONFIG`（InjectionToken）、`checkConfig()` | 執行期設定 `{ apiBaseUrl }`（§6） |
| `storage.ts` | （函式）`load(k, d)`／`save(k, v)` | localStorage JSON 讀寫，全部 try/catch。純函式 |
| `kids-store.ts` | `KidsStore` | `kids` signal、`byId()`、`add()`（`nameOk` 檢查）／`remove()`／`update(id, fn)`；每次變更產生新陣列並寫回 `kids`；啟動時跑 `rewardsV2` 一次性歸零。匯入合併由 cloud-dialog 用 `add()`／`update()` 組 |
| `song-catalog.ts` | `SongCatalog` | `ids()`：`HttpClient` 讀 `songs/index.json`（Promise 快取，失敗不快取），**guard 用它判斷歌是否存在**；`songs`：`resource()` 抓清單上每首 json，給選歌畫面；`dict(code)`：`HttpClient` 讀 `songs/dict.<code>.json`（每個語言一個 Promise 快取，失敗不快取、回 `{}`；`Play` 依歌曲用到的語言各抓一份）。**沒有** `song(id)` 方法——單首歌由 `Play` 元件自己的 field `httpResource(() => \`songs/${songId()}.json\`)` 建立 |
| `api.ts` | `Api` | 後端：`save()`／`load()`（`POST ${apiBaseUrl}/api/save|load`，HTTP 狀態 → 中文訊息，見 §5.5）、`content(songId)`（`GET /api/songs/{id}/content` → `parseLrc` ＋ 翻譯疊上本機 `tr_<songId>`；404 →「這首歌的歌詞還沒準備好」、其他 →「歌詞抓不到…」）。失敗一律丟 `Error(中文訊息)`。`Play` 用 field `resource({ params: songId, loader: api.content })`，重試＝`reload()` |
| `translations.ts` | （函式）`localTranslations(songId)`／`saveTranslation(songId, line, zh)` | 家長修改的翻譯（`tr_<songId>`） |
| `pronunciation.ts` | `Pronunciation` | `say(word)`：Free Dictionary → Wikimedia Commons mp3（`aud2` 快取，`''`=查過沒有；網路錯誤不記）→ 失敗用 `speechSynthesis`（挑自然聲音、避開趣味聲音、rate 0.8）。含 iOS 首次 pointerdown 靜音解鎖、`prefetch(words)` 每 500ms 查一個 |
| `youtube-player.ts` | `YoutubePlayer` | 見下 |
| `speech-recognizer.ts` | `SpeechRecognizer` | `record(onLevel)`（RMS 0.015、停 1.2 秒／最長 8 秒／4 秒沒聲音、有聲 <0.4 秒視為沒唸）、`to16k`、`load(lang)`（CDN import、模型跟歌曲語言 `lang.asr`、只留一個模型、進度 `note` signal、暖機；失敗可重試）、`transcribe(audio, lang)`（前後補 0.5 秒靜音、多語模型固定 `language`、過濾 `lang.asr.junk`）、`stop()` |
| `rewards.ts` | `Rewards` | `earn(kidId, song, key)`：每首歌每項只拿一次、加貼紙（每首歌各一份）、存檔、推送 `celebration` signal（連續獲得時文字疊加）；`dismiss()` |
| `play-session.ts` | `PlaySession` | 遊玩狀態與流程（見下） |

### `YoutubePlayer`（不依賴 PlaySession，沒有循環依賴）
```ts
create(el: HTMLElement, videoId: string, onTick: (t: number) => void, onEnded: () => void): void
destroy(): void      // player.destroy()、clearInterval、ready/playing 設回 false
play() / pause() / seek(t) / cue(videoId) / currentTime()
ready / playing / error   // signals
```
- `iframe_api` script 由共用的 `core/youtube-api.ts` `loadYouTubeApi()` 插入（只插一次，唱唱看背景原唱也用）；`onReady` 後每 100ms 呼叫 `onTick(currentTime)`。
- `Play` 元件在自己的歌曲設定＋歌詞都載入（`song.hasValue() && content.hasValue()`，effect 已先 `open()`）後，以 `afterRenderEffect` 呼叫 `create(el, id, t => session.onTick(t), () => session.finish())`（以 `createdFor = song.id` 記錄，每首歌一次；`videoIndex` 用 `untracked` 讀），並用 `inject(DestroyRef).onDestroy(() => player.destroy())`。離開畫面再回來是全新的 player、全新的計時器，不殘留 `ready`。
- 兩個 callback 由 `Play` 傳入，所以 `YoutubePlayer` 不 inject `PlaySession`。

### `PlaySession`（遊玩流程的唯一真相）
舊版 `setMode / tick / answer / finishQuiz / nextStop / startSing / finishSing` 的全域變數集中在這裡。它 inject `YoutubePlayer`、`Rewards`、`Pronunciation`、`SpeechRecognizer`；反過來沒有人 inject 它以外的東西互相呼叫。

- 可寫 signals：`song`、`lines`、`lyricsError`、`mode`、`quizLevel`、`singAll`、`videoIndex`、`offset`、`time`（onTick 寫入的歌詞時間）、`questions`、`active`（題目 index）、`heard`、`makeup`、`finished`、`singSummary`、`parentOpen`。
- `computed`：`currentLine`（**只有這一個來源**，由 `time` 推出）、卡拉 OK 已唱字數、星星字串。
- `onTick(t)`：寫 `time`，依 `currentLine` 變化記錄 heard（一次最多跳 3 句）、聽完 80% → `earn('listen')`、到句尾 −0.15 秒暫停並設 `active`、超過最後一句 → `finish()`。**流程不用 `effect` 驅動**。
- `open(song)`：重設本局狀態；換了歌（`song.id` 不同）時 `videoIndex` 設回 0，`offset` 讀 `off_<videoId>` 或該影片預設值。`mode`、`quizLevel`、`singAll` 沿用。
- root 單例的理由：保留上次的玩法／難度；它不握 DOM，player 的生命週期由 `Play` 管。

### 狀態更新規則（zoneless＋OnPush，必守）
`questions`、`heard`、`singSummary` 等陣列／物件 signal **一律用 `set()`／`update()` 產生新陣列、新物件**，例如
`questions.update(qs => qs.map((q, n) => n === i ? { ...q, done: true } : q))`、`heard.update(s => new Set(s).add(k))`。
禁止 `q.done = true`、`qs.push()`、`set.add()` 就地修改——畫面不會更新。`active` 存 index 而不是物件參考，避免更新後指到舊物件。

---

## 5. 資料模型

`core/models/` 下：`song.model.ts`、`kid.model.ts`、`save-data.model.ts`。

```ts
// song.model.ts
export interface SongVideo {
  id: string;        // YouTube videoId
  label: string;     // 下拉選單顯示，例如「Sing-Along 版」
  offset: number;    // 預設歌詞時間差（秒）；>0 = 歌詞延後顯示
}
export interface Song {
  id: string;        // 檔名＝id，只能 [a-z0-9-]
  title: string; artist: string; from: string; emoji: string;
  videos: SongVideo[];             // 第一支為預設
  sticker: string;                 // 填填看「挑戰」全對的專屬貼紙
  quiz: Record<QuizLevel, string[]>; // 每個難度手動列的題目單字（普通 10、挑戰 18～20、最難 18～20）
  dict?: Record<string, string>;   // 這首歌專用／覆蓋共用字典的解釋
}
// 歌詞與翻譯不在 Song 裡（版權），由 Api.content() 從後端拿
export interface LyricLine { t: number; end: number; text: string }
export interface SongContent { lines: LyricLine[]; translations: Record<string, string> }
export type QuizLevel = 'normal' | 'hard' | 'expert';
export type PlayMode = 'listen' | 'quiz' | 'sing';

// kid.model.ts
export type RewardKey = 'listen' | 'quizNormal' | 'quizHard' | 'expert' | 'singPractice' | 'singAll';
export type SongProgress = Partial<Record<RewardKey, true>>;
export interface Kid {
  id: number;                          // Date.now()，只在本機用，不上傳
  name: string; avatar: string;
  songs: Record<string, SongProgress>; // key = song.id
  stickers: string[];                  // 依獲得順序，可重複
}

// save-data.model.ts（雲端存檔格式，跟後端約定）
export type SavedPlayer = Omit<Kid, 'id'>;
export interface SaveData { version: 1; savedAt: string; players: SavedPlayer[] }
```

### 5.1 填填看出題（PO 決定：每首歌手動列字）
`song.quiz.normal`（10 字）／`hard`（18～20 字）／`expert`（18～20 字）由教育顧問挑。`core/game/quiz.ts` 的 `pickQuestions(lines, song.quiz[level])`：
- 依清單順序，每個字找**第一句「包含這個字（`norm` 後整詞相同）、而且還沒被用過」**的歌詞出題；同一個字列兩次就會找兩句不同的。
- 找不到就略過並 `console.warn`（所以題數可能少於清單字數，內容工程師看 console 修清單）。
- 結果依句子順序排列。
- 選項：答案＋同一個難度清單裡的 2 個干擾字（去重、不含答案），洗牌。
- 舊版的 QUIZ_POOL、EASY/HARD_WORDS、每字最多 2 次、題目間隔規則全部取消。
- ⚠️ `public/songs/letitgo.json` 的 `quiz` 是**暫用清單**（legacy 規則對目前 LRCLIB 歌詞實際產生的字），教育顧問的正式清單出來後直接替換該 JSON。

### 5.2 單字中文字典
- `public/songs/dict.<lang>.json`（英文＝`dict.en.json`）：同一個語言**所有歌共用**的 `{ word: 中文 }`（舊版 `DICT` 全部搬進 `dict.en.json`）。多語言見 [multilingual.md](multilingual.md)。
- `song.dict`：這首歌專屬的解釋（例如 `"let": "讓（let it go = 放手）"`），覆蓋共用字典。
- STOP 字是遊戲規則，留在 `core/game/text.ts`。

### 5.3 歌曲資料放前端 `public/songs/`
```
public/songs/index.json   # ["letitgo", ...]  選歌畫面的順序
public/songs/letitgo.json # Song
public/songs/dict.en.json # 共用字典（每個語言一個 dict.<lang>.json）
```
理由：公開的靜態內容，不需權限；跟著前端版本發佈、走快取。加歌＝加 json＋改 index.json＋重新部署前端，**再**由內容工程師把歌詞與翻譯放進後端 content.db（`POST /api/admin/content`）。
**歌詞與翻譯絕對不放進 `public/` 或任何 commit 的檔案。**
> ponytail：index 只列 id、選歌時每首 json 都抓；超過幾十首再讓 index 帶卡片摘要。

### 5.3.1 新增歌曲
步驟清單、`<id>.json` 欄位說明、不能 commit 的東西：見 **[adding-a-song.md](adding-a-song.md)**。
- 加歌只動資料：`public/songs/<id>.json`、`index.json`、`dict.<lang>.json`＋重建上傳 content.db（**整檔替換，必須含所有歌**）。程式碼不得出現特定歌曲 id 或歌曲數量。
- `core/songs-data.spec.ts` 檢查 index.json 裡每首歌（檔案、id、欄位、影片、題數、字典、貼紙不重複），`ng test` 不過不能合併。
- 歌曲 id 上線後不能改名（進度 `kid.songs[id]`、`tr_<id>` 都用它當 key）。

### 5.4 存檔與匯入
`core/game/save-data.ts`：`buildSave(kids)`（不含 id）、`cleanSave(data)`（不可信資料，格式錯回 null、丟掉怪的 songs／stickers）、`sameName(kids, name)`（去空白比對；後端名字不分大小寫，前端比對維持舊版的區分大小寫）。

### 5.4.1 獎勵顯示（PO 決定）
- 星星**分歌顯示**：每首歌用 `starStr(kid.songs[id])`；`totalStars` 不搬。同名比較 dialog 列各歌星星。
- 例外（TPM 決定，照舊版）：**小朋友卡片顯示所有歌的星星總數** `⭐ N`（`kid-picker.ts` 的 `stars()`）；選歌畫面仍是各歌星星。
- 貼紙每首歌都能拿：`Rewards.earn()` 以 `kid.songs[song.id][key]` 判斷，所以每首歌各給一次 🎤／👑／`song.sticker`，`kid.stickers` 依獲得順序累積、可重複。

### 5.5 必須照舊版保留的細節（容易漏）
- **填填看換難度**：只有「還沒答任何一題」或「這局已結束」才顯示難度按鈕，答到一半不能換。
- **填填看結算**：要全部「一次答對」（`tries === 0`）才給獎勵；成績一定顯示。拖進度條跳過的題目，最後進入補答（`makeup`）逐題跳回去問。
- **唱唱看練習模式**：同一句失敗 3 次後，跳過按鈕文字變「⏭ 跳過（不扣分）」；挑戰模式一律「⏭ 先跳過」。
- **唱唱看過關後重唱**：保留 `passed`，重唱沒過也不取消過關。
- **唱唱看結算**：練習唸完即得 🎤；挑戰 80% 句子過關得 ⭐＋👑。總結不顯示分數。
- **換歌**：`videoIndex` 重設為 0（§4 `open`）。
- **歌詞抓不到**：`play.ts` 顯示 `content.error().message`（「歌詞抓不到 😢 請確認網路後再試一次。」；後端 404 時為「這首歌的歌詞還沒準備好 😢」）＋「重試」按鈕 → `content.reload()`。
- **影片無法播放**：顯示「這支影片沒辦法在這裡播放，請在上面換另一個影片版本。」
- **雲端錯誤訊息**（舊版 `MSG` 再加兩個）：

| 狀態 | 存檔 | 匯入 |
|---|---|---|
| 400 | 名字要 1～10 個字、密碼至少 4 個字 | 同左 |
| 401 | 這個名字已經有人用了，或密碼不對 | 密碼不對喔 |
| 404 | — | 找不到這個名字的存檔 |
| 413 | 存檔太大了，請聯絡家長或管理者 | — |
| 429 | 錯太多次了，請 10 分鐘後再試 | 同左 |
| 500 | 存檔伺服器出了點問題，請稍後再試 | 同左 |
| 0（網路） | 存檔伺服器連不到，請稍後再試 | 同左 |

---

## 6. 執行期設定（API 網址）

**評估**：只有一個正式環境時，`environment.ts`（建置時替換）確實更簡單——少一次 fetch、少一個 token、沒有「讀不到設定」的錯誤路徑。但需求明確要求「換網址不重編譯」，且 Railway 換後端網域（或之後加 staging）時只改環境變數最省事。**選執行期設定**，做法只有幾行：

```ts
// public/config.json（開發用，直接指本機後端；後端 CORS 預設已允許 http://localhost:4200）
{ "apiBaseUrl": "http://localhost:8001" }

// main.ts（實際程式見 src/main.ts）
fetch('config.json', { cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error(`config.json ${r.status}`); return r.json(); })
  .then(checkConfig)                       // 缺 apiBaseUrl 丟錯；去掉結尾 /
  .then(
    cfg => bootstrapApplication(App, { ...appConfig, providers: [...appConfig.providers, { provide: APP_CONFIG, useValue: cfg }] })
      .catch(fail('程式啟動失敗，請重新整理，還是不行請聯絡管理者。')),   // bootstrap 本身失敗
    fail('設定檔讀不到，請重新整理或聯絡管理者。'),                       // config.json 讀不到／格式錯
  );
```

- 設定鍵名是 **`apiBaseUrl`**（TPM 指定；原稿的 `apiUrl` 已改）。部署的環境變數仍叫 `API_URL`，寫入時轉成 `{"apiBaseUrl": "$API_URL"}`。
- **讀不到或缺 `apiBaseUrl` 一律明確報錯、不啟動**，不默默用空字串。config 錯誤與 bootstrap 失敗**分開顯示不同訊息**（Reviewer 第二次審查），兩者都 `console.error` 原始錯誤。
- 部署：前端啟動指令先用環境變數覆寫輸出資料夾裡的 `config.json`；`API_URL` 沒設就讓啟動失敗（§12）。
- 不需要 dev proxy（後端已開 CORS）。

---

## 7. localStorage

**鍵名完全沿用舊版，不加前綴、不搬移。**

| 鍵 | 內容 | 寫入者 |
|---|---|---|
| `kids` | `Kid[]` | `KidsStore` |
| `rewardsV2` | `true`：獎勵改版歸零已做過 | `KidsStore`（啟動檢查，沒有就清空每人 songs／stickers，保留名字頭像） |
| `tr_<songId>` | `{ 英文句: 中文 }`（家長修改；覆蓋後端翻譯） | `translations.ts`（`saveTranslation`），`Api.content()` 讀 |
| `aud2` | `{ word: mp3網址 \| '' }` | `Pronunciation` |
| `off_<videoId>` | 該影片的歌詞時間差（家長調過才有） | `PlaySession` |
| `cloudName` | 上次輸入的雲端名字（不存密碼） | `CloudDialog` |

- **localStorage 綁網域。** Angular 版若換了網址，舊進度「看不到」。格式相容，所以：
  1. 新版用跟舊版**相同的網域** → 零搬移；或
  2. 換網域 → 家長在舊版 💾 存檔、到新版 📥 匯入（現成功能，不寫搬移程式）。→ **PO 已決定採 2**（§0）。

---

## 8. 測試策略

- 工具：Vitest（v22 預設）＋ `TestBed`，zoneless 寫法（Act → `await fixture.whenStable()` → Assert）。`ng test`。
- 純函式全放 `core/game/`，不碰 DOM／Angular。先把舊版 `#test` 的每條 `console.assert` 原樣搬成測試。

| 檔案 | 一定要測 |
|---|---|
| `lrc.spec.ts` | 時間解析、空白行略過、排序、`end` 規則 |
| `quiz.spec.ts` | `pickQuestions`（§5.1 新規則）：句子不重複用、同字兩次找兩句、依句子排序、干擾字來自同一清單、找不到略過＋warn、選項 3 個含答案。舊版 `#test` 的同一組字改為預期 3 題（新規則無間隔限制，`cold` 也會出題） |
| `scoring.spec.ts` | `scoreLine`：全對、near 半分、miss、縮寫展開、連字號、空字串；`charDist` |
| `text.spec.ts` | `norm`、`lookup`（複數退回原形）、`nameOk`（1～10 字、emoji、空白）、`passwordOk` |
| `save-data.spec.ts` | `buildSave` 不含 id；`cleanSave` 各種壞資料；`sameName` 去空白 |
| `reward-rules.spec.ts` | `starCount`、星星字串（⭐☆ 與 👑）、專屬貼紙 |

服務測試（只測有分支的）：
- `play-session.spec.ts`：`{ provide: YoutubePlayer, useValue: fakePlayer }`（記錄 play/pause/seek 呼叫）、假的 `Rewards`／`SpeechRecognizer`，直接呼叫 `onTick(t)` 推進時間，驗證：到句尾會 pause 並設 `active`；答對後 play；跳過的題目在最後進入補答並 seek 回去；全一次答對才 `earn`、有錯不 earn；答過題後不能換難度；換歌時 `videoIndex` 歸零；聽完 80% earn('listen') 只一次。
- `api.spec.ts`：`HttpTestingController` 驗 save／load 的 200／401／404／413／429／500／網路錯誤 → 訊息；`content()` 解析＋本機翻譯覆蓋、404／500 訊息；`checkConfig`。
- `rewards.spec.ts`：`rewardsV2` 只跑一次、`add()` 名字長度、`earn()` 每首歌每項一次、貼紙每首歌各一份、慶祝文字疊加。

元件、真的 YouTube、麥克風、Whisper 不寫單元測試；改用**手動驗收清單**（照 §5.5 與舊版功能，在 iPad Safari＋桌面 Chrome 逐項點一次）。E2E 先不做。

---

## 9. 搬移對照表（legacy/index.html → Angular）

| 舊版（行號約略） | 新檔案 |
|---|---|
| `<style>`（8–131） | `src/styles.css`（共用變數、按鈕、card、gold、dialog）＋各元件 `.css` |
| `SONG`（250） | `public/songs/letitgo.json` |
| `DICT`（261） | `public/songs/dict.en.json`（`let`、`go` 的特殊解釋放 `letitgo.json` 的 `dict`） |
| `STOP`（285） | `core/game/text.ts` |
| `QUIZ_POOL`、`EASY_WORDS`、`HARD_WORDS`（287–295） | 取消（改 `song.quiz` 手動清單，§5.1） |
| `QUIZ_LEVELS` 的標籤文字（289） | `quiz-panel.ts`（第二波） |
| `store`（298） | `core/storage.ts` |
| `kids`、`saveKids`、`prog`、`rewardsV2`（302–310） | `core/kids-store.ts` |
| `norm`、`lookup`、`shuffle`（315–317） | `core/game/text.ts` |
| `$`、`el`、`show`（313–318） | 刪除（改模板與路由） |
| `parseLRC`（320） | `core/game/lrc.ts` → `parseLrc` |
| `pickQuestions`（332） | `core/game/quiz.ts` |
| `fetchJSON`（350） | 取消（後端同源可控，失敗顯示重試按鈕） |
| `loadLyrics`、`translateAll`（357–385） | `core/api.ts` 的 `content()`（後端提供歌詞＋翻譯） |
| `setZh`、`editZh`、`TR`（386–395） | `core/translations.ts`（`prompt()` 在 `lyrics-panel.ts`） |
| `pickVoice`…`speak`（397–455） | `core/pronunciation.ts` |
| `record`、`to16k`、`VOICE_RMS`（458–495） | `core/speech-recognizer.ts` |
| `loadASR`、`transcribe`、`asrNote`（497–524） | `core/speech-recognizer.ts` |
| `EXPAND`、`charDist`、`scoreLine`（527–558） | `core/game/scoring.ts` |
| `AVATARS`、`renderKids`、新增表單（561–590） | `features/kids/kid-picker.ts`（`AVATARS` 放 `core/game/avatars.ts`，`cleanSave` 也用） |
| `starStr`、`openSongs`（593–603） | `features/songs/song-list.ts`、`shared/song-card.ts`；`starStr` → `core/game/reward-rules.ts` |
| `toHelp` 範例小卡（606–623） | `features/help/help.ts` |
| `openPlay`（629）含歌詞重試 | `features/play/play.ts`＋`PlaySession.open()` |
| `onYouTubeIframeAPIReady`、`makePlayer`（642–656） | `core/youtube-player.ts`（`create/destroy`） |
| shield、`playBtn`、`toSongs`（657–659） | `play.html` |
| `vidSel`、`setOffset`、`offM/offP`（660–671） | `play.html` 家長設定＋`PlaySession.setVideo()/setOffset()` |
| `setMode`（674） | `PlaySession.setMode()` |
| `renderLyrics`（691） | `features/play/lyrics-panel.ts` |
| `tapWord`、`pop`（722–732） | `features/play/word-pop.ts`＋`PlaySession.tapWord()` |
| `tick`（734） | `PlaySession.onTick()`＋`currentLine` computed；捲動用 `lyrics-panel` 的 `afterRenderEffect` |
| `renderQBox`、`renderTyping`、`answer`、`jumpTo`、`finishQuiz`（766–855） | `features/play/quiz-panel.ts`（畫面，同步 submit）＋`PlaySession.answer()/finish()` |
| `renderSing`、`startSing`、`nextStop`、`finishSing`（858–947） | `features/play/sing-panel.ts`＋`PlaySession.startSing()/nextStop()/finish()` |
| `REWARDS`、`STAR_KEYS`、`starCount`（950–974） | `core/game/reward-rules.ts`（`totalStars` 不搬，星星分歌顯示） |
| `earn`、`#cele`（960–973） | `core/rewards.ts`＋`shared/celebration.ts` |
| `buildSave`、`sameName`、`cleanSave`（978–990） | `core/game/save-data.ts` |
| `len`（991） | `core/game/text.ts`（＋`nameOk`、`passwordOk`） |
| `MSG`、`NET_ERR`、`postJSON`（993–1004） | `core/api.ts`（加 413、500） |
| `openCloud`、`cloudForm.onsubmit`、`askWhich`、`#cloud`、`#ask`（1005–1060） | `features/cloud/cloud-dialog.ts` |
| `#saveBtn` | `app.html` |
| `#test`（1065–1084） | `core/game/*.spec.ts` |
| `<script src=iframe_api>` | `YoutubePlayer.create()` 首次插入 |

---

## 10. 實作分工與順序

**第 0 步（1 人，半天）**：`ng new`、`models/*.model.ts`、`storage.ts`、`app-config.ts`＋`main.ts`＋`public/config.json`、`app.routes.ts`（含 guard，元件先空殼）、`styles.css` 搬共用 CSS、`PlaySession` 與 `YoutubePlayer` 的欄位與方法簽名（空實作）；驗證 CDN 動態 import 在 `ng build`／`ng serve` 都能過（§11 風險 1）。

**第 1 步（同時進行，檔案不重疊）**

| 人 | 範圍 | 檔案 |
|---|---|---|
| A | 純函式＋測試 | `core/game/*` |
| B | 外部 API 服務 | `lyrics.ts`、`translation.ts`、`pronunciation.ts`、`song-catalog.ts` |
| C | 選人／選歌／說明／存檔 | `kids-store.ts`、`rewards.ts`、`cloud-save.ts`、`kid-picker`、`song-list`、`help`、`song-card`、`celebration`、`cloud-dialog` |
| D | 錄音＋Whisper | `speech-recognizer.ts`（先做獨立測試頁驗證 iOS） |
| 內容工程師 | 歌曲資料 | `public/songs/*.json` |

**第 2 步（依賴 A、B）**

| 人 | 範圍 |
|---|---|
| E | `youtube-player.ts`、`play.ts`、`lyrics-panel.ts`、`word-pop.ts`、`PlaySession` 的 open／onTick／聽聽看＋`play-session.spec.ts` 骨架 |
| A | `quiz-panel.ts`＋`PlaySession.answer/finish`＋對應 spec |
| D | `sing-panel.ts`＋`PlaySession.startSing/nextStop`＋對應 spec |

**第 3 步**：整合、手動驗收清單（iPad Safari 必測）、美術動效（只動 `.css`）。

> `PlaySession` 是唯一多人會碰的檔案：第 0 步定好簽名，之後每人只填自己的方法。

**實際進度（2026-11-01，`feature/angular-scaffold`）**：已完成 `ng new`、models、`storage`、`app-config`＋`main.ts`＋`config.json`、路由＋guard＋佔位頁面、`styles.css` 共用 CSS（含 §3 第一列對齊）、`core/game/*` 全部純函式＋測試、`KidsStore`、`Rewards`、`Api`、`SongCatalog`、`translations`、`SpeechRecognizer`（只有介面＋iOS 註解）、`public/songs/*.json`。B 的 `lyrics.ts`／`translation.ts` 取消。**還沒做**：`PlaySession`、`YoutubePlayer`、`Pronunciation`、`SpeechRecognizer` 實作、CDN 動態 import 驗證、所有畫面元件（`shared/*`、`cloud-dialog`、`play/*` 子元件）。

---

## 11. 風險與待決定事項

### 風險
1. **CDN 動態 import**：`import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/+esm')` 在 esbuild 建置下要寫成變數＋`/* @vite-ignore */`，避免被打包器處理；第 0 步驗證。備案：`npm i @huggingface/transformers@4.3.1` 並複製 wasm 檔（較重）。
2. **iOS 手勢限制**（§3）：code review 必看「點擊 → 同步 play()」；例外是填填看答對後等單字唸完才 play。
3. **就地修改 signal 內容**（§4）：畫面不更新且不報錯，code review 必看。
4. **ScriptProcessorNode 已棄用**：照搬；瀏覽器移除時再改 `AudioWorklet`（只動 `speech-recognizer.ts`）。
5. **localStorage 換網域會「看起來」掉進度**（§7）。
6. **SPA 深層連結**：靜態主機沒設回退到 `index.html`，重新整理 `/kids/1` 會 404。
7. **YouTube 自行包裝**：約 40 行，不裝 `@angular/youtube-player`；包裝出問題再改用它。
8. **外部免費 API**（字典發音、YouTube）沒有 SLA，靠快取＋備援，跟舊版一樣。歌詞＋翻譯已改走自家後端。

### 需要 PO 決定
1. ~~網域~~、~~填填看字表~~、~~獎勵顯示~~、~~名字長度~~：已決定，見 §0。
2. **舊版下線時間**：`legacy/` 保留多久？

---

## 12. 部署（Railway，兩個服務）

| | 後端（已定） | 前端 |
|---|---|---|
| Root Directory | `backend` | `frontend` |
| 資料 | `DATA_DIR=/data`，Volume 掛 `/data` | 無 |
| 環境變數 | `ALLOWED_ORIGINS=<前端網址>` | `API_URL=<後端網址>` |
| 健康檢查 | `/api/health` | `/`（`index.html`） |
| 建置 | — | `npm ci && npx ng build` |
| 啟動 | 後端自訂 | `test -n "$API_URL"` 失敗就退出 → 寫入 `dist/frontend/browser/config.json`（`{"apiBaseUrl":"$API_URL"}`）→ 靜態伺服器（DevOps 選） |

前端靜態伺服器需求：未知路徑回 `index.html`（SPA 回退）；`config.json` 與 `index.html` 設 `Cache-Control: no-cache`；其餘帶 hash 的檔案可長期快取；必須 HTTPS（麥克風需要）。

---

## 13. 多語言（日文起步）

設計稿見 **[multilingual.md](multilingual.md)**：每個語言的行為集中在 `core/lang.ts`（前端）與 `build_content.py` 的 `LANGS`（內容工具），歌曲 json 只宣告 `lang`（沒寫＝`'en'`，英文歌不用改）。日文的斷詞、讀音、羅馬拼音在 `build_content.py` 預先算好存進 content.db 的 `tokens` 表，API 回應多一個選填的 `tokens` 欄位（向下相容，待 TPM 定案）。沒有 LRCLIB 的歌用本機 `data/lrc/<id>.lrc`（gitignored）手動對時間。
