import { storeScene } from "@rashomon/schema/fixtures";
import type { SceneManifest } from "@rashomon/schema";
import { describe, expect, test } from "vitest";
import { dressingPlan, dressingUrls, type DressingPlacement } from "./dressingPlan";

type Landmark = SceneManifest["landmarks"][number];

function landmark(id: string): Landmark {
  const found = storeScene.landmarks.find((entry) => entry.id === id);
  if (!found) throw new Error(`fixture has no landmark ${id}`);
  return found;
}

function inside(placement: DressingPlacement, target: Landmark): boolean {
  const { min, max } = target.bounds;
  const [x, y, z] = placement.position;
  return x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1] && z >= min[2] && z <= max[2];
}

const plan = dressingPlan(storeScene);
const unitsOf = (id: string) => plan.filter((placement) => placement.landmarkId === id && placement.role === "unit");

describe("dressingPlan", () => {
  test("places at least one unit on every shelf, the counter, the cooler and each door", () => {
    for (const id of ["shelf_a", "shelf_b", "counter", "cooler", "front_door", "back_door"]) {
      expect(unitsOf(id).length, id).toBeGreaterThanOrEqual(1);
    }
  });

  test("keeps every placement inside the bounds of its landmark", () => {
    for (const placement of plan) {
      expect(inside(placement, landmark(placement.landmarkId)), `${placement.url} on ${placement.landmarkId}`).toBe(true);
    }
  });

  test("puts nothing on the open floor of the aisles", () => {
    for (const aisle of [landmark("aisle_chips"), landmark("aisle_drinks")]) {
      expect(plan.filter((placement) => inside(placement, aisle))).toEqual([]);
    }
  });

  test("repeats shelf units along the long axis with cells that tile the box", () => {
    const shelf = landmark("shelf_a");
    const cells = unitsOf("shelf_a");
    expect(cells.length).toBeGreaterThan(1);
    const lengths = cells.map((cell) => (cell.fit.kind === "box" ? cell.fit.size[2] : 0));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const gaps = cells.length - 1;
    expect(total + gaps * 0.05).toBeCloseTo(shelf.bounds.max[2] - shelf.bounds.min[2], 6);
    cells.forEach((cell) => {
      expect(cell.fit.kind === "box" ? cell.fit.size[1] : 0).toBeCloseTo(1.8, 6);
      expect(cell.fit.kind === "box" ? cell.fit.size[0] : 0).toBeCloseTo(1, 6);
    });
  });

  test("places one cooler per unit width along the cooler box", () => {
    const coolers = unitsOf("cooler");
    expect(coolers.length).toBe(9);
    const xs = coolers.map((cooler) => cooler.position[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    coolers.forEach((cooler) => expect(cooler.fit.kind === "box" ? cooler.fit.size[1] : 0).toBeCloseTo(2, 6));
  });

  test("repeats the counter cabinet along the counter box", () => {
    expect(unitsOf("counter")).toHaveLength(3);
  });

  test("seats each door frame flush to its wall in a single thin cell", () => {
    const front = unitsOf("front_door");
    const back = unitsOf("back_door");
    expect(front).toHaveLength(1);
    expect(back).toHaveLength(1);
    expect(front[0]?.position[2]).toBeCloseTo(0.1, 6);
    expect(back[0]?.position[2]).toBeCloseTo(6.9, 6);
    const fit = front[0]?.fit;
    expect(fit?.kind).toBe("box");
    const size = fit?.kind === "box" ? fit.size : [];
    [1.2, 2.1, 0.2].forEach((expected, axis) => expect(size[axis]).toBeCloseTo(expected, 6));
  });

  test("faces shelves, counter, cooler and doors toward the middle of the store", () => {
    expect(unitsOf("shelf_a")[0]?.rotationY).toBeCloseTo(Math.PI / 2, 6);
    expect(unitsOf("shelf_b")[0]?.rotationY).toBeCloseTo(-Math.PI / 2, 6);
    expect(unitsOf("counter")[0]?.rotationY).toBeCloseTo(-Math.PI / 2, 6);
    expect(unitsOf("cooler")[0]?.rotationY).toBeCloseTo(Math.PI, 6);
    expect(unitsOf("front_door")[0]?.rotationY).toBe(0);
  });

  test("scatters between six and ten items on shelf tops", () => {
    const items = plan.filter((placement) => placement.role === "item");
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.length).toBeLessThanOrEqual(10);
    for (const item of items) {
      expect(item.position[1]).toBe(landmark(item.landmarkId).bounds.max[1]);
      expect(item.landmarkId).toMatch(/^shelf_/);
    }
  });

  test("is reproducible", () => {
    expect(dressingPlan(storeScene)).toEqual(dressingPlan(storeScene));
  });

  test("returns an empty plan for a manifest without these landmarks", () => {
    expect(dressingPlan({ ...storeScene, landmarks: [] })).toEqual([]);
    const zones = storeScene.landmarks.filter((entry) => entry.kind === "zone");
    expect(dressingPlan({ ...storeScene, landmarks: zones })).toEqual([]);
  });

  test("lists each model url once", () => {
    const urls = dressingUrls(plan);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain("/dressing/shelf_unit.glb");
    expect(urls).toContain("/dressing/item_01.glb");
  });
});
