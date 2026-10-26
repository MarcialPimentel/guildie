#!/usr/bin/env bash
# Builds the two upload packages for SiteGround (see docs/deploy.md):
#
#   dist/guildie-public-<version>.zip   -> extract into public_html/games/guildie/
#       index.html, *.wasm, *.pck, ...   (Godot web build)
#       api/index.php, api/.htaccess     (public API entry point)
#
#   dist/guildie-private-<version>.zip  -> extract into guildie-private/
#       app/      (server code, version stamped)
#       content/  (game data)
#       migrations/ (applied automatically by the server)
#
# Neither package contains config.php, so extracting never overwrites your database settings.
#
# Usage: tools/package.sh            (needs Godot 4.7 with web export templates)
#        GODOT=/path/to/godot tools/package.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
# Optional build suffix (CI passes the run number), shown as e.g. "0.2.1 (build 12)".
if [ -n "${BUILD_NUMBER:-}" ]; then
  VERSION_LABEL="$VERSION (build $BUILD_NUMBER)"
else
  VERSION_LABEL="$VERSION"
fi
GODOT="${GODOT:-godot}"
DIST="$ROOT/dist"
STAGE="$DIST/stage"

echo "Packaging Guildie $VERSION"
python3 "$ROOT/tools/validate_content.py" "$ROOT/content"
rm -rf "$STAGE"
mkdir -p "$STAGE/client" "$STAGE/public/api" "$STAGE/private"

# --- Client: copy, stamp the build number, export for the web ---
cp -r "$ROOT/client/." "$STAGE/client/"
rm -rf "$STAGE/client/build"
sed -i "s/^const CLIENT_BUILD := \".*\"/const CLIENT_BUILD := \"$VERSION_LABEL\"/" "$STAGE/client/scripts/build_info.gd"
grep -qF "CLIENT_BUILD := \"$VERSION_LABEL\"" "$STAGE/client/scripts/build_info.gd" || { echo "Failed to stamp client build"; exit 1; }

"$GODOT" --headless --path "$STAGE/client" --import > "$DIST/godot-import.log" 2>&1 || true
"$GODOT" --headless --path "$STAGE/client" --export-release "Web" "$STAGE/public/index.html" > "$DIST/godot-export.log" 2>&1
[ -f "$STAGE/public/index.wasm" ] || { echo "Godot export failed; see $DIST/godot-export.log"; exit 1; }

# --- Public API entry point ---
cp "$ROOT/server/api/index.php" "$ROOT/server/api/.htaccess" "$STAGE/public/api/"

# --- Private server code + content, with the version stamped ---
cp -r "$ROOT/server/app" "$STAGE/private/app"
cp -r "$ROOT/content" "$STAGE/private/content"
mkdir -p "$STAGE/private/migrations"
cp "$ROOT"/server/migrations/[0-9][0-9][0-9]_*.sql "$STAGE/private/migrations/"
printf "<?php\n// Stamped by tools/package.sh\nreturn '%s';\n" "$VERSION_LABEL" > "$STAGE/private/app/version.php"

# --- Zip ---
rm -f "$DIST/guildie-public-$VERSION.zip" "$DIST/guildie-private-$VERSION.zip"
(cd "$STAGE/public" && zip -qr "$DIST/guildie-public-$VERSION.zip" .)
(cd "$STAGE/private" && zip -qr "$DIST/guildie-private-$VERSION.zip" .)

echo "Done:"
ls -lh "$DIST"/guildie-*-"$VERSION".zip
