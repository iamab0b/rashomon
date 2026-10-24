# Demo laptop

How Hazel's laptop gets ready for the table demo and the video. Everything here runs on her laptop unless a step says "Sahil". No secret is ever typed on the demo laptop.

## 1. Checkout and install (once, then before each rehearsal)

```
git clone https://github.com/iamab0b/rashomon.git
cd rashomon
git checkout main && git pull --ff-only
node --version
corepack enable && pnpm --version
pnpm install --frozen-lockfile
```

Node must be 22 or later, and pnpm 12.15.0 (pinned in package.json).

The Mixamo characters and clips are not in the repo (licence). Sahil zips them from his checkout:

```
cd apps/web/public && zip -r ~/rashomon-assets.zip characters clips
```

Hazel unzips them into her `apps/web/public/`, so that `apps/web/public/characters/ybot.fbx`, `xbot.fbx` and `apps/web/public/clips/clip_*.fbx` exist. Without them the store loads but the actors do not.

Check the install:

```
pnpm -F web typecheck && pnpm -F web test
```

All tests should pass with none skipped. Skipped tests mean the clips are missing.

## 2. Run it

```
pnpm -F web dev
```

The app is at http://localhost:5173/. Use the dev server for the demo and the video: it is what was smoke-tested, and it has the Shot button.

Always use the same browser and the same browser profile, never a private window. The live identity (section 4) is saved in that profile.

## 3. Fixture mode: works with no network

| What | URL |
| --- | --- |
| The robbery, e5 flagged | http://localhost:5173/ |
| The flagged moment in the witness's view | http://localhost:5173/?cam=pov&t=11 |
| After the correction | http://localhost:5173/?scenario=corrected&t=11 |

Check against docs/smoke-demo.md fixture steps 1 to 9:
- At t 11 the witness is a wireframe with a red badge, and the sightline ray stops at the chips shelf.
- Override needs a reason of 10 or more characters.
- Dragging e5 to the front window turns it plausible.

Fixture mode is the fallback for the whole demo. If the venue Wi-Fi or Maincloud fails, switch the top bar to Fixture and carry on.

## 4. Live mode on Maincloud

| What | URL |
| --- | --- |
| The demo session (judges look at this one) | http://localhost:5173/?mode=live&stdb=wss://maincloud.spacetimedb.com&db=rashomon&session=demo |

Expect what smoke L2 and M2 say: "Live · connecting", then "Live", 10 events, and e5 implausible with sightline:e5. Never edit session demo during rehearsals. It must be at version 1 when a judge walks up.

For rehearsals and video takes, use a fresh scratch session for each take. Sahil seeds it:

```
tools/smoke/seed-maincloud.sh take1
```

Then open the same URL with `session=take1`. The next take is take2, and so on.

### Getting this browser into EDITOR_IDENTITIES (after submit-statement merges)

Until then, the Statement box does not exist and nothing here is needed. Once it merges:

1. Open the live URL above in the demo browser.
2. Open the Statement section and submit any sentence. Because the browser is not an editor yet, it shows "This browser can't add statements" and the browser's identity, with a Copy button.
3. Send that identity to Sahil. It is a public identifier, not a secret.
4. Sahil adds it to the list (section 6). This is an env-only update, with no republish and no data loss.
5. Reload. Submitting a statement now shows "Extracting…" and then the new events.

If the browser's site data is cleared, the identity changes. Repeat these steps with the new one.

## 5. The video

- **Stills.** In the dev server, the Shot button (top right of the canvas) writes `apps/web/shots/devpost/<cam>-t<t>[-<scenario>].png` at 1600 by 900 for the current view. It works in fixture mode only; for the after-correction frame use `?scenario=corrected`.
- **Screen recording.** Use the OS recorder at 1600 by 900 or larger, in fixture mode first. Record a live take only on a scratch session.
- The plan and the script are in demo/video-plan.md and demo/pitch-script.md.

## 6. Publish (Sahil only, in his own terminal)

Variable names only; the values come from Sahil's shell (read with `read -rs`, never typed into a file or a chat):

```
cd spacetimedb/server
ANTHROPIC_API_KEY=… CARTESIA_WEBHOOK_SECRET=… EDITOR_IDENTITIES=… spacetime publish rashomon --server maincloud -c=never --break-clients -y
```

- `--break-clients` is needed while a publish changes a row type the browser decodes (it does for #31 multi-witness). After such a publish, every open browser must `git pull`, `pnpm install` and hard-reload (section 4).

- No `-c` while Maincloud holds the demo session: a publish without it keeps every session. If a publish refuses because of a breaking schema change, stop and ask before using `-c=always`, which wipes everything and means re-seeding demo with `tools/smoke/seed-maincloud.sh demo`.
- `EDITOR_IDENTITIES` is a comma-separated list of hex identities: Sahil's CLI identity (`spacetime login show`, which the seed scripts need), Eric's, and the demo browser's.
- The host keeps stored values, so to change only the editor list:

```
EDITOR_IDENTITIES=… spacetime publish rashomon --server maincloud --env-only -y
```

- After any publish, run docs/smoke-demo.md M1 to M3.

### Environment variable names (values only in Sahil's shell or the dev server's shell, never in the repo)

| Name | Used by | When |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | module (extraction), at publish | always |
| `CARTESIA_WEBHOOK_SECRET` | module (webhook), at publish; Cartesia dashboard header | always |
| `EDITOR_IDENTITIES` | module, at publish | always |
| `CARTESIA_API_KEY` | apps/agent setup script (Eric) | agent setup only |
| `UTHANA_API_KEY` | module (generated motion), at publish; dev server proxy `/__uthana` | after the generated-motion PR merges |
| `UTHANA_CHARACTER_ID` | module and dev server (the uploaded Y Bot's id; not secret, kept out of the repo) | after the generated-motion PR merges |

To upload the Y Bot to Uthana once, from your own terminal, after `read -rs UTHANA_API_KEY && export UTHANA_API_KEY`: use the multipart `create_character` request from uthana.com/docs/api/capabilities/auto-rig-and-add-character with apps/web/public/characters/ybot.fbx, then `export UTHANA_CHARACTER_ID=<returned id>`. Re-uploading the same file returns the same id.


## 7. At the table

- Two tabs: the live demo session, and fixture mode.
- Laptop on power, sleep off, notifications off.
- The Wi-Fi fallback is the Fixture toggle, not a reload loop.
