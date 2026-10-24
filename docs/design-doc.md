# Rashomon — Cal Hacks 13.0 Design Doc

Oct 22, 2026 · @Sahil

## Start here (teammates)

This doc is the baseline for a 36-hour build of Rashomon: witness testimony becomes a checkable, editable 3D reconstruction of an incident inside measured geometry of the real place. Everything binding is in two sections: **Data contracts** (the six types every seat builds against) and **Team split** (your row). The rest is reasoning you can skim. Comment on anything; Sahil and Seat A resolve comments.

**Who is who**

| Seat | Person | Owns | Read first (10 minutes) |
| --- | --- | --- | --- |
| A · Engine + backend | (name) | `packages/schema`, `packages/engine`, `spacetime/` | Data contracts, Plausibility engine, Backend, your Team split row |
| B · 3D workspace | Sahil | `apps/web/src/scene` | 3D layer |
| C · Interview + extraction | Eric (?) | `packages/extractor`, `apps/agent`, `apps/web/src/adapters` | Input modes, Voice, Backend (the write path) |
| D · UX + product | Hazel | `apps/web/src/ui`, `design/`, `demo/`, `packages/props` | Team split (D's design brief), Prizes, Timeline |

Everyone also reads What we're building, Scope tiers, Timeline (your checkpoints and rest block) and Risks.

**Rules of the road**

1. Contracts freeze at H+2 (Friday 11 PM). After that only A changes `packages/schema`, announced in the channel with a version bump.
2. The fixtures are the spec: `fixtures/store.scene.json` and `fixtures/robbery.graph.json`. Your first test is "does my piece do the right thing on these two files."
3. Main is always demoable. Merge small, every 60 to 90 minutes, with typecheck and the fixture tests green.
4. Feature freeze Saturday 9 PM. After that only bug fixes, merged by A. The demo laptop stays on the `demo-v1` tag.
5. Checkpoints are the only synchronous meetings: H+2, H+8, H+14, H+20, H+24; 20 minutes, one laptop. Everything else is async in the channel.
6. Rest is scheduled, not optional: two 2-hour blocks each (see Timeline). Nobody integrates alone at 4 AM.
7. Nothing in the repo is written before the opening bell. Prep is scans, assets, accounts, prompts and paper.

**Setup (everyone, once the repo exists Friday evening)**

```
git clone <repo-url> rashomon && cd rashomon
pnpm install
cp .env.example .env.local
pnpm dev
pnpm test
```

Keys that go in `.env.local`, never in git: `ANTHROPIC_API_KEY` (A, C), `CARTESIA_API_KEY` (C), `ASSEMBLYAI_API_KEY` (C), `SPACETIME_DB` (everyone; the Maincloud database name A publishes). The Cartesia judges read the repo for secrets.

**Seat A only, in the Friday setup block**

```
curl -sSf https://install.spacetimedb.com | sh
npx -y skills add clockworklabs/spacetimedb --skill spacetimedb-concepts --agent claude-code
npx -y skills add clockworklabs/spacetimedb --skill spacetimedb-cli --agent claude-code
npx skills add https://github.com/douglance/stdb-skills --skill spacetimedb-best-practices
```

Windows: `iwr https://windows.spacetimedb.com -useb | iex` instead of the curl line. `spacetime dev --template basic-ts` starts a local server, publishes the module and generates TypeScript client bindings in one command; the module imports from `spacetimedb/server`.

**Friday evening**: 6 PM dinner is the contracts session, all four at one table; 7 PM assignments are in Team split under "Friday setup block"; 9 PM everyone is building.

**Using this doc**: it is shared with edit access. Edit inline, add comments, and keep the Decisions table current when something changes.

## Decisions (answered Friday 2 PM)

Every open question is decided and the doc matches. When a decision changes during the event, change the row here first.

| # | Decision | What it changed in the plan |
| --- | --- | --- |
| 1 | Fourth teammate confirmed for Seat D; React level unknown, assume AI-assisted | D's build items are written as prompt-driven tasks with screenshots as the check; the Figma Make mock comes first so D has something to build toward |
| 2 | Nobody else has Three.js hours | Seat B is you alone; props and physics stay in B's lane; D never touches `scene/` |
| 3 | Name: **Rashomon** | GoDaddy domain: try rashomon.app / rashomon.dev / rashomon-ai.com |
| 4 | No iPhone Pro assumed | Scene capture is photogrammetry on any phone (Plan A) with a measured box-model store as the default (Plan B); LiDAR instructions kept in the 3D section in case someone has one |
| 5 | Scenario: **witness to a convenience-store robbery** | Fixtures, landmarks, props, the demo moment and the pitch beats are rewritten below; the planted contradiction is a sightline from the chips aisle to the counter blocked by the end-cap shelf |
| 6 | Tooling: Claude Code primary, Cursor and Antigravity on separate git worktrees, Claude Code cloud sessions for background jobs; no Hiveswarm | AI plan and prep checklist updated; the Hiveswarm risk is replaced by a worktree-merge risk |
| 7 | Microsoft track: we submit | Confirm vendor eligibility at the Fri 7 PM social, but enter regardless |
| 8 | Team of 4 | The 3- and 2-person contingencies stay in Scope tiers as insurance only |
| 9 | Backend: SpacetimeDB only | Decided Fri 2:20 PM; Convex dropped. Official Claude Code skills (spacetimedb-concepts, spacetimedb-cli) exist in the clockworklabs/spacetimedb repo, which removes the main risk; A installs them in the setup block |
| 10 | The one real person for Anthropic's "named community" | D makes a 15-minute call Friday afternoon to a public-defender investigator or a law-clinic student; the quote goes on the problem slide |

**Assumptions the plan rests on**

- Per the Devpost schedule (checked Fri Oct 23, 9:40 AM): submissions open Friday 6:00 PM PDT, close Sunday 9:00 AM (hard), table claimed by 8:00 AM, winners announced Sunday 4:00 PM. We treat Friday 6 to 9 PM as the setup block (check-in, opening ceremony, booths, repo init, contracts session) and H0 = Friday 9 PM, so every hour in this doc still holds and the plan has 3 hours of slack it did not have on Wednesday. The Hive live site (hive.hackberkeley.org) renders client-side and could not be read without a browser; its schedule and prizes pages may add workshop times and track criteria, so one person reads them at check-in.
- Everyone brings a laptop that can run a Vite dev server and Claude Code; one laptop drives the demo.
- Up to 4 h of rest per person, taken in two 2-hour blocks, staggered so the engine owner is awake at every checkpoint.
- All implementation starts at the opening bell. Scanning the room, labeling landmarks on paper, writing the schema on paper, provisioning API keys, downloading Mixamo assets, and writing CLAUDE.md prompt files are prep (Cal Hacks FAQ: "Ideation before the hackathon is allowed, but all implementation must occur during the hackathon"). Keep prep in a separate folder; nothing from it is committed to the submission repo.

## What we're building

Rashomon turns witness testimony into a checkable, editable 3D reconstruction of an incident inside a scan of the real room. Testimony comes in by live AI interview, by an investigator interviewing while the AI listens, or by uploaded audio and text. Every claim becomes an event anchored to a real landmark, cited to the utterance that produced it, and run through a plausibility engine before it is allowed into the scene. Investigators edit the reconstruction by dragging actors and props on a timeline, and every edit is re-checked the same way.

**The demo moment (at 90 seconds of a 3-minute pitch).** The witness, a customer in the chips aisle, says she saw the suspect's face when he pulled the knife at the counter. The scene renders her sightline; the end-cap shelf blocks it. The event turns amber, the agent says "From the chips aisle the end-cap shelf would be between you and the counter. Where were you standing when you saw his face?" She says she had stepped over to the cooler by the window. The event moves, turns green, and the animation re-plays from her new position. Nothing was faked; the store's geometry caught it.

**The judge framing.** Three sentences, in this order:

1. Testimony is the most common and least reliable evidence there is; today it becomes a written statement nobody can check against the room.
2. We make it falsifiable: the scan is ground truth, every claim is a geometric hypothesis, and the system refuses to animate what the room says is impossible.
3. A human stays in charge: investigators override with a reason, every event carries its source quote, and uncertainty is drawn as uncertainty.

**The edge over prompting a model for a scene.** A generated video is a persuasive fiction: invented room, invented distances, gaps silently filled, different every run. Ours is a reconstruction that can be wrong in a checkable way. The model is still the extraction and reasoning engine; the harness around it (real geometry, deterministic resolver, provenance, status gating) is what makes the output usable as evidence support rather than illustration. Two papers bracket us: VeriScene (arXiv, Sept 2026) turns photos plus written statements into an 8-second video offline and reports no gain on physical plausibility, and Criminator (CHI '26, Monash with Victoria Police) lets officers hand-animate a scene inside a scan of a real building with no testimony parsing or checks. Nobody we could find closes the loop live, in voice, inside the real room, with a gate and an editable multi-witness output. Say "first to close the loop live," never "never been done."

**Who it is for.** Investigators and public defenders first (they have the scan and the witness), insurers and accident reconstructionists second (same engine, no crime). Pitch it to the first group; mention the second in one line to answer the "market" question.

## Scope tiers

The MVP is what must work at the table Sunday. Stretch items are ordered; nothing in a later tier starts before the earlier tier runs end to end. All six of your additions are in, but four of them land as thin versions of a general mechanism rather than as separate features. The trick that makes this fit: every input mode produces the same transcript segments, every segment goes through the same extractor, and every event goes through the same gate. Build the mechanism once, then each "mode" is a few hours of UI.

**MVP (must demo, feature-frozen Saturday 9 PM)**

- The store scene as a GLB under 50K triangles (photogrammetry scan or the measured box model) with 11 labeled landmarks
- Text and typed-transcript input (addition 1, text half) through one extractor to the event graph
- Live AI voice interview with Cartesia, behind a feature flag so a voice outage never breaks the demo
- Plausibility gate with three hard checks (line of sight, reachability, time-distance) and one soft check (cross-statement contradiction); statuses `proposed / plausible / implausible / overridden`; implausible events never animate without an override (addition 4)
- Investigator override with a required reason, logged (addition 4)
- Two actors on resolved paths with Mixamo clips; props from a library of \~8 spawned on mention, with gravity and collision for dropped objects (additions 5 and 6, thin)
- Timeline scrubber; drag an actor or prop anchor to a new landmark; every edit re-runs the gate (addition 5)
- Dimension overlay and a notes field on every prop (addition 6)
- Witness-POV camera, ghosted rendering for `proposed` events
- Export: event graph JSON and a WebM capture of the canvas

**Stretch, in order**

1. Copilot mode: investigator and witness talk, Ink transcribes with diarization, extractor runs on the witness's lines only, a side panel shows flags and suggested next questions (addition 2). Lands as a second input adapter plus one panel; the extractor and gate are unchanged.
2. Uploaded audio files transcribed and diarized offline (addition 1, audio half). Same adapter as copilot mode fed from a file instead of a mic.
3. Second witness as a separate layer: per-witness color, per-witness confidence, cross-witness contradiction check, fused view (addition 3).
4. Testimony revision: a witness re-interviews, new statements supersede old ones by utterance, superseded events stay in history, revised events re-gated (addition 3).
5. Viggle JST-2 text-to-motion for verbs Mixamo lacks ("stumbled backward and caught himself").
6. Moss in-browser retrieval of prior statements for the interviewer plus one social post (two of Moss's three stated examples); the Figma mock is built in Figma Make with the Figma agent at the Friday workshop, so the Figma track costs nothing extra.

**Cut (do not build during the event)**

- OCR of documents or evidence tags; raw LiDAR point-cloud processing; Gaussian-splat visuals over the mesh; any physics on characters (kinematic paths only); facial likeness or clothing; a lie detector of any kind (see Plausibility engine); mobile layout; accounts and auth.

**Team of 4 is confirmed; the two contingencies below stay as insurance. If the team is 3:** MVP only, copilot mode becomes the single stretch item, and Seat D's build work splits between A and C.

**If the team is 2:** drop voice to a toggle that may never ship, drop props to 3, keep the gate and the editor. The contradiction catch still works in text.

## Architecture and data flow

&#91;embedded content: architecture · 3 inputs, one graph, two feedback loops\]

All three input modes produce the same transcript segments, so the extractor and the gate are written once. The two loops are the product: flags from the gate become the interviewer's next question, and every edit or override in the workspace is a patch that goes back through the same gate.

**How one statement becomes animation, in order**

1. A segment lands: `{witness: w1, speaker: witness, utt: utt_7, text: "He came in the front door and went straight to the counter and told the clerk to open the register", t: [41.2, 46.0]}`.
2. The extractor is called with the segment, the landmark map, and the current graph summary. It returns patches, never prose: `add_event {actor: suspect, action: walk, from: lm_front_door, to: near(lm_counter), confidence: 0.9, source: utt_7}` and `add_event {actor: suspect, action: speak, at: near(lm_counter), target: clerk, source: utt_7}`.
3. The applyPatches reducer commits them in one transaction; the events are `proposed`. Everything subscribed to the graph updates.
4. The resolver maps landmarks to positions, asks the navmesh for a path door-to-counter around the aisle, and gets 7.4 m. At 1.4 m/s that is 5.3 s; the witness implied about 5 s. Time-distance passes.
5. The gate runs sightline for any `saw` claims that depend on this event, reachability for the path, and cross-statement contradiction against existing events. No flags: the events become `plausible`.
6. The workspace animates them: a Mixamo walk clip along the path, root motion driven by the resolved path length and duration, idle at the counter.
7. If a check had failed, the event would be `implausible`, drawn as a ghosted outline only, and a flag with a suggested question would go to the interviewer (live mode) or the copilot panel (copilot mode). The witness's answer produces a new segment, and the loop runs again.
8. If the investigator drags the suspect's start point to the back door, that is `update_event {from: lm_back_door, source: investigator}`; the gate re-runs and the status is recomputed. An override on an `implausible` event requires a reason string and sets status `overridden`; the event animates with a persistent warning badge.

## Data contracts

These six types are the whole interface between seats. They live in `packages/schema` as Zod schemas with inferred TypeScript types, frozen at hour 2, changed only by a one-line message in the team channel plus a version bump. Everyone builds against the fixture files in `packages/schema/fixtures`, not against each other's running code.

**Landmark map** (Seat D produces it in prep; the resolver and extractor consume it)

```typescript
type Landmark = {
  id: string;
  label: string;
  aliases: string[];
  position: [number, number, number];
  bounds: { min: [number, number, number]; max: [number, number, number] };
  kind: "door" | "window" | "furniture" | "appliance" | "zone" | "prop_spawn";
  occludes: boolean;
};

type SceneManifest = {
  sceneId: string;
  meshUrl: string;
  navmeshUrl?: string;
  up: "y";
  unitsPerMeter: 1;
  eyeHeight: 1.6;
  landmarks: Landmark[];
};
```

**Transcript segment** (every input adapter emits exactly this)

```typescript
type Segment = {
  id: string;
  sessionId: string;
  witnessId: string;
  speaker: "witness" | "interviewer" | "agent";
  text: string;
  t: [number, number];
  source: "live" | "copilot" | "upload_audio" | "upload_text";
  supersedes?: string;
};
```

**Event graph**

```typescript
type Actor = { id: string; label: string; role: "witness" | "suspect" | "victim" | "other"; rig: "mixamo_ybot" | "mixamo_xbot" };

type Anchor =
  | { kind: "at"; landmark: string }
  | { kind: "near"; landmark: string; radiusM?: number }
  | { kind: "between"; a: string; b: string }
  | { kind: "xyz"; position: [number, number, number] };

type Action = "stand" | "walk" | "run" | "crouch" | "fall" | "shove" | "punch" | "pick_up" | "drop" | "throw" | "open_door" | "look" | "speak";

type Status = "proposed" | "plausible" | "implausible" | "overridden" | "superseded";

type Event = {
  id: string;
  witnessId: string;
  actor: string;
  action: Action;
  from?: Anchor;
  to?: Anchor;
  at?: Anchor;
  facing?: string;
  target?: string;
  prop?: string;
  t: [number, number];
  tConfidence: "stated" | "inferred";
  confidence: number;
  sources: string[];
  status: Status;
  flags: Flag[];
  override?: Override;
  supersededBy?: string;
};

type PropInstance = { id: string; type: string; anchor: Anchor; heldBy?: string; notes: string; sources: string[] };

type EventGraph = { sceneId: string; actors: Actor[]; events: Event[]; props: PropInstance[]; version: number };
```

**Patch** (the only thing the extractor and the editor are allowed to emit)

```typescript
type Patch =
  | { op: "add_event"; event: Omit<Event, "id" | "status" | "flags"> }
  | { op: "update_event"; id: string; changes: Partial<Event>; sources: string[] }
  | { op: "retract_event"; id: string; sources: string[] }
  | { op: "add_prop"; prop: Omit<PropInstance, "id"> }
  | { op: "update_prop"; id: string; changes: Partial<PropInstance>; sources: string[] }
  | { op: "add_actor"; actor: Actor }
  | { op: "override"; id: string; reason: string; by: string };
```

**Flag** (the gate's only output)

```typescript
type Flag = {
  id: string;
  eventId: string;
  check: "sightline" | "reachability" | "time_distance" | "contradiction" | "unanchored" | "missing_time";
  severity: "hard" | "soft";
  detail: string;
  evidence: Record<string, number | string>;
  conflictsWith?: string[];
  suggestedQuestion: string;
};

type Override = { by: string; reason: string; at: number; flagIds: string[] };
```

**Props library entry** (static JSON shipped with the app, Seat D fills it in prep)

```typescript
type PropType = {
  type: string;
  label: string;
  aliases: string[];
  modelUrl: string;
  dimensionsM: { l: number; w: number; h: number };
  massKg: number;
  graspable: boolean;
  defaultNotes: string;
  source: string;
};
```

**Rules that make the contracts hold**

- The extractor never emits coordinates; it emits anchors by landmark id, or `xyz` only when the investigator placed something by hand.
- `sources` is never empty. An event with no utterance behind it cannot exist; the editor writes `investigator:<userId>` as its source.
- Status is set only by the gate, never by the extractor or the renderer. `overridden` is set by the `override` patch and survives re-gating until any field other than `t` changes.
- Time is seconds from the incident start as the witness narrates it; `tConfidence: inferred` means the resolver filled it from path length and walking speed.
- The renderer draws `plausible` and `overridden` fully, `proposed` ghosted, `implausible` as an outline with the flag badge, `superseded` not at all (available in the history drawer).

**The fixture pair.** `fixtures/store.scene.json` (11 landmarks: front\_door, window\_front, counter, behind\_counter, register, shelf\_a, shelf\_b, aisle\_chips, aisle\_drinks, cooler, back\_door; `occludes: true` on shelf\_a, shelf\_b, cooler and counter) and `fixtures/robbery.graph.json` (3 actors: clerk, suspect, witness; 10 events; 2 props: knife, register; exactly one sightline contradiction on `e5`, the witness's "saw his face" claim from aisle\_chips, blocked by shelf\_a) exist as paper fixtures in Sahil's Seat B prep pack, with a measured floor plan that fixes the coordinate frame (origin at the inside front-left corner, +X toward the counter, +Z into the store, meters, Y up). They are reviewed over dinner Friday and typed into the repo in hour 1. Every seat's first test is "does my piece do the right thing on these two files."

## Plausibility engine

The rule you called the mortal sin, stated precisely: **no event animates as fact unless it has passed every hard check or an identified investigator has overridden it with a written reason.** The gate is deterministic TypeScript with no model in the loop, so it gives the same answer for the same graph every time and its reasoning can be printed. The model proposes; geometry disposes.

**What the gate is and is not.** It is a physical-consistency checker: does the room allow this claim? It is not a lie detector. Eyewitness research is clear that honest witnesses misjudge distance, time and sequence routinely, so a failed check means "the room disagrees with this statement," never "the witness is lying." The UI, the agent's wording and the pitch all keep that distinction. Judges with a legal background will ask; this is the answer.

**Checks**

| Check | Severity | Rule | Inputs | Suggested question template |
| --- | --- | --- | --- | --- |
| Sightline | hard | Raycast from the observer's eye (position + 1.6 m) to the target's chest (+1.2 m) and head (+1.6 m) at the event's time; blocked if the scene mesh or any landmark with `occludes: true` is hit before the target on both rays | observer event, target event, mesh, landmarks | "From the {observer landmark}, the {blocker} would be between you and the {target}. Where exactly were you standing when you saw that?" |
| Reachability | hard | Navmesh returns no path between `from` and `to`, or the path crosses a landmark marked closed (door state) | navmesh, anchors, door states | "The way from the {from} to the {to} runs through the {blocker}. Was it open, or did they go another way?" |
| Time-distance | hard | Path length / stated duration exceeds 2.0 m/s for `walk`, 6.0 m/s for `run`, or any movement exceeds 8.0 m/s | resolved path, stated `t` | "That is about {distance} m in {duration} s. Did it feel faster than a normal walk, or did it take longer than that?" |
| Contradiction | soft | Same actor at two anchors more than 2 m apart with overlapping `t`; or two witnesses place the same actor in disjoint locations at the same time; or an event's `from` contradicts the previous event's `to` for the same actor | all events, per witness and cross-witness | "Earlier you said he was by the {a} around then; now the {b}. Which came first?" |
| Unanchored | soft | Event has no anchor that resolves to a landmark | event | "Where in the room was that? Closer to the {nearest two landmarks}?" |
| Missing time | soft | Event has no stated `t` and the resolver could not infer one from neighbors | event | "Was that before or after {neighbor event}?" |

Speeds come from the resolver's constants file so the investigator can adjust them per case. Published bands: walking 1.0 to 1.6 m/s ([FHWA](https://www.fhwa.dot.gov/publications/research/safety/pedbike/98107/section2.cfm) design value 1.2), running 3 to 5.3 m/s. The hard thresholds above sit well outside those bands so the gate rejects only what is physically impossible, not merely unusual.

**Two more soft checks worth adding if A has an hour at H+20**, both from the eyewitness literature rather than geometry: *recognition distance* (a stranger's face past about 13 m is unreliable and past 60 m facial features are not resolvable in daylight; flag `saw his face` claims beyond those ranges, asking about glasses and prior familiarity) and *lighting* (a detail claim in a dark room at night gets a soft flag asking which lights were on). Neither can be hard, because both depend on facts the scan does not hold.

**Witness numbers are intervals, never points.** In real-world crash tests, estimates of a true 15 m distance averaged 31% low with individual answers from 0.9 to 25.9 m. The extractor records a stated "about ten seconds" as `t: [7, 13]` with `tConfidence: stated`, and the time-distance check tests the generous end of the interval. A check that fails only at the point estimate is not a flag.

**Statuses and transitions**

- `proposed`: just extracted, not yet gated. Drawn ghosted. Lives for one tick.
- `plausible`: all hard checks pass. Soft flags may be attached and shown as amber badges; the event still animates.
- `implausible`: at least one hard flag. Drawn as a wireframe outline at the claimed position with a red badge; no clip plays. The flag's `suggestedQuestion` goes to the interviewer.
- `overridden`: an investigator accepted an implausible event. Animates with a persistent warning badge and the reason in its tooltip. Any later edit to an anchor or actor clears the override and re-gates.
- `superseded`: replaced by a revision. Hidden from the scene, kept in history.

**Override is a first-class patch**, not a UI shortcut. It records who, when, why, and which flags were waived. The export includes the override log. On stage: "the system never silently accepts an impossible claim, and it never silently rejects one either; both are a human decision with a paper trail."

**What the agent is allowed to say.** The interviewer asks the suggested question in neutral form. It never says "that's impossible," "are you sure," or "you said something different before." It names the room, not the witness: "from the chips aisle, the end-cap shelf would block the counter." This is also the cognitive-interview best practice (open questions, no leading, context reinstatement), so it serves the copilot mode's question suggestions as well. It matters more than style: a 2024 study from Loftus's group found a generative-AI interviewer induced more than three times the immediate false memories of a control, so the agent never supplies a detail the witness has not said, asks the same open questions of every witness, and labels anything the resolver inferred as "not witnessed."

**Confidence vs status.** `confidence` is the extractor's estimate of how clearly the witness said it (hedges like "I think" lower it). It affects ghosting opacity and ordering in the flags panel. It never affects status; a confidently stated impossible claim is still implausible.

## Input modes

Five capabilities, one pipeline. Each mode is an adapter that produces `Segment`s; nothing downstream knows which mode produced them. That is what makes additions 1, 2 and 3 affordable.

| Mode | Who talks | Adapter | Diarization | Extractor trigger | Tier |
| --- | --- | --- | --- | --- | --- |
| Typed statement | witness or investigator types | textarea → one segment per paragraph | none needed | on submit | MVP |
| Live AI interview | witness and agent | Cartesia Managed Agent; its webhook tool `record_statement` writes a segment; agent turns are logged as `speaker: agent` | none needed (one human) | on each witness turn | MVP (flagged) |
| Copilot | investigator and witness, human to human | two devices, one Ink-2 stream each, channel = speaker; or one mic through AssemblyAI with speaker labels | by channel (two devices) or by AssemblyAI labels; the investigator confirms which is the witness once at session start | on each witness turn | Stretch 1 |
| Upload audio | recorded interview file | browser uploads the file straight to AssemblyAI, polls for the diarized transcript, inserts segments | required | once, after transcription | Stretch 2 |
| Upload text | pasted or uploaded transcript | parser: lines like `Q:`/`A:` or `Name:` become speaker labels | by parsing | once | MVP (same as typed) |

**Live AI interview (MVP).** The agent runs as a Cartesia Managed Agent with a Claude model from Cartesia's catalog as the brain and three webhook tools: `record_statement(text)` which writes a segment and returns any new flags, `get_scene_context()` which returns the landmark labels and the last five events, and `end_interview()`. Its system prompt holds the cognitive-interview rules: open with a free narrative, do not interrupt, then anchor each event to landmarks ("closer to the window or the fridge?"), then times ("before or after he came through the door?"), then sightlines. When `record_statement` returns a hard flag, the agent asks the flag's `suggestedQuestion` on its next turn. A text fallback uses the same prompt through the plain Claude API with a chat box, so the interview works on a dead mic.

**Copilot mode (Stretch 1).** The investigator wears the room; the AI wears headphones. Each person's device streams its own mic to Ink-2, so the channel is the speaker (one mic through AssemblyAI's speaker labels is the fallback); segments tagged `interviewer` are stored but not extracted, segments tagged `witness` go through the extractor as in live mode. The investigator sees a side panel with three lists that update live: new events (with status), flags with their suggested questions, and "gaps" (events with no time or no anchor). The investigator decides what to ask; the panel never speaks. If both fail in the room, a push-to-talk toggle ("witness speaking") on a single mic still works. Build order: push-to-talk first, two-device second, AssemblyAI last.

**Multi-witness (Stretch 3).** Each witness is a layer: own color, own events, own confidence. The gate's contradiction check runs across layers and produces soft flags that name both witnesses. The fused view shows events both witnesses agree on at full opacity and single-source events at 70%. There is no automatic merging of conflicting accounts; the investigator picks a canonical event or leaves both, and the export preserves both. Anchor events ("the door opened," "the shove") are the natural alignment points between witnesses' timelines because the resolver can align `t` across layers on them.

**Revision (Stretch 4).** A witness re-interviews on the same `witnessId`. The extractor receives the witness's existing events as context and emits `update_event` with `supersedes` set when the new statement replaces an old one, or `add_event` otherwise. Superseded events get `status: superseded`, stay in history, and show in a diff drawer ("previously: by the couch; now: in the hallway"). Revised events re-gate like any other patch. The revision count per event is visible, because a story that changes three times is itself information an investigator wants.

**Uploads (Stretch 2).** Audio goes from the browser straight to AssemblyAI's upload endpoint (SpacetimeDB has no file storage and does not need any here), the browser polls for the diarized transcript, and the resulting segments are inserted with `source: upload_audio`. Pasted text is split on speaker labels; if none are found, every paragraph is `speaker: witness`.

**Why extraction runs per witness turn, not per sentence.** Witnesses narrate in fragments; waiting for a turn boundary (Ink's turn-end event, or the agent's turn in live mode) gives the extractor enough context to produce an anchored event rather than a half-event that gets patched three times.

## 3D layer (Seat B, Sahil)

The scene is a pure function of the resolved graph and a time `t`. No position is computed in `scene/`; the resolver hands you world positions, path points and durations, and you animate them. That rule is what makes drag-to-edit, revision and multi-witness free: they all just change the graph.

**Stack, versions verified Oct 22**

| Need | Package | Notes |
| --- | --- | --- |
| Renderer | `three` 0.186.1, `@react-three/fiber` 9.8.2, `@react-three/drei` 10.7.9 | R3F 9 requires React 19.0 to 19.3; pin React 19.3.1, do not take 19.4 |
| Characters and clips | Mixamo Y Bot + clips, converted to GLB in Blender headless | All clips share the `mixamorig` skeleton, so clips bind by bone name with no retargeting |
| Navmesh | `recast-navigation` 0.43.1 + `@recast-navigation/three` 0.43.1 | Builds at runtime from any `THREE.Mesh`; three-pathfinding (last release May 2024) needs a pre-built navmesh, skip it |
| Prop physics | `@react-three/rapier` 2.2.0 (pins rapier3d-compat 0.19.2) | Do not install rapier yourself; reach the raw API through `useRapier().rapier` |
| Drag handles and labels | drei `PivotControls`, `TransformControls`, `Html`, `OrbitControls makeDefault` | Only the default controls pause during a drag |
| Timeline state | `zustand` 5.0.16; `@xzdarcy/react-timeline-editor` 1.0.0 (MIT) or hand-rolled | Theatre.js is stale (0.7.2, May 2024) |
| Video export | `mediabunny` 1.62.1; MediaRecorder as fallback | Frame-exact offline render; needs WebCodecs, so demo in Chrome |
| Scan prep | `@gltf-transform/cli` 4.5.1 (`weld`, `simplify`, `optimize`) | Cut the scan under \~50K triangles before navmesh and trimesh |
| Splats (cut, keep the note) | `@sparkjsdev/spark` 2.4.0 | Released Oct 20; works in R3F via `extend()`; only if everything else is done |

**Scene capture, three plans.** The scan-as-ground-truth story needs real geometry, but it does not need LiDAR, and the demo does not need a real convenience store if the stand-in is measured.

- **Plan A, any phone, photogrammetry:** Polycam's free plan allows 10 photogrammetry captures of 150 photos each and exports GLTF, on iOS and Android; KIRI Engine is the alternative. Shoot a real corner store if an owner says yes (10 minutes, store empty, 100 to 150 overlapping photos walking two loops, no flash) or any small room with shelves as the stand-in. Expect holes on glass and shiny floors; reduce with `gltf-transform weld` then `simplify --ratio 0.1` to under 50K triangles; check scale against two tape measurements (aisle width, counter height).
- **Plan B, the default until A succeeds:** a measured box-model store built in 90 minutes Friday night: walls, two gondola shelves 1.5 m tall, an end cap, a counter 1.0 m tall, a cooler wall, front and back doors, a window, dressed with Kenney and Quaternius shop assets. Dimensions from a tape measure in a real store or from the props table. It is real geometry (every distance is measured), the gate behaves identically, and it renders cleanly on a projector. On stage: "production scenes come from the CSI LiDAR rig; we modeled from measurements because you cannot scan a working store on a Friday night."
- **Plan C, if anyone turns up with an iPhone Pro:** Scaniverse (free) in LiDAR mode exports a GLB mesh and an SPZ splat from the same capture; walk every corner twice, phone level, then the same reduce-and-check steps. This is the best outcome and takes 20 minutes, so ask the team mixer crowd at 6 PM.

Whichever plan wins, the output is one `store.glb` under 50K triangles plus `store.scene.json` with the 11 landmarks, committed by H+2. The full-resolution mesh (if any) is visual only; the reduced mesh is what the navmesh, the trimesh collider and the sightline raycasts use.

**Landmark labeling tool.** A debug mode in the viewer: click the mesh, type a label, pick a kind, drag a box. Writes `SceneManifest` JSON. Thirty minutes to build in hour 2 to 3, then D labels the room while you move on. The `occludes` flag matters: the end-cap shelf, the gondola shelves, the cooler and the counter are true; a low display stand and the ATM are false.

**Mixamo pipeline (do the downloads tonight; Mixamo was flaky through 2025 and rate-limits).** Download Y Bot once as FBX Binary *With Skin*, T-pose. Then each clip *Without Skin*, keyframe reduction off, **In Place** ticked for locomotion because the resolver's path drives the root. Clip list: idle, walking, running, crouching idle, falling back, push (the shove), punch, picking up, standing up, looking around, opening door. Convert with a Blender headless script (`bpy.ops.import_scene.fbx`, ignore leaf bones on, apply transform off, push each action to the NLA, export GLB with animation mode Actions). Do not merge clips; load `ybot.glb` plus one `clip.glb` each and call `mixer.clipAction(clip.animations[0])`; tracks bind by node name. Three gotchas: Mixamo is in centimeters, so a FBXLoader clip on a GLB character moves hips 100× too far (convert everything to GLB in Blender and this goes away); a bone prefix mismatch like `mixamorig1:` leaves the character silently in T-pose; GLTFLoader strips the colon, so the hip bone is `mixamorigHips`. License: royalty-free use, no redistribution of raw files, so assets stay out of the public repo (git-ignored `assets/`, zipped to teammates).

**Backup rig.** Quaternius Universal Animation Library (CC0, 120+ clips including push, death, crawl, sitting, ships as GLB) on its own rig. If Mixamo is down Friday, use it end to end rather than retargeting.

**Viggle JST-2 (Stretch 5 only).** `POST https://apis.viggle.ai/v1/motions` with text (1 to 400 chars), duration 3 to 60 s, returns a `mot_` id; poll `GET /v1/motions/{id}` every 3 to 5 s; then `GET /v1/motions/{id}/export?download_type=glb` returns `mixamo_url` (described as a generic 50-joint skeleton to retarget), `metahuman_url` and `metahuman_body_url`. Bone names, rest pose and root motion are undocumented, and three's `SkeletonUtils.retargetClip` has known inverted-feet failures even Mixamo-to-Mixamo, so budget one test at hour 1 (new accounts get 100 credits; text-to-motion costs 10) and drop it if the clip does not bind cleanly. Scene generation exists (`/v1/scenes/*`, outputs SPZ) but from text or one panorama only, not to real-world scale, so it cannot stand in for the room. Keep the key on the server; signed URLs expire after 1 hour.

**Playback model.** One `t` in zustand, everything derives from it in `useFrame`. For each event the resolver gives `[tStart, tEnd]`, a `CatmullRomCurve3` from the path points, and an action name. Per frame: position = curve at arc-length fraction `(t - tStart) / (tEnd - tStart)`, facing = curve tangent, clip time = `t - tStart` modulo clip length, blend weights computed from overlap windows by hand, then `mixer.update(0)`. Never use `crossFadeTo` or `fadeIn`; they keep real-time state and break scrubbing backward. Idle fills gaps between events.

**Props and physics.** `<Physics paused timeStep={1/60}>`; the reduced scan is `<RigidBody type="fixed" colliders="trimesh">`; props are dynamic with `cuboid`, `ball` or `hull` colliders and `ccd` on anything thrown. Characters are kinematic (no physics); optional `kinematicPosition` capsules so a shove can knock a bottle over. Physics cannot run backward, so after any graph change, step the world from `t = 0` at 1/60 and record every prop transform per frame; scrubbing plays the recording. Props spawn when the extractor emits `add_prop` (the library matches aliases like "blade" to `knife_chef`), at the anchor, held by the actor if `heldBy` is set (attach to the hand bone), dropped when a `drop` event fires. `FIX_INTERNAL_EDGES` on the trimesh reduces ghost collisions on scan geometry.

**Overlays.** drei `<Html center distanceFactor>` per prop: label, `l × w × h` from `props.json`, editable notes field that writes `update_prop`. Pass `occlude` an array of refs, never `true` (it raycasts the whole scan every frame). Event badges use the same component on the actor's head bone. Sightline rays draw as `<Line>` from eye to target, green or red by the flag.

**Editing.** Selecting an actor on the timeline shows a `PivotControls` gizmo at its `from` or `to` anchor, `activeAxes={[true,false,true]}` so it stays on the floor; on drag end, snap with `findClosestPoint` on the navmesh, find the nearest landmark within 0.75 m (anchor becomes `near` that landmark) or fall back to `xyz`, and emit `update_event`. While dragging, run `gate.preview` locally for instant red/green; the server result replaces it on commit.

**Cameras.** Orbit by default; witness POV = witness position at `t` plus eye height 1.6 m, looking at `facing`; a "what the witness could see" toggle dims everything outside the frustum. The POV shot at the moment of the contradiction is the single image for the Devpost page.

**Export.** Mediabunny: `new Output({format: new Mp4OutputFormat(), target: new BufferTarget()})`, `new CanvasSource(canvas, {codec: 'avc', bitrate: QUALITY_HIGH})`, loop `t` from 0 to end at 30 fps, render, `await source.add(i/30, 1/30)`, `finalize()`. Frame-exact regardless of live frame rate. Fallback: `canvas.captureStream(30)` into MediaRecorder as WebM (Chrome's MP4 output has a zero duration header and breaks seeking). Also export the graph JSON and the override log alongside.

**Build order for your seat** (each step demoable on the fixtures): viewer + scan load + orbit (H0-2) → Y Bot with idle and walk, fixture path, root motion (H2-5) → all clips, action map, blending (H5-8, checkpoint) → recast navmesh from the reduced scan, labeling tool (H8-10) → rest → timeline scrubber bound to `t` (H12.5-15) → PivotControls editing with patch emit (H15-18) → props + Rapier + baked recording (H18-21) → overlays, ghosting by status, POV camera (H21-24, freeze) → video with D (H24-26) → rest → polish, capture export, sightline lines (H28-32).

## Voice, transcription and diarization

Two findings from the research pass override what we assumed earlier this week, and both are good news if you plan around them now.

1. **Cartesia's Line SDK is being retired.** The migration page says Cartesia stops hosting Line SDK agents on December 1, 2026; Managed Agents is the replacement. Build the live interviewer on a Managed Agent over the browser WebSocket, not on Line. Line still works this weekend, but AI coding assistants will keep generating Line code and old event names, so paste the 2026-08-14 Managed Agents docs into C's context and pin `cartesia_version`.
2. **Ink-2 does not diarize.** No speaker field, no word timestamps; one speaker per stream. Copilot mode therefore uses either two devices (investigator's laptop and witness's phone, each on its own Ink-2 stream, so channel equals speaker) or a hosted STT that labels speakers. Build the two-device path first; it keeps Cartesia in the loop for the prize and has no diarization errors at all.

| Need | Choice | Why | Fallback |
| --- | --- | --- | --- |
| Live AI interview (MVP) | Cartesia Managed Agent: Ink-2 in, Sonic 3.6 out, a Claude model from Cartesia's catalog as the brain, over `wss://api.cartesia.ai/v1/agents/websocket/{agent_id}` | One socket handles turn-taking, barge-in (`audio_output_clear`) and voice; supports webhook and client tools; strongest fit for the Cartesia prize | Text-chat interview on the same prompt through our own Claude call; or hand-rolled Ink-2 → Claude → Sonic if the catalog lacks a usable Claude |
| Agent tools | Webhook tools hitting the Spacetime module's HTTP handler (or a 20-line Node relay): `record_statement`, `get_scene_context`, `end_interview` | Runs server-side, returns flags to the agent in the same turn; result up to 16 KiB | Client tools, but their parameters must be flat (strings, numbers, booleans, arrays of those), so emit a flat note and let Claude in the extractSegment procedure build the real patch |
| Copilot transcript (Stretch 1) | Two devices, each on Ink-2 turns endpoint `wss://api.cartesia.ai/stt/turns/websocket?model=ink-2` | Channel equals speaker; no diarization model in the loop | AssemblyAI Universal-Streaming with `speaker_labels: true, max_speakers: 2` (333 free streaming hours); Deepgram Nova-3 `diarize=true` ($200 credit) |
| Uploaded audio (Stretch 2) | AssemblyAI batch with speaker diarization | Ink-2 has no batch endpoint (batch `/stt` is `ink-whisper` only) | Deepgram pre-recorded `diarize=true` |
| Browser auth | Server mints a short-lived token: `POST https://api.cartesia.ai/access-token` with grants `{stt, tts, agent}` and `expires_in: 60` | Never ship the API key to the browser | n/a |
| Diarization models | Not NVIDIA for this event | Sortformer is self-host only (no hosted provider); Nemotron-3-Diarization-preview's license forbids disclosing results; hosted diarization on build.nvidia.com could not be verified | n/a |

**Managed Agent protocol, the parts C will touch.** Client sends `session_create` within 10 s (input `pcm_16000`), then `audio_input` frames (base64) and `client_tool_result`. Server sends `session_ready`, `audio_output`, `audio_output_clear` on barge-in, `client_tool_call`, `turn_started`, `turn_output_text_delta`, `turn_ended` (its `text` covers both roles; log it as the transcript), and `error`. Ping every 60 to 90 s; idle timeout is 180 s. WebSocket only, no WebRTC. Tool settings: `execution_mode` immediate or async, `pre_tool_speech` auto/force/off, timeout 1 to 120 s (default 20), up to 64 tools.

**Ink-2 turns endpoint.** Events `turn.start`, `turn.update`, `turn.eager_end`, `turn.resume`, `turn.end` with a cumulative `transcript`. Turn-end timeout defaults to 5600 ms; lower it to about 2500 ms for an interview or the agent feels slow. `keyterm` takes up to 100 terms: load the landmark labels and the actors' names. Audio must stream in real time and silence is billed. Languages: en, fr, hi, ja, es.

**Sonic.** Latest is `sonic-3.6` (snapshot `sonic-3.6-2026-08-27`), backward compatible with 3.5's sub-90 ms time-to-first-audio. Pick one calm, low-register voice and never change it; the interviewer's voice is part of the trust story.

**Credits.** Free tier is 20K credits/month (about 1 h 51 m of Ink-2 or 27 min of TTS) plus about $1 of agent credit, which is roughly 17 minutes of Managed Agent time. That is not enough for a weekend of testing. Buy Pro ($5/month: 100K credits plus $5 agent credit, about 83 minutes) Friday morning, and ask the Cartesia booth for event credits before doing anything else. Concurrency on free: agents 8, STT 8, TTS 2.

**Mapping A/B to roles in the AssemblyAI fallback.** Speaker labels come back as A and B; the investigator speaks first by convention, and Claude confirms roles from question-versus-answer shape. Beta caveats: turns under about 1 s return PENDING, the first one or two turns may be mislabeled, overlapping speech goes to one speaker. Headsets, not laptop mics; the Palace of Fine Arts will be loud.

## Backend, state and AI stack

SpacetimeDB holds the graph and runs the gate inside the database; Claude is called from a module procedure with our own key; the browser holds every audio socket itself. Decided Friday 2:20 PM, Convex dropped. Three reasons: the anchor sponsor's track criteria ("live shared state, AI agent coordination, shared simulations, meaningfully used") describe this product; the plausibility verdict can commit in the same transaction as the patch, which is both a correctness property and the sentence the judge remembers; and official Claude Code skills exist in the `clockworklabs/spacetimedb` repo, so A's agent is not guessing the API.

**The one-sentence story for judges.** Every agent (the interviewer, the extractor, the gate, the investigator) writes to one persistent world state, and no client ever renders an unchecked event, because the verdict and the patch commit together.

**Repo layout** (pnpm monorepo, created at the bell)

```
rashomon/
  apps/web/              Vite + React + R3F; src/scene (B), src/ui (D), src/adapters (C)
  apps/agent/            Cartesia Managed Agent config + webhook tool definitions (C)
  spacetime/             SpacetimeDB TypeScript module: tables, reducers, procedures, views, http (A)
  packages/schema/       Zod types + fixtures (A)
  packages/engine/       resolver + gate, isomorphic TS, bundled into the module and the browser (A)
  packages/extractor/    Claude prompts, tool schemas, patch validation (C)
  packages/props/        props.json + GLB assets (D)
  demo/                  script, deck, video (D)
```

**Module shape** (`spacetime/src/index.ts`, imports from `spacetimedb/server`; the skills show the exact syntax)

| Kind | Name | Does |
| --- | --- | --- |
| Tables | `scenes`, `sessions`, `segments`, `events`, `props`, `actors`, `flags`, `overrides` | Events are rows referencing each other by id; the landmark map is a JSON column on `scenes`; all data is in memory, which is fine, the graph is kilobytes |
| Reducer | `insertSegment(segment)` | Writes the segment; transactional and isolated |
| Reducer | `applyPatches(sceneId, patches, baseVersion)` | Validates against the Zod schema, writes events and props as `proposed`, bumps `version`; refuses on a stale `baseVersion` |
| Reducer | `override(eventId, reason, by)` | Sets `overridden`, records the `Override` |
| Reducer | `setStatuses(results)` | Writes flags and statuses from a gate run (used by the browser preview path and as a fallback) |
| Procedure | `extractSegment(segmentId)` | Transaction 1: read the segment, landmarks and a graph summary. Outside a transaction: call Claude over HTTPS, validate the tool calls into `Patch[]`. Transaction 2: apply the patches, run `packages/engine` over the scene geometry, write flags and statuses, commit. The verdict and the patch land together |
| Views | `graphForScene(sceneId)`, `flagsForSession(sessionId, since)`, `historyForEvent(eventId)` | Subscribed by the workspace, the copilot panel and the history drawer; update on every commit |
| HTTP handler | `POST /webhooks/cartesia/record_statement` | Cartesia's webhook tool lands here: insert the segment, run `extractSegment`, return the flags in the response so the agent asks the follow-up in the same turn. Spacetime 2.8 delegates HTTP handlers to modules; if this fights A for more than an hour, a 20-line Node relay that calls the procedure through the client SDK does the same job |

**The write path**

1. An adapter (text box, Ink-2 turn end, upload parser) calls the `insertSegment` reducer from the browser, then calls the `extractSegment` procedure.
2. The procedure reads context, calls `claude-sonnet-5-5` with strict tools, and validates each `tool_use` block into a `Patch`.
3. In its second transaction it applies the patches, resolves anchors to positions, runs the navmesh query (navcat, pure JS, bundled into the module) and the raycasts (three's math classes over `scene.geom.json`), and writes flags and statuses. One commit.
4. Every subscribed client's `graphForScene` view updates; B's scene re-renders, D's flags panel re-sorts, C's agent gets the flags back through the webhook response.
5. An investigator edit calls `applyPatches` with an `update_event` and then `extractSegment`'s gate half (exposed as `regate(sceneId)`); an override calls `override`.

**Why the gate runs in the module.** Three reasons: the agent's tool call needs flags synchronously; every client must see the same status; and "same graph, same render" is only true if one place computes it. The browser runs the same `packages/engine` for instant preview while dragging; the module's result replaces it on commit.

**Claude usage**

| Job | Model | Mode | Notes |
| --- | --- | --- | --- |
| Extraction (segment → patches) | `claude-sonnet-5-5` ($2 / $10 per M tokens) | Strict tool use: `add_event`, `update_event`, `retract_event`, `add_prop`, `update_prop`, `add_actor`, each with `strict: true` and `additionalProperties: false` | One `tool_use` block per patch. Schemas cannot bound numbers, so `confidence` is an enum `low/medium/high` in the tool and mapped to 0.3/0.6/0.9 in code; `sources` is a required non-empty array |
| Follow-up question suggestions (copilot panel) | `claude-haiku-5-5` ($0.10 / $0.50 per M tokens) | Structured output, `output_config.format` JSON schema, at most 3 ranked suggestions with type and one-line reason | Runs on every flag and every witness turn; cheap enough to call constantly |
| Whole-transcript pass (uploads) | `claude-sonnet-5-5` | Structured output over the full transcript, then the same patch validation | One-shot, not per turn |
| Interviewer brain (live mode) | Claude from Cartesia's model catalog (`GET /v1/agents/models` lists the IDs) | Managed Agent system prompt + webhook tools | Bring-your-own key only works with the retiring Line SDK; accept catalog pass-through pricing for the weekend |

**Prompt caching.** Put the system prompt, the tool definitions and the append-only transcript first with `cache_control: {type: "ephemeral"}`, and the changing graph summary last. Minimum cacheable prompt is 512 tokens; cache reads cost 0.05× on Sonnet. Changing a tool definition invalidates the whole cache, one more reason the schema freezes at H+2. Budget: about 3K cached input tokens and 300 output tokens per extraction, so a thousand extractions cost under $5.

**Spacetime limits that bite.** The `spacetimedb` npm package version must match the host version you publish to (pin both). Auto-migration cannot remove columns; during the event use `--delete-data` on breaking changes, there is no production data. Database names are global on Maincloud, so publish as `rashomon-<four random chars>`. Maincloud's free tier is 2,500 TeV of energy per month and we do not know our burn rate: A checks the dashboard Saturday noon; the fallback is `spacetime start` on A's laptop, which also removes the venue Wi-Fi from the demo path, with a cloudflared tunnel for the Cartesia webhook. No file storage, so audio uploads go browser-to-AssemblyAI directly. WASM inside modules is unverified, so the module's navmesh query is navcat (pure JS); recast-navigation stays in the browser for the editor's live preview. The FAQ notes procedures are not yet callable as HTTP endpoints, which is why the webhook is an HTTP handler that calls the procedure, not the procedure itself.

**Moss (Stretch 6).** `npm install @moss-js/moss` (renamed from `@moss-dev/moss` at 1.8.0; the homepage still shows the old name). `createIndex` over utterances and landmark labels with `moss-minilm`, `query(name, text, {topK, alpha})` from the question generator. At hackathon scale the whole transcript fits in Claude's context, so Moss is a prize play; two hours, no earlier than H+26.

## Team split

Four seats, one contract, three scheduled syncs. Each seat owns a package and a fixture-driven test; nobody blocks on anyone else's running code until the H+14 integration.

| Seat | Who | Owns (package) | Builds, in order | Done when |
| --- | --- | --- | --- | --- |
| A · Engine + backend | strongest TypeScript person | `packages/schema`, `packages/engine`, `convex/` | Zod schemas and fixtures (H0-2) → resolver (anchors to positions, navmesh paths, inferred times) → gate (3 hard + 3 soft checks, flags with suggested questions) → the SpacetimeDB module: tables, `insertSegment` / `applyPatches` / `override` reducers, `extractSegment` procedure with the gate inside its transaction, `graphForScene` and `flagsForSession` views, the Cartesia webhook HTTP handler → `scene.geom.json` exporter → contradiction check across witnesses | `engine.gate(fixtureGraph, fixtureScene)` returns exactly one hard flag on `e5`; a patch applied through the reducer path is re-gated within 1 s on every subscribed client |
| B · 3D workspace | Sahil | `apps/web/src/scene` | R3F viewer + GLB load + orbit/POV cameras → Mixamo rigs and clip set → play fixture graph (paths, clips, root motion) → timeline scrubber bound to graph time → drag anchors with PivotControls emitting `update_event` → props with Rapier, spawn on mention → dimension overlays and notes → ghosting by status → WebM capture | Fixture graph plays end to end in the scanned room; dragging the suspect's start point produces a patch and the scene re-renders from the new graph, not from local state |
| C · Interview + extraction | second-strongest backend person | `packages/extractor`, `apps/agent` | Extractor prompt + tool schema that emits `Patch[]` from a segment (H0-6) → text-chat interview on the same prompt → Cartesia `Managed Agent with record_statement/get_scene_context webhook` tools → flag-to-question loop → copilot adapter (push-to-talk first, then two-device Ink-2, then AssemblyAI labels) → upload adapters → revision handling | Typing the fixture transcript produces the fixture graph within tolerance; the live agent asks the sightline follow-up unprompted when `e5` is flagged |
| D · UX + product | the 4th teammate | `apps/web/src/ui`, `design/`, `demo/` | Figma mock of the workspace (H0-3): status visual language, flags panel, override dialog, timeline, witness switcher → scenario script and the paper fixture (with A) → props JSON (dimensions, aliases, notes) → React chrome around B's `<Scene/>` and `<Timeline/>`: panels, dialogs, history drawer, session/witness switcher → copilot side panel → demo video, Devpost page, deck, booth visits | Workspace is usable without B or C present (fixture mode); a judge can read status, open a flag, and override in under 20 s without being told how |

**Interfaces, and who talks to whom about what**

| Between | What is agreed | When |
| --- | --- | --- |
| A ↔ all | The six contracts, the two fixtures, package layout | H0-2, in person, then frozen; changes are a one-line channel post plus a version bump by A only |
| A ↔ B | `scene.geom.json` + navmesh format; the engine's browser entry `gate.preview(graph, scene)` for instant feedback while dragging | H+2 |
| A ↔ C | Module function names and argument shapes: `insertSegment` reducer, `extractSegment` procedure, `flagsForSession` view, the webhook handler's request and response bodies; the gate runs inside `extractSegment`'s transaction | H+2 |
| B ↔ D | B exports `<Scene/>`, `<Timeline/>`, `useGraph()`, `useSelection()`, `useCamera()`; D owns everything around them and never imports from `scene/` internals | H+2, then H+8 |
| C ↔ D | D's copilot panel reads `segments` and `flags` subscriptions only; it never calls C's code | H+2 |

Outside those, communication is asynchronous in one channel. The only synchronous events are the checkpoints at H+2, H+8, H+14, H+20 and H+24, each 20 minutes at one laptop, plus the demo recording and the rehearsal.

**Friday setup block, by seat** (from the Hive schedule: buses 1 PM, check-in 1:30, opening ceremony 4 PM, dinner and team mixer 6 PM, Figma and Hyphenate workshops and the Microsoft social 7 PM, Elastic and SpaceXAI 8 PM, sleep area 9:30 PM; submissions open 6 PM):

- 6:00 PM, all four at dinner: contracts session on paper, fixture scenario agreed, repo created, package skeletons committed.
- 7:00 PM: A, with the three skills installed, builds the module skeleton (tables, applyPatches reducer, graphForScene view) against the fixture and publishes it to Maincloud; C starts the extractor against the fixture; D goes to the Figma workshop and builds the mock in Figma Make; B goes to the Microsoft social, asks about vendor eligibility and the Built-for-the-Real-World criteria, then visits the Cartesia, Anthropic and SpacetimeDB booths for credits and track details.
- 8:00 PM: B back at the table on the viewer; D back by 8:30 with the mock; A demos a reducer call showing up in a subscribed browser tab, which is the backend's hello-world.
- 9:00 PM, H0: everyone building; the H+2 checkpoint at 11 PM verifies that every seat's test runs against the fixtures.

**Your seat specifically.** You own B and chair the H+2 contract session, because the resolver's output format is what you animate. Your "bit of everything" is the H+2 and H+14 checkpoints and the pitch's technical answers; after H+2 stay in `scene/` and let A and C come to you.

**Seat D's design brief, so they can start at minute zero.** The workspace is a three-pane layout: scene (center, 60%), timeline (bottom, full width, events as colored blocks by actor, status as border style), and a right panel with tabs Flags / Events / History / Witnesses. Status language: plausible = solid, proposed = 40% opacity, implausible = dashed red outline with badge, overridden = solid with amber badge, superseded = hidden with a count in History. The override dialog requires a reason (min 10 characters) and shows the flag's evidence numbers. Copilot panel is the same right panel in a second window. Dark theme, since it will be on a projector.

## Timeline

&#91;embedded content: 36-hour plan · 4 seats, 5 checkpoints, freeze at hour 24\]

H0 is Friday 9 PM PT. Submissions actually open at 6 PM, so Friday 6 to 9 PM is a setup block that absorbs check-in, the opening ceremony, dinner, the sponsor booths (Cartesia, Convex, Microsoft, Figma, Fetch.ai, Anthropic, SpacetimeDB), creating the repo, and the contracts session; the H+2 checkpoint then becomes a verification rather than the first time anyone sees the schema. Rest is staggered so A and C sleep first and B and D sleep second, which keeps the engine owner awake at every checkpoint and the 3D owner awake through the demo recording. Sunday: table claimed by 8 AM, submission by 9 AM (editable until 10 AM except the table number), judging after, winners at 4 PM.

**Checkpoints (20 minutes each, one laptop, everyone)**

| Hour | Clock | Gate to pass | If it fails |
| --- | --- | --- | --- |
| H+2 | Fri 11 PM | Contracts and both fixtures committed; every seat can run its package's test against them | Nobody leaves the table until it passes; this is the one non-negotiable |
| H+8 | Sat 5 AM | B plays the fixture graph in the real room; A's gate returns the one `e5` sightline flag; C's extractor turns the fixture transcript into a valid patch list; D's chrome renders the fixture in read-only mode | Each seat fixes its own; A and C start rest 30 min late if needed |
| H+14 | Sat 11 AM | Text end to end: type a statement, patch lands in Convex, gate runs, scene updates, flag shows in panel. This is the milestone that matters; everything after is polish | Cut copilot and uploads to "only if MVP is stable by H+20" |
| H+20 | Sat 5 PM | Voice loop closed: speak the impossible sightline, the agent asks the follow-up, the answer moves the event. Drag-edit re-gates. Props spawn | Voice stays behind the flag; demo uses text with a prerecorded voice clip overlay |
| H+24 | Sat 9 PM | Feature freeze on main. Only bug fixes merge after this. D and B record the demo video immediately while it works | If not stable, freeze anyway and record the best path that runs; a working subset beats a broken superset |
| H+32 | Sun 5 AM | Four full pitch rehearsals with the live demo, judges' questions practiced | Reassign pitch roles if someone is too tired to present |
| H+34 | Sun 7 AM | Devpost submitted by 8:50 AM (the Hive deadline): team name, table number, 2 to 3 sentence elevator pitch, repo, image, local video. Then nobody touches main | Submission form is pre-filled at H+26 so this is a 10-minute step |

**Rest blocks.** A and C: H+8.5 to 10.5 and H+24 to 26. B and D: H+10.5 to 12.5, then B at H+26 to 28 and D at H+28 to 30. That is 4 h each in two blocks, which is what the brain needs to consolidate rather than one long crash. The venue has a sleeping room; bring an eye mask.

**Demo video (H+24 to 26).** Recorded at the table with the store scene, screen capture plus a phone on the speaker, two takes, the better one stored locally on two laptops (Devpost requires a local copy). Script is written by D during H+0 to 10 and rehearsed once before recording. Length 2 minutes: 15 s problem, 60 s live loop including the contradiction catch, 30 s edit and override, 15 s who it is for.

**What moves if the start time is different.** If the opening ceremony runs long and real building cannot start by 9 PM, slide H0 to 10 PM and take the hour out of the Sunday 5 to 7 AM rehearsal block, never out of the freeze.

## AI-assisted development plan

The build is designed so that each seat can hand most of its code to an agent and spend its own time on judgment: what the fixture should contain, whether the animation looks right, whether the agent's question sounds like a detective or a chatbot. Four rules make that work in 36 hours.

1. **One agent per package, one human per agent.** Each seat runs its own Claude Code session rooted in its package. Agents never edit `packages/schema` except Seat A's, and never edit another seat's package. The monorepo makes that a path rule in each package's `CLAUDE.md`.
2. **Fixtures are the spec.** Every task prompt points at `fixtures/apartment.scene.json` and `fixtures/shove.graph.json` and says what the output on them must be. An agent with a concrete expected output converges in one or two turns; an agent with a prose description wanders.
3. **Tests before features for A and C, screenshots before features for B and D.** The engine and extractor get Vitest tests the agent must make pass. The 3D and UI seats get a Playwright screenshot script (`pnpm shot`) so the agent can look at what it built; a 3D bug is visible long before it is describable.
4. **Small merges to main every 60 to 90 minutes.** Main is always demoable. A branch that lives more than 3 hours is a risk; the agent opens the PR, the human skims the diff, CI runs typecheck and the fixture tests.

**Pre-written before Friday (allowed: these are prompts and plans, not implementation)**

| File | Owner | Contents |
| --- | --- | --- |
| `CLAUDE.md` (root) | A | Stack, package map, the four rules above, "never change schema without A", commit style, how to run fixtures and tests |
| `packages/engine/CLAUDE.md` | A | Resolver and gate responsibilities, the checks table from this doc, speed constants, "pure TS, no DOM, no three.js renderer, only three math classes" |
| `apps/web/src/scene/CLAUDE.md` | B | R3F conventions, asset paths, the clip-to-action map, "all positions come from the resolver output, never computed here", screenshot command |
| `packages/extractor/CLAUDE.md` | C | The patch tool schema, the extraction prompt skeleton, the cognitive-interview rules, example segment-to-patch pairs |
| `apps/web/src/ui/CLAUDE.md` | D | Design tokens, the status visual language, component boundaries with `scene/`, Figma frame links |
| `demo/script.md` | D | The scenario in the witness's words, the one planted contradiction, the pitch timing |
| `prep/prompts/*.md` | each | The first three task prompts for each seat, written out in full so hour 0 is paste-and-go |
| spacetime/CLAUDE.md | A | Module conventions: the table list, the rule that reducers write and only the extractSegment procedure talks to Claude, the function names from Data contracts, the three installed skills by name, publish and generate commands, the pinned spacetimedb version |

**Task prompts that work for this kind of build.** The pattern is: context file, fixture, expected result, constraints, done-check. Example for Seat A's first task:

```
Read packages/engine/CLAUDE.md and packages/schema/src/index.ts.
Implement resolver.ts: resolveGraph(graph, scene, geometry) returns ResolvedEvent[] where each event has worldFrom, worldTo, pathPoints[], durationS, and tInferred.
Use fixtures/robbery.graph.json and fixtures/store.scene.json.
Expected: e1 resolves front_door->near(counter) to a path of 3+ points that routes around aisle_chips with length between 6.5 and 8.5 m; e5 (witness "look" at suspect) resolves eye position to aisle_chips + [0,1.6,0] and target to the suspect's chest at counter + [0,1.2,0].
Constraints: no DOM, no WebGL, only three/src/math classes and the navmesh query. Deterministic: same input, same output.
Done when: pnpm -F engine test passes the resolver suite you add.
```

**Where agents are weak here, so a human does it:** choosing which Mixamo clip reads as a "shove" (B watches five and picks); tuning raycast origins so the end-cap shelf actually blocks the counter from the chips aisle and not from the cooler (A sits with the scene file); wording the follow-up questions (C reads them aloud); deciding what the flags panel shows first (D watches a teammate try to use it cold).

**Your tooling (Seat B).** Claude Code is the primary agent. Cursor and Antigravity run on separate git worktrees so three agents can work on `scene/` at once without stepping on each other; the split is by file ownership, not by feature: worktree `scene-core` (viewer, GLB load, playback, cameras) for Claude Code, `scene-props` (props, Rapier, overlays, `props.json` loader) for Antigravity, `scene-ui` (timeline, PivotControls editing, patch emit) for Cursor. Each worktree gets the same `scene/CLAUDE.md` and the same fixture; you merge into `main` every 90 minutes and resolve conflicts yourself, because an agent resolving a Three.js merge conflict is how a demo dies at 3 AM. Claude Code cloud sessions take the background jobs that need no eyes: the Blender headless Mixamo conversion script, the gltf-transform reduce-and-check script, the Vitest suite for the clip-to-action map, and the Mediabunny export harness. Do not give the cloud sessions anything visual; you cannot see what they built until it lands.

**Everyone else:** one Claude Code session per seat, Cursor or Antigravity only if that person already uses it daily; a new tool learned at hour 10 costs more than it saves.

## Risks and fallbacks

Ordered by how likely they are to cost us the demo. Each has an owner and a trigger time: if the trigger passes without the fix, switch to the fallback without debate.

| # | Risk | Owner | Trigger | Fallback |
| --- | --- | --- | --- | --- |
| 1 | No usable scan: no store owner says yes, or the photogrammetry mesh has holes and a wrong scale | B | Friday afternoon store visit; Plan B is the default regardless | The measured box-model store (Plan B) is built Friday night in 90 minutes whatever happens; a scan, if one lands, replaces its visuals and keeps its landmark names |
| 2 | Mixamo is down or rate-limited Friday | B | Tonight | Quaternius UAL on its own rig, end to end |
| 3 | Cartesia Managed Agent cannot reach a Claude model in its catalog, or tool round-trips exceed the timeout | C | H+12 | Hand-rolled loop: Ink-2 turns → our Claude → Sonic; or text-chat interview with a prerecorded voice clip in the video |
| 4 | Free credits run out mid-build (Cartesia \~17 agent minutes, Viggle 10 calls) | C, B | Friday morning | Buy Cartesia Pro; Viggle is stretch only |
| 5 | Venue Wi-Fi fails (Cal Hacks 12 had problems; 13 promises fixes) | D | Any time | Phone hotspot for the demo laptop; upload-text mode works offline against the local Convex dev deployment; demo video recorded by H+26 |
| 6 | Diarization mislabels speakers in a loud hall | C | H+22 | Two-device mode (channel = speaker), then push-to-talk |
| 7 | Extractor emits coordinates, invents landmarks, or drops `sources` | C | H+6 fixture test | Zod rejects the patch; retry once with the error in context; after two failures the segment is shown as "unparsed" for manual anchoring in the UI |
| 8 | Gate is slow inside the procedure's transaction (large mesh, raycasts per event) | A | H+10 | Reduced mesh only (under 50K triangles); cap raycasts to `saw` events; if still over 2 s, gate on the host browser client and write results through the setStatuses reducer |
| 9 | Viggle GLB does not bind to the Mixamo rig | B | H+1 single test | Drop Stretch 5; Mixamo clips only |
| 10 | Physics explodes on scan geometry (thin triangles, ghost collisions) | B | H+20 | Props become kinematic: dropped prop lerps to the floor hit point, no simulation |
| 11 | Memory contamination question from a judge with a legal or psychology background | D | Rehearsal | The answer in Prizes and pitch; show the copilot mode as the mode for real use |
| 12 | Team member sick or absent | all | Any time | Scope tiers section has the 3-person and 2-person plans |
| 13 | Three agents on three worktrees produce merge conflicts in scene/ that cost B an hour | B | Friday smoke test | Worktrees are split by file ownership, B merges every 90 minutes by hand; if conflicts persist, collapse to Claude Code alone on one worktree |
| 14 | Main breaks at H+30 from a late merge | A | After freeze | Freeze means only A merges; tag `demo-v1` at H+24 and the demo laptop stays on the tag |
| 15 | AI assistants generate retired Cartesia Line code or old endpoint names | C | H+10 | Pin `cartesia_version=2026-08-14`; paste the Managed Agents docs into `apps/agent/CLAUDE.md` |
| 16 | Maincloud free energy credit runs out, or Maincloud is unreachable on venue Wi-Fi | A | Saturday | Self-host with spacetime start on A's laptop (the demo laptop can run the whole stack locally); Cartesia webhooks reach it through a cloudflared tunnel |
| 17 | The module's HTTP handler for the Cartesia webhook does not behave as documented (the FAQ says procedures are not yet HTTP endpoints; 2.8 delegates handlers to submodules) | A, C | One hour of trying, no later than H+12 | A 20-line Node relay (Express) receives the webhook, calls insertSegment and extractSegment through the TypeScript client SDK, returns the flags; runs on A's laptop behind a cloudflared tunnel; C builds it first in the Cartesia block so it exists before anyone needs it |

## Prizes, pitch and submission

**Track strategy, from the live Hive prize list** ([hive.hackberkeley.org/prizes](https://hive.hackberkeley.org/prizes), updated Oct 22, 9:47 PM, read Friday 9:50 AM). Two anchor sponsors that had no track on Devpost now have one with criteria: Anthropic and SpacetimeDB. The list below is every category we can enter and defend to that sponsor's own judge at the table; 13 to 14 categories in all, none of them a bolt-on.

| Tier | Track | What the sponsor says it judges | How Rashomon meets it | Cost to us |
| --- | --- | --- | --- | --- |
| Core | 1st to 3rd Overall, Most Technically Complex Hack, Most Creative Hack, Best People-First Hack, Hacker's Choice | Impact, functionality, technical complexity, creativity (FAQ) | The gate plus the live loop is the complexity story; the public-defender framing is the people-first story; the POV contradiction catch is the creative moment | None |
| Core | **Anthropic** (anchor; prize "coming soon") | 1) a named community, not "students"; 2) a real problem you lived or talked to someone who has; 3) it works, one thing usable on Monday; 4) thoughtful use of Claude and knowing where it could go wrong for the people using it | Community: investigators at public defender offices who take witness statements. Talk to one person Friday (a PD investigator, a law-school clinic student, or a criminology grad) and quote them. Monday-usable: paste a transcript, get a checked reconstruction. Claude does extraction and question generation. Where it goes wrong: false memories, over-trust in animation, scan errors; all three are on the guardrails slide | One 15-minute call Friday, one slide |
| Core | **Cartesia** (Meta glasses, TBD) | Voice core to the product, not a demo feature; a 2-minute demo-first presentation; a README listing Cartesia features and known limitations; no secrets in the repo; 25% each: problem and originality, use of Cartesia, execution, impact and responsibility (accessibility, privacy) | Live interview on a Managed Agent (Ink-2 + Sonic 3.6) is MVP; copilot mode streams both speakers through Ink-2, so voice stays core either way; README section "Cartesia features used"; a privacy paragraph (witness audio retention, consent) | README section, a 2-minute cut of the pitch |
| Core | **Microsoft** Built for the Real World, Customer Impact Award | Production-minded AI agent in a high-impact domain; customer understanding, measurable usefulness, path from prototype to production, responsible design, end-to-end functionality | Same interviewee as Anthropic; measurable: statements checked per hour, contradictions surfaced before the report is written; path to production: provenance and override log already exist; responsible: the no-lie-detector rule | We submit; confirm vendor eligibility at the Fri 7 PM social but enter regardless |
| Core | **SpacetimeDB** (anchor; prize "coming soon") | Core real-time backend with live shared state, AI agent coordination, shared simulations, "meaningfully used, not added on the side" | The module holds the graph, and the gate's verdict commits in the same transaction as the patch; four agents (interviewer, extractor, gate, investigator) coordinate on one persistent world state | Decided; Convex track not entered |
| Opt-in | **Figma** (Amazon gift cards + recruiting session) | Their doc frames it as "Idea to demo": Figma Make turns a prompt into a prototype, the Figma agent reads and writes designs | D builds the workspace mock in Figma Make with the Figma agent at the Fri 7 PM Figma workshop; frames go into the Devpost page | None beyond D's existing plan |
| Opt-in | **Moss** (AirPods Max/Pro) | Three examples wanted: voice AI agents that listen, respond and act; a personal agent; best social post | Stretch 6: index utterances and landmarks, the interviewer retrieves prior statements; plus one social post about the build | 2 hours at H+26 or later |
| Opt-in | MLH Commit Fellowship; GoDaddy domain | Opt in and fill the supplemental form; register a domain | Checkbox; buy the domain | 20 minutes total |
| Opt-in | Notability (1 year Pro + merch) | Process notes showing how the idea evolved, real role in the build | Only if D already keeps the design notes in Notability; otherwise skip | 0 or skip |
| Ask first | Creao AI ($2,500 / $1,500 / $1,000 + Launchpad) | Criteria live in a Google doc we could not open | Ask at the booth whether the product must run on CREAO; if yes, skip | 5 minutes at the booth |
| Ask first | Bitdeer AI Model Studio ($500 credits + mice) | Build using Model Studio, 20% weight on its use | Only if they offer one-click hosting of something we need (Sortformer diarization is the one real candidate); otherwise skip | Booth |
| Ask first | Mana.space; Annapurna; Elastic; AfterQuery; Armadin | Mana: use it while building and link public chats; the rest say "coming soon" | Mana only if one seat tries it on a real task and it helps; check the rest Saturday morning | Booth |
| Skip | Fetch.ai (1st $1,250) | Primary user workflow must run entirely inside an ASI:One conversation, agent on Agentverse with the chat protocol | Our primary workflow is voice and 3D; wrapping one agent would fail the "entirely" test | Skip |
| Skip | Meta, Factory, Hyphenate, Visa, Coinbase, Capital One, CRS, Apify, Bright Data, Atlassian, SpaceXAI (needs Cursor + Grok + space data), Hardware, Planet-First, Beginner, Solo | Criteria exclude us or require a second product | Skip | Skip |

**Backend decision: SpacetimeDB, decided Friday 2:20 PM.** Convex was Wednesday's low-risk default and is dropped; we do not enter its track. The reasons, in the order they matter to judges: the anchor-sponsor criteria describe this product; the transactional gate is a real property, not a slogan; and the official `spacetimedb-concepts` and `spacetimedb-cli` skills in the `clockworklabs/spacetimedb` repo (plus the community `spacetimedb-best-practices`) mean A's agent has the API in context instead of guessing it. The remaining risk is the Cartesia webhook handler; its fallback is a 20-line Node relay, and it is risk 17 below.

**Pitch (3 minutes, about 420 words, D presents, B drives, A takes technical questions, C stands by on voice)**

| Time | Beat | On screen |
| --- | --- | --- |
| 0:00 | Problem: eyewitness testimony is the most common evidence and the least checkable; it becomes a paragraph nobody can test against the room | Title, then a plain witness statement paragraph |
| 0:20 | What we built: testimony becomes events anchored to a scan of the real room, every event cites its quote, and the room decides what is possible | The store, landmarks labeled: door, aisles, end cap, counter, cooler |
| 0:40 | Live loop: witness speaks (one sentence), event appears, animates | Suspect walks door to counter; clerk behind it |
| 1:10 | The catch: "I saw his face from the chips aisle when he pulled the knife." Sightline drawn, the end-cap shelf blocks it, event goes red, agent asks the follow-up, witness corrects to the cooler, event moves and turns green | POV camera from the chips aisle, then from the cooler |
| 1:50 | Investigator control: drag the suspect's entry to the back door, gate re-runs; override an implausible event with a reason, badge stays | Timeline + override dialog |
| 2:15 | Props and multi-witness (one sentence each; show if built, say "next" if not) | Knife spawned with dimension overlay; second witness layer |
| 2:30 | Who it is for and what it is not: investigators and public defenders; it is a demonstrative aid that tests hypotheses, never a simulation that reaches conclusions; AI-assisted, disclosed, human in the loop | Guardrails slide, four bullets |
| 2:50 | Stack in one breath: Claude Sonnet 5.5 for extraction, a Cartesia Managed Agent for the interview, SpacetimeDB for the live graph with the gate committing in the same transaction, Three.js on measured store geometry | Logos |

**The 2-minute demo-first cut** (Cartesia asks for it, and it is what a sponsor judge with 5 minutes actually wants): start at 1:10 in the table above, the contradiction catch, with the agent's voice audible; then 20 seconds of "what you just saw" (scan, gate, provenance); then 20 seconds of how it was built (Cartesia Managed Agent, Claude, the backend, Three.js); then one line on who it is for. Every sponsor judge gets this cut; the 3-minute version is for the general judges.

**Judge questions to rehearse, with the answer in one line each**

- *Isn't this a lie detector?* No. It checks claims against geometry and against each other, never people; a failed check means the room disagrees, and honest witnesses misjudge distance and time constantly. There is no credibility score anywhere in the product.
- *Why not generate a video with a world model?* A generated video is a persuasive fiction with invented distances; courts have warned since 1989 that realistic re-enactments get accepted unquestioned. Ours can be wrong in a checkable way, and the gate refuses to draw what the room says is impossible.
- *Would a court allow it?* Under *People v. Duenas* (Cal. 2012) an animation is demonstrative and admissible if it fairly represents the evidence; a simulation that reaches conclusions is substantive and faces Daubert. We are built to stay on the animation side: hypothesis testing with provenance, no conclusions, disclosure on every export. We claim no admissibility.
- *Can an AI interviewer contaminate memory?* Yes, a 2024 MIT study found a generative interviewer induced over three times the false memories of a control. That is why the agent asks only open, non-leading questions from a fixed rule set, names the room rather than the witness, and never supplies details; and why copilot mode, where a human asks, is the mode we expect real investigators to use.
- *What is new versus VeriScene or Criminator?* VeriScene turns photos plus written statements into an 8-second video offline; Criminator (CHI '26) lets an officer hand-animate a scene in a scan. Nobody closes the loop live: interview, geometric check, follow-up question, editable multi-witness scene with an override log.

**Submission and judging format** (Hive FAQ and Devpost, read Friday morning): teams are 1 to 4 people. Submit on Devpost by **Sunday 8:50 AM** (the Hive schedule's deadline; Devpost says 9:00, so 8:50 is the real one) with team name, table number, a 2 to 3 sentence elevator pitch, the GitHub repo, a project image, and a locally stored demo video. Judges come to the table; each judge has 5 minutes total, so the pitch is 3 minutes and questions 2. Prior work is disqualifying: ideation before the event is fine, all implementation during the hacking period, and they say they check. Winners are announced at the closing ceremony Sunday afternoon (Devpost: 4 PM). Pre-fill the Devpost form at H+26 so submission is ten minutes.

**Stage guardrails to state out loud** (one slide, read verbatim if tired): human in the loop on every accept, override and export; provenance on every element; uncertainty drawn as uncertainty; no guilt, intent, credibility or deception outputs; every export labeled "AI-assisted illustration, not a recording"; demo on synthetic data with generic faceless figures.

## Friday prep checklist

All of this is ideation, assets, accounts and prompts; none of it is implementation. Keep it in a `prep/` folder outside the submission repo; the repo is created at the opening bell.

**Everyone**

- [ ] Devpost account, joined the Cal Hacks 13.0 hackathon page, team formed there
- [ ] Claude Code installed and signed in; Node 20+, pnpm; Vite + R3F starter runs on your laptop with React pinned to 19.3.x (delete the starter before the bell)
- [ ] Read this doc end to end; know your seat's "done when"
- [ ] Eye mask, charger, headphones with a mic

**A (engine + backend)**

- [ ] Install the SpacetimeDB CLI and the three Claude Code skills (commands in Start here); create a Maincloud account; run `spacetime dev --template basic-ts` in a throwaway folder once and delete it; read the docs pages on procedures, views and HTTP handlers; pin the `spacetimedb` npm version to the Maincloud host version
- [ ] Anthropic API key with credit; test one tool-use call
- [ ] Paper versions of `apartment.scene.json` and `shove.graph.json` written with D (names, anchors, times, the one contradiction on `e5`)
- [ ] Root `CLAUDE.md` and `packages/engine/CLAUDE.md` drafted; first three task prompts written
- [ ] Read the recast-navigation-js README (threeToSoloNavMesh, NavMeshQuery.computePath; walkable parameters are in voxels, cs about 0.05 for a room) and three-pathfinding's Pathfinding class for Node-side path queries over the exported navmesh

**B (you)**

- [ ] Mixamo account; tonight, not Friday: download Y Bot with skin (FBX Binary, T-pose), then these clips without skin, In Place ticked, keyframe reduction off: idle, walking, running, crouching idle, falling back, push, punch, picking up, standing up, looking around, opening door; convert each to GLB with a Blender headless script into `prep/assets/` (git-ignored)
- [ ] Viggle API key (100 free credits = 10 text-to-motion calls); spend one on a shove prompt, open the GLB and compare bone names with mixamorigHips; decide retarget vs skip
- [ ] Scan the demo room Thursday night with Scaniverse (free; exports GLB mesh and SPZ splat from one capture), LiDAR mode, slow pass, every corner twice; run gltf-transform weld and simplify to under 50K triangles; check scale against two tape measurements. Scan a second room as backup
- [ ] With D, visit a corner store this afternoon with a tape measure: aisle width, gondola height and length, counter height and depth, door-to-counter distance, cooler wall length; ask the owner about a 10-minute photo pass; pick the 10 landmarks on paper either way
- [ ] `apps/web/src/scene/CLAUDE.md` drafted; clip-to-action map written; first three task prompts written
- [ ] Create the three worktrees (scene-core, scene-props, scene-ui) at the bell, not before; confirm Claude Code, Cursor and Antigravity are all signed in and that a Claude Code cloud session can clone the repo; stage the Blender conversion script as the first cloud job

**C (interview + extraction)**

- [ ] Cartesia account on Pro ($5); API key; run the Managed Agents WebSocket quickstart (not Line, which is being retired) and the Ink-2 turns quickstart; check GET /v1/agents/models for which Claude IDs the catalog offers
- [ ] AssemblyAI account (speaker labels for copilot and uploads), key tested once on a 30-second two-voice clip; Deepgram as the backup
- [ ] Extraction prompt skeleton and the `Patch` tool schema drafted in `packages/extractor/CLAUDE.md`; five hand-written segment-to-patch examples from the scenario script
- [ ] Cognitive-interview rule list for the agent's system prompt (open narrative first, no leading, anchor to landmarks, then times, then sightlines, never supply details)
- [ ] First three task prompts written

**D (UX + product)**

- [ ] Figma file with the three-pane workspace frame, status visual language, flags panel, override dialog, copilot panel
- [ ] `demo/script.md`: the scenario in the witness's words, where the contradiction lands, the pitch beats from this doc
- [ ] `props.json` filled from the table below, plus 8 CC0 low-poly GLBs picked (Poly Pizza, Kenney, Quaternius)
- [ ] Deck skeleton (title, problem, loop, catch, control, guardrails, stack, team)
- [ ] Devpost page draft text; GoDaddy domain idea; booth plan (Anthropic, Cartesia, Convex, Microsoft, SpacetimeDB, Moss)
- [ ] RSVP'd to nothing else; sleep well Thursday

**Props library seed** (metric; sources opened by the research pass)

| Prop | Dimensions | Mass | Source |
| --- | --- | --- | --- |
| Handgun (Glock 19) | 187 × 128 × 32 mm | 0.67 kg empty, 0.86 kg loaded | [glock.com](https://us.glock.com/en/pistols/g19) |
| Chef's knife | 203 mm blade, 51 mm wide | \~0.25 kg | [katom.com](https://www.katom.com/037-47020.html) |
| Paring knife | 80 mm blade, 189 mm overall | \~0.05 kg | [galaxus.ch](https://www.galaxus.ch/en/s2/product/victorinox-paring-knife-8-cm-kitchen-knives-58336137) |
| Baseball bat | up to 1067 mm long, 66 mm diameter | \~0.9 kg | [baseballrulesacademy.com](https://baseballrulesacademy.com/?p=5218) |
| Smartphone (iPhone 17) | 149.6 × 71.5 × 7.95 mm | 0.177 kg | [apple.com](https://www.apple.com/iphone-17/specs/) |
| Doorway | clear width ≥ 815 mm, clear height ≥ 2030 mm | n/a | [corada.com](https://www.corada.com/documents/2010ADAStandards/404-2-3) |
| Dining chair | 838 H × 521 W × 514 D mm, seat \~460 mm | \~6 kg | [dimensions.com](https://www.dimensions.com/element/generic-c-chair) |
| 3-seat sofa | \~2108 mm long (1800 to 2300), 850 to 950 deep | \~90 kg | [castlery.com](https://www.castlery.com/us/blog/sofa-sizes-and-dimensions) |
| Beer bottle (12 oz) | 231 × 61 mm | \~0.55 kg full | [dimensions.com](https://www.dimensions.com/element/beer-bottle-12-oz-long-neck) |
| Wine bottle (750 ml) | 300 × 75 mm | \~1.2 kg full | [dimensions.com](https://www.dimensions.com/element/wine-bottle-750-ml-standard) |
| Backpack (25 L) | 424 × 330 × 216 mm | \~0.3 kg empty | [backcountry.com](https://www.backcountry.com/jansport-superbreak-backpack-1550cu-in) |
| Adult height (US, 20+) | men 175 cm, women 161 cm | n/a | [cdc.gov](https://www.cdc.gov/nchs/fastats/body-measurements.htm) |

Masses marked \~ are estimates for the physics layer, not sourced; they only affect how a dropped prop falls. The store scenario adds four scene props whose dimensions come from Friday's tape measure rather than a source: a counter (about 1.0 m tall, 0.6 m deep), a gondola shelf unit (about 1.5 m tall, 1.2 m long, 0.5 m deep), an end-cap shelf, and a cash register; model them from Kenney or Quaternius shop assets scaled to those numbers.

## Research notes and sources

Three research passes ran on Oct 22 (3D toolchain; voice, backend and logistics; forensic domain and prior art). Findings that changed the plan from Monday's version, in one line each:

- Cartesia is retiring the Line SDK on Dec 1, 2026; the interviewer is a Managed Agent over WebSocket with webhook tools, and bring-your-own Claude key only works with Line.
- Ink-2 has no diarization; copilot mode uses two devices on Ink-2 or AssemblyAI speaker labels. NVIDIA's Sortformer is self-host only and the Nemotron diarization preview license forbids showing results.
- Viggle's API does text-to-motion (10 credits a call, 100 free) with an undocumented "Mixamo-style" 50-joint rig, and scene generation from text or one panorama only, not from photos of a real room.
- three-pathfinding needs a pre-built navmesh; recast-navigation builds one at runtime. Rapier physics cannot be scrubbed, so prop motion is baked after each edit.
- SpacetimeDB 2.x TypeScript modules run on V8: reducers are transactional and isolated, procedures can call external HTTPS APIs, views are subscribable, 2.8 added HTTP handler delegation; official Claude Code skills (spacetimedb-concepts, spacetimedb-cli) live in the clockworklabs/spacetimedb repo. Claude strict tools cannot bound numbers, so confidence is an enum. Convex was Wednesday's default and was dropped Friday.
- Scaniverse is free and exports GLB and SPZ from one capture; Polycam free exports glTF only.
- Prior art: VeriScene (photos plus statements to video, offline) and Criminator (CHI '26, hand-animated scenes in a real scan). A 2024 Loftus-group study found an LLM interviewer induced over 3× the false memories of a control.
- *People v. Duenas* (Cal. 2012) separates demonstrative animation from substantive simulation; we build and pitch on the animation side.
- The Hive live site (read Friday 9:50 AM in a browser; it renders client-side) resolves the team-size question (1 to 4), puts the submission deadline at Sunday 8:50 AM, lists Friday's workshops, and publishes criteria for Anthropic (named community, real problem, usable Monday, thoughtful Claude use), Cartesia (voice core, 2-minute demo-first, README), Microsoft (production-minded agent) and SpacetimeDB (core real-time backend, AI agent coordination); Fetch.ai requires the primary workflow to run inside ASI:One, which rules it out.

**Sources opened**

*Event*: [Cal Hacks 13.0 on Devpost](https://cal-hacks-13-0.devpost.com/) · [calhacks.io](https://www.calhacks.io/) · [Hack Month RSVP](https://tinyurl.com/ddoskis-hack-month) · [Spacetime at Cal Hacks](https://spacetimedb.com/blog/spacetime-at-calhacks)

*Voice and transcription*: [Cartesia docs](https://docs.cartesia.ai/) · [Managed Agents intro](https://docs.cartesia.ai/agents/introduction.md) · [Migrate from Line SDK](https://docs.cartesia.ai/agents/migrate-from-line-sdk.md) · [Agent WebSocket API](https://docs.cartesia.ai/api-reference/agents/websocket.md) · [Webhook tools](https://docs.cartesia.ai/agents/webhook-tools.md) · [Client tools](https://docs.cartesia.ai/agents/client-tools.md) · [Ink-2 turns endpoint](https://docs.cartesia.ai/api-reference/stt/turns/websocket.md) · [STT latest](https://docs.cartesia.ai/build-with-cartesia/stt/latest.md) · [TTS latest](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest.md) · [Client auth](https://docs.cartesia.ai/get-started/authenticate-your-client-applications.md) · [Cartesia pricing](https://cartesia.ai/pricing) · [AssemblyAI streaming diarization](https://www.assemblyai.com/docs/streaming/diarization-and-multichannel.md) · [AssemblyAI pricing](https://www.assemblyai.com/pricing) · [Deepgram diarization](https://developers.deepgram.com/docs/diarization) · [NeMo streaming Sortformer](https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2.1) · [Nemotron-3-Diarization-preview](https://huggingface.co/nvidia/Nemotron-3-Diarization-preview) · [NIM speech release notes](https://docs.nvidia.com/nim/speech/26.10.0/about/release-notes.html)

*Backend and models*: [Convex pricing](https://www.convex.dev/pricing) · [Convex limits](https://docs.convex.dev/production/state/limits) · [Convex file storage](https://docs.convex.dev/file-storage/upload-files) · [Convex AI Gateway](https://docs.convex.dev/ai-gateway/overview) · [Claude models](https://platform.claude.com/docs/en/models/overview) · [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing.md) · [Strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use.md) · [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md) · [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md) · [Moss quickstart](https://docs.moss.dev/docs/start/quickstart.md) · [Moss pricing](https://www.moss.dev/pricing)

*SpacetimeDB*: [Functions: reducers, procedures, views](https://spacetimedb.com/docs/functions) · [FAQ: hosting, Maincloud tiers, limits](https://spacetimedb.com/docs/intro/faq) · [Language support](https://spacetimedb.com/docs/intro/language-support) · [v2.8.0 changelog](https://spacetimedb.com/changelog/v2.8.0) · [Install](https://spacetimedb.com/install) · [TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript) · [Official skills listing](https://claudemarketplaces.com/skills/clockworklabs/spacetimedb/spacetimedb-concepts) · [spacetimedb-best-practices skill](https://skillselion.com/skills/douglance/stdb-skills/spacetimedb-best-practices) · [Community MCP server](https://glama.ai/mcp/servers/b8itms38ha) · [Spacetime at Cal Hacks](https://spacetimedb.com/blog/spacetime-at-calhacks)

*3D*: [Viggle JST-2](https://viggle.ai/jst2) · [Viggle text-to-motion](https://docs.viggle.ai/v1/guides/quickstart-text-to-motion.md) · [Viggle motion export](https://docs.viggle.ai/v1/api-reference/motions/export.md) · [Viggle scenes](https://docs.viggle.ai/v1/guides/quickstart-scene.md) · [Viggle pricing](https://docs.viggle.ai/v1/pricing.md) · [Mixamo licensing FAQ](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/m-p/13234775) · [Mixamo to Blender 2026 guide](https://app.cinevva.com/guides/mixamo-to-blender-2026) · [Quaternius UAL](https://quaternius.com/packs/universalanimationlibrary.html) · [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js) · [three-pathfinding](https://github.com/donmccurdy/three-pathfinding) · [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/) · [Rapier colliders](https://rapier.rs/docs/user_guides/javascript/colliders/) · [SkeletonUtils retarget issues](https://discourse.threejs.org/t/skeletonutils-retarget-doesnt-work-with-mixamorig-skeleton-inverted-feet-backward-hands/54892) · [Spark](https://sparkjs.dev/docs/) · [spark-react-r3f](https://github.com/sparkjsdev/spark-react-r3f) · [Scaniverse export formats](https://community.scaniverse.com/t/which-formats-can-scaniverse-export-to/50) · [Polycam export formats](https://learn.poly.cam/hc/en-us/articles/27756102599572-What-File-Types-Can-Polycam-Export) · [drei Html](https://drei.docs.pmnd.rs/misc/html) · [drei PivotControls](https://drei.docs.pmnd.rs/gizmos/pivot-controls) · [Mediabunny media sources](https://mediabunny.dev/guide/media-sources) · [Kenney assets](https://kenney.nl/assets) · [Quaternius](https://quaternius.com/)

*Forensic, memory and legal*: [VeriScene](https://arxiv.org/abs/2609.08342) · [Criminator (CHI '26)](https://arxiv.org/abs/2601.13689) · [Chan et al., AI-induced false memories](https://arxiv.org/abs/2408.04681) · [ChatCharlie initial accounts](https://westminsterresearch.westminster.ac.uk/item/wz6w6/collecting-initial-accounts-using-chatcharlie-chatbot-improves-eyewitness-memory-in-later-investigative-interviews) · [Cognitive interview overview](https://www.simplypsychology.org/cognitive-interview.html) · [FHWA pedestrian walking speeds](https://www.fhwa.dot.gov/publications/research/safety/pedbike/98107/section2.cfm) · [Reaction time reference](https://visualexpert.com/Resources/reactiontime.html) · [Face recognition by distance (UW)](https://www.washington.edu/news/2005/02/14/murder-case-research-shows-why-its-easier-to-identify-someone-close-than-far-away/) · [Distance and speed estimates in crash tests](https://jsheld.com/uploads/Eyewitness-Reliability-Survey-Responses-of-Distance-and-Speed-Estimates-in-Real-World-Crash-Tests.pdf) · [NRC 2014, Identifying the Culprit](https://www.nationalacademies.org/read/18891/chapter/1) · [Weapon focus meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC4766305) · [People v. Duenas](https://scocal.stanford.edu/opinion/people-v-duenas-34120) · [Daubert standard](https://www.law.cornell.edu/wex/Daubert_standard) · [FRE 613](https://www.law.cornell.edu/rules/fre/rule_613) · [CALCRIM 226](https://justia.com/criminal/docs/calcrim/200/226) · [Proposed FRE 707](https://www.proskauer.com/blog/machine-generated-evidence-challenges-the-federal-rules-inside-the-contested-proposed-federal-rule-of-evidence-707) · [OSAC crime scene reconstruction draft](https://www.nist.gov/document/osac-2025-n-0004-standard-criteria-crime-scene-reconstructionopen-comment) · [FARO Zone 3D](https://srv.jgc.gr/Pdf_files/FARO_Zone_3D_Techsheet.pdf) · [Leica Map360](https://dr.leica-geosystems.com/industries/public-safety-security-and-forensics/solutions/software-for-public-safety/map360)

*Props*: linked per row in the Friday prep checklist.
