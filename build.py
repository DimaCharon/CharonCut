#!/usr/bin/env python3
"""
CharonCut · сборка одностраничного приложения.

Склеивает src/template.html + src/styles.css + src/js/*.js в один
самодостаточный index.html (никаких зависимостей, никакой сборки node).

Использование:
    python3 build.py            # → dist/index.html и ./index.html
"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

template = (SRC / "template.html").read_text(encoding="utf-8")
styles = (SRC / "styles.css").read_text(encoding="utf-8")

js_files = sorted((SRC / "js").glob("*.js"))
if not js_files:
    raise SystemExit("Нет JS-файлов в src/js")

parts = []
for f in js_files:
    parts.append(f"/* ===== {f.name} ===== */\n" + f.read_text(encoding="utf-8"))
script = "\n".join(parts)

# script вставляем внутрь <script> — экранируем только закрывающий тег
script = script.replace("</script>", "<\\/script>")

html = template.replace("/*__STYLES__*/", styles).replace("/*__APP_JS__*/", script)

DIST.mkdir(exist_ok=True)
out = DIST / "index.html"
out.write_text(html, encoding="utf-8")
(ROOT / "index.html").write_text(html, encoding="utf-8")

kb = len(html.encode("utf-8")) / 1024
print(f"✓ dist/index.html  ({kb:.1f} KB)  из {len(js_files)} js-файлов")

# 404.html на случай прямых ссылок (Pages не умеет SPA-роутинг)
(DIST / "404.html").write_text(
    '<!doctype html><meta charset="utf-8"><script>location.replace("./")</script>'
    '<p>CharonCut — <a href="./">перейти к редактору</a></p>',
    encoding="utf-8",
)
print("✓ dist/404.html")
