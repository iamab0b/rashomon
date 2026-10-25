import { Matrix4, Quaternion, Vector3, type Object3D } from "three";
import type { Interior } from "@rashomon/schema";

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export type Alignment = {
  readonly rotation: Quat;
  readonly translation: Vec3;
  readonly scale: number;
};

export type OriginChoice = "click" | "bbox";

export type FloorPick = {
  readonly normal: Vec3;
  readonly point: Vec3;
};

export const IDENTITY_ALIGNMENT: Alignment = { rotation: [0, 0, 0, 1], translation: [0, 0, 0], scale: 1 };
export const METRES = 1;
export const CENTIMETRES = 0.01;
export const FLOOR_FIT_RADIUS_M = 0.3;
const FLOOR_FIT_MIN_COS = Math.cos((25 * Math.PI) / 180);
const UP = new Vector3(0, 1, 0);

export function isUnitScale(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function triangleNormal(positions: ArrayLike<number>, a: number, b: number, c: number): Vector3 {
  const va = new Vector3(positions[3 * a]!, positions[3 * a + 1]!, positions[3 * a + 2]!);
  const vb = new Vector3(positions[3 * b]!, positions[3 * b + 1]!, positions[3 * b + 2]!);
  const vc = new Vector3(positions[3 * c]!, positions[3 * c + 1]!, positions[3 * c + 2]!);
  return vb.sub(va).cross(vc.sub(va));
}

function centroidDistance(positions: ArrayLike<number>, a: number, b: number, c: number, point: Vec3): number {
  const x = (positions[3 * a]! + positions[3 * b]! + positions[3 * c]!) / 3;
  const y = (positions[3 * a + 1]! + positions[3 * b + 1]! + positions[3 * c + 1]!) / 3;
  const z = (positions[3 * a + 2]! + positions[3 * b + 2]! + positions[3 * c + 2]!) / 3;
  return Math.hypot(x - point[0], y - point[1], z - point[2]);
}

export function fitFloorNormal(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  triangle: number,
  point: Vec3,
  radius: number,
  viewDirection: Vec3,
): Vec3 {
  const face = triangleNormal(positions, indices[3 * triangle]!, indices[3 * triangle + 1]!, indices[3 * triangle + 2]!);
  if (face.lengthSq() === 0) return [0, 1, 0];
  face.normalize();
  if (face.dot(new Vector3(...viewDirection)) > 0) face.negate();
  const sum = new Vector3();
  for (let k = 0; k + 2 < indices.length; k += 3) {
    const a = indices[k]!;
    const b = indices[k + 1]!;
    const c = indices[k + 2]!;
    if (centroidDistance(positions, a, b, c, point) > radius) continue;
    const n = triangleNormal(positions, a, b, c);
    const length = n.length();
    if (length === 0) continue;
    const cos = n.dot(face) / length;
    if (Math.abs(cos) < FLOOR_FIT_MIN_COS) continue;
    sum.addScaledVector(n, Math.sign(cos));
  }
  const fitted = sum.lengthSq() > 0 ? sum.normalize() : face;
  return [fitted.x, fitted.y, fitted.z];
}

export function alignmentMatrix(alignment: Alignment): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...alignment.translation),
    new Quaternion(...alignment.rotation),
    new Vector3(alignment.scale, alignment.scale, alignment.scale),
  );
}

export function transformPositions(positions: ArrayLike<number>, alignment: Alignment): Float64Array {
  const m = alignmentMatrix(alignment).elements;
  const out = new Float64Array(positions.length);
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    out[i] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
    out[i + 1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
    out[i + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
  }
  return out;
}

export function alignPoint(point: Vec3, alignment: Alignment): Vec3 {
  const [x, y, z] = transformPositions(point, alignment);
  return [x!, y!, z!];
}

export function boundsOf(chunks: readonly ArrayLike<number>[]): Interior | null {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const positions of chunks) {
    for (let i = 0; i + 2 < positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const value = positions[i + axis]!;
        if (value < min[axis]!) min[axis] = value;
        if (value > max[axis]!) max[axis] = value;
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

export function alignToFloor(
  pick: FloorPick,
  metresPerUnit: number,
  origin: OriginChoice,
  rawPositions: readonly ArrayLike<number>[] = [],
): Alignment {
  const scale = isUnitScale(metresPerUnit) ? metresPerUnit : METRES;
  const normal = new Vector3(...pick.normal).normalize();
  const q = new Quaternion().setFromUnitVectors(normal, UP);
  const rotation: Quat = [q.x, q.y, q.z, q.w];
  const rotated: Alignment = { rotation, translation: [0, 0, 0], scale };
  const floor = alignPoint(pick.point, rotated);
  if (origin === "click") return { rotation, translation: [-floor[0], -floor[1], -floor[2]], scale };
  const bounds = boundsOf(rawPositions.map((positions) => transformPositions(positions, rotated)));
  const cornerX = bounds ? bounds.min[0] : floor[0];
  const cornerZ = bounds ? bounds.min[2] : floor[2];
  return { rotation, translation: [-cornerX, -floor[1], -cornerZ], scale };
}

export function applyAlignment(object: Object3D, alignment: Alignment): void {
  object.position.set(...alignment.translation);
  object.quaternion.set(...alignment.rotation);
  object.scale.setScalar(alignment.scale);
  object.updateMatrixWorld(true);
}

export function toRootSpace(root: Object3D, point: Vec3, direction: Vec3): { point: Vec3; direction: Vec3 } {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const p = new Vector3(...point).applyMatrix4(inverse);
  const d = new Vector3(...direction).transformDirection(inverse);
  return { point: [p.x, p.y, p.z], direction: [d.x, d.y, d.z] };
}

export function isAlignment(value: unknown): value is Alignment {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;
  const numbers = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every((x) => Number.isFinite(x));
  return numbers(a.rotation, 4) && numbers(a.translation, 3) && typeof a.scale === "number" && isUnitScale(a.scale);
}
