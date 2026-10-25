import type { SceneGeom } from "@rashomon/engine";
import type { Interior, SceneManifest } from "@rashomon/schema";
import { Group, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ownMaterials } from "../characters/materials";
import {
  alignToFloor,
  applyAlignment,
  boundsOf,
  fitFloorNormal,
  FLOOR_FIT_RADIUS_M,
  IDENTITY_ALIGNMENT,
  isAlignment,
  isUnitScale,
  METRES,
  toRootSpace,
  type Alignment,
  type OriginChoice,
  type Vec3,
} from "./alignment";
import { enableShadows, tagCollision } from "./scene";
import { bakeMeshes, extractScanGeom } from "./scanGeom";
import {
  fetchScanBytes,
  idbUrl,
  loadSuppliedManifest,
  sha256Hex,
  tooLargeMessage,
  type ScanRequest,
} from "./scanRequest";
import { makeScanUnlit, scanLitFromSearch } from "./scanUnlit";
import { patchScan, putScanBytes, readScan } from "./scanStore";

export const SCAN_ROOT = "scan_root";

export type ScanDeps = {
  readonly idb?: IDBFactory;
  readonly fetcher?: typeof fetch;
  readonly storage?: Pick<Storage, "getItem">;
  readonly parse?: (bytes: ArrayBuffer) => Promise<Object3D>;
  readonly lit?: boolean;
};

export type LoadedScan = {
  readonly hash: string;
  readonly name: string;
  readonly meshUrl: string;
  readonly raw: Object3D;
  readonly model: Group;
  readonly alignment: Alignment;
  readonly aligned: boolean;
  readonly geom: SceneGeom;
  readonly manifest: SceneManifest;
  readonly supplied: boolean;
};

export type FloorClick = {
  readonly object: Object3D;
  readonly faceIndex: number;
  readonly point: Vec3;
  readonly direction: Vec3;
};

export function alignmentFromClick(
  scan: Pick<LoadedScan, "raw">,
  click: FloorClick,
  metresPerUnit: number,
  origin: OriginChoice,
): Alignment | null {
  const baked = bakeMeshes(scan.raw);
  const hit = baked.find((mesh) => mesh.mesh === click.object);
  if (!hit || click.faceIndex < 0 || 3 * click.faceIndex + 2 >= hit.indices.length) return null;
  const local = toRootSpace(scan.raw, click.point, click.direction);
  const scale = isUnitScale(metresPerUnit) ? metresPerUnit : METRES;
  const normal = fitFloorNormal(hit.positions, hit.indices, click.faceIndex, local.point, FLOOR_FIT_RADIUS_M / scale, local.direction);
  return alignToFloor({ normal, point: local.point }, scale, origin, baked.map((mesh) => mesh.positions));
}

export async function parseGlb(bytes: ArrayBuffer): Promise<Object3D> {
  const gltf = await new GLTFLoader().parseAsync(bytes, "");
  return gltf.scene;
}

export function scanInterior(geom: SceneGeom): Interior | undefined {
  return boundsOf(geom.meshes.map((mesh) => mesh.positions)) ?? undefined;
}

export function scanManifest(hash: string, meshUrl: string, geom: SceneGeom): SceneManifest {
  const interior = scanInterior(geom);
  return {
    sceneId: `scan:${hash}`,
    meshUrl,
    up: "y",
    unitsPerMeter: 1,
    eyeHeight: 1.6,
    landmarks: [],
    ...(interior ? { interior } : {}),
  };
}

async function scanBytes(
  request: ScanRequest,
  deps: ScanDeps,
): Promise<{ hash: string; name: string; meshUrl: string; bytes: ArrayBuffer; alignment?: Alignment; geom?: SceneGeom }> {
  if (request.scan.kind === "idb") {
    const record = await readScan(request.scan.hash, deps.idb);
    if (!record?.bytes) throw new Error(`No stored scan ${request.scan.hash.slice(0, 12)} in this browser; drop the GLB again`);
    return { ...record, bytes: record.bytes, meshUrl: idbUrl(record.hash) };
  }
  const bytes = await fetchScanBytes(request.scan.url, deps.fetcher);
  const hash = await sha256Hex(bytes);
  const record = await readScan(hash, deps.idb);
  return {
    hash,
    name: request.scan.url,
    meshUrl: record?.bytes ? idbUrl(hash) : request.scan.url,
    bytes,
    ...(record?.alignment ? { alignment: record.alignment } : {}),
    ...(record?.geom ? { geom: record.geom } : {}),
  };
}

export async function loadScan(request: ScanRequest, deps: ScanDeps = {}): Promise<LoadedScan> {
  const source = await scanBytes(request, deps);
  const raw = await (deps.parse ?? parseGlb)(source.bytes);
  tagCollision(raw);
  if (deps.lit ?? scanLitFromSearch(globalThis.location?.search ?? "")) enableShadows(raw);
  else makeScanUnlit(raw);
  ownMaterials(raw);
  const aligned = isAlignment(source.alignment);
  const alignment = aligned ? source.alignment! : IDENTITY_ALIGNMENT;
  const model = new Group();
  model.name = SCAN_ROOT;
  model.add(raw);
  applyAlignment(model, alignment);
  const cached = aligned && source.geom ? source.geom : null;
  const geom = cached ?? extractScanGeom(raw, alignment);
  if (!cached && aligned) await patchScan(source.hash, source.name, { alignment, geom }, deps.idb);
  const supplied = request.manifest ? await loadSuppliedManifest(request.manifest, deps.fetcher, deps.storage) : null;
  return {
    hash: source.hash,
    name: source.name,
    meshUrl: source.meshUrl,
    raw,
    model,
    alignment,
    aligned,
    geom,
    manifest: supplied ?? scanManifest(source.hash, source.meshUrl, geom),
    supplied: supplied !== null,
  };
}

export async function realignScan(scan: LoadedScan, alignment: Alignment, deps: ScanDeps = {}): Promise<LoadedScan> {
  const geom = extractScanGeom(scan.raw, alignment);
  await patchScan(scan.hash, scan.name, { alignment, geom }, deps.idb);
  applyAlignment(scan.model, alignment);
  return {
    ...scan,
    alignment,
    aligned: true,
    geom,
    manifest: scan.supplied ? scan.manifest : scanManifest(scan.hash, scan.meshUrl, geom),
  };
}

export async function storeDroppedScan(file: File, deps: ScanDeps = {}): Promise<string> {
  const tooLarge = tooLargeMessage(file.size);
  if (tooLarge) throw new Error(tooLarge);
  const bytes = await file.arrayBuffer();
  const hash = await sha256Hex(bytes);
  await putScanBytes(hash, file.name, bytes, deps.idb);
  return hash;
}
