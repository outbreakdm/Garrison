import { describe, expect, it } from "vitest";
import { entitlements } from "./plans";
import { checkVoiceRooms, DEFAULT_VOICE_ROOMS, readVoiceRooms, roomName } from "./voice-rooms";

const A = "300000000000000001";
const B = "300000000000000002";
const free = entitlements("free");
const pro = entitlements("pro");

describe("voice rooms", () => {
  it("names a room for its owner, Pro templates included", () => {
    expect(roomName(null, "Kestrel")).toBe("Kestrel's room");
    expect(roomName("Squad of {user}", "Kestrel")).toBe("Squad of Kestrel");
    expect(roomName("  ", "Kestrel")).toBe("Kestrel's room");
    expect(roomName("{user}".repeat(30), "Kestrel").length).toBeLessThanOrEqual(100);
  });

  it("posts the room controls unless the server turns them off", () => {
    expect(readVoiceRooms(null).controls).toBe(true);
    expect(readVoiceRooms({ controls: false }).controls).toBe(false);
    expect(
      checkVoiceRooms(
        { enabled: true, creatorChannelIds: [A], controls: false },
        free,
        DEFAULT_VOICE_ROOMS,
      ),
    ).toMatchObject({ ok: true, value: { controls: false } });
  });

  it("needs a creator channel to switch on", () => {
    const r = checkVoiceRooms({ enabled: true, creatorChannelIds: [] }, free, DEFAULT_VOICE_ROOMS);
    expect(r.ok).toBe(false);
  });

  it("keeps Free to one creator channel and the standard name", () => {
    expect(
      checkVoiceRooms({ enabled: true, creatorChannelIds: [A, B] }, free, DEFAULT_VOICE_ROOMS),
    ).toMatchObject({ ok: false });
    expect(
      checkVoiceRooms(
        { enabled: true, creatorChannelIds: [A], nameTemplate: "Squad of {user}" },
        free,
        DEFAULT_VOICE_ROOMS,
      ),
    ).toMatchObject({ ok: false });
    expect(
      checkVoiceRooms(
        { enabled: true, creatorChannelIds: [A, B], nameTemplate: "Squad of {user}", userLimit: 5 },
        pro,
        DEFAULT_VOICE_ROOMS,
      ),
    ).toMatchObject({ ok: true, value: { creatorChannelIds: [A, B], userLimit: 5 } });
  });

  it("lets a server back on Free keep what it saved under Pro", () => {
    const saved = readVoiceRooms({
      enabled: true,
      creatorChannelIds: [A, B],
      nameTemplate: "Squad of {user}",
    });
    const r = checkVoiceRooms(
      { enabled: false, creatorChannelIds: [A, B], nameTemplate: "Squad of {user}" },
      free,
      saved,
    );
    expect(r).toMatchObject({ ok: true, value: { enabled: false } });
  });

  it("reads stored rows leniently", () => {
    expect(readVoiceRooms({ creatorChannelIds: ["x", A], userLimit: 500 })).toMatchObject({
      creatorChannelIds: [A],
      userLimit: 0,
    });
  });
});
