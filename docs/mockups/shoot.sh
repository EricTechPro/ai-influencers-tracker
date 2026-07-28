#!/usr/bin/env bash
# Full-page screenshots of the mockup board into screenshots/.
# Uses the playwright CLI via npx, so nothing is installed into this repo.
# Usage: docs/mockups/shoot.sh [name ...]      (default: every mockup except the boards)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$here/screenshots"; mkdir -p "$out"
port=3013

curl -sf -o /dev/null "http://localhost:$port/" || {
  echo "board not served. run: python3 $here/serve.py &" >&2; exit 1; }

names=("$@")
if [ ${#names[@]} -eq 0 ]; then
  for f in "$here"/*.html; do
    n="$(basename "$f" .html)"
    [[ "$n" == index || "$n" == component-board ]] && continue
    names+=("$n")
  done
fi

for n in "${names[@]}"; do
  n="${n%.html}"
  npx --yes playwright@1.62.0 screenshot \
    --full-page --viewport-size=1440,1200 --wait-for-timeout=1500 \
    "http://localhost:$port/$n.html" "$out/$n.png" >/dev/null 2>&1
  echo "wrote docs/mockups/screenshots/$n.png"
done
