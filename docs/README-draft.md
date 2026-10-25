# Rashomon

Rashomon turns witness testimony into an event graph in which every event cites the words it came from, then into an editable 3D reconstruction inside a measured model of a convenience store. A deterministic plausibility gate checks each claim against the store's geometry: sightlines, walkable routes and travel times, plus contradictions between statements. Built in 36 hours at Cal Hacks 13.0 (Oct 23 to 25, 2026) by a team of three.

## The core idea

A statement becomes structured events: who did what, where (by landmark, never by coordinates), and when (as an interval). Each event carries `sources`, the ids of the utterances that produced it. A gate written in plain TypeScript resolves those events to positions and paths in the store and checks them. The gate checks the room, not the person: a failed check means the geometry disagrees with the statement, never that the witness is lying, and the follow-up question it writes names the obstacle, not the witness. An event the room rules out is marked implausible and drawn as a wireframe ghost. It never enters the reconstruction as fact unless an investigator overrides it with a written reason, and that reason is logged.

## Features

What works on `main` today (commit 372939e):

- Measured box-model store (9 x 7 x 3 m) with 11 labelled landmarks, each with aliases a witness might use ("the till", "the fridge"). Layout and coordinate frame: `docs/store-floorplan.md`.
- Plausibility gate (`packages/engine`) with four checks:
  - sightline (hard): rays from the observer's eye (1.6 m) to the target's chest (1.2 m) and head (1.6 m); blocked only if both rays hit an occluding landmark;
  - reachability (hard): a route search over portal waypoints around the shelves, counter and cooler;
  - time-distance (hard): over 2 m/s for a walk, 6 m/s for a run or 8 m/s for any movement;
  - contradiction (soft): the same actor more than 2 m apart in two statements whose times overlap, within one witness or across witnesses.
  
  Two more soft checks catch events with no anchor and events with no stated time.
- Statuses come from the gate, not from the UI: `plausible`, `proposed`, `implausible`, `overridden` and `superseded`. The gate derives `overridden` (a hard flag plus a reason of at least 10 characters) and `superseded` (a retracted event) from the data itself.
- Every flag carries its measurements (blocker, distance, speed) and a templated, neutral follow-up question.
- Extraction (`packages/extractor`): Claude Sonnet 5.5 with seven strict tools turns one witness statement into patches. A validator rejects unknown landmarks, actors and props, bad intervals and empty sources. Confidence is low, medium or high in the tool and maps to 0.3, 0.6 or 0.9 in code.
- 3D scene (`apps/web/src/scene`):
  - React Three Fiber, with Mixamo Y Bot and X Bot rigs and clips loaded by `FBXLoader` and root motion stripped at load;
  - clip blending computed from the single timeline `t`, so scrubbing backward works;
  - status rendering: plausible at full opacity, proposed at 40%, implausible as a wireframe ghost with a red badge, overridden with an amber badge;
  - witness POV camera, and a sightline ray drawn red when blocked and green when clear;
  - a prop held in the hand, scaled from `packages/props/props.json`.
- Drag to edit: drop an event's anchor on a new spot and it becomes an `update_event` patch, sourced to the investigator, which is re-gated at once.
- Panels (`apps/web/src/ui`): Flags, Events and Witnesses tabs; a drawer with History (override log) and the source transcript; an override dialog that requires a reason of 10 or more characters; a Fixture/Live toggle; a docked timeline with flag navigation.
- Fixture mode (the default) runs the resolver and gate in the browser with no backend. Live mode (`?mode=live`) subscribes to the SpacetimeDB module.
- A second witness: the clerk's account (`?scenario=two-witnesses`) adds a cross-witness contradiction and witness layers you can show and hide.
- SpacetimeDB module with server-side extraction, an editors-only `submit_statement` reducer, and a webhook for the voice agent (see below).
- Typed statements: the `submit_statement` reducer and the `submitStatement` hook are on `main`. [confirm: Hazel's Statement box in the right panel is merged]

## Demo

The scenario is in `docs/scenario-script.md`. A customer in the chips aisle says she saw the suspect's face at the counter (event `e5`). The chips shelf is in the way.

1. Run in fixture mode and open `http://localhost:5173/`. Scrub the timeline: at t = 3 the suspect is walking from the front door to the counter. At t = 11 the witness is a wireframe ghost with a red badge, and her sightline ray stops red at the chips shelf.
2. In the Flags tab, `sightline:e5` is the only hard flag. Its question reads: "From the chips aisle, the chips shelf would be between you and the suspect. Where exactly were you standing when you saw that?" Press `5`, or open `/?cam=pov&t=11`, to see the shelf from her eyes.
3. She answers that she had stepped out to the front window (utterance `utt_12`). Drag `e5` onto the front window, or open `/?scenario=corrected&t=11`. The gate re-runs, `e5` turns plausible, the ray goes green and the POV shows the counter.
4. On the uncorrected graph, click Override on `e5`. A reason under 10 characters is refused. With a longer reason, `e5` becomes overridden: amber badge, flag kept, reason in History.
5. Live: open `http://localhost:5173/?mode=live&stdb=wss://maincloud.spacetimedb.com&db=rashomon&session=demo` for the same graph from Maincloud. On a scratch session, the same drag and override travel through `apply_patches` and come back re-gated. [confirm with Eric: the correction spoken to the Cartesia agent reaches the scene through `record_statement`]

## Architecture

```text
 witness (voice)                    investigator (typed)
      |                                    |
 Cartesia Managed Agent            submit_statement reducer (editors only)
 [confirm with Eric]                       |
      | POST /webhook/cartesia             | extraction_queue (private, scheduled)
      v                                    v
 +------------------- SpacetimeDB module "rashomon" -------------------+
 |  segments + utterances (text, times, provenance)                     |
 |        |  snapshot transaction                                       |
 |        v                                                             |
 |  ctx.http.fetch -> Claude Sonnet 5.5, strict tools -> validator     |
 |        |  apply transaction: patches + resolve + gate, one commit    |
 |        v                                                             |
 |  events, flags, overrides, patches  -->  graph_for_scene view       |
 +----------------------------------------------------------------------+
      |  subscription                       ^ apply_patches / override
      v                                     |
 apps/web: R3F scene + panels  -- drag, override with a reason --+
 (fixture mode: the same packages/engine runs in the browser)
```

| Folder | Owner | Contents |
| --- | --- | --- |
| `packages/schema` | Sahil | Data contracts (`src/index.ts`), store and robbery fixtures |
| `packages/engine` | Sahil | Resolver and plausibility gate, deterministic TypeScript |
| `packages/extractor` | Eric | Claude prompt, strict tools, validator, CLI |
| `packages/props` | Hazel | Props library with measured dimensions and sources |
| `spacetimedb/server` | Sahil | Tables, reducers, view, editors list, caps |
| `spacetimedb/server/src/extract`, `procedures`, `http` | Eric | Extraction run, `extract_segment` procedure, Cartesia webhook |
| `apps/web/src/scene` | Sahil | 3D scene, playback, cameras, editing, live connection |
| `apps/web/src/ui` | Hazel | Panels, override dialog, top bar, copy |
| `apps/agent` | Eric | Cartesia agent config and webhook tools [confirm with Eric: merged to main] |
| `tools/smoke`, `tools/relay` | Sahil | Seed scripts; a local webhook relay used only as a fallback |
| `docs/` | Shared | Design doc, floor plan, scenario, smoke tests, demo laptop |

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

**Fixture mode** needs no backend and no keys. It is the default, and it is the fallback if the network fails. Useful URLs: `/`, `/?cam=pov&t=11`, `/?scenario=corrected&t=11`, `/?scenario=two-witnesses`.

**Live mode** reads the module on Maincloud: `http://localhost:5173/?mode=live&stdb=wss://maincloud.spacetimedb.com&db=rashomon&session=demo`. `stdb` is the WebSocket base, and the SDK adds the subscribe path itself. Step-by-step checks are in `docs/smoke-demo.md` (fixture, local server and Maincloud) and `docs/spacetime-smoke.md` (publishing and calling reducers locally).

**Mixamo assets are not in the repo.** Adobe's terms do not allow us to redistribute them, and `apps/web/public/characters/`, `clips/`, `props/` and `dressing/` are git-ignored. Without them the store loads but the actors do not, and the clip tests skip. File names and the clip list are in `docs/clip-action-map.md`. How the team shares them is in `docs/demo-laptop.md`, section 1.

**Tests and typecheck:**

```
pnpm -r test
pnpm -r typecheck
```

**Publishing your own module.** Database names on Maincloud are global, so pick your own name and pass it as `db=` in the live URL. The module reads three environment variables: `ANTHROPIC_API_KEY`, `CARTESIA_WEBHOOK_SECRET` and `EDITOR_IDENTITIES` (comma-separated hex identities allowed to add statements). Read the values without echoing them:

```
read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY
read -rs CARTESIA_WEBHOOK_SECRET && export CARTESIA_WEBHOOK_SECRET
read -r EDITOR_IDENTITIES && export EDITOR_IDENTITIES
cd spacetimedb/server
spacetime publish rashomon --server maincloud -y
```

Seed a session from the fixture with `tools/smoke/seed-maincloud.sh <session-id>`. Check that the webhook fails closed (returns 401) without spending credits:

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'content-type: application/json' -d '{}' https://maincloud.spacetimedb.com/v1/database/rashomon/route/webhook/cartesia
```

No secrets are in this repo. Local keys go in `.env.local`, which is git-ignored.

## Cartesia features used and limitations

On `main`, the module exposes `POST /webhook/cartesia` for the agent's tools. The route:

- checks a shared secret in the `x-rashomon-webhook-secret` header with a constant-time compare, and returns 401 if the secret is missing or wrong;
- refuses bodies over 64 KB and requests with more than 50 utterances;
- stores the statement under a content-derived id, so a retry is not extracted twice;
- runs extraction and the gate, then returns every event's status and every hard flag with its `suggestedQuestion`, so the agent can ask the follow-up on its next turn.

The voice agent:

- [confirm with Eric] A Cartesia Managed Agent runs the interview over the agent WebSocket: Ink-2 for speech to text, Sonic 3.6 for the voice, and a Claude model from Cartesia's catalog as the brain.
- [confirm with Eric] Three webhook tools: `record_statement` (writes a segment and returns new flags), `get_scene_context` (landmark labels and recent events) and `end_interview`.
- [confirm with Eric] The instructions ask each new hard flag's question once, in the agent's own words. They never call a statement implausible or read out a flag's detail, and they follow cognitive-interview order: free narrative first, then landmarks, then times, then sightlines.
- [confirm with Eric] API keys are read from the environment, and `cartesia-version` is pinned to 2026-08-14.

Limitations:

- Ink-2 does not label speakers, so each stream carries one speaker. The copilot mode (investigator and witness on two devices) is designed but not built.
- The webhook extracts synchronously, and the Claude call has a 60 s timeout. A slow model turn can outrun the agent's tool timeout. [confirm with Eric: the tool timeout configured on the agent]
- Managed Agents use Cartesia's model catalog, not our own Anthropic key, so the interviewer's model is billed through Cartesia.
- Cartesia stops hosting the older Line SDK on Dec 1, 2026. We built on Managed Agents for that reason.
- Our module stores transcript text, not audio. [confirm with Eric: what Cartesia retains of session audio, and the consent wording shown to a witness]

## Claude usage and guardrails

- **Extraction:** `claude-sonnet-5-5` (`packages/extractor/src/prompt.ts`), called from inside the SpacetimeDB module with `ctx.http.fetch`.
  - Seven strict tools (`add_event`, `update_event`, `retract_event`, `add_prop`, `update_prop`, `add_actor`, `no_events`), each with `strict: true` and `additionalProperties: false`, and `tool_choice` set to any. The model never replies in prose.
  - The prompt says: record only what was said; never invent a detail; place everything by landmark id; times are intervals; appearance is not an event.
  - Calls the validator rejects go back to the model as `tool_result` errors for one retry. What still fails is logged on the segment, not applied.
- **Interviewer brain:** Claude through Cartesia's catalog. [confirm with Eric: model id]
- **Follow-up questions** are templates filled in by the gate, not generated text, so the same failed check always produces the same neutral question.
- **No model inside the gate.** It is deterministic TypeScript in `packages/engine`, and the browser and the module run the same code. The same graph always gives the same verdict, and the verdict can be printed.
- **An override needs a reason** of at least 10 characters. The UI, the module reducer and the gate all check this. The module records who made the override, the sender's identity, the time and the waived flags. Any later edit to an event, other than a change to its time, clears its override and re-gates it.
- **Every event carries sources.** The drawer shows the transcript lines behind an event. Each extracted segment stores the model id, a hash of the prompt and tools, the utterance ids sent, the time, the patch count and any error code. The `patches` table logs every patch with its sources and versions.
- **Extraction can be wrong.** It can pick the wrong landmark or actor, or invent timing. Times the model estimated are marked inferred and get a soft flag, and hedged statements get lower confidence. An investigator should read the source line before relying on an event.

We built Rashomon with Claude Code. The per-folder `CLAUDE.md` files and `.claude/skills` are the instructions our agents worked from.

## SpacetimeDB usage

The module (`spacetimedb/server`, `spacetimedb` 2.13.0) holds the whole graph and decides every status.

- **Tables:** `sessions`, `segments`, `utterances`, `actors`, `events`, `props`, `patches`, `flags` and `overrides` are public. `extraction_queue` is private.
- **Reducers:**
  - `create_session`;
  - `insert_segment` and `submit_statement`, editors only, checked against `EDITOR_IDENTITIES`;
  - `apply_patches`, whose patch ops include `retract_event` and `override`. It refuses a stale `baseVersion`.
  - `override`;
  - `set_statuses`, for the module or the session creator only; it can never set overridden or superseded.
- **Procedures:** `extract_segment`, callable only by the module itself, and `run_queued_extraction`, scheduled from `extraction_queue` when a statement is submitted.
- **View:** `graph_for_scene(sessionId)` is what the browser subscribes to.
- **HTTP:** the router serves `POST /webhook/cartesia`.

`apply_patches`, `override` and the extraction's final transaction all resolve the graph and re-run the gate before they commit. Statuses and flags therefore commit in the same transaction as the change that caused them. No subscriber ever sees a new or edited event without its verdict, and every client sees the same verdict. Extraction runs in three steps: a read transaction, the Claude call outside any transaction, then one write transaction for patches, gate and provenance.

Caps: 64 KB per body, 50 utterances per segment, 32,000 characters per segment, 64-character witness names.

## Limitations

- The store is a box model built from measured guesses at typical store sizes, not a scan. The gate uses the landmark boxes only, and a real shelf a few centimetres shorter could change a sightline verdict.
- The gate checks geometry, not truthfulness. A plausible event can still be false, and an honest witness can misjudge distance and time.
- Extraction can be wrong (see above). The source line is the ground truth, not the event.
- Animation persuades more than it should. A clean replay looks more certain than testimony is. This is a demonstrative aid for testing hypotheses, not evidence and not a recording.
- Session data on Maincloud is readable by anyone who connects, and `apply_patches` and `override` are not limited to editors. Use only fictional statements, as the demo does.
- Prop sizes come from a table of product dimensions in `props.json`. The witness's own estimate stays in the prop's notes.
- Not built: reachability with door states, recognition-distance and lighting checks, physics for dropped props, copilot mode, audio uploads, and an export. Only one scene (`store_v1`) is registered.

## Team

- Sahil (`iamab0b`): 3D scene, resolver and gate, SpacetimeDB module.
- Eric (`ieatpiYT`): extraction, the extraction procedure and webhook, the Cartesia voice agent.
- Hazel (`hsoh0408`): UI panels and override flow, the props library, the pitch.

## Licenses and credits

- Store dressing and prop models are CC0. Store dressing: Kenney (kenney.nl) [confirm: kit names]. Other CC0 sources the team drew from, per `docs/props-shopping-list.md`: Quaternius and Poly Pizza. `docs/props-shopping-list.md` names packs only, not individual Poly Pizza models or authors. [confirm: each Poly Pizza model used, its author and its CC0 badge]
- Characters and animations are from Adobe Mixamo, used under Adobe's terms and not redistributed here.
- Prop dimensions cite their source pages in `packages/props/props.json`.
- Research behind the design: Chan et al. 2024, on false memories induced by a suggestive AI interviewer; National Research Council 2014, *Identifying the Culprit*; *People v. Duenas* (Cal. 2012), on animation versus simulation in court.
- [confirm: repository license] There is no LICENSE file in the repo yet.
