#!/bin/bash
# B: README reproduce steps, literally, in a fresh clone with no .env.local. usage: fresh.sh <dir>
set -u; export PATH=/usr/bin:/bin
D=$1
rm -rf "$D"; git clone -q /path/to/sealdrop "$D" || exit 1
cd "$D"; echo "node $(node -v), npm $(npm -v), HEAD $(git rev-parse --short HEAD)"
echo "clone HEAD: $(git rev-parse --short HEAD); .env.local present: $([ -f .env.local ] && echo yes || echo no)"
t() { local s=$(date +%s.%N); "$@" > /tmp/qa/fresh-step.log 2>&1; local rc=$?; local e=$(date +%s.%N); printf '%-34s exit %s  %.1f s\n' "$*" "$rc" "$(echo "$e - $s" | bc)"; tail -n "${TAILN:-3}" /tmp/qa/fresh-step.log | cut -c1-170 | sed 's/^/    /'; return $rc; }
TAILN=2 t npm ci
TAILN=6 t npm test
TAILN=4 t npm run build
TAILN=2 t node scripts/secret-scan.mjs
TAILN=2 t npm run check:bundle
echo "dist: $(ls dist | tr '\n' ' ')"
echo "--- npm run dev (no RPC): start, GET /, render the home page"
$HOME/.config/nvm/versions/node/v24.18.0/bin/node /tmp/qa/dev-check.mjs dev "$D" 2>&1 | cut -c1-230
if [ "${NOKEY:-0}" = 1 ]; then
  echo "--- built without .env.local: the no-demo-key answers (about 2 public arkiv_query)"
  $HOME/.config/nvm/versions/node/v24.18.0/bin/node /tmp/qa/dev-check.mjs nokey "$D" 2>&1 | cut -c1-230
fi
echo "--- demo mode as the README says: npm run keys, then build and check the bundle (the keys are throwaway, testnet only)"
TAILN=5 t npm run keys | cut -c1-120
node /tmp/qa/envcheck.mjs "$D" 2>&1 | cut -c1-60
TAILN=2 t node scripts/secret-scan.mjs
TAILN=3 t npm run build
TAILN=8 t npm run check:bundle
