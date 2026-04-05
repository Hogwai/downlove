#!/usr/bin/env bash
# pkg_ext.sh: zip dist/chrome and dist/firefox into release artifacts.
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -d dist/chrome || ! -d dist/firefox ]]; then
  echo "dist/chrome or dist/firefox missing. Run 'npm run build' first." >&2
  exit 1
fi

VERSION_CHROME=$(node -e "console.log(require('./versions.json').chrome)")
VERSION_FIREFOX=$(node -e "console.log(require('./versions.json').firefox)")

mkdir -p dist/packages
rm -f "dist/packages/downlove-chrome-${VERSION_CHROME}.zip"
rm -f "dist/packages/downlove-firefox-${VERSION_FIREFOX}.zip"

(cd dist/chrome && zip -rq "../packages/downlove-chrome-${VERSION_CHROME}.zip" .)
(cd dist/firefox && zip -rq "../packages/downlove-firefox-${VERSION_FIREFOX}.zip" .)

echo "Built:"
echo "  dist/packages/downlove-chrome-${VERSION_CHROME}.zip"
echo "  dist/packages/downlove-firefox-${VERSION_FIREFOX}.zip"
