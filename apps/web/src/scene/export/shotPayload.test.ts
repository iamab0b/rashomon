import { describe, expect, it } from "vitest";
import { fixtureGraphSource } from "../playback/graphSource";
import { buildShotPayload, isShotDisabled } from "./shotPayload";

describe("buildShotPayload", () => {
  it("reads fixture and scenario from the URL, the camera preset, and t rounded to 0.1", () => {
    expect(
      buildShotPayload({
        search: "?fixture=store&scenario=corrected&cam=witness_claimed",
        preset: "witness_claimed",
        following: false,
        t: 11.04,
      }),
    ).toEqual({ fixture: "store", scenario: "corrected", cam: "witness_claimed", t: 11 });
  });

  it("defaults the fixture, omits a missing scenario, and sends pov while following", () => {
    expect(buildShotPayload({ search: "", preset: "overview", following: true, t: 3.26 })).toEqual({
      fixture: "store",
      cam: "pov",
      t: 3.3,
    });
  });

  it("carries mode=live so the plugin can reject it", () => {
    expect(buildShotPayload({ search: "?mode=live", preset: "overview", following: false, t: 0 }).mode).toBe("live");
  });
});

describe("isShotDisabled", () => {
  it("is enabled for an unedited fixture, including the corrected scenario", () => {
    expect(isShotDisabled("", fixtureGraphSource("store"))).toBe(false);
    expect(isShotDisabled("?scenario=corrected", fixtureGraphSource("store", "corrected"))).toBe(false);
    expect(isShotDisabled("", null)).toBe(false);
  });

  it("is disabled in live mode and once the fixture has local patches", () => {
    const source = fixtureGraphSource("store");
    if (!source) throw new Error("store fixture source missing");

    expect(isShotDisabled("?mode=live", source)).toBe(true);
    source.apply([{ op: "retract_event", id: "e7", sources: ["utt_30"] }]);
    expect(isShotDisabled("", source)).toBe(true);
  });

  it("stays enabled when a rejected apply leaves the fixture untouched", () => {
    const source = fixtureGraphSource("store");
    if (!source) throw new Error("store fixture source missing");

    expect(() => source.apply([{ op: "update_event", id: "nope", changes: {}, sources: [] }])).toThrow();
    expect(isShotDisabled("", source)).toBe(false);
  });
});
