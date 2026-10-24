import { describe, expect, test } from "vitest";
import type { Flag } from "../scene";
import { BASIS_LABELS, checkBasis, flagHeadline } from "./flagCopy";
import { robberyGraph } from "@rashomon/schema/fixtures";
import { anchorsFor, eventCoordinates, eventPlace, placeName } from "./places";
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
  test("names places from the event's landmark anchors, never from coordinates", () => {
    expect(eventPlace("store_v1", "stand", { at: { kind: "at", landmark: "behind_counter" } })).toBe("Behind the counter");
    expect(eventPlace("store_v1", "stand", { at: { kind: "at", landmark: "aisle_chips" } })).toBe("At chips aisle");
    expect(eventPlace("store_v1", "speak", { at: { kind: "near", landmark: "counter", radiusM: 0.6 } })).toBe("Near counter");
    expect(eventPlace("store_v1", "look", { at: { kind: "at", landmark: "aisle_chips" } })).toBe("From chips aisle");
    expect(
      eventPlace("store_v1", "walk", {
        from: { kind: "at", landmark: "front_door" },
        to: { kind: "near", landmark: "counter", radiusM: 0.6 },
      }),
    ).toBe("Front door → near counter");
    expect(eventPlace("store_v1", "stand", { at: { kind: "xyz", position: [7.2, 0, 2.5] } })).toBeNull();
    expect(eventPlace("store_v1", "stand", null)).toBeNull();
  });

  test("anchors come from the current graph and only for the same event", () => {
    expect(anchorsFor(robberyGraph, { id: "e2", actor: "clerk", action: "stand" })?.at).toEqual({
      kind: "at",
      landmark: "behind_counter",
    });
    expect(anchorsFor(robberyGraph, { id: "e2", actor: "suspect", action: "stand" })).toBeNull();
    expect(anchorsFor(null, { id: "e2", actor: "clerk", action: "stand" })).toBeNull();
    const dragged = { events: robberyGraph.events.map((e) => (e.id === "e5" ? { ...e, at: { kind: "at" as const, landmark: "front_window" } } : e)) };
    expect(eventPlace("store_v1", "look", anchorsFor(dragged, { id: "e5", actor: "witness", action: "look" }))).toBe("From front window");
  });

  test("coordinates are kept as text for tooltips", () => {
    expect(eventCoordinates({ at: [7.2, 0, 2.5] })).toBe("(7.2, 2.5)");
    expect(eventCoordinates({ from: [7.2, 0, 2.5], to: [1.5, 0, 0.4] })).toBe("(7.2, 2.5) → (1.5, 0.4)");
    expect(eventCoordinates({})).toBeNull();
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
