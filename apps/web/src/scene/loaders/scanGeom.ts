import type { GeomMesh, SceneGeom } from "@rashomon/engine";
import { Matrix4, Mesh, Vector3, type Object3D } from "three";
import { transformPositions, type Alignment } from "./alignment";
import { DRESS_PREFIX } from "./scene";

export const SCAN_ID_PREFIX = "scan:";
export const MAX_GATE_TRIANGLES = 150_000;
export const MERGE_GRID_M = 0.01;
export const CLUSTER_GRID_M = 0.05;
export const MIN_TRIANGLE_AREA_M2 = 0.0001;

export type BakedMesh = {
  readonly id: string;
  readonly mesh: Mesh;
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
};

function excluded(object: Object3D, root: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node === root ? null : node.parent) {
    if (node.name.startsWith(DRESS_PREFIX) || node.userData.collision === false) return true;
  }
  return false;
}

function meshIds(meshes: readonly Mesh[]): string[] {
  const seen = new Map<string, number>();
  return meshes.map((mesh, index) => {
    const base = `${SCAN_ID_PREFIX}${mesh.name || index}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}:${index}`;
  });
}

function bakeOne(mesh: Mesh, toRoot: Matrix4): { positions: Float64Array; indices: Uint32Array } {
  const attribute = mesh.geometry.getAttribute("position");
  const positions = new Float64Array(attribute.count * 3);
  const v = new Vector3();
  for (let i = 0; i < attribute.count; i++) {
    v.fromBufferAttribute(attribute, i).applyMatrix4(toRoot);
    positions[3 * i] = v.x;
    positions[3 * i + 1] = v.y;
    positions[3 * i + 2] = v.z;
  }
  const index = mesh.geometry.getIndex();
  const indices = index ? Uint32Array.from(index.array) : Uint32Array.from({ length: attribute.count }, (_, i) => i);
  const flip = toRoot.determinant() < 0;
  if (flip) {
    for (let k = 0; k + 2 < indices.length; k += 3) {
      const b = indices[k + 1]!;
      indices[k + 1] = indices[k + 2]!;
      indices[k + 2] = b;
    }
  }
  return { positions, indices: indices.length % 3 === 0 ? indices : indices.subarray(0, indices.length - (indices.length % 3)) };
}

export function bakeMeshes(root: Object3D): BakedMesh[] {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh && object.geometry.getAttribute("position") && !excluded(object, root)) meshes.push(object);
  });
  const ids = meshIds(meshes);
  return meshes.map((mesh, i) => ({
    id: ids[i]!,
    mesh,
    ...bakeOne(mesh, new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)),
  }));
}

type Working = { id: string; positions: ArrayLike<number>; indices: ArrayLike<number> };

type CellKey = (x: number, y: number, z: number) => number | string;

function cellKeys(positions: ArrayLike<number>, grid: number): CellKey {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[i + axis]!;
      if (value < min[axis]!) min[axis] = value;
      if (value > max[axis]!) max[axis] = value;
    }
  }
  const [x0, y0, z0] = min as [number, number, number];
  const ny = Math.round((max[1]! - y0) / grid) + 1;
  const nz = Math.round((max[2]! - z0) / grid) + 1;
  const nx = Math.round((max[0]! - x0) / grid) + 1;
  if (nx * ny * nz < Number.MAX_SAFE_INTEGER) {
    return (x, y, z) => (Math.round((x - x0) / grid) * ny + Math.round((y - y0) / grid)) * nz + Math.round((z - z0) / grid);
  }
  return (x, y, z) => `${Math.round(x / grid)},${Math.round(y / grid)},${Math.round(z / grid)}`;
}

function triangleArea(p: ArrayLike<number>, a: number, b: number, c: number): number {
  const ux = p[3 * b]! - p[3 * a]!;
  const uy = p[3 * b + 1]! - p[3 * a + 1]!;
  const uz = p[3 * b + 2]! - p[3 * a + 2]!;
  const vx = p[3 * c]! - p[3 * a]!;
  const vy = p[3 * c + 1]! - p[3 * a + 1]!;
  const vz = p[3 * c + 2]! - p[3 * a + 2]!;
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

function cluster(input: Working, grid: number, average: boolean): GeomMesh {
  const { positions, indices } = input;
  const key = cellKeys(positions, grid);
  const cells = new Map<number | string, number>();
  const sums: number[] = [];
  const counts: number[] = [];
  const remap = new Int32Array(positions.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const x = positions[3 * i]!;
    const y = positions[3 * i + 1]!;
    const z = positions[3 * i + 2]!;
    const id = key(x, y, z);
    let cell = cells.get(id);
    if (cell === undefined) {
      cell = counts.length;
      cells.set(id, cell);
      sums.push(x, y, z);
      counts.push(1);
    } else if (average) {
      sums[3 * cell] = sums[3 * cell]! + x;
      sums[3 * cell + 1] = sums[3 * cell + 1]! + y;
      sums[3 * cell + 2] = sums[3 * cell + 2]! + z;
      counts[cell] = counts[cell]! + 1;
    }
    remap[i] = cell;
  }
  const merged = new Array<number>(sums.length);
  for (let cell = 0; cell < counts.length; cell++) {
    const n = average ? counts[cell]! : 1;
    merged[3 * cell] = sums[3 * cell]! / n;
    merged[3 * cell + 1] = sums[3 * cell + 1]! / n;
    merged[3 * cell + 2] = sums[3 * cell + 2]! / n;
  }
  const kept: number[] = [];
  for (let k = 0; k + 2 < indices.length; k += 3) {
    const a = remap[indices[k]!]!;
    const b = remap[indices[k + 1]!]!;
    const c = remap[indices[k + 2]!]!;
    if (a === b || b === c || a === c) continue;
    if (triangleArea(merged, a, b, c) < MIN_TRIANGLE_AREA_M2) continue;
    kept.push(a, b, c);
  }
  return compact(input.id, merged, kept);
}

function compact(id: string, positions: readonly number[], indices: readonly number[]): GeomMesh {
  const used = new Map<number, number>();
  const outPositions: number[] = [];
  const outIndices = indices.map((i) => {
    let j = used.get(i);
    if (j === undefined) {
      j = used.size;
      used.set(i, j);
      outPositions.push(positions[3 * i]!, positions[3 * i + 1]!, positions[3 * i + 2]!);
    }
    return j;
  });
  return { id, positions: outPositions, indices: outIndices };
}

export function triangleCount(geom: SceneGeom): number {
  return geom.meshes.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0);
}

export function simplifyGeom(meshes: readonly Working[], cap: number = MAX_GATE_TRIANGLES): SceneGeom {
  const merged: SceneGeom = { meshes: meshes.map((m) => cluster(m, MERGE_GRID_M, false)).filter((m) => m.indices.length > 0) };
  let geom = merged;
  for (let grid = CLUSTER_GRID_M; triangleCount(geom) > cap; grid *= 2) {
    geom = { meshes: merged.meshes.map((m) => cluster(m, grid, true)).filter((m) => m.indices.length > 0) };
  }
  return geom;
}

export function extractScanGeom(rawRoot: Object3D, alignment: Alignment, cap: number = MAX_GATE_TRIANGLES): SceneGeom {
  return simplifyGeom(
    bakeMeshes(rawRoot).map((baked) => ({
      id: baked.id,
      positions: transformPositions(baked.positions, alignment),
      indices: baked.indices,
    })),
    cap,
  );
}
