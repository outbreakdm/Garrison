import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every way into the dashboard checks who's asking (security review, 2026-11-23).
 *
 * A server action is any exported function in a "use server" file: Next.js makes each one a
 * public POST endpoint, whatever page it was written for. Each must reach an access check,
 * directly or through a helper in its file. A server page must check access itself: a layout's
 * check doesn't guard a page's own data. These tests read the source, so a new action or page
 * without a check fails here before it ships.
 */

const APP = fileURLToPath(new URL("../app", import.meta.url));

/** The checks that gate an entry point (lib/session.ts, lib/member.ts). */
const GATES = [
  "checkGuildAccess",
  "requireGuildAccess",
  "memberCheck",
  "memberSpace",
  "getSession",
  "requireSession",
];

/** Entry points that are open on purpose, and why. */
const OPEN_ACTIONS: Record<string, string> = {
  "theme-actions.ts:toggleTheme": "sets the visitor's own theme cookie, nothing else",
};
const OPEN_PAGES: Record<string, string> = {
  "page.tsx": "the landing page",
  "login/page.tsx": "signing in",
  "privacy/page.tsx": "the privacy policy",
  "terms/page.tsx": "the terms",
  "refunds/page.tsx": "the refund policy",
  "status/page.tsx": "public service status",
  "s/[key]/page.tsx": "a server's public page: only what its managers turned on",
  "share/insights/[token]/page.tsx": "an Insights share link: the token is the key",
  "servers/[guildId]/rally/templates/page.tsx": "an old address that only redirects",
};
const OPEN_ROUTES: Record<string, string> = {
  "auth/logout/route.ts": "POST from this site only; ends the visitor's own session",
  "build/route.ts": "holds the landing page's idea in a cookie; the page it lands on checks access",
  "healthz/route.ts": "says the site is up, nothing else",
};

function files(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, keep);
    return keep(path) ? [path] : [];
  });
}

const rel = (path: string) => relative(APP, path).replaceAll("\\", "/");

/** Each function in a file (declared or const arrow), by name, with its body. */
function bodies(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const heads =
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(|(?:export\s+)?const\s+(\w+)\s*=\s*(?:cache\()?\s*(?:async\s*)?\(/g;
  for (const m of source.matchAll(heads)) {
    const name = m[1] ?? m[2];
    if (!name) continue;
    // Past the parameters (which can hold parentheses), to the brace that opens the body: the
    // one that ends its line, so a return type like Promise<{ ok: boolean }> isn't taken for it.
    let at = (m.index ?? 0) + m[0].length;
    for (let depth = 1; at < source.length && depth; at++) {
      if (source[at] === "(") depth++;
      else if (source[at] === ")") depth--;
    }
    const brace = /\{[ \t]*\r?\n/.exec(source.slice(at));
    if (!brace) continue;
    const open = at + brace.index;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}" && --depth === 0) {
        out.set(name, source.slice(open, i + 1));
        break;
      }
    }
  }
  return out;
}

/** Does `text` reach a gate, directly or through the file's own helpers? */
function gated(text: string, fns: Map<string, string>, seen = new Set<string>()): boolean {
  if (GATES.some((g) => new RegExp(`\\b${g}\\(`).test(text))) return true;
  for (const [name, body] of fns) {
    if (seen.has(name) || !new RegExp(`\\b${name}\\(`).test(text)) continue;
    if (gated(body, fns, new Set([...seen, name]))) return true;
  }
  return false;
}

describe("every dashboard entry point checks who's asking", () => {
  const actionFiles = files(APP, (p) => /\.tsx?$/.test(p)).filter((p) =>
    readFileSync(p, "utf8").trimStart().startsWith('"use server"'),
  );

  it("finds the server actions to check", () => {
    expect(actionFiles.length).toBeGreaterThan(20);
  });

  it("has an access check in every server action", () => {
    const open: string[] = [];
    for (const path of actionFiles) {
      const source = readFileSync(path, "utf8");
      const fns = bodies(source);
      for (const m of source.matchAll(/export\s+async\s+function\s+(\w+)/g)) {
        const name = m[1] as string;
        const id = `${rel(path)}:${name}`;
        if (OPEN_ACTIONS[id]) continue;
        if (!gated(fns.get(name) ?? "", fns, new Set([name]))) open.push(id);
      }
    }
    expect(open).toEqual([]);
  });

  it("asks for at least editor access to change a server, and manager access for who gets in", () => {
    // checkGuildAccess defaults to "editor"; a viewer-level check belongs on reads only.
    const viewerWrites: string[] = [];
    for (const path of actionFiles) {
      const source = readFileSync(path, "utf8");
      if (/checkGuildAccess\(.*"viewer"\)/.test(source)) viewerWrites.push(rel(path));
    }
    expect(viewerWrites).toEqual([]);
    const access = readFileSync(join(APP, "servers/[guildId]/settings/access-actions.ts"), "utf8");
    expect(access).toMatch(/checkGuildAccess\(.*"manager"\)/);
  });

  it("checks access in every server page itself", () => {
    const pages = files(APP, (p) => p.endsWith("page.tsx"));
    const open = pages
      .map(rel)
      .filter((id) => !OPEN_PAGES[id])
      .filter((id) => !gated(readFileSync(join(APP, id), "utf8"), new Map()));
    expect(open).toEqual([]);
  });

  it("checks access in every route handler, or a token or signature in its place", () => {
    const routes = files(APP, (p) => p.endsWith("route.ts"));
    const open = routes.map(rel).filter((id) => {
      if (OPEN_ROUTES[id]) return false;
      const source = readFileSync(join(APP, id), "utf8");
      return !(
        gated(source, new Map()) || /timingSafeEqual|verifyEvent|verifyTwitchMessage/.test(source)
      );
    });
    expect(open).toEqual([]);
  });
});
