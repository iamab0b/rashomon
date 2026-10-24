---
name: sync
description: Fetch origin, merge origin/main into the current branch, run typecheck and tests. Stops on conflicts.
disable-model-invocation: true
---

# Sync with main

1. Run `git status --porcelain`. If the working tree has uncommitted changes, list them and ask whether to continue before merging.
2. Run `git fetch origin`.
3. Run `git merge origin/main` into the current branch. Never rebase, never force-push.
4. If the merge reports conflicts, run `git diff --name-only --diff-filter=U`, report every conflicted file, and stop. Do not resolve conflicts and do not run `git merge --abort` unless the user says so.
5. Run `pnpm -r typecheck` and `pnpm -r test`. Report PASS or the first failing lines.
6. Report: the current branch, the commits merged in (`git log --oneline ORIG_HEAD..HEAD`, or "already up to date"), the check results, and any files changed under `packages/schema/src/` or `packages/engine/src/types.ts` that came in from main, since those are contract changes the user should know about.
