import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiscordMarkdown } from "./markdown";

const names = {
  roles: new Map([["500000000000000001", "Raiders"]]),
  channels: new Map([["300000000000000001", "general"]]),
};
const html = (text: string) => renderToStaticMarkup(<DiscordMarkdown text={text} names={names} />);

describe("the preview's Discord markdown", () => {
  it("draws Discord's marks", () => {
    expect(html("**bold** *it* __u__ ~~s~~ `c`")).toBe(
      '<div class="dc-line"><strong>bold</strong> <em>it</em> <u>u</u> <s>s</s> <code class="dc-inline-code">c</code></div>',
    );
    expect(html("## Head")).toBe('<div class="dc-h dc-h2">Head</div>');
    expect(html("-# small")).toBe('<div class="dc-sub">small</div>');
    expect(html("- a\n- b\n1. c")).toBe("<ul><li>a</li><li>b</li></ul><ol><li>c</li></ol>");
  });

  it("names mentions instead of showing their codes", () => {
    expect(html("<@&500000000000000001> in <#300000000000000001>")).toContain("@Raiders");
    expect(html("<@&500000000000000001> in <#300000000000000001>")).toContain("#general");
    expect(html("<@&500000000000000009>")).toContain("@unknown-role");
  });

  it("never lets typed text become markup or a working link", () => {
    const out = html('<img src=x onerror="alert(1)"> [x](javascript:alert(1)) <script>');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("href");
    expect(out).toContain("&lt;img");
  });
});
