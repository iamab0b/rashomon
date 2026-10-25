import { Color, Group, LinearSRGBColorSpace, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Texture } from "three";
import { afterEach, describe, expect, test, vi } from "vitest";
import { fakeIndexedDb } from "../testing/fakeIndexedDb";
import { loadScan, parseGlb } from "./scan";
import { scanRequestFromSearch } from "./scanRequest";
import { SPEC_GLOSS_EXTENSION, specGlossPlugin } from "./specGlossPlugin";

const diffuseTexture = { index: 0, texCoord: 1, extensions: { KHR_texture_transform: { scale: [2, 2] } } };

function fakeParser(materials: unknown[], texture = new Texture()) {
  const assignTexture = vi.fn(async (params: Record<string, unknown>, mapName: string) => {
    params[mapName] = texture;
    return texture;
  });
  return { parser: { json: { materials }, assignTexture }, assignTexture, texture };
}

const specGloss = (extension: Record<string, unknown>) => ({ extensions: { [SPEC_GLOSS_EXTENSION]: extension } });

afterEach(() => vi.restoreAllMocks());

describe("KHR_materials_pbrSpecularGlossiness plugin", () => {
  test("the diffuse texture becomes the sRGB map, and the diffuse factor the linear colour and opacity", async () => {
    const { parser, assignTexture, texture } = fakeParser([
      specGloss({ diffuseTexture, diffuseFactor: [0.5, 0.25, 1, 0.6], specularFactor: [1, 1, 1], glossinessFactor: 0.2 }),
    ]);
    const plugin = specGlossPlugin(parser as never);
    const params: Record<string, unknown> = { color: new Color(1, 1, 1), opacity: 1 };
    await plugin.extendMaterialParams!(0, params);
    expect(plugin.name).toBe("KHR_materials_pbrSpecularGlossiness");
    expect(assignTexture).toHaveBeenCalledTimes(1);
    expect(assignTexture).toHaveBeenCalledWith(params, "map", diffuseTexture, SRGBColorSpace);
    expect(params.map).toBe(texture);
    expect((params.color as Color).toArray()).toEqual(new Color().setRGB(0.5, 0.25, 1, LinearSRGBColorSpace).toArray());
    expect((params.color as Color).toArray()).toEqual([0.5, 0.25, 1]);
    expect(params.opacity).toBe(0.6);
    expect(params.transparent).toBe(true);
    expect(Object.keys(params).sort()).toEqual(["color", "map", "opacity", "transparent"]);
  });

  test("an opaque diffuse factor sets no transparency, and a factor alone assigns no texture", async () => {
    const { parser, assignTexture } = fakeParser([specGloss({ diffuseFactor: [1, 1, 1, 1] })]);
    const params: Record<string, unknown> = {};
    await specGlossPlugin(parser as never).extendMaterialParams!(0, params);
    expect(assignTexture).not.toHaveBeenCalled();
    expect(params).toEqual({ color: new Color(1, 1, 1), opacity: 1 });
  });

  test("a material without the extension leaves the params untouched", async () => {
    const color = new Color(0.2, 0.3, 0.4);
    const { parser, assignTexture } = fakeParser([{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.3, 0.4, 1] } }, { extensions: {} }]);
    const plugin = specGlossPlugin(parser as never);
    for (const index of [0, 1, 2]) {
      const params: Record<string, unknown> = { color, opacity: 1 };
      await plugin.extendMaterialParams!(index, params);
      expect(params).toEqual({ color, opacity: 1 });
      expect(params.color).toBe(color);
    }
    expect(assignTexture).not.toHaveBeenCalled();
  });

  test("a loaded material with the plugin's map flows into the unlit scan, which keeps it", async () => {
    const { parser, texture } = fakeParser([specGloss({ diffuseTexture, diffuseFactor: [0.8, 0.7, 0.6, 1] })]);
    const params: Record<string, unknown> = {};
    await specGlossPlugin(parser as never).extendMaterialParams!(0, params);
    const source = () => {
      const root = new Group();
      const floor = new Mesh(new PlaneGeometry(9, 7).rotateX(-Math.PI / 2), new MeshStandardMaterial(params));
      floor.name = "floor";
      root.add(floor);
      return root;
    };
    const load = (lit: boolean) =>
      loadScan(scanRequestFromSearch("?scene=https://example.test/zatec_room.glb")!, {
        idb: fakeIndexedDb().factory,
        fetcher: (async () => new Response(new ArrayBuffer(8))) as typeof fetch,
        parse: async () => source(),
        lit,
      });
    const unlit = (await load(false)).raw.getObjectByName("floor") as Mesh;
    const basic = unlit.material as MeshBasicMaterial;
    expect(basic).toBeInstanceOf(MeshBasicMaterial);
    expect(basic.map).toBe(texture);
    expect(basic.color.toArray()).toEqual([0.8, 0.7, 0.6]);
    const lit = (await load(true)).raw.getObjectByName("floor") as Mesh;
    expect((lit.material as MeshStandardMaterial).map).toBe(texture);
  });
});

function glb(json: object, bin: Float32Array): ArrayBuffer {
  const pad = (length: number) => (4 - (length % 4)) % 4;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = jsonBytes.length + pad(jsonBytes.length);
  const binLength = bin.byteLength + pad(bin.byteLength);
  const total = 12 + 8 + jsonLength + 8 + binLength;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength);
  view.setUint32(20 + jsonLength, binLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  bytes.set(new Uint8Array(bin.buffer), 28 + jsonLength);
  return out;
}

describe("parseGlb registers the plugin", () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const triangle = () => {
    return {
      asset: { version: "2.0" },
      extensionsUsed: [SPEC_GLOSS_EXTENSION],
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: "room" }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      materials: [specGloss({ diffuseFactor: [0.25, 0.5, 0.75, 1], glossinessFactor: 0.1 })],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 0, 1] }],
      bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
      buffers: [{ byteLength: positions.byteLength }],
    };
  };

  test("a scan whose material uses the extension loads with its diffuse colour and no unknown-extension warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bytes = glb(triangle(), positions);
    const root = await parseGlb(bytes);
    const mesh = root.getObjectByName("room") as Mesh;
    const material = mesh.material as MeshStandardMaterial;
    expect(material.color.toArray().map((v) => Number(v.toFixed(6)))).toEqual([0.25, 0.5, 0.75]);
    expect(material.opacity).toBe(1);
    expect(warn.mock.calls.flat().join(" ")).not.toContain("Unknown extension");
  });
});
