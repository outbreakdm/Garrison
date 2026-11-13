"use client";

import {
  DEFAULT_PLACEHOLDER,
  type Entitlements,
  isCustomEmoji,
  isEmoji,
  lockedCardFields,
  newCustomEmoji,
  optionLimit,
  ROLE_MENU_LIMITS,
  type RoleMenu,
  type RoleMenuOption,
  restoreLockedCard,
} from "@garrison/db/cards";
import { useMemo, useState } from "react";
import { CardEditor, move, ProNotice, ProTag, RowTools } from "@/components/cards/CardEditor";
import { CardPreview, PreviewButtons, PreviewDropdown } from "@/components/cards/CardPreview";
import { EmojiInput, type ServerEmojiChoice } from "@/components/cards/EmojiInput";

export interface RoleChoice {
  id: string;
  name: string;
  /** Garrison's own role sits at or below it, so Garrison can't give it yet. */
  aboveBot: boolean;
}

type Action = (form: FormData) => Promise<void>;

const blankOption = (): RoleMenuOption => ({
  roleId: "",
  label: "",
  emoji: null,
  description: null,
});

/**
 * One role menu: the card (shared editor), the roles members pick from, and the
 * rules, with the Discord preview beside them. Saving goes through the server
 * action with the whole menu as JSON; posting is a separate request so Discord
 * always gets the saved menu, never unsaved edits.
 */
export function RoleMenuEditor({
  guildId,
  saved,
  ent,
  give,
  need,
  channels,
  postedIn,
  paused,
  planHref,
  saveAction,
  removeAction,
  requestAction,
  serverEmoji,
}: {
  guildId: string;
  saved: RoleMenu;
  ent: Entitlements;
  give: RoleChoice[];
  need: { id: string; name: string }[];
  channels: { id: string; name: string }[];
  postedIn: string | null;
  paused: boolean;
  planHref: string;
  saveAction: Action;
  removeAction: Action;
  requestAction: Action;
  serverEmoji: ServerEmojiChoice[];
}) {
  const [menu, setMenu] = useState<RoleMenu>(saved);
  const [channelId, setChannelId] = useState(postedIn ?? channels[0]?.id ?? "");
  const set = (patch: Partial<RoleMenu>) => setMenu((m) => ({ ...m, ...patch }));
  const setOptions = (options: RoleMenuOption[]) => set({ options });
  const dirty = JSON.stringify(menu) !== JSON.stringify(saved);
  const id = (name: string) => `${saved.id}-${name}`;

  const names = useMemo(
    () => ({
      roles: new Map([...give, ...need].map((r) => [r.id, r.name])),
      channels: new Map(channels.map((c) => [c.id, c.name])),
    }),
    [give, need, channels],
  );
  const roleName = (roleId: string) => names.roles.get(roleId);

  // Pro options tried on Free: shown in the preview, refused on save.
  const lockedCard = lockedCardFields(menu.card, ent, saved.card);
  const pickLocked =
    !ent["roles.limits"] &&
    menu.maxPicks !== null &&
    menu.maxPicks > 1 &&
    menu.maxPicks !== saved.maxPicks;
  const needLocked =
    !ent["roles.limits"] &&
    Boolean(menu.requiredRoleId) &&
    menu.requiredRoleId !== saved.requiredRoleId;
  const emojiLocked =
    !ent["emoji.custom"] &&
    newCustomEmoji(
      menu.options.map((o) => o.emoji),
      saved.options.map((o) => o.emoji),
    ).length > 0;
  const locked = [
    ...lockedCard.map((f) => f.label),
    ...(pickLocked ? [`"Up to ${menu.maxPicks}" picks`] : []),
    ...(needLocked ? ["A needed role"] : []),
    ...(emojiLocked ? ["A server emoji"] : []),
  ];
  const undoPro = () =>
    setMenu((m) => {
      const card = restoreLockedCard(m.card, saved.card, lockedCard);
      return {
        ...m,
        card,
        maxPicks: pickLocked ? saved.maxPicks : m.maxPicks,
        requiredRoleId: needLocked ? saved.requiredRoleId : m.requiredRoleId,
        options: emojiLocked
          ? m.options.map((o) => {
              const was = saved.options.find((s) => s.roleId === o.roleId);
              return isCustomEmoji(o.emoji) ? { ...o, emoji: was?.emoji ?? null } : o;
            })
          : m.options,
      };
    });

  const max = optionLimit(menu.style);
  const overStyle = menu.options.length > max;
  const badEmoji = menu.options.some((o) => o.emoji && !isEmoji(o.emoji));
  // Caught here so a refused save never throws away unsaved edits; the server checks again.
  const blocked = locked.length
    ? "Undo the Pro changes to save, or upgrade."
    : badEmoji
      ? "Fix the emoji to save."
      : overStyle
        ? `Buttons hold ${max} roles: remove some or use a dropdown.`
        : null;
  const used = new Set(menu.options.map((o) => o.roleId));
  const pickCeiling = Math.max(2, Math.min(ROLE_MENU_LIMITS.dropdown, menu.options.length));
  const channelName = names.channels.get(channelId) ?? null;
  const postedHere = postedIn !== null && postedIn === channelId;
  const postLabel = postedHere
    ? `Update in #${channelName}`
    : postedIn
      ? `Move to #${channelName ?? "channel"}`
      : `Post in #${channelName ?? "channel"}`;
  const cantPost = paused
    ? "This menu is paused: the server has more menus than its plan runs."
    : !saved.options.length
      ? "Add at least one role and save before posting."
      : dirty
        ? "Save first: Discord gets the saved menu."
        : null;

  const preview = (
    <CardPreview
      card={menu.card}
      channel={channelName}
      names={names}
      controls={
        menu.style === "dropdown" ? (
          <PreviewDropdown placeholder={menu.placeholder || DEFAULT_PLACEHOLDER} />
        ) : (
          <PreviewButtons
            labels={menu.options.map((o) => ({
              label: o.label || roleName(o.roleId) || "",
              emoji: o.emoji,
            }))}
          />
        )
      }
    />
  );

  return (
    <div className="menu-editor">
      <form action={saveAction}>
        <input type="hidden" name="guildId" value={guildId} />
        <input type="hidden" name="menu" value={JSON.stringify(menu)} />
        <div className="editor-layout">
          <div className="editor-fields">
            <label className="g-field" htmlFor={id("name")}>
              <span>Menu name</span>
              <input
                className="g-input"
                id={id("name")}
                value={menu.name}
                maxLength={ROLE_MENU_LIMITS.name}
                required
                onChange={(e) => set({ name: e.target.value })}
              />
              <span className="g-help">Only the dashboard shows this. Members see the card.</span>
            </label>

            <CardEditor
              card={menu.card}
              onChange={(card) => set({ card })}
              idPrefix={saved.id}
              plan={{
                accent: ent["cards.accent"],
                images: ent["cards.images"],
                footer: ent["cards.footer"],
                embed: ent["cards.embed"],
              }}
            />

            <fieldset className="editor-group">
              <legend className="g-label">Roles</legend>
              <div className="segmented" role="radiogroup" aria-label="How members pick">
                {(
                  [
                    ["buttons", "Buttons"],
                    ["dropdown", "Dropdown"],
                  ] as const
                ).map(([value, label]) => (
                  <label className="segmented__item" key={value}>
                    <input
                      type="radio"
                      name={id("style")}
                      checked={menu.style === value}
                      onChange={() => set({ style: value })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div className="option-list">
                {menu.options.map((o, i) => {
                  const role = give.find((r) => r.id === o.roleId);
                  const emojiOk = !o.emoji || isEmoji(o.emoji);
                  const update = (patch: Partial<RoleMenuOption>) =>
                    setOptions(menu.options.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div
                      className={`option${menu.style === "dropdown" ? " option--dropdown" : ""}`}
                      // biome-ignore lint/suspicious/noArrayIndexKey: options can share an empty role while being picked
                      key={i}
                    >
                      <select
                        className="g-input option__role"
                        aria-label={`Role ${i + 1}`}
                        value={o.roleId}
                        required
                        onChange={(e) => {
                          const next = e.target.value;
                          const label =
                            !o.label || o.label === roleName(o.roleId)
                              ? (roleName(next) ?? "")
                              : o.label;
                          update({ roleId: next, label });
                        }}
                      >
                        <option value="" disabled>
                          Pick a role
                        </option>
                        {give.map((r) => (
                          <option
                            key={r.id}
                            value={r.id}
                            disabled={used.has(r.id) && r.id !== o.roleId}
                          >
                            @{r.name}
                            {r.aboveBot ? " (above Garrison)" : ""}
                          </option>
                        ))}
                      </select>
                      <input
                        className="g-input option__label"
                        aria-label={`Label for role ${i + 1}`}
                        placeholder="Label"
                        value={o.label}
                        maxLength={ROLE_MENU_LIMITS.label}
                        required
                        onChange={(e) => update({ label: e.target.value })}
                      />
                      <EmojiInput
                        label={`Emoji for role ${i + 1}`}
                        value={o.emoji}
                        serverEmoji={serverEmoji}
                        onChange={(emoji) => update({ emoji })}
                      />
                      <RowTools
                        index={i}
                        count={menu.options.length}
                        what={`role ${i + 1}`}
                        onMove={(to) => setOptions(move(menu.options, i, to))}
                        onRemove={() => setOptions(menu.options.filter((_, j) => j !== i))}
                      />
                      {menu.style === "dropdown" ? (
                        <input
                          className="g-input option__desc"
                          aria-label={`Description for role ${i + 1}`}
                          placeholder="Description (optional)"
                          value={o.description ?? ""}
                          maxLength={ROLE_MENU_LIMITS.description}
                          onChange={(e) => update({ description: e.target.value || null })}
                        />
                      ) : null}
                      {role?.aboveBot ? (
                        <p className="g-help g-help--warn option__note">
                          Garrison's role sits below @{role.name}, so it can't give it yet. Drag
                          Garrison above it in Server Settings → Roles.
                        </p>
                      ) : null}
                      {!emojiOk ? (
                        <p className="g-help g-help--error option__note">
                          Use one emoji, like 🎮, or type one of this server's as :name:.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {menu.options.length === 0 ? (
                <p className="g-help">
                  No roles yet. Add the roles members can pick: each becomes a{" "}
                  {menu.style === "dropdown" ? "choice in the dropdown" : "button"}.
                </p>
              ) : null}
              {overStyle ? (
                <p className="g-help g-help--error">
                  Buttons hold {max} roles. Remove some, or switch to a dropdown for up to{" "}
                  {ROLE_MENU_LIMITS.dropdown}.
                </p>
              ) : null}
              <div className="editor-row">
                <button
                  type="button"
                  className="g-btn g-btn--secondary g-btn--sm"
                  disabled={menu.options.length >= max || give.length <= menu.options.length}
                  onClick={() => setOptions([...menu.options, blankOption()])}
                >
                  Add role
                </button>
                <span className="meter mono">
                  {menu.options.length} / {max}
                </span>
              </div>
              {give.length === 0 ? (
                <p className="g-help">
                  This server has no roles a menu can give. Make one in Discord first: roles with
                  moderation or admin powers can never be in a menu.
                </p>
              ) : null}

              <div className="field-row">
                <label className="g-field" htmlFor={id("picks")}>
                  <span>Members can pick</span>
                  <select
                    className="g-input"
                    id={id("picks")}
                    value={menu.maxPicks === null ? "" : String(menu.maxPicks)}
                    onChange={(e) =>
                      set({ maxPicks: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">Any number</option>
                    <option value="1">Just one (picking another swaps)</option>
                    {Array.from({ length: pickCeiling - 1 }, (_, k) => k + 2).map((n) => (
                      <option key={n} value={n}>
                        Up to {n}
                        {ent["roles.limits"] ? "" : " (Pro)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="g-field" htmlFor={id("need")}>
                  <span className="field-label">
                    Who can use it <ProTag on={ent["roles.limits"]} />
                  </span>
                  <select
                    className="g-input"
                    id={id("need")}
                    value={menu.requiredRoleId ?? ""}
                    onChange={(e) => set({ requiredRoleId: e.target.value || null })}
                  >
                    <option value="">Everyone</option>
                    {need
                      .filter((r) => !used.has(r.id))
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          Only @{r.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {menu.style === "dropdown" ? (
                <label className="g-field" htmlFor={id("placeholder")}>
                  <span>Dropdown text</span>
                  <input
                    className="g-input"
                    id={id("placeholder")}
                    placeholder={DEFAULT_PLACEHOLDER}
                    value={menu.placeholder ?? ""}
                    maxLength={ROLE_MENU_LIMITS.placeholder}
                    onChange={(e) => set({ placeholder: e.target.value || null })}
                  />
                </label>
              ) : null}
            </fieldset>

            <ProNotice labels={locked} onReset={undoPro} planHref={planHref} />
            <div className="form-foot">
              <button type="submit" className="g-btn g-btn--primary" disabled={Boolean(blocked)}>
                Save {menu.name.trim() || "menu"}
              </button>
              <span className="g-help">
                {blocked ? <strong className="unsaved">{blocked} </strong> : null}
                {dirty && !blocked ? <strong className="unsaved">Unsaved changes. </strong> : null}
                Recorded in <a href={`/servers/${guildId}/settings#history`}>Settings history</a>,
                where it can be undone.
              </span>
            </div>
          </div>

          <div className="preview-pane">
            <div className="preview-pane__head">
              <span className="g-label">Preview in Discord</span>
              <span className="g-help">Updates as you type</span>
            </div>
            {preview}
          </div>
        </div>
      </form>

      <div className="menu-editor__foot">
        <form action={requestAction} className="post-form">
          <input type="hidden" name="guildId" value={guildId} />
          <input type="hidden" name="page" value="insignia" />
          <input type="hidden" name="kind" value="post_role_menu" />
          <input type="hidden" name="menuId" value={saved.id} />
          <label className="g-field" htmlFor={id("channel")}>
            <span>{postedIn ? "Posted in" : "Post in"}</span>
            <select
              className="g-input"
              id={id("channel")}
              name="channelId"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                  {c.id === postedIn ? " (posted here)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="g-btn g-btn--secondary"
            disabled={Boolean(cantPost) || !channelId}
          >
            {postLabel}
          </button>
          <span className="g-help">
            {cantPost ??
              (postedIn && !postedHere
                ? "Moving posts it in the new channel and deletes the old message."
                : "Garrison posts it as itself. Every click is checked against the saved menu.")}
          </span>
        </form>
        <form action={removeAction}>
          <input type="hidden" name="guildId" value={guildId} />
          <input type="hidden" name="menuId" value={saved.id} />
          <button type="submit" className="g-btn g-btn--ghost">
            Remove {saved.name}
          </button>
        </form>
      </div>
    </div>
  );
}
