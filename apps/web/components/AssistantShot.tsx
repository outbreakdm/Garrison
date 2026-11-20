import { engineLabel, QM_MODELS, qmHoldSupplies, qmTypicalSupplies } from "@garrison/db";
import { AI_ENGINE, AI_MODES } from "@garrison/db/cards";
import type { ServerPreview as Preview } from "@/lib/qm-preview";
import { ServerPreview } from "./ServerPreview";

/** The example draft: today's channels plus one plan's additions, as Your server marks them. */
const DEMO_PREVIEW: Preview = {
  loose: [],
  categories: [
    {
      key: "town",
      name: "Town Square",
      isNew: false,
      touched: false,
      channels: [
        { key: "general", name: "general", kind: "text", locked: false, isNew: false, details: [] },
        { key: "clips", name: "clips", kind: "text", locked: false, isNew: false, details: [] },
        { key: "lounge", name: "Lounge", kind: "voice", locked: false, isNew: false, details: [] },
      ],
    },
    {
      key: "val",
      name: "Valorant",
      isNew: true,
      touched: true,
      channels: [
        {
          key: "ranked",
          name: "ranked-lfg",
          kind: "text",
          locked: true,
          isNew: true,
          details: ["Only @Gold+ can see it"],
        },
        {
          key: "casual",
          name: "casual-lfg",
          kind: "text",
          locked: false,
          isNew: true,
          details: ["Slowmode 30 s"],
        },
        {
          key: "stack",
          name: "Stack",
          kind: "voice",
          locked: false,
          isNew: true,
          details: ["Up to 5 people"],
        },
      ],
    },
  ],
  roles: [
    { key: "gold", name: "Gold+", color: 0xffc83a, isNew: true, details: ["No permissions"] },
    { key: "mods", name: "Mods", color: 0x5ab0ff, isNew: false, details: [] },
    { key: "raiders", name: "Raiders", color: 0x2bd99f, isNew: false, details: [] },
  ],
  added: { categories: 1, channels: 3, roles: 1 },
};
const CHANGES =
  DEMO_PREVIEW.added.categories + DEMO_PREVIEW.added.channels + DEMO_PREVIEW.added.roles;

/**
 * The AI assistant as its Chat tab draws it: the conversation with Bastion's reply and what
 * it cost, the composer and the Fast | Smart picker, and the Your server panel with the
 * draft's changes marked and Apply. The dashboard's own classes, so it looks like the page;
 * inert, since it's a picture.
 */
export function AssistantShot() {
  const smart = {
    typical: qmTypicalSupplies(QM_MODELS.smart.id),
    hold: qmHoldSupplies(QM_MODELS.smart.id, 3),
  };
  return (
    <div className="lp-qm" inert>
      <section className="g-card qm-chat lp-qm__chat" aria-label="Chat">
        <div className="qm-chat__head">
          <h4 className="qm-chat__title">Chat</h4>
          <span className="g-btn g-btn--ghost g-btn--sm">New conversation</span>
        </div>
        <ol className="qm-chat__log">
          <li className="qm-msg qm-msg--me">
            <div className="qm-msg__bubble">
              <p>
                We play Valorant. Ranked and casual LFG, a voice room, and a Gold+ role that's the
                only one who can see ranked.
              </p>
            </div>
          </li>
          <li className="qm-msg qm-msg--bot">
            <span className="qm-msg__mark" aria-hidden="true" />
            <div className="qm-msg__bubble">
              <p className="qm-msg__text">
                This plan adds a Valorant category with #ranked-lfg, #casual-lfg and a Stack voice
                room, and a Gold+ role.{"\n"}- Only Gold+ can see #ranked-lfg{"\n"}- #casual-lfg
                gets a 30 s slowmode
              </p>
              <span className="qm-msg__cost">
                {engineLabel("smart")} · Used {smart.typical} supplies
              </span>
              <span className="qm-msg__plan">{CHANGES} changes · Show changes</span>
            </div>
          </li>
        </ol>
        <div className="qm-chat__choices lp-qm__choices">
          <span className="chip">Add a Diamond role</span>
          <span className="chip">Looks good</span>
        </div>
        <div className="qm-chat__composer">
          <span className="g-input qm-chat__input lp-qm__input">Answer, or ask for changes</span>
          <span className="g-btn g-btn--primary">Send</span>
        </div>
        <fieldset className="qm-model">
          <legend className="sr-only">{AI_ENGINE} mode</legend>
          <span className="qm-model__engine">{AI_ENGINE}</span>
          <span className="qm-model__switch">
            <label className="qm-model__opt">
              <input className="qm-model__radio" type="radio" name="lp-qm-model" value="fast" />
              <span className="qm-model__name">{AI_MODES.fast.label}</span>
            </label>
            <label className="qm-model__opt">
              <input
                className="qm-model__radio"
                type="radio"
                name="lp-qm-model"
                value="smart"
                defaultChecked
              />
              <span className="qm-model__name">{AI_MODES.smart.label}</span>
            </label>
          </span>
          <p className="qm-model__price">
            {AI_MODES.smart.label}: {AI_MODES.smart.about}. About {smart.typical} supplies a
            message, up to {smart.hold}
          </p>
        </fieldset>
      </section>

      <aside className="g-card qm-plan lp-qm__plan" aria-label="Your server">
        <header className="qm-plan__head">
          <span className="panel__icon qm-plan__icon" aria-hidden="true">
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path d="M3 2.5h7l3 3v8H3z" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M5.5 8h5M5.5 10.5h3.5" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <div className="qm-plan__heading">
            <h4 className="qm-plan__title">Your server</h4>
            <span className="qm-plan__counts">
              <strong>6</strong> channels · <strong>4</strong> roles · <strong>2</strong> categories
            </span>
          </div>
          <div className="qm-plan__actions">
            <span className="g-btn g-btn--ghost g-btn--sm">Discard</span>
            <span className="g-btn g-btn--primary lp-qm__apply">Apply {CHANGES} changes</span>
          </div>
        </header>
        <div className="qm-plan__summary">
          <p className="qm-plan__what">Valorant LFG, with ranked for Gold+ only</p>
          <p className="g-help">
            Adds 1 category, 3 channels and 1 role. Uses {CHANGES} supplies, held for 15 more min.
          </p>
        </div>
        <fieldset className="qm-tabs">
          <legend className="sr-only">Show</legend>
          <label>
            <input type="radio" name="qm-tab" value="channels" defaultChecked />
            <span className="qm-tabs__label">Channels</span>
          </label>
          <label>
            <input type="radio" name="qm-tab" value="roles" />
            <span className="qm-tabs__label">Roles</span>
          </label>
          <label>
            <input type="radio" name="qm-tab" value="modules" />
            <span className="qm-tabs__label qm-tabs__label--feat">Features</span>
          </label>
        </fieldset>
        <div className="qm-plan__body">
          <ServerPreview name="Example server" preview={DEMO_PREVIEW} planned />
        </div>
        <footer className="qm-plan__foot">
          <span className="qm-plan__delta">
            <span className="qm-plan__add">+{CHANGES} new</span>
          </span>
        </footer>
      </aside>
    </div>
  );
}
