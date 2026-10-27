#!/usr/bin/env bash
# Builds the two upload packages for SiteGround (see docs/deploy.md):
#
#   dist/guildie-public-<version>.zip   -> extract into public_html/games/guildie/
#       index.html, assets/, .htaccess   (web client, built from client/ by Vite)
#       api/index.php, api/.htaccess     (public API entry point)
#
#   dist/guildie-private-<version>.zip  -> extract into guildie-private/
#       app/      (server code, version stamped)
#       content/  (game data)
#       migrations/ (applied automatically by the server)
#
# Neither package contains config.php, so extracting never overwrites your database settings.
#
# Usage: tools/package.sh            (needs Node.js 20+ and npm)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
# Optional build suffix (CI passes the run number), shown as e.g. "0.2.1 (build 12)".
if [ -n "${BUILD_NUMBER:-}" ]; then
  VERSION_LABEL="$VERSION (build $BUILD_NUMBER)"
else
  VERSION_LABEL="$VERSION"
fi
DIST="$ROOT/dist"
STAGE="$DIST/stage"

echo "Packaging Guildie $VERSION"
python3 "$ROOT/tools/validate_content.py" "$ROOT/content"
rm -rf "$STAGE"
mkdir -p "$STAGE/client" "$STAGE/public/api" "$STAGE/private"

# --- Client: build the TypeScript web client with the build label stamped in ---
(
  cd "$ROOT/client"
  [ -d node_modules ] || npm ci --no-audit --no-fund
  GUILDIE_BUILD="$VERSION_LABEL" npm run build
)
cp -r "$ROOT/client/dist/." "$STAGE/public/"
[ -f "$STAGE/public/index.html" ] || { echo "Client build failed: no index.html"; exit 1; }

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
