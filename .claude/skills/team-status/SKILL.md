---
name: team-status
description: Report where each of Rashomon's three tracks stands, what is blocked, what is ready to merge, and which teammate requests are open. Use when anyone asks for team status, progress, who is blocked, what is ready to merge, or how integration is going.
---

# Team status

Rashomon is built by three people (Sahil: 3D scene, engine, SpacetimeDB tables; Eric: extraction, voice agent, the extractSegment procedure; Hazel: UI, props, pitch) on separate branches that meet at `packages/schema`. This skill tells the asker, in under a minute of reading, where every track is and what has to happen next for the pieces to fit.

## 1. Gather facts

Run, from the repo root:

```
python3 tools/status/status.py
```

It fetches every branch, then reports: hours since H0 (Fri 9 PM), per branch the commits since main and which track folders it touches, rule flags (contract changes, committed assets, secrets), open PRs with their review state and failing checks (needs `gh` logged in), pairwise merge conflicts, per-track milestone signals against the hour, standing checks and requests, and whether the web dev server is up. If the fetch fails, say so: the report then reflects the last fetched state.

Use `--json` to compute from the output. Use `--no-fetch` only if the network is down.

## 2. Read beyond the script

Milestone signals are coarse (`unknown` means there is no file signal, not that it is undone). For each track, read the branch's recent commit subjects and skim `git diff origin/main...origin/<branch> --stat` to judge which milestone it has actually reached, and compare with the current hour.

Check the integration seams:
- Does the extractor emit the schema's `Patch` type (`packages/schema/src/index.ts`), with non-empty `sources` and confidence in 0.3/0.6/0.9?
- Does the scene read only `ResolvedGraph` from `packages/engine/src/types.ts`, computing no positions or statuses itself?
- Do UI components talk to the scene only through hooks exported from `apps/web/src/scene/index.ts`?
- Is `robbery.resolved.json` on main current with the resolver (the engine's drift test)?
- Does Greptile have unresolved comments on any open PR? (`gh pr view <n> --comments`.)

## 3. Standing checks and requests

`tools/status/checks.json` lists per-person items that stay on the report until done, each with the hour window it is due. The script marks each `on_main`, `on_branch (<branch>)`, `pending`, or `manual`. Report every `pending` item whose window has started under its owner, and every `on_branch` item as "done but not merged".

An entry with a `from` field is a request one teammate made of another; its `doc` under `tools/status/requests/` holds the instructions. When the person running this skill is the recipient (match `git config user.name`/`user.email` against `aliases` in `milestones.json`), lead their block with these requests and offer to start on them. When they are the sender, report which of their requests are still open. `python3 tools/status/status.py --inbox` prints just the current person's view; the SessionStart hook in `.claude/settings.json` runs it at the start of every session.

To make a request for someone, use `/request`. The tracker reads the most recently committed `checks.json` across all branches, so a request is visible to everyone as soon as it is pushed, before it merges.

## 4. Report

Lead with what needs action. Keep it short enough to read aloud.

1. **Blockers and flags.** Every BLOCK (assets, secrets), every contracts WARN without the `contracts` label, every merge conflict, anyone waiting on someone else. Name the person and the fix.
2. **One block per person:** owner, milestone reached vs. where the plan says they should be at this hour, last push time, open requests and standing checks as a short to-do list. Flag anyone who hasn't pushed in over two hours; unpushed work is invisible to the others.
3. **Ready to merge:** which PRs can merge now (review approved, Greptile clean, no conflicts), in order.
4. **Next integration step:** the single most useful thing the team can do next.

Do not edit any track's code, merge branches, or push. This skill only reports.
