import { useEffect } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GraphSource } from "../../playback/graphSource";
import { registerClip } from "../clips";
import type { GltfLike } from "./generatedClip";
import { loadGeneratedMotion, motionLoadKey, type MotionLoaderDeps, type MotionLoadResult } from "./loadGeneratedMotion";
import { indexedDbCache } from "./motionCache";

const attempted = new Map<string, Promise<MotionLoadResult>>();

async function fetchUrl(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.arrayBuffer();
}

function parse(bytes: ArrayBuffer): Promise<GltfLike> {
  return new GLTFLoader().parseAsync(bytes, "");
}

let deps: MotionLoaderDeps | null = null;

function defaultDeps(): MotionLoaderDeps {
  deps ??= {
    cache: indexedDbCache(),
    download: import.meta.env.DEV
      ? (characterId, motionId) => import("./devDownload").then((module) => module.devDownload(characterId, motionId))
      : undefined,
    fetchUrl,
    parse,
    register: registerClip,
  };
  return deps;
}

export function syncGeneratedMotions(source: GraphSource, loaderDeps: MotionLoaderDeps, seen: Map<string, Promise<MotionLoadResult>>): void {
  for (const motion of source.generatedMotions?.() ?? []) {
    const key = motionLoadKey(motion);
    if (key === undefined || seen.has(key)) continue;
    seen.set(key, loadGeneratedMotion(motion, loaderDeps));
  }
}

export function useGeneratedMotions(source: GraphSource | null): void {
  useEffect(() => {
    if (!source?.generatedMotions) return;
    const sync = () => syncGeneratedMotions(source, defaultDeps(), attempted);
    sync();
    return source.subscribe(sync);
  }, [source]);
}
