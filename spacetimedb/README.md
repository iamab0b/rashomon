# spacetimedb

Owned by Seat A.

A scaffolds the module here with:

```
spacetime dev --template basic-ts
```

The two Claude Code skills from the design doc's "Start here" section are installed with:

```
npx -y skills add clockworklabs/spacetimedb --skill spacetimedb-concepts --agent claude-code
npx -y skills add clockworklabs/spacetimedb --skill spacetimedb-cli --agent claude-code
```

The design doc also lists a third, `spacetimedb-best-practices`, installed with:

```
npx skills add https://github.com/douglance/stdb-skills --skill spacetimedb-best-practices
```

## server/

The TypeScript module lives in `server/` (`@rashomon/spacetime-module`, `spacetimedb` pinned to 2.13.0).

- Tables: `sessions`, `segments`, `utterances`, `actors`, `events`, `props`, `patches`, `flags`, `overrides`. Graph rows are keyed by `sessionId`.
- Reducers: `createSession`, `insertSegment`, `applyPatches`, `override`, `setStatuses`.
- View: `graphForScene(sessionId)` returns the `EventGraph` shape; `eventGraphFromRow` in `src/convert.ts` turns its row into the schema's `EventGraph`.
- Procedures: none yet, see `server/src/procedures/README.md`.

Test with `pnpm -F @rashomon/spacetime-module test`. The tests use the module test harness shipped in `spacetimedb/server/test-utils`, so they run the real reducers against an in-memory datastore with no server.

The module was written by hand against the 2.13.0 package because the SpacetimeDB CLI could not be installed where it was built (`install.spacetimedb.com` was blocked). Before publishing, run `spacetime dev --template basic-ts` in a scratch folder once, compare its project files (for example `spacetime.json`) with `server/`, and add whatever is missing. Pin `spacetimedb` to the Maincloud host version.
