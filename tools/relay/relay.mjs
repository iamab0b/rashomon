import { createServer } from "node:http";

const token = process.env.CARTESIA_WEBHOOK_SECRET;
if (!token) {
  console.error("CARTESIA_WEBHOOK_SECRET is not set; the relay will not start");
  process.exit(1);
}
const upstream = process.env.RASHOMON_WEBHOOK_URL ?? "https://maincloud.spacetimedb.com/v1/database/rashomon/route/webhook/cartesia";
const port = Number(process.env.RELAY_PORT ?? 8787);
const ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const MAX_BYTES = 64 * 1024;
const DRAIN_BYTES = 1024 * 1024;

const reply = (res, status, text, headers) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(text);
};
const fail = (res, status, error, headers) => reply(res, status, JSON.stringify({ error }), headers);

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    if ((size += chunk.length) <= MAX_BYTES) return chunks.push(chunk);
    chunks.length = 0;
    resolve(null);
    if (size > MAX_BYTES + DRAIN_BYTES) req.destroy();
  });
  req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  req.on("error", reject);
  req.on("close", reject);
});

async function handle(req, res) {
  const origin = req.headers.origin;
  if (origin && !ORIGINS.includes(origin)) return fail(res, 403, "origin not allowed");
  const cors = origin ? { "access-control-allow-origin": origin, vary: "Origin", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" } : {};
  if (req.url.split("?")[0] !== "/statement" || !["POST", "OPTIONS"].includes(req.method)) return fail(res, 404, "not found", cors);
  if (req.method === "OPTIONS") return reply(res, 204, "", cors);
  const raw = await readBody(req);
  if (raw === null) {
    res.once("finish", () => setTimeout(() => req.destroy(), 1000).unref());
    return fail(res, 413, "the body must be at most 65536 bytes", { ...cors, connection: "close" });
  }
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  const { sessionId, text, witnessName } = body ?? {};
  if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(sessionId)) return fail(res, 400, "sessionId must be 1 to 64 of A-Z a-z 0-9 _ -", cors);
  if (typeof text !== "string" || text.trim() === "") return fail(res, 400, "text must be a non-empty string", cors);
  const words = text.trim().split(/\s+/).length;
  const witnessId = typeof witnessName === "string" && witnessName.trim() ? witnessName : "witness";
  const forward = JSON.stringify({ sessionId, witnessId, utterances: [{ text, tStart: 0, tEnd: Math.max(1, words / 2.5) }] });
  try {
    const upstreamRes = await fetch(upstream, { method: "POST", redirect: "error", headers: { "content-type": "application/json", "x-rashomon-webhook-secret": token }, body: forward });
    reply(res, upstreamRes.status, await upstreamRes.text(), cors);
  } catch {
    fail(res, 502, "relay could not reach the webhook", cors);
  }
}

createServer((req, res) => {
  req.on("error", () => req.destroy());
  handle(req, res).catch(() => (req.destroy(), res.destroy()));
}).listen(port, "127.0.0.1", () => console.log(`relay listening on 127.0.0.1:${port}`));
