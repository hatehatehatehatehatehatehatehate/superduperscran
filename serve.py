#!/usr/bin/env python3
"""Local server for Eli's Scrandle Rip that SAVES EVERY ANSWER TO A FILE.

Browsers cannot write files from a double-clicked page, so play through this
server to have each answer appended to:

    data/answers/answers.jsonl   one JSON object per answer (full record)
    data/answers/answers.csv     the same answers as a spreadsheet-friendly CSV

Usage
    python3 serve.py                 # http://127.0.0.1:8765 (opens your browser)
    python3 serve.py --port 9000 --no-open

Endpoints (used by the game)
    GET  /api/health                 -> {"ok": true, "answers": <count>, ...}
    POST /api/answers                -> body {"answers": [record, ...]}; appends them
    GET  /api/answers/summary        -> per-food shown/picked counts from the saved file
"""
from __future__ import annotations

import argparse
import csv
import json
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ANSWER_DIR = ROOT / "data" / "answers"
JSONL = ANSWER_DIR / "answers.jsonl"
CSV_PATH = ANSWER_DIR / "answers.csv"
MAX_BODY = 1_000_000
# Must match ANSWER_FIELDS in core.mjs (build.py checks this).
ANSWER_FIELDS = [
    "ts", "session", "mode", "daily", "category", "difficulty", "round", "player", "side",
    "pickedId", "pickedTitle", "pickedVenue", "pickedRating", "otherId", "otherTitle", "otherVenue", "otherRating",
    "source", "correct", "gap", "points", "ms",
]
EXTRA_FIELDS = ["leftId", "rightId", "v"]
NUMERIC = {"round", "pickedRating", "otherRating", "gap", "points", "ms", "v"}
LOCK = threading.Lock()


def clean_record(raw: object) -> dict | None:
    """Keep only known fields, coerce types, and cap string lengths."""
    if not isinstance(raw, dict) or not raw.get("pickedId") or not raw.get("otherId"):
        return None
    out = {}
    for key in ANSWER_FIELDS + EXTRA_FIELDS:
        value = raw.get(key)
        if key == "correct":
            value = bool(value)
        elif key in NUMERIC:
            try:
                value = None if value is None else float(value)
                if value is not None and value.is_integer():
                    value = int(value)
            except (TypeError, ValueError):
                value = None
        elif value is not None:
            value = str(value)[:200]
        out[key] = value
    return out


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def set_answer_dir(directory: Path) -> None:
    global ANSWER_DIR, JSONL, CSV_PATH
    ANSWER_DIR = directory.resolve()
    JSONL = ANSWER_DIR / "answers.jsonl"
    CSV_PATH = ANSWER_DIR / "answers.csv"


def count_answers() -> int:
    if not JSONL.exists():
        return 0
    with JSONL.open(encoding="utf-8") as fh:
        return sum(1 for line in fh if line.strip())


def append_answers(records: list[dict]) -> int:
    ANSWER_DIR.mkdir(parents=True, exist_ok=True)
    with LOCK:
        new_csv = not CSV_PATH.exists() or CSV_PATH.stat().st_size == 0
        with JSONL.open("a", encoding="utf-8") as fh:
            for rec in records:
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        with CSV_PATH.open("a", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=ANSWER_FIELDS, extrasaction="ignore")
            if new_csv:
                writer.writeheader()
            # Lowercase booleans so this file matches the in-game CSV export.
            writer.writerows({**r, "correct": "true" if r["correct"] else "false"} for r in records)
        return count_answers()


def answer_summary() -> dict:
    foods: dict[str, dict] = {}
    total = correct = 0
    if JSONL.exists():
        with JSONL.open(encoding="utf-8") as fh:
            for line in fh:
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                total += 1
                correct += bool(rec.get("correct"))
                for key, picked in (("pickedId", 1), ("otherId", 0)):
                    fid = rec.get(key)
                    if fid:
                        row = foods.setdefault(fid, {"shown": 0, "picked": 0})
                        row["shown"] += 1
                        row["picked"] += picked
    return {"answers": total, "correct": correct, "foods": foods}


class Handler(SimpleHTTPRequestHandler):
    server_version = "EliScrandleRip/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        if args and "/api/" in str(args[0]):  # keep the console quiet except for saves
            super().log_message(fmt, *args)

    def end_headers(self) -> None:
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 (http.server naming)
        path = self.path.split("?")[0]
        if path == "/api/health":
            self.send_json({"ok": True, "answers": count_answers(), "files": [rel(JSONL), rel(CSV_PATH)]})
        elif path == "/api/answers/summary":
            self.send_json(answer_summary())
        elif path.startswith("/api/"):
            self.send_json({"error": "not found"}, 404)
        else:
            super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?")[0] != "/api/answers":
            self.send_json({"error": "not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self.send_json({"error": "bad length"}, 413 if length > MAX_BODY else 400)
            return
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json({"error": "bad json"}, 400)
            return
        raw = payload.get("answers") if isinstance(payload, dict) else payload
        raw = raw if isinstance(raw, list) else [raw]
        records = [r for r in (clean_record(x) for x in raw[:500]) if r]
        if not records:
            self.send_json({"error": "no valid answers"}, 400)
            return
        total = append_answers(records)
        self.send_json({"saved": len(records), "total": total})


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-open", action="store_true", help="don't open a browser tab")
    ap.add_argument("--answers-dir", type=Path, default=ANSWER_DIR, help="where answer files are written (tests use a temp dir)")
    args = ap.parse_args()
    set_answer_dir(args.answers_dir)
    ANSWER_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=str(ROOT)))
    url = f"http://{args.host}:{args.port}/"
    print(f"Eli's Scrandle Rip -> {url}")
    print(f"Saving answers to {rel(JSONL)} and {rel(CSV_PATH)}. Ctrl+C to stop.", flush=True)
    if not args.no_open:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye!")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

