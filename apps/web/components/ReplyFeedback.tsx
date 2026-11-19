"use client";

import { useState, useTransition } from "react";
import { rateReply } from "@/app/servers/[guildId]/quartermaster/actions";
import { toast } from "./Toaster";

/**
 * Thumbs up or down on one of the AI assistant's replies. A thumbs down asks what was wrong
 * (optional). Pressing the same thumb again takes the rating back. Down-rated replies are
 * reviewed as new eval cases, so what admins really ask keeps testing the assistant.
 */
export function ReplyFeedback({
  guildId,
  messageId,
  initial,
}: {
  guildId: string;
  messageId: string;
  initial: 1 | -1 | null;
}) {
  const [rating, setRating] = useState(initial);
  const [noting, setNoting] = useState(false);
  const [sent, setSent] = useState(false);
  const [, start] = useTransition();

  const save = (next: 1 | -1 | null, note?: string) => {
    const was = rating;
    setRating(next);
    start(async () => {
      const r = await rateReply(guildId, messageId, next, note);
      if (!r.ok) {
        setRating(was);
        toast({ message: "That rating didn't save. Try again.", tone: "error" });
      }
    });
  };

  return (
    <span className="qm-rate">
      <button
        type="button"
        className={`qm-rate__btn${rating === 1 ? " is-on" : ""}`}
        aria-pressed={rating === 1}
        aria-label="Helpful"
        title="Helpful"
        onClick={() => {
          setNoting(false);
          save(rating === 1 ? null : 1);
        }}
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            d="M5 7v6H2.5V7Zm0 0 2.5-4.5c.9 0 1.5.7 1.3 1.6L8.5 6.5H12a1.5 1.5 0 0 1 1.4 2l-1.3 3.6a1.5 1.5 0 0 1-1.4 1H5"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className={`qm-rate__btn${rating === -1 ? " is-on" : ""}`}
        aria-pressed={rating === -1}
        aria-label="Not helpful"
        title="Not helpful"
        onClick={() => {
          if (rating === -1) {
            setNoting(false);
            save(null);
          } else {
            save(-1);
            setNoting(true);
            setSent(false);
          }
        }}
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            d="M11 9V3h2.5v6Zm0 0-2.5 4.5c-.9 0-1.5-.7-1.3-1.6l.3-2.4H4a1.5 1.5 0 0 1-1.4-2l1.3-3.6A1.5 1.5 0 0 1 5.3 3H11"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {noting && !sent ? (
        <form
          className="qm-rate__note"
          onSubmit={(e) => {
            e.preventDefault();
            const note = String(new FormData(e.currentTarget).get("note") ?? "");
            save(-1, note);
            setSent(true);
            setNoting(false);
          }}
        >
          <label className="sr-only" htmlFor={`note-${messageId}`}>
            What was wrong?
          </label>
          <input
            id={`note-${messageId}`}
            name="note"
            className="g-input qm-rate__input"
            maxLength={500}
            placeholder="What was wrong? (optional)"
          />
          <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
            Send
          </button>
        </form>
      ) : null}
      {sent ? <span className="qm-rate__thanks">Thanks, noted.</span> : null}
    </span>
  );
}
