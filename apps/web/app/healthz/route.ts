/** Liveness for the container: the server is up. No database or Discord calls, no details. */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", {
    headers: { "content-type": "text/plain", "cache-control": "no-store" },
  });
}
