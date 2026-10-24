#!/usr/bin/env bash
# Create the local test admin on a fresh dev database (run while diaitika/dev.sh is up).
# Credentials are generated once and kept in .dev-data/dev-credentials (git-ignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${DEV_DATA:-$ROOT/.dev-data}"
API="${API:-http://127.0.0.1:3001}"
CREDS="$DATA/dev-credentials"

mkdir -p "$DATA"
if [ ! -f "$CREDS" ]; then
  umask 077
  # Random part + one of each class the server's password policy requires
  printf 'username=dev\npassword=%s-Aa1\n' "$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)" > "$CREDS"
fi
USERNAME=$(sed -n 's/^username=//p' "$CREDS")
PASSWORD=$(sed -n 's/^password=//p' "$CREDS")

if ! curl -fsS "$API/api/auth/status" | grep -q '"setup_required":true'; then
  echo "seed-dev: database already set up — log in with the credentials in $CREDS"
  exit 0
fi

curl -fsS -X POST "$API/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" >/dev/null
echo "seed-dev: created admin '$USERNAME' — password in $CREDS"
