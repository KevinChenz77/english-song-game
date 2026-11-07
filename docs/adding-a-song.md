# 新增一首歌

加歌**不用改任何程式碼**：只加資料檔＋重建 content.db。改到 `.ts`／`.html` 就是做錯了（或發現了該修的 bug，回報前端架構師）。

> 🌏 非英文歌（日文等）見下方〈非英文歌〉；LRCLIB 沒有、要自己對時間的歌見〈手動對時間〉。設計背景：[multilingual.md](multilingual.md)。

> ⚠️ 這是公開 repo。**歌詞（任何一句原文）和整句翻譯絕對不能 commit**，包括 json、測試、文件、commit 訊息、PR 說明、截圖。歌詞只存在本機產生的 `content.db`（`*.db` 已在 `.gitignore`），上傳到後端。

## 步驟

1. **選歌、定 id**：id 只能 `[a-z0-9-]`、1～40 字（例：`try-everything`）。檔名＝id＝網址＝進度存檔的 key，**上線後不能改名**（改了小朋友的星星、家長改過的翻譯 `tr_<id>` 都會對不到）。
2. **LRCLIB id**（沒有就見〈手動對時間〉）：在 [lrclib.net](https://lrclib.net) 找有**逐句時間（synced）**的版本，記下它的數字 id → `lrclibId`。確認版本跟要用的影片是同一個錄音。
3. **影片與時間差**：
   - `videos`：至少一支 YouTube（第一支是預設），每支一個 `label`（下拉選單文字）和 `offset`（秒；>0＝歌詞延後顯示）。影片要能嵌入播放。
   - `offset` 怎麼抓：先填 0，在遊戲裡用時間差調整到歌詞剛好對上，把調好的數字抄回 json（遊戲裡的調整只存在那台裝置的 `off_<videoId>`）。
4. **貼紙**：一個 emoji → `sticker`（填填看「挑戰」全對時拿到）。**每首歌都要不一樣**，也不能用 🎤、👑（那兩個是唱唱看的共用貼紙）。另外選一個 `emoji` 當選歌卡片圖示（可以跟貼紙一樣）。
5. **填填看單字（教育顧問提供）**：英文 `quiz.normal` **10 個**、`quiz.hard` **18～20 個**、`quiz.expert` **18～20 個**（其他語言見〈非英文歌〉）。
   - 全部小寫、只有字母和 `'`（要跟 `norm()` 後一樣，例如 `can't`，不是 `Can't`、`can’t`）。
   - 每個字都要真的出現在歌詞裡；同一個字列兩次＝出兩題（找兩句不同的）。找不到的字會被略過並在 console 印「填填看：找不到…」——上傳 content.db 後每個難度玩一次，看 console 有沒有警告。
6. **字典**：每個題目單字都要查得到中文。
   - 一般解釋加到 `frontend/public/songs/dict.en.json`（每個語言一個 `dict.<lang>.json`），**依字母順序插入**（測試會檢查；多人同時加歌時比較不會衝突）。複數字（`fears`）查不到時會退回原形（`fear`），原形有就不用加。
   - 只有這首歌才成立的解釋（例：`"let": "讓（let it go = 放手）"`）放這首歌的 `dict`，會覆蓋共用字典。
7. **建 `frontend/public/songs/<id>.json`**（欄位見下表），並把 id 加進 `frontend/public/songs/index.json`（陣列順序＝選歌畫面順序）。
8. **建 content.db 並上傳**（內容工程師）：
   - `backend/tools/build_content.py` 依 `index.json` 和每首的 `lrclibId` 抓歌詞、產生整句翻譯，輸出本機 `content.db`（用法見該檔 `--help`）。
   - `POST /api/admin/content`（`Authorization: Bearer <ADMIN_TOKEN>`，body＝整個 db 檔）。⚠️ 上傳是**整檔替換**：db 裡必須包含**所有**歌，不是只有新的那首，否則舊歌會變「這首歌的歌詞還沒準備好」。
   - content.db 不 commit；ADMIN_TOKEN 不寫進任何檔案。
9. **跑檢查**：
   ```bash
   cd frontend && npx ng test --watch=false && npx ng build
   ```
   `src/app/core/songs-data.spec.ts` 會檢查 index.json 裡每首歌：檔案存在、id＝檔名、必填欄位、影片、題數、每個字有中文、貼紙不重複、每個 `dict.<lang>.json` 有排序；`lang`、題數範圍依歌曲語言（`core/lang.ts`）、`lrclibId`／`localLrc` 剛好一個。
10. **實際玩一次**：聽聽看（歌詞對得上）、三個難度的填填看（console 沒有「找不到」警告）、唱唱看（背景原唱對得上）。

前端重新部署＋後端 content.db 上傳都完成，新歌才完整可玩（只有前端 → 選得到但顯示「歌詞還沒準備好」）。

## 非英文歌（以日文為例）

和上面的步驟一樣，差別只有：

1. json 寫 `"lang": "ja"`（必須是 `frontend/src/app/core/lang.ts` 的 `LANGS` 裡有的語言；沒寫＝英文）。
2. **題數依語言**（`LANGS[lang].quizRange`）：日文普通 **6～10**、挑戰 **10～20**、最難 **10～20**。日文的「最難」是**聽發音選字**（唸出空格的字、選原文），不是打字。
3. **題目字＝斷詞後的 token 原文**（漢字／假名照歌詞寫），用該語言的 `norm` 過：日文是 NFKC、片假名轉平假名、去標點（例：歌詞的「キミ」題目要寫 `きみ`，「イメージ」寫 `いめーじ`）。
   - 斷詞以 `build_content.py` 的 fugashi＋unidic-lite 為準：**空白永遠是 token 邊界**；助動詞、接續助詞「て」會併進前一個字（「なって」「忘れた」是一個 token，「余計な」「便利だ」也是 → 這種不要拿來當題目字，挑單獨的名詞、形容詞、動詞）。
   - 後端還沒給 tokens 時前端用 `Intl.Segmenter` 保底斷詞，兩種切法都找得到的字最保險。
   - 每個字都要能分到**不同的一句**（同一句只出一題），題數才夠。
4. **字典**：題目字的中文放 `frontend/public/songs/dict.ja.json`（key＝norm 後的原文，依 Unicode 排序）。歌裡的**英文字**（例：Butter-Fly 的 love、wow）算英文：題目字寫英文 norm 後的樣子（小寫），中文放 `dict.en.json`。
5. **讀音錯了**：在 json 加 `"readings": { "詞": "正確平假名" }`（只放單詞，不是歌詞句子），重建 content.db。上傳前請家長／顧問看一遍讀音。
6. 內容工程師先 `pip install -r backend/tools/requirements-tools.txt`（fugashi、unidic-lite、cutlet；只裝在自己電腦）。
7. 選題時自己檢查找不找得到（只印數字、不印歌詞），或上傳後每個難度玩一次看 console 有沒有「填填看：找不到…」。

## 手動對時間（LRCLIB 沒有這首）

工具：`backend/tools/lrc-tap.html`（不存、不送任何東西）。

1. 開本機伺服器（YouTube 內嵌需要 http 網址，`file://` 不行）：
   ```bash
   python3 -m http.server 8002 -d backend/tools
   ```
   瀏覽器開 `http://localhost:8002/lrc-tap.html`。
2. 填 videoId →「載入影片」。貼歌詞，一行一句（歌詞從官方影片字幕／畫面文字或官方來源抄，**只存在自己電腦**）。
3. **句子模式**：選「句子模式」→「開始」→ 播影片，每句開頭按空白鍵（或大按鈕）；按錯按 Backspace 退一下。也可以暫停、拖到某句開頭再按（暫停時按就是那一格的時間）。
4. **逐字模式**（目前用不到：歌詞只亮整句，2026-11-07 PO 決定）：行內用空白（保留）或 `|`（輸出時拿掉，給日文這種沒空白的語言）標出要敲的位置 → 選「逐字模式」、速度 0.5 或 0.75 →「開始」，每段開頭敲一下。時間讀的是影片時間，慢速播放不用換算。
   - 已經有句子時間的（例如 LRCLIB 的 LRC）可以直接貼進去，逐字模式只敲字的時間、保留句子開頭。
5. 「反應時間修正」預設 −0.1 秒（扣掉手按下去的延遲）；暫停後拖到位置再按的話改 0。
6. 「產生 LRC」：工具會檢查去掉時間戳後每句和原句一字不差，不一致就不輸出。
7. 把結果存成**主 repo** 的 `data/lrc/<id>.lrc`（`data/` 已在 .gitignore，**不會也不能 commit**）。⚠️ 這個檔案只在你的電腦上：**自己備份**（例如私人雲端硬碟），電腦壞了只能重敲（content.db 裡也有一份完整 LRC 可以救回）。
8. LRCLIB 沒有的歌：json 寫 `"localLrc": true`、**不寫** `lrclibId`（兩個剛好一個）；照常跑 `build_content.py`（找不到 `data/lrc/<id>.lrc` 會報錯）、上傳。
9. 已上線的歌想修時間：同樣存 `data/lrc/<id>.lrc` 就會覆蓋 LRCLIB，json 不用改。
10. 微調：個別句子直接改 `.lrc` 的時間；整體差幾秒就改 json 的 `offset`。

韓文歌（`"lang": "ko"`）同上：後端產生羅馬拼音（`ko_romaji`，含連音和 ㄹㄹ），其他音變用 `readings` 逐詞覆蓋，值寫羅馬拼音。字典是 `dict.ko.json`。

## `<id>.json` 欄位

型別定義：`frontend/src/app/core/models/song.model.ts`（`Song`）。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id` | ✅ | ＝檔名，`^[a-z0-9-]{1,40}$` |
| `lang` | | 語言 code（`core/lang.ts` 的 `LANGS`），沒寫＝`en` |
| `title` | ✅ | 歌名（原名；非英文歌可加中文，例：`ひらがなのうた（平假名之歌）`） |
| `artist` | ✅ | 演唱者 |
| `from` | ✅ | 出處（中文為主），例：`冰雪奇緣 Frozen`、`數碼寶貝 Digimon Adventure` |
| `emoji` | ✅ | 選歌卡片圖示 |
| `lrclibId` | ✅＊ | LRCLIB 歌詞 id（正整數），只給 `build_content.py` 用，前端不讀。＊和 `localLrc` 剛好一個 |
| `localLrc` | ✅＊ | `true`＝LRCLIB 沒有，歌詞在本機 `data/lrc/<id>.lrc`（手動對時間） |
| `readings` | | `{ 詞: 平假名 }`：修正斷詞工具唸錯的讀音（只放單詞） |
| `videos` | ✅ | `[{ id, label, offset }]`，至少一支；`id`＝11 碼 YouTube videoId；第一支是預設 |
| `sticker` | ✅ | 填填看「挑戰」全對的專屬貼紙，跟其他歌、🎤、👑 都不同 |
| `quiz` | ✅ | `{ normal, hard, expert }`，題數依語言：英文 10／18～20／18～20（小寫單字）、日文 6～10／10～20／10～20（token 原文） |
| `dict` | | `{ word: 中文 }`：這首歌專用的解釋，覆蓋 `dict.<lang>.json` |

**不要**放進 json 的：`lyrics`、`lines`、`translations` 或任何歌詞片段。

## 絕對不能 commit

- 歌詞原文（整首或任何一句）、整句翻譯
- `content.db`、任何 `*.db`
- `ADMIN_TOKEN`、`.env`
