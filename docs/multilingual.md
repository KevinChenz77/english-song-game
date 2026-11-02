# 多語言設計（日文起步，可擴充到任何語言）

> 狀態：設計稿（2026-11-02，前端架構師）。只有文件，還沒寫程式。API 變更由 TPM 定案（見 §4.3）。
> 目標：加一個語言＝**加一筆語言設定＋歌曲 json**；歌曲只宣告 `lang`。沒有 `lang` 的歌＝`'en'`，英文歌的行為、資料、測試**完全不變**。
> 日文原型 3 首：Butter-Fly（LRCLIB 13072731，58 句，漢字＋假名＋少量英文，約 165 BPM）、「あいうえーお！のうた」（`QrKpAHk7u8k`，121 秒）、「ひらがなのうた」（`8IpHIUxhdaI`，113 秒）。兩首五十音歌 **LRCLIB 沒有**，要手動對時間；**都沒有伴奏影片**。
> 第一期：聽聽看＋填填看。第二期：唱唱看。

---

## 1. 決定摘要

| # | 決定 | 理由 |
|---|---|---|
| D1 | 前端每個語言一筆設定，全部放 **`core/lang.ts`** 的 `LANGS`；Python 端放 `build_content.py` 的 `LANGS` dict。兩個執行環境各一處，不再有其他地方判斷語言 | 「per-language 行為在一處」；不做 class 階層／plugin 機制 |
| D2 | 斷詞與讀音**在 `build_content.py` 預先算好**存進 content.db（每句 token＋讀音＋羅馬拼音），前端不做日文分析 | 執行期日文斷詞＋讀音要 kuromoji 之類的字典（十幾 MB，iPad 每次下載），`Intl.Segmenter` 只會斷詞不給讀音。預先算好的話前端只是顯示 |
| D3 | 日文分析工具：**`fugashi` + `unidic-lite`**（MeCab，斷詞＋讀音）＋**`cutlet`**（羅馬拼音），只裝在內容工程師本機（`backend/tools/requirements-tools.txt`），**後端與前端都不加相依** | MeCab 斷詞比 pykakasi（照字種切段）準很多，讀音錯字較少；只有本機工具用，大小（約 50MB）不影響使用者 |
| D4 | `LyricLine` 多一個 `tokens`：所有地方改讀 `line.tokens`，**刪掉 6 個 `text.split(/\s+/)`**。英文的 tokens 在前端用空白切（＝今天的行為） | 一個改點收掉所有「以空白切字」的假設 |
| D5 | 讀音輔助預設**羅馬拼音**，可切「平假名／關」 | 小朋友看不懂假名，但英文課學過字母；漢字他們看得懂（PO 確認，見 Q1） |
| D6 | 日文填填看：**只有選擇題**（普通、挑戰），沒有「最難」打字題 | iPad 上小朋友不會用日文輸入法 |
| D7 | 日文發音只用 `speechSynthesis`（ja-JP 聲音），唸**讀音（平假名）**不唸漢字 | Free Dictionary 只有英文；TTS 單獨唸一個漢字詞常唸錯 |
| D8 | 唱唱看（第二期）：語言決定 Whisper 模型；英文維持 `whisper-tiny.en`，日文用多語模型（先實測 tiny／base）；日文評分以**字**為單位 | 見 §6 |
| D9 | 沒有 LRCLIB 的歌：本機 `data/lrc/<id>.lrc`（`data/` 已在 .gitignore），歌曲 json 標 `"localLrc": true`；附一個敲拍子對時間的小頁面 `backend/tools/lrc-tap.html` | 兩首五十音歌只能手動對時間；歌詞依然不進 repo |
| D10 | 沒有逐 token 的語言：日文歌裡的英文字當日文歌的 token（ja-JP 聲音唸、查 `dict.ja.json`） | 那就是歌裡唱的方式；混語言會讓每個 token 都要判斷語言 |

---

## 2. 目前所有「假設是英文」的地方 → 怎麼搬

（行號＝`develop` eee7912）

| 檔案:行 | 現在的假設 | 搬到 |
|---|---|---|
| `core/game/text.ts:2-6` | `STOP` 英文虛字 | `LANGS.en.stop`（直接引用現有的 `STOP`）；ja 另列助詞 |
| `core/game/text.ts:9-14` | `norm()` 只留 `a-z'` | `LANGS.en.norm = norm`（`text.ts` 原樣保留，英文測試不動）；ja 有自己的 `norm` |
| `core/game/text.ts:17-18` | `lookup()` 複數去 `s` | `lang.forms(w)`：en `[w, w去s]`、ja `[w]`；`lookup(w, dict, lang)` |
| `core/game/quiz.ts:24,30` | `split(/\s+/)`＋`norm` 找字 | 用 `line.tokens` ＋ `lang.norm`（`pickQuestions(lines, words, lang)`） |
| `core/game/scoring.ts:10-24` | 英文縮寫展開 `EXPAND` | 留在原檔，只給 en（`lang.asr.unit === 'word'` 才用） |
| `core/game/scoring.ts:39-74` | 以「單字」對齊、≥4 字母差 1 算接近、`split(/[\s-]+/)` | en 原樣；ja 用 `scoreChars()`（§6.3），由 `lang.asr.unit` 選 |
| `core/pronunciation.ts:5-8` | 英文聲音的好／趣味名單 | `lang.tts.good`／共用的 `FUNNY_VOICES` |
| `core/pronunciation.ts:63-65` | `s`、`ing` 字形 | `lang.forms` |
| `core/pronunciation.ts:71` | `dictionaryapi.dev/.../en/` | 只有 `lang.dictAudio === true`（en）才查；ja 直接 TTS |
| `core/pronunciation.ts:124,134-138` | `u.lang = 'en-US'`、只挑 `en` 聲音 | `lang.tts.lang`；每個語言各自挑一次聲音（快取在 Map） |
| `core/speech-recognizer.ts:114,128` | 模型 `whisper-tiny.en`、「約 41MB」 | `lang.asr.model`／`lang.asr.mb`；`load(lang)` |
| `core/speech-recognizer.ts:108` | 只快取一個 pipeline | 換語言時換模型（只留一個，iPad 記憶體） |
| `core/speech-recognizer.ts:149,155` | 幻覺字串是英文（thank you） | `lang.asr.junk`；ja 加「ご視聴ありがとうございました」等 Whisper 常見日文幻覺 |
| `core/song-catalog.ts:30` | 只有一個 `songs/dict.json` | `dict(lang)` → `songs/dict.<lang>.json`（`dict.json` 改名為 `dict.en.json`，一次性） |
| `core/play-session.ts:151` | `prefetch` 查英文字典發音 | 只有 `lang.dictAudio` 才 prefetch |
| `core/play-session.ts:199-206` | `tapWord(token)` 用英文 `norm`；`popWord` 只存字串 | `tapWord(t: Token)`；`popWord` 存 `Token`（小視窗要顯示讀音） |
| `core/play-session.ts:306` | 唱唱看「要多練的字」用 en `norm`＋`STOP` | `lang.norm`／`lang.stop` |
| `core/play-session.ts:364-365` | `scoreLine`，過關 0.7 | `lang.asr.unit` 選評分；門檻 `lang.asr.pass`（en 0.7） |
| `features/play/lyrics-panel.ts:12,36-45` | `split(/\s+/)`、`norm`、`STOP`、`lookup` | `l.tokens`＋`lang` |
| `features/play/lyrics-panel.ts:57-65` | 卡拉 OK 每個空白分隔的字 0.5 秒 | `lang.karaoke`：每個 token 的「長度單位」×秒數（en＝1 字×0.5 秒，和現在一樣） |
| `features/play/lyrics-panel.html:17-31` | 字與字之間插 `' '` | `lang.spaced`；ja 不插空白，改 CSS 小間距（§5） |
| `features/play/lyrics-panel.html:54-57` | Free Dictionary 授權說明 | 只有 `lang.dictAudio` 顯示 |
| `features/play/quiz-panel.ts:77` / `.html:9-17` | `split(/\s+/)`、`' '` | `l.tokens`、`lang.spaced` |
| `features/play/quiz-panel.ts:17-49,61` / `.html:20-44` | 三個難度，含最難打字 | `keys = lang.levels`（ja：`['normal','hard']`） |
| `features/play/quiz-panel.html:25` | 「（N 個字母）」提示 | 只在最難出現，ja 沒有最難，不用改 |
| `features/play/sing-panel.ts:6,19,44` / `.html:29,35` | `norm`、`' '` | `lang.norm`、`lang.spaced` |
| `features/play/word-pop.ts:4,22` | `lookup` 英文規則 | `lookup(w, dict, lang)`；ja 顯示 `漢字（讀音）＋中文` |
| `models/song.model.ts:11-23` | 沒有語言；`lrclibId` 必填 | `lang?`、`lrclibId?`、`localLrc?`、`readings?`（§4.1） |
| `index.html:2`、`styles.css:56` | `lang="zh-Hant"`＋中文字型 | 歌詞容器加 `[attr.lang]="lang.code"`＋`:lang(ja)` 字型（§5） |
| `backend/tools/build_content.py:54` | MyMemory `en|zh-TW` | `f"{lang}|zh-TW"` |
| `backend/tools/build_content.py:70` | 只會從 LRCLIB 抓 | `localLrc` → 讀 `data/lrc/<id>.lrc` |
| `backend/tools/build_content.py:23-26` | 沒有 tokens 表 | 加 `tokens` 表（§4.2） |
| `backend/main.py:207-219` | 回 `{lrc, translations}` | 多回選填的 `tokens`（§4.3） |
| `core/songs-data.spec.ts:2,28-35,53-56,72-86` | `dict.json`、en `norm`、三個難度、`lrclibId` | 依 `lang` 檢查（§7） |

不用改：`lrc.ts`、`translations.ts`（以整句原文當 key，日文一樣可用）、`rewards.ts`、`kid.model.ts`、存檔格式、`youtube-*`、`backing-track.ts`（沒有 `karaoke` 已經會安靜跳過）。

---

## 3. `LanguageConfig`

```ts
// core/lang.ts —— 每個語言的行為只在這裡
export interface Token { s: string; r?: string; ro?: string } // 原文、平假名讀音（有漢字才有）、羅馬拼音

export interface Lang {
  code: string;                 // BCP 47：'en' | 'ja'；也用在 [attr.lang]、dict.<code>.json、MyMemory
  name: string;                 // 選歌卡片標籤：'英文' | '日文'
  spaced: boolean;              // token 之間顯示空白
  split(text: string): Token[]; // 後端沒給 tokens 時：en 空白切；ja Intl.Segmenter（只是保底）
  norm(s: string): string;      // 比對／查字典的 key
  stop: ReadonlySet<string>;    // 不放進單字 chip、不列為「要多練」
  forms(w: string): string[];   // 查字典依序試的字形
  levels: QuizLevel[];          // 填填看可選的難度
  reading: boolean;             // 有讀音輔助（ruby）可切換
  dictAudio: boolean;           // Free Dictionary 真人錄音
  tts: { lang: string; good: RegExp; rate: number };
  karaoke: { units(t: Token): number; sec: number }; // 卡拉 OK：每個 token 幾個單位 × 每單位秒數
  asr: { model: string; language?: string; mb: number; unit: 'word' | 'char'; pass: number; junk: RegExp };
}

export const LANGS: Record<string, Lang> = { en: {...}, ja: {...} };
export const langOf = (s: Pick<Song, 'lang'>) => LANGS[s.lang ?? 'en'];
```

| | en（＝現在的常數搬過來） | ja |
|---|---|---|
| `split` | `text.split(/\s+/)` | `Intl.Segmenter('ja', { granularity: 'word' })`（原生、零相依；正常情況用不到，後端會給 tokens） |
| `norm` | 現有 `norm()` | `NFKC` → 片假名轉平假名 → 去標點與空白 → 英文字母小寫 |
| `stop` | 現有 `STOP` | 助詞、助動詞：は が を に へ で と も の や よ ね か な です ます … |
| `forms` | `[w, w去s]`（現有 `lookup`） | `[w]` |
| `levels` | normal／hard／expert | normal／hard |
| `reading` / `dictAudio` | false / true | true / false |
| `tts` | `en-US`、現有 `GOOD_VOICES`、0.8 | `ja-JP`、`/kyoko|o-ren|otoya|hattori|premium|enhanced|nanami|google 日本語/i`、0.8 |
| `karaoke` | `units = 1`、`sec = 0.5`（＝現在） | `units = (r ?? s) 的字數`（約等於音拍）、`sec = 0.18`（165 BPM 八分音符）——ponytail：粗估，快歌慢歌各差一點，句長本來就封頂；要準再做逐字時間 |
| `asr` | `whisper-tiny.en`、41MB、word、0.7、現有幻覺字串 | 多語 Whisper（§6.1）、`language: 'japanese'`、char、0.6（要實測調）、日文幻覺字串 |

不放進設定的（YAGNI）：顯示方向（沒有 RTL 需求）、每語言 UI 文案（介面一律中文）、每語言題數（先共用，見 Q3）。

**加韓文／西班牙文**＝在 `LANGS` 加一筆（ko/es 都用空白斷詞，`split` 用 en 的）、`build_content.py` 的 `LANGS` 加一筆（`tokens: None`，不需要讀音）、加 `dict.<code>.json`、歌曲 json 寫 `"lang"`。中文歌同理，若要注音再在 Python 端加讀音函式。

---

## 4. 資料模型

### 4.1 `Song`（`public/songs/<id>.json`）

```ts
lang?: string;      // 沒寫＝'en'（現有 3 首不用改）
lrclibId?: number;  // 和 localLrc 二選一
localLrc?: true;    // 歌詞在內容工程師本機 data/lrc/<id>.lrc（手動對時間）
readings?: Record<string, string>; // 讀音修正：{ 詞: 平假名 }，build_content 用，修 MeCab 唸錯的詞（單詞，不是歌詞句子）
```

`LyricLine` 加 `tokens: Token[]`（前端在 `PlaySession.open()` 填：後端有給用後端的，沒有就 `lang.split(text)`）。放在 `open()` 而不是 `Api.content()`：`content()` 不必等歌曲 json 才知道語言，兩個請求仍可同時發。

### 4.2 content.db

```sql
CREATE TABLE IF NOT EXISTS tokens (song_id TEXT NOT NULL, line TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (song_id, line));
-- json = [["学校","がっこう","gakkou"],["へ",null,"e"], ...]
```

- 只有 `LANGS[lang]['tokens']` 有分析函式的語言（ja）才寫；en 沒有任何列。
- 以整句原文當 key，和 `translations` 一樣。
- `main.py` 的 `CONTENT_SCHEMA` **不加** `tokens`（選填表），舊的 db 照樣能上傳。

### 4.3 API（提案給 TPM：contract v2 → v2.1，純新增）

`GET /api/songs/{id}/content` 回應多一個選填欄位：

```json
{ "ok": true, "songId": "...", "lrc": "...", "translations": {...}, "updatedAt": "...",
  "tokens": { "<原句>": [["学校","がっこう","gakkou"], ...] } }
```

- 沒有 `tokens` 表或這首歌沒有列 → **不回這個欄位**。舊前端忽略它；新前端沒拿到就自己 `split`。
- 後端：`SELECT name FROM sqlite_master WHERE name='tokens'` 有才查。`test_main.py` 加一個「有 tokens 表」與「沒有 tokens 表」的案例。

### 4.4 `build_content.py`

```python
LANGS = {"en": {"tokens": None}, "ja": {"tokens": ja_tokens}}  # MyMemory 一律 f"{lang}|zh-TW"
```

- 歌詞來源：`localLrc` → 讀 `data/lrc/<id>.lrc`（沒有檔案就明確報錯）；否則 LRCLIB。
- `ja_tokens(line, readings)`：先依空白切（**空白永遠是 token 邊界**，手動對時間的歌可以用空白自己決定怎麼切），每段丟 fugashi；助動詞、接續助詞「て」併進前一個 token（不然「見／たい」切太碎不好點）；讀音取 UniDic 的 `kana` 轉平假名，**只在原文含漢字時才存**；`readings` 覆蓋；羅馬拼音用 cutlet（Hepburn）。
- fugashi/cutlet 只在有 ja 歌時才 `import`；沒有日文歌的人照舊只要標準函式庫。
- `--check` 加一個用自編句子（不是歌詞）的斷詞／讀音自我測試。
- 只印數字，不印歌詞（照舊）。

---

## 5. 畫面

| 項目 | 做法 |
|---|---|
| 讀音（furigana） | 單字按鈕裡用原生 `<ruby>{{ t.s }}<rt>{{ 讀音 }}</rt></ruby>`；`rt { font-size: .5em }`，`.en` 的 line-height 2 → ja 約 2.6 |
| 讀音切換 | ja 歌時在歌詞面板上方一個按鈕：「讀音：羅馬拼音 → 平假名 → 關」，存 localStorage `reading`（新鍵，per 裝置）。平假名模式只標有漢字的 token；羅馬拼音模式每個 token 都標 |
| 字型 | `styles.css` 加 `:lang(ja) { font-family: system-ui, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', sans-serif; }`；歌詞、題目、唱唱看、單字小視窗的容器設 `[attr.lang]="lang.code"`。不載網路字型（iPad 內建 Hiragino）。少了 `lang="ja"`，漢字會用繁中字形顯示（例如「直」「骨」寫法不同） |
| 字間距 | ja `spaced=false`：token 之間不插空白，按鈕 `margin-inline: .12em`，看得出哪裡可以點 |
| 卡拉 OK | 仍是 `.w.sung` 逐 token 亮，計時改 `lang.karaoke`（§3），ruby 跟著按鈕變色 |
| 單字小視窗 | ja：大字原文＋讀音（羅馬拼音／平假名照目前切換）＋中文；🔊 唸平假名讀音 |
| 填填看選項 | 每個選項＝ruby 原文＋中文（小朋友靠中文和羅馬拼音選）；空格 `＿` 依字數 |
| 選歌卡片 | `lang !== 'en'` 時卡片角落一個小標籤（`lang.name`），不做篩選（歌少） |

---

## 6. 唱唱看（第二期）

### 6.1 模型

| 模型（transformers.js、q8） | 大約下載量 | 日文 | iPad |
|---|---|---|---|
| `whisper-tiny.en`（現在） | 約 41MB | 不支援 | 現況 |
| `whisper-tiny`（多語） | 約 40MB | 錯字多（成人朗讀就常錯，小朋友更差） | 和現在一樣快 |
| `whisper-base`（多語） | 約 80MB | 明顯較好 | 約慢 2 倍，記憶體多一倍 |
| `whisper-small` | 約 250MB | 好 | 太大，不考慮 |

決定：英文**不換**（tiny.en 對英文最好也最小）。日文先做 **1 天 spike**：用三首歌各 10 句、真的小朋友錄音比 tiny／base 的通過率與 iPad 辨識秒數，預設選 base。數字是估計，以 spike 為準。

- `asr(audio, { language: 'japanese', task: 'transcribe' })` 固定語言，避免小朋友口音被判成別的語言。
- 換語言＝換模型，`SpeechRecognizer` 只留一個 pipeline（舊的丟掉），進度文字的 MB 數讀 `lang.asr.mb`。

### 6.2 唸的是什麼

小朋友在每句停下來後自己唸，跟歌的 165 BPM 無關；快節奏只影響聽聽看的卡拉 OK 與填填看停的時間點（`endT − 0.15` 秒不變）。

### 6.3 日文評分（`scoring.ts` 加 `scoreChars`）

- 兩邊都 `lang.norm`（片假名→平假名、去標點）後**逐字**做 Levenshtein 對齊（現有 `charDist` 的同一套 DP，單位換成字）。
- Whisper 常把歌詞的假名寫成漢字或反過來：每個 token 只要它的**原文或讀音**出現在聽到的文字裡就算 `exact`；不然看它的字在對齊裡對到幾成（≥ 一半＝`near`）。
- 分數＝token 平均，門檻 `lang.asr.pass`（先 0.6，spike 後調）。ponytail：子字串比對是粗略規則，同一句重複出現的詞可能被重複算到；不夠準再改逐字讀音對齊。
- 回傳形狀和 `scoreLine` 一樣（`{ words, score }`），畫面不用改。

---

## 7. 檢查與加歌文件

`core/songs-data.spec.ts` 改成依語言：

- `lang` 沒寫或在 `LANGS` 裡。
- `lrclibId`（正整數）和 `localLrc: true` **剛好一個**（CI 沒有 `data/lrc/`，所以不檢查檔案存在；那是 `build_content.py` 的事）。
- 每個 `dict.<code>.json`：key 已排序、`norm` 過（用該語言的 `norm`）、中文不空。
- 填填看：只檢查 `lang.levels` 的難度題數；不在 `levels` 的難度必須是空陣列（ja 的 `expert: []`）。每個字用該語言 `norm` 過、在 `dict.<lang>.json`＋`song.dict` 查得到。
- `readings` 的值只能是平假名。

`docs/adding-a-song.md` 加：

- `lang` 欄位；非英文歌字典放 `dict.<lang>.json`；日文題目字寫原文（漢字／假名，就是 token 的寫法），題目字典的 key 也是原文。
- 日文要先 `pip install -r backend/tools/requirements-tools.txt`。
- **沒有 LRCLIB 的歌**（手動對時間）：
  1. `python3 -m http.server 8002 -d backend/tools`，開 `http://localhost:8002/lrc-tap.html`（YouTube 內嵌需要 http 網址，`file://` 不行）。
  2. 貼影片 id 和歌詞（一行一句；日文可用空白自己切詞），播放，每句開始時按空白鍵／大按鈕，Backspace 退一句；頁面產生 `[mm:ss.xx]` LRC。
  3. 存成 `data/lrc/<id>.lrc`（gitignored），json 寫 `"localLrc": true`，照常跑 `build_content.py`、上傳。
  4. 微調：在遊戲家長設定調整體時間差，個別句子直接改 `.lrc`。
  - 這個頁面只有一個 `<textarea>` 與 YouTube iframe，**不存任何東西、不送出任何東西**（約 80 行，不屬於 Angular app）。
- 讀音錯了：在歌曲 json 的 `readings` 加 `{ 詞: 正確平假名 }`，重建 content.db。
- 沒有伴奏影片就不放 `karaoke`（兩首五十音歌都是）。
- 上傳仍是整檔替換：db 必須含**所有**語言的所有歌。

---

## 8. 分工與時程

**第 0 步（1 人，約 1 天，先做完才分支）**：`core/lang.ts`（en＋ja 兩筆，ja 先填已知值）、`Song`／`LyricLine`／`Token` 型別、`PlaySession.open()` 填 tokens、把 §2 前端所有 `split(/\s+/)`／`norm`／`STOP`／`lookup` 改走 `line.tokens`＋`lang`、`dict.json` 改名 `dict.en.json`、`SongCatalog.dict(lang)`。**驗收：英文行為完全不變，現有測試全過**（只改 import 和呼叫方式，不改期望值）。

**第一期（聽聽看＋填填看），第 0 步之後平行，檔案不重疊**

| 分支 | 範圍（檔案） | 估計 |
|---|---|---|
| `feature/ml-pipeline` | `backend/tools/build_content.py`、`backend/tools/requirements-tools.txt`、`backend/main.py`、`backend/test_main.py` | 1.5 天 |
| `feature/ml-lyrics-ui` | `lyrics-panel.*`、`word-pop.ts`、`styles.css`（字型）、`shared/song-card.ts`（語言標籤） | 1 天 |
| `feature/ml-quiz-tts` | `quiz-panel.*`、`pronunciation.ts` | 0.5～1 天 |
| `feature/ml-content` | `public/songs/` 三首 json＋`index.json`＋`dict.ja.json`、`songs-data.spec.ts`、`docs/adding-a-song.md`、`backend/tools/lrc-tap.html`；兩首歌手動對時間 | 1.5 天＋教育顧問題目字表 |

第一期合計約 5～6 人天，平行約 3 個工作天（含第 0 步）。

**第二期（唱唱看）**：spike tiny/base（1 天）→ `speech-recognizer.ts`（per-lang 模型、language、幻覺字串）＋`scoring.ts`（`scoreChars`＋測試）＋`sing-panel.*`（`lang` 屬性、ruby）＋`play-session.ts`（門檻、評分選擇）約 2 天。合計約 3 人天，單線。

### 風險

| 風險 | 影響 | 對策 |
|---|---|---|
| Whisper 對小朋友日文的辨識率 | 唱唱看一直不過，挫折 | spike 實測；門檻 `pass` 可調；token 原文或讀音任一符合即可；最壞情況日文唱唱看只給練習 🎤 |
| 日文模型下載 80MB（base） | 第一次進唱唱看等很久、行動網路 | 進度文字照舊；先在 Wi-Fi 下載；之後瀏覽器快取 |
| LRCLIB 503 | 建 db 卡住 | `get_json` 已重試 8 次；建議預設只抓「db 裡還沒有」的歌，指定 id 才重抓 |
| 讀音錯（MeCab 選錯讀法、歌詞特殊唸法） | 小朋友學錯 | `readings` 覆蓋；上傳前家長／顧問看一遍羅馬拼音 |
| 165 BPM 卡拉 OK 與停點 | 亮字和歌聲對不上 | 句長封頂（現有）；`karaoke.sec` 可調；不夠準再做逐字時間（LRCLIB 的 enhanced LRC 多半沒有） |
| 手動對時間不準 | 歌詞跳太早／太晚 | 家長設定時間差＋直接改 `.lrc` |
| MyMemory 日文→繁中品質 | 翻譯怪 | 家長在本機修改（現有 `tr_<id>`） |
| 第 0 步改到很多檔 | 和其他進行中的分支衝突 | 第 0 步排在沒有其他前端分支時合併 |

---

## 9. 請 PO 決定（附建議）

1. **讀音輔助預設**：羅馬拼音／平假名／關？→ **建議預設羅馬拼音**，可切平假名（給家長或學過假名的孩子）。
2. **日文沒有「最難」**，日文歌的小卡不會變金色，可以嗎？→ **建議可以**，說明頁註明「日文歌沒有最難」；之後若要，再做「只聽發音選字」當日文最難。
3. **五十音歌題數**：兩首都只有 2 分鐘、重複多，普通 10／挑戰 18～20 可能湊不到不同句子。→ **建議日文放寬為普通 6～10、挑戰 10～20**（`songs-data.spec.ts` 依語言給範圍）。
4. **日文唱唱看的模型**：多下載約 80MB（base）換準確度，或 40MB（tiny）較快但容易判錯？→ **建議第二期 spike 後再定，預設 base**。
5. **日文歌裡的英文字**（Butter-Fly）：當日文唸（ja-JP 聲音、日文字典）還是當英文？→ **建議當日文**（歌就是這樣唱的；不做逐字切換語言）。
