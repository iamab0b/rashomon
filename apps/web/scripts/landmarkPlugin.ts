import type { Plugin } from "vite";
import { BodyTooLarge, createLandmarkService, readCappedBody } from "./landmarkService";

const LANDMARK_ROUTE = "/__landmarks";

export function landmarkPlugin(): Plugin {
  return {
    name: "rashomon-landmarks",
    apply: "serve",
    configureServer(server) {
      const handle = createLandmarkService({
        apiKey: () => process.env.ANTHROPIC_API_KEY,
        fetch: (url, init) => fetch(url, init),
        log: (message) => server.config.logger.error(message),
      });
      server.middlewares.use(LANDMARK_ROUTE, (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        const send = (status: number, body: object) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        readCappedBody(req)
          .then((rawBody) =>
            handle({ remoteAddress: req.socket.remoteAddress, contentType: req.headers["content-type"], rawBody }),
          )
          .then((output) => send(output.status, output.body))
          .catch((error: unknown) => {
            if (!(error instanceof BodyTooLarge)) {
              send(500, { error: "landmark request failed" });
              return;
            }
            res.setHeader("connection", "close");
            send(413, { error: "request body too large" });
          });
      });
    },
  };
}
