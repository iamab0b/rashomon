import type { Landmark, Portals, SceneManifest } from "@rashomon/schema";
import { MARGIN_M, expand, insideBox, segmentHitsBox, type Box, type Point2 } from "./geometry";
import { buildEdges } from "./portals";

export type WalkableOptions = {
  cellM?: number;
  bodyRadiusM?: number;
};

export const DEFAULT_CELL_M = 0.25;
export const BODY_RADIUS_M = 0.25;

const BLOCKING_KINDS: ReadonlySet<Landmark["kind"]> = new Set(["furniture", "appliance"]);
const SQRT2 = Math.SQRT2;
const NEIGHBORS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

type Grid = {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly x0: number;
  readonly z0: number;
  readonly blocked: Uint8Array;
};

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

const centerOf = (grid: Grid, index: number): Point2 => ({
  x: round6(grid.x0 + ((index % grid.cols) + 0.5) * grid.cell),
  z: round6(grid.z0 + (Math.floor(index / grid.cols) + 0.5) * grid.cell),
});

function extentOf(manifest: SceneManifest): { min: [number, number, number]; max: [number, number, number] } | null {
  if (manifest.interior) return manifest.interior;
  if (manifest.landmarks.length === 0) return null;
  const xs = manifest.landmarks.flatMap((l) => [l.bounds.min[0], l.bounds.max[0]]);
  const zs = manifest.landmarks.flatMap((l) => [l.bounds.min[2], l.bounds.max[2]]);
  return { min: [Math.min(...xs), 0, Math.min(...zs)], max: [Math.max(...xs), 0, Math.max(...zs)] };
}

function buildGrid(extent: NonNullable<ReturnType<typeof extentOf>>, cell: number, grown: Box[]): Grid {
  const [x0, , z0] = extent.min;
  const [x1, , z1] = extent.max;
  const cols = Math.max(1, Math.ceil((x1 - x0) / cell - 1e-9));
  const rows = Math.max(1, Math.ceil((z1 - z0) / cell - 1e-9));
  const blocked = new Uint8Array(cols * rows);
  const grid: Grid = { cols, rows, cell, x0, z0, blocked };
  for (let i = 0; i < cols * rows; i++) {
    const p = centerOf(grid, i);
    const outside = p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1;
    if (outside || grown.some((box) => insideBox(p, box))) blocked[i] = 1;
  }
  return grid;
}

function accessCell(grid: Grid, x: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < grid.blocked.length; i++) {
    if (grid.blocked[i]) continue;
    const p = centerOf(grid, i);
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < bestD - 1e-12) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

type Search = {
  readonly g: Float64Array;
  readonly prev: Int32Array;
  readonly seen: Int32Array;
  readonly closed: Int32Array;
  readonly heapNode: Int32Array;
  readonly heapKey: Float64Array;
  run: number;
};

function searchFor(size: number): Search {
  return {
    g: new Float64Array(size),
    prev: new Int32Array(size),
    seen: new Int32Array(size),
    closed: new Int32Array(size),
    heapNode: new Int32Array(size * 8 + 8),
    heapKey: new Float64Array(size * 8 + 8),
    run: 0,
  };
}

const before = (ka: number, na: number, kb: number, nb: number): boolean =>
  ka < kb - 1e-12 || (ka <= kb + 1e-12 && na < nb);

function astar(grid: Grid, search: Search, start: number, goal: number): number[] | null {
  if (start === goal) return [start];
  const { cols, rows, blocked } = grid;
  const { g, prev, seen, closed, heapNode, heapKey } = search;
  const run = ++search.run;
  const gx = goal % cols;
  const gz = (goal - gx) / cols;
  let size = 0;
  const push = (node: number, key: number) => {
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!before(key, node, heapKey[p]!, heapNode[p]!)) break;
      heapNode[i] = heapNode[p]!;
      heapKey[i] = heapKey[p]!;
      i = p;
    }
    heapNode[i] = node;
    heapKey[i] = key;
  };
  const pop = (): number => {
    const top = heapNode[0]!;
    const node = heapNode[--size]!;
    const key = heapKey[size]!;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= size) break;
      const r = l + 1;
      const m = r < size && before(heapKey[r]!, heapNode[r]!, heapKey[l]!, heapNode[l]!) ? r : l;
      if (!before(heapKey[m]!, heapNode[m]!, key, node)) break;
      heapNode[i] = heapNode[m]!;
      heapKey[i] = heapKey[m]!;
      i = m;
    }
    heapNode[i] = node;
    heapKey[i] = key;
    return top;
  };
  const octile = (x: number, z: number): number => {
    const dx = Math.abs(x - gx);
    const dz = Math.abs(z - gz);
    return dx > dz ? dx + (SQRT2 - 1) * dz : dz + (SQRT2 - 1) * dx;
  };
  seen[start] = run;
  g[start] = 0;
  prev[start] = -1;
  push(start, octile(start % cols, (start - (start % cols)) / cols));
  let found = false;
  while (size > 0) {
    const cur = pop();
    if (closed[cur] === run) continue;
    if (cur === goal) {
      found = true;
      break;
    }
    closed[cur] = run;
    const cx = cur % cols;
    const cz = (cur - cx) / cols;
    const base = g[cur]!;
    for (const [dx, dz, cost] of NEIGHBORS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const next = nz * cols + nx;
      if (blocked[next] || closed[next] === run) continue;
      if (dx !== 0 && dz !== 0 && (blocked[cz * cols + nx] || blocked[nz * cols + cx])) continue;
      const candidate = base + cost;
      if (seen[next] !== run || candidate < g[next]! - 1e-12) {
        seen[next] = run;
        g[next] = candidate;
        prev[next] = cur;
        push(next, candidate + octile(nx, nz));
      }
    }
  }
  if (!found) return null;
  const path: number[] = [];
  for (let at = goal; at !== -1; at = prev[at]!) path.push(at);
  return path.reverse();
}

function stringPull(points: Point2[], grown: Box[]): Point2[] {
  if (points.length <= 2) return points;
  const clear = (a: Point2, b: Point2): boolean => !grown.some((box) => segmentHitsBox(a, b, box));
  const out: Point2[] = [points[0]!];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = anchor + 1;
    while (next + 1 < points.length && clear(points[anchor]!, points[next + 1]!)) next += 1;
    out.push(points[next]!);
    anchor = next;
  }
  return out;
}

export function generatePortals(manifest: SceneManifest, options: WalkableOptions = {}): Portals {
  const cell = options.cellM ?? DEFAULT_CELL_M;
  const body = options.bodyRadiusM ?? BODY_RADIUS_M;
  const grown = manifest.landmarks
    .filter((l) => BLOCKING_KINDS.has(l.kind))
    .map((l) => expand(l.bounds, MARGIN_M + body));
  const extent = extentOf(manifest);
  if (!extent) return { waypoints: [], edges: [] };
  const grid = buildGrid(extent, cell, grown);

  const access: number[] = [];
  for (const landmark of manifest.landmarks) {
    const at = accessCell(grid, landmark.position[0], landmark.position[2]);
    if (at >= 0 && !access.includes(at)) access.push(at);
  }

  const search = searchFor(grid.blocked.length);
  const points: Point2[] = access.map((i) => centerOf(grid, i));
  const within = (p: Point2): boolean =>
    p.x >= extent.min[0] && p.x <= extent.max[0] && p.z >= extent.min[2] && p.z <= extent.max[2];
  for (const box of grown) {
    for (const [x, z] of [
      [box.min[0], box.min[2]],
      [box.max[0], box.min[2]],
      [box.max[0], box.max[2]],
      [box.min[0], box.max[2]],
    ] as const) {
      const corner: Point2 = { x: round6(x), z: round6(z) };
      if (within(corner) && !grown.some((other) => insideBox(corner, other))) points.push(corner);
    }
  }
  for (let i = 0; i < access.length; i++) {
    for (let j = i + 1; j < access.length; j++) {
      const path = astar(grid, search, access[i]!, access[j]!);
      if (!path) continue;
      const pulled = stringPull(
        path.map((c) => centerOf(grid, c)),
        grown,
      );
      points.push(...pulled.slice(1, -1));
    }
  }

  const seen = new Set<string>();
  const waypoints: Portals["waypoints"] = [];
  for (const p of points) {
    const key = `${p.x},${p.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    waypoints.push({ id: `w${waypoints.length}`, x: p.x, z: p.z });
  }

  const obstacles = manifest.landmarks.filter((l) => l.occludes).map((l) => l.bounds);
  return { waypoints, edges: buildEdges(waypoints, obstacles) };
}

const generated = new WeakMap<SceneManifest, Portals>();

export function portalsFor(manifest: SceneManifest): Portals {
  if (manifest.portals) return manifest.portals;
  const cached = generated.get(manifest);
  if (cached) return cached;
  const built = generatePortals(manifest);
  generated.set(manifest, built);
  return built;
}
