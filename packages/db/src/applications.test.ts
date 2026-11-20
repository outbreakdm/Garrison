import { describe, expect, it } from "vitest";
import {
  type ApplicationForm,
  checkApplicationForms,
  formOpen,
  readApplicationForms,
} from "./applications";
import { entitlements } from "./plans";

const free = entitlements("free");
const pro = entitlements("pro");
const CH = "100000000000000001";
const form = (over: Partial<ApplicationForm> = {}): ApplicationForm => ({
  id: `form${Math.random().toString(36).slice(2, 8)}`,
  name: "Raid team",
  title: "Join the raid team",
  body: null,
  intro: null,
  questions: [{ id: "q00001", label: "What class?", help: null, long: false }],
  reviewChannelId: CH,
  acceptRoleIds: [],
  buttonLabel: "Apply",
  ...over,
});

describe("application forms", () => {
  it("needs a question and a staff channel, and fills in new question ids", () => {
    expect(checkApplicationForms([form()], free).ok).toBe(true);
    expect(checkApplicationForms([form({ questions: [] })], free)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/at least one question/),
    });
    expect(checkApplicationForms([form({ reviewChannelId: "" })], free)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/staff channel/),
    });
    const out = checkApplicationForms(
      [form({ questions: [{ label: "Why?", help: null, long: true } as never] })],
      free,
    );
    expect(out.ok && out.value[0]?.questions[0]?.id).toMatch(/^[a-z0-9]{6,16}$/);
  });

  it("holds Discord's five parts, the note counting as one", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({
      id: `q0000${i}`,
      label: `Q${i}`,
      help: null,
      long: false,
    }));
    expect(checkApplicationForms([form({ questions: five })], free).ok).toBe(true);
    expect(checkApplicationForms([form({ questions: five, intro: "Hello" })], free).ok).toBe(false);
  });

  it("runs one form on Free and ten on Pro; a server back on Free keeps its forms", () => {
    const two = [form({ name: "A" }), form({ name: "B" })];
    expect(checkApplicationForms(two, free)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Free servers can have 1 form/),
    });
    expect(checkApplicationForms(two, pro).ok).toBe(true);
    expect(checkApplicationForms(two, free, two).ok).toBe(true);
    // Only the first one takes applications on Free.
    expect(formOpen(two, two[0]?.id ?? "", free)).toBe(true);
    expect(formOpen(two, two[1]?.id ?? "", free)).toBe(false);
    expect(checkApplicationForms([form({ name: "Same" }), form({ name: "same" })], pro).ok).toBe(
      false,
    );
  });

  it("reads a stored list leniently", () => {
    expect(readApplicationForms([form(), { id: "x" }])).toHaveLength(1);
  });
});
