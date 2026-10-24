# Fixture-mode toggle and the demo laptop (from Sahil)

We are three people, so the backend may slip. The demo must run with no SpacetimeDB at all: fixture mode plays `robberyResolved` and applies patches locally.

## Spec

A toggle in the UI header: `fixture` (default) or `live`. The scene already has an adapter interface with a fixture implementation; the toggle picks which one `useGraph()` uses and shows a small badge so judges know which mode they are watching. Persist the choice in the URL (`?mode=live`) so the demo laptop can bookmark both.

Demo laptop: clone, `corepack enable && pnpm install`, unzip the Mixamo files I send you into `apps/web/public/`, `pnpm -F web dev`, open `http://localhost:5173/?mode=fixture`. Rehearse the e5 correction on it by H+14 and again at freeze; if it works there, we have a demo whatever happens to the backend.

`/team-status` closes this item when a file under `apps/web/src/ui/` contains `fixture`.
