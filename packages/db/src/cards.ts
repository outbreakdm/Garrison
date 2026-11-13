/**
 * Cards people design on the dashboard: one shape, shared by the dashboard's card
 * editor (field by field, with a live preview) and the bot, which draws the same
 * value as a Discord Components V2 message. Pure, with no database code, so the
 * editor can import it in the browser (`@garrison/db/cards`).
 *
 * The paywall rule (docs/ROADMAP.md): every field works on Free with the standard
 * look. Pro adds the look itself: an accent color, images and your own footer.
 * Pro values stay stored after a downgrade and come back on re-subscribing; the
 * bot draws the standard look meanwhile (`cardForPlan`).
 */

import type { Entitlements, FeatureKey } from "./plans";
import type { Parsed } from "./rally";

export type CardBlock =
  | { kind: "text"; text: string }
  | { kind: "divider" }
  /** Pro (`cards.embed`): a name over a value, as in a Discord embed's fields. */
  | { kind: "field"; name: string; value: string };

export interface CustomCard {
  /** The heading. One line. */
  title: string;
  /** The body, in order. Text takes Discord markdown; mentions never ping. */
  blocks: CardBlock[];
  /** Pro: the color bar, as "#rrggbb". Null is Garrison's volt. */
  accent: string | null;
  /** Pro: a banner image under the text (https). */
  image: string | null;
  /** Pro: a small picture beside the title (https). */
  thumbnail: string | null;
  /** Pro: null is Garrison's standard footer, "" is no footer, anything else is the footer. */
  footer: string | null;
  /** Pro: a small line above the title, as an embed's author. */
  author: string | null;
  /** Pro: makes the title a link (https). */
  url: string | null;
}

/**
 * Discord allows 4000 characters of text in a message. Cards keep well under it
 * so the parts a module adds (a role menu's buttons) always fit.
 */
export const CARD_LIMITS = {
  title: 150,
  block: 1500,
  blocks: 6,
  text: 3000,
  footer: 100,
  url: 400,
  author: 100,
  fieldName: 100,
  fieldValue: 600,
} as const;

/** Garrison's volt: the bar every card has unless a Pro server picks its own. */
export const STANDARD_ACCENT = "#d4ff3a";
/** The footer every Free card carries. */
export const STANDARD_FOOTER = "Garrison";

/** The Pro-only parts of a card, in the order the editor shows them. */
export const CARD_PRO_FIELDS = [
  { key: "accent", feature: "cards.accent", label: "Accent color" },
  { key: "image", feature: "cards.images", label: "Banner image" },
  { key: "thumbnail", feature: "cards.images", label: "Thumbnail" },
  { key: "footer", feature: "cards.footer", label: "Footer" },
  { key: "author", feature: "cards.embed", label: "Author line" },
  { key: "url", feature: "cards.embed", label: "Title link" },
] as const satisfies readonly {
  key: keyof CustomCard;
  feature: FeatureKey;
  label: string;
}[];

export type CardProField = (typeof CARD_PRO_FIELDS)[number]["key"];

export const blankCard = (title = "New card"): CustomCard => ({
  title,
  blocks: [],
  accent: null,
  image: null,
  thumbnail: null,
  footer: null,
  author: null,
  url: null,
});

export const ACCENT = /^#[0-9a-f]{6}$/;

/** A Pro field holding a value other than the standard look. */
const usesPro = (card: CustomCard, key: CardProField) => (card[key] ?? null) !== null;

const fieldBlocks = (card: CustomCard | null | undefined) =>
  JSON.stringify((card?.blocks ?? []).filter((b) => b.kind === "field"));

/** A locked part of a card: one of the Pro fields, or its field blocks. */
export interface CardLock {
  key: CardProField | "fields";
  feature: FeatureKey;
  label: string;
}

/**
 * The Pro fields this card sets that the plan doesn't include. With `before`
 * (the same card as saved), a value that was already saved is let through, so
 * a server that went back to Free can still edit its text without losing the
 * Pro look it paid for.
 */
export function lockedCardFields(
  card: CustomCard,
  ent: Entitlements,
  before?: CustomCard | null,
): CardLock[] {
  const locks: CardLock[] = CARD_PRO_FIELDS.filter(
    (f) =>
      !ent[f.feature] &&
      usesPro(card, f.key) &&
      (card[f.key] ?? null) !== (before?.[f.key] ?? null),
  );
  if (
    !ent["cards.embed"] &&
    card.blocks.some((b) => b.kind === "field") &&
    fieldBlocks(card) !== fieldBlocks(before)
  )
    locks.push({ key: "fields", feature: "cards.embed", label: "Fields" });
  return locks;
}

/** "Undo Pro changes": the locked parts go back to what was saved; everything else stays. */
export function restoreLockedCard(
  card: CustomCard,
  saved: CustomCard,
  locks: CardLock[],
): CustomCard {
  const out: CustomCard = { ...card };
  for (const l of locks) {
    if (l.key === "fields") {
      const kept = new Set(
        saved.blocks.filter((b) => b.kind === "field").map((b) => JSON.stringify(b)),
      );
      out.blocks = out.blocks.filter((b) => b.kind !== "field" || kept.has(JSON.stringify(b)));
    } else if (l.key === "accent") out.accent = saved.accent;
    else if (l.key === "image") out.image = saved.image;
    else if (l.key === "thumbnail") out.thumbnail = saved.thumbnail;
    else if (l.key === "footer") out.footer = saved.footer;
    else if (l.key === "author") out.author = saved.author ?? null;
    else if (l.key === "url") out.url = saved.url ?? null;
  }
  return out;
}

/** The card as this plan draws it: Pro values the plan lacks fall back to the standard look. */
export function cardForPlan(card: CustomCard, ent: Entitlements): CustomCard {
  const out: CustomCard = { ...card, author: card.author ?? null, url: card.url ?? null };
  for (const f of CARD_PRO_FIELDS) if (!ent[f.feature]) out[f.key] = null;
  if (!ent["cards.embed"]) {
    const blocks = out.blocks.filter((b) => b.kind !== "field");
    // No divider left first, last or doubled where fields were taken out.
    out.blocks = blocks.filter(
      (b, i) =>
        b.kind !== "divider" ||
        (i > 0 && i < blocks.length - 1 && blocks[i - 1]?.kind !== "divider"),
    );
  }
  return out;
}

/** Characters of text the card shows, as Discord counts them (footer included). */
export function cardTextLength(card: CustomCard) {
  const footer = card.footer ?? STANDARD_FOOTER;
  return (
    card.title.length +
    (card.author?.length ?? 0) +
    card.blocks.reduce(
      (n, b) =>
        n +
        (b.kind === "text"
          ? b.text.length
          : b.kind === "field"
            ? b.name.length + b.value.length
            : 0),
      0,
    ) +
    footer.length
  );
}

/** Images the dashboard's preview can show: Discord's CDN (the CSP allows only that). */
export function previewableImage(url: string | null) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "cdn.discordapp.com";
  } catch {
    return false;
  }
}

function httpsUrl(v: unknown, label: string): Parsed<string | null> {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, error: `${label} must be a link.` };
  const t = v.trim();
  if (!t) return { ok: true, value: null };
  if (t.length > CARD_LIMITS.url)
    return { ok: false, error: `${label} links can be ${CARD_LIMITS.url} characters at most.` };
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" || !u.hostname.includes("."))
      return { ok: false, error: `${label} needs a link starting with https://.` };
    return { ok: true, value: u.toString() };
  } catch {
    return { ok: false, error: `${label} needs a link starting with https://.` };
  }
}

/** Line endings to \n, no trailing spaces on lines, no runs of blank lines past two. */
const tidy = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Check a card from the dashboard form or the database. Plan rules are separate
 * (`lockedCardFields`), so a stored card always parses whatever plan the server is on.
 */
export function parseCard(raw: unknown, where = "The card"): Parsed<CustomCard> {
  if (!raw || typeof raw !== "object") return { ok: false, error: `${where} isn't valid.` };
  const r = raw as Record<string, unknown>;

  const title = typeof r.title === "string" ? r.title.replace(/\s+/g, " ").trim() : "";
  if (!title) return { ok: false, error: `${where} needs a title.` };
  if (title.length > CARD_LIMITS.title)
    return { ok: false, error: `Titles can be ${CARD_LIMITS.title} characters at most.` };

  if (!Array.isArray(r.blocks)) return { ok: false, error: `${where} isn't valid.` };
  if (r.blocks.length > CARD_LIMITS.blocks)
    return { ok: false, error: `A card can have ${CARD_LIMITS.blocks} parts at most.` };
  const blocks: CardBlock[] = [];
  for (const b of r.blocks) {
    const block = b as Record<string, unknown> | null;
    if (block?.kind === "divider") {
      // A divider only separates text: never two in a row, never first or last.
      if (blocks.length && blocks.at(-1)?.kind !== "divider") blocks.push({ kind: "divider" });
      continue;
    }
    if (block?.kind === "field") {
      const name = typeof block.name === "string" ? block.name.replace(/\s+/g, " ").trim() : "";
      const value = typeof block.value === "string" ? tidy(block.value) : "";
      if (!name && !value) continue;
      if (!name || !value) return { ok: false, error: "Each field needs a name and a value." };
      if (name.length > CARD_LIMITS.fieldName)
        return {
          ok: false,
          error: `Field names can be ${CARD_LIMITS.fieldName} characters at most.`,
        };
      if (value.length > CARD_LIMITS.fieldValue)
        return {
          ok: false,
          error: `Field values can be ${CARD_LIMITS.fieldValue} characters at most.`,
        };
      blocks.push({ kind: "field", name, value });
      continue;
    }
    if (block?.kind !== "text" || typeof block.text !== "string")
      return { ok: false, error: `${where} isn't valid.` };
    const text = tidy(block.text);
    if (!text) continue;
    if (text.length > CARD_LIMITS.block)
      return {
        ok: false,
        error: `Each block of text can be ${CARD_LIMITS.block} characters at most.`,
      };
    blocks.push({ kind: "text", text });
  }
  while (blocks.at(-1)?.kind === "divider") blocks.pop();

  let accent: string | null = null;
  if (r.accent !== null && r.accent !== undefined && r.accent !== "") {
    const a = typeof r.accent === "string" ? r.accent.trim().toLowerCase() : "";
    if (!ACCENT.test(a)) return { ok: false, error: "Pick the accent color as #rrggbb." };
    accent = a === STANDARD_ACCENT ? null : a;
  }

  const image = httpsUrl(r.image, "The banner image");
  if (!image.ok) return image;
  const thumbnail = httpsUrl(r.thumbnail, "The thumbnail");
  if (!thumbnail.ok) return thumbnail;

  let footer: string | null = null;
  if (typeof r.footer === "string") {
    footer = r.footer.replace(/\s+/g, " ").trim();
    if (footer.length > CARD_LIMITS.footer)
      return { ok: false, error: `The footer can be ${CARD_LIMITS.footer} characters at most.` };
  } else if (r.footer !== null && r.footer !== undefined) {
    return { ok: false, error: `${where} isn't valid.` };
  }

  let author: string | null = null;
  if (typeof r.author === "string") {
    author = r.author.replace(/\s+/g, " ").trim() || null;
    if (author && author.length > CARD_LIMITS.author)
      return {
        ok: false,
        error: `The author line can be ${CARD_LIMITS.author} characters at most.`,
      };
  } else if (r.author !== null && r.author !== undefined) {
    return { ok: false, error: `${where} isn't valid.` };
  }
  const url = httpsUrl(r.url, "The title link");
  if (!url.ok) return url;

  const card: CustomCard = {
    title,
    blocks,
    accent,
    image: image.value,
    thumbnail: thumbnail.value,
    footer,
    author,
    url: url.value,
  };
  if (cardTextLength(card) > CARD_LIMITS.text)
    return {
      ok: false,
      error: `A card can hold ${CARD_LIMITS.text} characters of text. Shorten it a little.`,
    };
  return { ok: true, value: card };
}
