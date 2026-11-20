import type { ApplicationRow } from "@garrison/db";
import { Collection, type Guild, PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { describe, expect, it } from "vitest";
import { applicationCard, grantableRoles } from "./service.js";

const role = (id: string, position: number, opts: { bits?: bigint; managed?: boolean } = {}) => ({
  id,
  name: id,
  position,
  managed: opts.managed ?? false,
  permissions: new PermissionsBitField(opts.bits ?? 0n),
});

function guild(roles: ReturnType<typeof role>[], top = 10) {
  return {
    id: "g",
    members: { me: { roles: { highest: { position: top } } } },
    roles: { cache: new Collection(roles.map((r) => [r.id, r])) },
  } as unknown as Guild;
}

const row = (status: ApplicationRow["status"]): ApplicationRow => ({
  id: "00000000-0000-4000-8000-000000000001",
  guildId: "g",
  formId: "form01",
  formName: "Raid team",
  userId: "100000000000000001",
  username: "ana",
  answers: [{ label: "What class?", value: "Healer" }],
  status,
  decidedBy: status === "waiting" ? null : "lead",
  channelId: null,
  messageId: null,
  createdAt: new Date(),
  decidedAt: null,
});

describe("applications", () => {
  it("only gives roles below Garrison, not a bot's, and never one with moderation powers", () => {
    const g = guild([
      role("raider", 3),
      role("mods", 4, { bits: PermissionFlagsBits.BanMembers }),
      role("botrole", 2, { managed: true }),
      role("above", 12),
    ]);
    expect(
      grantableRoles(g, ["raider", "mods", "botrole", "above", "gone"]).map((r) => r.id),
    ).toEqual(["raider"]);
  });

  it("shows Accept and Decline only while it waits", () => {
    const json = (status: ApplicationRow["status"]) => JSON.stringify(applicationCard(row(status)));
    expect(json("waiting")).toMatch(/apply-decide:accept/);
    expect(json("accepted")).not.toMatch(/apply-decide/);
    expect(json("accepted")).toMatch(/Accepted by lead/);
  });
});
