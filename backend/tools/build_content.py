"""Build content.db (lyrics + line translations + tokens) for the backend. content.db is never committed.

Songs come from frontend/public/songs/index.json; each <id>.json gives exactly one of "lrclibId" / "localLrc": true,
and optionally "lang" (default "en") and "readings" ({word: hiragana}, fixes wrong MeCab readings).
For every song: take the LRC from data/lrc/<id>.lrc if it exists (overrides LRCLIB, may be Enhanced LRC),
otherwise fetch synced LRC from LRCLIB; translate each unique line to Traditional Chinese via MyMemory
(<lang>|zh-TW); for languages with an analyzer (ja) store per-line tokens. Existing translations/tokens are reused
(tokens of lines containing a "readings" word are recomputed).
Upload replaces the whole server DB, so build into the same DB every time: song_id args only limit
which songs are (re-)fetched, all other songs already in the DB are kept.
English needs only the stdlib; Japanese songs need: pip install -r backend/tools/requirements-tools.txt

Usage (from repo root):
    python3.12 backend/tools/build_content.py [--db data/content.db] [song_id ...]
    python3.12 backend/tools/build_content.py --check      # offline self-check (made-up lines only)
Adding a song = add <id>.json + append to index.json + run this + upload:
    curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" --data-binary @data/content.db \\
         -H 'Content-Type: application/octet-stream' <backend>/api/admin/content
Prints counts only, never lyrics.
"""
import argparse, functools, json, pathlib, random, re, sqlite3, sys, tempfile, time, urllib.parse, urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
SONGS_DIR = ROOT / "frontend/public/songs"
LRC_DIR = ROOT / "data/lrc"
LINE = re.compile(r"^\[(\d+):(\d+(?:\.\d+)?)\](.*)$", re.ASCII)  # same as frontend parseLrc
STAMP = re.compile(r"<\d+:\d+(?:\.\d+)?>", re.ASCII)  # Enhanced LRC word stamp, same as frontend parseLrc
SCHEMA = """
CREATE TABLE IF NOT EXISTS songs (song_id TEXT PRIMARY KEY, lrc TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS translations (song_id TEXT NOT NULL, line TEXT NOT NULL, zh TEXT NOT NULL, PRIMARY KEY (song_id, line));
CREATE TABLE IF NOT EXISTS tokens (song_id TEXT NOT NULL, line TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (song_id, line));
"""
KANJI = re.compile(r"[㐀-䶿一-鿿々]")
LATIN = re.compile(r"([A-Za-z][A-Za-z'’]*)")  # MeCab mangles latin words (don't → don ' t): keep them whole
EDGE_PUNCT = re.compile(r"^\W+|\W+$")


@functools.cache
def _ja():
    import cutlet, fugashi  # tool-only deps, imported only when a ja song is built
    kat = cutlet.Cutlet()
    kat.use_foreign_spelling = False  # ラーメン → raamen, not "Rahmen"
    kat.use_wo = False  # Hepburn: を → o
    return fugashi.Tagger(), kat


def hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def ja_tokens(text, readings):
    """[[s, r, ro], ...]: whitespace is always a boundary; auxiliaries / て and punctuation join the previous token;
    r (hiragana) only when s has kanji (or readings overrides it)."""
    tagger, kat = _ja()
    toks = []  # [surface, kana parts, surface parts without punctuation]

    def add(surface, kana, sym, glue):
        # a token that is only punctuation so far (leading 「) takes the next word too
        if not (len(toks) > start and (sym or glue or not toks[-1][2])):
            toks.append(["", [], []])
        toks[-1][0] += surface
        if not sym:
            toks[-1][1].append(kana)
            toks[-1][2].append(surface)

    for seg in text.split():
        start = len(toks)
        for part in LATIN.split(seg):
            if LATIN.fullmatch(part):
                add(part, part, False, False)
                continue
            for w in tagger(part):
                f = w.feature
                add(w.surface, f.kana or w.surface, f.pos1 in ("補助記号", "空白"),
                    f.pos1 == "助動詞" or (f.pos2 == "接続助詞" and f.lemma == "て"))
    out = []
    for s, kana, plain in toks:
        base = "".join(plain)
        r = readings.get(base) or (hira("".join(kana)) if KANJI.search(base) else None)
        ro = kat.romaji(readings.get(base) or base, capitalize=False) if base else None
        out.append([s, r, ro or None])
    return out


# Per-language behaviour, mirrors frontend core/lang.ts LANGS. MyMemory always gets f"{code}|zh-TW".
LANGS = {
    "en": {"tokens": None, "match": re.compile(r"^[A-Za-z][A-Za-z'’]*$")},  # same as frontend LANGS.en.match
    "ja": {"tokens": ja_tokens, "match": None},
}


def tag_foreign(toks, lang):
    """Tokens that match ANOTHER language's `match` get l=<code> and no reading; trailing empty fields dropped."""
    for t in toks:
        word = EDGE_PUNCT.sub("", t[0])  # "days," is still an English word
        code = next((c for c, L in LANGS.items() if c != lang and L["match"] and L["match"].match(word)), None)
        if code:
            t[1:] = [None, None, code]
        while t[-1] is None:
            t.pop()
    return toks


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


def line_texts(lrc):
    """(text, has word stamps) per timed line, text exactly as frontend parseLrc: stamps removed, trimmed."""
    for ln in lrc.split("\n"):
        m = LINE.match(ln)
        if m and (text := STAMP.sub("", m[3]).strip()):
            yield text, STAMP.search(m[3]) is not None


def lyric_lines(lrc):
    """Unique line texts exactly as the frontend keys translations/tokens."""
    return list(dict.fromkeys(t for t, _ in line_texts(lrc)))


def source_error(song):
    lid, local = song.get("lrclibId"), song.get("localLrc")
    has_id = isinstance(lid, int) and not isinstance(lid, bool) and lid > 0
    if not ((has_id and local is None) or (lid is None and local is True)):
        return "needs exactly one of lrclibId (positive int) / localLrc: true"
    if song.get("lang", "en") not in LANGS:
        return f"unknown lang {song.get('lang')!r}"


def song_lrc(sid, song, lrc_dir=LRC_DIR):
    """(lrc, source): local data/lrc/<id>.lrc overrides LRCLIB for any song; localLrc songs require it."""
    local = lrc_dir / f"{sid}.lrc"
    if local.exists():
        return local.read_text(encoding="utf-8"), "local"
    if song.get("localLrc"):
        sys.exit(f"{sid}: localLrc but {local} is missing")
    return get_json(f"https://lrclib.net/api/get/{song['lrclibId']}")["syncedLyrics"] or "", "lrclib"


def translate(text, lang):
    q = urllib.parse.urlencode({"q": text, "langpair": f"{lang}|zh-TW"})
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
        song = json.loads((SONGS_DIR / f"{sid}.json").read_text(encoding="utf-8"))
        if e := source_error(song):
            sys.exit(f"{sid}.json: {e}")
        lang = song.get("lang", "en")
        lrc, src = song_lrc(sid, song)
        lines = lyric_lines(lrc)
        if not lines:
            sys.exit(f"{sid}: no synced lyrics")
        stamped = sum(s for _, s in line_texts(lrc))
        old = dict(db.execute("SELECT line, zh FROM translations WHERE song_id = ?", (sid,)))
        tr, new, missing = {}, 0, 0
        for text in lines:
            if text in old:
                tr[text] = old[text]
                continue
            zh = translate(text, lang)
            time.sleep(1.5)  # be polite to the free API
            if zh:
                tr[text], new = zh, new + 1
            else:
                missing += 1
        tok, tok_new = {}, 0
        if analyze := LANGS[lang]["tokens"]:
            readings = song.get("readings") or {}
            old_tok = dict(db.execute("SELECT line, json FROM tokens WHERE song_id = ?", (sid,)))
            for text in lines:
                if text in old_tok and not any(w in text for w in readings):
                    tok[text] = old_tok[text]
                else:
                    tok[text], tok_new = json.dumps(tag_foreign(analyze(text, readings), lang), ensure_ascii=False), tok_new + 1
        with db:
            db.execute("INSERT OR REPLACE INTO songs VALUES (?, ?, ?)",
                       (sid, lrc, datetime.now(timezone.utc).isoformat(timespec="seconds")))
            db.execute("DELETE FROM translations WHERE song_id = ?", (sid,))
            db.executemany("INSERT INTO translations VALUES (?, ?, ?)", [(sid, k, v) for k, v in tr.items()])
            db.execute("DELETE FROM tokens WHERE song_id = ?", (sid,))
            db.executemany("INSERT INTO tokens VALUES (?, ?, ?)", [(sid, k, v) for k, v in tok.items()])
        print(f"{sid} [{lang}]: source {src} ({stamped} lines with word stamps), {len(lines)} lines, "
              f"{len(tr)} translations ({len(tr) - new} reused, {new} new, {missing} missing), "
              f"{len(tok)} token lines ({tok_new} new)")
    have = {r[0] for r in db.execute("SELECT song_id FROM songs")}
    total = db.execute("SELECT COUNT(*) FROM translations").fetchone()[0]
    total_tok = db.execute("SELECT COUNT(*) FROM tokens").fetchone()[0]
    db.close()
    print(f"{db_path}: {len(have)} songs, {total} translations, {total_tok} token lines")
    lack = [s for s in load_index() if s not in have]
    if lack:
        sys.exit(f"NOT ready to upload, songs missing from db: {lack}")


def load_index():
    return json.loads((SONGS_DIR / "index.json").read_text(encoding="utf-8"))


def check():
    """Offline self-test with made-up lines (never real lyrics)."""
    assert lyric_lines("[00:01.00] red fox\n[00:02.00]\n[00:03.5]red fox\n[01:02.25] big boat \nnoise") == ["red fox", "big boat"]
    # Enhanced LRC: stamps removed before keying; malformed stamps stay text (same strict regex as the frontend)
    enh = "[00:01.00]<00:01.00> red <00:01.50>fox\n[00:02.00]<00:02.10>big<00:02.40> boat<00:03.00>\n[00:04.00]<1:2>x <a:1.0>y\n[00:05.00]<00:05.00>"
    assert list(line_texts(enh)) == [("red fox", True), ("big boat", True), ("x <a:1.0>y", True)], list(line_texts(enh))
    assert lyric_lines(enh + "\n[00:06.00]red fox") == ["red fox", "big boat", "x <a:1.0>y"]
    assert lyric_lines("[00:01.00]a<０:１>b") == ["a<０:１>b"]  # full-width digits are not a stamp (JS \d is ASCII)
    # song source: exactly one of lrclibId / localLrc
    for s, ok in (({"lrclibId": 5}, True), ({"localLrc": True}, True), ({}, False), ({"lrclibId": 5, "localLrc": True}, False),
                  ({"lrclibId": "5"}, False), ({"lrclibId": True}, False), ({"lrclibId": 0}, False), ({"localLrc": False}, False),
                  ({"localLrc": True, "lang": "ja"}, True), ({"lrclibId": 5, "lang": "xx"}, False)):
        assert (source_error(s) is None) == ok, s
    # local LRC overrides LRCLIB for any song; localLrc without a file is an error
    with tempfile.TemporaryDirectory() as d:
        d = pathlib.Path(d)
        (d / "t.lrc").write_text("[00:01.00]<00:01.00>blue <00:01.40>sky", encoding="utf-8")
        assert song_lrc("t", {"lrclibId": 1}, d) == ("[00:01.00]<00:01.00>blue <00:01.40>sky", "local")
        assert song_lrc("t", {"localLrc": True}, d)[1] == "local"
        try:
            song_lrc("nofile", {"localLrc": True}, d)
            raise AssertionError("missing local lrc must fail")
        except SystemExit:
            pass
    # foreign tokens: other language's match → l, no reading; own-language match is ignored
    assert tag_foreign([["ねこ", None, "neko"], ["学校", "がっこう", "gakkou"], ["happy", None, "happy"], ["days,", None, "days"]], "ja") == \
        [["ねこ", None, "neko"], ["学校", "がっこう", "gakkou"], ["happy", None, None, "en"], ["days,", None, None, "en"]]
    assert tag_foreign([["happy", None, None]], "en") == [["happy"]]
    ids = load_index()
    for sid in ids:
        assert source_error(json.loads((SONGS_DIR / f"{sid}.json").read_text(encoding="utf-8"))) is None, sid
    try:
        _ja()
    except ImportError:
        print("check: ja analyzer skipped (pip install -r backend/tools/requirements-tools.txt)")
    else:
        got = tag_foreign(ja_tokens("ねこと学校へ行きたいです。 「本」を読んで happy days", {"本": "ほん"}), "ja")
        assert got == [["ねこ", None, "neko"], ["と", None, "to"], ["学校", "がっこう", "gakkou"], ["へ", None, "e"],
                       ["行きたいです。", "いきたいです", "ikitai desu"], ["「本」", "ほん", "hon"], ["を", None, "o"],
                       ["読んで", "よんで", "yonde"], ["happy", None, None, "en"], ["days", None, None, "en"]], got
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
