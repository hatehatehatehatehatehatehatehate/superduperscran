#!/usr/bin/env python3
"""Build index.html for Eli's Scrandle Rip.

    core.mjs      pure rules (ES module, imported by node tests) -> `export` stripped
    audio.js      lobby music + sound effects
    main.js       browser shell
    styles.css    look & feel
    template.html markup with <!--INLINE_STYLES-->, <!--INLINE_DATA-->, <!--INLINE_SCRIPTS-->
    data/foods.js window.SCRAN_DB, from tools/build_db.py (loaded via <script src> so it works from file://)

Usage:  python3 build.py      (never hand-edit index.html)
"""
from __future__ import annotations

import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TEMPLATE = ROOT / "template.html"
OUTPUT = ROOT / "index.html"
CLASSIC = ["audio.js", "main.js"]


def strip_module(source: str) -> str:
    out = re.sub(r"^export\s+(?=(?:const|let|function|class|async function)\b)", "", source, flags=re.M)
    assert not re.search(r"^\s*(?:import|export)\b", out, re.M), "core.mjs must not use import/export lists"
    return out.rstrip() + "\n"


def check_answer_fields(core: str) -> None:
    """core.mjs ANSWER_FIELDS and serve.py ANSWER_FIELDS must match exactly."""
    js = re.search(r"ANSWER_FIELDS\s*=\s*\[(.*?)\];", core, re.S)
    assert js, "ANSWER_FIELDS missing from core.mjs"
    js_fields = re.findall(r"'([^']+)'", js.group(1))
    tree = ast.parse((ROOT / "serve.py").read_text())
    py_fields = next(ast.literal_eval(n.value) for n in ast.walk(tree)
                     if isinstance(n, ast.Assign) and any(getattr(t, "id", "") == "ANSWER_FIELDS" for t in n.targets))
    assert js_fields == py_fields, f"answer fields differ:\n core.mjs {js_fields}\n serve.py {py_fields}"


def main() -> None:
    core = strip_module((ROOT / "core.mjs").read_text())
    for symbol in ("function createGame", "function choose", "ANSWER_FIELDS", "GAME_TITLE"):
        assert symbol in core, f"{symbol} missing from stripped core"
    check_answer_fields((ROOT / "core.mjs").read_text())
    title = re.search(r"GAME_TITLE\s*=\s*\"([^\"]+)\"", core).group(1)

    track = next((f"assets/audio/lobby{ext}" for ext in (".mp3", ".ogg", ".m4a")
                  if (ROOT / "assets" / "audio" / f"lobby{ext}").exists()), None)
    parts = [f"/* ---- build config ---- */\nconst LOBBY_TRACK = {json.dumps(track)};\n",
             f"/* ---- core.mjs ---- */\n{core}"]
    for name in CLASSIC:
        parts.append(f"/* ---- {name} ---- */\n{(ROOT / name).read_text().rstrip()}\n")
    scripts = "<script>\n(() => {\n" + "\n".join(parts) + "})();\n</script>"

    html = TEMPLATE.read_text()
    for marker in ("<!--INLINE_STYLES-->", "<!--INLINE_DATA-->", "<!--INLINE_SCRIPTS-->"):
        assert html.count(marker) == 1, f"template needs exactly one {marker}"
    html = html.replace("{{TITLE}}", title.replace("'", "&#39;"))
    html = html.replace("<!--INLINE_STYLES-->", "<style>\n" + (ROOT / "styles.css").read_text().rstrip() + "\n</style>")
    data = ROOT / "data" / "foods.js"
    stamp = int(data.stat().st_mtime) if data.exists() else 0
    html = html.replace("<!--INLINE_DATA-->", f'<script src="data/foods.js?v={stamp}"></script>')
    html = html.replace("<!--INLINE_SCRIPTS-->", scripts)
    assert html.count("<script") == html.count("</script>") == 2, "unbalanced script tags"
    assert "</script>" not in "\n".join(parts), "a source file contains a literal </script>"
    OUTPUT.write_text(html)
    if not data.exists():
        print("warning: data/foods.js missing; run python3 tools/build_db.py")
    print(f"built {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size:,} bytes) for {title!r}; "
          f"lobby music: {track or 'generated lo-fi groove'}")


if __name__ == "__main__":
    main()
