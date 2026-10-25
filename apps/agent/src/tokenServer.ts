import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { API_BASE, CARTESIA_VERSION, type Fetch } from "./cartesia";

export const ALLOWED_ORIGIN = "http://localhost:5173";
export const TOKEN_TTL_SECS = 300;
export const DEFAULT_PORT = 8787;

export type TokenServerDeps = { apiKey: string; fetch: Fetch; log?: (line: string) => void };

export async function mintToken(deps: TokenServerDeps): Promise<string> {
  const res = await deps.fetch(`${API_BASE}/access-token`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${deps.apiKey}`,
      "cartesia-version": CARTESIA_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({ grants: { agent: true }, expires_in: TOKEN_TTL_SECS }),
  });
  if (!res.ok) throw new Error(`access-token -> ${res.status}`);
  const body = (await res.json()) as { token?: unknown };
  if (typeof body.token !== "string" || body.token === "") throw new Error("access-token response had no token");
  return body.token;
}

function send(res: ServerResponse, status: number, origin: string | undefined, body?: unknown): void {
  const headers: Record<string, string> = { vary: "Origin", "cache-control": "no-store" };
  if (origin === ALLOWED_ORIGIN) {
    headers["access-control-allow-origin"] = ALLOWED_ORIGIN;
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
  }
  if (body !== undefined) headers["content-type"] = "application/json";
  res.writeHead(status, headers);
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

export function tokenHandler(deps: TokenServerDeps) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const origin = req.headers.origin;
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    if (origin !== ALLOWED_ORIGIN) return send(res, 403, origin, { error: "origin not allowed" });
    if (path !== "/token") return send(res, 404, origin, { error: "not found" });
    if (req.method === "OPTIONS") return send(res, 204, origin);
    if (req.method !== "POST") return send(res, 405, origin, { error: "method not allowed" });
    try {
      const token = await mintToken(deps);
      send(res, 200, origin, { token });
    } catch (err) {
      deps.log?.(`token request failed: ${err instanceof Error ? err.message : "unknown error"}`);
      send(res, 502, origin, { error: "token request failed" });
    }
  };
}

export function startTokenServer(deps: TokenServerDeps, port = DEFAULT_PORT): Promise<Server> {
  const server = createServer((req, res) => void tokenHandler(deps)(req, res));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const apiKey = process.env.CARTESIA_API_KEY?.trim();
  if (!apiKey) {
    console.error("CARTESIA_API_KEY is not set; add it to .env.local");
    process.exit(1);
  }
  const port = Number(process.env.TOKEN_SERVER_PORT) || DEFAULT_PORT;
  startTokenServer({ apiKey, fetch, log: (line) => console.error(line) }, port).then(
    () => console.log(`token server on http://127.0.0.1:${port}/token for ${ALLOWED_ORIGIN}`),
    (err: unknown) => {
      console.error(`token server failed to start: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    },
  );
}
