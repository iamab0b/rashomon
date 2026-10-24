# Rashomon

Rashomon turns witness testimony into a provenance-tracked event graph and then into a plausibility-gated, editable 3D reconstruction inside a measured convenience store. Every event keeps the utterances it came from, a deterministic gate checks sightlines, reachability and timing against the store's geometry, and investigators can drag, revise or override events with a written reason. Built for Cal Hacks 13.0.

## Folder map

| Folder | Owner | Contents |
| --- | --- | --- |
| `packages/schema` | Shared (Sahil merges) | Data contracts, fixtures |
| `packages/engine` | Seat B (Sahil) | Resolver and plausibility gate |
| `spacetimedb/` | Seat B (Sahil) | SpacetimeDB module: tables, reducers, views, publishing |
| `spacetimedb/server/src/procedures/`, `spacetimedb/server/src/http/` | Seat C (Eric) | extractSegment procedure and the Cartesia webhook |
| `apps/web/src/scene` | Seat B (Sahil) | 3D workspace |
| `apps/web/src/ui` | Seat D (Hazel) | Panels, forms, copy |
| `packages/props` | Seat D (Hazel) | Props library JSON |
| `packages/extractor`, `apps/agent`, `apps/web/src/adapters` | Seat C (Eric) | Extraction and interview |
| `docs/` | Shared | Design doc, floor plan, scenario, props, clip map |

## Commands

```
pnpm install
pnpm dev
pnpm test
```

## Secrets

No secrets in this repo. Keys live in `.env.local`, which is git-ignored.

## Features

## Limitations
