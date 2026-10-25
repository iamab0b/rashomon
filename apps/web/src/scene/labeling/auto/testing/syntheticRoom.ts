import type { GeomMesh, SceneGeom } from "@rashomon/engine";

type V = [number, number, number];

function quad(positions: number[], indices: number[], a: V, b: V, c: V, d: V): void {
  const base = positions.length / 3;
  positions.push(...a, ...b, ...c, ...d);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export function floorMesh(id: string, min: [number, number], max: [number, number], y = 0): GeomMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  quad(positions, indices, [min[0], y, min[1]], [min[0], y, max[1]], [max[0], y, max[1]], [max[0], y, min[1]]);
  return { id, positions, indices };
}

export function boxMesh(id: string, min: V, max: V): GeomMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  quad(positions, indices, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
  quad(positions, indices, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]);
  quad(positions, indices, [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]);
  quad(positions, indices, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]);
  quad(positions, indices, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]);
  return { id, positions, indices };
}

export const ROOM_BOXES = {
  counter: { min: [0.5, 0, 0.5] as V, max: [2.5, 0.9, 1.1] as V },
  shelf_a: { min: [3.5, 0, 1.5] as V, max: [4.7, 1.8, 1.9] as V },
  shelf_b: { min: [3.5, 0, 2.6] as V, max: [4.7, 1.8, 3.0] as V },
  wall: { min: [5.5, 0, 0.2] as V, max: [5.6, 2.4, 3.8] as V },
};

export function syntheticRoom(floorY = 0, withFloor = true): SceneGeom {
  const lift = (v: V): V => [v[0], v[1] + floorY, v[2]];
  const meshes = Object.entries(ROOM_BOXES).map(([id, box]) => boxMesh(id, lift(box.min), lift(box.max)));
  return { meshes: withFloor ? [floorMesh("floor", [0, 0], [6, 4], floorY), ...meshes] : meshes };
}

export function shuffledTriangles(geom: SceneGeom, seed: number): SceneGeom {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return {
    meshes: [...geom.meshes].reverse().map((mesh) => {
      const triangles: number[][] = [];
      for (let k = 0; k < mesh.indices.length; k += 3) triangles.push(mesh.indices.slice(k, k + 3));
      for (let i = triangles.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [triangles[i], triangles[j]] = [triangles[j]!, triangles[i]!];
      }
      return { ...mesh, indices: triangles.flat() };
    }),
  };
}
