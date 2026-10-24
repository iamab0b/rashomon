import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CaptureShot } from "./shotCapture";
import { createShotService, type ShotInput } from "./shotService";

const OUT_DIR = "/work/apps/web/shots/devpost";
const ORIGIN = "http://localhost:5173/";

function input(body: unknown, overrides: Partial<ShotInput> = {}): ShotInput {
  return { remoteAddress: "127.0.0.1", contentType: "application/json", rawBody: JSON.stringify(body), ...overrides };
}

function setup(capture: CaptureShot = vi.fn().mockResolvedValue(undefined), origin: string | null = ORIGIN) {
  const log = vi.fn();
  const handle = createShotService({ capture, origin: () => origin ?? undefined, outDir: OUT_DIR, log });
  return { handle, capture, log };
}

describe("createShotService", () => {
  it("captures against the dev server origin and answers the path", async () => {
    const { handle, capture } = setup();

    const output = await handle(input({ cam: "witness_claimed", t: 11, scenario: "corrected" }));

    expect(output).toEqual({ status: 200, body: { path: resolve(OUT_DIR, "witness_claimed-t11-corrected.png") } });
    expect(capture).toHaveBeenCalledWith({
      baseUrl: ORIGIN,
      query: "fixture=store&cam=witness_claimed&t=11&scenario=corrected",
      outFile: resolve(OUT_DIR, "witness_claimed-t11-corrected.png"),
    });
  });

  it("answers 400 for invalid fields and mode=live without capturing", async () => {
    const { handle, capture } = setup();

    for (const body of [{ mode: "live" }, { scenario: "a/b" }, { t: 1e9 }, { cam: "nope" }]) {
      expect((await handle(input(body))).status).toBe(400);
    }
    expect((await handle(input({}, { rawBody: "{not json" }))).status).toBe(400);
    expect(capture).not.toHaveBeenCalled();
  });

  it("answers 403 away from localhost and 415 for a non-JSON content type", async () => {
    const { handle, capture } = setup();

    expect((await handle(input({}, { remoteAddress: "192.168.1.9" }))).status).toBe(403);
    expect((await handle(input({}, { remoteAddress: undefined }))).status).toBe(403);
    expect((await handle(input({}, { remoteAddress: "::1" }))).status).toBe(200);
    expect((await handle(input({}, { contentType: "text/plain" }))).status).toBe(415);
    expect((await handle(input({}, { contentType: undefined }))).status).toBe(415);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("answers 409 to a second request while one is running, then accepts again", async () => {
    let release: () => void = () => undefined;
    const capture: CaptureShot = vi.fn(() => new Promise<void>((done) => (release = done)));
    const { handle } = setup(capture);

    const first = handle(input({ t: 1 }));
    const second = await handle(input({ t: 2 }));
    release();

    expect(second.status).toBe(409);
    expect((await first).status).toBe(200);
    const third = handle(input({ t: 3 }));
    release();
    expect((await third).status).toBe(200);
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("answers 500 with a generic error, logs the detail, and frees the lock", async () => {
    const capture: CaptureShot = vi
      .fn()
      .mockRejectedValueOnce(new Error("scene reported a load error"))
      .mockResolvedValueOnce(undefined);
    const { handle, log } = setup(capture);

    const failed = await handle(input({ t: 1 }));

    expect(failed.status).toBe(500);
    expect(JSON.stringify(failed.body)).not.toContain("load error");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("scene reported a load error"));
    expect((await handle(input({ t: 1 }))).status).toBe(200);
  });

  it("answers 500 when the dev server has no local url", async () => {
    const { handle, capture } = setup(undefined, null);

    expect((await handle(input({}))).status).toBe(500);
    expect(capture).not.toHaveBeenCalled();
  });
});
