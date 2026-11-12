import { describe, expect, it } from "vitest";
import { blankCard } from "./cards";
import { emojiLabel, newCustomEmoji, parseEmoji, resolveEmoji } from "./emoji";
import { entitlements } from "./plans";
import { checkRoleMenus, type RoleMenu } from "./role-menus";
import { checkStarboard, DEFAULT_STARBOARD } from "./starboard";

const RAID = "<:raid:320000000000000001>";
const server = [{ id: "320000000000000001", name: "raid", animated: false }];

describe("emoji", () => {
  it("reads standard and server emoji, and nothing else", () => {
    expect(parseEmoji("🎮")).toEqual({ kind: "standard", name: "🎮" });
    expect(parseEmoji(RAID)).toEqual({
      kind: "custom",
      id: "320000000000000001",
      name: "raid",
      animated: false,
    });
    expect(parseEmoji("<a:dance:320000000000000002>")).toMatchObject({ animated: true });
    expect(parseEmoji("<:x:1>")).toBeNull();
    expect(parseEmoji("raid")).toBeNull();
  });

  it("turns :name: into the server's emoji, and shows it back as :name:", () => {
    expect(resolveEmoji(":raid:", server)).toBe(RAID);
    expect(resolveEmoji("raid", server)).toBe(RAID);
    expect(resolveEmoji(":nope:", server)).toBe(":nope:");
    expect(resolveEmoji("🎮", server)).toBe("🎮");
    expect(emojiLabel(RAID)).toBe(":raid:");
    expect(newCustomEmoji([RAID, "🎮"], [])).toEqual([RAID]);
    expect(newCustomEmoji([RAID], [RAID])).toEqual([]);
  });

  it("keeps server emoji for Pro, and lets saved ones stay on Free", () => {
    const menu: RoleMenu = {
      id: "menu000001",
      name: "Pings",
      card: blankCard("Pick"),
      style: "buttons",
      options: [{ roleId: "200000000000000001", label: "Raids", emoji: RAID, description: null }],
      maxPicks: null,
      requiredRoleId: null,
      placeholder: null,
    };
    expect(checkRoleMenus([menu], entitlements("free")).ok).toBe(false);
    expect(checkRoleMenus([menu], entitlements("pro")).ok).toBe(true);
    expect(checkRoleMenus([menu], entitlements("free"), [menu]).ok).toBe(true);
    const star = { enabled: true, channelId: "300000000000000001", emoji: RAID, threshold: 3 };
    expect(checkStarboard(star, entitlements("free"), DEFAULT_STARBOARD).ok).toBe(false);
    expect(checkStarboard(star, entitlements("pro"), DEFAULT_STARBOARD).ok).toBe(true);
  });
});
