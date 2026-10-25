import { MAX_VERB_CHARS } from "@rashomon/schema";

export const GENERATED_CLIP_PREFIX = "gen_";

const GENERATABLE_VERB = /^[a-z][a-z' -]*$/;

export function normalizeVerb(verb: string): string | undefined {
  const normalized = verb.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length > MAX_VERB_CHARS || !GENERATABLE_VERB.test(normalized)) return undefined;
  return normalized;
}

export function genClipName(verb: string): string | undefined {
  const normalized = normalizeVerb(verb);
  return normalized === undefined ? undefined : `${GENERATED_CLIP_PREFIX}${normalized}`;
}
