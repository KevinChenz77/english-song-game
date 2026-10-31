"""兒童英文歌遊戲的存檔 API（FastAPI + SQLite）。只提供 API，前端另外部署。"""
import hmac
import json
import os
import secrets
import sqlite3
import threading
import tempfile
import time
from datetime import datetime, timezone
from hashlib import scrypt  # 需 OpenSSL 版 Python；macOS 內建 LibreSSL 版沒有，啟動就會報錯
from typing import Annotated
from urllib.parse import quote

from fastapi import FastAPI, Path, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, StringConstraints
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(BASE_DIR, "data"))
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:4200").split(",") if o.strip()]
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")  # 空字串 = 停用 /api/admin/content
CONTENT_DB = os.path.join(DATA_DIR, "content.db")  # 歌詞與翻譯，唯讀；由 admin 上傳整檔替換

MAX_BODY = 256 * 1024
ADMIN_MAX_BODY = 20 * 1024 * 1024  # 只給 /api/admin/content
ADMIN_PATH = "/api/admin/content"
FAIL_LIMIT = 5
FAIL_WINDOW = 600  # 10 分鐘內
LOCK_SECONDS = 600  # 鎖 10 分鐘

# ponytail: 一個共用連線 + 一把全域鎖序列化所有 DB 存取與失敗計數，家用規模夠用；流量大再改每請求一個連線或換資料庫
# 失敗計數存在記憶體，只適用單一行程（uvicorn 不要開多個 worker）
LOCK = threading.Lock()
FAILS = {}  # key -> [失敗時間戳]
LOCKED_UNTIL = {}  # key -> 解鎖時間

os.makedirs(DATA_DIR, exist_ok=True)
DB = sqlite3.connect(os.path.join(DATA_DIR, "game.db"), check_same_thread=False)
with DB:
    DB.execute(
        "CREATE TABLE IF NOT EXISTS accounts ("
        "name_key TEXT PRIMARY KEY, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL,"
        "data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
    )

# 請求格式（/docs 會依此產生文件）
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10)]
Password = Annotated[str, StringConstraints(min_length=4, max_length=64)]


class SaveData(BaseModel):
    model_config = ConfigDict(extra="allow")  # 除了 players，其他欄位原樣保存
    players: list


class LoadRequest(BaseModel):
    name: Name
    password: Password


class SaveRequest(LoadRequest):
    data: SaveData


app = FastAPI(title="English Song Save API")


def err(code, error, detail=None):
    body = {"ok": False, "error": error}
    if detail is not None:
        body["detail"] = detail
    return JSONResponse(body, status_code=code)


@app.exception_handler(RequestValidationError)
async def on_validation_error(request, exc):
    # FastAPI 預設回 422，改成 400 + 原本的格式
    e = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(x) for x in e.get("loc", ()))
    return err(400, "bad_request", f"{loc}: {e.get('msg', 'invalid request')}")


@app.exception_handler(StarletteHTTPException)
async def on_http_error(request, exc):
    return err(exc.status_code, "not_found" if exc.status_code == 404 else "error")


@app.exception_handler(Exception)
async def on_server_error(request, exc):
    return err(500, "server_error")  # 不洩漏例外細節


@app.middleware("http")
async def limit_body(request: Request, call_next):
    # 先看 Content-Length，超過就不讀內容直接拒絕；沒有 Content-Length（例如 chunked）也拒絕，避免繞過上限
    if request.method == "POST":
        try:
            length = int(request.headers.get("content-length", ""))
        except ValueError:
            return err(400, "bad_request", "missing Content-Length")
        if length > (ADMIN_MAX_BODY if request.url.path == ADMIN_PATH else MAX_BODY):
            return err(413, "bad_request", "body too large")
    return await call_next(request)


# 最後加的 middleware 在最外層，413/400 回應也會帶 CORS 標頭
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],  # 不含 Authorization：admin 端點只從命令列呼叫
)


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def hash_pw(password, salt):
    return scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)


def is_locked(keys, now):
    return any(LOCKED_UNTIL.get(k, 0) > now for k in keys)


def record_fail(keys, now):
    for k in keys:
        recent = [t for t in FAILS.get(k, []) if now - t < FAIL_WINDOW] + [now]
        FAILS[k] = recent
        if len(recent) >= FAIL_LIMIT:
            LOCKED_UNTIL[k] = now + LOCK_SECONDS
            FAILS[k] = []


def client_ip(request):
    xff = request.headers.get("x-forwarded-for", "")
    return xff.split(",")[0].strip() or (request.client.host if request.client else "")


def handle_api(is_load, name, password, data, ip):
    key = name.lower()
    rate_keys = ("name:" + key, "ip:" + ip)
    with LOCK:
        now = time.time()
        if is_locked(rate_keys, now):
            return err(429, "too_many_attempts")
        row = DB.execute("SELECT salt, hash FROM accounts WHERE name_key = ?", (key,)).fetchone()
        if row is None:
            if is_load:
                return err(404, "not_found")
            salt = secrets.token_bytes(16)
            ts = now_iso()
            with DB:  # 交易
                DB.execute(
                    "INSERT INTO accounts (name_key, name, salt, hash, data, created_at, updated_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (key, name, salt.hex(), hash_pw(password, salt).hex(), json.dumps(data, ensure_ascii=False), ts, ts),
                )
            return {"ok": True, "created": True}
        if not hmac.compare_digest(hash_pw(password, bytes.fromhex(row[0])).hex(), row[1]):
            record_fail(rate_keys, now)
            return err(401, "wrong_password")
        FAILS.pop(rate_keys[0], None)
        if is_load:
            stored = DB.execute("SELECT data FROM accounts WHERE name_key = ?", (key,)).fetchone()[0]
            return {"ok": True, "data": json.loads(stored)}
        with DB:
            DB.execute(
                "UPDATE accounts SET name = ?, data = ?, updated_at = ? WHERE name_key = ?",
                (name, json.dumps(data, ensure_ascii=False), now_iso(), key),
            )
        return {"ok": True, "created": False}


# 一般 def（非 async）：FastAPI 放到執行緒池跑，scrypt 不會卡住事件迴圈
@app.post("/api/save")
def save(body: SaveRequest, request: Request):
    return handle_api(False, body.name, body.password, body.data.model_dump(), client_ip(request))


@app.post("/api/load")
def load(body: LoadRequest, request: Request):
    return handle_api(True, body.name, body.password, None, client_ip(request))


@app.get("/api/health")
def health():
    return {"ok": True}


def open_content():
    # 唯讀、每次請求開新連線：上傳替換檔案後下一個請求就讀到新內容
    return sqlite3.connect(f"file:{quote(CONTENT_DB)}?mode=ro", uri=True)


@app.get("/api/songs/{song_id}/content")
def song_content(song_id: Annotated[str, Path(pattern=r"^[a-z0-9-]{1,40}$")]):
    if not os.path.exists(CONTENT_DB):
        return err(404, "not_found")
    db = open_content()
    try:
        row = db.execute("SELECT lrc, updated_at FROM songs WHERE song_id = ?", (song_id,)).fetchone()
        if row is None:
            return err(404, "not_found")
        tr = dict(db.execute("SELECT line, zh FROM translations WHERE song_id = ?", (song_id,)))
    finally:
        db.close()
    body = {"ok": True, "songId": song_id, "lrc": row[0], "translations": tr, "updatedAt": row[1]}
    return JSONResponse(body, headers={"Cache-Control": "public, max-age=300"})


CONTENT_SCHEMA = {"songs": {"song_id", "lrc", "updated_at"}, "translations": {"song_id", "line", "zh"}}


def replace_content(raw):
    """驗證上傳的 SQLite 檔，合格就原子化替換 content.db，回傳歌曲數；不合格回 None。不碰 game.db。"""
    if not raw.startswith(b"SQLite format 3\x00"):
        return None
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, suffix=".upload")  # 同一資料夾，os.replace 才是原子操作
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
        db = sqlite3.connect(f"file:{quote(tmp)}?mode=ro", uri=True)
        try:
            for table, cols in CONTENT_SCHEMA.items():
                if not cols <= {r[1] for r in db.execute(f"PRAGMA table_info({table})")}:
                    return None
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                return None
            count = db.execute("SELECT COUNT(*) FROM songs").fetchone()[0]
        except sqlite3.DatabaseError:
            return None
        finally:
            db.close()
        os.replace(tmp, CONTENT_DB)
        return count
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


@app.post(ADMIN_PATH)
async def upload_content(request: Request):
    if not ADMIN_TOKEN:
        return err(503, "admin_disabled")
    rate_keys = ("ip:" + client_ip(request),)
    given = request.headers.get("authorization", "")
    with LOCK:
        now = time.time()
        if is_locked(rate_keys, now):
            return err(429, "too_many_attempts")
        if not hmac.compare_digest(given.encode(), ("Bearer " + ADMIN_TOKEN).encode()):
            record_fail(rate_keys, now)
            return err(401, "unauthorized")
    raw = await request.body()  # 驗證通過才讀內容
    count = await run_in_threadpool(replace_content, raw)
    if count is None:
        return err(400, "bad_content")
    return {"ok": True, "songs": count}
