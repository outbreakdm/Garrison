import { blankCard, entitlements, type RoleMenu } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { cardTexts } from "../../lib/card.js";
import { menuRoleProblem, parseMenuId, roleMenuMessage } from "./menu.js";

const R1 = "500000000000000001";
const R2 = "500000000000000002";
const menu: RoleMenu = {
  id: "abc123def0",
  name: "Pings",
  card: {
    ...blankCard("Pick your pings"),
    blocks: [
      { kind: "text", text: "Choose." },
      { kind: "divider" },
      { kind: "text", text: "More" },
    ],
    accent: "#ff0000",
    image: "https://cdn.discordapp.com/a.png",
    footer: "Our server",
  },
  style: "buttons",
  options: [
    { roleId: R1, label: "Raids", emoji: "⚔️", description: null },
    { roleId: R2, label: "Events", emoji: null, description: "Server events" },
  ],
  maxPicks: null,
  requiredRoleId: null,
  placeholder: null,
};

type Node = {
  type: number;
  accent_color?: number;
  custom_id?: string;
  max_values?: number;
  components?: Node[];
  items?: unknown[];
};
const root = (m: ReturnType<typeof roleMenuMessage>) => m.components[0]?.toJSON() as Node;
const all = (n: Node): Node[] => [n, ...(n.components ?? []).flatMap(all)];

describe("role menu messages", () => {
  it("draws the Pro look on Pro and the standard look on Free", () => {
    const pro = roleMenuMessage(menu, entitlements("pro"));
    expect(root(pro).accent_color).toBe(0xff0000);
    expect(all(root(pro)).some((n) => n.type === 12)).toBe(true);
    // Buttons sit under the card's text and image; the footer closes the card.
    expect(cardTexts(pro).slice(-3)).toEqual(["[Raids]", "[Events]", "-# Our server"]);

    const free = roleMenuMessage(menu, entitlements("free"));
    expect(root(free).accent_color).toBe(0xd4ff3a);
    expect(all(root(free)).some((n) => n.type === 12)).toBe(false);
    expect(cardTexts(free)).toContain("-# Garrison");
    expect(cardTexts(free)[0]).toBe("### Pick your pings");
  });

  it("gives each button the menu and role, and the dropdown the menu", () => {
    const buttons = all(root(roleMenuMessage(menu, entitlements("free")))).filter(
      (n) => n.type === 2,
    );
    expect(buttons.map((b) => b.custom_id)).toEqual([`rm:abc123def0:${R1}`, `rm:abc123def0:${R2}`]);
    const dropdown = all(
      root(roleMenuMessage({ ...menu, style: "dropdown", maxPicks: 1 }, entitlements("free"))),
    ).find((n) => n.type === 3);
    expect(dropdown?.custom_id).toBe("rm:abc123def0");
    expect(dropdown?.max_values).toBe(1);
  });

  it("reads custom IDs back, and nothing else", () => {
    expect(parseMenuId(`rm:abc123def0:${R1}`)).toEqual({ menuId: "abc123def0", roleId: R1 });
    expect(parseMenuId("rm:abc123def0")).toEqual({ menuId: "abc123def0", roleId: null });
    expect(parseMenuId("rm:../x")).toBeNull();
    expect(parseMenuId("gate:verify")).toBeNull();
  });

  it("never hands out @everyone, integration, powerful or higher roles", () => {
    const role = { id: R1, name: "Raids", managed: false, position: 2, permissions: 0n };
    expect(menuRoleProblem(role, "1", 5)).toBeNull();
    expect(menuRoleProblem(undefined, "1", 5)).toBe("missing");
    expect(menuRoleProblem({ ...role, id: "1" }, "1", 5)).toBe("everyone");
    expect(menuRoleProblem({ ...role, managed: true }, "1", 5)).toBe("managed");
    expect(menuRoleProblem({ ...role, permissions: PermissionFlagsBits.BanMembers }, "1", 5)).toBe(
      "dangerous",
    );
    expect(menuRoleProblem({ ...role, position: 5 }, "1", 5)).toBe("above_bot");
  });
});
