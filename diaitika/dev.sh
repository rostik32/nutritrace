#!/usr/bin/env bash
# Local development: API server (node --watch) on :3001 + Vite dev server on :5173.
# Uses a throwaway database in .dev-data/ — never point this at production data.
# Usage: diaitika/dev.sh            (Ctrl+C stops both)
#        DEV_DATA=/tmp/nt diaitika/dev.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${DEV_DATA:-$ROOT/.dev-data}"
mkdir -p "$DATA/db" "$DATA/uploads"

if [ "$(node -p 'process.versions.node.split(".")[0]')" != "20" ]; then
  echo "dev.sh: Node 20 is required (see .nvmrc). Run: nvm use" >&2
  exit 1
fi

[ -d "$ROOT/node_modules/vite" ] || npm ci --prefix "$ROOT"
[ -d "$ROOT/server/node_modules/express" ] || npm ci --prefix "$ROOT/server"

export DB_PATH="$DATA/db/nutritrace.db"
export UPLOADS_PATH="$DATA/uploads"
export JWT_SECRET="${JWT_SECRET:-local-dev-only-not-a-secret}"
export INSECURE_COOKIES=1
export LOG_LEVEL="${LOG_LEVEL:-info}"

(cd "$ROOT/server" && node --watch index.js) &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

cd "$ROOT"
npx vite --host "${VITE_HOST:-127.0.0.1}" --port 5173 --strictPort
