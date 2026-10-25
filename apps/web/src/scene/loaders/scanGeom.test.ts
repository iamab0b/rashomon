import { describe, expect, test } from "vitest";
import { boxNode, buildGlb, gridNode } from "../testing/testGlb";
import { alignToFloor, boundsOf, CENTIMETRES, IDENTITY_ALIGNMENT } from "./alignment";
import { parseGlb } from "./scan";
import { extractScanGeom, MAX_GATE_TRIANGLES, simplifyGeom, triangleCount } from "./scanGeom";

describe("scan geometry for the gate", () => {
  test("two boxes in a centimetre GLB give 24 triangles in metres with stable ids", async () => {
    const raw = await parseGlb(
      await buildGlb([
        boxNode("shelf", [0, 0, 0], [100, 180, 40]),
        { ...boxNode("crate", [0, 0, 0], [50, 50, 50]), translation: [300, 0, 200] },
      ]),
    );
    const alignment = alignToFloor({ normal: [0, 1, 0], point: [0, 0, 0] }, CENTIMETRES, "click");
    const geom = extractScanGeom(raw, alignment);
    expect(geom.meshes.map((mesh) => mesh.id)).toEqual(["scan:shelf", "scan:crate"]);
    expect(triangleCount(geom)).toBe(24);
    expect(boundsOf([geom.meshes[0]!.positions])).toEqual({ min: [0, 0, 0], max: [1, 1.8, 0.4] });
    const crate = boundsOf([geom.meshes[1]!.positions])!;
    crate.min.forEach((v, i) => expect(v).toBeCloseTo([3, 0, 2][i]!, 6));
    crate.max.forEach((v, i) => expect(v).toBeCloseTo([3.5, 0.5, 2.5][i]!, 6));
    for (const mesh of geom.meshes) {
      expect(mesh.indices.every((i) => Number.isInteger(i) && i >= 0 && 3 * i < mesh.positions.length)).toBe(true);
    }
  });

  test("dressing meshes and meshes marked collision false are skipped", async () => {
    const raw = await parseGlb(
      await buildGlb([
        boxNode("wall", [0, 0, 0], [1, 1, 1]),
        boxNode("dress_plant", [2, 0, 0], [3, 1, 1]),
        { ...boxNode("sign", [4, 0, 0], [5, 1, 1]), extras: { collision: false } },
      ]),
    );
    const geom = extractScanGeom(raw, IDENTITY_ALIGNMENT);
    expect(geom.meshes.map((mesh) => mesh.id)).toEqual(["scan:wall"]);
  });

  test("vertices closer than 1 cm merge and triangles under 1 cm² are dropped", () => {
    const geom = simplifyGeom([
      {
        id: "scan:a",
        positions: [0, 0, 0, 1, 0, 0, 0, 0, 1, 1.004, 0, 0, 0, 0, 0.001, 0.005, 0, 0.005, 0.009, 0, 0],
        indices: [0, 1, 2, 3, 2, 4, 4, 5, 6],
      },
    ]);
    expect(geom.meshes[0]!.positions.length).toBe(9);
    expect(triangleCount(geom)).toBe(2);
  });

  test("an unaligned scan far from the origin keeps every triangle", async () => {
    const raw = await parseGlb(await buildGlb([{ ...gridNode("floor", 900, 30), translation: [5000, -2000, 120000] }]));
    expect(triangleCount(extractScanGeom(raw, IDENTITY_ALIGNMENT))).toBe(30 * 30 * 2);
  });

  test("a dense scan is decimated under the triangle cap", async () => {
    const raw = await parseGlb(await buildGlb([gridNode("floor", 10, 300), gridNode("ceiling", 10, 300, 3)]));
    const before = 2 * 300 * 300 * 2;
    expect(before).toBeGreaterThan(MAX_GATE_TRIANGLES);
    const geom = extractScanGeom(raw, IDENTITY_ALIGNMENT);
    expect(triangleCount(geom)).toBeLessThanOrEqual(MAX_GATE_TRIANGLES);
    expect(triangleCount(geom)).toBeGreaterThan(MAX_GATE_TRIANGLES / 4);
    const bounds = boundsOf(geom.meshes.map((mesh) => mesh.positions))!;
    bounds.min.forEach((v, i) => expect(Math.abs(v - [0, 0, 0][i]!)).toBeLessThan(0.05));
    bounds.max.forEach((v, i) => expect(Math.abs(v - [10, 3, 10][i]!)).toBeLessThan(0.05));
    const small = extractScanGeom(raw, IDENTITY_ALIGNMENT, 1000);
    expect(triangleCount(small)).toBeLessThanOrEqual(1000);
  });
});
