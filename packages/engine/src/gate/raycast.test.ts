import { describe, expect, test } from "vitest";
import { boxMesh } from "./testHelpers";
import { rayTriangle, segmentBlocked } from "./raycast";
import type { SceneGeom } from "./types";

// Unit square in the z = 0 plane, normal +z, split along the (0,0)-(1,1) diagonal.
const quad: SceneGeom = {
  meshes: [{ id: "quad", positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], indices: [0, 1, 2, 0, 2, 3] }],
};

describe("segmentBlocked", () => {
  test("hit: front face, at the right fraction", () => {
    const h = segmentBlocked([0.25, 0.5, 1], [0.25, 0.5, -1], quad)!;
    expect(h.meshId).toBe("quad");
    expect(h.t).toBeCloseTo(0.5);
    expect(h.point).toEqual([0.25, 0.5, 0]);
    expect(h.backface).toBe(false);
  });

  test("miss: beside the square, short of it, and parallel to it", () => {
    expect(segmentBlocked([2, 2, 1], [2, 2, -1], quad)).toBeNull();
    expect(segmentBlocked([0.5, 0.5, 2], [0.5, 0.5, 0.5], quad)).toBeNull();
    expect(segmentBlocked([-1, 0.5, 0], [2, 0.5, 0], quad)).toBeNull();
    expect(segmentBlocked([0.5, 0.5, 1], [0.5, 0.5, 1], quad)).toBeNull();
  });

  test("backface: hit from behind is still blocked and says so", () => {
    const h = segmentBlocked([0.25, 0.5, -1], [0.25, 0.5, 1], quad)!;
    expect(h).not.toBeNull();
    expect(h.backface).toBe(true);
  });

  test("edge: seam between triangles, outer edge and a vertex count; just outside does not", () => {
    expect(segmentBlocked([0.5, 0.5, 1], [0.5, 0.5, -1], quad)).not.toBeNull(); // shared diagonal
    expect(segmentBlocked([1, 0.5, 1], [1, 0.5, -1], quad)).not.toBeNull(); // outer edge
    expect(segmentBlocked([1, 1, 1], [1, 1, -1], quad)).not.toBeNull(); // vertex
    expect(segmentBlocked([1.001, 0.5, 1], [1.001, 0.5, -1], quad)).toBeNull();
  });

  test("returns the nearest hit and ignores a surface the target rests on", () => {
    const geom: SceneGeom = {
      meshes: [boxMesh("far", [4, 0, 0], [5, 1, 1]), boxMesh("near", [1, 0, 0], [2, 1, 1])],
    };
    const h = segmentBlocked([0, 0.5, 0.5], [10, 0.5, 0.5], geom)!;
    expect(h.meshId).toBe("near");
    expect(h.t).toBeCloseTo(0.1);
    // target exactly on the near face: not blocked by it
    expect(segmentBlocked([0, 0.5, 0.5], [1, 0.5, 0.5], geom)).toBeNull();
  });

  test("rayTriangle reports backface from winding", () => {
    const t = rayTriangle([0.2, 0.2, 1], [0, 0, -1], [0, 0, 0], [1, 0, 0], [0, 1, 0])!;
    expect(t.t).toBeCloseTo(1);
    expect(t.backface).toBe(false);
  });
});
