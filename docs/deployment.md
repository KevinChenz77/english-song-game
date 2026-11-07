# 部署與資料上傳（Railway）

正式環境：一個 Railway 專案、兩個服務，都直接連這個 GitHub repo，**推到 `main` 就自動部署**。
歌詞和翻譯不在 repo 裡（公開 repo），另外用一個 admin API 上傳到後端的 Volume。

```
GitHub main ──自動部署──▶ frontend（靜態網站：Angular build + serve）
            └─自動部署──▶ backend（FastAPI）──▶ Volume /data：game.db（雲端存檔）、content.db（歌詞／翻譯）
本機 data/content.db ──curl 上傳（ADMIN_TOKEN）──▶ backend /data/content.db
```

## 1. 第一次架設

### 1.1 建立兩個服務

1. Railway → **New Project** → **Deploy from GitHub repo** → 選這個 repo（第一次建置會失敗，正常：還沒設 Root Directory）。
2. 這個服務改名 `backend`，**Settings**：

   | 欄位 | 值 |
   |---|---|
   | Source → Root Directory | `/backend` |
   | Source → Branch | `main` |
   | Config-as-code → Railway Config File | `/backend/railway.json`（**一定要填**：設定檔不會跟著 Root Directory 找） |
   | Networking → Generate Domain | port 填 `8080` |

3. 專案畫布右上 **+ Create** → **GitHub Repo** → 同一個 repo，改名 `frontend`，Settings 同上但用 `/frontend`、`/frontend/railway.json`，一樣 Generate Domain、port `8080`。
4. 畫布上對 `backend` 按右鍵 → **Attach Volume**，Mount Path `/data`。**沒有 Volume，每次部署都會清掉雲端存檔和歌詞。**

### 1.2 環境變數（各服務的 Variables）

| 服務 | 變數 | 值 |
|---|---|---|
| backend | `DATA_DIR` | `/data` |
| backend | `PORT` | `8080` |
| backend | `ALLOWED_ORIGINS` | 前端網址，**含 `https://`、結尾不加 `/`**，例：`https://xxx-frontend-production.up.railway.app`；多個用逗號分隔 |
| backend | `ADMIN_TOKEN` | 長隨機字串，用下面的指令產生；**只放 Railway 和自己的密碼管理器，不寫進任何檔案、不貼給別人** |
| frontend | `PORT` | `8080` |
| frontend | `API_URL` | 後端網址，含 `https://`、結尾不加 `/` |

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 1.3 部署

把 `release/*` 合進 `main` 推上去（git flow，見 [architecture.md](architecture.md)）。兩個服務的 `railway.json` 有 `watchPatterns`，只有自己的資料夾有改動才重新部署（只改 `docs/` 不會部署）。

| | 後端 `backend/railway.json` | 前端 `frontend/railway.json` |
|---|---|---|
| 建置 | Railpack（`requirements.txt`、`.python-version` 3.12） | Railpack（`npm ci`，Node 依 `package.json` 的 `engines`）＋ `npm run build` |
| 啟動 | `uvicorn main:app --host 0.0.0.0 --port $PORT` | `npm run start:prod`：`API_URL` 沒設就退出 → 寫 `config.json` → `serve -s`（SPA 回退；`public/serve.json` 讓 index.html、config.json、songs/ 不快取） |
| 健康檢查 | `/api/health` | `/` |

### 1.4 上傳歌詞（content.db）

部署好之後在**自己電腦**的 repo 根目錄執行（zsh；token 用 `read -s` 輸入，不會顯示、不會留在指令記錄）：

```bash
read -s "T?ADMIN_TOKEN: " && echo && curl -s -X POST -H "Authorization: Bearer $T" --data-binary @data/content.db https://<後端網址>/api/admin/content; unset T; echo
```

| 回應 | 意思 |
|---|---|
| `{"ok":true,"songs":N}` | 成功，N＝歌曲數 |
| `unauthorized` | token 不對（多了空白？） |
| `admin_disabled` | 後端沒設 `ADMIN_TOKEN` |
| `too_many_attempts` | 錯太多次，暫時鎖住，等一下再試 |
| `bad_content` | 不是合格的 content.db |

上傳是**整檔替換**：本機的 content.db 必須包含**所有**歌。

### 1.5 檢查

```bash
B=https://<後端網址>; F=https://<前端網址>
curl -s $B/api/health                                   # {"ok":true}
curl -s $F/config.json                                  # {"apiBaseUrl":"<後端網址>"}
curl -s -o /dev/null -w '%{http_code}\n' $B/api/songs/letitgo/content   # 200（上傳前是 404）
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS -H "Origin: $F" \
  -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type" $B/api/save  # 200
```

最後一個是 400「Disallowed CORS origin」＝ `ALLOWED_ORIGINS` 和前端網址不完全一樣（最常見：少了 `https://`）。雲端存檔會失敗，歌詞照常。

## 2. 之後的更新

| 改了什麼 | 要做的事 |
|---|---|
| 程式、歌曲設定（`frontend/`、`backend/`） | 走 git flow 合進 `main`，自動部署 |
| 加歌 | [adding-a-song.md](adding-a-song.md)：加 json → `build_content.py` 重建 content.db → 合進 `main` → **上傳 content.db（1.4）** |
| 改翻譯 | 見下面 → 上傳 content.db |
| 重新校時間軸（`data/lrc/<id>.lrc`） | `python3.12 backend/tools/build_content.py <id>` → 上傳 content.db |

只部署前端、沒上傳 content.db：新歌選得到，但顯示「歌詞還沒準備好」。

### 改整首歌的翻譯

```bash
python3 backend/tools/translations.py export <song_id>   # 產生 data/translations/<song_id>.tsv（原句⇥中文）
# 用編輯器改第二欄（中文），第一欄原句不要動
python3 backend/tools/translations.py import <song_id>   # 印出 updated / unmatched 句數
```

`unmatched` 不是 0 ＝ 有幾行原句被改到、對不上，那幾句不會更新。改完照 1.4 上傳。

遊戲裡「⚙️ 家長設定」改的翻譯只存在那台裝置的瀏覽器（`tr_<songId>`），不會上傳、也不會進 content.db。

## 3. 資料放哪裡（都不進 git）

| 檔案 | 內容 | 備份 |
|---|---|---|
| `data/content.db` | 歌詞、時間軸、翻譯、日韓文斷詞讀音 | **只有本機這份是原始檔**，請另外備份；雲端那份是上傳的複本 |
| `data/lrc/*.lrc` | 手動校時的歌詞（LRCLIB 沒有的歌） | 同上 |
| `data/translations/*.tsv` | 翻譯的可編輯版 | 同上 |
| 雲端 `/data/game.db` | 雲端存檔（名字＋密碼） | 在 Railway Volume；本機的 `data/game.db` 只是開發用，不會上傳 |
