#!/usr/bin/env bash
# usage: build-mock.sh HEAD|worktree <out-dir>
# Builds a static copy of the app (production build, CSP included) whose data layer is mock-arkiv.ts.
# HEAD = the last commit, worktree = the files as they are now. No .env file is read; the demo key is a dummy.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
MODE="$1"; OUT="$(realpath -m "$2")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [ "$MODE" = HEAD ]; then git -C "$REPO" archive HEAD | tar -x -C "$TMP"
else (cd "$REPO" && tar --exclude=./node_modules --exclude=./dist --exclude=./.git --exclude=./evidence --exclude=./scratch --exclude='./.env*' -cf - .) | tar -x -C "$TMP"; fi
ln -s "$REPO/node_modules" "$TMP/node_modules"
cp "$HERE/mock-arkiv.ts" "$TMP/src/__mock_arkiv.ts"; cp "$HERE/vite.mock.config.ts" "$TMP/vite.mock.config.ts"
cd "$TMP" && VITE_DEMO_SENDER_PRIVATE_KEY="0x$(printf '22%.0s' $(seq 32))" npx vite build --config vite.mock.config.ts --outDir "$OUT" --emptyOutDir --logLevel warn
echo "built $MODE -> $OUT"
