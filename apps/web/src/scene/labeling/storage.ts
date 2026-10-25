import type { Interior, Landmark, SceneManifest } from "@rashomon/schema";
import { IDB_PREFIX, type ScanRequest } from "../loaders/scanRequest";
import { parseManifestText, type ManifestResult } from "./validate";

export const MANIFEST_KEY_PREFIX = "rashomon.manifest.";
export const LOCAL_SOURCE_PREFIX = "local:";

export type ManifestStorage = Pick<Storage, "getItem" | "setItem">;

export function manifestKey(sceneId: string): string {
  return `${MANIFEST_KEY_PREFIX}${sceneId}`;
}

export function browserStorage(): ManifestStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function buildManifest(
  base: Pick<SceneManifest, "sceneId" | "meshUrl">,
  landmarks: readonly Landmark[],
  interior: Interior | undefined,
): SceneManifest {
  return {
    sceneId: base.sceneId,
    meshUrl: base.meshUrl,
    up: "y",
    unitsPerMeter: 1,
    eyeHeight: 1.6,
    landmarks: landmarks.map((landmark) => ({ ...landmark })),
    ...(interior ? { interior } : {}),
  };
}

export function saveManifest(
  manifest: SceneManifest,
  storage: ManifestStorage | null = browserStorage(),
): { ok: true } | { ok: false; error: string } {
  if (!storage) return { ok: false, error: "Local storage is unavailable" };
  try {
    storage.setItem(manifestKey(manifest.sceneId), JSON.stringify(manifest));
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not write to local storage" };
  }
}

export function readSavedManifest(sceneId: string, storage: ManifestStorage | null = browserStorage()): ManifestResult {
  if (!storage) return { ok: false, error: "Local storage is unavailable" };
  let text: string | null;
  try {
    text = storage.getItem(manifestKey(sceneId));
  } catch {
    return { ok: false, error: "Could not read local storage" };
  }
  if (text === null) return { ok: false, error: `No saved manifest for "${sceneId}"` };
  const result = parseManifestText(text);
  return result.ok ? result : { ok: false, error: `Saved manifest "${sceneId}" is invalid: ${result.error}` };
}

export type ManifestSource = { kind: "none" } | { kind: "ok"; manifest: SceneManifest } | { kind: "error"; error: string };

export function manifestSourceFromSearch(search: string, storage: ManifestStorage | null = browserStorage()): ManifestSource {
  const param = new URLSearchParams(search).get("manifest");
  if (param === null) return { kind: "none" };
  if (!param.startsWith(LOCAL_SOURCE_PREFIX) || param.length === LOCAL_SOURCE_PREFIX.length) {
    return { kind: "error", error: `Unsupported manifest "${param}"` };
  }
  const result = readSavedManifest(param.slice(LOCAL_SOURCE_PREFIX.length), storage);
  return result.ok ? { kind: "ok", manifest: result.manifest } : { kind: "error", error: result.error };
}

export function isLandmarkEditing(search: string): boolean {
  return new URLSearchParams(search).get("edit") === "landmarks";
}

export function isGraphlessSearch(search: string): boolean {
  const params = new URLSearchParams(search);
  return isLandmarkEditing(search) || (params.has("manifest") && !params.get("scene"));
}

export function isEditorOpen(search: string): boolean {
  return isLandmarkEditing(search) && new URLSearchParams(search).get("debug") !== "rig";
}

export function scanRequestForSavedManifest(manifest: SceneManifest): ScanRequest | null {
  if (!manifest.meshUrl.startsWith(IDB_PREFIX)) return null;
  return {
    scan: { kind: "idb", hash: manifest.meshUrl.slice(IDB_PREFIX.length) },
    manifest: { kind: "local", sceneId: manifest.sceneId },
  };
}

export function searchWithMesh(search: string, meshUrl: string): string {
  const params = new URLSearchParams(search);
  params.set("scene", meshUrl);
  params.delete("manifest");
  return `?${params.toString()}`;
}
