import { describe, expect, it } from "vitest";
import { hostRedirect, hostsFor, siteUrl } from "./hosts";

const APP = "https://dash.garrisonbot.com";

describe("hostRedirect", () => {
  it("serves the landing and status pages on the public site", () => {
    expect(hostRedirect("garrisonbot.com", "/", "", APP)).toBeNull();
    expect(hostRedirect("garrisonbot.com", "/status", "", APP)).toBeNull();
    expect(hostRedirect("garrisonbot.com", "/_next/static/x.js", "", APP)).toBeNull();
  });
  it("sends dashboard paths from the public site to the dashboard", () => {
    expect(hostRedirect("garrisonbot.com", "/servers", "", APP)).toBe(
      "https://dash.garrisonbot.com/servers",
    );
    expect(hostRedirect("garrisonbot.com", "/login", "?next=/account", APP)).toBe(
      "https://dash.garrisonbot.com/login?next=/account",
    );
  });
  it("sends www to the bare domain and the dashboard root to the server list", () => {
    expect(hostRedirect("www.garrisonbot.com", "/status", "", APP)).toBe(
      "https://garrisonbot.com/status",
    );
    expect(hostRedirect("dash.garrisonbot.com", "/", "", APP)).toBe(
      "https://dash.garrisonbot.com/servers",
    );
    expect(hostRedirect("dash.garrisonbot.com", "/servers", "", APP)).toBeNull();
  });
  it("leaves local development and unknown hosts alone", () => {
    expect(hostRedirect("localhost:3000", "/", "", "http://localhost:3000")).toBeNull();
    expect(hostRedirect("evil.example", "/servers", "", APP)).toBeNull();
    expect(hostsFor("not a url")).toBeNull();
    expect(siteUrl(APP)).toBe("https://garrisonbot.com");
    expect(siteUrl("http://localhost:3000")).toBe("");
  });
});
