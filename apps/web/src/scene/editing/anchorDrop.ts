import type { Anchor, Event, Landmark, Patch, SceneManifest } from "@rashomon/schema";

export const SNAP_RADIUS_M = 0.75;
export const DEFAULT_EDITOR = "investigator:local";

export type DropField = "at" | "from";

type FloorPoint = { x: number; z: number };

const SNAP_KINDS: ReadonlySet<Landmark["kind"]> = new Set(["zone", "door"]);

function distance(point: FloorPoint, landmark: Landmark): number {
  return Math.hypot(point.x - landmark.position[0], point.z - landmark.position[2]);
}

function contains(landmark: Landmark, point: FloorPoint): boolean {
  const { min, max } = landmark.bounds;
  return point.x >= min[0] && point.x <= max[0] && point.z >= min[2] && point.z <= max[2];
}

function nearestBy(candidates: readonly Landmark[], point: FloorPoint): Landmark | undefined {
  return candidates.reduce<Landmark | undefined>(
    (best, landmark) => (!best || distance(point, landmark) < distance(point, best) ? landmark : best),
    undefined,
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function anchorFor(point: FloorPoint, manifest: SceneManifest): Anchor {
  const snappable = manifest.landmarks.filter((landmark) => SNAP_KINDS.has(landmark.kind));
  const inside = nearestBy(snappable.filter((landmark) => contains(landmark, point)), point);
  const close = nearestBy(
    snappable.filter(
      (landmark) =>
        Math.abs(point.x - landmark.position[0]) <= SNAP_RADIUS_M &&
        Math.abs(point.z - landmark.position[2]) <= SNAP_RADIUS_M,
    ),
    point,
  );
  const landmark = inside ?? close;
  if (landmark) return { kind: "at", landmark: landmark.id };
  const interior = manifest.interior;
  const x = interior ? clamp(point.x, interior.min[0], interior.max[0]) : point.x;
  const z = interior ? clamp(point.z, interior.min[2], interior.max[2]) : point.z;
  return { kind: "xyz", position: [x, 0, z] };
}

function sameAnchor(a: Anchor | undefined, b: Anchor): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === "at" && b.kind === "at") return a.landmark === b.landmark;
  if (a.kind === "xyz" && b.kind === "xyz") return a.position.every((value, i) => value === b.position[i]);
  return false;
}

export function dropFieldOf(event: Pick<Event, "action">): DropField {
  return event.action === "walk" || event.action === "run" ? "from" : "at";
}

export function anchorDropPatch(
  event: Pick<Event, "id" | "at" | "from">,
  field: DropField,
  point: readonly [number, number, number],
  manifest: SceneManifest,
  by: string = DEFAULT_EDITOR,
): Patch | null {
  const anchor = anchorFor({ x: point[0], z: point[2] }, manifest);
  if (sameAnchor(event[field], anchor)) return null;
  return { op: "update_event", id: event.id, changes: { [field]: anchor }, sources: [by] };
}
