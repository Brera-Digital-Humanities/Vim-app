#!/usr/bin/env bash
# =============================================================================
# build-app.sh
# Build the VIM app as self-contained single-file HTML pages from src/:
#   • dist/index.html  — the real PWA, full-screen (body.app), + manifest/SW/icons
#   • test/index.html  — the demo with the iPhone skin (body.demo), for presentations
# Both pages share the same screens / JS / CSS; only the outer shell differs.
#
# Requires: node >= 18, sass, perl  (sass via `npm install`)
# Usage:    ./scripts/build-app.sh   then   npm start
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # project root (parent of scripts/)
SRC="$ROOT/src"
DIST_OUT="$ROOT/dist/index.html"
DEMO_OUT="$ROOT/test/index.html"
TMP_CSS="$(mktemp --suffix=.css)"
TMP_JS="$(mktemp --suffix=.js)"
TMP_TPL="$(mktemp --suffix=.html)"
trap 'rm -f "$TMP_CSS" "$TMP_JS" "$TMP_TPL"' EXIT

export PATH="$ROOT/node_modules/.bin:$PATH"

# Read a section ([js], [scss], [html]) from src/build.order → newline paths.
order() { awk -v s="[$1]" '$0==s{f=1;next} /^\[/{f=0} f&&NF&&$1!~/^#/{print $1}' "$SRC/build.order"; }

# Expand a template's markers into stdout:
#   <!-- @screens -->            → the [html] partials, in build.order sequence
#   <!-- @file:PATH -->          → the file src/PATH (e.g. shared app bar)
expand_markers() {
  local tpl="$1" files; files="$(order html | tr '\n' ' ')"
  awk -v dir="$SRC/" -v list="$files" '
    /^[[:space:]]*<!-- @screens -->/ {
      n = split(list, a, " ")
      for (i = 1; i <= n; i++) if (a[i] != "") { while ((getline l < (dir a[i])) > 0) print l; close(dir a[i]) }
      next
    }
    /<!-- @file:/ {
      p = $0; sub(/.*<!-- @file:/, "", p); sub(/[[:space:]]*-->.*/, "", p)
      while ((getline l < (dir p)) > 0) print l; close(dir p)
      next
    }
    { print }' "$SRC/$tpl"
}

# Inject public .env config, then inline the brand logo data-URI.
inject() {
  local out="$1"
  sed -i \
    -e "s|__VIM_KOBO_UID__|$VIM_KOBO_UID|g" \
    -e "s|__VIM_SERVICES_URL__|$VIM_SERVICES_URL|g" \
    "$out"
  # base64 data-URI is too big for sed's command line → perl reads it from a file.
  LOGO_FILE="$TMP_LOGO" perl -i -pe '
    BEGIN { local $/; open my $f, "<", $ENV{LOGO_FILE} or die; our $d = <$f>; close $f; }
    s/__VIM_LOGO__/$d/g;
  ' "$out"
}

# Assemble one page: expand markers, then inline CSS + JS into a single file.
build_page() {
  local tpl="$1" out="$2"
  mkdir -p "$(dirname "$out")"
  expand_markers "$tpl" > "$TMP_TPL"
  awk -v cssf="$TMP_CSS" -v jsf="$TMP_JS" '
  function inline_file(path) { while ((getline line < path) > 0) print line; close(path) }
  /<link rel="stylesheet" href="\/styles\/vim\.css"\/>/ { print "  <style>"; inline_file(cssf); print "  </style>"; next }
  /<script src="\/js\/vim\.data\.js"><\/script>/ { print "  <script>"; inline_file(jsf); print "  </script>"; next }
  /<script src="\/js\/vim\.(navigation|api)\.js"><\/script>/ { next }
  { print }
  ' "$TMP_TPL" > "$out"
  inject "$out"
}

# ── 0. Prerequisites ────────────────────────────────────────────────────────
command -v sass >/dev/null 2>&1 || { echo "ERROR: sass missing. Run 'npm install' in the project root."; exit 1; }
command -v perl >/dev/null 2>&1 || { echo "ERROR: perl missing."; exit 1; }
for f in data.js app.html demo.html api.js build.order partials/app-bar.html; do
  [ -f "$SRC/$f" ] || { echo "ERROR: src/$f missing"; exit 1; }
done

# ── 0b. Load .env (UID, SERVICES_URL) ───────────────────────────────────────
if [ -f "$ROOT/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$ROOT/.env"; set +a
else
  echo "ERROR: .env missing. Run: cp .env.example .env  and fill in your values."
  exit 1
fi
: "${VIM_KOBO_UID:?VIM_KOBO_UID not set in .env}"
: "${VIM_SERVICES_URL:?VIM_SERVICES_URL not set in .env}"

# ── 1. Concatenate SCSS (per build.order) then compile ──────────────────────
echo "▸ Concatenate + compile SCSS"
: > "$TMP_CSS.scss"
for f in $(order scss); do
  [ -f "$SRC/$f" ] || { echo "ERROR: src/$f listed in build.order but missing"; exit 1; }
  cat "$SRC/$f" >> "$TMP_CSS.scss"; printf '\n' >> "$TMP_CSS.scss"
done
sass --no-source-map --style=expanded "$TMP_CSS.scss" "$TMP_CSS"
rm -f "$TMP_CSS.scss"

# ── 2. Concatenate JS: data.js + (build.order [js]) + api.js ────────────────
echo "▸ Concatenate JS"
{
  echo "// === src/data.js ==="
  cat "$SRC/data.js"; echo
  for f in $(order js); do
    [ -f "$SRC/$f" ] || { echo "ERROR: src/$f listed in build.order but missing"; exit 1; }
    echo "// === src/$f ==="
    cat "$SRC/$f"; echo
  done
  echo "// === src/api.js ==="
  cat "$SRC/api.js"; echo
} > "$TMP_JS"

# ── 3. Prepare the brand-logo data-URI once (shared by both pages) ──────────
echo "▸ Prepare brand logo (assets/logo.svg → data-URI)"
LOGO_SVG="$SRC/assets/logo.svg"
[ -f "$LOGO_SVG" ] || { echo "ERROR: $LOGO_SVG missing"; exit 1; }
TMP_LOGO="$(mktemp --suffix=.txt)"
trap 'rm -f "$TMP_CSS" "$TMP_JS" "$TMP_TPL" "$TMP_LOGO"' EXIT
{ printf 'data:image/svg+xml;base64,'; base64 -w0 "$LOGO_SVG"; } > "$TMP_LOGO"

# ── 4. Build both pages from shared CSS/JS ──────────────────────────────────
echo "▸ Assemble dist/index.html (PWA, full-screen)"
build_page "app.html"  "$DIST_OUT"
echo "▸ Assemble test/index.html (demo, phone skin)"
build_page "demo.html" "$DEMO_OUT"

# ── 5. PWA assets next to the app (served from dist/) ───────────────────────
echo "▸ Copy PWA assets into dist/ (manifest, service worker, icons)"
DIST_DIR="$(dirname "$DIST_OUT")"
cp "$SRC/manifest.json"          "$DIST_DIR/manifest.json"
cp "$SRC/pwa/service-worker.js"  "$DIST_DIR/service-worker.js"
rm -rf "$DIST_DIR/icons" && cp -r "$SRC/pwa/icons" "$DIST_DIR/icons"

# ── 6. Syntax-check the inlined JS (same bundle in both pages) ──────────────
echo "▸ Syntax check inlined JS"
awk '/<script>/{p=1;next} /<\/script>/{p=0} p' "$DIST_OUT" > "$TMP_JS"
node --check "$TMP_JS" && echo "    inlined JS OK"

# ── 7. Summary ──────────────────────────────────────────────────────────────
echo
echo "▸ Built:"
echo "    dist/index.html  ($(($(wc -c < "$DIST_OUT") / 1024)) KB)  — PWA"
echo "    test/index.html  ($(($(wc -c < "$DEMO_OUT") / 1024)) KB)  — demo (phone skin)"
echo "  Test PWA:   npm start   (serves dist/ on http://localhost:8765)"
echo "  Test demo:  npm run demo (serves test/ on http://localhost:8766)"
