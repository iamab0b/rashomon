import type { PropLibrary } from "./types";

export type PreloadReport = { existing: string[]; missing: string[] };

export async function checkPropModels(
  lib: PropLibrary,
  fileExists: (url: string) => boolean | Promise<boolean>,
): Promise<PreloadReport> {
  const urls = [...new Set(lib.map((p) => p.modelUrl))];
  const flags = await Promise.all(urls.map((u) => fileExists(u)));
  return {
    existing: urls.filter((_, i) => flags[i]),
    missing: urls.filter((_, i) => !flags[i]),
  };
}
