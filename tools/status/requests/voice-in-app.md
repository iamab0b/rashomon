# Request: PR #63 (voice-in-app) round 2, for Eric

From the leader, Sun 3:15 AM, on Sahil's merge condition for this post-freeze addition: **with `?voice=1` absent nothing voice-related renders, there's no network call and no microphone access, and a test pins that.**

ecf3688 is close. The Sonnet review confirms:
- the token server binds 127.0.0.1, matches Origin exactly (a missing Origin gets 403), accepts POST only, and never logs or returns the key; the grant is agent-only with a 300 s expiry, and it isn't started by dev or build;
- no import-time side effects in adapters/voice;
- the mic is requested only on press, and hangup cleanup works;
- there's no key in dist.

One HIGH blocks the merge. Push to voice-in-app; no force-push.

1. **HIGH, the gate on the new button isn't tested** (StatementSection.tsx:146, `{voiceEnabled && voice && (`; the tests at statement.test.tsx:162-186 only cover `voiceInterviewEnabled()` and the old "coming soon" button). Removing `voiceEnabled &&` leaves every ui and App test green. Add:
   - a view test: `StatementSectionView` with `voiceEnabled: false` and a `voice` prop renders no "Talk to the interviewer" and no voice control;
   - a component test without `?voice=1`: no fetch to the token server, and `getUserMedia` never called. Stub both and assert zero calls after mount.
   Each must fail when the gate is removed; check that.
   - The Opus review confirms the same HIGH. Its test is the sharpest: render `StatementSectionView` with `voiceEnabled: false` plus a voice object, and assert the markup **equals** the render without `voice` (no "Talk to the interviewer", no `voice-control`).
2. **MEDIUM, optional:** without the flag, the voice code and the `http://127.0.0.1:8787/token` string still ship in the bundle, and `useVoiceInterview()` runs on every mount. It only builds state, so it's harmless. A dynamic `import()` behind the flag would make the bundle without the flag match demo-v1. Only do this if it takes 10 minutes or less.

3. **LOW, optional (Opus):** in session.ts:61-64, fetch the token before asking for the mic, so a missing token server doesn't trigger the permission dialog.
4. **LOW, note only:** vite.config.ts bakes the (non-secret) agent id into production builds when .cartesia-ids.json exists. That's fine.

The leader re-reviews with Opus and Sonnet and merges if clean.
