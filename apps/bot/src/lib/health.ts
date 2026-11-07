import { createServer, type Server } from "node:http";

/**
 * A tiny health endpoint for hosts that check one (Fly, Railway, Docker).
 * Off unless HEALTH_PORT is set. Answers only GET /healthz, with no details:
 * 200 once Garrison is connected to Discord, 503 before that or if it drops.
 */
export function startHealthServer(port: number, isHealthy: () => boolean): Server {
  const server = createServer((req, res) => {
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
