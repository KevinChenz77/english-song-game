"""Build content.db (lyrics + line translations) for the backend. Stdlib only; content.db is never committed.

Songs come from frontend/public/songs/index.json; each <id>.json gives "lrclibId".
For every song: fetch synced LRC from LRCLIB, translate each unique line to Traditional Chinese
via MyMemory (en|zh-TW). Translations already in the target DB are reused.
Upload replaces the whole server DB, so build into the same DB every time: song_id args only limit
which songs are (re-)fetched, all other songs already in the DB are kept.

Usage (from repo root):
    python3.12 backend/tools/build_content.py [--db data/content.db] [song_id ...]
    python3.12 backend/tools/build_content.py --check      # offline self-check
Adding a song = add <id>.json (with lrclibId) + append to index.json + run this + upload:
    curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" --data-binary @data/content.db \\
         -H 'Content-Type: application/octet-stream' <backend>/api/admin/content
Prints counts only, never lyrics.
"""
import argparse, json, pathlib, random, re, sqlite3, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
SONGS_DIR = ROOT / "frontend/public/songs"
LINE = re.compile(r"^\[(\d+):(\d+(?:\.\d+)?)\](.*)$")  # same as frontend parseLrc
SCHEMA = """
CREATE TABLE IF NOT EXISTS songs (song_id TEXT PRIMARY KEY, lrc TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS translations (song_id TEXT NOT NULL, line TEXT NOT NULL, zh TEXT NOT NULL, PRIMARY KEY (song_id, line));
"""


def get_json(url, tries=8):
    for n in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "english-song-game content builder"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # LRCLIB often answers 503 "server busy"
            if n == tries - 1:
                raise
            wait = random.uniform(5, 20) * (n + 1)
            print(f"  retry {n + 1} in {wait:.0f}s ({type(e).__name__})", file=sys.stderr)
            time.sleep(wait)


def lyric_lines(lrc):
    """Unique line texts exactly as the frontend keys translations."""
    out = []
    for ln in lrc.split("\n"):
        m = LINE.match(ln)
        if m and m[3].strip() and m[3].strip() not in out:
            out.append(m[3].strip())
    return out


def translate(text):
    q = urllib.parse.urlencode({"q": text, "langpair": "en|zh-TW"})
    r = get_json(f"https://api.mymemory.translated.net/get?{q}")
    zh = (r.get("responseData") or {}).get("translatedText") or ""
    if str(r.get("responseStatus")) != "200" or not zh or "MYMEMORY WARNING" in zh:
        return None
    return zh


def build(db_path, ids):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(db_path)
    db.executescript(SCHEMA)
    for sid in ids:
        lid = json.loads((SONGS_DIR / f"{sid}.json").read_text(encoding="utf-8")).get("lrclibId")
        if not isinstance(lid, int):
            sys.exit(f"{sid}.json: missing/invalid lrclibId")
        lrc = get_json(f"https://lrclib.net/api/get/{lid}")["syncedLyrics"] or ""
        lines = lyric_lines(lrc)
        if not lines:
            sys.exit(f"{sid}: no synced lyrics")
        old = dict(db.execute("SELECT line, zh FROM translations WHERE song_id = ?", (sid,)))
        tr, new, missing = {}, 0, 0
        for text in lines:
            if text in old:
                tr[text] = old[text]
                continue
            zh = translate(text)
            time.sleep(1.5)  # be polite to the free API
            if zh:
                tr[text], new = zh, new + 1
            else:
                missing += 1
        with db:
            db.execute("INSERT OR REPLACE INTO songs VALUES (?, ?, ?)",
                       (sid, lrc, datetime.now(timezone.utc).isoformat(timespec="seconds")))
            db.execute("DELETE FROM translations WHERE song_id = ?", (sid,))
            db.executemany("INSERT INTO translations VALUES (?, ?, ?)", [(sid, k, v) for k, v in tr.items()])
        print(f"{sid}: {len(lines)} lines, {len(tr)} translations ({len(tr) - new} reused, {new} new, {missing} missing)")
    have = {r[0] for r in db.execute("SELECT song_id FROM songs")}
    total = db.execute("SELECT COUNT(*) FROM translations").fetchone()[0]
    db.close()
    print(f"{db_path}: {len(have)} songs, {total} translations")
    lack = [s for s in load_index() if s not in have]
    if lack:
        sys.exit(f"NOT ready to upload, songs missing from db: {lack}")


def load_index():
    return json.loads((SONGS_DIR / "index.json").read_text(encoding="utf-8"))


def check():
    assert lyric_lines("[00:01.00] red fox\n[00:02.00]\n[00:03.5]red fox\n[01:02.25] big boat \nnoise") == ["red fox", "big boat"]
    ids = load_index()
    for sid in ids:
        assert isinstance(json.loads((SONGS_DIR / f"{sid}.json").read_text(encoding="utf-8"))["lrclibId"], int), sid
    print(f"check ok ({len(ids)} songs in index.json)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(ROOT / "data/content.db"))
    ap.add_argument("--check", action="store_true")
    ap.add_argument("songs", nargs="*", help="song ids (default: all in index.json)")
    a = ap.parse_args()
    if a.check:
        check()
    else:
        build(pathlib.Path(a.db), a.songs or load_index())
