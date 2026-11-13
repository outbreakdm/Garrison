import { createServer, type Server } from "node:http";

/**
 * A tiny health endpoint for hosts that check one (Fly, Railway, Docker).
 * Off unless HEALTH_PORT is set. Answers GET /healthz, with no details: 200 once
 * Garrison is connected to Discord, 503 before that or if it drops. POST /poke
 * says a dashboard request is waiting: it only makes Garrison look at its queue
 * now instead of on the next tick, so it's harmless if anyone else calls it.
 */
export function startHealthServer(
  port: number,
  isHealthy: () => boolean,
  onPoke?: () => void,
): Server {
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/poke" && onPoke) {
      onPoke();
      res.writeHead(202, { "cache-control": "no-store" }).end();
      return;
    }
    if (req.method !== "GET" || req.url !== "/healthz") {
      res.writeHead(404).end();
      return;
    }
    const ok = isHealthy();
    res.writeHead(ok ? 200 : 503, { "content-type": "text/plain", "cache-control": "no-store" });
    res.end(ok ? "ok" : "starting");
  });
  server.listen(port, "0.0.0.0");
  return server;
}
