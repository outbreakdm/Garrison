import { normalizeHandle, publicFeedUrl } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { parseFeed, privateAddress, readRedditListing, rssPosts } from "./providers.js";
import { unseenPosts } from "./service.js";

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>Patch &amp; News</title>
<item><title><![CDATA[Patch 2.4 <b>is</b> live]]></title><link>https://example.com/p/24</link>
<guid>post-24</guid><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate>
<media:thumbnail url="https://example.com/24.jpg"/></item>
<item><title>Patch 2.3</title><link>https://example.com/p/23</link><guid>post-23</guid>
<pubDate>Thu, 19 Nov 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title>r/valorant</title>
<entry><author><name>/u/ana</name></author><id>t3_abc</id>
<link rel="alternate" href="https://www.reddit.com/r/valorant/comments/abc/x/"/>
<published>2026-11-20T10:00:00+00:00</published><title>New agent leak</title></entry>
</feed>`;

describe("alert sources", () => {
  it("reads RSS 2.0 items, newest first, without markup", () => {
    const { name, posts } = parseFeed(RSS);
    expect(name).toBe("Patch & News");
    expect(posts.map((p) => p.id)).toEqual(["post-24", "post-23"]);
    expect(posts[0]).toMatchObject({
      title: "Patch 2.4 is live",
      url: "https://example.com/p/24",
      thumbnail: "https://example.com/24.jpg",
    });
    expect(posts[0]?.published.toISOString()).toBe("2026-11-20T10:00:00.000Z");
  });

  it("reads Atom entries, like Reddit's", () => {
    const { posts } = parseFeed(ATOM);
    expect(posts[0]).toMatchObject({
      id: "t3_abc",
      title: "New agent leak",
      author: "/u/ana",
      url: "https://www.reddit.com/r/valorant/comments/abc/x/",
    });
  });

  it("reads Reddit's listing, skipping pinned and NSFW posts", () => {
    const post = (name: string, extra: Record<string, unknown> = {}) => ({
      kind: "t3",
      data: {
        name,
        title: "Patch &amp; notes",
        author: "ana",
        permalink: `/r/valorant/comments/${name}/x/`,
        created_utc: 1_795_000_000,
        thumbnail: "self",
        ...extra,
      },
    });
    const posts = readRedditListing({
      data: {
        children: [
          post("t3_pin", { stickied: true }),
          post("t3_nsfw", { over_18: true }),
          post("t3_ok"),
        ],
      },
    });
    expect(posts).toEqual([
      {
        id: "t3_ok",
        title: "Patch & notes",
        author: "u/ana",
        url: "https://www.reddit.com/r/valorant/comments/t3_ok/x/",
        thumbnail: "",
        published: new Date(1_795_000_000_000),
      },
    ]);
  });

  it("refuses addresses inside a network before fetching anything", async () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "192.168.1.1",
      "172.20.0.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
    ])
      expect(privateAddress(ip)).toBe(true);
    for (const ip of ["93.184.216.34", "2606:4700::6810:84e5"])
      expect(privateAddress(ip)).toBe(false);
    await expect(
      rssPosts("https://feeds.example.com/x.xml", async () => ["10.1.2.3"]),
    ).rejects.toThrow(/isn't public/);
  });

  it("only takes public feed addresses", () => {
    expect(publicFeedUrl("https://example.com/feed.xml")).toBe("https://example.com/feed.xml");
    expect(publicFeedUrl("ftp://example.com/feed")).toBeNull();
    expect(publicFeedUrl("http://localhost/feed")).toBeNull();
    expect(publicFeedUrl("http://10.0.0.1/feed")).toBeNull();
    expect(publicFeedUrl("https://user:pw@example.com/feed")).toBeNull();
    expect(publicFeedUrl("https://example.com:8080/feed")).toBeNull();
    expect(publicFeedUrl("https://router.lan/feed")).toBeNull();
  });

  it("reads Kick, Reddit and Bluesky names from what people paste", () => {
    expect(normalizeHandle("kick", "https://kick.com/XQC")).toBe("xqc");
    expect(normalizeHandle("reddit", "r/Valorant")).toBe("Valorant");
    expect(normalizeHandle("reddit", "https://old.reddit.com/r/valorant/")).toBe("valorant");
    expect(normalizeHandle("bluesky", "@Name.bsky.social")).toBe("name.bsky.social");
    expect(normalizeHandle("bluesky", "https://bsky.app/profile/name.bsky.social")).toBe(
      "name.bsky.social",
    );
    expect(normalizeHandle("bluesky", "nodot")).toBeNull();
  });

  it("announces only what's new since the last post, oldest first", () => {
    const items = [{ id: "c" }, { id: "b" }, { id: "a" }];
    expect(unseenPosts(items, null)).toEqual({ unseen: [{ id: "c" }], announce: false });
    expect(unseenPosts(items, "a")).toEqual({ unseen: [{ id: "b" }, { id: "c" }], announce: true });
    expect(unseenPosts(items, "c")).toEqual({ unseen: [], announce: true });
    // The last post was deleted: just the newest, if it's fresh.
    expect(unseenPosts(items, "gone")).toEqual({ unseen: [{ id: "c" }], announce: true });
  });
});
