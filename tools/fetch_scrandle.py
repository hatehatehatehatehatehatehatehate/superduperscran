#!/usr/bin/env python3
"""Mirror Scrandle's public practice data (with real vote ratings) and cache the images.

Only the public, unauthenticated ``/practice`` endpoint is used. It returns
10 seeded pairs (20 items) per call; we walk seeds 1, 2, 3... for the regular
pool and the ``mensa`` (university canteen) pool until new items dry up.

Output
    data/raw/scrandle_raw.json        every unique item + bookkeeping (resumable)
    assets/food/scrandle/<id>.webp    480px WebP copies of each item's photo

Usage
    python3 tools/fetch_scrandle.py                     # full polite mirror
    python3 tools/fetch_scrandle.py --max-seeds 3       # quick trial
    python3 tools/fetch_scrandle.py --no-images         # data only
    python3 tools/fetch_scrandle.py --images-only       # (re)cache missing images

Safe to interrupt and re-run: finished seeds and cached images are skipped.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_PATH = ROOT / "data" / "raw" / "scrandle_raw.json"
IMG_DIR = ROOT / "assets" / "food" / "scrandle"
BASE = "https://scrandle.com"
UA = "Mozilla/5.0 (compatible; EliScrandleRip/0.1; personal fan project; polite mirror)"
POOLS = {"std": "", "mensa": "mensa=true&"}
IMG_MAX = 480
IMG_QUALITY = 74


def log(*args: object) -> None:
    print(*args, flush=True)


def http_get(url: str, retries: int = 4, timeout: int = 25) -> bytes:
    delay = 2.0
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return res.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            code = getattr(exc, "code", None)
            if code in (400, 401, 403, 404) or attempt == retries - 1:
                raise
            log(f"  retry {attempt + 1} for {url} ({exc}); waiting {delay:.0f}s")
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


def load_raw() -> dict:
    if RAW_PATH.exists():
        return json.loads(RAW_PATH.read_text())
    return {"source": BASE + "/practice", "items": {}, "seeds_done": {k: [] for k in POOLS}}


def save_raw(raw: dict) -> None:
    raw["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    raw["count"] = len(raw["items"])
    tmp = RAW_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(raw, ensure_ascii=False, indent=1))
    tmp.replace(RAW_PATH)


def safe_id(item_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", str(item_id))


def fetch_pool(raw: dict, pool: str, args: argparse.Namespace) -> None:
    done = set(raw["seeds_done"].setdefault(pool, []))
    window: list[tuple[int, int]] = []
    for seed in range(1, args.max_seeds + 1):
        if seed in done:
            continue
        url = f"{BASE}/practice?{POOLS[pool]}seed={seed}"
        try:
            pairs = json.loads(http_get(url))
        except Exception as exc:  # keep what we have; the run is resumable
            log(f"[{pool}] seed {seed} failed: {exc}; stopping this pool")
            break
        total = new = 0
        for pair in pairs:
            for item in pair:
                total += 1
                iid = str(item["id"])
                if iid not in raw["items"]:
                    new += 1
                    item["_pools"] = [pool]
                    item["_first_seed"] = f"{pool}:{seed}"
                    raw["items"][iid] = item
                else:
                    known = raw["items"][iid]
                    if pool not in known.setdefault("_pools", []):
                        known["_pools"].append(pool)
                    # Ratings drift as Scrandle players vote: keep the freshest.
                    for key in ("rating", "elo", "price"):
                        if item.get(key) is not None:
                            known[key] = item[key]
        raw["seeds_done"][pool].append(seed)
        save_raw(raw)
        window.append((new, total))
        window = window[-args.window:]
        recent_new = sum(n for n, _ in window) / max(1, sum(t for _, t in window))
        log(f"[{pool}] seed {seed:4d}: +{new:2d} new / {total}  unique={len(raw['items'])}  recent-new={recent_new:.1%}")
        if len(window) == args.window and recent_new < args.min_new:
            log(f"[{pool}] new items dried up (<{args.min_new:.0%} over {args.window} seeds); done")
            break
        time.sleep(args.delay)


def cache_image(item: dict, force: bool = False) -> str:
    from PIL import Image  # Pillow is only needed for the image step

    target = IMG_DIR / f"{safe_id(item['id'])}.webp"
    if target.exists() and not force:
        return "cached"
    urls = list(item.get("images_new") or [])
    if not urls:
        return "no-url"
    data = http_get(urls[0])
    with Image.open(io.BytesIO(data)) as img:
        img = img.convert("RGB")
        img.thumbnail((IMG_MAX, IMG_MAX), Image.Resampling.LANCZOS)
        tmp = target.with_suffix(".tmp")
        img.save(tmp, "WEBP", quality=IMG_QUALITY, method=5)
        tmp.replace(target)
    time.sleep(0.15)
    return "downloaded"


def cache_images(raw: dict, workers: int, force: bool) -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    items = list(raw["items"].values())
    counts: dict[str, int] = {}
    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(cache_image, it, force): it for it in items}
        for i, fut in enumerate(as_completed(futures), 1):
            it = futures[fut]
            try:
                status = fut.result()
            except Exception as exc:
                status = "failed"
                failures.append(f"{it['id']}: {exc}")
            counts[status] = counts.get(status, 0) + 1
            if i % 100 == 0 or i == len(items):
                log(f"[images] {i}/{len(items)} {counts}")
    fail_path = RAW_PATH.parent / "image_failures.txt"
    if failures:
        fail_path.write_text("\n".join(failures) + "\n")
        log(f"[images] {len(failures)} failures -> {fail_path.relative_to(ROOT)} (game falls back to the remote URL)")
    elif fail_path.exists():
        fail_path.unlink()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--max-seeds", type=int, default=600, help="highest seed to request per pool")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between data requests")
    ap.add_argument("--window", type=int, default=12, help="seeds in the dry-up window")
    ap.add_argument("--min-new", type=float, default=0.03, help="stop when the window's new-item share drops below this")
    ap.add_argument("--pools", default="std,mensa", help="comma list of pools: std,mensa")
    ap.add_argument("--workers", type=int, default=4, help="parallel image downloads")
    ap.add_argument("--no-images", action="store_true")
    ap.add_argument("--images-only", action="store_true")
    ap.add_argument("--force-images", action="store_true", help="re-download images even if cached")
    args = ap.parse_args()

    RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
    raw = load_raw()
    if not args.images_only:
        for pool in [p.strip() for p in args.pools.split(",") if p.strip()]:
            if pool not in POOLS:
                ap.error(f"unknown pool {pool!r}")
            fetch_pool(raw, pool, args)
        save_raw(raw)
        log(f"saved {len(raw['items'])} unique items -> {RAW_PATH.relative_to(ROOT)}")
    if not args.no_images:
        cache_images(raw, args.workers, args.force_images)
    return 0


if __name__ == "__main__":
    sys.exit(main())

