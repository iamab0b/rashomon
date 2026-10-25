import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  ceilingCutActive,
  ceilingCutPlane,
  createCeilingCut,
  scanFloorY,
} from "./scanCeilingCut";

function meshWith(material: MeshBasicMaterial): Mesh {
  return new Mesh(new BoxGeometry(), material);
}

describe("ceilingCutActive", () => {
  it("is active only above floor plus 2.3 m", () => {
    expect(ceilingCutActive(2.4, 0)).toBe(true);
    expect(ceilingCutActive(2.2, 0)).toBe(false);
    expect(ceilingCutActive(3.4, 1.0)).toBe(true);
  });
});

describe("ceilingCutPlane", () => {
  it("keeps points below the cut and clips points above", () => {
    const plane = ceilingCutPlane(0);
    expect(plane.distanceToPoint(new Vector3(0, 2.0, 0))).toBeGreaterThan(0);
    expect(plane.distanceToPoint(new Vector3(0, 2.5, 0))).toBeLessThan(0);
  });

  it("follows the floor height", () => {
    const plane = ceilingCutPlane(1);
    expect(plane.distanceToPoint(new Vector3(0, 3.0, 0))).toBeGreaterThan(0);
    expect(plane.distanceToPoint(new Vector3(0, 3.5, 0))).toBeLessThan(0);
  });
});

describe("scanFloorY", () => {
  const geom = { meshes: [{ positions: new Float32Array([0, 0.4, 0, 1, 3, 1, 2, 1, 2]), indices: new Uint32Array([0, 1, 2]) }] };

  it("is zero when aligned", () => {
    expect(scanFloorY(true, geom as never)).toBe(0);
  });

  it("uses the bounds min y when not aligned", () => {
    expect(scanFloorY(false, geom as never)).toBeCloseTo(0.4);
  });
});

describe("createCeilingCut", () => {
  it("sets and clears clippingPlanes on scan materials only", () => {
    const scanMaterial = new MeshBasicMaterial();
    const otherMaterial = new MeshBasicMaterial();
    const scan = new Group();
    scan.add(meshWith(scanMaterial));
    const cut = createCeilingCut(scan, 0);
    const world = new Group();
    world.add(scan, meshWith(otherMaterial));

    cut.set(true);
    expect(scanMaterial.clippingPlanes).toHaveLength(1);
    expect(otherMaterial.clippingPlanes).toBeNull();

    cut.set(false);
    expect(scanMaterial.clippingPlanes).toEqual([]);
    expect(otherMaterial.clippingPlanes).toBeNull();
  });

  it("does not reassign clippingPlanes when the state is unchanged", () => {
    const material = new MeshBasicMaterial();
    const scan = new Group();
    scan.add(meshWith(material));
    const cut = createCeilingCut(scan, 0);

    expect(cut.set(true)).toBe(true);
    const planes = material.clippingPlanes;
    expect(cut.set(true)).toBe(false);
    expect(material.clippingPlanes).toBe(planes);

    expect(cut.set(false)).toBe(true);
    const cleared = material.clippingPlanes;
    expect(cut.set(false)).toBe(false);
    expect(material.clippingPlanes).toBe(cleared);
  });
});
