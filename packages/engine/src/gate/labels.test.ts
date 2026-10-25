import type { Landmark, SceneManifest } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { describe, expect, test } from "vitest";
import { resolve } from "../resolve/resolve";
import type { SceneGeom } from "../types";
import { gate } from "./index";
import { blockerPhrase } from "./labels";
import mainGate from "./robbery.main-gate.json";
import { sightlineFlags } from "./sightline";
import { ev, graphOf } from "./testHelpers";

const landmark = (id: string, label: string, min: [number, number], max: [number, number]): Landmark => ({
  id,
  label,
  aliases: [],
  position: [(min[0] + max[0]) / 2, 0, (min[1] + max[1]) / 2],
  bounds: { min: [min[0], 0, min[1]], max: [max[0], 1, max[1]] },
  kind: "window",
  occludes: false,
});

const scan = (landmarks: Landmark[]): SceneManifest => ({
  sceneId: "scan:abc",
  meshUrl: "idb:abc",
  up: "y",
  unitsPerMeter: 1,
  eyeHeight: 1.6,
  landmarks,
});

const wallTriangle: SceneGeom = {
  meshes: [{ id: "scan:wall", positions: [4, -1, -5, 4, 5, 5, 4, -1, 15], indices: [0, 1, 2] }],
};

describe("blockerPhrase", () => {
  test("a landmark blocker keeps its label", () => {
    expect(blockerPhrase("shelf_a", [0, 0, 0], storeScene)).toBe("the chips shelf");
  });

  test("a scanned mesh is named after the landmark nearest the hit point", () => {
    const manifest = scan([landmark("window", "front window", [3.5, 4], [4.5, 6]), landmark("door", "door", [0, 0], [1, 1])]);
    expect(blockerPhrase("scan:wall", [4, 1.6, 5], manifest)).toBe("the surface by the front window");
  });

  test("a scanned mesh with no landmarks is a surface", () => {
    expect(blockerPhrase("scan:wall", [4, 1.6, 5], scan([]))).toBe("a surface");
  });
});

describe("a sightline across a scanned wall", () => {
  const look = ev({ id: "l", actor: "a", action: "look", target: "b", at: [1, 0, 5], tStart: 0, tEnd: 2 });
  const seen = ev({ id: "s", actor: "b", at: [8, 0, 5], tStart: 0, tEnd: 2 });

  test("is blocked by the scan triangle and the question names the nearest landmark", () => {
    const manifest = scan([landmark("window", "front window", [3.5, 4], [4.5, 6])]);
    const flags = sightlineFlags(graphOf([look, seen]), manifest, wallTriangle);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.evidence).toMatchObject({ blocker: "scan:wall" });
    expect(flags[0]!.suggestedQuestion).toBe(
      "From the front window, the surface by the front window would be between you and the b. Where exactly were you standing when you saw that?",
    );
  });

  test("with no landmarks the question says a surface", () => {
    const flags = sightlineFlags(graphOf([look, seen]), scan([]), wallTriangle);
    expect(flags[0]!.suggestedQuestion).toContain("From the room, a surface would be between you and the b.");
  });
});

describe("the store fixture", () => {
  test("gates byte-identically to main with no meshes", () => {
    const verdict = gate(resolve(robberyGraph, storeScene), storeScene, { meshes: [] });
    expect(JSON.stringify(verdict)).toBe(JSON.stringify(mainGate));
  });
});
