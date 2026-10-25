import { describe, expect, test, vi } from "vitest";
import {
  basicAuth,
  createUthanaService,
  GLB_CONTENT_TYPE,
  MAX_GLB_BYTES,
  upstreamUrl,
  type UthanaFetch,
  type UthanaInput,
} from "./uthanaService";

const KEY = "uthana-secret-key-value";
const CHARACTER = "cXChar01";
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);

const request = (overrides: Partial<UthanaInput> = {}): UthanaInput => ({
  remoteAddress: "127.0.0.1",
  method: "GET",
  path: `/motion/${CHARACTER}/mGen0001.glb`,
  contentLength: undefined,
  ...overrides,
});

function setup(options: { apiKey?: string; characterId?: string; fetch?: UthanaFetch } = {}) {
  const logs: string[] = [];
  const fetch = vi.fn<UthanaFetch>(options.fetch ?? (async () => new Response(GLB, { status: 200 })));
  const handle = createUthanaService({
    apiKey: () => ("apiKey" in options ? options.apiKey : KEY),
    characterId: () => ("characterId" in options ? options.characterId : CHARACTER),
    fetch,
    log: (message) => logs.push(message),
  });
  return { handle, fetch, logs };
}

describe("uthana proxy", () => {
  test("streams the GLB for a valid localhost request with Basic auth added", async () => {
    const { handle, fetch } = setup();

    const out = await handle(request());

    expect(out).toEqual({ status: 200, contentType: GLB_CONTENT_TYPE, body: GLB });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(upstreamUrl(CHARACTER, "mGen0001"));
    expect(url).toBe(`https://uthana.com/motion/file/motion_viewer/${CHARACTER}/mGen0001/glb/mGen0001.glb?no_mesh=true&fps=30`);
    expect(init.headers).toEqual({ authorization: basicAuth(KEY) });
    expect(basicAuth(KEY)).toBe(`Basic ${Buffer.from(`${KEY}:`).toString("base64")}`);
  });

  test.each(["::1", "::ffff:127.0.0.1"])("accepts the loopback address %s", async (remoteAddress) => {
    const { handle } = setup();

    expect((await handle(request({ remoteAddress }))).status).toBe(200);
  });

  test.each([undefined, "192.168.1.20", "10.0.0.5", "::ffff:192.168.1.20"])("refuses %s before any upstream call", async (remoteAddress) => {
    const { handle, fetch } = setup();

    const out = await handle(request({ remoteAddress }));

    expect(out.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    "/motion/cXChar01/../../secret.glb",
    "/motion/cXChar01/mGen0001.fbx",
    "/motion/cXChar01/m%2Fx.glb",
    `/motion/cXChar01/${"a".repeat(65)}.glb`,
    "/motion/cXChar01/.glb",
    "/motion/cXChar01",
    "/character/cXChar01.glb",
    "/motion/cXChar01/mGen0001.glb/extra",
  ])("refuses the path %s", async (path) => {
    const { handle, fetch } = setup();

    const out = await handle(request({ path }));

    expect(out.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("refuses a character id other than the dev server's", async () => {
    const { handle, fetch } = setup();

    expect((await handle(request({ path: "/motion/cSomeoneElse/mGen0001.glb" }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("refuses non-GET methods and request bodies", async () => {
    const { handle, fetch } = setup();

    expect((await handle(request({ method: "POST" }))).status).toBe(405);
    expect((await handle(request({ contentLength: "12" }))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("answers 503 without a key and never calls upstream", async () => {
    const { handle, fetch, logs } = setup({ apiKey: "  " });

    const out = await handle(request());

    expect(out).toEqual({ status: 503, contentType: "application/json", body: { error: "generated motion is not configured on this dev server" } });
    expect(fetch).not.toHaveBeenCalled();
    expect(logs).toHaveLength(1);
  });

  test("an upstream failure is a generic 502 and never echoes the key", async () => {
    const { handle, logs } = setup({ fetch: async () => new Response(`bad key ${KEY}`, { status: 401 }) });

    const out = await handle(request());

    expect(out.status).toBe(502);
    expect(JSON.stringify(out)).not.toContain(KEY);
    expect(logs.join("\n")).not.toContain(KEY);
  });

  test("a thrown upstream error is scrubbed of the key in the terminal and generic to the client", async () => {
    const { handle, logs } = setup({
      fetch: async () => {
        throw new Error(`connect failed for https://${KEY}@uthana.com`);
      },
    });

    const out = await handle(request());

    expect(out).toMatchObject({ status: 502, body: { error: "generated motion download failed; see the dev server terminal" } });
    expect(JSON.stringify(out)).not.toContain(KEY);
    expect(logs.join("\n")).toContain("[redacted]");
    expect(logs.join("\n")).not.toContain(KEY);
  });

  test("refuses an upstream body over the cap", async () => {
    const big = new Response(new Uint8Array(8), { status: 200, headers: { "content-length": String(MAX_GLB_BYTES + 1) } });
    const { handle } = setup({ fetch: async () => big });

    expect((await handle(request())).status).toBe(502);
  });

  test("refuses an undeclared upstream body that grows past the cap", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
    });
    const { handle } = setup({ fetch: async () => new Response(stream, { status: 200 }) });

    expect((await handle(request())).status).toBe(502);
  });
});
