# procedures

Owner: Eric.

`extractSegment(sessionId, segmentId)` lives in `extractSegment.ts`. The work is in `../extract/run.ts`, which takes the key, the HTTP client and `withTx` as plain arguments so the procedure and the Cartesia webhook handler (`../http/cartesia.ts`) share it and tests can drive it with a fake fetch.

`regate(sceneId)` is not a procedure: every write path that changes a verdict already re-runs the gate in its own transaction.

Adding a procedure means one file in this folder plus one re-export line in `../index.ts`.
