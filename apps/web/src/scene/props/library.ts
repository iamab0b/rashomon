import type { HeldInterval, ResolvedProp, Vec3 } from "@rashomon/engine";
import type { PropLibrary, PropType } from "./types";

const ARTICLE = /^(a|an|the)\s+/;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stripArticle(s: string): string {
  return s.replace(ARTICLE, "");
}

export function getPropType(lib: PropLibrary, type: string): PropType | undefined {
  return lib.find((p) => p.type === type);
}

export function matchAlias(lib: PropLibrary, text: string): PropType | null {
  const haystack = ` ${stripArticle(normalize(text))} `;
  let best: PropType | null = null;
  let bestLen = 0;
  for (const entry of lib) {
    for (const alias of entry.aliases) {
      const a = stripArticle(normalize(alias));
      if (a === "" || a.length <= bestLen) continue;
      if (haystack.includes(` ${a} `)) {
        best = entry;
        bestLen = a.length;
      }
    }
  }
  return best;
}

export function modelScale(entry: PropType, boundingBoxSize: Vec3): number {
  const modelMax = Math.max(...boundingBoxSize);
  if (!(modelMax > 0)) return 1;
  const { l, w, h } = entry.dimensionsM;
  return Math.max(l, w, h) / modelMax;
}

export type SceneProp = {
  id: string;
  entry: PropType | null;
  position: Vec3;
  heldByIntervals: HeldInterval[] | undefined;
};

export function propsInScene(lib: PropLibrary, resolvedProps: ResolvedProp[]): SceneProp[] {
  return resolvedProps.map((p) => ({
    id: p.id,
    entry: getPropType(lib, p.type) ?? null,
    position: p.position,
    heldByIntervals: p.heldByIntervals,
  }));
}
