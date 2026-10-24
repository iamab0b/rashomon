import { storeScene } from "@rashomon/schema/fixtures";
import { Box3, Vector3, type Object3D } from "three";
import { describe, expect, test } from "vitest";
import { assembleDressing } from "./assemble";
import { dressingPlan, dressingUrls } from "./dressingPlan";
import { boxModel } from "./testModels";

const plan = dressingPlan(storeScene);

function modelsFor(urls: readonly string[]): Map<string, Object3D> {
  return new Map(urls.map((url) => [url, boxModel(0.4, 0.88, 0.25, "corner")]));
}

function worldBox(object: Object3D): Box3 {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
}

describe("assembleDressing", () => {
  test("marks every dressing object as non-colliding", () => {
    const { group } = assembleDressing(plan, modelsFor(dressingUrls(plan)));
    const names: string[] = [];
    group.traverse((object) => {
      names.push(object.name);
      expect(object.userData.collision, object.name).toBe(false);
      expect(object.name.startsWith("dress_"), object.name).toBe(true);
    });
    expect(names.length).toBeGreaterThan(plan.length);
  });

  test("fits a corner-origin model to the cell it fills, centred on the cell with its base on the floor", () => {
    const { group } = assembleDressing(plan, modelsFor(dressingUrls(plan)));
    const first = plan.findIndex((placement) => placement.landmarkId === "shelf_a" && placement.role === "unit");
    const placement = plan[first];
    const slot = group.children.find((child) => child.name.includes(`shelf_a_unit_${first}`));
    if (!placement || !slot || placement.fit.kind !== "box") throw new Error("shelf_a cell missing");
    const box = worldBox(slot);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    expect(size.x).toBeCloseTo(placement.fit.size[0], 5);
    expect(size.y).toBeCloseTo(placement.fit.size[1], 5);
    expect(size.z).toBeCloseTo(placement.fit.size[2], 5);
    expect(box.min.y).toBeCloseTo(placement.position[1], 5);
    expect(center.x).toBeCloseTo(placement.position[0], 5);
    expect(center.z).toBeCloseTo(placement.position[2], 5);
  });

  test("scales small items by their longest side", () => {
    const { group } = assembleDressing(plan, modelsFor(dressingUrls(plan)));
    const index = plan.findIndex((placement) => placement.role === "item");
    const slot = group.children.find((child) => child.name.includes(`_item_${index}`));
    if (!slot) throw new Error("item missing");
    const size = worldBox(slot).getSize(new Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.1);
    expect(Math.max(size.x, size.y, size.z)).toBeLessThanOrEqual(0.2 * Math.SQRT2 + 1e-6);
  });

  test("reports a landmark as covered only when its unit model loaded", () => {
    const only = new Map([["/dressing/cooler.glb", boxModel(0.5, 0.9, 0.4, "corner")]]);
    const { group, coveredLandmarks } = assembleDressing(plan, only);
    expect([...coveredLandmarks]).toEqual(["cooler"]);
    expect(group.children).toHaveLength(plan.filter((placement) => placement.url === "/dressing/cooler.glb").length);
  });

  test("does not cover a shelf when only its items loaded", () => {
    const only = new Map([["/dressing/item_01.glb", boxModel(0.2, 0.3, 0.2, "center")]]);
    const { coveredLandmarks, group } = assembleDressing(plan, only);
    expect(coveredLandmarks.size).toBe(0);
    expect(group.children).toHaveLength(1);
  });

  test("builds an empty group when no model exists", () => {
    const { group, coveredLandmarks } = assembleDressing(plan, new Map());
    expect(group.children).toHaveLength(0);
    expect(coveredLandmarks.size).toBe(0);
  });
});
