import type { IncomingMessage } from "node:http";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { captureShot } from "./shotCapture";
import { createShotService } from "./shotService";

const SHOT_ROUTE = "/__shot";
const MAX_BODY_BYTES = 4096;
const SHOT_DIR = ["shots", "devpost"] as const;

class BodyTooLarge extends Error {}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BodyTooLarge());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function shotPlugin(): Plugin {
  return {
    name: "rashomon-shot",
    apply: "serve",
    configureServer(server) {
      const handle = createShotService({
        capture: captureShot,
        origin: () => server.resolvedUrls?.local[0],
        outDir: resolve(server.config.root, ...SHOT_DIR),
        log: (message) => server.config.logger.error(message),
      });
      server.middlewares.use(SHOT_ROUTE, (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        const send = (status: number, body: object) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        readBody(req)
          .then((rawBody) =>
            handle({ remoteAddress: req.socket.remoteAddress, contentType: req.headers["content-type"], rawBody }),
          )
          .then((output) => send(output.status, output.body))
          .catch((error: unknown) =>
            error instanceof BodyTooLarge ? send(413, { error: "request body too large" }) : send(500, { error: "shot request failed" }),
          );
      });
    },
  };
}
