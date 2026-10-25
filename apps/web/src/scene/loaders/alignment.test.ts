import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from "three";
import { describe, expect, test } from "vitest";
import {
  alignPoint,
  alignToFloor,
  applyAlignment,
  CENTIMETRES,
  fitFloorNormal,
  IDENTITY_ALIGNMENT,
  isAlignment,
  transformPositions,
  type Vec3,
} from "./alignment";

const TILT = (25 * Math.PI) / 180;

function tiltedPlane(): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  const cells = 6;
  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j <= cells; j++) {
      const x = i * 0.2;
      const z = j * 0.2;
      positions.push(x, 2 + z * Math.sin(TILT), z * Math.cos(TILT));
    }
  }
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const a = i * (cells + 1) + j;
      const b = a + cells + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return { positions, indices };
}

const close = (a: readonly number[], b: readonly number[], digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

describe("floor alignment", () => {
  const plane = tiltedPlane();
  const clicked: Vec3 = [0.6, 2 + 0.6 * Math.sin(TILT), 0.6 * Math.cos(TILT)];
  const down: Vec3 = [0, -1, 0];

  test("the fitted normal of a tilted plane is its true normal, facing the viewer", () => {
    const normal = fitFloorNormal(plane.positions, plane.indices, 30, clicked, 0.3, down);
    close(normal, [0, Math.cos(TILT), -Math.sin(TILT)]);
    const flipped = fitFloorNormal(plane.positions, plane.indices, 30, clicked, 0.3, [0, 1, 0]);
    close(flipped, [0, -Math.cos(TILT), Math.sin(TILT)]);
  });

  test("a tilted plane becomes +Y and level, and the clicked point becomes the origin", () => {
    const normal = fitFloorNormal(plane.positions, plane.indices, 30, clicked, 0.3, down);
    const alignment = alignToFloor({ normal, point: clicked }, 1, "click");
    close(alignPoint(clicked, alignment), [0, 0, 0]);
    const aligned = transformPositions(plane.positions, alignment);
    for (let i = 1; i < aligned.length; i += 3) expect(aligned[i]).toBeCloseTo(0, 6);
    const up = new Vector3(...normal).applyQuaternion(new Group().quaternion.set(...alignment.rotation));
    close(up.toArray(), [0, 1, 0]);
  });

  test("scale turns centimetres into metres", () => {
    const pick = { normal: [0, 1, 0] as Vec3, point: [100, 0, 50] as Vec3 };
    const alignment = alignToFloor(pick, CENTIMETRES, "click");
    expect(alignment.scale).toBe(0.01);
    close(alignPoint([300, 0, 50], alignment), [2, 0, 0]);
    close(alignPoint([100, 160, 50], alignment), [0, 1.6, 0]);
  });

  test("the bounding-box front-left corner can be the origin instead, at floor level", () => {
    const pick = { normal: [0, 1, 0] as Vec3, point: [3, 0.5, 4] as Vec3 };
    const raw = [1, 0.5, 2, 6, 3, 9];
    const alignment = alignToFloor(pick, 1, "bbox", [raw]);
    close(alignPoint([1, 0.5, 2], alignment), [0, 0, 0]);
    close(alignPoint([3, 0.5, 4], alignment), [2, 0, 2]);
  });

  test("an upside-down floor is turned over", () => {
    const alignment = alignToFloor({ normal: [0, -1, 0], point: [0, 0, 0] }, 1, "click");
    close(alignPoint([0, 1, 0], alignment), [0, -1, 0]);
  });

  test("the stored alignment applied to a group matches the maths", () => {
    const alignment = alignToFloor({ normal: [0, Math.cos(TILT), -Math.sin(TILT)], point: [1, 2, 3] }, 0.5, "click");
    const root = new Group();
    const child = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
    child.position.set(4, 5, 6);
    root.add(child);
    applyAlignment(root, alignment);
    close(child.getWorldPosition(new Vector3()).toArray(), alignPoint([4, 5, 6], alignment));
    expect(isAlignment(alignment)).toBe(true);
    expect(isAlignment(IDENTITY_ALIGNMENT)).toBe(true);
    expect(isAlignment({ rotation: [0, 0, 0], translation: [0, 0, 0], scale: 1 })).toBe(false);
  });
});
