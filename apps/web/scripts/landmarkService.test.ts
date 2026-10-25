import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { MAX_BODY_BYTES, MAX_IMAGE_BYTES } from "../src/scene/labeling/auto/payload";
import { BodyTooLarge, createLandmarkService, readCappedBody, type LandmarkInput } from "./landmarkService";

const KEY = "sk-ant-test-not-a-real-key";
const IMAGE = "/9j/AAAA";
const body = {
  images: [IMAGE, IMAGE, IMAGE],
  candidates: [
    { id: "c1", size: [2, 0.9, 0.6] },
    { id: "c2", size: [1.2, 1.8, 0.4] },
  ],
};
const proposal = { candidate: "c1", label: "counter", kind: "occluder", occludes: true, confidence: 0.9, id: "counter" };

function input(value: unknown, overrides: Partial<LandmarkInput> = {}): LandmarkInput {
  return { remoteAddress: "127.0.0.1", contentType: "application/json", rawBody: JSON.stringify(value), ...overrides };
}

function apiResponse(proposals: unknown[]): Response {
  return new Response(
    JSON.stringify({ content: [{ type: "tool_use", id: "t1", name: "propose_landmarks", input: { proposals } }], stop_reason: "tool_use" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function setup(fetchImpl: typeof fetch = vi.fn<typeof fetch>().mockResolvedValue(apiResponse([proposal])), key: string | null = KEY) {
  const log = vi.fn<(message: string) => void>();
  const handle = createLandmarkService({ apiKey: () => key ?? undefined, fetch: fetchImpl, log });
  return { handle, fetchImpl, log };
}

describe("createLandmarkService", () => {
  it("returns the validated proposals from the faked API and sends the key only to the API", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(apiResponse([proposal, { ...proposal, candidate: "c9" }]));
    const { handle } = setup(fetchImpl);

    const output = await handle(input(body));

    expect(output).toEqual({ status: 200, body: { proposals: [proposal], dropped: 1 } });
    expect(JSON.stringify(output)).not.toContain(KEY);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init!.headers as Record<string, string>)["x-api-key"]).toBe(KEY);
  });

  it("refuses anything but localhost", async () => {
    const { handle, fetchImpl } = setup();
    for (const remoteAddress of ["192.168.1.9", "10.0.0.2", "::ffff:10.0.0.2", undefined]) {
      expect((await handle(input(body, { remoteAddress }))).status).toBe(403);
    }
    expect((await handle(input(body, { remoteAddress: "::1" }))).status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("holds the body cap", async () => {
    const { handle, fetchImpl } = setup();
    const big = input({ ...body, pad: "x".repeat(MAX_BODY_BYTES) });
    expect((await handle(big)).status).toBe(413);
    const oversizedImage = `/9j/${"A".repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3))}`;
    expect((await handle(input({ ...body, images: [oversizedImage, IMAGE, IMAGE] }))).status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();

    const stream = new EventEmitter();
    const reading = readCappedBody(stream, 10);
    stream.emit("data", Buffer.from("0123456789AB"));
    stream.emit("end");
    await expect(reading).rejects.toBeInstanceOf(BodyTooLarge);
    const small = new EventEmitter();
    const fits = readCappedBody(small, 10);
    small.emit("data", Buffer.from("{}"));
    small.emit("end");
    await expect(fits).resolves.toBe("{}");
  });

  it("answers a generic 400 for bad fields without calling the API", async () => {
    const { handle, fetchImpl } = setup();
    const bad = [
      { ...body, extra: 1 },
      { ...body, images: [IMAGE, IMAGE] },
      { ...body, images: ["iVBORw0K", IMAGE, IMAGE] },
      { ...body, images: ["not base64!", IMAGE, IMAGE] },
      { ...body, candidates: [] },
      { ...body, candidates: [{ id: "c1", size: [1, 1, 1] }, { id: "c1", size: [1, 1, 1] }] },
      { ...body, candidates: [{ id: "x1", size: [1, 1, 1] }] },
      { ...body, candidates: [{ id: "c1", size: [1, -1, 1] }] },
      { ...body, candidates: [{ id: "c1", size: [1, 1, 1], position: [0, 0, 0] }] },
      [],
    ];
    for (const value of bad) expect(await handle(input(value))).toEqual({ status: 400, body: { error: "invalid request" } });
    expect(await handle(input(body, { rawBody: "{not json" }))).toEqual({ status: 400, body: { error: "invalid request" } });
    expect((await handle(input(body, { contentType: "text/plain" }))).status).toBe(415);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never puts the key or the API's error detail in a response, and logs the detail", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(`invalid x-api-key ${KEY}`, { status: 401 }));
    const { handle, log } = setup(fetchImpl);

    const output = await handle(input(body));

    expect(output.status).toBe(502);
    expect(JSON.stringify(output)).not.toContain(KEY);
    expect(JSON.stringify(output)).not.toContain("401");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Anthropic API 401"));
    expect(log.mock.calls.flat().join("\n")).not.toContain(KEY);
  });

  it("answers 503 without a key and never calls the API", async () => {
    const { handle, fetchImpl, log } = setup(undefined, null);
    const output = await handle(input(body));
    expect(output.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ANTHROPIC_API_KEY"));
  });

  it("answers 409 while a suggestion is running", async () => {
    let release: (response: Response) => void = () => undefined;
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((done) => (release = done)));
    const { handle } = setup(fetchImpl);
    const first = handle(input(body));
    expect((await handle(input(body))).status).toBe(409);
    release(apiResponse([proposal]));
    expect((await first).status).toBe(200);
  });
});
