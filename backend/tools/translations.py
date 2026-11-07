"""Export / import one song's line translations as an editable TSV (line<TAB>zh), so a parent can rewrite them.

    python3 backend/tools/translations.py export <song_id>   # content.db -> data/translations/<song_id>.tsv
    python3 backend/tools/translations.py import <song_id>   # data/translations/<song_id>.tsv -> content.db

Import only updates lines that already exist in content.db (matched on the exact original line) and prints counts,
never lyrics. data/ is gitignored: the TSV holds lyrics and must never be committed. Upload content.db afterwards.
"""
import csv, pathlib, sqlite3, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
DB = ROOT / "data/content.db"
TSV_DIR = ROOT / "data/translations"


def main(cmd: str, song: str) -> None:
    db = sqlite3.connect(DB)
    tsv = TSV_DIR / f"{song}.tsv"
    if cmd == "export":
        rows = db.execute("SELECT line, zh FROM translations WHERE song_id = ? ORDER BY rowid", (song,)).fetchall()
        TSV_DIR.mkdir(parents=True, exist_ok=True)
        with tsv.open("w", encoding="utf-8", newline="") as f:
            csv.writer(f, delimiter="\t", lineterminator="\n").writerows(rows)
        print(f"exported {len(rows)} lines to {tsv.relative_to(ROOT)}")
    elif cmd == "import":
        with tsv.open(encoding="utf-8", newline="") as f:
            rows = [r for r in csv.reader(f, delimiter="\t") if len(r) == 2 and r[1].strip()]
        with db:
            hit = sum(db.execute("UPDATE translations SET zh = ? WHERE song_id = ? AND line = ?",
                                 (zh.strip(), song, line)).rowcount for line, zh in rows)
        print(f"rows {len(rows)} updated {hit} unmatched {len(rows) - hit}")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
