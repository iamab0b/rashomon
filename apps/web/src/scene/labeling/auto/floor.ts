import type { SceneGeom } from "@rashomon/engine";

export const FLOOR_MAX_TILT_DEG = 10;
export const FLOOR_MIN_SHARE = 0.2;
export const FLOOR_BIN_M = 0.05;
export const BELOW_FLOOR_SLACK_M = 0.1;
export const BELOW_FLOOR_MAX_SHARE = 0.1;

const MIN_COS = Math.cos((FLOOR_MAX_TILT_DEG * Math.PI) / 180);

export type FloorFit = { readonly ok: true; readonly y0: number; readonly inliers: number } | { readonly ok: false; readonly error: string };

type Flat = { y: number; low: number; area: number };

export const NO_FLOOR =
  "No floor found: no near-horizontal plane holds 20% of the scan's horizontal area. Align the scan to its floor first.";
export const FLOOR_NOT_LOWEST =
  "No floor found: the lowest large horizontal plane has much of the scan below it. Align the scan to its floor first.";

export function forEachTriangle(
  geom: SceneGeom,
  visit: (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => void,
): void {
  for (const mesh of geom.meshes) {
    const p = mesh.positions;
    const idx = mesh.indices;
    for (let k = 0; k + 2 < idx.length; k += 3) {
      const a = 3 * idx[k]!;
      const b = 3 * idx[k + 1]!;
      const c = 3 * idx[k + 2]!;
      visit(p[a]!, p[a + 1]!, p[a + 2]!, p[b]!, p[b + 1]!, p[b + 2]!, p[c]!, p[c + 1]!, p[c + 2]!);
    }
  }
}

export function fitFloor(geom: SceneGeom): FloorFit {
  const flats: Flat[] = [];
  const all: Flat[] = [];
  forEachTriangle(geom, (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) return;
    const flat = { y: (ay + by + cy) / 3, low: Math.min(ay, by, cy), area: length / 2 };
    all.push(flat);
    if (Math.abs(ny) / length >= MIN_COS) flats.push(flat);
  });
  const total = flats.reduce((sum, flat) => sum + flat.area, 0);
  if (total === 0) return { ok: false, error: NO_FLOOR };

  const bins = new Map<number, Flat[]>();
  for (const flat of flats) {
    const bin = Math.floor(flat.y / FLOOR_BIN_M);
    const list = bins.get(bin);
    if (list) list.push(flat);
    else bins.set(bin, [flat]);
  }
  const keys = [...bins.keys()].sort((a, b) => a - b);
  let run: Flat[] = [];
  let last = Number.NaN;
  const planes: Flat[][] = [];
  for (const key of keys) {
    if (key !== last + 1 && run.length > 0) {
      planes.push(run);
      run = [];
    }
    run = run.concat(bins.get(key)!);
    last = key;
  }
  if (run.length > 0) planes.push(run);

  const floor = planes.find((plane) => plane.reduce((sum, flat) => sum + flat.area, 0) >= FLOOR_MIN_SHARE * total);
  if (!floor) return { ok: false, error: NO_FLOOR };
  const area = floor.reduce((sum, flat) => sum + flat.area, 0);
  const y0 = floor.reduce((sum, flat) => sum + flat.y * flat.area, 0) / area;

  const surface = all.reduce((sum, flat) => sum + flat.area, 0);
  const below = all.filter((flat) => flat.low < y0 - BELOW_FLOOR_SLACK_M).reduce((sum, flat) => sum + flat.area, 0);
  if (below > BELOW_FLOOR_MAX_SHARE * surface) return { ok: false, error: FLOOR_NOT_LOWEST };

  return { ok: true, y0, inliers: floor.length };
}
