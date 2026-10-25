import type { IncomingMessage } from "node:http";
import { proposeLandmarks, type CallLandmarkModel, type LandmarkResponse } from "../src/scene/labeling/auto/model";
import { MAX_BODY_BYTES, parseLandmarkPayload } from "../src/scene/labeling/auto/payload";
import type { ToolProposal } from "../src/scene/labeling/auto/tool";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
export const MODEL_TIMEOUT_MS = 90_000;

export type LandmarkServiceDeps = {
  readonly apiKey: () => string | undefined;
  readonly fetch: typeof fetch;
  readonly log: (message: string) => void;
};

export type LandmarkInput = {
  readonly remoteAddress: string | undefined;
  readonly contentType: string | undefined;
  readonly rawBody: string;
};

export type LandmarkOutput = {
  readonly status: number;
  readonly body: { readonly proposals: ToolProposal[]; readonly dropped: number } | { readonly error: string };
};

const LOCAL_ADDRESSES: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const JSON_CONTENT_TYPE = "application/json";
const FAILED = "landmark suggestion failed; see the dev server terminal";

export class BodyTooLarge extends Error {}

export function readCappedBody(req: Pick<IncomingMessage, "on">, cap: number = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > cap) {
        done = true;
        chunks.length = 0;
        reject(new BodyTooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!done) resolveBody(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function reply(status: number, error: string): LandmarkOutput {
  return { status, body: { error } };
}

function anthropicCaller(apiKey: string, fetchImpl: typeof fetch): CallLandmarkModel {
  return async (request) => {
    const res = await fetchImpl(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": JSON_CONTENT_TYPE, "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    return (await res.json()) as LandmarkResponse;
  };
}

function scrub(text: string, secret: string): string {
  return secret === "" ? text : text.split(secret).join("[key]");
}

export function createLandmarkService(deps: LandmarkServiceDeps): (input: LandmarkInput) => Promise<LandmarkOutput> {
  let running = false;

  return async (input) => {
    if (!input.remoteAddress || !LOCAL_ADDRESSES.has(input.remoteAddress)) {
      return reply(403, "landmark suggestions are only available from localhost");
    }
    if (!input.contentType?.toLowerCase().startsWith(JSON_CONTENT_TYPE)) {
      return reply(415, `content-type must be ${JSON_CONTENT_TYPE}`);
    }
    if (Buffer.byteLength(input.rawBody, "utf8") > MAX_BODY_BYTES) return reply(413, "request body too large");
    let json: unknown;
    try {
      json = JSON.parse(input.rawBody);
    } catch {
      return reply(400, "invalid request");
    }
    const parsed = parseLandmarkPayload(json);
    if (!parsed.ok) {
      deps.log(`landmark request rejected: ${parsed.error}`);
      return reply(400, "invalid request");
    }
    const apiKey = deps.apiKey()?.trim() ?? "";
    if (apiKey === "") {
      deps.log("landmark suggestions need ANTHROPIC_API_KEY in the dev server's environment");
      return reply(503, FAILED);
    }
    if (running) return reply(409, "a suggestion is already running");

    running = true;
    try {
      const result = await proposeLandmarks(parsed.value, anthropicCaller(apiKey, deps.fetch));
      if (!result.ok) {
        deps.log(`landmark suggestion failed: ${result.error}`);
        return reply(502, FAILED);
      }
      if (result.dropped > 0) deps.log(`landmark suggestion dropped ${result.dropped} invalid proposals`);
      return { status: 200, body: { proposals: result.proposals, dropped: result.dropped } };
    } catch (error) {
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      deps.log(`landmark suggestion failed: ${scrub(detail, apiKey)}`);
      return reply(502, FAILED);
    } finally {
      running = false;
    }
  };
}
