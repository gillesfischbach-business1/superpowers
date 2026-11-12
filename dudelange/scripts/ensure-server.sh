#!/usr/bin/env bash
# Start the preview server if nothing is answering on the port yet.
# Safe to call from any shell hook — it is a no-op while the game is up, and the
# flock stops concurrent shells from racing each other into a stampede.
set -u
PORT="${PORT:-5173}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="/tmp/diddeleng-ensure-${PORT}.lock"

exec 9>"$LOCK"
flock -n 9 || exit 0                     # another shell is already doing this

if curl -fsS -m 1 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  exit 0
fi

cd "$ROOT" || exit 0
PORT="$PORT" HOST="${HOST:-0.0.0.0}" setsid nohup node scripts/serve-forever.mjs --port "$PORT" \
  >>/tmp/diddeleng-server.log 2>&1 < /dev/null &
