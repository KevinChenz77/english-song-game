# 新增一首歌

加歌**不用改任何程式碼**：只加資料檔＋重建 content.db。改到 `.ts`／`.html` 就是做錯了（或發現了該修的 bug，回報前端架構師）。

> ⚠️ 這是公開 repo。**歌詞（任何一句原文）和整句翻譯絕對不能 commit**，包括 json、測試、文件、commit 訊息、PR 說明、截圖。歌詞只存在本機產生的 `content.db`（`*.db` 已在 `.gitignore`），上傳到後端。

## 步驟

1. **選歌、定 id**：id 只能 `[a-z0-9-]`、1～40 字（例：`try-everything`）。檔名＝id＝網址＝進度存檔的 key，**上線後不能改名**（改了小朋友的星星、家長改過的翻譯 `tr_<id>` 都會對不到）。
2. **LRCLIB id**：在 [lrclib.net](https://lrclib.net) 找有**逐句時間（synced）**的版本，記下它的數字 id → `lrclibId`。確認版本跟要用的影片是同一個錄音。
3. **影片與時間差**：
   - `videos`：至少一支 YouTube（第一支是預設），每支一個 `label`（下拉選單文字）和 `offset`（秒；>0＝歌詞延後顯示）。影片要能嵌入播放。
   - `offset` 怎麼抓：先填 0，在遊戲裡用時間差調整到歌詞剛好對上，把調好的數字抄回 json（遊戲裡的調整只存在那台裝置的 `off_<videoId>`）。
   - `karaoke`（選填）：唱唱看用的**純音樂伴奏**影片＋它自己的 `offset`。沒有就不放，唱唱看就沒有伴奏。
4. **貼紙**：一個 emoji → `sticker`（填填看「挑戰」全對時拿到）。**每首歌都要不一樣**，也不能用 🎤、👑（那兩個是唱唱看的共用貼紙）。另外選一個 `emoji` 當選歌卡片圖示（可以跟貼紙一樣）。
5. **填填看單字（教育顧問提供）**：`quiz.normal` **10 個**、`quiz.hard` **18～20 個**、`quiz.expert` **18～20 個**。
   - 全部小寫、只有字母和 `'`（要跟 `norm()` 後一樣，例如 `can't`，不是 `Can't`、`can’t`）。
   - 每個字都要真的出現在歌詞裡；同一個字列兩次＝出兩題（找兩句不同的）。找不到的字會被略過並在 console 印「填填看：找不到…」——上傳 content.db 後每個難度玩一次，看 console 有沒有警告。
6. **字典**：每個題目單字都要查得到中文。
   - 一般解釋加到 `frontend/public/songs/dict.json`，**依字母順序插入**（測試會檢查；多人同時加歌時比較不會衝突）。複數字（`fears`）查不到時會退回原形（`fear`），原形有就不用加。
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
   `src/app/core/songs-data.spec.ts` 會檢查 index.json 裡每首歌：檔案存在、id＝檔名、必填欄位、影片、題數、每個字有中文、貼紙不重複、dict.json 有排序。
10. **實際玩一次**：聽聽看（歌詞對得上）、三個難度的填填看（console 沒有「找不到」警告）、唱唱看（伴奏對得上）。

前端重新部署＋後端 content.db 上傳都完成，新歌才完整可玩（只有前端 → 選得到但顯示「歌詞還沒準備好」）。

## `<id>.json` 欄位

型別定義：`frontend/src/app/core/models/song.model.ts`（`Song`）。

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id` | ✅ | ＝檔名，`^[a-z0-9-]{1,40}$` |
| `title` | ✅ | 歌名（英文原名） |
| `artist` | ✅ | 演唱者 |
| `from` | ✅ | 出處，例：`冰雪奇緣 Frozen` |
| `emoji` | ✅ | 選歌卡片圖示 |
| `lrclibId` | ✅ | LRCLIB 歌詞 id（正整數），只給 `build_content.py` 用，前端不讀 |
| `videos` | ✅ | `[{ id, label, offset }]`，至少一支；`id`＝11 碼 YouTube videoId；第一支是預設 |
| `karaoke` | | `{ id, offset }`：唱唱看伴奏（純音樂）影片 |
| `sticker` | ✅ | 填填看「挑戰」全對的專屬貼紙，跟其他歌、🎤、👑 都不同 |
| `quiz` | ✅ | `{ normal: 10 個, hard: 18～20 個, expert: 18～20 個 }`，小寫單字 |
| `dict` | | `{ word: 中文 }`：這首歌專用的解釋，覆蓋 `dict.json` |

**不要**放進 json 的：`lyrics`、`lines`、`translations` 或任何歌詞片段。

## 絕對不能 commit

- 歌詞原文（整首或任何一句）、整句翻譯
- `content.db`、任何 `*.db`
- `ADMIN_TOKEN`、`.env`
