"""執行：pytest backend"""
import json
import os
import sqlite3
import tempfile

TMP = tempfile.mkdtemp()
os.environ["DATA_DIR"] = TMP  # 必須在 import main 之前設定，避免寫到 backend/data

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)
DATA = {"version": 1, "savedAt": "x", "players": [{"name": "小明", "avatar": "🐱", "songs": {}, "stickers": []}]}


def post(path, body=None, ip="1.1.1.1", raw=None):
    r = client.post(
        path,
        content=raw if raw is not None else json.dumps(body).encode(),
        headers={"X-Forwarded-For": ip + ", 10.0.0.1", "Content-Type": "application/json"},
    )
    return r.status_code, r.json()


def test_no_static_files_and_health():
    assert client.get("/api/health").json() == {"ok": True}
    for p in ("/", "/index.html", "/songs/a.json", "/main.py", "/data/game.db", "/api/save"):
        r = client.get(p)
        assert r.status_code in (404, 405) and r.json()["ok"] is False, p
    assert client.get("/").json() == {"ok": False, "error": "not_found"}


def test_save_load_and_db():
    assert post("/api/save", {"name": " Amy ", "password": "1234", "data": DATA}) == (200, {"ok": True, "created": True})
    data2 = dict(DATA, savedAt="y")
    assert post("/api/save", {"name": "amy", "password": "1234", "data": data2}) == (200, {"ok": True, "created": False})
    assert post("/api/load", {"name": "AMY", "password": "1234"}) == (200, {"ok": True, "data": data2})
    assert post("/api/load", {"name": "nobody", "password": "1234"}) == (404, {"ok": False, "error": "not_found"})
    # 資料庫內容：不存明碼
    row = sqlite3.connect(os.path.join(TMP, "game.db")).execute("SELECT name_key, name, salt, hash, data FROM accounts").fetchone()
    assert row[0] == "amy" and row[1] == "amy" and len(row[2]) == 32 and "1234" not in row[3] and json.loads(row[4]) == data2


def test_bad_requests():
    bad = [
        {"name": "", "password": "1234", "data": DATA},
        {"name": "   ", "password": "1234", "data": DATA},
        {"name": "字" * 11, "password": "1234", "data": DATA},
        {"name": 123, "password": "1234", "data": DATA},
        {"name": "a", "password": "123", "data": DATA},
        {"name": "a", "password": "x" * 65, "data": DATA},
        {"name": "a", "password": "1234", "data": []},
        {"name": "a", "password": "1234", "data": {"players": {}}},
        {"name": "a", "password": "1234"},
        [1, 2],
    ]
    for b in bad:
        st, r = post("/api/save", b)
        assert st == 400 and r["error"] == "bad_request" and r["ok"] is False and "detail" in r, b
    assert post("/api/load", [1])[0] == 400
    assert post("/api/save", raw=b"{not json")[0] == 400
    assert post("/api/save", {"name": "字" * 10, "password": "1234", "data": DATA})[0] == 200
    assert post("/api/save", raw=b"x" * (256 * 1024 + 1)) == (413, {"ok": False, "error": "bad_request", "detail": "body too large"})


def test_rate_limit():
    post("/api/save", {"name": "bob", "password": "1234", "data": DATA}, ip="9.9.9.9")
    # 錯密碼：前 5 次 401，第 6 次（即使密碼正確、換 IP）429
    for _ in range(5):
        assert post("/api/load", {"name": "bob", "password": "wrong"}, ip="2.2.2.2") == (401, {"ok": False, "error": "wrong_password"})
    assert post("/api/load", {"name": "bob", "password": "1234"}, ip="3.3.3.3") == (429, {"ok": False, "error": "too_many_attempts"})
    assert post("/api/save", {"name": "bob", "password": "1234", "data": DATA}, ip="3.3.3.3")[0] == 429
    # IP 鎖：同一 IP 對別的名字也被擋
    assert post("/api/save", {"name": "newkid", "password": "1234", "data": DATA}, ip="2.2.2.2")[0] == 429
    assert post("/api/save", {"name": "newkid", "password": "1234", "data": DATA}, ip="4.4.4.4")[0] == 200


def test_cors():
    pre = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}
    ok = client.options("/api/save", headers={"Origin": "http://localhost:4200", **pre})
    assert ok.status_code == 200 and ok.headers["access-control-allow-origin"] == "http://localhost:4200"
    bad = client.options("/api/save", headers={"Origin": "https://evil.example", **pre})
    assert "access-control-allow-origin" not in bad.headers


def make_content_db(songs, schema_ok=True):
    """用假資料產生 content.db 的位元組（不放真的歌詞）。"""
    path = os.path.join(tempfile.mkdtemp(), "c.db")
    db = sqlite3.connect(path)
    if schema_ok:
        db.execute("CREATE TABLE songs (song_id TEXT PRIMARY KEY, lrc TEXT NOT NULL, updated_at TEXT NOT NULL)")
    else:
        db.execute("CREATE TABLE songs (song_id TEXT PRIMARY KEY, lyrics TEXT)")
    db.execute("CREATE TABLE translations (song_id TEXT NOT NULL, line TEXT NOT NULL, zh TEXT NOT NULL, PRIMARY KEY (song_id, line))")
    for sid, line in songs.items():
        if schema_ok:
            db.execute("INSERT INTO songs VALUES (?, ?, ?)", (sid, f"[00:01.00] {line}", "2026-11-01T00:00:00+00:00"))
        db.execute("INSERT INTO translations VALUES (?, ?, ?)", (sid, line, "哈囉世界"))
    db.commit()
    db.close()
    with open(path, "rb") as f:
        return f.read()


def admin(raw, token="secret", ip="7.7.7.7"):
    h = {"X-Forwarded-For": ip, "Content-Type": "application/octet-stream"}
    if token is not None:
        h["Authorization"] = "Bearer " + token
    r = client.post("/api/admin/content", content=raw, headers=h)
    return r.status_code, r.json()


def test_name_length():
    assert post("/api/save", {"name": " " + "a" * 10 + " ", "password": "1234", "data": DATA})[0] == 200
    assert post("/api/save", {"name": "a" * 11, "password": "1234", "data": DATA})[0] == 400
    assert post("/api/load", {"name": "a" * 11, "password": "1234"})[0] == 400


def test_content_and_admin(monkeypatch):
    # content.db 還不存在 → 404；格式不符 → 400
    assert client.get("/api/songs/hello/content").json() == {"ok": False, "error": "not_found"}
    for bad in ("Hello", "a_b", "a" * 41):
        assert client.get(f"/api/songs/{bad}/content").status_code == 400, bad
    good = make_content_db({"hello": "hello world"})
    # 沒設定 ADMIN_TOKEN → 503
    monkeypatch.setattr(main, "ADMIN_TOKEN", "")
    assert admin(good) == (503, {"ok": False, "error": "admin_disabled"})
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secret")
    assert admin(good, token=None) == (401, {"ok": False, "error": "unauthorized"})
    assert admin(good, token="nope") == (401, {"ok": False, "error": "unauthorized"})
    # 壞檔、結構不對、超過 256KB 但未超過 20MB 的非 SQLite 檔 → 400（不受一般 API 的 256KB 限制）
    for raw in (b"not sqlite", good[:200], make_content_db({"x": "y"}, schema_ok=False), b"x" * (300 * 1024)):
        assert admin(raw) == (400, {"ok": False, "error": "bad_content"})
    # 超過 20MB → 413
    assert admin(b"x" * (20 * 1024 * 1024 + 1))[0] == 413
    # 先有一筆存檔，確認 admin 上傳不會動到 game.db
    assert post("/api/save", {"name": "keep", "password": "1234", "data": DATA}, ip="8.8.8.8")[0] == 200
    assert admin(good) == (200, {"ok": True, "songs": 1})
    r = client.get("/api/songs/hello/content")
    assert r.status_code == 200 and r.headers["cache-control"] == "public, max-age=300"
    assert r.json() == {"ok": True, "songId": "hello", "lrc": "[00:01.00] hello world",
                        "translations": {"hello world": "哈囉世界"}, "updatedAt": "2026-11-01T00:00:00+00:00"}
    assert client.get("/api/songs/nope/content").status_code == 404
    # 替換後立刻讀到新內容
    assert admin(make_content_db({"hello": "hi there", "try-it": "go go"})) == (200, {"ok": True, "songs": 2})
    assert client.get("/api/songs/hello/content").json()["lrc"] == "[00:01.00] hi there"
    assert client.get("/api/songs/try-it/content").status_code == 200
    assert post("/api/load", {"name": "keep", "password": "1234"}, ip="8.8.8.8") == (200, {"ok": True, "data": DATA})
    assert not [f for f in os.listdir(TMP) if f.endswith(".upload")]  # 暫存檔有清掉


def test_admin_lockout(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "secret")
    for _ in range(5):
        assert admin(b"x", token="bad", ip="6.6.6.6")[0] == 401
    assert admin(make_content_db({"a": "b"}), ip="6.6.6.6") == (429, {"ok": False, "error": "too_many_attempts"})


def test_cors_no_authorization():
    pre = {"Origin": "http://localhost:4200", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization"}
    assert client.options("/api/admin/content", headers=pre).status_code == 400
    r = client.get("/api/songs/x/content", headers={"Origin": "http://localhost:4200"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:4200"
