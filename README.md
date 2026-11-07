# 我會唱這首歌！

給 7～9 歲小朋友在家用的學唱歌遊戲（英文、日文、韓文）：聽聽看、填填看、唱唱看。

- `frontend/`：Angular 網站
- `backend/`：FastAPI＋SQLite（雲端存檔、歌詞 API）；`backend/tools/` 歌詞資料工具
- `docs/`：[架構](docs/architecture.md)、[新增一首歌](docs/adding-a-song.md)、[多語言](docs/multilingual.md)、[部署與資料上傳](docs/deployment.md)

歌詞和翻譯不在這個 repo 裡（`data/` 已 gitignore），要用 `backend/tools/build_content.py` 在本機產生 `data/content.db`。

## 本機開發

```bash
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
DATA_DIR=../data ALLOWED_ORIGINS=http://localhost:4200 .venv/bin/uvicorn main:app --port 8001
```

```bash
cd frontend && npm ci && npx ng serve   # http://localhost:4200，API 位置在 public/config.json
```
