import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startHealthServer } from "./health.js";

let close: (() => void) | undefined;
afterEach(() => close?.());

async function start(healthy: boolean, onPoke?: () => void) {
  const server = startHealthServer(0, () => healthy, onPoke);
  await new Promise((r) => server.once("listening", r));
  close = () => server.close();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("health server", () => {
  it("reports health and nothing else", async () => {
    const base = await start(false);
    expect((await fetch(`${base}/healthz`)).status).toBe(503);
    expect((await fetch(`${base}/other`)).status).toBe(404);
  });

  it("wakes the dashboard queue on POST /poke, and only then", async () => {
    let pokes = 0;
    const base = await start(true, () => pokes++);
    expect((await fetch(`${base}/poke`, { method: "POST" })).status).toBe(202);
    expect((await fetch(`${base}/poke`)).status).toBe(404);
    expect(pokes).toBe(1);
  });
});
