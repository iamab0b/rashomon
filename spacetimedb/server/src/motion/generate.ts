import type { Identity } from "spacetimedb";
import { TimeDuration } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import type { ReducerCtx, SyncResponse } from "spacetimedb/server";
import type { ModuleSchema } from "../graph";
import { MOTION_FAILED, MOTION_PENDING, MOTION_READY, motionKey, normalizeVerb } from "./queue";

export const UTHANA_GRAPHQL_URL = "https://uthana.com/graphql";
export const UTHANA_MODEL = "text-to-motion-bucmd";
export const UTHANA_TIMEOUT_MS = 55_000;
export const NOT_THE_MODULE = "run_motion_generation can only be called by the module itself";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const CREATE_TEXT_TO_MOTION = `mutation ($prompt: String!, $model: String, $length: Float, $character: String) {
  create_text_to_motion(prompt: $prompt, model: $model, length: $length, character_id: $character) { motion { id name } }
}`;

export type MotionErrorCode =
  | "no_api_key"
  | "no_character"
  | "bad_verb"
  | "unreachable"
  | "unauthorized"
  | "rejected"
  | "server_error"
  | "bad_response"
  | "api_error";

export type MotionIo = {
  apiKey: () => string | undefined;
  characterId: () => string | undefined;
  http: {
    fetch(url: string, init: { method: string; headers: Record<string, string>; body: string; timeout: TimeDuration }): SyncResponse;
  };
  withTx<T>(body: (ctx: ReducerCtx<ModuleSchema>) => T): T;
};

export type MotionJob = { sessionId: string; verb: string; lengthS: number };

export type MotionResult = { status: string; motionId?: string; error?: MotionErrorCode };

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += BASE64[(n >> 18) & 63]! + BASE64[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63]! : "=";
    out += i + 2 < bytes.length ? BASE64[n & 63]! : "=";
  }
  return out;
}

export const promptFor = (verb: string): string => `a person ${verb}`;

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function readEnv(read: () => string | undefined): string | undefined {
  try {
    const value = read()?.trim();
    return value ? value : undefined;
  } catch {
    return undefined;
  }
}

const codeForStatus = (status: number): MotionErrorCode => {
  if (status === 401 || status === 403) return "unauthorized";
  if (status >= 400 && status < 500) return "rejected";
  return "server_error";
};

type Called = { motionId: string } | { code: MotionErrorCode; detail: string };

function callUthana(io: MotionIo, apiKey: string, characterId: string, job: MotionJob): Called {
  const scrub = (text: string): string => text.split(apiKey).join("[redacted]");
  let response: SyncResponse;
  try {
    response = io.http.fetch(UTHANA_GRAPHQL_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${base64(`${apiKey}:`)}` },
      body: JSON.stringify({
        query: CREATE_TEXT_TO_MOTION,
        variables: { prompt: promptFor(job.verb), model: UTHANA_MODEL, length: job.lengthS, character: characterId },
      }),
      timeout: TimeDuration.fromMillis(UTHANA_TIMEOUT_MS),
    });
  } catch (e) {
    return { code: "unreachable", detail: scrub(`request to Uthana failed: ${messageOf(e)}`) };
  }
  if (response.status !== 200) return { code: codeForStatus(response.status), detail: `Uthana returned HTTP ${response.status}` };
  let body: { errors?: { message?: unknown }[]; data?: { create_text_to_motion?: { motion?: { id?: unknown } } } };
  try {
    body = response.json() as typeof body;
  } catch {
    return { code: "bad_response", detail: "the Uthana response was not valid JSON" };
  }
  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    const first = body.errors[0]?.message;
    return { code: "api_error", detail: scrub(`Uthana error: ${typeof first === "string" ? first.slice(0, 200) : "unknown"}`) };
  }
  const motionId = body?.data?.create_text_to_motion?.motion?.id;
  if (typeof motionId !== "string" || !ID_PATTERN.test(motionId)) {
    return { code: "bad_response", detail: "the Uthana response had no usable motion id" };
  }
  return { motionId };
}

function finish(io: MotionIo, job: MotionJob, outcome: { motionId: string; characterId: string } | { code: MotionErrorCode }): MotionResult {
  return io.withTx((ctx) => {
    const row = ctx.db.generatedMotions.rowKey.find(motionKey(job.sessionId, job.verb));
    if (!row) return { status: MOTION_FAILED, error: "bad_verb" };
    if ("code" in outcome) {
      ctx.db.generatedMotions.rowKey.update({ ...row, status: MOTION_FAILED, error: outcome.code });
      return { status: MOTION_FAILED, error: outcome.code };
    }
    ctx.db.generatedMotions.rowKey.update({
      ...row,
      status: MOTION_READY,
      motionId: outcome.motionId,
      characterId: outcome.characterId,
      error: undefined,
    });
    return { status: MOTION_READY, motionId: outcome.motionId };
  });
}

function fail(io: MotionIo, job: MotionJob, code: MotionErrorCode, detail: string): MotionResult {
  console.error(`run_motion_generation ${job.sessionId}/${job.verb} ${code}: ${detail}`);
  return finish(io, job, { code });
}

export function runMotionJob(io: MotionIo, job: MotionJob): MotionResult {
  const pending = io.withTx((ctx) => ctx.db.generatedMotions.rowKey.find(motionKey(job.sessionId, job.verb))?.status === MOTION_PENDING);
  if (!pending) return { status: "skipped" };
  if (normalizeVerb(job.verb) !== job.verb) return fail(io, job, "bad_verb", "the queued verb is not a normalized verb");
  const apiKey = readEnv(io.apiKey);
  if (!apiKey) return fail(io, job, "no_api_key", "UTHANA_API_KEY is not set on this module");
  const characterId = readEnv(io.characterId);
  if (!characterId || !ID_PATTERN.test(characterId)) {
    return fail(io, job, "no_character", "UTHANA_CHARACTER_ID is not set to a valid id on this module");
  }
  const called = callUthana(io, apiKey, characterId, job);
  if ("code" in called) return fail(io, job, called.code, called.detail);
  return finish(io, job, { motionId: called.motionId, characterId });
}

export function generateAs(
  caller: { sender: Identity; databaseIdentity: Identity },
  io: () => MotionIo,
  job: MotionJob,
): MotionResult {
  if (!caller.sender.isEqual(caller.databaseIdentity)) throw new SenderError(NOT_THE_MODULE);
  return runMotionJob(io(), job);
}
