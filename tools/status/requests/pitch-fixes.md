# Pitch script and video plan: match what main does (from Sahil)

PR #28 (hazel/pitch at e6c6251) was checked line by line against main. The catch is described accurately: the wireframe ghost with its red badge at t 11, the ray stopping at the chips shelf, the flag headline, e5's question, "Apply this override?" and "Confirm override", History's Original finding → Override → Current state, Next flag, the Maincloud URL, and "no credibility score". It is not merged, because several lines describe things judges will not see on the running product. Push new commits to `hazel/pitch`; no force-push. Change only demo/.

When Eric's agent (branch cartesia-agent) and the statement box (submit-statement plus your interview-screen) merge, the lines in the second group can go back to present tense. Until then, judges compare what they hear with what they see.

**Fix now (they contradict main):**
1. pitch-script.md line 20, "source sentence underneath". Cards show source ids (utt_2) that open the Transcript. Say "each card links to the sentence it came from".
2. Line 23, the witness line. Use the fixture's own words, which judges can open in the Transcript: "That's when I looked up." / "I saw his face clearly." (utt_6, utt_7).
3. Line 26 (and video-plan line 23), "follow-up question appears". After the drag it is a soft contradiction flag. Quote it exactly: "Earlier you said you were by the chips aisle around then; now the front window. Which came first?" Call it a question, not a ruling.
4. Line 29, "amber badge". It is the amber corner on the timeline block plus "Overridden" in the panel. Say "the amber Overridden mark".
5. Lines 32 to 33 (and video-plan line 25), the knife. Props are real-size grey boxes. Say "a real-size placeholder for the knife".
6. Lines 36 and 66, "Every export says: AI-assisted illustration…". No such label exists. Cut it, or say "will say".
7. Line 62, "VeriScene (Sept 2026)". Check the date or drop it.
8. Lines 17 and the "what you saw" beat, "measured model of the real place" and "scan". The store is a modeled store from a measured floor plan, not a scan. Say "a modeled store" or "measured floor plan".

**Conditional on what merges by the recording:**
9. Lines 39 and 45, "A Cartesia agent runs the interview", "Ink in, Sonic out". Until the agent merges, say "The Cartesia agent is next; its webhook is live, checks a shared secret, runs Claude extraction and returns the flags to the agent."
10. Line 52 (and video-plan line 33), "Sahil types the witness line", "text mode". Until the statement box merges, the catch is the drag (and ?scenario=corrected for the after frame), and the agent's question is read from the Flags card.
11. Line 60, "the agent asks only open questions". Use "will ask" until the agent is live.
12. video-plan lines 9 and 22, "Eric runs the agent", "live voice". Mark these conditional.
13. video-plan line 7, the demo-v1 tag. It does not exist yet; it is made at the 9 PM freeze.

**Add:**
14. In the live part (line 51), never drag or override in Maincloud session demo. Use a scratch session seeded with `tools/smoke/seed-maincloud.sh take1`, as docs/demo-laptop.md says.
15. The 2-minute cut opens on the catch (Cartesia asks for demo-first), but the catch arrives at 0:40. Move it to the first 15 seconds. If the agent is not live by recording, decide with Sahil whether that cut shows the webhook (a curl returning 401 without the secret) or says plainly that voice is next.

Done-check:
- `git grep -n -i "every export says\|types the witness line\|amber badge" demo/` prints nothing.
- The agent and typed lines are marked as conditional, or are true on main at recording time.
- Greptile is not running; the leader re-checks against main and merges.
