# apps/agent: Cartesia Managed Agent (Seat C)

Cartesia is retiring the Line SDK (hosting stops 2026-12-01). Do not write Line code, `/agents/stream`, `start` events or `http_server_tool`. Several Cartesia API reference pages still show the Line shapes; trust the guides below.

Read 2026-10-24 from docs.cartesia.ai:
- Every REST call sends `Cartesia-Version: 2026-08-14` (the only allowed value) and `Authorization: Bearer $CARTESIA_API_KEY`.
- Tools: `POST /v1/agents/tools`, `PATCH /v1/agents/tools/{id}` (sparse; `type` cannot be sent; omitting `secret_value` keeps the stored secret). Webhook `api_schema.url` must be https and public; private ranges are blocked, so local SpacetimeDB goes through a cloudflared tunnel.
- Body params take a value from the model (`description`), a `constant_value` (the model never sees it) or a `dynamic_variable`. Session and witness ids are constants here, so the model never chooses them.
- `request_headers` values can be `{type: "secret", secret_value}`; secrets are write-only.
- `response_timeout_secs` 1 to 120 (default 20). Timeouts and non-2xx reach the LLM as an error result; the call goes on. Response bodies over 16 KiB are cut.
- Agent: `POST /v1/agents` with `config` {instructions, initial_message, model.id, tools: [{id}], system_tools.end_call, audio.input.keyterms, audio.output.voice_id}. `PATCH /v1/agents/{id}` is sparse and creates a new version that new calls use. `GET /v1/agents/models` lists the model ids.
- WebSocket: `wss://api.cartesia.ai/v1/agents/websocket/{agent_id}?cartesia_version=2026-08-14`, browser auth via `access_token`; first event `session_create`, wait for `session_ready`.

Webhook routes (SpacetimeDB module, `spacetimedb/server/src/http/cartesia.ts`), all POST with `x-rashomon-webhook-secret`:
- `/v1/database/<db>/route/webhook/cartesia/record_statement` body `{session_id, witness_id, text}`; the response's `askNext` is `{flagId, eventId, question}` for one open hard flag not handed out before, or null. Each flag is handed out once (table `asked_flags`), and a retry of the same statement gets the same `askNext` back (table `webhook_statements`). A plain-text statement is a retry only when the same witness's last statement had identical text and was stored under 15 s earlier; otherwise it is a new segment.
- `/v1/database/<db>/route/webhook/cartesia/scene_context` body `{session_id}`; `nextQuestion` only peeks at the next unasked flag and never marks it asked.
- `/v1/database/<db>/route/webhook/cartesia/end_interview` body `{session_id}`

The ask-back and cognitive-interview rules live in `src/instructions.ts`; `src/agent.test.ts` checks each one.

Setup: `pnpm --filter agent models`, then `pnpm --filter agent setup`. Env comes from the repo-root `.env.local`: `CARTESIA_API_KEY`, `CARTESIA_WEBHOOK_SECRET`, `RASHOMON_TUNNEL_URL`, `RASHOMON_SESSION_ID`, optional `RASHOMON_WITNESS_ID` (default w1), `SPACETIME_DB` (default rashomon), `CARTESIA_AGENT_MODEL`, `CARTESIA_VOICE_ID`. Created ids are kept in the gitignored `apps/agent/.cartesia-ids.json`, so a re-run updates instead of creating duplicates. Never print or commit a key or the webhook secret.
