# SpacetimeDB local smoke test

Verified on 2026-10-23 with `spacetime` CLI 2.13.0 against a local server (`spacetime server list` shows `local` at `127.0.0.1:3000`), module `spacetimedb/server`, database name `rashomon`.

Run everything from the repo root unless a `cd` is shown. `-y` and the first publish log the CLI in to the local server by itself; no web login was needed.

## Gotchas

- `-c` takes its value only through `=`. `-c always` leaves `always` as a stray argument and fails with `unexpected argument`. Write `-c=always`, and put the database name before the flags.
- Reducer names and argument fields are snake_case on the wire: `create_session`, `insert_segment`, `apply_patches`, `override`, `set_statuses`; `session_id`, `t_start`, `t_end`, `witness_id`. The TypeScript names (`createSession`) are rejected with "No such reducer".
- Each argument is parsed as JSON. Strings with spaces need shell quotes; an `option<T>` is `{"none":[]}` or `{"some":"x"}`; a `Vec<...>` is a JSON array whose objects use snake_case keys.
- `apply_patches` takes `patches_json` as a string, so the JSON array must itself be quoted as a JSON string (see below).

## Publish

```
cd spacetimedb/server
spacetime publish rashomon --server local -c=always -y
```

`-c=always` wipes the database first.

## Create a session and insert a segment

```
spacetime call --server local rashomon create_session smoke1 store_v1

spacetime call --server local rashomon insert_segment seg1 smoke1 w1 witness "He took the knife." 0 4 live '{"none":[]}' '[{"id":"utt_1","text":"He took the knife.","t_start":0,"t_end":4}]'
```

## Apply the robbery fixture's patches

The patches are 3 `add_actor`, 2 `add_prop` and 10 `add_event` patches built from `packages/schema/fixtures/robbery.graph.json`, the same way `spacetimedb/server/src/module.test.ts` builds them (events without `status` and `flags`). Write them to a file as a JSON string literal, then pass the file's contents:

```
node -e '
const g = require("./packages/schema/fixtures/robbery.graph.json");
const patches = [
  ...g.actors.map((actor) => ({ op: "add_actor", actor })),
  ...g.props.map((prop) => ({ op: "add_prop", prop })),
  ...g.events.map((e) => { const { status, flags, ...event } = e; return { op: "add_event", event }; }),
];
require("fs").writeFileSync("/tmp/patches.arg", JSON.stringify(JSON.stringify(patches)));
'

spacetime call --server local rashomon apply_patches smoke1 0 "$(cat /tmp/patches.arg)"
```

`0` is the base version; a second call must pass the session's current version (it is 1 after this one) or it fails with `stale baseVersion`.

## Read it back

```
spacetime sql --server local rashomon "select version from sessions"
spacetime sql --server local rashomon "select id, label, role, rig from actors"
spacetime sql --server local rashomon "select id, actor, action, status from events"
spacetime sql --server local rashomon "select id, type, notes from props"
spacetime sql --server local rashomon "select * from graph_for_scene('smoke1')"
```

Expected: version 1, 3 actors, 10 events (all `proposed`), 2 props (`p_register`, `p_knife`), and `graph_for_scene('smoke1')` returning `store_v1` with the actors and events. SQL uses the snake_case view name `graph_for_scene`, called with the session id as its argument; a bare `select * from graph_for_scene` fails with "takes 1 argument(s), but 0 were given".

## Generate the TypeScript bindings

```
spacetime generate --lang typescript --out-dir apps/web/src/scene/live/bindings --module-path spacetimedb/server -y
```

The generated files import the `spacetimedb` package, so `apps/web/package.json` depends on it at the same pinned version as `spacetimedb/server` (2.13.0). Regenerate after any change to the module's tables, reducers or views.
