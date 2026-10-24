---
name: handoff
description: Commit the current work, push the branch, and open or update a pull request to main with a reviewable description. Use when the user says handoff, push, open a PR, or ship to the branch.
disable-model-invocation: true
---

# Handoff: commit, push, PR

Stop at the first failure and report it. Never force-push, never rebase, never merge into main yourself; Sahil's leader session merges after review.

1. **Branch.** `git branch --show-current`. If it is `main`, stop: work goes through a PR.
2. **Review the changes.** `git status --porcelain` and `git diff`. Refuse to stage, and tell the user about, anything matching `.env*`, `*.key`, `*.fbx`, `*.glb` outside `apps/web/public/props/`, or a file containing what looks like an API key (`sk-ant-`, `sk_car_`, `xai-`, `AKIA`). List any changed path outside the folders the user's track owns (`tools/status/milestones.json`) plus the shared ones, and ask before staging those. Changes under `packages/schema/src/` or `packages/engine/src/types.ts` are contract changes: the PR gets the `contracts` label and Sahil reviews it.
3. **Check.** `pnpm -r typecheck` and the tests for the folders changed (`pnpm -F <package> test`). Stop on failure.
4. **Commit.** Stage only the reviewed paths by name (no `git add -A`). One summary line, then a short body saying what and why; code has no comments, so the explanation lives here.
5. **Push.** `git push -u origin <branch>`.
6. **Pull request.** Requires `gh auth status` to pass; if not, ask the user to run `gh auth login` once and stop.
   - If a PR from this branch to main is already open (`gh pr list --head <branch> --base main --state open`), don't open another; edit its description with `gh pr edit` if the summary changed.
   - Otherwise `gh pr create --base main --head <branch>` with a title naming the milestone and a body containing: what the branch adds (bullets by folder), how to run and check it (exact commands and expected output), any assumptions or departures from the design doc, and anything that needs another owner's OK. Add `--label contracts` when step 2 said so.
7. **Status line.** If `../rashomon-coordination/status/` exists (Sahil's machine only), append one dated line naming the branch, the PR and what is done. Otherwise skip.
8. **Report.** The commit hash, the PR URL, and the one next step.
