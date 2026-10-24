import rawProps from "@rashomon/props";
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { describe, expect, test, vi } from "vitest";
import { getPropType } from "./library";
import { loadPropModel } from "./loadPropModel";
import { seatPropModel } from "./seatModel";
import { parseLibrary } from "./types";

const library = parseLibrary(rawProps);

function entryOf(type: string) {
  const entry = getPropType(library, type);
  if (!entry) throw new Error(`no prop ${type}`);
  return entry;
}

function model(width: number, height: number, depth: number, offset: [number, number, number]): Group {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(...offset);
  const root = new Group();
  root.add(new Mesh(geometry, new MeshBasicMaterial()));
  return root;
}

function boundsOf(group: Group): { box: Box3; size: Vector3 } {
  group.updateMatrixWorld(true);
  const box = new Box3().setFromObject(group);
  return { box, size: box.getSize(new Vector3()) };
}

describe("seatPropModel", () => {
  test("lays a tall bat flat along z, scaled to its real length, resting on the base of its box", () => {
    const entry = entryOf("bat");
    const { box, size } = boundsOf(seatPropModel(model(1.3, 14.8, 1.3, [0, 7.4, 0]), entry));
    expect(size.z).toBeCloseTo(entry.dimensionsM.l, 4);
    expect(size.y).toBeLessThan(0.1);
    expect(box.min.y).toBeCloseTo(-entry.dimensionsM.h / 2, 4);
  });

  test("turns a pistol that points along x so its length runs along z and seats it from its bounding box, not its grip origin", () => {
    const entry = entryOf("handgun");
    const { box, size } = boundsOf(seatPropModel(model(1.8, 1.2, 0.27, [0.54, -0.1, 0]), entry));
    expect(size.z).toBeCloseTo(entry.dimensionsM.l, 4);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 5);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 5);
    expect(box.min.y).toBeCloseTo(-entry.dimensionsM.h / 2, 4);
  });

  test("keeps a non-graspable model upright and scales it to its largest listed dimension", () => {
    const entry = entryOf("register");
    const { box, size } = boundsOf(seatPropModel(model(12.9, 12.3, 11.5, [0, 6.15, 0.4]), entry));
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(Math.max(...Object.values(entry.dimensionsM)), 4);
    expect(size.x).toBeGreaterThan(size.y);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 5);
  });

  test("does not trust scale 1", () => {
    const entry = entryOf("bat");
    const seated = seatPropModel(model(1.3, 14.8, 1.3, [0, 7.4, 0]), entry);
    expect(seated.scale.x).toBeLessThan(0.1);
  });
});

describe("loadPropModel", () => {
  test("returns a seated model when the file exists", async () => {
    const entry = entryOf("knife_chef");
    const load = vi.fn(async () => model(1, 7.5, 0.2, [0, 3, 0]));
    const seated = await loadPropModel(entry, async () => true, load);
    expect(seated).toBeInstanceOf(Group);
    expect(load).toHaveBeenCalledWith(entry.modelUrl);
  });

  test("falls back to the box by returning null when the file is missing, without loading", async () => {
    const load = vi.fn(async () => new Group());
    const seated = await loadPropModel(entryOf("knife_chef"), async () => false, load);
    expect(seated).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});
