# Interview screen: a statement box in the right panel (from Sahil)

This closes the left half of the MVP: "typed or spoken statement → extraction → patch → gate → scene". Today nothing in the product lets anyone put a statement in. Start a new branch `interview-screen` from origin/main, open a PR to main, and do not merge it yourself. No force-push. Change only apps/web/src/ui/ and, if you need it, the one App.tsx line.

What scene-core is adding (branch submit-statement, PR coming). Build against these names; until the PR lands, a local stub of the same shape in a ui test file is fine:
- `useGraphActions().submitStatement(text, witnessName): Promise<{ segmentId, baseVersion }>`. In live mode it calls a new editors-only `submit_statement` reducer, and the server extracts the statement with Claude and re-gates it. In fixture mode it runs the extractor with a stub that only understands the robbery's own statements, so the box works with no backend. It rejects with a message when the server refuses (for example, the browser is not an editor) and throws synchronously when no source is mounted.
- `useStatementStatus(segmentId): { state: "extracting" | "done" | "failed"; patchCount?; error? }`.
- `useLiveIdentity(): string | null`, the browser's identity in live mode.
- `useGraph().graph.version`, `useGraphErrors()` and `useSceneStatus()`, as on main now.

Build:
1. **A Statement section in the right panel**, reachable from the tab bar or the drawer, in your design. It has a witness name field (default "Witness"), a textarea and a Submit button. Submit is disabled while the text is empty and while a submission is in flight.
2. **On submit,** call submitStatement.
   - While useStatementStatus says "extracting", show "Extracting…" with the statement text greyed and a static indicator. No spinner that can spin forever: after 30 s, change it to "Still extracting — the model is slow".
   - On "done", show "Added N events" and list the new or changed events and any new flags. Take them from useGraph(): compare event ids and the flags on events before and after. Selecting one selects the event in the scene (useSelection).
   - With 0 patches, show "No events found in that statement" (plus the fixture note when there is one).
   - On "failed" or a rejection, show the message and keep the text so it can be resent.
3. **Editors in live mode.** When the reducer refuses because the browser is not an editor, show "This browser can't add statements" plus the identity from useLiveIdentity() with a Copy button, so Sahil can add it to EDITOR_IDENTITIES. Judges at other machines see read-only mode, with no error toast.
4. **Voice behind a flag.** A "Start voice interview" button appears only when the feature flag is on: `?voice=1`, or a constant you export and set false. Until Eric's Cartesia agent lands, it shows "Voice interview coming soon" and does nothing else. Do not build any Cartesia code; Eric's agent will wire into the same Statement section.
5. **Keyboard and screen reader basics.** Ctrl or Cmd+Enter submits. The scene's number keys and Space must not fire while typing in the textarea (stopPropagation, as in the override dialog). The status line is aria-live="polite".
6. **Tests:**
   - submit on the fixture with the robbery correction statement ("Oh. No, you're right, I'd stepped out. I came to the front by the window to see what was going on. I saw him from there.") shows extracting, then "Added" with e5 among the changed events;
   - an unrelated sentence shows "No events found";
   - a rejection keeps the text and shows the message;
   - the not-an-editor path shows the identity;
   - keys typed in the textarea do not reach the scene's key handler;
   - the voice button is hidden by default.

Done-check:
- `pnpm -F web typecheck` and `pnpm -F web test` pass.
- `git grep -n "submitStatement" apps/web/src/ui` shows the Statement section using it.
- Greptile is not running; do not wait for it. The leader reviews and merges.

## Sat 2:25 PM: the hooks are on main

PR #30 merged as ff77d58. `useGraphActions().submitStatement`, `useStatementStatus` and `useLiveIdentity` are all exported from apps/web/src/scene/index.ts now, so drop any local stub and build against them. In fixture mode the robbery correction statement gives 4 patches and every event plausible. Once Sahil republishes Maincloud, submitting from a browser that is not an editor yet shows your identity flow. Send Sahil that identity (docs/demo-laptop.md, section 4).

## PR #47 (two-witness-ui, Sat 9:30 PM): what blocks the merge

Sahil is deciding whether the new panel structure is inside the freeze: the Witnesses strip, the Witnesses tab removed, the drawer's title, and "Where they disagree" in Flags. He is also looking at the scene/timeline edits the PR asks about. Separately, Greptile gives 975eed3 a 2/5 and holds the merge on three findings. Fix them on two-witness-ui with new commits; no force-push.

1. **Statements enter the wrong account** (StatementSection.tsx:286). In Fixture mode, choosing Clerk or New witness still goes through `statementSegment`, which assigns every new event to w1, so another witness's statement lands under Customer. Disable the choices Fixture can't honour, or make the fixture source use the chosen witness. Test it.
2. **Source links hide their destination** (TranscriptView.tsx:59). With Clerk focused in Events, opening a Flags source cited only by other actors opens Transcript, but the actor filter removes the requested line. Always keep an explicitly requested focusId visible. Test it.
3. **Sightline evidence names the wrong place** (flagEvidence.ts:11-12). With overlapping accounts, `activeEvent` takes the first event, while the gate uses the covering movement first and otherwise the last usable event. Don't recompute it in the UI: name the place from the flag's own evidence (the endpoint the gate chose). If the flag doesn't carry it, show the flag's detail sentence instead and tell the leader. The UI must never compute positions.
4. From the leader's Opus review: **MEDIUM**, the paired contradiction card (FlagsTab.tsx:164) drops the flag's detail sentence and evidence; add the same Raw evidence section the other cards have. **LOW**, the Solo and Re-interview buttons (WitnessStrip.tsx:76/81) need aria-labels with the witness's name, and the unused WitnessesTab/WitnessesTabView code goes.

Greptile re-reviews the push; the leader reviews and merges once Sahil has decided on the structure.
