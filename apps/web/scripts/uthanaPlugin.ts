import type { Plugin } from "vite";
import { createUthanaService, UTHANA_ROUTE } from "./uthanaService";

export function uthanaPlugin(): Plugin {
  return {
    name: "rashomon-uthana",
    apply: "serve",
    configureServer(server) {
      const handle = createUthanaService({
        apiKey: () => process.env.UTHANA_API_KEY,
        characterId: () => process.env.UTHANA_CHARACTER_ID,
        fetch: (url, init) => fetch(url, init),
        log: (message) => server.config.logger.error(message),
      });
      server.middlewares.use(UTHANA_ROUTE, (req, res) => {
        handle({
          remoteAddress: req.socket.remoteAddress,
          method: req.method,
          path: (req.url ?? "").split("?")[0] ?? "",
          contentLength: req.headers["content-length"],
        })
          .then((output) => {
            res.statusCode = output.status;
            res.setHeader("content-type", output.contentType);
            res.setHeader("cache-control", "no-store");
            res.end(output.contentType === "application/json" ? JSON.stringify(output.body) : Buffer.from(output.body));
          })
          .catch(() => {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "generated motion request failed" }));
          });
      });
    },
  };
}
