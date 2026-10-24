#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: tools/smoke/seed.sh <session-id>" >&2
  echo "Seeds a new session on the local SpacetimeDB (127.0.0.1:3000, database rashomon) with the robbery fixture, as docs/spacetime-smoke.md does." >&2
  exit 2
}

[ "$#" -eq 1 ] || usage
session="$1"
[[ "$session" =~ ^[A-Za-z0-9_-]{1,64}$ ]] || { echo "session id must be 1 to 64 letters, digits, _ or -" >&2; exit 2; }

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixture="$repo/packages/schema/fixtures/robbery.graph.json"
[ -f "$fixture" ] || { echo "missing $fixture" >&2; exit 1; }
command -v spacetime >/dev/null || { echo "spacetime CLI not found" >&2; exit 1; }
command -v node >/dev/null || { echo "node not found" >&2; exit 1; }

db=rashomon
patches="$(mktemp)"
trap 'rm -f "$patches"' EXIT

spacetime call --server local "$db" create_session "$session" store_v1

spacetime call --server local "$db" insert_segment seg1 "$session" w1 witness "He took the knife." 0 4 live '{"none":[]}' '[{"id":"utt_1","text":"He took the knife.","t_start":0,"t_end":4}]'

FIXTURE="$fixture" OUT="$patches" node -e '
const g = require(process.env.FIXTURE);
const patches = [
  ...g.actors.map((actor) => ({ op: "add_actor", actor })),
  ...g.props.map((prop) => ({ op: "add_prop", prop })),
  ...g.events.map((e) => { const { status, flags, ...event } = e; return { op: "add_event", event }; }),
];
require("fs").writeFileSync(process.env.OUT, JSON.stringify(JSON.stringify(patches)));
'

spacetime call --server local "$db" apply_patches "$session" 0 "$(cat "$patches")"

echo "seeded session $session at version 1; check with:"
echo "  spacetime sql --server local $db \"select id, status from events where session_id = '$session'\""
