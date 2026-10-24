import type { Patch } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import { anchorDropPatch } from "../editing/anchorDrop";
import { callHook } from "../testing/hookHost";
import { pushSource, useGraph } from "./useGraph";
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

    const readOnly: GraphSource = {
      kind: "live",
      getSnapshot: () => ({ resolved: null, statuses: {} }),
      subscribe: () => () => undefined,
    };
    useSceneStore.getState().setGraphSource(readOnly);
    expect(() => useGraphActions().applyPatches([OVERRIDE_E5])).toThrow(/live graph source cannot apply patches/);
  });

  it("the e5 drop at window_front, as one patch, makes every event plausible and leaves only the soft contradiction on e3 and e5", () => {
    const source = mountStoreFixture();
    const e5 = robberyGraph.events.find((event) => event.id === "e5");
    const window = storeScene.landmarks.find((l) => l.id === "window_front")!;
    const patch = anchorDropPatch(e5!, "at", [window.position[0], 0, window.position[2]], storeScene);
    expect(patch).not.toBeNull();
    expect(source.getSnapshot().statuses.e5).toBe("implausible");

    useGraphActions().applyPatches([patch!]);

    const { resolved, statuses } = source.getSnapshot();
    expect(resolved?.events).toHaveLength(10);
    for (const event of resolved?.events ?? []) {
      expect(statuses[event.id], event.id).toBe("plausible");
      const expected = event.id === "e3" || event.id === "e5" ? ["contradiction"] : [];
      expect(event.flags.map((flag) => `${flag.check}:${flag.severity}`), event.id).toEqual(
        expected.map((check) => `${check}:soft`),
      );
    }
  });

  it("after the e5 drop, useGraph exposes the graph the snapshot was resolved from with e5's new anchor", () => {
    const source = mountStoreFixture();
    source.subscribe(() => pushSource(source));
    pushSource(source);
    expect(callHook(() => useGraph()).graph?.events.find((event) => event.id === "e5")?.at).toEqual({
      kind: "at",
      landmark: "aisle_chips",
    });
    const e5 = robberyGraph.events.find((event) => event.id === "e5")!;
    const window = storeScene.landmarks.find((l) => l.id === "window_front")!;
    const patch = anchorDropPatch(e5, "at", [window.position[0], 0, window.position[2]], storeScene);

    useGraphActions().applyPatches([patch!]);

    const view = callHook(() => useGraph());
    expect(view.graph?.events.find((event) => event.id === "e5")?.at).toEqual({ kind: "at", landmark: "window_front" });
    expect(view.graph?.events).toHaveLength(10);
    expect(view.resolved?.events.find((event) => event.id === "e5")?.status).toBe("plausible");
  });

  it("useGraph's graph is null when nothing is mounted", () => {
    useSceneStore.getState().setGraph({ resolved: null, statuses: {} });
    expect(callHook(() => useGraph()).graph).toBeNull();
  });

  it("the e1 drop on back_door puts the first point of e1's path within 0.5 m of back_door", () => {
    const source = mountStoreFixture();
    const e1 = robberyGraph.events.find((event) => event.id === "e1");
    const door = storeScene.landmarks.find((l) => l.id === "back_door")!;
    const patch = anchorDropPatch(e1!, "from", [door.bounds.min[0] + 0.5, 0, door.bounds.min[2] + 0.4], storeScene);
    expect(patch).toMatchObject({ changes: { from: { kind: "at", landmark: "back_door" } } });

    useGraphActions().applyPatches([patch!]);

    const moved = source.getSnapshot().resolved?.events.find((event) => event.id === "e1");
    const first = moved?.path[0];
    expect(first).toBeDefined();
    expect(Math.hypot(first![0] - door.position[0], first![2] - door.position[2])).toBeLessThan(0.5);
  });

  it("returns the same actions object every call", () => {
    expect(useGraphActions()).toBe(useGraphActions());
  });
});
