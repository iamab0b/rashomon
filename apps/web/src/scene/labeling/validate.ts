import type { Landmark, SceneManifest } from "@rashomon/schema";
import { isLandmarkKind } from "./kinds";

export type ManifestResult = { ok: true; manifest: SceneManifest } | { ok: false; error: string };

type Vec3 = [number, number, number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number" && Number.isFinite(n));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function landmarkError(value: unknown, index: number): string | null {
  const where = `landmarks[${index}]`;
  if (!isRecord(value)) return `${where} is not an object`;
  if (!isNonEmptyString(value.id)) return `${where} has no id`;
  const name = `landmark "${value.id}"`;
  if (!isNonEmptyString(value.label)) return `${name} has an empty label`;
  if (!Array.isArray(value.aliases) || !value.aliases.every((alias) => typeof alias === "string")) {
    return `${name} aliases must be a list of strings`;
  }
  if (!isVec3(value.position)) return `${name} position must be three numbers`;
  if (!isLandmarkKind(value.kind)) return `${name} has an unknown kind`;
  if (typeof value.occludes !== "boolean") return `${name} occludes must be true or false`;
  const bounds = value.bounds;
  if (!isRecord(bounds) || !isVec3(bounds.min) || !isVec3(bounds.max)) return `${name} bounds must have min and max`;
  for (let axis = 0; axis < 3; axis += 1) {
    if ((bounds.min as Vec3)[axis]! > (bounds.max as Vec3)[axis]!) return `${name} bounds min exceeds max`;
  }
  return null;
}

function portalsError(value: unknown): string | null {
  if (!isRecord(value)) return "portals must be an object";
  const { waypoints, edges } = value;
  if (!Array.isArray(waypoints)) return "portals.waypoints must be a list";
  for (const waypoint of waypoints) {
    if (!isRecord(waypoint) || typeof waypoint.id !== "string" || !Number.isFinite(waypoint.x) || !Number.isFinite(waypoint.z)) {
      return "portals.waypoints entries need id, x and z";
    }
  }
  if (!Array.isArray(edges)) return "portals.edges must be a list";
  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 2 || edge.some((end) => typeof end !== "string")) {
      return "portals.edges entries must be pairs of waypoint ids";
    }
  }
  return null;
}

export function manifestError(value: unknown): string | null {
  if (!isRecord(value)) return "Manifest is not a JSON object";
  if (!isNonEmptyString(value.sceneId)) return "Manifest needs a sceneId";
  if (typeof value.meshUrl !== "string") return "Manifest needs a meshUrl";
  if (value.navmeshUrl !== undefined && typeof value.navmeshUrl !== "string") return "navmeshUrl must be a string";
  if (value.up !== "y") return 'Manifest up must be "y"';
  if (value.unitsPerMeter !== 1) return "Manifest unitsPerMeter must be 1";
  if (value.eyeHeight !== 1.6) return "Manifest eyeHeight must be 1.6";
  if (!Array.isArray(value.landmarks)) return "Manifest needs a landmarks list";
  const seen = new Set<string>();
  for (const [index, landmark] of value.landmarks.entries()) {
    const error = landmarkError(landmark, index);
    if (error) return error;
    const id = (landmark as Landmark).id;
    if (seen.has(id)) return `Duplicate landmark id "${id}"`;
    seen.add(id);
  }
  if (value.interior !== undefined) {
    const interior = value.interior;
    if (!isRecord(interior) || !isVec3(interior.min) || !isVec3(interior.max)) return "interior needs min and max";
    for (let axis = 0; axis < 3; axis += 1) {
      if ((interior.min as Vec3)[axis]! > (interior.max as Vec3)[axis]!) return "interior min exceeds max";
    }
  }
  if (value.portals !== undefined) return portalsError(value.portals);
  return null;
}

export function parseManifest(value: unknown): ManifestResult {
  const error = manifestError(value);
  if (error) return { ok: false, error };
  return { ok: true, manifest: value as SceneManifest };
}

export function parseManifestText(text: string): ManifestResult {
  try {
    return parseManifest(JSON.parse(text));
  } catch {
    return { ok: false, error: "Manifest is not valid JSON" };
  }
}
