import type { Patch } from "@rashomon/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSceneStore } from "../store";
import { ENGINE_OVERRIDE_PR, engineHonorsOverride } from "./engineOverrideProbe";
import { fixtureGraphSource, robberyCorrectionPatches, type GraphSource } from "./graphSource";
import { useGraphActions } from "./useGraphActions";

const OVERRIDE_E5: Patch = { op: "override", id: "e5", reason: "witness later confirmed the view", by: "investigator" };
const overrideHonored = engineHonorsOverride();

function mountStoreFixture() {
  const source = fixtureGraphSource("store");
  if (!source) throw new Error("store fixture source missing");
  useSceneStore.getState().setGraphSource(source);
  return source;
}

afterEach(() => {
  useSceneStore.getState().setGraphSource(null);
});

describe("useGraphActions", () => {
  it("applyPatches with the correction makes every event plausible through the mounted fixture source", () => {
    const source = mountStoreFixture();
    const listener = vi.fn();
    source.subscribe(listener);

    useGraphActions().applyPatches(robberyCorrectionPatches());

    const events = source.getSnapshot().resolved?.events ?? [];
    expect(events).toHaveLength(11);
    for (const event of events) expect(event.status, event.id).toBe("plausible");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it.skipIf(!overrideHonored)(
    overrideHonored
      ? "an override patch on e5 makes e5 overridden"
      : `an override patch on e5 makes e5 overridden (skipped: waits on ${ENGINE_OVERRIDE_PR} merging to main)`,
    () => {
      const source = mountStoreFixture();

      useGraphActions().applyPatches([OVERRIDE_E5]);

      expect(source.getSnapshot().statuses.e5).toBe("overridden");
    },
  );

  it("passes the rule violation through so the modal can show it", () => {
    mountStoreFixture();

    expect(() => useGraphActions().applyPatches([{ ...OVERRIDE_E5, reason: "too short" }])).toThrow(
      /reason of at least 10 characters/,
    );
  });

  it("throws when no source is mounted or the source cannot patch locally", () => {
    expect(() => useGraphActions().applyPatches([OVERRIDE_E5])).toThrow(/no graph source is mounted/);

    const live: GraphSource = {
      kind: "live",
      getSnapshot: () => ({ resolved: null, statuses: {} }),
      subscribe: () => () => undefined,
    };
    useSceneStore.getState().setGraphSource(live);
    expect(() => useGraphActions().applyPatches([OVERRIDE_E5])).toThrow(/live graph source does not apply patches/);
  });

  it("returns the same actions object every call", () => {
    expect(useGraphActions()).toBe(useGraphActions());
  });
});
