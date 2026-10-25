import type { AnimationClip } from "three";
import { prepareGeneratedClip, type GltfLike } from "./generatedClip";
import { cacheKey, type MotionCache } from "./motionCache";
import { genClipName } from "./verb";

export const MOTION_READY = "ready";

export type GeneratedMotion = {
  readonly verb: string;
  readonly status: string;
  readonly characterId?: string;
  readonly motionId?: string;
  readonly url?: string;
};

export type MotionDownload = (characterId: string, motionId: string) => Promise<ArrayBuffer>;

export type MotionLoaderDeps = {
  readonly cache: MotionCache;
  readonly download?: MotionDownload;
  readonly fetchUrl: (url: string) => Promise<ArrayBuffer>;
  readonly parse: (bytes: ArrayBuffer) => Promise<GltfLike>;
  readonly register: (clip: AnimationClip) => void;
};

export type MotionLoadResult = "registered" | "unavailable" | "failed";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const GLB_MAGIC = 0x46546c67;

export function isGlb(bytes: ArrayBuffer): boolean {
  return bytes.byteLength >= 12 && new DataView(bytes).getUint32(0, true) === GLB_MAGIC;
}

export function motionLoadKey(motion: GeneratedMotion): string | undefined {
  if (motion.status !== MOTION_READY) return undefined;
  const name = genClipName(motion.verb);
  if (name === undefined || motion.characterId === undefined || motion.motionId === undefined) return undefined;
  if (!ID_PATTERN.test(motion.characterId) || !ID_PATTERN.test(motion.motionId)) return undefined;
  return cacheKey(motion.characterId, motion.motionId);
}

async function bytesFor(motion: GeneratedMotion, key: string, deps: MotionLoaderDeps): Promise<ArrayBuffer | undefined> {
  const cached = await deps.cache.get(key);
  if (cached && isGlb(cached)) return cached;
  const { characterId, motionId } = motion as Required<Pick<GeneratedMotion, "characterId" | "motionId">>;
  const downloaded = motion.url !== undefined ? await deps.fetchUrl(motion.url) : await deps.download?.(characterId, motionId);
  if (!downloaded) return undefined;
  if (!isGlb(downloaded)) throw new Error(`generated motion ${motionId} is not a GLB`);
  await deps.cache.put(key, downloaded);
  return downloaded;
}

export async function loadGeneratedMotion(motion: GeneratedMotion, deps: MotionLoaderDeps): Promise<MotionLoadResult> {
  const key = motionLoadKey(motion);
  const name = genClipName(motion.verb);
  if (key === undefined || name === undefined) return "unavailable";
  try {
    const bytes = await bytesFor(motion, key, deps);
    if (!bytes) return "unavailable";
    deps.register(prepareGeneratedClip(name, await deps.parse(bytes)));
    return "registered";
  } catch (error) {
    console.warn(`generated motion for "${motion.verb}" not loaded; its event keeps the nearest clip`, error);
    return "failed";
  }
}
