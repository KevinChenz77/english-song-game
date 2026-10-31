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
        {"name": "字" * 21, "password": "1234", "data": DATA},
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
    assert post("/api/save", {"name": "字" * 20, "password": "1234", "data": DATA})[0] == 200
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
