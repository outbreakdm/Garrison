import type { ReactNode } from "react";

/**
 * Enough of Discord's markdown to preview a card honestly: headings, subtext,
 * quotes, lists, code, bold, italic, underline, strikethrough, spoilers, links
 * and mentions. Builds React elements (never HTML strings), so nothing typed into
 * the editor can run or style the page.
 */

export interface MentionNames {
  roles: Map<string, string>;
  channels: Map<string, string>;
}

const INLINE: [RegExp, (m: RegExpExecArray, key: string, names: MentionNames) => ReactNode][] = [
  [
    /^`([^`\n]+)`/,
    (m, k) => (
      <code className="dc-inline-code" key={k}>
        {m[1]}
      </code>
    ),
  ],
  [/^\*\*([\s\S]+?)\*\*(?!\*)/, (m, k, n) => <strong key={k}>{inline(m[1] ?? "", n)}</strong>],
  [/^__([\s\S]+?)__(?!_)/, (m, k, n) => <u key={k}>{inline(m[1] ?? "", n)}</u>],
  [/^\*([^*\s][\s\S]*?)\*(?!\*)/, (m, k, n) => <em key={k}>{inline(m[1] ?? "", n)}</em>],
  [/^_([^_\s][\s\S]*?)_(?![_\w])/, (m, k, n) => <em key={k}>{inline(m[1] ?? "", n)}</em>],
  [/^~~([\s\S]+?)~~/, (m, k, n) => <s key={k}>{inline(m[1] ?? "", n)}</s>],
  [
    /^\|\|([\s\S]+?)\|\|/,
    (m, k, n) => (
      <span className="dc-spoiler" key={k}>
        {inline(m[1] ?? "", n)}
      </span>
    ),
  ],
  [
    /^\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/,
    (m, k, n) => (
      <span className="dc-link" key={k} title={m[2]}>
        {inline(m[1] ?? "", n)}
      </span>
    ),
  ],
  [
    /^https:\/\/[^\s<>()]+[^\s<>().,!?:;'"]/,
    (m, k) => (
      <span className="dc-link" key={k}>
        {m[0]}
      </span>
    ),
  ],
  [
    /^<@&(\d{17,20})>/,
    (m, k, n) => (
      <span className="dc-mention" key={k}>
        @{n.roles.get(m[1] ?? "") ?? "unknown-role"}
      </span>
    ),
  ],
  [
    /^<#(\d{17,20})>/,
    (m, k, n) => (
      <span className="dc-mention" key={k}>
        #{n.channels.get(m[1] ?? "") ?? "unknown"}
      </span>
    ),
  ],
  [
    /^<@!?(\d{17,20})>/,
    (_m, k) => (
      <span className="dc-mention" key={k}>
        @member
      </span>
    ),
  ],
  [
    /^<t:(\d{1,12})(?::([tTdDfFR]))?>/,
    (m, k) => (
      <span className="dc-time" key={k}>
        {new Date(Number(m[1]) * 1000).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </span>
    ),
  ],
];

/** Inline marks within one line (or a bold run that spans lines). */
export function inline(text: string, names: MentionNames): ReactNode[] {
  const out: ReactNode[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let matched = false;
    // Only try a rule where a mark could start; plain runs are copied through.
    if (/^[`*_~|[h<\\]/.test(rest)) {
      if (rest[0] === "\\" && rest.length > 1) {
        plain += rest[1];
        i += 2;
        continue;
      }
      for (const [re, make] of INLINE) {
        const m = re.exec(rest);
        if (!m) continue;
        if (plain) out.push(plain);
        plain = "";
        out.push(make(m, `${i}`, names));
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      plain += text[i];
      i++;
    }
  }
  if (plain) out.push(plain);
  return out;
}

/** A card's text block, as Discord lays it out. */
export function DiscordMarkdown({ text, names }: { text: string; names: MentionNames }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    const key = `l${out.length}`;
    out.push(list.ordered ? <ol key={key}>{list.items}</ol> : <ul key={key}>{list.items}</ul>);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const key = `${i}`;
    if (line.startsWith("```")) {
      flush();
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !(lines[j] ?? "").startsWith("```")) body.push(lines[j++] ?? "");
      out.push(
        <pre className="dc-code" key={key}>
          {body.join("\n")}
        </pre>,
      );
      i = j;
      continue;
    }
    const bullet = /^\s*[-*] (.*)$/.exec(line);
    const numbered = /^\s*\d{1,3}[.)] (.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push(<li key={key}>{inline((bullet ?? numbered)?.[1] ?? "", names)}</li>);
      continue;
    }
    flush();
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      out.push(
        <div className={`dc-h dc-h${level}`} key={key}>
          {inline(heading[2] ?? "", names)}
        </div>,
      );
      continue;
    }
    const sub = /^-# (.+)$/.exec(line);
    if (sub) {
      out.push(
        <div className="dc-sub" key={key}>
          {inline(sub[1] ?? "", names)}
        </div>,
      );
      continue;
    }
    const quote = /^>>?>? ?(.*)$/.exec(line);
    if (quote && line.startsWith(">")) {
      out.push(
        <blockquote className="dc-quote" key={key}>
          {inline(quote[1] ?? "", names)}
        </blockquote>,
      );
      continue;
    }
    out.push(
      <div className="dc-line" key={key}>
        {line ? inline(line, names) : " "}
      </div>,
    );
  }
  flush();
  return <>{out}</>;
}
