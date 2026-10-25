import type { SceneGeom } from "@rashomon/engine";
import { fitFloor, forEachTriangle } from "./floor";

export const VOXEL_M = 0.25;
export const SAMPLE_M = 0.1;
export const BAND_BOTTOM_M = 0.05;
export const BAND_TOP_M = 2.5;
export const MIN_CLUSTER_VOXELS = 4;
export const MAX_CANDIDATES = 40;

const PRECISION = 1000;
const SPAN = 1 << 20;
const OFFSET = SPAN / 2;

export type Vec3 = [number, number, number];

export type Candidate = {
  readonly id: string;
  readonly voxels: number;
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
  readonly position: Vec3;
  readonly size: Vec3;
};

export type CandidateResult =
  | { readonly ok: true; readonly y0: number; readonly candidates: Candidate[] }
  | { readonly ok: false; readonly error: string };

type Cell = [number, number, number];

const round = (value: number): number => Math.round(value * PRECISION) / PRECISION;

const layers = Math.ceil((BAND_TOP_M - BAND_BOTTOM_M) / VOXEL_M - 1e-9);

function keyOf(ix: number, iy: number, iz: number): number {
  return ((ix + OFFSET) * SPAN + (iz + OFFSET)) * 16 + iy;
}

function cellOf(key: number): Cell {
  const iy = key % 16;
  const rest = (key - iy) / 16;
  const iz = (rest % SPAN) - OFFSET;
  const ix = Math.floor(rest / SPAN) - OFFSET;
  return [ix, iy, iz];
}

export function voxelize(geom: SceneGeom, y0: number): Set<number> {
  const filled = new Set<number>();
  const bottom = y0 + BAND_BOTTOM_M;
  const top = y0 + BAND_TOP_M;
  forEachTriangle(geom, (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    if (Math.max(ay, by, cy) < bottom || Math.min(ay, by, cy) > top) return;
    const longest = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
    const steps = Math.max(1, Math.ceil(longest / SAMPLE_M));
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; i + j <= steps; j++) {
        const u = i / steps;
        const v = j / steps;
        const w = 1 - u - v;
        const y = w * ay + u * by + v * cy;
        if (y < bottom || y > top) continue;
        const x = w * ax + u * bx + v * cx;
        const z = w * az + u * bz + v * cz;
        const ix = Math.floor(x / VOXEL_M);
        const iz = Math.floor(z / VOXEL_M);
        if (!(Math.abs(ix) < OFFSET && Math.abs(iz) < OFFSET)) continue;
        filled.add(keyOf(ix, Math.min(layers - 1, Math.floor((y - bottom) / VOXEL_M)), iz));
      }
    }
  });
  return filled;
}

const NEIGHBORS: readonly Cell[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export function components(filled: ReadonlySet<number>): Cell[][] {
  const seen = new Set<number>();
  const out: Cell[][] = [];
  for (const start of [...filled].sort((a, b) => a - b)) {
    if (seen.has(start)) continue;
    seen.add(start);
    const stack = [start];
    const cells: Cell[] = [];
    while (stack.length > 0) {
      const cell = cellOf(stack.pop()!);
      cells.push(cell);
      for (const [dx, dy, dz] of NEIGHBORS) {
        const iy = cell[1] + dy;
        if (iy < 0 || iy >= layers) continue;
        const next = keyOf(cell[0] + dx, iy, cell[2] + dz);
        if (!filled.has(next) || seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    out.push(cells);
  }
  return out;
}

type Box = { voxels: number; min: Vec3; max: Vec3 };

function boxOf(cells: readonly Cell[], y0: number): Box {
  const lo: Cell = [Infinity, Infinity, Infinity];
  const hi: Cell = [-Infinity, -Infinity, -Infinity];
  for (const cell of cells) {
    for (let axis = 0; axis < 3; axis++) {
      lo[axis] = Math.min(lo[axis]!, cell[axis]!);
      hi[axis] = Math.max(hi[axis]!, cell[axis]!);
    }
  }
  return {
    voxels: cells.length,
    min: [round(lo[0] * VOXEL_M), round(y0), round(lo[2] * VOXEL_M)],
    max: [round((hi[0] + 1) * VOXEL_M), round(Math.min(y0 + BAND_TOP_M, y0 + BAND_BOTTOM_M + (hi[1] + 1) * VOXEL_M)), round((hi[2] + 1) * VOXEL_M)],
  };
}

function byCorner(a: Box, b: Box): number {
  return a.min[0] - b.min[0] || a.min[2] - b.min[2] || a.min[1] - b.min[1] || a.max[0] - b.max[0] || a.max[2] - b.max[2] || a.max[1] - b.max[1];
}

function toCandidate(box: Box, index: number): Candidate {
  const { min, max } = box;
  return {
    id: `c${index + 1}`,
    voxels: box.voxels,
    bounds: { min, max },
    position: [round((min[0] + max[0]) / 2), min[1], round((min[2] + max[2]) / 2)],
    size: [round(max[0] - min[0]), round(max[1] - min[1]), round(max[2] - min[2])],
  };
}

export function candidatesAt(geom: SceneGeom, y0: number): Candidate[] {
  const boxes = components(voxelize(geom, y0))
    .filter((cells) => cells.length >= MIN_CLUSTER_VOXELS)
    .map((cells) => boxOf(cells, y0))
    .sort(byCorner);
  const kept =
    boxes.length > MAX_CANDIDATES
      ? boxes
          .map((box, order) => ({ box, order }))
          .sort((a, b) => b.box.voxels - a.box.voxels || a.order - b.order)
          .slice(0, MAX_CANDIDATES)
          .sort((a, b) => a.order - b.order)
          .map(({ box }) => box)
      : boxes;
  return kept.map(toCandidate);
}

export function findCandidates(geom: SceneGeom): CandidateResult {
  const floor = fitFloor(geom);
  if (!floor.ok) return floor;
  return { ok: true, y0: floor.y0, candidates: candidatesAt(geom, floor.y0) };
}
