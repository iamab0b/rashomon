import type { ResolvedEvent, Vec3 } from "@rashomon/engine";
import { describe, expect, test } from "vitest";
import { buildEventPath, eventFraction, getPose, samplePath } from "./paths";

type PathEvent = Pick<ResolvedEvent, "path" | "reachable" | "tStart" | "tEnd" | "from" | "at" | "to">;

function movement(path: Vec3[], extra: Partial<PathEvent> = {}): PathEvent {
  return { path, reachable: true, tStart: 0, tEnd: 4, from: path[0], to: path[path.length - 1], ...extra };
}

const L_SHAPE: Vec3[] = [
  [0, 0, 0],
  [3, 0, 0],
  [3, 0, 1],
];

const E1_PATH: Vec3[] = [
  [1.5, 0, 0.4],
  [6.4, 0, 1.6],
  [7.2, 0, 2.5],
];

const SHELF_B = { min: [5.0, 0, 2.0], max: [6.0, 1.8, 5.0] } as const;

function closeTo(actual: Vec3 | undefined, expected: Vec3): void {
  expect(actual).toBeDefined();
  actual?.forEach((value, index) => expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 6));
}

describe("arc-length sampling", () => {
  test("equal time steps cover equal distances across segments of different length", () => {
    const event = movement(L_SHAPE);

    closeTo(getPose(event, 0)?.position, [0, 0, 0]);
    closeTo(getPose(event, 1)?.position, [1, 0, 0]);
    closeTo(getPose(event, 2)?.position, [2, 0, 0]);
    closeTo(getPose(event, 3)?.position, [3, 0, 0]);
    closeTo(getPose(event, 3.5)?.position, [3, 0, 0.5]);
    closeTo(getPose(event, 4)?.position, [3, 0, 1]);
  });

  test("the fraction is clamped to [0, 1] outside the event", () => {
    const event = movement(L_SHAPE);

    closeTo(getPose(event, -5)?.position, [0, 0, 0]);
    closeTo(getPose(event, 99)?.position, [3, 0, 1]);
    expect(eventFraction(event, 2)).toBe(0.5);
  });

  test("the tangent is the direction of the segment being walked", () => {
    const event = movement(L_SHAPE);

    closeTo(getPose(event, 1)?.tangent ?? undefined, [1, 0, 0]);
    closeTo(getPose(event, 3.5)?.tangent ?? undefined, [0, 0, 1]);
  });

  test("duplicate consecutive points do not create a zero-length segment", () => {
    const path = buildEventPath(movement([[0, 0, 0], [0, 0, 0], [2, 0, 0]]));

    expect(path?.curve.curves).toHaveLength(1);
    expect(path?.length).toBeCloseTo(2);
  });

  test("u = 1 never falls off the end of the path to null", () => {
    const path = buildEventPath(movement(E1_PATH));
    if (!path) throw new Error("no path");

    closeTo(samplePath(path, 1).position, [7.2, 0, 2.5]);
  });
});

describe("the e1 corner", () => {
  const path = buildEventPath(movement(E1_PATH));
  if (!path) throw new Error("no path");

  test("passes exactly through the resolver's corner waypoint", () => {
    const [cornerFraction] = path.cornerFractions;

    closeTo(samplePath(path, cornerFraction ?? Number.NaN).position, [6.4, 0, 1.6]);
  });

  test("stays on the polyline and never cuts into shelf_b's footprint", () => {
    for (let u = 0; u <= 1; u += 0.001) {
      const [x, , z] = samplePath(path, u).position;
      const insideShelf = x >= SHELF_B.min[0] && x <= SHELF_B.max[0] && z >= SHELF_B.min[2] && z <= SHELF_B.max[2];
      expect(insideShelf, `u=${u.toFixed(3)} at (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false);
    }
  });

  test("every sample lies on one of the two straight segments", () => {
    const distanceToSegment = ([px, , pz]: Vec3, [ax, , az]: Vec3, [bx, , bz]: Vec3): number => {
      const dx = bx - ax;
      const dz = bz - az;
      const k = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(px - (ax + k * dx), pz - (az + k * dz));
    };
    const [a, b, c] = E1_PATH as [Vec3, Vec3, Vec3];
    for (let u = 0; u <= 1; u += 0.01) {
      const point = samplePath(path, u).position;
      expect(Math.min(distanceToSegment(point, a, b), distanceToSegment(point, b, c))).toBeLessThan(1e-9);
    }
  });

  test("path length matches the resolver's pathLengthM", () => {
    expect(path.length).toBeCloseTo(6.248959, 5);
  });
});

describe("holding events", () => {
  test("an event with fewer than two path points holds at from", () => {
    const pose = getPose({ path: [[1, 0, 1]], reachable: true, tStart: 0, tEnd: 2, from: [1, 0, 1] }, 1);

    expect(pose).toEqual({ position: [1, 0, 1], tangent: null });
  });

  test("an unreachable movement holds at from instead of walking its path", () => {
    const pose = getPose(movement(E1_PATH, { reachable: false }), 2);

    expect(pose).toEqual({ position: [1.5, 0, 0.4], tangent: null });
  });

  test("an event with both from and at holds at from", () => {
    const pose = getPose({ path: [], reachable: true, tStart: 0, tEnd: 2, from: [1, 0, 1], at: [8, 0, 8] }, 1);

    expect(pose?.position).toEqual([1, 0, 1]);
  });

  test("an anchored event with no path holds at at", () => {
    const pose = getPose({ path: [], reachable: true, tStart: 0, tEnd: 2, at: [8.7, 0, 2.5] }, 1);

    expect(pose?.position).toEqual([8.7, 0, 2.5]);
  });

  test("an event with no anchor at all has no pose", () => {
    expect(getPose({ path: [], reachable: true, tStart: 0, tEnd: 2 }, 1)).toBeNull();
  });
});
