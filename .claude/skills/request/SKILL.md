---
name: request
description: Ask a teammate for something through the status tracker so it shows up in their inbox at their next session start. Use when the user says request, ask Eric/Hazel/Sahil for, or needs something from another track.
disable-model-invocation: true
---

# Request something from a teammate

1. Ask, if not given: who (B Sahil, C Eric, D Hazel), what in one sentence, the hour window it is due (`"8-14"` style, hours since Fri 9 PM), and a way to tell from the code that it is done (a regex and the paths to grep, or none if it is a judgment call).
2. Write `tools/status/requests/<id>.md`: why it matters in two sentences, the exact spec, how to test it without the requester, and the closing line "`/team-status` closes this item when <condition>". No keys, no DSNs; the repo is public.
3. Add an entry to that person's track in `tools/status/checks.json`: `id`, `from` (the requester's first name as in `milestones.json`), `due`, `todo` (one line), `doc`, `grep`, `paths`. Validate with `python3 -c "import json;json.load(open('tools/status/checks.json'))"`.
4. Commit both files on the current branch (or on `status/<id>` if the current branch is main), push, and tell the user the request is live: the tracker reads the newest committed `checks.json` across all branches, so the recipient sees it at their next session start without waiting for a merge.
5. Print the one-line message the user can paste into the team chat: "Added a request for <name> in the tracker: <todo>. Run /team-status or start a Claude Code session in the repo to see it."
