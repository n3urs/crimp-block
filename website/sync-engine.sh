#!/usr/bin/env bash
# Re-copies the rules engine from the iOS app into the website.
#
# The interactive calculator on index.html runs the REAL engine, which is the
# whole point of it — so these copies must not drift from what actually ships.
# Run this whenever engine-core.js, templates.js or template-resolver.js change
# in the app, and redeploy.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)/.worktrees/react-native-rebuild/deadpoint-rn/src/engine"
DEST="$(cd "$(dirname "$0")" && pwd)/js/engine"

if [ ! -d "$SRC" ]; then
  echo "Engine source not found at: $SRC" >&2
  echo "Point SRC at wherever deadpoint-rn/src/engine lives now." >&2
  exit 1
fi

changed=0
for f in engine-core.js templates.js template-resolver.js; do
  if ! cmp -s "$SRC/$f" "$DEST/$f"; then
    cp "$SRC/$f" "$DEST/$f"
    echo "updated  $f"
    changed=1
  else
    echo "in sync  $f"
  fi
done

if [ "$changed" -eq 1 ]; then
  echo
  echo "Engine files changed — redeploy the site so the calculator matches the app."
fi
