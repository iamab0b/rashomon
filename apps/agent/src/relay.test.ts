import type { AddressInfo } from "node:net";
import type { IncomingMessage, Server } from "node:http";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { ALLOWED_ORIGIN, startTokenServer } from "./tokenServer";

const KEY = "fake-api-key-for-tests";
const SECRET_TEXT = "witness said the red car";

type Received = { data: string; isBinary: boolean };
type Upstream = { wss: WebSocketServer; base: string; requests: IncomingMessage[]; sockets: WebSocket[]; received: Received[] };

let server: Server | null = null;
let upstream: Upstream | null = null;
const clients: WebSocket[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.terminate();
  for (const s of upstream?.sockets ?? []) s.terminate();
  await new Promise<void>((resolve) => (upstream ? upstream.wss.close(() => resolve()) : resolve()));
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  upstream = null;
  server = null;
});

async function fakeUpstream(options: ConstructorParameters<typeof WebSocketServer>[0] = {}): Promise<Upstream> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0, ...options });
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  const up: Upstream = { wss, base: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`, requests: [], sockets: [], received: [] };
  wss.on("connection", (ws, req) => {
    up.requests.push(req);
    up.sockets.push(ws);
    ws.on("message", (data: RawData, isBinary) => up.received.push({ data: String(data), isBinary }));
  });
  return up;
}

async function boot(options?: ConstructorParameters<typeof WebSocketServer>[0]) {
  upstream = await fakeUpstream(options);
  const log = vi.fn();
  server = await startTokenServer({ apiKey: KEY, fetch: vi.fn() as unknown as typeof fetch, log, upstreamBase: upstream.base }, 0);
  const port = (server.address() as AddressInfo).port;
  return { up: upstream, log, base: `ws://127.0.0.1:${port}` };
}

function connect(url: string, origin: string | null = ALLOWED_ORIGIN): WebSocket {
  const ws = new WebSocket(url, origin === null ? {} : { origin });
  clients.push(ws);
  return ws;
}

const opened = (ws: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });

// Resolves with the HTTP status of a refused handshake, or "hangup" when the socket was simply dropped.
const refused = (ws: WebSocket) =>
  new Promise<number | "hangup">((resolve) => {
    ws.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    ws.once("error", () => resolve("hangup"));
  });

const closed = (ws: WebSocket) =>
  new Promise<{ code: number; reason: string }>((resolve) => ws.once("close", (code, reason) => resolve({ code, reason: String(reason) })));

const nextMessage = (ws: WebSocket) =>
  new Promise<Received>((resolve) => ws.once("message", (data: RawData, isBinary) => resolve({ data: String(data), isBinary })));

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
};

describe("agent relay", () => {
  test("drops sockets from other origins or with no origin and never dials upstream", async () => {
    const { up, base } = await boot();
    expect(await refused(connect(`${base}/agent/agent_abc123`, "http://evil.example"))).toBe("hangup");
    expect(await refused(connect(`${base}/agent/agent_abc123`, null))).toBe("hangup");
    expect(up.requests).toHaveLength(0);
  });

  test("refuses bad agent ids, bad versions and other paths", async () => {
    const { up, base } = await boot();
    expect(await refused(connect(`${base}/agent/agent_bad-id`))).toBe(400);
    expect(await refused(connect(`${base}/agent/agent_%2E%2E`))).toBe(400);
    expect(await refused(connect(`${base}/agent/agent_abc/extra`))).toBe(400);
    expect(await refused(connect(`${base}/agent/agent_abc?cartesia_version=x%26access_token%3Dy`))).toBe(400);
    expect(await refused(connect(`${base}/token`))).toBe(404);
    expect(up.requests).toHaveLength(0);
  });

  test("dials the agent socket with the API key header and the requested version", async () => {
    const { up, base } = await boot();
    await opened(connect(`${base}/agent/agent_abc123`));
    await opened(connect(`${base}/agent/agent_abc123?cartesia_version=2026-09-01`));
    expect(up.requests.map((r) => r.url)).toEqual([
      "/v1/agents/websocket/agent_abc123?cartesia_version=2026-08-14",
      "/v1/agents/websocket/agent_abc123?cartesia_version=2026-09-01",
    ]);
    expect(up.requests[0]!.headers["x-api-key"]).toBe(KEY);
  });

  test("passes text and binary frames both ways and keeps their type", async () => {
    const { up, base, log } = await boot();
    const client = connect(`${base}/agent/agent_abc123`);
    await opened(client);
    await until(() => up.sockets.length === 1);
    const remote = up.sockets[0]!;

    client.send(JSON.stringify({ type: "session_create", note: SECRET_TEXT }));
    client.send(Buffer.from([1, 2, 3]));
    await until(() => up.received.length === 2);
    expect(up.received[0]).toEqual({ data: JSON.stringify({ type: "session_create", note: SECRET_TEXT }), isBinary: false });
    expect(up.received[1]!.isBinary).toBe(true);

    const text = nextMessage(client);
    remote.send(JSON.stringify({ type: "session_ready", call_id: "ac_1" }));
    expect(await text).toEqual({ data: JSON.stringify({ type: "session_ready", call_id: "ac_1" }), isBinary: false });
    const binary = nextMessage(client);
    remote.send(Buffer.from("raw"));
    expect(await binary).toEqual({ data: "raw", isBinary: true });

    const lines = log.mock.calls.flat().join("\n");
    expect(lines).not.toContain(SECRET_TEXT);
    expect(lines).not.toContain("session_ready");
    expect(lines).not.toContain(KEY);
  });

  test("an upstream close reaches the browser with its code and reason", async () => {
    const { up, base } = await boot();
    const client = connect(`${base}/agent/agent_abc123`);
    await opened(client);
    await until(() => up.sockets.length === 1);
    const done = closed(client);
    up.sockets[0]!.close(4001, "agent ended");
    expect(await done).toEqual({ code: 4001, reason: "agent ended" });
  });

  test("a browser close reaches upstream with its code and reason", async () => {
    const { up, base } = await boot();
    const client = connect(`${base}/agent/agent_abc123`);
    await opened(client);
    await until(() => up.sockets.length === 1);
    const done = closed(up.sockets[0]!);
    client.close(1000, "session completed");
    expect(await done).toEqual({ code: 1000, reason: "session completed" });
  });

  test("an upstream that drops without a close frame closes the browser with 1011", async () => {
    const { up, base } = await boot();
    const client = connect(`${base}/agent/agent_abc123`);
    await opened(client);
    await until(() => up.sockets.length === 1);
    const done = closed(client);
    up.sockets[0]!.terminate();
    expect((await done).code).toBe(1011);
  });

  test("an upstream handshake refusal closes the browser with 1011 and logs no key", async () => {
    const { base, log } = await boot({ verifyClient: (_info, cb) => cb(false, 402) });
    const client = connect(`${base}/agent/agent_abc123`);
    expect(await closed(client)).toEqual({ code: 1011, reason: "upstream unavailable" });
    const lines = log.mock.calls.flat().join("\n");
    expect(lines).toContain("402");
    expect(lines).not.toContain(KEY);
  });
});
