import { MAX_CANDIDATES } from "./candidates";

export const VIEW_COUNT = 3;
export const MAX_IMAGE_BYTES = 400 * 1024;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_SIZE_M = 100;

const CANDIDATE_ID = /^c[1-9][0-9]?$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const JPEG_BASE64_PREFIX = "/9j/";
const PAYLOAD_KEYS = ["images", "candidates"];
const CANDIDATE_KEYS = ["id", "size"];

export type CandidateSummary = { readonly id: string; readonly size: [number, number, number] };

export type LandmarkPayload = { readonly images: string[]; readonly candidates: CandidateSummary[] };

export type PayloadResult = { readonly ok: true; readonly value: LandmarkPayload } | { readonly ok: false; readonly error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function base64Bytes(text: string): number {
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  return (text.length / 4) * 3 - padding;
}

function imageError(value: unknown): string | null {
  if (typeof value !== "string" || value.length % 4 !== 0 || !BASE64.test(value)) return "images must be base64 strings";
  if (!value.startsWith(JPEG_BASE64_PREFIX)) return "images must be JPEG";
  if (base64Bytes(value) > MAX_IMAGE_BYTES) return "an image is too large";
  return null;
}

function candidateOf(value: unknown): CandidateSummary | null {
  if (!isRecord(value) || !hasOnly(value, CANDIDATE_KEYS)) return null;
  const { id, size } = value;
  if (typeof id !== "string" || !CANDIDATE_ID.test(id)) return null;
  if (!Array.isArray(size) || size.length !== 3) return null;
  if (!size.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= MAX_SIZE_M)) return null;
  return { id, size: [size[0], size[1], size[2]] };
}

export function parseLandmarkPayload(body: unknown): PayloadResult {
  if (!isRecord(body)) return { ok: false, error: "body must be a JSON object" };
  if (!hasOnly(body, PAYLOAD_KEYS)) return { ok: false, error: "unknown field" };
  const { images, candidates } = body;
  if (!Array.isArray(images) || images.length !== VIEW_COUNT) return { ok: false, error: `images must hold ${VIEW_COUNT} views` };
  for (const image of images) {
    const error = imageError(image);
    if (error) return { ok: false, error };
  }
  if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > MAX_CANDIDATES) {
    return { ok: false, error: `candidates must hold 1 to ${MAX_CANDIDATES} entries` };
  }
  const parsed: CandidateSummary[] = [];
  const seen = new Set<string>();
  for (const value of candidates) {
    const candidate = candidateOf(value);
    if (!candidate || seen.has(candidate.id)) return { ok: false, error: "candidates must have unique ids and sizes in metres" };
    seen.add(candidate.id);
    parsed.push(candidate);
  }
  return { ok: true, value: { images: images as string[], candidates: parsed } };
}
