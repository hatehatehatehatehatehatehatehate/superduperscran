# Eli's Scrandle Rip

Two plates. One crowd. Pick the food the internet rated higher. A cozy-but-snazzy higher-or-lower game built on **real Scrandle vote ratings and photos** (3,694 plates: football grounds, ballparks, gigs, World Cups and uni canteens), with generated lo-fi lobby music and a save file of every answer you give.

## Play

```
python3 serve.py          # http://127.0.0.1:8765 and saves every answer to data/answers/
```

Double-clicking `index.html` also works. In that case answers are kept in the browser only; you can still export them from the lobby, or link a CSV in Chromium.

## Where your answers are saved

With `serve.py` running, each pick is appended right away to:

| File | Contents |
|---|---|
| `data/answers/answers.jsonl` | one JSON object per answer (the full record) |
| `data/answers/answers.csv` | the same rows, ready for a spreadsheet |

Columns: `ts, session, mode, daily, category, difficulty, round, player, side, pickedId, pickedTitle, pickedVenue, pickedRating, otherId, otherTitle, otherVenue, otherRating, source, correct, gap, points, ms`. The `ms` column is how long you took to decide.

The top-left pill shows where answers are going right now: green means a file, yellow means the browser only, red means the server went offline. While it's offline, answers are queued and re-sent when `serve.py` comes back. The lobby also has **Answers CSV / JSON** export buttons, and `GET /api/answers/summary` gives per-food shown/picked counts.

## Modes

- **Classic**: 10 plates.
- **Bottomless Refills**: the winning food stays on (at most 3 times), and you have 3 lives.
- **Pass the Plate**: 2–4 players take turns on one device, 3/5/8 rounds each.
- **Daily Special**: the same 10 plates for everyone on a given date. Your first score of the day is kept.

**Difficulty** is set by how far apart the crowd's ratings are: House Mix (any gap), Easy Peasy (25+ points), Medium Rare (10–25), Knife's Edge (under 10). Scoring is 100 points, plus up to 50 for close calls, plus a streak bonus.

**Categories** (pick one at a time):
- **Venue**: football, ballparks and other sports, international, gigs and festivals, uni canteens, out and about.
- **Dish**: 18 types plus "Mystery Scran".
- **Region**: 5 regions.
- **Price**: 4 tiers.

Foods are only ever paired with foods rated by the **same source**, so Scrandle's main ratings and its canteen ratings are never compared directly.

Keys: `←`/`→` or `1`/`2` to pick, `Enter` for the next plate, `M` to mute.

## Music

The lobby loop is a lo-fi jazz groove generated in the browser (chords, walking bass, brushed drums, vinyl crackle). It quietens and gets muffled during play, so no audio files are needed. To use your own royalty-free track, drop it in as `assets/audio/lobby.mp3` (or `.ogg`/`.m4a`) and run `python3 build.py`.

## Data pipeline

```
python3 tools/fetch_scrandle.py   # polite mirror of scrandle.com/practice (std + mensa), resumable
python3 tools/build_db.py         # sort into categories + merge manifest -> data/foods.json + data/foods.js
python3 build.py                  # bundle styles.css, core.mjs, audio.js, main.js -> index.html
```

- `fetch_scrandle.py` makes one request per second and keeps going until new seeds bring back fewer than 3% unseen foods. Photos are saved as 480px WebP in `assets/food/scrandle/` (about 79 MB). Run it again later to pick up new foods and refreshed ratings.
- Category rules live in `tools/catalog.py`. To fix a single food, add it to `data/category_overrides.json`, keyed by food id (e.g. `"s12345"`) or `"club:<venue>"`. Each entry can set `venue`, `dishes`, `add_dishes` or `exclude`.

### Adding fast food, restaurants, school dinners… (your image tool)

Most venue types stay locked until they have foods. Add rows to `data/custom/manifest.csv`, put the images in `assets/food/custom/`, then run `tools/build_db.py` and `build.py`:

```
id,title,subtitle,establishment,venue,country,price,image_file,rating,rating_source,source_url,votes
bk-whopper,Whopper,With fries,fast_food,Burger King Leeds,ENG,6.49,bk-whopper.webp,71.5,mytool,https://…,412
```

- **`establishment`** must be one of: `fast_food diner fine_dining pub cafe_bakery street_food takeaway school hospital transport meal_deal cinema_park hotel` (or any Scrandle venue slug).
- **`rating`** is 0–100.
- **`rating_source`** keeps your foods from being paired with Scrandle's. A category unlocks once one source has 8 or more foods in it; aim for 20+.

Rows with no rating or a missing image are skipped, and the build prints a warning for each one.

## Development

```
node --test core.test.mjs     # 14 rule tests (pairing, difficulty, modes, scoring, answer records)
node browser-test.mjs         # headless Chromium: plays classic + party games, checks the answer files,
                              # mobile layout and file://; screenshots go to screenshots/
```

Never hand-edit `index.html`; `build.py` generates it. It also checks that the answer columns in `core.mjs` and `serve.py` match.

## Credits

Ratings and photos come from the [Scrandle](https://scrandle.com) community and the FootyScran posters. This is a fan-made, non-commercial project for personal use. The local copies of the photos are there only so the game works offline; please don't republish them.
