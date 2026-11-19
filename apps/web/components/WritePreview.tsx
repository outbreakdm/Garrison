import type { CustomCard, QmWrite } from "@garrison/db";
import type { ReactNode } from "react";
import { DiscordMarkdown, type MentionNames } from "./cards/markdown";

/** A card's title and text as Discord will show them. */
function CardText({ card, names }: { card: CustomCard; names: MentionNames }) {
  return (
    <div className="qm-write__card">
      <p className="qm-write__title">{card.title}</p>
      {card.blocks.map((b, i) =>
        b.kind === "text" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a card's blocks have no ids
          <div className="qm-write__text" key={i}>
            <DiscordMarkdown text={b.text} names={names} />
          </div>
        ) : b.kind === "field" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a card's blocks have no ids
          <p className="qm-write__text" key={i}>
            <strong>{b.name}</strong> {b.value}
          </p>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: a card's blocks have no ids
          <hr className="qm-write__rule" key={i} />
        ),
      )}
    </div>
  );
}

/**
 * Text a draft writes, in full, before anything happens: each welcome card or saved message
 * as Discord will show it, with what it replaces folded under it.
 */
export function WritePreview({
  writes,
  names,
  remove,
}: {
  writes: QmWrite[];
  names: MentionNames;
  /** A Remove button for the write at this place, when the draft is yours. */
  remove: (index: number) => ReactNode;
}) {
  return (
    <div className="qm-settings">
      <h3 className="g-label">Writes</h3>
      <ul className="qm-writes">
        {writes.map((w, i) => (
          <li className="qm-write" key={`${w.kind}:${w.field ?? w.messageId}`}>
            <div className="qm-write__head">
              <span>
                <strong>{w.name}</strong>
                <span className="muted">
                  {" "}
                  {w.kind === "welcome"
                    ? "· new text"
                    : w.isNew
                      ? "· a new saved message"
                      : "· a new version of this saved message"}
                </span>
              </span>
              {remove(i)}
            </div>
            <CardText card={w.card} names={names} />
            {w.was ? (
              <details className="qm-write__was">
                <summary>What it says now</summary>
                <CardText card={w.was} names={names} />
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
