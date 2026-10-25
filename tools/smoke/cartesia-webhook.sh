#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: tools/smoke/cartesia-webhook.sh <base-url> <scratch-session-id>" >&2
  echo "Posts to the Cartesia webhook routes with the right secret and a wrong one." >&2
  echo "Use a scratch session that no interview is using; seed one with tools/smoke/seed.sh." >&2
  echo "base-url is the tunnel (https://...trycloudflare.com) or http://127.0.0.1:3000. Reads CARTESIA_WEBHOOK_SECRET from .env.local." >&2
  exit 2
}

[ "$#" -eq 2 ] || usage
base="${1%/}"
session="$2"
[[ "$session" =~ ^[A-Za-z0-9_-]{1,64}$ ]] || { echo "session id must be 1 to 64 letters, digits, _ or -" >&2; exit 2; }

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
secret="$(grep -E '^CARTESIA_WEBHOOK_SECRET=' "$repo/.env.local" | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')"
[ -n "$secret" ] || { echo "CARTESIA_WEBHOOK_SECRET is not set in .env.local" >&2; exit 1; }
db="${SPACETIME_DB:-rashomon}"
route="$base/v1/database/$db/route/webhook/cartesia"

post() {
  local path="$1" header_secret="$2" body="$3"
  curl -sS -o /tmp/cartesia-webhook.out -w '%{http_code}' -X POST "$route/$path" \
    -H 'content-type: application/json' \
    -H @<(printf 'x-rashomon-webhook-secret: %s\n' "$header_secret") \
    --data "$body"
}

fail=0
check() {
  local label="$1" want="$2" got="$3"
  if [ "$got" = "$want" ]; then echo "ok   $label -> $got"; else echo "FAIL $label -> $got (want $want): $(head -c 300 /tmp/cartesia-webhook.out)"; fail=1; fi
}

body="{\"session_id\":\"$session\"}"
check "scene_context, right secret" 200 "$(post scene_context "$secret" "$body")"
head -c 400 /tmp/cartesia-webhook.out; echo
check "scene_context, wrong secret" 401 "$(post scene_context "wrong-$RANDOM" "$body")"
check "record_statement, wrong secret" 401 "$(post record_statement "wrong-$RANDOM" "{\"session_id\":\"$session\",\"text\":\"smoke\"}")"
check "end_interview, wrong secret" 401 "$(post end_interview "wrong-$RANDOM" "$body")"
check "end_interview, right secret" 200 "$(post end_interview "$secret" "$body")"
rm -f /tmp/cartesia-webhook.out
exit "$fail"
