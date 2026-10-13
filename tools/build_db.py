#!/usr/bin/env python3
"""Build the game's food database.

Inputs
    data/raw/scrandle_raw.json        from tools/fetch_scrandle.py
    data/custom/manifest.csv          optional: foods from the outsourced image tool
    data/category_overrides.json      optional: per-food / per-venue category fixes

Outputs
    data/foods.json                   human/tool-friendly database
    data/foods.js                     same data as `window.SCRAN_DB = {...}` (works from file://)

Usage
    python3 tools/build_db.py
"""
from __future__ import annotations

import csv
import json
import re
import sys
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalog as C  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "scrandle_raw.json"
MANIFEST = ROOT / "data" / "custom" / "manifest.csv"
OVERRIDES = ROOT / "data" / "category_overrides.json"
OUT_JSON = ROOT / "data" / "foods.json"
OUT_JS = ROOT / "data" / "foods.js"
SCRANDLE_IMG = ROOT / "assets" / "food" / "scrandle"
CUSTOM_IMG = ROOT / "assets" / "food" / "custom"
MIN_PLAYABLE = 8  # foods sharing one rating source needed before a category unlocks
SOURCE_LABELS = {
    "scrandle": "Scrandle crowd rating",
    "mensa": "Scrandle Mensa rating",
}
MANIFEST_FIELDS = ["id", "title", "subtitle", "establishment", "venue", "country", "price",
                   "image_file", "rating", "rating_source", "source_url", "votes"]
VENUE_SLUGS = {v[0] for v in C.VENUES}
DISH_RES = [(d[0], re.compile(d[4], re.I)) for d in C.DISHES]


def warn(msg: str) -> None:
    print(f"warning: {msg}", file=sys.stderr)


def clean(text: object) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def safe_id(item_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", str(item_id))


def is_nation_match(club: str) -> bool:
    head = club.split(",")[0].lower()
    parts = re.split(r"\s+(?:v|vs\.?)\s+", head)
    if len(parts) != 2:
        return False
    norm = [re.sub(r"\s+(women|womens|men)$", "", p.strip()) for p in parts]
    return all(p in C.NATION_WORDS for p in norm)


def classify_venue(club: str, pools: list[str]) -> str:
    if "mensa" in pools or C.UNI.search(club):
        return "canteen"
    if C.INTERNATIONAL.search(club) or is_nation_match(club):
        return "international"
    if C.SOCCER_STRONG.search(club):
        return "football"
    if C.GIGS.search(club):
        return "gigs"
    if C.OTHER_SPORT.search(club):
        return "ballpark"
    if C.OUTABOUT.search(club):
        return "outabout"
    return "football"  # Scrandle's home turf: FootyScran


def classify_dishes(title: str, subtitle: str) -> list[str]:
    text = f"{title} {subtitle}"
    found = [slug for slug, rx in DISH_RES if rx.search(text)]
    return found or [C.MYSTERY[0]]


def price_tier(price: float | None) -> str | None:
    if price is None:
        return None
    for slug, *_rest, lo, hi in C.PRICE_TIERS:
        if slug == "free":
            continue
        if lo <= price < hi:
            return slug
    return "free" if price == 0 else None


def region_of(country: str) -> str:
    info = C.COUNTRIES.get(country)
    return info[1] if info else C.WORLD[0]


def to_float(value: object) -> float | None:
    try:
        text = str(value).strip().replace("£", "").replace("$", "").replace("€", "").replace("%", "")
        return float(text) if text else None
    except ValueError:
        return None


def load_overrides() -> dict:
    if not OVERRIDES.exists():
        OVERRIDES.write_text(json.dumps({
            "_help": "Keys are food ids or 'club:<exact venue name>'. Values may set venue, dishes (list), add_dishes, exclude.",
            "club:(Scrandle developer)": {"venue": "outabout"},
        }, indent=2, ensure_ascii=False) + "\n")
    data = json.loads(OVERRIDES.read_text())
    return {k: v for k, v in data.items() if not k.startswith("_")}


def scrandle_foods(overrides: dict) -> list[dict]:
    if not RAW.exists():
        warn(f"{RAW.relative_to(ROOT)} missing; run tools/fetch_scrandle.py first")
        return []
    raw = json.loads(RAW.read_text())
    foods = []
    for item in raw["items"].values():
        iid = str(item["id"])
        club = clean(item.get("club") or item.get("club_legacy"))
        pools = item.get("_pools") or ["std"]
        source = "mensa" if "mensa" in pools else "scrandle"
        if item.get("rating") is None:
            continue
        local = SCRANDLE_IMG / f"{safe_id(iid)}.webp"
        remote = (item.get("images_new") or [None])[0]
        title, subtitle = clean(item.get("title")), clean(item.get("subtitle"))
        food = {
            "id": f"s{iid}",
            "title": title,
            "subtitle": subtitle,
            "venue": club or "Unknown venue",
            "country": clean(item.get("country")),
            "price": item.get("price"),
            "year": item.get("year"),
            "rating": round(float(item["rating"]), 2),
            "source": source,
            "image": f"assets/food/scrandle/{local.name}" if local.exists() else remote,
            "imageRemote": remote,
            "imagePos": item.get("image_position") or "center",
            "link": item.get("url") or "",
            "origin": "scrandle",
            "venueCat": classify_venue(club, pools),
            "dishes": classify_dishes(title, subtitle),
        }
        apply_overrides(food, overrides, iid, club)
        if not food.get("exclude"):
            foods.append(food)
    return foods


def apply_overrides(food: dict, overrides: dict, raw_id: str, club: str) -> None:
    for key in (f"club:{club}", raw_id, food["id"]):
        rule = overrides.get(key)
        if not rule:
            continue
        if rule.get("venue") in VENUE_SLUGS:
            food["venueCat"] = rule["venue"]
        if isinstance(rule.get("dishes"), list):
            food["dishes"] = rule["dishes"]
        for extra in rule.get("add_dishes", []):
            if extra not in food["dishes"]:
                food["dishes"] = [d for d in food["dishes"] if d != C.MYSTERY[0]] + [extra]
        if rule.get("exclude"):
            food["exclude"] = True


def custom_foods(overrides: dict) -> list[dict]:
    if not MANIFEST.exists():
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        with MANIFEST.open("w", newline="") as fh:
            csv.writer(fh).writerow(MANIFEST_FIELDS)
        return []
    foods = []
    with MANIFEST.open(newline="", encoding="utf-8-sig") as fh:
        for n, row in enumerate(csv.DictReader(fh), start=2):
            row = {k: clean(v) for k, v in row.items() if k}
            if not row.get("title"):
                continue
            rating = to_float(row.get("rating"))
            if rating is None:
                warn(f"manifest line {n}: {row['title']!r} has no rating; skipped")
                continue
            est = row.get("establishment", "").lower().replace(" ", "_")
            if est not in VENUE_SLUGS:
                warn(f"manifest line {n}: unknown establishment {est!r}; using 'outabout'")
                est = "outabout"
            image = row.get("image_file", "")
            if image and not re.match(r"https?://", image):
                path = CUSTOM_IMG / image
                if not path.exists():
                    warn(f"manifest line {n}: image {path.relative_to(ROOT)} not found; skipped")
                    continue
                image = f"assets/food/custom/{image}"
            fid = "c" + safe_id(row.get("id") or f"{n}-{row['title']}")
            food = {
                "id": fid,
                "title": row["title"],
                "subtitle": row.get("subtitle", ""),
                "venue": row.get("venue", "") or "Somewhere",
                "country": row.get("country", "").upper(),
                "price": to_float(row.get("price")),
                "year": None,
                "rating": rating,
                "source": (row.get("rating_source") or "custom").lower(),
                "votes": int(to_float(row.get("votes")) or 0) or None,
                "image": image or None,
                "imageRemote": None,
                "imagePos": "center",
                "link": row.get("source_url", ""),
                "origin": "custom",
                "venueCat": est,
                "dishes": classify_dishes(row["title"], row.get("subtitle", "")),
            }
            apply_overrides(food, overrides, fid, food["venue"])
            if not food.get("exclude") and food["image"]:
                foods.append(food)
    return foods


def add_percentiles(foods: list[dict]) -> None:
    """Rank within each rating source (0-100) so different sources stay comparable."""
    by_source: dict[str, list[float]] = defaultdict(list)
    for f in foods:
        by_source[f["source"]].append(f["rating"])
    for values in by_source.values():
        values.sort()
    for f in foods:
        vals = by_source[f["source"]]
        lo, hi = bisect_left(vals, f["rating"]), bisect_right(vals, f["rating"])
        f["pct"] = round(100 * ((lo + hi) / 2) / len(vals), 1) if len(vals) > 1 else 50.0



def category_entries(foods: list[dict]) -> list[dict]:
    """Every category the lobby can show, with counts and a playable flag."""
    def entry(group, slug, label, emoji, blurb, members):
        per_source = Counter(f["source"] for f in members)
        best = max(per_source.values(), default=0)
        return {
            "group": group, "slug": slug, "id": f"{group}:{slug}", "label": label, "emoji": emoji,
            "blurb": blurb, "count": len(members), "playable": best >= MIN_PLAYABLE,
            "sources": dict(per_source),
        }

    cats = [entry("all", "everything", "Everything on the Menu", "🍽️",
                  "Every plate we've got, all at once.", foods)]
    for slug, label, emoji, blurb in C.VENUES:
        cats.append(entry("venue", slug, label, emoji, blurb, [f for f in foods if f["venueCat"] == slug]))
    for slug, label, emoji, blurb, _rx in C.DISHES:
        cats.append(entry("dish", slug, label, emoji, blurb, [f for f in foods if slug in f["dishes"]]))
    slug, label, emoji, blurb = C.MYSTERY
    cats.append(entry("dish", slug, label, emoji, blurb, [f for f in foods if slug in f["dishes"]]))
    for slug, label, emoji, blurb in C.REGIONS + [C.WORLD]:
        cats.append(entry("region", slug, label, emoji, blurb, [f for f in foods if f["region"] == slug]))
    for slug, label, emoji, blurb, _lo, _hi in C.PRICE_TIERS:
        cats.append(entry("price", slug, label, emoji, blurb, [f for f in foods if f["tier"] == slug]))
    return cats


def country_table(foods: list[dict]) -> dict:
    out = {}
    for code in sorted({f["country"] for f in foods if f["country"]}):
        name, region, _iso = C.COUNTRIES.get(code, (code, C.WORLD[0], None))
        out[code] = {"name": name, "region": region, "flag": C.flag_emoji(code)}
    return out


def main() -> int:
    overrides = load_overrides()
    foods = scrandle_foods(overrides) + custom_foods(overrides)
    seen, unique = set(), []
    for f in foods:
        if f["id"] not in seen:
            seen.add(f["id"])
            unique.append(f)
    foods = unique
    for f in foods:
        f["region"] = region_of(f["country"])
        f["tier"] = price_tier(f["price"])
        f.pop("exclude", None)
    add_percentiles(foods)
    foods.sort(key=lambda f: f["id"])

    db = {
        "version": 1,
        "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "minPlayable": MIN_PLAYABLE,
        "sources": {s: SOURCE_LABELS.get(s, f"{s.title()} rating") for s in sorted({f['source'] for f in foods})},
        "countries": country_table(foods),
        "categories": category_entries(foods),
        "foods": foods,
    }
    OUT_JSON.write_text(json.dumps(db, ensure_ascii=False, indent=1) + "\n")
    OUT_JS.write_text("window.SCRAN_DB=" + json.dumps(db, ensure_ascii=False, separators=(",", ":")) + ";\n")

    local = sum(1 for f in foods if f["image"] and f["image"].startswith("assets/"))
    print(f"built {OUT_JSON.relative_to(ROOT)} + {OUT_JS.relative_to(ROOT)}: {len(foods)} foods "
          f"({local} with local images), {OUT_JS.stat().st_size/1024:.0f} KB")
    for group in ("venue", "dish", "region", "price"):
        row = [f"{c['slug']}={c['count']}{'' if c['playable'] else '(locked)'}"
               for c in db["categories"] if c["group"] == group]
        print(f"  {group:6s} " + "  ".join(row))
    return 0


if __name__ == "__main__":
    sys.exit(main())

