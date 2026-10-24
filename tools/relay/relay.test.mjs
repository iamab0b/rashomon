import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import net from "node:net";
import { networkInterfaces } from "node:os";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const RELAY = fileURLToPath(new URL("./relay.mjs", import.meta.url));
const TOKEN = "test-secret-value-8f3a91c2";
const ALLOWED = "http://localhost:5173";
const stoppers = [];
const seen = [];

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));

async function freePort() {
  const probe = net.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function fakeUpstream(respond = () => ({ status: 200, body: { ok: true } })) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const call = { method: req.method, url: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString() || "null") };
    calls.push(call);
    const { status, body, headers } = respond(call);
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  });
  const port = await listen(server);
  stoppers.push(() => server.close());
  return { calls, url: `http://127.0.0.1:${port}/hook` };
}

async function startRelay(upstreamUrl, env = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [RELAY], {
    env: { PATH: process.env.PATH, CARTESIA_WEBHOOK_SECRET: TOKEN, RASHOMON_WEBHOOK_URL: upstreamUrl, RELAY_PORT: String(port), ...env },
  });
  let logs = "";
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));
  stoppers.push(() => child.kill());
  await new Promise((resolve, reject) => {
    child.once("exit", (code) => reject(new Error(`relay exited with ${code}: ${logs}`)));
    const timer = setInterval(() => logs.includes("listening") && (clearInterval(timer), resolve()), 20);
  });
  return { port, logs: () => logs, child };
}

async function post(relay, body, { path = "/statement", method = "POST", headers = {} } = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${relay.port}${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: method === "GET" ? undefined : payload });
  const text = await res.text();
  seen.push(text, JSON.stringify([...res.headers]));
  return { status: res.status, text, json: text ? JSON.parse(text) : null, headers: res.headers };
}

after(() => {
  for (const stop of stoppers) stop();
  assert.ok(seen.length > 0);
  for (const piece of seen) assert.ok(!piece.includes(TOKEN), "the secret appeared in a response");
});

describe("forwarding", () => {
  it("sends the secret header and the mapped body, and returns the upstream status and body unchanged", async () => {
    const upstream = await fakeUpstream(() => ({ status: 200, body: { statuses: { e1: "plausible" }, flags: [] } }));
    const relay = await startRelay(upstream.url);

    const res = await post(relay, { sessionId: "demo_1", text: "He took the knife from the counter", witnessName: "Ana" });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { statuses: { e1: "plausible" }, flags: [] });
    assert.equal(upstream.calls.length, 1);
    const [call] = upstream.calls;
    assert.equal(call.method, "POST");
    assert.equal(call.url, "/hook");
    assert.equal(call.headers["x-rashomon-webhook-secret"], TOKEN);
    assert.deepEqual(call.body, {
      sessionId: "demo_1",
      witnessId: "Ana",
      utterances: [{ text: "He took the knife from the counter", tStart: 0, tEnd: 7 / 2.5 }],
    });
  });

  it("defaults the witness and gives a short statement at least one second", async () => {
    const upstream = await fakeUpstream();
    const relay = await startRelay(upstream.url);

    await post(relay, { sessionId: "s", text: "Hi" });

    assert.deepEqual(upstream.calls[0].body, { sessionId: "s", witnessId: "witness", utterances: [{ text: "Hi", tStart: 0, tEnd: 1 }] });
  });

  it("passes an upstream error status and body through untouched", async () => {
    for (const [status, body] of [[401, { error: "unauthorized" }], [400, { error: "sessionId is required" }], [502, { error: "extraction failed" }]]) {
      const upstream = await fakeUpstream(() => ({ status, body }));
      const relay = await startRelay(upstream.url);
      const res = await post(relay, { sessionId: "s", text: "hello there" });
      assert.equal(res.status, status);
      assert.deepEqual(res.json, body);
    }
  });

  it("answers 502 when the upstream is down", async () => {
    const down = await freePort();
    const relay = await startRelay(`http://127.0.0.1:${down}/hook`);

    const res = await post(relay, { sessionId: "s", text: "hello there" });

    assert.equal(res.status, 502);
    assert.deepEqual(res.json, { error: "relay could not reach the webhook" });
  });
});

describe("validation", () => {
  it("answers 413 over 64 KB and forwards nothing", async () => {
    const upstream = await fakeUpstream();
    const relay = await startRelay(upstream.url);

    const res = await post(relay, { sessionId: "s", text: "x".repeat(70 * 1024) });
    const small = await post(relay, { sessionId: "s", text: "word ".repeat(1000) });

    assert.equal(res.status, 413);
    assert.equal(small.status, 200);
    assert.equal(upstream.calls.length, 1);
  });

  it("answers 400 for a bad sessionId, an empty text and a body that is not JSON", async () => {
    const upstream = await fakeUpstream();
    const relay = await startRelay(upstream.url);
    const bad = [
      { text: "hello" },
      { sessionId: "", text: "hello" },
      { sessionId: "has space", text: "hello" },
      { sessionId: "a".repeat(65), text: "hello" },
      { sessionId: "semi;colon", text: "hello" },
      { sessionId: 7, text: "hello" },
      { sessionId: "ok", text: "" },
      { sessionId: "ok", text: "   " },
      { sessionId: "ok" },
      "not json",
      "null",
    ];
    for (const body of bad) assert.equal((await post(relay, body)).status, 400, JSON.stringify(body));
    assert.equal((await post(relay, { sessionId: "a".repeat(64), text: "hello" })).status, 200);
    assert.equal(upstream.calls.length, 1);
  });

  it("answers 404 for any other path or method", async () => {
    const upstream = await fakeUpstream();
    const relay = await startRelay(upstream.url);

    assert.equal((await post(relay, {}, { path: "/other" })).status, 404);
    assert.equal((await post(relay, {}, { method: "GET" })).status, 404);
    assert.equal((await post(relay, {}, { method: "PUT" })).status, 404);
    assert.equal((await post(relay, { sessionId: "s", text: "hello" }, { path: "/statement?x=1" })).status, 200);
    assert.equal(upstream.calls.length, 1);
  });
});

describe("origins", () => {
  it("rejects a foreign Origin with 403 and forwards nothing", async () => {
    const upstream = await fakeUpstream();
    const relay = await startRelay(upstream.url);

    const post403 = await post(relay, { sessionId: "s", text: "hello" }, { headers: { origin: "https://evil.example" } });
    const preflight = await post(relay, "", { method: "OPTIONS", headers: { origin: "http://localhost:5174" } });

    assert.equal(post403.status, 403);
    assert.equal(post403.headers.get("access-control-allow-origin"), null);
    assert.equal(preflight.status, 403);
    assert.equal(upstream.calls.length, 0);
  });

  it("allows both dev origins, answers their preflight, and sends no CORS headers without an Origin", async () => {
    const upstream = await fakeUpstream();
    const relay = await startRelay(upstream.url);

    for (const origin of [ALLOWED, "http://127.0.0.1:5173"]) {
      const preflight = await post(relay, "", { method: "OPTIONS", headers: { origin } });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
      assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
      assert.match(preflight.headers.get("access-control-allow-headers"), /content-type/i);
      const res = await post(relay, { sessionId: "s", text: "hello" }, { headers: { origin } });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("access-control-allow-origin"), origin);
    }
    assert.equal((await post(relay, { sessionId: "s", text: "hello" })).headers.get("access-control-allow-origin"), null);
  });
});

describe("secret and binding", () => {
  it("never prints the secret, and refuses to start without one", async () => {
    const upstream = await fakeUpstream();
    const relay = await startRelay(upstream.url);
    await post(relay, { sessionId: "s", text: "hello" });
    await post(relay, "not json");
    assert.ok(!relay.logs().includes(TOKEN));
    assert.match(relay.logs(), /listening on 127\.0\.0\.1:/);

    const missing = spawn(process.execPath, [RELAY], { env: { PATH: process.env.PATH } });
    let output = "";
    missing.stderr.on("data", (d) => (output += d));
    const code = await new Promise((resolve) => missing.on("exit", resolve));
    assert.notEqual(code, 0);
    assert.match(output, /CARTESIA_WEBHOOK_SECRET is not set/);
  });

  it("listens on 127.0.0.1 only", async () => {
    const upstream = await fakeUpstream();
    const relay = await startRelay(upstream.url);
    const external = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal);

    await new Promise((resolve, reject) => {
      const socket = net.connect(relay.port, "127.0.0.1", () => (socket.destroy(), resolve()));
      socket.on("error", reject);
    });
    if (!external) return;
    await assert.rejects(
      new Promise((resolve, reject) => {
        const socket = net.connect(relay.port, external.address, () => (socket.destroy(), resolve()));
        socket.on("error", reject);
      }),
    );
  });
});

describe("robustness", () => {
  it("survives a client that disconnects in the middle of its body", async () => {
    const upstream = await fakeUpstream();
    const relay = await startRelay(upstream.url);

    await new Promise((resolve, reject) => {
      const socket = net.connect(relay.port, "127.0.0.1", () => {
        socket.write('POST /statement HTTP/1.1\r\nHost: relay\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{"sessionId":"s","te');
        setTimeout(() => (socket.destroy(), resolve()), 50);
      });
      socket.on("error", reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.equal(relay.child.exitCode, null, `the relay exited: ${relay.logs()}`);
    const res = await post(relay, { sessionId: "s", text: "still alive" });
    assert.equal(res.status, 200);
    assert.equal(upstream.calls.length, 1);
  });

  it("answers 502 on a redirect and never sends the secret to where it points", async () => {
    const elsewhere = await fakeUpstream();
    const redirecting = await fakeUpstream(() => ({ status: 302, body: {}, headers: { location: elsewhere.url } }));
    const relay = await startRelay(redirecting.url);

    const res = await post(relay, { sessionId: "s", text: "hello there" });

    assert.equal(res.status, 502);
    assert.deepEqual(res.json, { error: "relay could not reach the webhook" });
    assert.equal(redirecting.calls.length, 1);
    assert.equal(elsewhere.calls.length, 0);
  });

  it("answers 413 as soon as the cap is passed, while a 10 MB body is still being sent", async () => {
    const upstream = await fakeUpstream();
    const relay = await startRelay(upstream.url);
    const chunk = Buffer.alloc(64 * 1024, "a");
    const total = 160;
    const outcome = await new Promise((resolve) => {
      const req = httpRequest({ host: "127.0.0.1", port: relay.port, path: "/statement", method: "POST", headers: { "content-type": "application/json" } });
      let sent = 0;
      let answered = null;
      req.on("response", (res) => {
        answered = { status: res.statusCode, sentWhenAnswered: sent };
        res.resume();
        res.on("end", () => resolve(answered));
      });
      req.on("error", () => resolve(answered ?? { status: null, sentWhenAnswered: sent }));
      (async () => {
        for (let i = 0; i < total && answered === null; i++) {
          await new Promise((done) => req.write(chunk, done));
          await new Promise((done) => setTimeout(done, 5));
          sent += 1;
        }
        if (answered === null) req.end();
      })();
    });

    assert.equal(outcome.status, 413);
    assert.ok(outcome.sentWhenAnswered < total / 4, `the relay read ${outcome.sentWhenAnswered} of ${total} chunks before answering`);
    assert.equal(upstream.calls.length, 0);
    const res = await post(relay, { sessionId: "s", text: "next one" });
    assert.equal(res.status, 200);
  });
});
