# Demo smoke test (updated Sat 1:10 PM: Maincloud section)

Run on the merged main in /home/sahilmehta/calhacks/rashomon with `pnpm -F web dev` on http://localhost:5173 and the Mixamo clips in apps/web/public. Each step lists what should happen; anything else is a failure. Write the failures into board.md. 06 (PR #18) is on main: the Timeline is docked under the canvas (App.tsx, from #17; the scrub bar is gone), and a selected event has a drag gizmo. Two quick live drops now give "a change is still being applied" on the second instead of a silent stale-version loss (#19).

## Fixture mode (no backend; stop the local SpacetimeDB first to prove it)

1. Open `/`. The top bar badge says Fixture data. The store loads with three actors, and there are no WebSocket attempts in devtools Network (filter on WS).
2. Scrub the Timeline to t = 3. The suspect is mid-walk from the front door to the counter. At t = 11 the witness is a wireframe ghost with a red badge, and its sightline ray stops red at the chips shelf.
3. In the right panel's Flags tab, the sightline flag on e5 is the only hard flag, and its suggested question is shown. No other event has an Override button.
4. Press `5` (or open `?cam=pov&t=11`). The witness's POV shows the chips shelf blocking the view of the counter.
5. Click Override on e5 and type a reason of fewer than 10 characters. Confirm stays disabled or shows the rule, and the dialog stays open. Escape closes it, and focus goes back to the page.
6. Override again with a reason of 10 or more characters. e5 leaves the Flags tab, History shows the override with your reason, the e5 flag is kept on the event, and the status reads overridden (it comes from the gate, not the panel).
7. Click Live in the top bar. A confirmation appears, because a fixture override exists. Cancel it: the URL is unchanged and the override is still there.
8. Open `/?scenario=corrected&t=11`. The witness stands at the front window, solid with no badge, and its sightline ray is green to the suspect. The Flags tab has no hard flags. Open the POV: the clerk and the suspect are visible at the counter.
9. Reload `/`. Click e5 on the witness row of the Timeline (it sits inside e3 and must be clickable). A gizmo appears at the witness. Drag it onto the front window and release. Within a frame e5 turns plausible, the ghost and the red badge go away, and the ray goes green. e3 and e5 keep soft contradiction flags (e3 still says aisle_chips until t 11), which is expected. Press Escape during a second drag: nothing changes.
10. Open `/?fixture=nope`. Nothing plays and nothing crashes, but the badge still says Fixture data (this is a known LOW).

## Live mode against the local server (127.0.0.1:3000; every command carries `--server local`)

L1. Run `spacetime sql --server local rashomon "select version, id from sessions"`. Session demo is at version 1. Do not change demo; the mutating steps below use their own session, smokeam.
L2. Open `/?mode=live`. The badge reads "Live · connecting" and then "Live". There are 10 events, e5 is implausible with sightline:e5, and the wireframe, badge and red ray match fixture step 2. Scrubbing works.
L3. Stop the SpacetimeDB server while the page is open. The badge still stays "Live" over the last snapshot until Hazel's ui-refine-followups shows `useGraphErrors()`; the scene now exports the error. Restart the server and reload.
L4. Seed a scratch session: `spacetime call --server local rashomon create_session smokeam store_v1`, then the patches file and `apply_patches smokeam 0 "$(cat /tmp/patches.arg)"` exactly as in docs/spacetime-smoke.md, with no set_statuses. Open `/?mode=live&session=smokeam`. e5 is implausible, as in L2.
L5. Click Override on e5 in the panel with a reason of 10 or more characters. With 06 the override goes to the server through apply_patches. The dialog closes at once, and within a second e5 shows overridden with its flag kept. If it never changes, check `spacetime sql --server local rashomon "select version from sessions where id = 'smokeam'"`: a version bump means the row arrived but the page missed it (L6).
L6. [answered Sat: view updates arrive without a reload, seen in L9] Override from the CLI on a fresh scratch session (seed smokeam2 as in L4): `spacetime call --server local rashomon override smokeam2 e5 "Witness was at the window, per the second interview" "Sahil"`. Within a second, without a reload, e5 shows overridden with its flag kept. The connector now listens to onUpdate and onInsert; if the page still does not update, the view's change arrives some other way. Reload: e5 shows overridden. Write which of the two happened into board.md, because it has never been checked on a real server.
L7. Apply the correction on a second scratch session, smokefix, seeded as in L4:
```
node -e 'const g=require("./packages/schema/fixtures/robbery.graph.json");require("fs").writeFileSync("/tmp/fix.arg",JSON.stringify(JSON.stringify(g.correctionPatch.patches)))'
spacetime call --server local rashomon apply_patches smokefix 1 "$(cat /tmp/fix.arg)"
spacetime sql --server local rashomon "select id, status from events where session_id = 'smokefix'"
```
Every event is plausible, including the new walk event to window_front, and the session is at version 2. `/?mode=live&session=smokefix&t=11` looks like fixture step 8.
L8. A stale write is rejected: run the same apply_patches with base version 1 again. It fails with "stale baseVersion 1; the graph is at version 2", and the page does not change.
L9. Live drag: smokefix is already corrected, so seed smokedrag as in L4, open `/?mode=live&session=smokedrag`, drag e5 to the front window as in fixture step 9. The session version goes from 1 to 2 and e5 turns plausible without a reload. Two drops in quick succession: the second is refused with "a change is still being applied; try again in a moment" (shown once Hazel renders useGraphErrors).
L10. Back on `/?mode=live` (session demo), it is still at version 1 with e5 implausible. That is the state the demo starts from.

## Live mode on Maincloud (database rashomon; every command carries `--server maincloud`)

Live since Sat 1:05 PM: demo seeded at version 1, and smoke L2 passes at

```
http://localhost:5173/?mode=live&stdb=wss://maincloud.spacetimedb.com&db=rashomon&session=demo2
```

`stdb` is the WebSocket base the SDK connects to; it adds `/v1/database/rashomon/subscribe` itself.

M1. `spacetime sql --server maincloud rashomon "select version, id from sessions"`. Session demo2 is at version 1. The demo and the judges use it, so never change it: mutating checks use their own session. (Since the Sun 2:45 AM freeze the judges' session on Maincloud is demo2, seeded clean at version 1. The old session demo had been edited to version 2 with e5 plausible, and is left as it is.)
M2. Open the URL above. Expect the same as L2: "Live · connecting" then "Live", 10 events, and e5 implausible with sightline:e5.
M3. The webhook fails closed, and this check spends no credits: `curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'content-type: application/json' -d '{}' https://maincloud.spacetimedb.com/v1/database/rashomon/route/webhook/cartesia` gives 401.
M4. Writes: `tools/smoke/seed-maincloud.sh smokemc` seeds a scratch session. Open the URL with `session=smokemc` and repeat L5 (override) and L9 (drag) there.
M5. After any later publish, check M1 again. A publish without -c keeps every session. A publish with -c=always wipes them all, so re-seed the judges' session with `tools/smoke/seed-maincloud.sh demo2` afterwards.

## After the smoke
- Leave demo at version 1. The scratch sessions smokeam, smokeam2, smokefix and smokedrag can stay; nothing reads them.
- Never publish with -c=always to reset: that wipes demo too. If demo was changed by mistake, re-seed per docs/spacetime-smoke.md with session id demo, which needs a fresh publish. Ask the leader first.
