import { describe, expect, test } from "vitest";
import { candidatesAt, findCandidates, MAX_CANDIDATES, VOXEL_M } from "./candidates";
import { fitFloor, NO_FLOOR } from "./floor";
import { boxMesh, floorMesh, ROOM_BOXES, shuffledTriangles, syntheticRoom } from "./testing/syntheticRoom";

describe("floor plane", () => {
  test("the synthetic room's floor is found within 2 cm", () => {
    for (const floorY of [0, 0.37, -1.2]) {
      const fit = fitFloor(syntheticRoom(floorY));
      expect(fit.ok).toBe(true);
      if (fit.ok) {
        expect(Math.abs(fit.y0 - floorY)).toBeLessThan(0.02);
        expect(fit.inliers).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("a room with no floor is refused with a clear message", () => {
    const fit = fitFloor(syntheticRoom(0, false));
    expect(fit.ok).toBe(false);
    if (!fit.ok) expect(fit.error).toMatch(/No floor found/);
    expect(fitFloor({ meshes: [boxMesh("wall", [0, 0, 0], [0.1, 2.4, 4])] })).toEqual({ ok: false, error: expect.stringMatching(/No floor/) });
    expect(fitFloor({ meshes: [] })).toEqual({ ok: false, error: NO_FLOOR });
    expect(findCandidates(syntheticRoom(0, false)).ok).toBe(false);
  });
});

describe("candidates", () => {
  test("four candidates come out with bounds within one voxel", () => {
    const result = findCandidates(syntheticRoom());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    const expected = [ROOM_BOXES.counter, ROOM_BOXES.shelf_a, ROOM_BOXES.shelf_b, ROOM_BOXES.wall];
    result.candidates.forEach((candidate, i) => {
      const box = expected[i]!;
      for (let axis = 0; axis < 3; axis++) {
        expect(Math.abs(candidate.bounds.min[axis]! - box.min[axis]!)).toBeLessThanOrEqual(VOXEL_M);
        expect(Math.abs(candidate.bounds.max[axis]! - box.max[axis]!)).toBeLessThanOrEqual(VOXEL_M);
      }
      expect(candidate.bounds.min[1]).toBeCloseTo(result.y0, 6);
      expect(candidate.position[1]).toBe(candidate.bounds.min[1]);
      expect(candidate.position[0]).toBeCloseTo((candidate.bounds.min[0] + candidate.bounds.max[0]) / 2, 3);
      expect(candidate.position[2]).toBeCloseTo((candidate.bounds.min[2] + candidate.bounds.max[2]) / 2, 3);
    });
  });

  test("the ids are the same across runs and after shuffling the triangle order", () => {
    const first = findCandidates(syntheticRoom());
    const second = findCandidates(syntheticRoom());
    const shuffled = findCandidates(shuffledTriangles(syntheticRoom(), 7));
    const other = findCandidates(shuffledTriangles(syntheticRoom(), 99));
    expect(second).toEqual(first);
    expect(shuffled).toEqual(first);
    expect(other).toEqual(first);
  });

  test("more than 40 clusters are capped to the 40 largest and renumbered in order", () => {
    const pillars = [];
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 9; j++) {
        const x = 0.3 + 0.75 * i;
        const z = 0.3 + 0.75 * j;
        const height = (i * 9 + j) % 2 === 0 ? 2 : 0.8;
        pillars.push(boxMesh(`p${i}_${j}`, [x, 0, z], [x + 0.2, height, z + 0.2]));
      }
    }
    const geom = { meshes: [floorMesh("floor", [0, 0], [9.5, 7]), ...pillars] };
    const all = candidatesAt(geom, 0);
    expect(all).toHaveLength(MAX_CANDIDATES);
    expect(all.map((c) => c.id)).toEqual(Array.from({ length: MAX_CANDIDATES }, (_, i) => `c${i + 1}`));
    expect(all.every((c) => c.bounds.max[1] > 1.5)).toBe(true);
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1]!.bounds.min;
      const b = all[i]!.bounds.min;
      expect(a[0] < b[0] || (a[0] === b[0] && a[2] <= b[2])).toBe(true);
    }
  });

  test("clusters under four voxels are dropped", () => {
    const geom = { meshes: [floorMesh("floor", [0, 0], [6, 4]), boxMesh("tiny", [1.05, 0, 1.05], [1.2, 0.2, 1.2])] };
    expect(candidatesAt(geom, 0)).toEqual([]);
  });
});
