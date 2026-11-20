import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { entitlements } from "./plans";
import { checkPublicPage, publicInviteCode } from "./public-page";
import { markGuildLeft, upsertGuild } from "./repo/guilds";
import { applySettingsChange, getPublicPage, publicSlugTaken } from "./repo/settings";
import { createTestDb } from "./testing";

const free = entitlements("free");
const pro = entitlements("pro");
const none = { publicSlug: null };

describe("public page", () => {
  it("reads invites however they're pasted", () => {
    expect(publicInviteCode("https://discord.gg/abc123")).toBe("abc123");
    expect(publicInviteCode("discord.com/invite/Raid-Team")).toBe("Raid-Team");
    expect(publicInviteCode("abc123")).toBe("abc123");
    expect(publicInviteCode("https://evil.example/abc")).toBeNull();
  });

  it("keeps its own name to Pro, and refuses names that mislead", () => {
    expect(checkPublicPage({ publicPage: true, publicSlug: "raid-team" }, pro, none)).toMatchObject(
      {
        ok: true,
        value: { publicSlug: "raid-team", publicPage: true },
      },
    );
    expect(checkPublicPage({ publicSlug: "raid-team" }, free, none)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Garrison Pro/),
    });
    // Saved on Pro, kept on Free.
    expect(checkPublicPage({ publicSlug: "raid-team" }, free, { publicSlug: "raid-team" }).ok).toBe(
      true,
    );
    for (const bad of ["ab", "Has Spaces", "-dash", "official", "123456"])
      expect(checkPublicPage({ publicSlug: bad }, pro, none).ok).toBe(false);
    expect(checkPublicPage({ publicAbout: "hi @everyone" }, pro, none).ok).toBe(false);
    expect(checkPublicPage({ publicInvite: "not an invite!" }, pro, none).ok).toBe(false);
  });
});

describe("public page storage", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "100000000000000777";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
    await upsertGuild(db, { id: "100000000000000778", name: "Other" });
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("shows only while it's on, by name or ID, and only while Garrison is in the server", async () => {
    await exec("SET ROLE garrison_web");
    expect(await getPublicPage(db, G)).toBeNull();
    const out = await applySettingsChange(db, {
      guildId: G,
      module: "members",
      patch: { publicPage: true, publicSlug: "iron-vanguard", publicAbout: "Raids nightly." },
      userId: "1",
      username: "taner",
    });
    expect(out.ok).toBe(true);
    expect((await getPublicPage(db, G))?.name).toBe("Iron Vanguard");
    expect((await getPublicPage(db, "Iron-Vanguard"))?.publicAbout).toBe("Raids nightly.");
    expect(await publicSlugTaken(db, "iron-vanguard", "100000000000000778")).toBe(true);
    expect(await publicSlugTaken(db, "iron-vanguard", G)).toBe(false);
    await exec("RESET ROLE");
    await markGuildLeft(db, G);
    expect(await getPublicPage(db, G)).toBeNull();
  });
});
