import { escapeMarkdown } from "discord.js";

/** Zero-width space: breaks a mention without changing how the text looks. */
const ZWSP = String.fromCharCode(0x200b);

/**
 * User-typed text, made inert: no markdown, masked links ("[Free Nitro](evil)"),
 * headings, lists or mentions survive. escapeMarkdown leaves masked links,
 * headings and lists alone by default, so they're switched on here.
 */
export const safeText = (text: string) =>
  escapeMarkdown(text, { maskedLink: true, heading: true, bulletedList: true, numberedList: true })
    .replace(/@(everyone|here)/gi, `@${ZWSP}$1`)
    .replace(/<(@[!&]?|#)(\d+)>/g, `<${ZWSP}$1$2>`);
