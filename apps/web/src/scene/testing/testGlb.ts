import { Document, WebIO } from "@gltf-transform/core";

export type TestNode = {
  readonly name: string;
  readonly positions: readonly number[];
  readonly indices: readonly number[];
  readonly translation?: readonly [number, number, number];
  readonly extras?: Record<string, unknown>;
};

export function boxNode(name: string, min: readonly [number, number, number], max: readonly [number, number, number]): TestNode {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  return {
    name,
    positions: [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1],
    indices: [0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2],
  };
}

export function gridNode(name: string, size: number, cells: number, y = 0): TestNode {
  const positions: number[] = [];
  const indices: number[] = [];
  const step = size / cells;
  for (let i = 0; i <= cells; i++) for (let j = 0; j <= cells; j++) positions.push(i * step, y, j * step);
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const a = i * (cells + 1) + j;
      const b = a + cells + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return { name, positions, indices };
}

export async function buildGlb(nodes: readonly TestNode[]): Promise<ArrayBuffer> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  for (const spec of nodes) {
    const position = doc.createAccessor().setType("VEC3").setArray(new Float32Array(spec.positions)).setBuffer(buffer);
    const index = doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(spec.indices)).setBuffer(buffer);
    const primitive = doc.createPrimitive().setAttribute("POSITION", position).setIndices(index);
    const node = doc.createNode(spec.name).setMesh(doc.createMesh(spec.name).addPrimitive(primitive));
    if (spec.translation) node.setTranslation([...spec.translation]);
    if (spec.extras) node.setExtras(spec.extras);
    scene.addChild(node);
  }
  const glb = await new WebIO().writeBinary(doc);
  return glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
}
