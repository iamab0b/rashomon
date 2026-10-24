# tools/relay

A tiny local server that lets the demo laptop's typed input box reach extraction without putting the webhook secret in the browser. It holds the secret, accepts `POST /statement`, and forwards it to the SpacetimeDB module's Cartesia webhook (`.../v1/database/rashomon/route/webhook/cartesia`).

It is a fallback only. The main path is the `submit_statement` reducer. Use the relay only if that reducer is not merged by 3:30 PM, and nothing in `apps/web` calls it unless Sahil says so. It listens on 127.0.0.1 only and is never deployed: run it in your own terminal on the demo laptop, and stop it when the demo is over.

## Run it

In your own terminal, read the secret without echoing it, so it never lands in your shell history or on screen:

```
read -rs CARTESIA_WEBHOOK_SECRET
export CARTESIA_WEBHOOK_SECRET
node tools/relay/relay.mjs
```

It prints `relay listening on 127.0.0.1:8787` and exits with a message if the variable is missing. The secret is never printed or returned.

| Variable | Default | Meaning |
| --- | --- | --- |
| `CARTESIA_WEBHOOK_SECRET` | none, required | sent as the `x-rashomon-webhook-secret` header |
| `RASHOMON_WEBHOOK_URL` | `https://maincloud.spacetimedb.com/v1/database/rashomon/route/webhook/cartesia` | where statements are forwarded; use the local server's URL for a local run |
| `RELAY_PORT` | `8787` | the port, on 127.0.0.1 |

## Use it

`POST http://127.0.0.1:8787/statement` with JSON `{ "sessionId": "demo", "text": "He took the knife.", "witnessName": "Ana" }`. `sessionId` is 1 to 64 of `A-Z a-z 0-9 _ -`, `text` must not be empty, and `witnessName` is optional (default `witness`). The relay sends one utterance from 0 s to `max(1, words / 2.5)` s and returns the webhook's status and JSON body unchanged: the extraction result with statuses and hard flags, or the webhook's own error.

- Body over 64 KB: 413. Bad `sessionId` or empty `text`: 400.
- Webhook unreachable: 502 with `{"error": "relay could not reach the webhook"}`.
- Browser calls are allowed only from `http://localhost:5173` and `http://127.0.0.1:5173`. Any other `Origin` gets 403. Any other path or method gets 404.

## Test

```
node --test tools/relay/relay.test.mjs
```

The tests start the relay against a fake upstream on a random port.
