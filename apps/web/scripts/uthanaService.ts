export const UTHANA_ROUTE = "/__uthana";
export const MAX_GLB_BYTES = 16 * 1024 * 1024;
export const GLB_CONTENT_TYPE = "model/gltf-binary";

const UTHANA_ORIGIN = "https://uthana.com";
const MOTION_PATH = /^\/motion\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,64})\.glb$/;
const LOCAL_ADDRESSES: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const UPSTREAM_TIMEOUT_MS = 30_000;

export type UthanaFetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

export type UthanaServiceDeps = {
  readonly apiKey: () => string | undefined;
  readonly characterId: () => string | undefined;
  readonly fetch: UthanaFetch;
  readonly log: (message: string) => void;
};

export type UthanaInput = {
  readonly remoteAddress: string | undefined;
  readonly method: string | undefined;
  readonly path: string;
  readonly contentLength: string | undefined;
};

export type UthanaOutput =
  | { readonly status: 200; readonly contentType: typeof GLB_CONTENT_TYPE; readonly body: Uint8Array }
  | { readonly status: number; readonly contentType: "application/json"; readonly body: { readonly error: string } };

function reply(status: number, error: string): UthanaOutput {
  return { status, contentType: "application/json", body: { error } };
}

export function upstreamUrl(characterId: string, motionId: string): string {
  return `${UTHANA_ORIGIN}/motion/file/motion_viewer/${characterId}/${motionId}/glb/${motionId}.glb?no_mesh=true&fps=30`;
}

export function basicAuth(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

function readEnv(read: () => string | undefined): string | undefined {
  const value = read()?.trim();
  return value ? value : undefined;
}

async function readCapped(response: Response): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_GLB_BYTES) return null;
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_GLB_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function createUthanaService(deps: UthanaServiceDeps): (input: UthanaInput) => Promise<UthanaOutput> {
  return async (input) => {
    if (!input.remoteAddress || !LOCAL_ADDRESSES.has(input.remoteAddress)) {
      return reply(403, "generated motion is only available from localhost");
    }
    if (input.method !== "GET") return reply(405, "only GET is supported");
    if (input.contentLength !== undefined && input.contentLength !== "0") return reply(413, "request body not allowed");
    const match = MOTION_PATH.exec(input.path);
    if (!match) return reply(400, "path must be /motion/<characterId>/<motionId>.glb");
    const [, characterId, motionId] = match as unknown as [string, string, string];
    const expectedCharacter = readEnv(deps.characterId);
    if (expectedCharacter !== undefined && characterId !== expectedCharacter) {
      return reply(400, "characterId does not match this dev server");
    }
    const apiKey = readEnv(deps.apiKey);
    if (!apiKey) {
      deps.log("uthana proxy: UTHANA_API_KEY is not set in the dev server's shell");
      return reply(503, "generated motion is not configured on this dev server");
    }
    const scrub = (text: string): string => text.split(apiKey).join("[redacted]");
    try {
      const response = await deps.fetch(upstreamUrl(characterId, motionId), {
        headers: { authorization: basicAuth(apiKey) },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (!response.ok) {
        deps.log(`uthana proxy: ${motionId} upstream HTTP ${response.status}`);
        return reply(502, "generated motion download failed; see the dev server terminal");
      }
      const body = await readCapped(response);
      if (!body) {
        deps.log(`uthana proxy: ${motionId} is larger than ${MAX_GLB_BYTES} bytes`);
        return reply(502, "generated motion download failed; see the dev server terminal");
      }
      return { status: 200, contentType: GLB_CONTENT_TYPE, body };
    } catch (error) {
      deps.log(scrub(`uthana proxy: ${motionId} request failed: ${error instanceof Error ? error.message : String(error)}`));
      return reply(502, "generated motion download failed; see the dev server terminal");
    }
  };
}
