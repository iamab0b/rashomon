import { resolve } from "node:path";
import type { CaptureShot } from "./shotCapture";
import { parseShotRequest, shotFileName, shotQuery } from "./shotRequest";

export type ShotServiceDeps = {
  readonly capture: CaptureShot;
  readonly origin: () => string | undefined;
  readonly outDir: string;
  readonly log: (message: string) => void;
};

export type ShotInput = {
  readonly remoteAddress: string | undefined;
  readonly contentType: string | undefined;
  readonly rawBody: string;
};

export type ShotOutput = {
  readonly status: number;
  readonly body: { readonly path: string } | { readonly error: string };
};

const LOCAL_ADDRESSES: ReadonlySet<string> = new Set(["127.0.0.1", "::1"]);
const JSON_CONTENT_TYPE = "application/json";

function reply(status: number, error: string): ShotOutput {
  return { status, body: { error } };
}

function parseJson(rawBody: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(rawBody) };
  } catch {
    return { error: "body is not valid JSON" };
  }
}

export function createShotService(deps: ShotServiceDeps): (input: ShotInput) => Promise<ShotOutput> {
  let capturing = false;

  return async (input) => {
    if (!input.remoteAddress || !LOCAL_ADDRESSES.has(input.remoteAddress)) {
      return reply(403, "shots are only available from localhost");
    }
    if (!input.contentType?.toLowerCase().startsWith(JSON_CONTENT_TYPE)) {
      return reply(415, `content-type must be ${JSON_CONTENT_TYPE}`);
    }
    const json = parseJson(input.rawBody);
    if ("error" in json) return reply(400, json.error);
    const parsed = parseShotRequest(json.value);
    if (!parsed.ok) return reply(400, parsed.error);
    const origin = deps.origin();
    if (!origin) return reply(500, "the dev server has no local url yet");
    if (capturing) return reply(409, "a capture is already running");

    const outFile = resolve(deps.outDir, shotFileName(parsed.value));
    capturing = true;
    try {
      await deps.capture({ baseUrl: origin, query: shotQuery(parsed.value), outFile });
      return { status: 200, body: { path: outFile } };
    } catch (error) {
      deps.log(`shot failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      return reply(500, "capture failed; see the dev server terminal");
    } finally {
      capturing = false;
    }
  };
}
