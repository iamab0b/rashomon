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

export function tooLargeMessage(bytes: number, max: number = MAX_SCAN_BYTES): string | null {
  if (bytes <= max) return null;
  return `This scan is ${Math.ceil(bytes / MEGABYTE)} MB; scans are capped at ${Math.round(max / MEGABYTE)} MB.`;
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

export async function fetchScanBytes(
  url: string,
  fetcher: typeof fetch = fetch,
  max: number = MAX_SCAN_BYTES,
): Promise<ArrayBuffer> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`The scan at ${url} could not be fetched (${response.status})`);
  const declared = Number(response.headers.get("content-length"));
  const early = Number.isFinite(declared) ? tooLargeMessage(declared, max) : null;
  if (early) throw new Error(early);
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    const late = tooLargeMessage(bytes.byteLength, max);
    if (late) throw new Error(late);
    return bytes;
  }
  return readCapped(response.body, max);
}

async function readCapped(body: ReadableStream<Uint8Array>, max: number): Promise<ArrayBuffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    const tooLarge = tooLargeMessage(total, max);
    if (tooLarge) {
      await reader.cancel().catch(() => undefined);
      throw new Error(tooLarge);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

const isVec3 = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number" && Number.isFinite(n));

function isLandmark(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const l = value as Record<string, unknown>;
  const bounds = l.bounds as Record<string, unknown> | null | undefined;
  return (
    typeof l.id === "string" &&
    typeof l.label === "string" &&
    Array.isArray(l.aliases) &&
    isVec3(l.position) &&
    typeof bounds === "object" &&
    bounds !== null &&
    isVec3(bounds.min) &&
    isVec3(bounds.max) &&
    typeof l.kind === "string" &&
    typeof l.occludes === "boolean"
  );
}

function isManifest(value: unknown): value is SceneManifest {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  const interior = m.interior as Record<string, unknown> | null | undefined;
  const interiorOk = interior === undefined || (typeof interior === "object" && interior !== null && isVec3(interior.min) && isVec3(interior.max));
  return typeof m.sceneId === "string" && Array.isArray(m.landmarks) && m.landmarks.every(isLandmark) && interiorOk;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The supplied manifest is not valid JSON");
  }
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
    value = parseJson(text);
  } else {
    const response = await fetcher(location.url);
    if (!response.ok) throw new Error(`The manifest at ${location.url} could not be fetched (${response.status})`);
    value = parseJson(await response.text());
  }
  if (!isManifest(value)) throw new Error("The supplied manifest is malformed: it needs a sceneId and well-formed landmarks");
  return value;
}
