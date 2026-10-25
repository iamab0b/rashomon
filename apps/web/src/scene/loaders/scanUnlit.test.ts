import { BoxGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Texture, type Object3D } from "three";
import { describe, expect, test } from "vitest";
import { IDENTITY_ALIGNMENT } from "./alignment";
import { loadScan } from "./scan";
import { extractScanGeom } from "./scanGeom";
import { scanRequestFromSearch } from "./scanRequest";
import { makeScanUnlit, scanLitFromSearch } from "./scanUnlit";
import { fakeIndexedDb } from "../testing/fakeIndexedDb";

const map = new Texture();

function syntheticScan(): Group {
  const root = new Group();
  const floor = new Mesh(
    new PlaneGeometry(9, 7).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({ map, side: DoubleSide, transparent: true, opacity: 0.8, vertexColors: true }),
  );
  floor.name = "floor";
  const wall = new Mesh(new BoxGeometry(0.2, 3, 7).translate(4.5, 1.5, 3.5), new MeshStandardMaterial({ map }));
  wall.name = "wall";
  [floor, wall].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  });
  return root;
}

function meshNamed(root: Object3D, name: string): Mesh {
  return root.getObjectByName(name) as Mesh;
}

const request = scanRequestFromSearch("?scene=https://example.test/room.glb")!;
const loadWith = (lit: boolean) =>
  loadScan(request, {
    idb: fakeIndexedDb().factory,
    fetcher: (async () => new Response(new ArrayBuffer(8))) as typeof fetch,
    parse: async () => syntheticScan(),
    lit,
  });

describe("unlit scans", () => {
  test("gate geometry is identical before and after the material change", () => {
    const before = extractScanGeom(syntheticScan(), IDENTITY_ALIGNMENT);
    const after = syntheticScan();
    makeScanUnlit(after);
    expect(extractScanGeom(after, IDENTITY_ALIGNMENT)).toEqual(before);
    expect(before.meshes.length).toBe(2);
  });

  test("a loaded scan has the same gate geometry lit and unlit", async () => {
    const unlit = await loadWith(false);
    const lit = await loadWith(true);
    expect(unlit.geom).toEqual(lit.geom);
  });

  test("scan meshes become MeshBasicMaterial with the source map and settings, and stop casting shadows", async () => {
    const scan = await loadWith(false);
    const floor = meshNamed(scan.raw, "floor");
    const material = floor.material as MeshBasicMaterial;
    expect(material).toBeInstanceOf(MeshBasicMaterial);
    expect(material.map).toBe(map);
    expect(material.side).toBe(DoubleSide);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.8);
    expect(material.vertexColors).toBe(true);
    expect(meshNamed(scan.raw, "wall").material).toBeInstanceOf(MeshBasicMaterial);
    [floor, meshNamed(scan.raw, "wall")].forEach((mesh) => {
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
    });
  });

  test("a converted scan material is not tone mapped", async () => {
    const scan = await loadWith(false);
    expect((meshNamed(scan.raw, "floor").material as MeshBasicMaterial).toneMapped).toBe(false);
    expect((meshNamed(scan.raw, "wall").material as MeshBasicMaterial).toneMapped).toBe(false);
  });

  test("an emissive-only material keeps its emissive map and colour", () => {
    const emissiveMap = new Texture();
    const root = new Group();
    const mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ emissiveMap, emissive: new Color(0.5, 0.25, 1) }),
    );
    root.add(mesh);
    makeScanUnlit(root);
    const material = mesh.material as unknown as MeshBasicMaterial;
    expect(material).toBeInstanceOf(MeshBasicMaterial);
    expect(material.map).toBe(emissiveMap);
    expect(material.color.equals(new Color(0.5, 0.25, 1))).toBe(true);
  });

  test("the old material is disposed", () => {
    const root = syntheticScan();
    const old = (meshNamed(root, "floor").material as MeshStandardMaterial);
    let disposed = false;
    old.addEventListener("dispose", () => {
      disposed = true;
    });
    makeScanUnlit(root);
    expect(disposed).toBe(true);
  });

  test("a mesh outside the scan is untouched", async () => {
    const prop = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ map }));
    prop.castShadow = true;
    prop.receiveShadow = true;
    const material = prop.material;
    await loadWith(false);
    expect(prop.material).toBe(material);
    expect(prop.material).toBeInstanceOf(MeshStandardMaterial);
    expect(prop.castShadow).toBe(true);
    expect(prop.receiveShadow).toBe(true);
  });

  test("scanlit=1 restores lit rendering", async () => {
    expect(scanLitFromSearch("?scene=x&scanlit=1")).toBe(true);
    expect(scanLitFromSearch("?scene=x")).toBe(false);
    const scan = await loadWith(true);
    const floor = meshNamed(scan.raw, "floor");
    expect(floor.material).toBeInstanceOf(MeshStandardMaterial);
    expect(floor.castShadow).toBe(true);
  });
});
