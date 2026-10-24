import type { ResolvedEvent, Vec3 } from "@rashomon/engine";
import { CurvePath, LineCurve3, Vector3 } from "three";

export type EventPath = {
  readonly curve: CurvePath<Vector3>;
  readonly length: number;
  readonly cornerFractions: readonly number[];
};

export type Pose = {
  readonly position: Vec3;
  readonly tangent: Vec3 | null;
};

type PathEvent = Pick<ResolvedEvent, "path" | "reachable" | "tStart" | "tEnd" | "from" | "at" | "to">;

const SAME_POINT_EPSILON_M = 1e-9;

function distinctPoints(path: readonly Vec3[]): Vector3[] {
  const points: Vector3[] = [];
  for (const [x, y, z] of path) {
    const point = new Vector3(x, y, z);
    const last = points[points.length - 1];
    if (!last || last.distanceTo(point) > SAME_POINT_EPSILON_M) points.push(point);
  }
  return points;
}

export function buildEventPath(event: Pick<ResolvedEvent, "path" | "reachable">): EventPath | null {
  if (!event.reachable) return null;
  const points = distinctPoints(event.path);
  if (points.length < 2) return null;
  const curve = new CurvePath<Vector3>();
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from && to) curve.add(new LineCurve3(from, to));
  }
  const length = curve.getLength();
  const cumulative = curve.getCurveLengths();
  const cornerFractions = cumulative.slice(0, -1).map((at) => at / length);
  return { curve, length, cornerFractions };
}

export function eventFraction(event: Pick<ResolvedEvent, "tStart" | "tEnd">, t: number): number {
  const span = event.tEnd - event.tStart;
  if (span <= 0) return t >= event.tStart ? 1 : 0;
  return Math.min(1, Math.max(0, (t - event.tStart) / span));
}

function toVec3(vector: Vector3): Vec3 {
  return [vector.x, vector.y, vector.z];
}

function segmentAt(path: EventPath, fraction: number): LineCurve3 {
  const distance = fraction * path.length;
  const cumulative = path.curve.getCurveLengths();
  const index = cumulative.findIndex((at) => at >= distance);
  const curves = path.curve.curves as LineCurve3[];
  return curves[index === -1 ? curves.length - 1 : index] ?? (curves[0] as LineCurve3);
}

export function samplePath(path: EventPath, fraction: number): Pose {
  const clamped = Math.min(1, Math.max(0, fraction));
  const segment = segmentAt(path, clamped);
  const point = path.curve.getPoint(clamped) ?? segment.v2.clone();
  const tangent = segment.getTangent(0);
  return { position: toVec3(point), tangent: toVec3(tangent) };
}

export function holdPoint(event: Pick<ResolvedEvent, "from" | "at" | "to">): Vec3 | null {
  return event.from ?? event.at ?? event.to ?? null;
}

export function getPose(event: PathEvent, t: number, path: EventPath | null = buildEventPath(event)): Pose | null {
  if (!path) {
    const hold = holdPoint(event);
    return hold ? { position: hold, tangent: null } : null;
  }
  return samplePath(path, eventFraction(event, t));
}
