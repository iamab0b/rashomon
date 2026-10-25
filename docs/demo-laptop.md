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
| The demo session (judges look at this one) | http://localhost:5173/?mode=live&stdb=wss://maincloud.spacetimedb.com&db=rashomon&session=demo2 |

Expect what smoke L2 and M2 say: "Live · connecting", then "Live", 10 events, and e5 implausible with sightline:e5. Never edit session demo2 during rehearsals. It must be at version 1 when a judge walks up. (Since the Sun 2:45 AM freeze the judges' session is demo2: the old session demo had been edited to version 2, with e5 plausible, so it no longer shows the flagged moment.)

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

ANTHROPIC_API_KEY, CARTESIA_WEBHOOK_SECRET and EDITOR_IDENTITIES are stored on Maincloud, so a code publish leaves them off the command line. The first publish of a module that declares a new env value has to carry it. Once the generated-motion module (B3) is merged, it declares UTHANA_API_KEY and UTHANA_CHARACTER_ID, so the first publish that includes it is:

```
cd spacetimedb/server
UTHANA_API_KEY=… UTHANA_CHARACTER_ID=… spacetime publish rashomon --server maincloud -c=never -y
```

After that publish the Uthana values are stored too, and later code publishes are just `spacetime publish rashomon --server maincloud -c=never -y`.

- Add `--break-clients` only when the publish changes a row type the browser decodes (#31 multi-witness, #40 action vocabulary and #45 bodies did). After such a publish, every open browser must `git pull`, `pnpm install` and hard-reload (section 4).
- To set or change env values the deployed module already declares, use an env-only publish. It updates only the values on its command line and keeps every other stored value. A value the deployed module doesn't declare yet is skipped, which is why the Uthana values go on the freeze publish instead. For example:

```
UTHANA_API_KEY=… UTHANA_CHARACTER_ID=… spacetime publish rashomon --server maincloud --env-only -y
EDITOR_IDENTITIES=… spacetime publish rashomon --server maincloud --env-only -y
```

- Values come from Sahil's shell (read with `read -rs`), never typed into a file or a chat. The webhook secret is the one in `~/.rashomon-webhook-secret`; never generate a new one, or Cartesia's header stops matching.
- No `-c` while Maincloud holds the demo session: a publish without it keeps every session. If a publish refuses because of a breaking schema change, stop and ask before using `-c=always`, which wipes everything and means re-seeding the judges' session with `tools/smoke/seed-maincloud.sh demo2`.
- `EDITOR_IDENTITIES` is a comma-separated list of hex identities: Sahil's CLI identity (`spacetime login show`, which the seed scripts need), Eric's, and the demo browser's.
- After any publish, run docs/smoke-demo.md M1 to M3.

### Environment variable names (values only in Sahil's shell or the dev server's shell, never in the repo)

| Name | Used by | When |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | module (extraction), at publish | always |
| `CARTESIA_WEBHOOK_SECRET` | module (webhook), at publish; Cartesia dashboard header | always |
| `EDITOR_IDENTITIES` | module, at publish | always |
| `CARTESIA_API_KEY` | apps/agent setup script (Eric) | agent setup only |
| `UTHANA_API_KEY` | module (generated motion; stored on Maincloud); dev server proxy `/__uthana` | once the generated-motion module (B3) is merged |
| `UTHANA_CHARACTER_ID` | module (stored on Maincloud) and dev server (the uploaded Y Bot's id; not secret, kept out of the repo) | once the generated-motion module (B3) is merged |

To upload the Y Bot to Uthana once, from your own terminal, after `read -rs UTHANA_API_KEY && export UTHANA_API_KEY`: use the multipart `create_character` request from uthana.com/docs/api/capabilities/auto-rig-and-add-character with apps/web/public/characters/ybot.fbx, then `export UTHANA_CHARACTER_ID=<returned id>`. Re-uploading the same file returns the same id. The Y Bot is uploaded with its own skeleton, so Uthana doesn't re-rig it. The text-to-motion model id is `text-to-motion-bucmd`; the API rejects `text-to-motion-2.0`.


## 7. At the table

- Two tabs: the live demo session, and fixture mode.
- Laptop on power, sleep off, notifications off.
- The Wi-Fi fallback is the Fixture toggle, not a reload loop.
