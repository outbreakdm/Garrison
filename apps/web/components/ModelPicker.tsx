"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fast or Smart for the AI assistant's next message, in the composer. Shows what a message
 * costs on each and about how many are left, and the first time Smart is sent from this
 * browser asks once, since one Smart message can hold up to a few hundred supplies. Smart is
 * Pro and Agency; on Free it's shown locked with Upgrade. The choice is a radio named
 * "model" in the composer's form, and is copied into the quick replies' form too
 * ([data-model-sync]).
 */

export interface ModelPrice {
  /** Supplies a typical message uses. */
  typical: number;
  /** The most one message holds while it runs. */
  hold: number;
}

const CONFIRMED = "garrison:smart-confirmed";
/** A Smart message that could hold more than this asks first. */
const ASK_ABOVE = 100;

function confirmedBefore() {
  try {
    return localStorage.getItem(CONFIRMED) === "1";
  } catch {
    return false;
  }
}
function remember() {
  try {
    localStorage.setItem(CONFIRMED, "1");
  } catch {
    // Private windows: it just asks again next time.
  }
}

export function ModelPicker({
  form,
  initial,
  smartAllowed,
  fast,
  smart,
  suppliesLeft,
  upgradeHref,
}: {
  /** The composer form's id: the switch sits outside it, under the message box. */
  form: string;
  initial: "fast" | "smart";
  smartAllowed: boolean;
  fast: ModelPrice;
  smart: ModelPrice;
  suppliesLeft: number;
  upgradeHref: string;
}) {
  const [model, setModel] = useState<"fast" | "smart">(smartAllowed ? initial : "fast");
  const [asking, setAsking] = useState(false);
  const root = useRef<HTMLFieldSetElement>(null);
  const price = model === "smart" ? smart : fast;
  const left = Math.floor(suppliesLeft / price.typical);

  // The quick replies send the same choice.
  useEffect(() => {
    for (const el of document.querySelectorAll<HTMLInputElement>("input[data-model-sync]"))
      el.value = model;
  }, [model]);

  // A first Smart message asks before it goes.
  useEffect(() => {
    const composer = document.getElementById(form);
    if (!(composer instanceof HTMLFormElement)) return;
    const onSubmit = (e: SubmitEvent) => {
      if (model !== "smart" || smart.hold <= ASK_ABOVE || confirmedBefore()) return;
      e.preventDefault();
      setAsking(true);
    };
    composer.addEventListener("submit", onSubmit);
    return () => composer.removeEventListener("submit", onSubmit);
  }, [form, model, smart.hold]);

  return (
    <fieldset className="qm-model" ref={root}>
      <legend className="sr-only">Model for this message</legend>
      <div className="qm-model__switch">
        <label className="qm-model__opt">
          <input
            className="qm-model__radio"
            type="radio"
            name="model"
            form={form}
            value="fast"
            checked={model === "fast"}
            onChange={() => setModel("fast")}
          />
          <span className="qm-model__name">Fast</span>
        </label>
        <label className={`qm-model__opt${smartAllowed ? "" : " is-locked"}`}>
          <input
            className="qm-model__radio"
            type="radio"
            name="model"
            form={form}
            value="smart"
            checked={model === "smart"}
            disabled={!smartAllowed}
            onChange={() => setModel("smart")}
          />
          <span className="qm-model__name">Smart</span>
        </label>
      </div>
      <p className="qm-model__price">
        {model === "smart" ? "Smart: Claude Sonnet, for big designs and tricky permissions. " : ""}
        About {price.typical} {price.typical === 1 ? "supply" : "supplies"} a message, up to{" "}
        {price.hold} · about {left.toLocaleString("en-US")} {left === 1 ? "message" : "messages"}{" "}
        left
        {smartAllowed ? null : (
          <>
            {" · "}
            <a href={upgradeHref}>Smart is on Pro</a>
          </>
        )}
      </p>
      {asking ? (
        <div className="qm-model__ask" role="alertdialog" aria-label="Send with Smart?">
          <p className="qm-model__ask-text">
            Smart uses about {smart.typical} supplies a message, and can hold up to {smart.hold}{" "}
            while it works. What it doesn't use comes back.
          </p>
          <div className="qm-model__ask-do">
            <button
              type="button"
              className="g-btn g-btn--primary g-btn--sm"
              onClick={() => {
                remember();
                setAsking(false);
                const composer = document.getElementById(form);
                if (composer instanceof HTMLFormElement) composer.requestSubmit();
              }}
            >
              Send with Smart
            </button>
            <button
              type="button"
              className="g-btn g-btn--ghost g-btn--sm"
              onClick={() => {
                setAsking(false);
                setModel("fast");
              }}
            >
              Use Fast
            </button>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
