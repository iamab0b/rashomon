# Rashomon

Rashomon turns witness testimony into an event graph in which every event cites the words it came from, then into an editable 3D reconstruction inside a measured model of a convenience store. A deterministic plausibility gate checks each claim against the store's geometry: sightlines, walkable routes and travel times, plus contradictions between statements. Testimony arrives typed or through a Cartesia voice interviewer. Built in 36 hours at Cal Hacks 13.0 (Oct 23 to 25, 2026) by a team of three.

## The core idea

A statement becomes structured events: who did what, where (by landmark, never by coordinates), and when (as an interval). Each event carries `sources`, the ids of the utterances that produced it. A gate written in plain TypeScript resolves those events to positions and paths in the store and checks them. The gate checks the room, not the person: a failed check means the geometry disagrees with the statement, never that the witness is lying, and the follow-up question it writes names the obstacle, not the witness. An event the room rules out is marked implausible and drawn as a wireframe ghost. It never enters the reconstruction as fact unless an investigator overrides it with a written reason, and that reason is logged.

## Features

What works on `main` today (commit 2f57be9):

- Measured box-model store (9 x 7 x 3 m) with 11 labelled landmarks, each with aliases a witness might use ("the till", "the fridge"). Layout and coordinate frame: `docs/store-floorplan.md`.
- Plausibility gate (`packages/engine`) with four checks:
  - sightline (hard): rays from the observer's eye (1.6 m) to the target's chest (1.2 m) and head (1.6 m); blocked only if both rays hit an occluder;
  - reachability (hard): a route search over portal waypoints around the shelves, counter and cooler. A scene with no portals gets a walkable graph generated from its landmarks: a 0.25 m occupancy grid with furniture and appliances grown by a 0.25 m body radius, A* between landmarks, and the paths string-pulled into waypoints;
  - time-distance: over 2 m/s for a walk or 6 m/s for a run along its own path, or 8 m/s for any movement, including between events; hard on stated times, soft when a time was estimated (#50);
  - contradiction (soft): the same actor more than 2 m apart in two statements whose times overlap, within one witness or across witnesses.

  Two more soft checks catch events with no anchor and events with no stated time.
- Statuses come from the gate, not from the UI: `plausible`, `proposed`, `implausible`, `overridden` and `superseded`. The gate derives `overridden` (a hard flag plus a reason of at least 10 characters) and `superseded` (a retracted event) from the data itself.
- Every flag carries its measurements (blocker, distance, speed) and a templated, neutral follow-up question.
- Extraction (`packages/extractor`): Claude Sonnet 5.5 with seven tools (five of them strict) turns one witness statement into patches. A validator rejects unknown landmarks, actors and props, bad intervals, empty sources and styles that do not fit their action. Confidence is low, medium or high in the tool and maps to 0.3, 0.6 or 0.9 in code.
- Action vocabulary: 22 actions, nine of them added in #40 (`hands_up`, `point`, `reach`, `kneel`, `stumble`, `jump`, `phone`, `drink`, `dodge`), and five styles that pick a variant clip (`sneak` walk, `scared` run, `forward` fall, `outward` door, `behind` look). A verb outside the vocabulary maps to the nearest action with `actionApproximated` set and the witness's own word kept in `verb`. The timeline draws those blocks with a dashed outline. Mapping table: `docs/clip-action-map.md`.
- 3D scene (`apps/web/src/scene`):
  - React Three Fiber, with Mixamo Y Bot and X Bot rigs and clips loaded by `FBXLoader` and root motion stripped at load. Clips for the new actions are optional and fall back to a listed clip when the file is missing;
  - clip blending computed from the single timeline `t`, so scrubbing backward works;
  - a procedural layer over the clips: head look-at during look, speak, point and phone; two-bone IK that reaches for the prop at pick-up (the knife in the demo); walk and run clip time driven by distance along the path;
  - status rendering: plausible at full opacity, proposed at 40%, implausible as a wireframe ghost with a red badge, overridden with an amber badge;
  - witness POV camera, and a sightline ray drawn red when blocked and green when clear;
  - store dressing from CC0 Kenney models fitted to the landmark boxes, and props held in the hand, scaled from `packages/props/props.json`.
- Scan loader: open `?scene=<url of a .glb>` or drop a GLB on the page. The file is kept in the browser's IndexedDB, capped at 200 MB. Click the floor to align it (floor plane, scale, origin at the click or the bounding box). Collision geometry, up to 150,000 triangles, is extracted from the scan, so the gate's sightline tests the scan's real surfaces.
- Timeline: a row of blocks per actor, flag navigation, and wavy start and end edges on times the model estimated. Event cards and the selected event show "Estimated Time" on those events.
- Drag to edit: drop an event's anchor on a new spot and it becomes an `update_event` patch, sourced to the investigator, which is re-gated at once.
- Panels (`apps/web/src/ui`): Flags and Events tabs; a Witnesses strip; a context drawer with Statement, Transcript, History and Scene; an override dialog that requires a reason of 10 or more characters; a Fixture/Live toggle.
- Statement view: type or paste what the witness said and submit. It calls `submitStatement`, follows the extraction with `useStatementStatus`, and lists the new and changed events and new flags. In live mode only editors can submit; any other browser sees "This browser can't add statements" with its own identity and a Copy button, to send to whoever publishes the module.
- Witnesses strip: each witness's layer can be shown, hidden or shown alone, and the strip shows where the accounts disagree. The clerk's account (`?scenario=two-witnesses`) adds a second layer and a cross-witness contradiction.
- Fixture mode (the default) runs the resolver and gate in the browser with no backend. Live mode (`?mode=live`) subscribes to the SpacetimeDB module.
- SpacetimeDB module with server-side extraction, an editors-only `submit_statement` reducer and three webhook routes for the voice agent (see below).
- Voice agent (`apps/agent`): a setup script that creates the Cartesia interviewer agent and its three webhook tools.
- Dev-only Shot button and a shot harness (`pnpm -F web shot`) that save a PNG of the current view through Playwright.

Also merged since the first draft:

- A labeling tool (`?edit=landmarks`, #38): click the floor to place and name landmark boxes on a scan, saved in the browser. It is also reachable from the Scene item in the drawer rail.
- Six body types (slim, average, heavy at two heights) with height scale and clothing tint taken from the witness's description (#45). The body files are not rigged yet, so actors fall back to the Y Bot.

## Demo

The scenario is in `docs/scenario-script.md`. A customer in the chips aisle says she saw the suspect's face at the counter (event `e5`). The chips shelf is in the way.

1. Run in fixture mode and open `http://localhost:5173/`. Scrub the timeline: at t = 3 the suspect is walking from the front door to the counter. At t = 11 the witness is a wireframe ghost with a red badge, and her sightline ray stops red at the chips shelf.
2. In the Flags tab, `sightline:e5` is the only hard flag. Its question reads: "From the chips aisle, the chips shelf would be between you and the suspect. Where exactly were you standing when you saw that?" Press `5`, or open `/?cam=pov&t=11`, to see the shelf from her eyes.
3. She answers that she had stepped out to the front window (utterance `utt_12`). Paste that answer into the Statement view, drag `e5` onto the front window, or open `/?scenario=corrected&t=11`. The gate re-runs, `e5` turns plausible, the ray goes green and the POV shows the counter. In fixture mode the Statement view knows only the robbery's statements: it replays recorded tool calls through the same validator, with no model call.
4. On the uncorrected graph, click Override on `e5`. A reason under 10 characters is refused. With a longer reason, `e5` becomes overridden: amber badge, flag kept, reason in History.
5. Live: open `http://localhost:5173/?mode=live&stdb=wss://maincloud.spacetimedb.com&db=rashomon&session=demo2` for the same graph from Maincloud. On a scratch session, the drag and override travel through `apply_patches` and come back re-gated, and an editor's typed statement goes through `submit_statement` and Claude. The voice version: the witness speaks the correction to the Cartesia managed agent, either on Cartesia's Playground call or, on the demo laptop, in the app with `?voice=1` and the local token server (`pnpm --filter agent token-server`). `record_statement` extracts and gates it through the webhook, and the scene updates. TODO(Eric): did the first real voice call work end to end?

## Architecture

```text
 witness (voice)                         investigator (typed)
      |                                         |
 Cartesia Managed Agent (apps/agent)     Statement view -> submit_statement
      | POST .../webhook/cartesia/              |  (editors only)
      |   record_statement, scene_context,      |
      |   end_interview                         | extraction_queue (private, scheduled)
      v                                         v
 +------------------- SpacetimeDB module "rashomon" -------------------+
 |  segments + utterances (text, times, provenance)                     |
 |        |  snapshot transaction                                       |
 |        v                                                             |
 |  ctx.http.fetch -> Claude Sonnet 5.5, strict tools -> validator     |
 |        |  apply transaction: patches + resolve + gate, one commit    |
 |        v                                                             |
 |  events, flags, overrides, patches  -->  graph_for_scene view       |
 |  asked_flags (private): each hard flag's question handed out once   |
 +----------------------------------------------------------------------+
      |  subscription                       ^ apply_patches / override
      v                                     |
 apps/web: R3F scene + panels  -- drag, override with a reason --+
 (fixture mode: the same packages/engine runs in the browser)
```

| Folder | Owner | Contents |
| --- | --- | --- |
| `packages/schema` | Sahil | Data contracts (`src/index.ts`), store and robbery fixtures |
| `packages/engine` | Sahil | Resolver, walkable graph and plausibility gate, deterministic TypeScript |
| `packages/extractor` | Eric | Claude prompt, strict tools, validator, CLI |
| `packages/props` | Hazel | Props library with measured dimensions and sources |
| `spacetimedb/server` | Sahil | Tables, reducers, view, editors list, caps |
| `spacetimedb/server/src/extract`, `procedures`, `http` | Eric | Extraction run, `extract_segment` procedure, Cartesia webhook routes |
| `apps/web/src/scene` | Sahil | 3D scene, playback, procedural layer, scan loader, cameras, editing, timeline, live connection |
| `apps/web/src/ui` | Hazel | Panels, Statement view, Witnesses tab, override dialog, top bar, copy |
| `apps/agent` | Eric | Cartesia agent setup, instructions and webhook tool definitions |
| `tools/smoke`, `tools/relay`, `tools/status` | Sahil | Seed and webhook smoke scripts; a local relay kept off the demo path; the team's progress tracker |
| `docs/` | Shared | Design doc, floor plan, scenario, clip map, smoke tests, demo laptop |

## How to run

Node 22 or later and pnpm 12.15.0 (pinned in `package.json`).

```
git clone https://github.com/iamab0b/rashomon.git
cd rashomon
corepack enable
pnpm install --frozen-lockfile
pnpm -F web dev
```

The app runs at `http://localhost:5173/`.

**Fixture mode** needs no backend and no keys. It is the default, and it is the fallback if the network fails. Useful URLs: `/`, `/?cam=pov&t=11`, `/?scenario=corrected&t=11`, `/?scenario=two-witnesses`, `/?scene=<url of a .glb>`.

**Live mode** reads the module on Maincloud: `http://localhost:5173/?mode=live&stdb=wss://maincloud.spacetimedb.com&db=rashomon&session=demo2`. `stdb` is the WebSocket base, and the SDK adds the subscribe path itself. Step-by-step checks are in `docs/smoke-demo.md` (fixture, local server and Maincloud) and `docs/spacetime-smoke.md` (publishing and calling reducers locally).

**Mixamo assets are not in the repo.** Adobe's terms do not allow us to redistribute them, and `apps/web/public/characters/`, `clips/`, `props/` and `dressing/` are git-ignored. Without them the store loads but the actors do not, and the clip tests skip. File names and the clip list are in `docs/clip-action-map.md`. How the team shares them is in `docs/demo-laptop.md`, section 1.

**Tests and typecheck:**

```
pnpm -r test
pnpm -r typecheck
```

**Publishing your own module.** Database names on Maincloud are global, so pick your own name and pass it as `db=` in the live URL. The module reads three environment variables: `ANTHROPIC_API_KEY`, `CARTESIA_WEBHOOK_SECRET` and `EDITOR_IDENTITIES` (comma-separated identities allowed to add statements). Read the values without echoing them:

```
read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY
read -rs CARTESIA_WEBHOOK_SECRET && export CARTESIA_WEBHOOK_SECRET
read -r EDITOR_IDENTITIES && export EDITOR_IDENTITIES
cd spacetimedb/server
spacetime publish <db-name> --server maincloud -c=never -y
```

Seed a session from the fixture with `tools/smoke/seed-maincloud.sh <session-id>`. Check that the webhook fails closed (returns 401) without spending credits:

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'content-type: application/json' -d '{}' https://maincloud.spacetimedb.com/v1/database/rashomon/route/webhook/cartesia
```

`tools/smoke/cartesia-webhook.sh <base-url> <session-id>` checks all three routes with the right secret and a wrong one.

**Setting up the voice agent.** Put `CARTESIA_API_KEY`, `CARTESIA_WEBHOOK_SECRET`, `RASHOMON_TUNNEL_URL` (the module's public https origin) and `RASHOMON_SESSION_ID` in the repo-root `.env.local`. Optional: `RASHOMON_WITNESS_ID`, `SPACETIME_DB`, `CARTESIA_AGENT_MODEL`, `CARTESIA_VOICE_ID`. Then:

```
pnpm --filter agent models
pnpm --filter agent setup
```

The first lists the models in Cartesia's catalog. The second creates the three tools and the agent, or updates them on a re-run.

No secrets are in this repo. Local keys go in `.env.local`, which is git-ignored.

## Cartesia features used and limitations

The interviewer is a Cartesia Managed Agent, configured by `apps/agent/src/setup.ts` through Cartesia's REST API with `cartesia-version` 2026-08-14.

- Three webhook tools. `record_statement` sends the witness's last turn verbatim. `get_scene_context` returns landmark names, the last five events and the next unasked question. `end_interview` closes the record. Session and witness ids are constant values the model never sees or chooses.
- The webhook secret is stored as a Cartesia secret header value, which is write-only. The script redacts the API key and the secret from any error it prints.
- The landmark labels are loaded as speech-recognition keyterms, and the agent has Cartesia's `end_call` system tool.
- The model is `CARTESIA_AGENT_MODEL`, or else the first model in Cartesia's catalog whose provider or id matches "anthropic" or "claude" (setup fails if there is none). The voice is `CARTESIA_VOICE_ID` if set, or else Cartesia's default for the agent. Setup sets no speech-to-text or speech model, so the agent uses Cartesia's defaults.
- The instructions (`apps/agent/src/instructions.ts`) follow cognitive-interview order: free narrative first, then landmarks, then times, then sightlines. They forbid suggesting details and forbid words that judge the witness, such as "implausible", "lie" or "wrong", and they never read out a flag's detail.
- Ask-back rule: `record_statement` returns `askNext`, one open hard flag's suggested question that has not been handed out before, or null. The agent asks it once, in its own words. The private `asked_flags` table records each one handed out, and flags on overridden or superseded events are skipped.

The module's routes, all `POST` under `/v1/database/<db>/route/webhook/cartesia`:

- check the `x-rashomon-webhook-secret` header with a constant-time compare, and return 401 if it is missing or wrong;
- refuse bodies over 64 KB and requests with more than 50 utterances;
- store each statement under a content-derived id, so a retried statement returns the stored result instead of being extracted twice;
- run extraction and the gate, then return every event's status, the open hard flags and `askNext`.

Limitations:

- `record_statement` extracts synchronously. Each Claude attempt has a 55 s timeout and there can be two, against the tool's 120 s timeout, which is Cartesia's maximum. A timeout reaches the agent's model as an error and the call goes on.
- Cartesia cuts tool responses over 16 KiB, and `askNext` comes last in the body, so a long session could lose it.
- One agent setup is bound to one session and one witness id. Changing them means re-running setup.
- The in-app voice interview is behind `?voice=1` and needs the local token server (`pnpm --filter agent token-server`, on 127.0.0.1:8787, origin-checked for http://localhost:5173), which mints a 300-second, agent-only Cartesia access token from `CARTESIA_API_KEY`; the key never reaches the browser. Without the flag the app has no voice control and makes no voice network or microphone calls. Otherwise the agent is reached through Cartesia's Playground call. Both write statements through the webhook.
- Each call carries one speaker. The copilot mode (investigator and witness on two devices) is designed but not built.
- Managed Agents use Cartesia's model catalog, not our own Anthropic key, so the interviewer's model is billed through Cartesia.
- Cartesia stops hosting the older Line SDK on Dec 1, 2026. We built on Managed Agents for that reason.
- Our module stores transcript text, not audio. TODO(Eric): what does Cartesia retain of session audio, and what consent wording does a witness see?

## Claude usage and guardrails

- **Extraction:** `claude-sonnet-5-5` (`packages/extractor/src/prompt.ts`), called from inside the SpacetimeDB module with `ctx.http.fetch`.
  - Seven tools (`add_event`, `update_event`, `retract_event`, `add_prop`, `update_prop`, `add_actor`, `no_events`), all with `additionalProperties: false`. Five are `strict: true`. `add_event` and `update_event` are non-strict, to stay within the API's limits on strict schemas (#48), and the validator checks every field they carry. `tool_choice` is auto, `max_tokens` is 16000 and effort is low.
  - The prompt says: record only what was said; never invent a detail; place everything by landmark id; times are intervals; appearance is not an event; a verb outside the vocabulary gets the nearest action plus the witness's own verb; a style only when the witness described how it was done.
  - One retry, shared: a reply with no tool call gets a reminder to answer with tools, and calls the validator rejects go back as `tool_result` errors. A reply cut off at `max_tokens` is recorded as truncated, and patches accepted on an earlier attempt are kept. What still fails is logged on the segment, not applied.
- **Interviewer brain:** a Claude model from Cartesia's catalog (see above).
- **Follow-up questions** are templates filled in by the gate, not generated text, so the same failed check always produces the same neutral question. The agent rephrases it but is told to keep its content.
- **No model inside the gate.** It is deterministic TypeScript in `packages/engine`, and the browser and the module run the same code. The same graph always gives the same verdict, and the verdict can be printed.
- **An override needs a reason** of at least 10 characters. The UI, the module reducer and the gate all check this. The module records who made the override, the sender's identity, the time and the waived flags. Any later edit to an event, other than a change to its time, style or approximated verb, clears its override and re-gates it.
- **Every event carries sources.** The drawer shows the transcript lines behind an event. Each extracted segment stores the model id, a hash of the prompt and tools, the utterance ids sent, the time, the patch count and any error code. The `patches` table logs every patch with its sources and versions.
- **Extraction can be wrong.** It can pick the wrong landmark or actor, or invent timing. Estimated times are marked and get a soft flag, and hedged statements get lower confidence. An investigator should read the source line before relying on an event.

We built Rashomon with Claude Code. The per-folder `CLAUDE.md` files and `.claude/skills` are the instructions our agents worked from.

## SpacetimeDB usage

The module (`spacetimedb/server`, `spacetimedb` 2.13.0) holds the whole graph and decides every status.

- **Tables:** `sessions`, `segments`, `utterances`, `actors`, `events`, `props`, `patches`, `flags` and `overrides` are public. `extraction_queue` and `asked_flags` are private.
- **Reducers:**
  - `create_session`;
  - `insert_segment`, `submit_statement`, `apply_patches` and `override`, editors only, checked against `EDITOR_IDENTITIES`;
  - `apply_patches`, whose patch ops include `retract_event` and `override`. It refuses a stale `baseVersion`.
  - `override`;
  - `set_statuses`, for the module or the session creator only; it can never set overridden or superseded.
- **Procedures:** `extract_segment`, callable only by the module itself, and `run_queued_extraction`, scheduled from `extraction_queue` when a statement is submitted. Resubmitting a statement whose extraction failed queues it again.
- **View:** `graph_for_scene(sessionId)` is what the browser subscribes to. The Statement view also subscribes to the session's `segments` to follow extraction.
- **HTTP:** the router serves `record_statement`, `scene_context` and `end_interview` under `/webhook/cartesia`, and the bare `/webhook/cartesia` as an alias of `record_statement`.

`apply_patches`, `override` and the extraction's final transaction all resolve the graph and re-run the gate before they commit. Statuses and flags therefore commit in the same transaction as the change that caused them. No subscriber ever sees a new or edited event without its verdict, and every client sees the same verdict. Extraction runs in three steps: a read transaction, the Claude call outside any transaction, then one write transaction for patches, gate and provenance.

Caps: 64 KB per body, 50 utterances per segment, 32,000 characters per segment, 64-character witness names, 40-character verbs.

## Limitations

- The default store is a box model built from measured guesses at typical store sizes. The gate uses its landmark boxes only, and a real shelf a few centimetres shorter could change a sightline verdict.
- A loaded scan gives the gate real surfaces, but it has no landmarks until someone labels it with the labeling tool, so the robbery graph cannot be placed in it and the scene starts empty. Scans live in one browser's IndexedDB and work in fixture mode only: live mode shows "Live mode needs the scan's manifest on the server".
- The generated walkable graph is coarse: 0.25 m cells, one body radius, and only furniture and appliance landmarks block.
- The gate checks geometry, not truthfulness. A plausible event can still be false, and an honest witness can misjudge distance and time.
- Extraction can be wrong (see above). The source line is the ground truth, not the event. An approximated verb is drawn with the nearest action's clip, not the witness's movement.
- Animation persuades more than it should. A clean replay looks more certain than testimony is. This is a demonstrative aid for testing hypotheses, not evidence and not a recording.
- Session data on Maincloud is readable by anyone who connects: the graph tables are public. Every write reducer checks `EDITOR_IDENTITIES`. Use only fictional statements, as the demo does.
- Prop sizes come from a table of product dimensions in `props.json`. The witness's own estimate stays in the prop's notes.
- Not in this build: a `scenes` table and `put_scene` reducer for scanned rooms in live mode (cut; the module registers one scene, `store_v1`), and Uthana text-to-motion for verbs with no clip (generated motion is not merged to `main`).
- Not built: reachability with door states, recognition-distance and lighting checks, physics for dropped props, copilot mode, audio uploads, and an export.

## Team

- Sahil (`iamab0b`): 3D scene, resolver and gate, SpacetimeDB module.
- Eric (`ieatpiYT`): extraction, the extraction procedure and webhook, the Cartesia voice agent.
- Hazel (`hsoh0408`): UI panels, Statement view and Witnesses tab, override flow, the props library, the pitch.

## Licenses and credits

- Store dressing and prop models are CC0. Store dressing: Kenney (kenney.nl); `docs/props-shopping-list.md` lists the Furniture Kit. Other CC0 sources the team drew from, per `docs/props-shopping-list.md`: Quaternius and Poly Pizza. `docs/props-shopping-list.md` names packs only, not individual Poly Pizza models or authors. TODO(Eric): which Poly Pizza models are used, with each author and CC0 badge?
- Characters and animations are from Adobe Mixamo, used under Adobe's terms and not redistributed here.
- Prop dimensions cite their source pages in `packages/props/props.json`.
- Research behind the design: Chan et al. 2024, on false memories induced by a suggestive AI interviewer; National Research Council 2014, *Identifying the Culprit*; *People v. Duenas* (Cal. 2012), on animation versus simulation in court.
- There is no LICENSE file in the repo yet. TODO(Eric): which license does the team choose?
