"use client";

import { blankCard, SHOP_PANEL } from "@garrison/db/cards";
import { useState } from "react";
import { AutoSaveCard, useSaveSignal } from "@/components/AutoSave";
import { CardPreview, PreviewDropdown } from "@/components/cards/CardPreview";
import { PanelWords } from "@/components/panels/PanelWords";
import type { AutoResult } from "@/lib/autosave";

type Action = (form: FormData) => Promise<AutoResult>;

interface Props {
  guildId: string;
  /** The panel's words as members see them now: the server's, or the standard ones. */
  saved: { title: string; body: string };
  /** Each item's line on the panel, as the bot writes it (emoji, name, price, what it gives). */
  lines: string[];
  /** The channel the panel is in, for the preview. */
  channel: string | null;
  action: Action;
  undo: Action;
  stamp: string;
}

const NO_NAMES = { roles: new Map<string, string>(), channels: new Map<string, string>() };

/**
 * The shop panel as a panel that saves itself: its title and text; beside it, the panel as
 * members see it, with the shop and the Buy dropdown. The items come from the shop above.
 */
export function ShopPanelEditor(props: Props) {
  return (
    <AutoSaveCard
      id="shop-panel"
      title="Shop panel"
      action={props.action}
      undo={props.undo}
      guildId={props.guildId}
      stamp={props.stamp}
      saveLabel="Save the panel"
    >
      <PanelFields {...props} />
    </AutoSaveCard>
  );
}

function PanelFields({ saved, lines, channel }: Props) {
  const [words, setWords] = useState(saved);
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify(words));
  const card = {
    ...blankCard(words.title.trim() || SHOP_PANEL.title),
    blocks: [
      ...(words.body.trim() ? [{ kind: "text" as const, text: words.body }] : []),
      {
        kind: "text" as const,
        text: lines.length ? lines.join("\n") : "The shop is empty for now.",
      },
    ],
  };
  return (
    <div ref={signal} className="editor-layout editor-layout--fit">
      <div className="editor-fields">
        <p className="g-help">
          Post it in a #shop channel. Members pick an item from its list and see the price and their
          balance before anything is spent; an item that asks something opens its question first.
          Garrison updates it after each purchase, so the stock it shows stays right.
        </p>
        <PanelWords
          names={{ title: "shopPanelTitle", body: "shopPanelBody" }}
          value={words}
          onChange={(v) => setWords({ title: v.title, body: v.body })}
        />
      </div>
      <div className="preview-pane">
        <div className="preview-pane__head">
          <span className="g-label">In Discord</span>
          <span className="g-help">With the shop as it's saved</span>
        </div>
        <CardPreview
          card={card}
          channel={channel}
          names={NO_NAMES}
          controls={lines.length ? <PreviewDropdown placeholder={SHOP_PANEL.pick} /> : undefined}
        />
      </div>
    </div>
  );
}
