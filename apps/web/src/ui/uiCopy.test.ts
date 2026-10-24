import { describe, expect, test } from "vitest";
import type { Flag } from "../scene";
import { BASIS_LABELS, checkBasis, flagHeadline } from "./flagCopy";
import { eventPlace, placeName } from "./places";
import { sourceLabel, speakerLabel, transcriptFor } from "./transcript";

const CHECKS: Flag["check"][] = [
  "sightline",
  "reachability",
  "time_distance",
  "contradiction",
  "unanchored",
  "missing_time",
];

const ABSOLUTE = /\b(wrong|false|lie|lying|liar|impossible|cannot|can't|rules? (this )?out|the room (blocks|does not))\b/i;

describe("flag copy", () => {
  test("names the blocker by its landmark label", () => {
    const flag = { check: "sightline" as const, evidence: { blocker: "shelf_a" } };
    expect(flagHeadline(flag, (id) => placeName("store_v1", id))).toBe(
      "Under the current scene geometry, the sightline is blocked by the chips shelf.",
    );
  });

  test("every headline and basis label is conditional, not a verdict on the witness", () => {
    for (const check of CHECKS) {
      expect(flagHeadline({ check, evidence: {} }, (id) => id)).not.toMatch(ABSOLUTE);
      expect(BASIS_LABELS[checkBasis(check)]).toMatch(/^Based on/);
    }
  });
});

describe("places", () => {
  test("uses a landmark label only on an exact position match", () => {
    expect(eventPlace("store_v1", { at: [1.5, 0, 3.5] })).toBe("chips aisle");
    expect(eventPlace("store_v1", { at: [7.2, 0, 2.5] })).toBe("(7.2, 2.5)");
    expect(eventPlace("store_v1", { from: [7.2, 0, 2.5], to: [1.5, 0, 0.4] })).toBe("(7.2, 2.5) → front door");
    expect(eventPlace("other", {})).toBe("no place recorded");
  });
});

describe("transcript", () => {
  test("fixture mode has the store transcript, live mode has none yet", () => {
    expect(transcriptFor("fixture", "store_v1")?.find((u) => u.id === "utt_6")?.text).toMatch(/looked up/);
    expect(transcriptFor("live", "store_v1")).toBeNull();
  });

  test("source and speaker labels", () => {
    expect(sourceLabel("utt_6")).toBe("Source 6");
    expect(sourceLabel("manual")).toBe("Source manual");
    expect(speakerLabel("witness")).toBe("Witness");
    expect(speakerLabel(undefined)).toBe("Witness statement");
  });
});
