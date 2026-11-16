"use client";

import { RANK_CARD_LIMITS, type RankCardField, type RankCardStyle } from "@garrison/db/cards";
import { useState } from "react";
import { type RankCardNumbers, RankCardView } from "@/components/RankCardView";
import { saveMemberCard } from "../actions";

/**
 * Your rank card in this server, and the details it asks you for (what /rankcard fills in).
 * The card changes as you type; Save stores it for /rank. Details read from your shared game
 * accounts show as they are and are changed on Account.
 */
export function MemberCardForm({
  guildId,
  style,
  name,
  numbers,
  answers,
  fromAccounts,
  linked,
}: {
  guildId: string;
  style: RankCardStyle;
  name: string;
  numbers: RankCardNumbers;
  answers: Record<string, string>;
  /** Values for fields the card reads from shared accounts, by field ID. */
  fromAccounts: Record<string, string>;
  linked: string[];
}) {
  const [typed, setTyped] = useState(answers);
  const asked = style.fields.filter((f) => !f.from);
  const details = style.fields.flatMap((f: RankCardField) => {
    const value = f.from ? fromAccounts[f.id] : typed[f.id]?.trim();
    return value ? [{ label: f.label, value }] : [];
  });

  return (
    <div className="member-card">
      <div className="member-card__preview">
        <RankCardView
          style={style}
          name={name}
          numbers={numbers}
          details={details}
          linked={linked}
        />
        <p className="g-help">How /rank shows you in Discord. Only you change your details.</p>
      </div>
      {asked.length ? (
        <form action={saveMemberCard} className="card-col member-card__form">
          <input type="hidden" name="guildId" value={guildId} />
          {asked.map((f) => (
            <label className="g-field" htmlFor={`card-${f.id}`} key={f.id}>
              <span>{f.label}</span>
              <input
                className="g-input"
                id={`card-${f.id}`}
                name={`f_${f.id}`}
                maxLength={RANK_CARD_LIMITS.value}
                placeholder={f.hint ?? ""}
                value={typed[f.id] ?? ""}
                onChange={(e) => setTyped({ ...typed, [f.id]: e.target.value })}
              />
            </label>
          ))}
          <div className="form-foot">
            <button type="submit" className="g-btn g-btn--primary">
              Save my details
            </button>
            <span className="g-help">The same as /rankcard in Discord.</span>
          </div>
        </form>
      ) : (
        <p className="g-help member-card__none">
          This server's card doesn't ask for details. It shows your level, rank and XP.
        </p>
      )}
    </div>
  );
}
