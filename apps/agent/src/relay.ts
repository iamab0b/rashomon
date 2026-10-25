import { STATUS_CODES, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { CARTESIA_VERSION } from "./cartesia";

export const UPSTREAM_BASE = "wss://api.cartesia.ai";
export const AGENT_ID = /^agent_[A-Za-z0-9]+$/;
const VERSION = /^\d{4}-\d{2}-\d{2}$/;
const PATH_PREFIX = "/agent/";
const UPSTREAM_HANDSHAKE_TIMEOUT_MS = 10_000;

export type RelayDeps = { apiKey: string; allowedOrigin: string; upstreamBase?: string; log?: (line: string) => void };

// Codes a close frame may carry; 1005 and 1006 are local-only and cannot be sent on.
const sendable = (code: number) =>
  (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999);

function reject(socket: Duplex, status: number): void {
  socket.once("finish", () => socket.destroy());
  socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function forward(target: WebSocket, data: RawData, isBinary: boolean): void {
  if (target.readyState === WebSocket.OPEN) target.send(data, { binary: isBinary });
}

function closeWith(target: WebSocket, code: number, reason: Buffer): void {
  if (target.readyState !== WebSocket.OPEN) return;
  if (code === 1005) return target.close();
  if (sendable(code)) return target.close(code, reason);
  target.close(1011, "peer connection lost");
}

function pipe(client: WebSocket, upstream: WebSocket, log: (line: string) => void): void {
  client.on("message", (data, isBinary) => forward(upstream, data, isBinary));
  upstream.on("message", (data, isBinary) => forward(client, data, isBinary));
  client.on("close", (code, reason) => {
    log(`relay: browser closed (${code})`);
    closeWith(upstream, code, reason);
  });
  upstream.on("close", (code, reason) => {
    log(`relay: upstream closed (${code})`);
    closeWith(client, code, reason);
  });
  client.on("error", (err) => log(`relay: browser socket error: ${err.message}`));
}

export function relayUpgrade(deps: RelayDeps) {
  const wss = new WebSocketServer({ noServer: true });
  const base = deps.upstreamBase ?? UPSTREAM_BASE;
  const log = (line: string) => deps.log?.(line.split(deps.apiKey).join("[redacted]"));

  return (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    socket.on("error", () => socket.destroy());
    if (req.headers.origin !== deps.allowedOrigin) {
      socket.destroy();
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.startsWith(PATH_PREFIX)) return reject(socket, 404);
    const agentId = url.pathname.slice(PATH_PREFIX.length);
    const version = url.searchParams.get("cartesia_version") ?? CARTESIA_VERSION;
    if (!AGENT_ID.test(agentId) || !VERSION.test(version)) return reject(socket, 400);

    const target = `${base}/v1/agents/websocket/${agentId}?${new URLSearchParams({ cartesia_version: version })}`;
    const upstream = new WebSocket(target, {
      headers: { "X-API-Key": deps.apiKey },
      handshakeTimeout: UPSTREAM_HANDSHAKE_TIMEOUT_MS,
    });
    let piped = false;
    const abandon = () => piped || upstream.terminate();
    socket.once("close", abandon);

    upstream.once("open", () => {
      if (socket.destroyed) return upstream.close(1001, "browser gone");
      wss.handleUpgrade(req, socket, head, (client) => {
        piped = true;
        socket.off("close", abandon);
        log(`relay: connected ${agentId}`);
        pipe(client, upstream, log);
      });
    });
    upstream.on("error", (err) => {
      log(`relay: upstream error: ${err.message}`);
      if (piped || socket.destroyed) return;
      // Complete the browser handshake only to tell it why, so it sees 1011 instead of a bare 1006.
      wss.handleUpgrade(req, socket, head, (client) => client.close(1011, "upstream unavailable"));
    });
  };
}
