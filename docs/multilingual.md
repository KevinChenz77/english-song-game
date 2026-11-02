# 多語言設計（日文起步，可擴充到任何語言）

> 狀態：設計稿（2026-11-02，前端架構師）；PO 已回覆 5 個問題（§9）。只有文件，還沒寫程式。API 變更由 TPM 定案（見 §4.3）。
> 目標：加一個語言＝**加一筆語言設定＋歌曲 json**；歌曲只宣告 `lang`。沒有 `lang` 的歌＝`'en'`，英文歌的行為、資料、測試**完全不變**（唯一例外：卡拉 OK 亮字改得更準，PO 已核准，見 §5.1）。
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
| D5 | 讀音輔助預設**平假名**，循環切換「平假名 → 羅馬拼音 → 關」，每台裝置記住（PO 決定） | 漢字小朋友看得懂，讀音用平假名標；看不懂再切羅馬拼音 |
| D6 | 填填看三個難度所有語言都有；「最難」的玩法由語言決定：`expert: 'typed'`（英文，照舊打字）或 `'listen'`（日文，**聽發音選字**：唸出空格的字，選項只有原文、沒有讀音和中文）。全部一次答對＝金色小卡（PO 決定） | iPad 上小朋友不會用日文輸入法；聽音辨字一樣是「最難」 |
| D7 | 非英文的發音用 `speechSynthesis`（該語言的聲音），日文唸**讀音（平假名）**不唸漢字 | Free Dictionary 只有英文；TTS 單獨唸一個漢字詞常唸錯 |
| D8 | 唱唱看（第二期）：語言決定 Whisper 模型；英文維持 `whisper-tiny.en`，日文用多語模型（spike 後定，預設 base）；日文評分以**字**為單位、比對原文 | 見 §6 |
| D9 | 沒有 LRCLIB 的歌：本機 `data/lrc/<id>.lrc`（`data/` 已在 .gitignore），歌曲 json 標 `"localLrc": true`；附一個敲拍子對時間的小頁面 `backend/tools/lrc-tap.html` | 兩首五十音歌只能手動對時間；歌詞依然不進 repo |
| D10 | **逐 token 的語言**：token 可以標 `l`（另一個已設定的語言）。日文歌裡的英文字標 `l: 'en'`，用英文字典、英文發音（Free Dictionary／en 合成語音）、英文音節權重，沒有 ruby。通用：任何語言的歌都可以含其他已設定語言的 token（PO 決定） | 英文字照英文學；規則放在語言設定的 `match`，不寫死日文 |
| D11 | 卡拉 OK 亮字（所有語言）：有逐字時間（Enhanced LRC）就用真的時間；沒有就把一句的時間依 token 的**音節／音拍權重**分配，句尾留一小段空白（§5.1） | PO 核准 A＋B；取代每字固定 0.5 秒 |
| D12 | `lrc-tap.html` 有「逐字模式」：0.5×／0.75× 慢速播放、每個 token 敲一下，輸出 Enhanced LRC；任何歌（包括已上線的英文歌）都可以用本機 `data/lrc/<id>.lrc` **覆蓋** LRCLIB | 一個工具同時解決手動對時間、逐字時間、修正句子停點 |
| D13 | 填填看題數範圍放在語言設定 `quizRange`：en 10／18～20／18～20（照舊）、ja 6～10／10～20／10～20，`songs-data.spec.ts` 依語言檢查（PO 決定） | 五十音歌短、重複多 |

---

## 2. 目前所有「假設是英文」的地方 → 怎麼搬

（行號＝`develop` eee7912）。下表的 `lang` 指**這個 token 的語言**：`tokLang(t, song) = LANGS[t.l ?? song.lang ?? 'en']`；不針對 token 的地方（句子、ASR）用歌曲語言。

| 檔案:行 | 現在的假設 | 搬到 |
|---|---|---|
| `core/game/text.ts:2-6` | `STOP` 英文虛字 | `LANGS.en.stop`（直接引用現有的 `STOP`）；ja 另列助詞 |
| `core/game/text.ts:9-14` | `norm()` 只留 `a-z'` | `LANGS.en.norm = norm`（`text.ts` 原樣保留，英文測試不動）；ja 有自己的 `norm` |
| `core/game/text.ts:17-18` | `lookup()` 複數去 `s` | `lang.forms(w)`：en `[w, w去s]`、ja `[w]`；`lookup(w, dict, lang)` |
| `core/game/quiz.ts:4-12,24,30` | `split(/\s+/)`＋`norm` 找字；題目只存字串 | 用 `line.tokens`＋`tokLang().norm`；`Question` 多存 `tok: Token`（最難聽音要唸它的讀音） |
| `core/game/scoring.ts:10-24` | 英文縮寫展開 `EXPAND` | 留在原檔，只給 en（`lang.asr.unit === 'word'` 才用） |
| `core/game/scoring.ts:39-74` | 以「單字」對齊、≥4 字母差 1 算接近、`split(/[\s-]+/)` | en 原樣；ja 用 `scoreChars()`（§6.3），由歌曲 `lang.asr.unit` 選 |
| `core/game/reward-rules.ts:11` | 「最難」文字寫「全部一次打對」 | 改「全部一次答對」（兩種最難都適用） |
| `core/pronunciation.ts:5-8` | 英文聲音的好／趣味名單 | `lang.tts.good`／共用的 `FUNNY_VOICES` |
| `core/pronunciation.ts:63-65` | `s`、`ing` 字形 | `lang.forms` |
| `core/pronunciation.ts:71` | `dictionaryapi.dev/.../en/` | 只有 `lang.dictAudio === true`（en，含日文歌裡的英文 token）才查；其他直接 TTS |
| `core/pronunciation.ts:124,134-138` | `u.lang = 'en-US'`、只挑 `en` 聲音 | `say(t: Token, lang)`；`lang.tts.lang`；每個語言各自挑一次聲音（快取在 Map）；首次 pointerdown 也唸一個空字串解鎖 `speechSynthesis`（iOS，最難聽音會在非點擊時自動唸） |
| `core/speech-recognizer.ts:114,128` | 模型 `whisper-tiny.en`、「約 41MB」 | `lang.asr.model`／`lang.asr.mb`；`load(lang)` |
| `core/speech-recognizer.ts:108` | 只快取一個 pipeline | 換語言時換模型（只留一個，iPad 記憶體） |
| `core/speech-recognizer.ts:149,155` | 幻覺字串是英文（thank you） | `lang.asr.junk`；ja 加「ご視聴ありがとうございました」等 Whisper 常見日文幻覺 |
| `core/song-catalog.ts:30` | 只有一個 `songs/dict.json` | `dict(code)` → `songs/dict.<code>.json`，每個語言抓一次快取（`dict.json` 改名為 `dict.en.json`，一次性） |
| `core/play-session.ts:134-138` | 停下來只設 `active` | 最難＋`listen` 時順便 `pron.say(q.tok, tokLang)`（流程內呼叫，不用 effect） |
| `core/play-session.ts:151` | `prefetch` 查英文字典發音 | 只 prefetch `tokLang().dictAudio` 的題目字 |
| `core/play-session.ts:199-206` | `tapWord(token)` 用英文 `norm`；`popWord` 只存字串 | `tapWord(t: Token)`；`popWord` 存 `Token`（小視窗要顯示讀音） |
| `core/play-session.ts:306` | 唱唱看「要多練的字」用 en `norm`＋`STOP` | `tokLang().norm`／`.stop` |
| `core/play-session.ts:364-365` | `scoreLine`，過關 0.7 | 歌曲 `lang.asr.unit` 選評分；門檻 `lang.asr.pass`（en 0.7） |
| `features/play/play.ts:65-68` | 一份字典 | `dicts`：歌曲語言＋tokens 裡出現的其他語言，各自疊上 `song.dict` |
| `features/play/lyrics-panel.ts:12,36-45` | `split(/\s+/)`、`norm`、`STOP`、`lookup` | `l.tokens`＋`tokLang` |
| `features/play/lyrics-panel.ts:57-65` | 卡拉 OK 每個空白分隔的字 0.5 秒 | 純函式 `karaokeTimes(line, song)`（`core/game/karaoke.ts`）回傳每個 token 的開始時間：真的逐字時間或權重估計（§5.1）；`sung` 只比較 `time` 和這個陣列 |
| `features/play/lyrics-panel.html:17-31` | 字與字之間插 `' '` | 歌曲 `lang.spaced`；ja 不插空白，改 CSS 小間距（§5） |
| `features/play/lyrics-panel.html:54-57` | Free Dictionary 授權說明 | 這首歌有任何 `dictAudio` 的 token 才顯示 |
| `features/play/quiz-panel.ts:77` / `.html:9-17` | `split(/\s+/)`、`' '` | `l.tokens`、`lang.spaced` |
| `features/play/quiz-panel.ts:41-47` / `.html:20-60` | 最難＝打字 | `lang.expert === 'typed'` 照舊；`'listen'` 見 §5.3 |
| `features/play/quiz-panel.html:25` | 「（N 個字母）」提示 | 只在 `typed` 出現，不用改 |
| `features/help/help.html:57,67` | 「最難（自己打字）」 | 「最難（英文自己打字、日文聽發音選字）」 |
| `features/play/sing-panel.ts:6,19,44` / `.html:29,35` | `norm`、`' '` | `tokLang().norm`、`lang.spaced` |
| `features/play/word-pop.ts:4,22` | `lookup` 英文規則 | `lookup(w, dicts[code], tokLang)`；ja 顯示 原文＋讀音＋中文 |
| `models/song.model.ts:11-23` | 沒有語言；`lrclibId` 必填 | `lang?`、`lrclibId?`、`localLrc?`、`readings?`（§4.1） |
| `index.html:2`、`styles.css:56` | `lang="zh-Hant"`＋中文字型 | 歌詞容器加 `[attr.lang]="song lang"`、外語 token 按鈕加自己的 `lang`＋`:lang(ja)` 字型（§5） |
| `backend/tools/build_content.py:54` | MyMemory `en|zh-TW` | `f"{lang}|zh-TW"` |
| `backend/tools/build_content.py:70` | 只會從 LRCLIB 抓 | 有 `data/lrc/<id>.lrc` 就用它（覆蓋 LRCLIB），否則 LRCLIB；`localLrc` 的歌沒有檔案就報錯 |
| `backend/tools/build_content.py:22,43-50` | 句子文字＝時間戳後的整段 | 先去掉 `<mm:ss.xx>` 逐字時間再當 key（和前端 `parseLrc` 同一條規則） |
| `core/game/lrc.ts:7-8` | 不認得 Enhanced LRC | `<mm:ss.xx>` 從 `text` 拿掉，存成 `stamps`（§4.1） |
| `backend/tools/build_content.py:23-26` | 沒有 tokens 表 | 加 `tokens` 表（§4.2） |
| `backend/main.py:207-219` | 回 `{lrc, translations}` | 多回選填的 `tokens`（§4.3） |
| `core/songs-data.spec.ts:2,12-16,28-35,53-56,72-86` | `dict.json`、en `norm`、固定題數、`lrclibId` | 依 `lang` 檢查（§7） |

不用改：`translations.ts`（以整句原文當 key，日文一樣可用）、`rewards.ts`、`kid.model.ts`、存檔格式、`youtube-*`、`backing-track.ts`（沒有 `karaoke` 已經會安靜跳過）。

---

## 3. `LanguageConfig`

```ts
// core/lang.ts —— 每個語言的行為只在這裡
// 原文、平假名讀音（有漢字才有）、羅馬拼音、這個 token 的語言（和歌曲不同時才有）
export interface Token { s: string; r?: string; ro?: string; l?: string }

export interface Lang {
  code: string;                 // BCP 47：'en' | 'ja'；也用在 [attr.lang]、dict.<code>.json、MyMemory
  name: string;                 // 選歌卡片標籤：'英文' | '日文'
  spaced: boolean;              // token 之間顯示空白
  match?: RegExp;               // 這個語言的 token 出現在別的語言的歌裡時怎麼認（en：拉丁字母）
  split(text: string): Token[]; // 後端沒給 tokens 時：en 空白切；ja Intl.Segmenter（只是保底，也用 match 標 l）
  norm(s: string): string;      // 比對／查字典的 key
  stop: ReadonlySet<string>;    // 不放進單字 chip、不列為「要多練」
  forms(w: string): string[];   // 查字典依序試的字形
  expert: 'typed' | 'listen';   // 填填看「最難」的玩法
  quizRange: Record<QuizLevel, [number, number]>; // 每個難度題目字數（songs-data.spec.ts 檢查）
  reading: boolean;             // 有讀音輔助（ruby）可切換
  dictAudio: boolean;           // Free Dictionary 真人錄音
  tts: { lang: string; good: RegExp; rate: number };
  units(t: Token): number;      // 卡拉 OK 權重：en 音節數、ja 音拍數（§5.1）
  asr: { model: string; language?: string; mb: number; unit: 'word' | 'char'; pass: number; junk: RegExp };
}

export const LANGS: Record<string, Lang> = { en: {...}, ja: {...} };
export const langOf = (s: Pick<Song, 'lang'>) => LANGS[s.lang ?? 'en'];
export const tokLang = (t: Token, s: Pick<Song, 'lang'>) => (t.l ? LANGS[t.l] : langOf(s));
```

| | en（＝現在的常數搬過來） | ja |
|---|---|---|
| `match` | `/^[A-Za-z][A-Za-z'’]*$/` | （不需要，目前沒有別的語言的歌含日文） |
| `split` | `text.split(/\s+/)` | `Intl.Segmenter('ja', { granularity: 'word' })`（原生、零相依；正常情況用不到，後端會給 tokens） |
| `norm` | 現有 `norm()` | `NFKC` → 片假名轉平假名 → 去標點與空白 |
| `stop` | 現有 `STOP` | 助詞、助動詞：は が を に へ で と も の や よ ね か な です ます … |
| `forms` | `[w, w去s]`（現有 `lookup`） | `[w]` |
| `expert` | `typed` | `listen` |
| `quizRange` | 10–10／18–20／18–20（現有） | 6–10／10–20／10–20 |
| `reading` / `dictAudio` | false / true | true / false |
| `tts` | `en-US`、現有 `GOOD_VOICES`、0.8 | `ja-JP`、`/kyoko|o-ren|otoya|hattori|premium|enhanced|nanami|google 日本語/i`、0.8 |
| `units` | 母音群數（`/[aeiouy]+/g` 的個數，字尾單獨的 `e` 不算，最少 1）——ponytail：粗估音節，夠用來分配時間 | 讀音（`r ?? s`）的假名數，不算小寫的ゃゅょぁぃぅぇぉ（＝音拍；っ、ー、ん算一拍） |
| `asr` | `whisper-tiny.en`、41MB、word、0.7、現有幻覺字串 | 多語 Whisper（§6.1）、`language: 'japanese'`、char、0.6（要實測調）、日文幻覺字串 |

日文歌裡的英文 token（`l: 'en'`）所有 token 層級的行為（`norm`、`stop`、字典、發音、`units`、沒有 ruby）都自動用 en 那一筆，不用寫任何特例。

不放進設定的（YAGNI）：顯示方向（沒有 RTL 需求）、每語言 UI 文案（介面一律中文）。

**加韓文／西班牙文**＝在 `LANGS` 加一筆（ko/es 都用空白斷詞，`split` 用 en 的；決定 `expert`、`quizRange`）、`build_content.py` 的 `LANGS` 加一筆（`tokens: None`，不需要讀音）、加 `dict.<code>.json`、歌曲 json 寫 `"lang"`。中文歌同理，若要注音再在 Python 端加讀音函式。

---

## 4. 資料模型

### 4.1 `Song`（`public/songs/<id>.json`）

```ts
lang?: string;      // 沒寫＝'en'（現有的歌不用改）
lrclibId?: number;  // 歌詞來源；本機有 data/lrc/<id>.lrc 時會被它覆蓋（重新對時間）
localLrc?: true;    // LRCLIB 沒有這首：歌詞只在內容工程師本機 data/lrc/<id>.lrc（手動對時間）
readings?: Record<string, string>; // 讀音修正：{ 詞: 平假名 }，build_content 用，修 MeCab 唸錯的詞（單詞，不是歌詞句子）
```

`quiz` 形狀不變（三個難度都要填）。日文題目字寫 token 原文；英文 token 的題目字寫英文 `norm` 後的樣子。

`LyricLine` 加 `stamps?: { at: number; t: number }[]`（`parseLrc` 從 Enhanced LRC 讀出：`at`＝去掉時間戳後的 `text` 裡的字元位置，`t`＝秒）。存「字元位置」而不是「第幾個字」，所以跟各語言怎麼斷詞無關：日文 tokens 由 fugashi 切、時間由人敲，兩者不必對齊。

`LyricLine` 加 `tokens: Token[]`（前端在 `PlaySession.open()` 填：後端有給用後端的，沒有就 `lang.split(text)`）。放在 `open()` 而不是 `Api.content()`：`content()` 不必等歌曲 json 才知道語言，兩個請求仍可同時發。

### 4.2 content.db

```sql
CREATE TABLE IF NOT EXISTS tokens (song_id TEXT NOT NULL, line TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (song_id, line));
-- json = [["学校","がっこう","gakkou"],["へ",null,"e"],["happy",null,null,"en"], ...]   ← 範例是自編的，不是歌詞
```

- 只有 `LANGS[lang]['tokens']` 有分析函式的語言（ja）才寫；en 沒有任何列。
- 以整句原文當 key，和 `translations` 一樣。
- `main.py` 的 `CONTENT_SCHEMA` **不加** `tokens`（選填表），舊的 db 照樣能上傳。

### 4.3 API（提案給 TPM：contract v2 → v2.1，純新增）

`GET /api/songs/{id}/content` 回應多一個選填欄位：

```json
{ "ok": true, "songId": "...", "lrc": "...", "translations": {...}, "updatedAt": "...",
  "tokens": { "<原句>": [["学校","がっこう","gakkou"], ["happy",null,null,"en"], ...] } }
```

- token 是陣列 `[s, r, ro, l]`，後面沒有值的可以省略。
- 沒有 `tokens` 表或這首歌沒有列 → **不回這個欄位**。舊前端忽略它；新前端沒拿到就自己 `split`。
- 後端：`SELECT name FROM sqlite_master WHERE name='tokens'` 有才查。`test_main.py` 加一個「有 tokens 表」與「沒有 tokens 表」的案例。

### 4.4 `build_content.py`

```python
LANGS = {
    "en": {"tokens": None, "match": re.compile(r"^[A-Za-z][A-Za-z'’]*$")},  # 和前端 LANGS.en.match 一樣
    "ja": {"tokens": ja_tokens, "match": None},
}  # MyMemory 一律 f"{lang}|zh-TW"
```

- 歌詞來源：本機有 `data/lrc/<id>.lrc` 就用它（任何歌、任何語言，可含 Enhanced LRC 逐字時間），否則 LRCLIB；`localLrc` 的歌沒有檔案就明確報錯。整段 LRC（含逐字時間）照舊存 `songs.lrc`，**不加欄位**。
- `lyric_lines()` 先去掉 `<mm:ss.xx>` 再當句子 key，翻譯與 tokens 的 key 才會和前端 `parseLrc` 的 `text` 一致。
- 印出時多一欄「來源：lrclib／local（N 句有逐字時間）」，方便確認覆蓋有生效。
- `ja_tokens(line, readings)`：先依空白切（**空白永遠是 token 邊界**，手動對時間的歌可以用空白自己決定怎麼切），每段丟 fugashi；助動詞、接續助詞「て」併進前一個 token（不然「見／たい」切太碎不好點）；讀音取 UniDic 的 `kana` 轉平假名，**只在原文含漢字時才存**；`readings` 覆蓋；羅馬拼音用 cutlet（Hepburn）。
- **外語 token**（通用，不寫在 `ja_tokens` 裡）：分析完後，原文符合**其他**語言 `match` 的 token 標 `l`，拿掉 `r`／`ro`。
- fugashi/cutlet 只在有 ja 歌時才 `import`；沒有日文歌的人照舊只要標準函式庫。
- `--check` 加一個用自編句子（不是歌詞）的斷詞／讀音／外語 token 自我測試。
- 只印數字，不印歌詞（照舊）。

---

## 5. 畫面

| 項目 | 做法 |
|---|---|
| 讀音（furigana） | 單字按鈕裡用原生 `<ruby>{{ t.s }}<rt>{{ 讀音 }}</rt></ruby>`；`rt { font-size: .5em }`，`.en` 的 line-height 2 → ja 約 2.6。只有 `tokLang().reading` 的 token 有 ruby（英文 token 沒有） |
| 讀音切換 | `reading` 的歌在歌詞面板上方一個按鈕：「讀音：平假名 → 羅馬拼音 → 關」，**預設平假名**，存 localStorage `reading`（新鍵，per 裝置）。平假名模式只標有漢字的 token；羅馬拼音模式每個 token 都標 |
| 字型 | `styles.css` 加 `:lang(ja) { font-family: system-ui, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', sans-serif; }`；歌詞、題目、唱唱看、單字小視窗的容器設 `[attr.lang]="歌曲語言"`，外語 token 的按鈕設自己的 `lang`。不載網路字型（iPad 內建 Hiragino）。少了 `lang="ja"`，漢字會用繁中字形顯示（例如「直」「骨」寫法不同） |
| 字間距 | ja `spaced=false`：token 之間不插空白，按鈕 `margin-inline: .12em`，看得出哪裡可以點 |
| 卡拉 OK | 仍是 `.w.sung` 逐 token 亮，時間來自 `karaokeTimes()`（§5.1），ruby 跟著按鈕變色 |
| 單字小視窗 | ja：大字原文＋讀音（照目前的讀音切換）＋中文；🔊 唸平假名讀音。英文 token 和英文歌一樣 |
| 填填看選項（普通、挑戰） | 每個選項＝ruby 原文＋中文；空格 `＿` 依字數 |
| 選歌卡片 | `lang !== 'en'` 時卡片角落一個小標籤（`lang.name`），不做篩選（歌少） |

### 5.1 卡拉 OK 亮字時間（所有語言，PO 核准 A＋B）

`core/game/karaoke.ts` 的純函式 `karaokeTimes(line, song): number[]`（每個 token 的開始秒數；權重用 `tokLang(t, song).units(t)`，所以日文歌裡的英文字用英文音節），`lyrics-panel` 的 `sung` 改成「`time` 已經過了幾個開始時間」。每句只算一次（放進 `rows` computed）。

- **B：有逐字時間**（`line.stamps`）：每個 token 依它在 `text` 裡的字元位置，落在哪兩個 stamp 之間，就在這段時間裡依 A 的權重分配。stamp 剛好在 token 開頭＝直接用那個時間。
- **A：沒有逐字時間**：可用時間 `span = min(end − t − TAIL, Σunits × MAX_PER_UNIT)`，token k 的開始＝`t + span × (前面 token 的 units 合計 / Σunits)`。`TAIL = 0.3` 秒（句尾留白，下一句前不會全亮太晚）、`MAX_PER_UNIT = 0.45` 秒（句子後面接很長的間奏時不會慢慢拖）。ponytail：兩個常數是調整用的旋鈕，實際聽幾首再調。
- 英文也走同一個函式：沒有逐字時間時從「每字 0.5 秒」變成依音節分配（PO 核准的行為變更；`lyrics-panel` 的期望值要改，其他英文測試不動）。
- 句子開始時間重新敲過，也順便讓填填看／唱唱看的停點（`endT`＝下一句開始）更準。

### 5.2 `lrc-tap.html`（本機工具，語言無關）

一個靜態頁（約 120 行，不屬於 Angular app，不存、不送任何東西）：

- 輸入 YouTube videoId，貼上歌詞（一行一句）。行內用**空白**（保留）或 `|`（輸出時拿掉，給日文這種沒有空白的語言用）標出要敲的位置；沒標就只敲句子開頭。
- **句子模式**：每句開始敲一下（空白鍵或大按鈕），Backspace 退一下。
- **逐字模式**：`player.setPlaybackRate(0.5 | 0.75)` 慢速播，每個段落開頭敲一下。時間一律讀 `player.getCurrentTime()`——它本來就是**影片時間**，不是牆上時間，所以慢速播放**不用換算**。另有「反應時間修正」欄（預設 −0.1 秒）扣掉人手延遲。
- 可以先貼一份既有的 LRC（例如 LRCLIB 的），只重敲逐字時間、保留句子開頭。
- 輸出 Enhanced LRC：`[mm:ss.xx]<mm:ss.xx>段落<mm:ss.xx>段落…`，去掉 `<…>` 和 `|` 後必須**和原句一字不差**（頁面自己檢查，不一致就不輸出），否則翻譯 key 會對不上。
- 結果貼進 `data/lrc/<id>.lrc`。⚠️ 這個資料夾只在內容工程師電腦上（gitignored）：敲好的時間要自己備份（例如私人雲端硬碟），電腦壞了只能重敲。

### 5.3 「最難」聽發音選字（`expert: 'listen'`，PO 決定）

- 題目和其他難度一樣停在有空格的那句，`PlaySession` 停下來時就唸一次空格的字（`pron.say(q.tok, tokLang)`：日文唸平假名讀音，英文 token 照英文）。
- 畫面：大的「🔊 再聽一次這個字」按鈕（點擊當下同步呼叫 `say`，iOS 自動唸被擋時就靠它）＋選項。選項**只有原文**（漢字／假名），沒有 ruby、沒有中文；空格那句的整句中文照常顯示（是句意，不是答案）。
- 選項、答錯回饋、補答、結算全部沿用選擇題（`answer()` 不用改）；「全部一次答對」→ `earn('expert')` → 金色小卡，和英文一樣。
- 題目字用 `quiz.expert`（範圍和挑戰一樣 10～20）。
- 不需要新的 reward key、不改存檔格式。

---

## 6. 唱唱看（第二期）

### 6.1 模型

| 模型（transformers.js、q8） | 大約下載量 | 日文 | iPad |
|---|---|---|---|
| `whisper-tiny.en`（現在） | 約 41MB | 不支援 | 現況 |
| `whisper-tiny`（多語） | 約 40MB | 錯字多（成人朗讀就常錯，小朋友更差） | 和現在一樣快 |
| `whisper-base`（多語） | 約 80MB | 明顯較好 | 約慢 2 倍，記憶體多一倍 |
| `whisper-small` | 約 250MB | 好 | 太大，不考慮 |

決定（PO 同意）：英文**不換**（tiny.en 對英文最好也最小）。日文先做 **1 天 spike**：用三首歌各 10 句、真的小朋友錄音比 tiny／base 的通過率與 iPad 辨識秒數，**預設選 base**。數字是估計，以 spike 為準。

- `asr(audio, { language: 'japanese', task: 'transcribe' })` 固定語言，避免小朋友口音被判成別的語言。模型跟著**歌曲**語言，不跟 token。
- 換語言＝換模型，`SpeechRecognizer` 只留一個 pipeline（舊的丟掉），進度文字的 MB 數讀 `lang.asr.mb`。

### 6.2 唸的是什麼

小朋友在每句停下來後自己唸，跟歌的 165 BPM 無關；快節奏只影響聽聽看的卡拉 OK 與填填看停的時間點（`endT − 0.15` 秒不變）。

### 6.3 日文評分（`scoring.ts` 加 `scoreChars`）

- 兩邊都用歌曲語言的 `norm`（片假名→平假名、去標點；英文字母另外轉小寫）後**逐字**做 Levenshtein 對齊（現有 `charDist` 的同一套 DP，單位換成字）。
- Whisper 常把歌詞的假名寫成漢字或反過來：每個 token 只要它的**原文或讀音**出現在聽到的文字裡就算 `exact`；不然看它的字在對齊裡對到幾成（≥ 一半＝`near`）。
- 英文 token 也是比原文（PO 決定）：聽到的文字裡有那個英文字就算對。
- 分數＝token 平均，門檻 `lang.asr.pass`（先 0.6，spike 後調）。ponytail：子字串比對是粗略規則，同一句重複出現的詞可能被重複算到；不夠準再改逐字讀音對齊。
- 回傳形狀和 `scoreLine` 一樣（`{ words, score }`），畫面不用改。

---

## 7. 檢查與加歌文件

`core/songs-data.spec.ts` 改成依語言：

- `lang` 沒寫或在 `LANGS` 裡。
- `lrclibId`（正整數）和 `localLrc: true` **剛好一個**（CI 沒有 `data/lrc/`，所以不檢查檔案存在；那是 `build_content.py` 的事）。LRCLIB 的歌被本機檔案覆蓋時 json 不用改。
- 每個 `dict.<code>.json`：key 已排序、`norm` 過（用該語言的 `norm`）、中文不空。
- 填填看：每個難度的字數在**歌曲語言**的 `quizRange` 裡。每個字的語言＝符合哪個**其他**語言的 `match` 就是那個語言，否則歌曲語言；用那個語言的 `norm` 檢查、在 `dict.<那個語言>.json`＋`song.dict` 查得到。
- `readings` 的值只能是平假名。

`docs/adding-a-song.md` 加：

- `lang` 欄位；非英文歌字典放 `dict.<lang>.json`；日文題目字寫原文（漢字／假名，就是 token 的寫法），題目字典的 key 也是原文。歌裡的英文字放 `dict.en.json`。
- 日文題數：普通 6～10、挑戰 10～20、最難 10～20（最難是聽發音選字）。
- 日文要先 `pip install -r backend/tools/requirements-tools.txt`。
- **沒有 LRCLIB 的歌**（手動對時間）：
  1. `python3 -m http.server 8002 -d backend/tools`，開 `http://localhost:8002/lrc-tap.html`（YouTube 內嵌需要 http 網址，`file://` 不行）。
  2. 貼影片 id 和歌詞，先用句子模式敲每句開頭；要逐字亮再用逐字模式（0.5×／0.75×）敲一次（§5.2）。
  3. 存成 `data/lrc/<id>.lrc`（gitignored，記得備份），json 寫 `"localLrc": true`，照常跑 `build_content.py`、上傳。
  4. 微調：在遊戲家長設定調整體時間差，個別句子直接改 `.lrc`。
- **已上線的歌想要逐字亮／修停點**（任何語言）：同一個工具，先貼 LRCLIB 的 LRC，敲完存 `data/lrc/<id>.lrc`，重建上傳。json 不用改。
- 讀音錯了：在歌曲 json 的 `readings` 加 `{ 詞: 正確平假名 }`，重建 content.db。
- 沒有伴奏影片就不放 `karaoke`（兩首五十音歌都是）。
- 上傳仍是整檔替換：db 必須含**所有**語言的所有歌。

---

## 8. 分工與時程

**順序**：PO 加的兩首入門英文歌（Walking In The Forest、Walking in the Jungle）正在用 `dict.json` 加，**先合併進 develop，第 0 步再從那之後開分支**；`dict.json → dict.en.json` 用 `git mv` 放在第 0 步最後一個 commit，改名就會帶著它們的字。第 0 步合併後，加歌一律用 `dict.<lang>.json`。

**第 0 步（1 人，約 2.5 天，先做完才分支）**：`core/lang.ts`（en＋ja 兩筆，ja 先填已知值；含 `tokLang`、`match`、`expert`、`quizRange`）、`Song`／`LyricLine`／`Token` 型別、`PlaySession.open()` 填 tokens、把 §2 前端所有 `split(/\s+/)`／`norm`／`STOP`／`lookup` 改走 `line.tokens`＋`tokLang`、`SongCatalog.dict(code)`＋`Play` 的多份字典、**`parseLrc` 讀 Enhanced LRC（`stamps`）＋`karaoke.ts`（A＋B）＋測試**、`dict.json` 改名 `dict.en.json`。**驗收：除了卡拉 OK 亮字時間（§5.1），英文行為不變，其他現有測試全過**（只改 import 和呼叫方式，不改期望值）。

> 第 0 步實作備註（`feature/ml-step0`）：
> - `Lang` 只放了第 0 步用得到的欄位（`code`、`match`、`split`、`norm`、`stop`、`forms`、`expert`、`quizRange`、`units`）；`name`、`spaced`、`reading`、`dictAudio`、`tts`、`asr` 由用到的分支自己加（ja 的值照 §3 表）。
> - `parseLrc` 回 `LrcLine`（沒有 tokens）；`LyricLine extends LrcLine` 多 `tokens`，由 `tokenize(lines, song)`（`core/lang.ts`）在 `PlaySession.open()` 填。測試直接放 `session.lines` 時也用 `tokenize`。後端 `tokens` 欄位還沒讀（第一期 `ml-pipeline` 上線後在 `tokenize` 優先用它）。
> - `wordLang(w, song)`：只有字串（題目字、選項）時的語言規則（符合別的語言 `match` 就是那個語言），`split` 標 `l`、`quiz-panel` 查中文、`songs-data.spec.ts` 都用它。
> - `lookup(w, dict, forms = enForms)`：第三個參數是語言的 `forms`（英文預設，`text.spec.ts` 不動）。
> - `tapWord(t: Token)`；`popWord` 存 `{ ...t, s: norm 過 }`。唱唱看的「要多練的字」仍是整句英文評分出來的字串，用歌曲語言的 `norm`／`stop`，第二期再改。
> - `Pronunciation.say/prefetch` 仍收字串、只查英文字典（第一期 `ml-quiz-tts` 改）。

**第一期（聽聽看＋填填看），第 0 步之後平行，檔案不重疊**

| 分支 | 範圍（檔案） | 估計 |
|---|---|---|
| `feature/ml-pipeline` | `backend/tools/build_content.py`（含本機 LRC 覆蓋、去掉逐字時間當 key、外語 token 標 `l`）、`backend/tools/requirements-tools.txt`、`backend/main.py`、`backend/test_main.py` | 2 天 |
| `feature/ml-lyrics-ui` | `lyrics-panel.*`、`word-pop.ts`、`styles.css`（字型）、`shared/song-card.ts`（語言標籤） | 1 天 |
| `feature/ml-quiz-tts` | `quiz-panel.*`（含最難聽發音選字）、`pronunciation.ts`（`say(token, lang)`、TTS 解鎖）、`play-session.ts`（停下來時唸）、`reward-rules.ts`、`help.html`＋對應 spec | 1～1.5 天 |
| `feature/ml-content` | `public/songs/` 三首 json＋`index.json`＋`dict.ja.json`、`songs-data.spec.ts`、`docs/adding-a-song.md`、`backend/tools/lrc-tap.html`（句子＋逐字模式）；兩首歌手動對時間 | 2～2.5 天＋教育顧問題目字表（三個難度） |
| 內容工程師（持續） | 用逐字模式重敲歌曲（含既有英文歌） | 每首約 1～2 小時，可選，不擋上線 |

`play-session.ts` 只有 `ml-quiz-tts` 會碰（第 0 步之後）。

第一期合計約 8.5～9.5 人天（比上一版多約 1.5 天：最難聽音 +0.5～1、逐 token 語言 +0.5～1），平行約 4.5 個工作天（含第 0 步）。

**第二期（唱唱看）**：spike tiny/base（1 天）→ `speech-recognizer.ts`（per-lang 模型、language、幻覺字串）＋`scoring.ts`（`scoreChars`＋測試）＋`sing-panel.*`（`lang` 屬性、ruby）＋`play-session.ts`（門檻、評分選擇）約 2 天。合計約 3 人天，單線（不變）。

### 風險

| 風險 | 影響 | 對策 |
|---|---|---|
| Whisper 對小朋友日文的辨識率 | 唱唱看一直不過，挫折 | spike 實測；門檻 `pass` 可調；token 原文或讀音任一符合即可；最壞情況日文唱唱看只給練習 🎤 |
| 日文模式的 Whisper 把英文字寫成片假名 | 歌裡的英文 token 判成沒唸 | 門檻本來就容許少數字沒對；真的常發生再讓 `readings` 給英文 token 一個片假名別名（只給評分用） |
| 日文模型下載 80MB（base） | 第一次進唱唱看等很久、行動網路 | 進度文字照舊；先在 Wi-Fi 下載；之後瀏覽器快取 |
| iOS 擋住非點擊時的自動發音（最難聽音） | 停下來沒聲音 | 首次 pointerdown 解鎖 `speechSynthesis`；畫面一定有「🔊 再聽一次」按鈕 |
| 聽發音選字對五十音歌太難（選項都是假名） | 最難很少人過 | 本來就是「最難」；干擾字來自同一份清單，顧問挑字時避開讀音太像的 |
| LRCLIB 503 | 建 db 卡住 | `get_json` 已重試 8 次；建議預設只抓「db 裡還沒有」的歌，指定 id 才重抓 |
| 讀音錯（MeCab 選錯讀法、歌詞特殊唸法） | 小朋友學錯 | `readings` 覆蓋；上傳前家長／顧問看一遍讀音 |
| 165 BPM 卡拉 OK 與停點 | 亮字和歌聲對不上 | 權重估計＋句尾留白（§5.1，旋鈕可調）；重要的歌用逐字模式敲真的時間 |
| 本機 `data/lrc/` 遺失 | 敲好的時間沒了，只能重敲 | 內容工程師自己備份；content.db 本身也有完整 LRC，可從伺服器那份還原 |
| 逐字時間檔的句子和原句不一致 | 翻譯、tokens 對不上 | `lrc-tap.html` 輸出前檢查；`build_content.py` 照舊用去掉時間戳的句子當 key |
| 手動對時間不準 | 歌詞跳太早／太晚 | 家長設定時間差＋直接改 `.lrc` |
| MyMemory 日文→繁中品質 | 翻譯怪 | 家長在本機修改（現有 `tr_<id>`） |
| 第 0 步改到很多檔 | 和其他進行中的分支衝突 | 第 0 步排在沒有其他前端分支時合併 |

---

## 9. PO 決定（2026-11-02）

1. **讀音輔助預設平假名**，循環「平假名 → 羅馬拼音 → 關」，每台裝置記住。→ D5、§5。
2. **日文要有金色小卡**：日文「最難」＝聽發音選字（不用打字），全部一次答對＝金色。通用設定 `expert: 'typed' | 'listen'`，英文維持 `typed`。→ D6、§5.3。
3. **題數依語言**：日文普通 6～10、挑戰 10～20、最難 10～20，`songs-data.spec.ts` 依語言檢查。→ D13、§7。
4. **第二期模型**：spike 後定，預設 base（不變）。→ §6.1。
5. **日文歌裡的英文字逐 token 當英文**：英文字典、英文發音、英文音節權重、沒有 ruby；日文唱唱看評分仍比對原文。逐 token 語言是通用機制（任何歌都可以含其他已設定語言的 token）。→ D10、§3、§4.4。
