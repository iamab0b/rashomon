import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ALLOWED_ORIGIN, startTokenServer, TOKEN_TTL_SECS } from "./tokenServer";

const KEY = "fake-api-key-for-tests";
let server: Server | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

async function boot(upstream: (url: string, init?: RequestInit) => Promise<Response>, log = vi.fn()) {
  const fake = vi.fn(upstream);
  server = await startTokenServer({ apiKey: KEY, fetch: fake as unknown as typeof fetch, log }, 0);
  const { port } = server.address() as AddressInfo;
  return { fake, log, url: `http://127.0.0.1:${port}/token` };
}

const ok = () => Promise.resolve(new Response(JSON.stringify({ token: "tok_abc" }), { status: 200 }));

describe("token server", () => {
  test("mints an agent-grant token and returns only { token }", async () => {
    const { fake, url } = await boot(ok);
    const res = await fetch(url, { method: "POST", headers: { origin: ALLOWED_ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    expect(await res.json()).toEqual({ token: "tok_abc" });
    expect(fake).toHaveBeenCalledTimes(1);
    const [target, init] = fake.mock.calls[0]!;
    expect(target).toBe("https://api.cartesia.ai/access-token");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    expect(headers["cartesia-version"]).toBe("2026-08-14");
    expect(JSON.parse(String(init?.body))).toEqual({ grants: { agent: true }, expires_in: TOKEN_TTL_SECS });
  });

  test("answers the CORS preflight for the dev origin", async () => {
    const { fake, url } = await boot(ok);
    const res = await fetch(url, { method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN } });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    expect(fake).not.toHaveBeenCalled();
  });

  test("refuses other origins and requests without an origin", async () => {
    const { fake, url } = await boot(ok);
    const evil = await fetch(url, { method: "POST", headers: { origin: "http://evil.example" } });
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const bare = await fetch(url, { method: "POST" });
    expect(bare.status).toBe(403);
    expect(fake).not.toHaveBeenCalled();
  });

  test("rejects other paths and methods", async () => {
    const { url } = await boot(ok);
    expect((await fetch(url.replace("/token", "/other"), { method: "POST", headers: { origin: ALLOWED_ORIGIN } })).status).toBe(404);
    expect((await fetch(url, { headers: { origin: ALLOWED_ORIGIN } })).status).toBe(405);
  });

  test("an upstream failure returns 502 without leaking the key or the upstream body", async () => {
    const { url, log } = await boot(() => Promise.resolve(new Response(`bad key ${KEY}`, { status: 401 })));
    const res = await fetch(url, { method: "POST", headers: { origin: ALLOWED_ORIGIN } });
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("bad key");
    expect(log.mock.calls.flat().join(" ")).not.toContain(KEY);
  });
});
