import type { Event, SceneManifest } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { describe, expect, it } from "vitest";
import { DEFAULT_EDITOR, SNAP_RADIUS_M, anchorDropPatch, dropFieldOf } from "./anchorDrop";

const event = (id: string): Event => {
  const found = robberyGraph.events.find((e) => e.id === id);
  if (!found) throw new Error(`fixture has no ${id}`);
  return found;
};
const position = (id: string): [number, number, number] => {
  const landmark = storeScene.landmarks.find((l) => l.id === id);
  if (!landmark) throw new Error(`fixture has no ${id}`);
  return [landmark.position[0], 0, landmark.position[2]];
};

describe("anchorDropPatch", () => {
  it("a drop at window_front's position on e5 is exactly the one patch that clears the sightline", () => {
    expect(anchorDropPatch(event("e5"), "at", position("window_front"), storeScene)).toEqual({
      op: "update_event",
      id: "e5",
      changes: { at: { kind: "at", landmark: "window_front" } },
      sources: ["investigator:local"],
    });
  });

  it("a drop inside back_door's bounds on e1's from gives an at anchor on back_door", () => {
    expect(anchorDropPatch(event("e1"), "from", [8.5, 0, 6.5], storeScene)).toEqual({
      op: "update_event",
      id: "e1",
      changes: { from: { kind: "at", landmark: "back_door" } },
      sources: [DEFAULT_EDITOR],
    });
  });

  it("a drop on open floor gives xyz on the floor, clamped to the interior", () => {
    const open = anchorDropPatch(event("e5"), "at", [6.5, 1.7, 5.5], storeScene, "investigator:u9");
    expect(open).toEqual({
      op: "update_event",
      id: "e5",
      changes: { at: { kind: "xyz", position: [6.5, 0, 5.5] } },
      sources: ["investigator:u9"],
    });
    const outside = anchorDropPatch(event("e5"), "at", [12, 0, -3], storeScene);
    expect(outside).toMatchObject({ changes: { at: { kind: "xyz", position: [9, 0, 0] } } });
  });

  it("a drop back on aisle_chips for e5 gives null", () => {
    expect(anchorDropPatch(event("e5"), "at", position("aisle_chips"), storeScene)).toBeNull();
    expect(anchorDropPatch(event("e5"), "at", [1.0, 0, 2.0], storeScene)).toBeNull();
  });

  it("a point outside every box but within the radius of a landmark's position snaps to it, and not beyond", () => {
    expect(anchorDropPatch(event("e5"), "at", [1.5, 0, 0.4 + SNAP_RADIUS_M - 0.05], storeScene)).toMatchObject({
      changes: { at: { kind: "at", landmark: "front_door" } },
    });
    expect(anchorDropPatch(event("e5"), "at", [1.5, 0, 0.4 + SNAP_RADIUS_M + 0.05], storeScene)).toMatchObject({
      changes: { at: { kind: "xyz", position: [1.5, 0, 0.4 + SNAP_RADIUS_M + 0.05] } },
    });
  });

  it("only zones and doors are snap targets, and the nearest one wins", () => {
    const furnitureOnly: SceneManifest = {
      ...storeScene,
      landmarks: storeScene.landmarks.filter((l) => l.kind !== "zone" && l.kind !== "door"),
    };
    expect(anchorDropPatch(event("e5"), "at", position("window_front"), furnitureOnly)).toMatchObject({
      changes: { at: { kind: "xyz" } },
    });
    const overlap = anchorDropPatch(event("e5"), "at", [1.5, 0, 0.3], storeScene);
    expect(overlap).toMatchObject({ changes: { at: { kind: "at", landmark: "front_door" } } });
  });

  it("a manifest with no interior leaves xyz unclamped", () => {
    const { interior: _interior, ...rest } = storeScene;
    const patch = anchorDropPatch(event("e5"), "at", [12, 0, -3], rest);
    expect(patch).toMatchObject({ changes: { at: { kind: "xyz", position: [12, 0, -3] } } });
  });

  it("walks and runs drag their from; everything else drags its at", () => {
    expect(dropFieldOf({ action: "walk" })).toBe("from");
    expect(dropFieldOf({ action: "run" })).toBe("from");
    for (const action of ["stand", "look", "speak", "crouch", "shove", "fall", "pick_up"] as const)
      expect(dropFieldOf({ action })).toBe("at");
  });
});
