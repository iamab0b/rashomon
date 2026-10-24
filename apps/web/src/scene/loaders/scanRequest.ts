import type { SceneManifest } from "@rashomon/schema";

export const MAX_SCAN_BYTES = 200 * 1024 * 1024;
export const IDB_PREFIX = "idb:";
export const LOCAL_MANIFEST_PREFIX = "local:";
export const LIVE_SCAN_MESSAGE = "Live mode needs the scan's manifest on the server";
const LOCAL_MANIFEST_KEY_PREFIX = "rashomon.manifest.";
const MEGABYTE = 1024 * 1024;

export type ScanLocation = { readonly kind: "url"; readonly url: string } | { readonly kind: "idb"; readonly hash: string };

export type ManifestLocation =
  | { readonly kind: "local"; readonly sceneId: string }
  | { readonly kind: "url"; readonly url: string };

export type ScanRequest = {
  readonly scan: ScanLocation;
  readonly manifest: ManifestLocation | null;
};

export function scanLocation(value: string): ScanLocation {
  return value.startsWith(IDB_PREFIX) ? { kind: "idb", hash: value.slice(IDB_PREFIX.length) } : { kind: "url", url: value };
}

export function scanRequestFromSearch(search: string): ScanRequest | null {
  const params = new URLSearchParams(search);
  const scene = params.get("scene");
  if (!scene) return null;
  const manifest = params.get("manifest");
  return {
    scan: scanLocation(scene),
    manifest: !manifest
      ? null
      : manifest.startsWith(LOCAL_MANIFEST_PREFIX)
        ? { kind: "local", sceneId: manifest.slice(LOCAL_MANIFEST_PREFIX.length) }
        : { kind: "url", url: manifest },
  };
}

export function scanFailure(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get("scene") && params.get("mode") === "live" ? LIVE_SCAN_MESSAGE : null;
}

export function searchWithScan(search: string, hash: string): string {
  const params = new URLSearchParams(search);
  params.set("scene", `${IDB_PREFIX}${hash}`);
  return `?${params.toString()}`;
}

export function tooLargeMessage(bytes: number): string | null {
  if (bytes <= MAX_SCAN_BYTES) return null;
  return `This scan is ${Math.ceil(bytes / MEGABYTE)} MB; scans are capped at ${MAX_SCAN_BYTES / MEGABYTE} MB.`;
}

export function idbUrl(hash: string): string {
  return `${IDB_PREFIX}${hash}`;
}

export function localManifestKey(sceneId: string): string {
  return `${LOCAL_MANIFEST_KEY_PREFIX}${sceneId}`;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fetchScanBytes(url: string, fetcher: typeof fetch = fetch): Promise<ArrayBuffer> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`The scan at ${url} could not be fetched (${response.status})`);
  const declared = Number(response.headers.get("content-length"));
  const early = Number.isFinite(declared) ? tooLargeMessage(declared) : null;
  if (early) throw new Error(early);
  const bytes = await response.arrayBuffer();
  const late = tooLargeMessage(bytes.byteLength);
  if (late) throw new Error(late);
  return bytes;
}

function isManifest(value: unknown): value is SceneManifest {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return typeof m.sceneId === "string" && Array.isArray(m.landmarks);
}

export async function loadSuppliedManifest(
  location: ManifestLocation,
  fetcher: typeof fetch = fetch,
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): Promise<SceneManifest> {
  let value: unknown;
  if (location.kind === "local") {
    let text: string | null;
    try {
      text = storage ? storage.getItem(localManifestKey(location.sceneId)) : null;
    } catch (error) {
      throw new Error(`The local manifest "${location.sceneId}" could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (text === null) throw new Error(`No local manifest named "${location.sceneId}" in this browser`);
    value = JSON.parse(text);
  } else {
    const response = await fetcher(location.url);
    if (!response.ok) throw new Error(`The manifest at ${location.url} could not be fetched (${response.status})`);
    value = await response.json();
  }
  if (!isManifest(value)) throw new Error("The supplied manifest has no sceneId or landmarks");
  return value;
}
