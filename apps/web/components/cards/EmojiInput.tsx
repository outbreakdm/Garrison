"use client";

import { emojiLabel, isEmoji, resolveEmoji } from "@garrison/db/cards";
import { useEffect, useId, useState } from "react";

export interface ServerEmojiChoice {
  id: string;
  name: string;
  animated: boolean;
}

/**
 * One emoji: a standard one typed or pasted, or one of the server's own typed as
 * :name: (suggested as you type). Stored as Discord stores it; shown as :name:.
 */
export function EmojiInput({
  value,
  onChange,
  serverEmoji,
  label,
  className = "",
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
  serverEmoji: ServerEmojiChoice[];
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(emojiLabel(value));
  useEffect(() => setDraft(emojiLabel(value)), [value]);
  const list = useId();
  const ok = !value || isEmoji(value);
  return (
    <>
      <input
        className={`g-input option__emoji${ok ? "" : " g-input--invalid"} ${className}`}
        aria-label={label}
        aria-invalid={!ok}
        placeholder="Emoji"
        value={draft}
        maxLength={40}
        list={serverEmoji.length ? list : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = resolveEmoji(e.target.value, serverEmoji);
          onChange(v || null);
        }}
        onBlur={() => setDraft(emojiLabel(value))}
      />
      {serverEmoji.length ? (
        <datalist id={list}>
          {serverEmoji.map((e) => (
            <option key={e.id} value={`:${e.name}:`} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}
