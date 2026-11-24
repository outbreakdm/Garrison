"use client";

import {
  type Currency,
  coinNumber,
  type EarnRules,
  ECONOMY_LIMITS,
  isIcon,
  money,
  newItemId,
  type ShopItem,
} from "@garrison/db/cards";
import { type ReactNode, useState } from "react";
import { AutoSaveCard, useSaveSignal } from "@/components/AutoSave";
import { ProTag } from "@/components/cards/CardEditor";
import { CheckList } from "@/components/settings";
import type { AutoResult } from "@/lib/autosave";

type Action = (form: FormData) => Promise<AutoResult>;
interface Named {
  id: string;
  name: string;
}

/** A number box that reports whole numbers only; empty reads as 0. */
function Num({
  label,
  value,
  onChange,
  min = 0,
  max,
  help,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max: number;
  help?: string;
}) {
  return (
    <label className="g-field">
      <span className="field-label">{label}</span>
      <input
        className="g-input"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.trunc(Number(e.target.value) || 0))}
      />
      {help ? <span className="g-help">{help}</span> : null}
    </label>
  );
}

/** One way to earn: its switch, then its numbers while it's on. */
function Source({
  title,
  on,
  onToggle,
  locked,
  children,
}: {
  title: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  locked?: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset className="earn-source" data-on={on ? "" : undefined}>
      <legend className="earn-source__head">
        <label className="check">
          <input
            type="checkbox"
            checked={on}
            disabled={locked && !on}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span>{title}</span>
        </label>
        {locked !== undefined ? <ProTag on={!locked} /> : null}
      </legend>
      {on ? <div className="earn-source__fields">{children}</div> : null}
    </fieldset>
  );
}

export function EarningPanel(props: {
  guildId: string;
  currency: Currency;
  earn: EarnRules;
  noEarnChannelIds: string[];
  channels: Named[];
  pro: boolean;
  action: Action;
  undo: Action;
  stamp: string;
}) {
  return (
    <AutoSaveCard
      id="settings"
      title="Currency and earning"
      action={props.action}
      undo={props.undo}
      guildId={props.guildId}
      stamp={props.stamp}
      saveLabel="Save currency and earning"
      fields={["enabled", "currency", "earn", "noEarnChannelIds"]}
    >
      <EarningFields {...props} />
    </AutoSaveCard>
  );
}

function EarningFields({
  currency: savedCurrency,
  earn: savedEarn,
  noEarnChannelIds,
  channels,
  pro,
}: Parameters<typeof EarningPanel>[0]) {
  const [currency, setCurrency] = useState(savedCurrency);
  const [earn, setEarn] = useState(savedEarn);
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify({ currency, earn }));
  const set = <K extends keyof EarnRules>(k: K, patch: Partial<EarnRules[K]>) =>
    setEarn((e) => ({ ...e, [k]: { ...e[k], ...patch } }));
  const iconOk = isIcon(currency.icon.trim());
  const blocked =
    !currency.name.trim() || !currency.singular.trim()
      ? "Name the currency (one and many)."
      : !iconOk
        ? "Pick an emoji for the currency, or paste a server emoji like <:gold:123…>."
        : earn.chat.max < earn.chat.min
          ? "The most per message can't be less than the least."
          : null;

  return (
    <div ref={signal} className="economy-fields" data-hold={blocked ?? undefined}>
      <input type="hidden" name="currency" value={JSON.stringify(currency)} />
      <input type="hidden" name="earn" value={JSON.stringify(earn)} />
      <fieldset className="editor-group">
        <legend className="g-label">Currency</legend>
        <div className="field-row">
          <label className="g-field">
            <span className="field-label">Name</span>
            <input
              className="g-input"
              value={currency.name}
              maxLength={ECONOMY_LIMITS.currencyName}
              placeholder="Coins"
              onChange={(e) => setCurrency({ ...currency, name: e.target.value })}
            />
          </label>
          <label className="g-field">
            <span className="field-label">One of them</span>
            <input
              className="g-input"
              value={currency.singular}
              maxLength={ECONOMY_LIMITS.currencyName}
              placeholder="Coin"
              onChange={(e) => setCurrency({ ...currency, singular: e.target.value })}
            />
          </label>
          <label className="g-field">
            <span className="field-label">Icon</span>
            <input
              className="g-input"
              value={currency.icon}
              maxLength={ECONOMY_LIMITS.icon}
              aria-invalid={!iconOk}
              onChange={(e) => setCurrency({ ...currency, icon: e.target.value })}
            />
          </label>
        </div>
        <p className="economy-sample" aria-live="polite">
          {iconOk && currency.name.trim()
            ? `${money({ ...currency, icon: currency.icon.trim() }, 1250)} · ${money({ ...currency, icon: currency.icon.trim() }, 1)}`
            : "…"}
        </p>
        <span className="g-help">
          A server emoji works too: in Discord, type \:name: in a message and paste what it shows.
        </span>
      </fieldset>

      <fieldset className="editor-group">
        <legend className="g-label">Earning</legend>
        <Source title="Chatting" on={earn.chat.on} onToggle={(on) => set("chat", { on })}>
          <Num
            label="Least per message"
            value={earn.chat.min}
            max={ECONOMY_LIMITS.chat}
            onChange={(min) => set("chat", { min })}
          />
          <Num
            label="Most per message"
            value={earn.chat.max}
            max={ECONOMY_LIMITS.chat}
            onChange={(max) => set("chat", { max })}
          />
          <Num
            label="Once every (seconds)"
            value={earn.chat.cooldownSeconds}
            min={10}
            max={ECONOMY_LIMITS.cooldown}
            onChange={(cooldownSeconds) => set("chat", { cooldownSeconds })}
            help="Spam earns nothing extra."
          />
        </Source>
        <Source
          title="Daily claim (/daily)"
          on={earn.daily.on}
          onToggle={(on) => set("daily", { on })}
        >
          <Num
            label="Amount"
            value={earn.daily.amount}
            max={ECONOMY_LIMITS.daily}
            onChange={(amount) => set("daily", { amount })}
          />
          <Num
            label="Streak bonus a day"
            value={earn.daily.streakBonus}
            max={ECONOMY_LIMITS.daily}
            onChange={(streakBonus) => set("daily", { streakBonus })}
          />
          <Num
            label="Streak grows for (days)"
            value={earn.daily.streakDays}
            min={1}
            max={ECONOMY_LIMITS.streakDays}
            onChange={(streakDays) => set("daily", { streakDays })}
            help={`Day ${earn.daily.streakDays} pays ${coinNumber(earn.daily.amount + (earn.daily.streakDays - 1) * earn.daily.streakBonus)}.`}
          />
        </Source>
        <Source
          title="Paying each other (/pay)"
          on={earn.pay.on}
          onToggle={(on) => set("pay", { on })}
        >
          <Num
            label="Most one member pays a day"
            value={earn.pay.dailyCap}
            max={ECONOMY_LIMITS.amount}
            onChange={(dailyCap) => set("pay", { dailyCap })}
            help="Keeps alts from funneling coins to one account."
          />
        </Source>
        <Source
          title="Time in voice"
          on={earn.voice.on}
          onToggle={(on) => set("voice", { on })}
          locked={!pro}
        >
          <Num
            label="Every 10 minutes"
            value={earn.voice.per10}
            max={ECONOMY_LIMITS.chat}
            onChange={(per10) => set("voice", { per10 })}
            help="With someone else in the channel, not deafened, not in the AFK channel."
          />
        </Source>
        <Source
          title="Level-ups"
          on={earn.level.on}
          onToggle={(on) => set("level", { on })}
          locked={!pro}
        >
          <Num
            label="At each level"
            value={earn.level.perLevel}
            max={ECONOMY_LIMITS.amount}
            onChange={(perLevel) => set("level", { perLevel })}
            help="Needs Leveling on."
          />
        </Source>
      </fieldset>

      <CheckList
        name="noEarnChannelIds"
        label="Chatting earns nothing in"
        value={noEarnChannelIds}
        options={channels.map((c) => ({ id: c.id, label: `#${c.name}` }))}
      />
      {blocked ? (
        <p className="g-help g-help--warn" role="status">
          {blocked} Nothing saves until then.
        </p>
      ) : null}
    </div>
  );
}

export function ShopPanel(props: {
  guildId: string;
  shop: ShopItem[];
  currency: Currency;
  roles: Named[];
  channels: Named[];
  staffChannelId: string | null;
  limit: number;
  pro: boolean;
  action: Action;
  undo: Action;
  stamp: string;
}) {
  return (
    <AutoSaveCard
      id="shop"
      title="Shop"
      action={props.action}
      undo={props.undo}
      guildId={props.guildId}
      stamp={props.stamp}
      saveLabel="Save the shop"
      fields={["shop", "staffChannelId"]}
    >
      <ShopFields {...props} />
    </AutoSaveCard>
  );
}

function ShopFields({
  shop: saved,
  currency,
  roles,
  channels,
  staffChannelId,
  limit,
  pro,
}: Parameters<typeof ShopPanel>[0]) {
  const [items, setItems] = useState<ShopItem[]>(saved);
  const [staff, setStaff] = useState(staffChannelId ?? "");
  const [added, setAdded] = useState<string | null>(null);
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify(items));
  const set = (i: number, patch: Partial<ShopItem>) =>
    setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const full = items.length >= Math.min(limit, ECONOMY_LIMITS.items);
  const optional = (v: string) => (v.trim() ? Math.trunc(Number(v)) || null : null);
  const blocked = items.some((i) => !i.name.trim())
    ? "Give each item a name."
    : items.some((i) => !(i.price >= 1))
      ? "Each item needs a price of 1 or more."
      : items.some((i) => i.kind === "role" && !i.roleId)
        ? "Pick the role each role item gives."
        : items.some((i) => i.kind === "staff") && !staff
          ? "Pick the staff channel hand-delivered items go to."
          : null;

  return (
    <div ref={signal} className="economy-fields" data-hold={blocked ?? undefined}>
      <input type="hidden" name="shop" value={JSON.stringify(items)} />
      {items.length ? (
        <ol className="counter-rows">
          {items.map((item, i) => (
            <li className="counter-row" key={item.id} data-paused={i >= limit ? "" : undefined}>
              <div className="shop-row__head">
                <input
                  className="g-input shop-row__emoji"
                  value={item.emoji ?? ""}
                  maxLength={ECONOMY_LIMITS.icon}
                  placeholder="⭐"
                  aria-label={`Item ${i + 1} emoji`}
                  onChange={(e) => set(i, { emoji: e.target.value || null })}
                />
                <input
                  className="g-input"
                  value={item.name}
                  maxLength={ECONOMY_LIMITS.name}
                  placeholder="VIP for a week"
                  aria-label={`Item ${i + 1} name`}
                  aria-invalid={!item.name.trim()}
                  // biome-ignore lint/a11y/noAutofocus: the item just added by the button below
                  autoFocus={item.id === added}
                  onChange={(e) => set(i, { name: e.target.value })}
                />
                <label className="shop-row__price">
                  <span className="sr-only">Item {i + 1} price</span>
                  <span aria-hidden="true">{currency.icon}</span>
                  <input
                    className="g-input"
                    type="number"
                    min={1}
                    max={ECONOMY_LIMITS.price}
                    value={item.price}
                    onChange={(e) => set(i, { price: Math.trunc(Number(e.target.value) || 0) })}
                  />
                </label>
                <button
                  type="button"
                  className="list-rows__remove"
                  aria-label={`Remove ${item.name || `item ${i + 1}`}`}
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              <div className="shop-row__body">
                <label className="g-field">
                  <span className="field-label">Buying gives</span>
                  <select
                    className="g-input"
                    value={item.kind === "role" ? (item.roleId ?? "") : "staff"}
                    onChange={(e) =>
                      e.target.value === "staff"
                        ? set(i, { kind: "staff", roleId: null, hours: null })
                        : set(i, { kind: "role", roleId: e.target.value || null, question: null })
                    }
                  >
                    <option value="staff">Something staff hand over</option>
                    <option value="">A role…</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        @{r.name}
                      </option>
                    ))}
                  </select>
                </label>
                {item.kind === "role" ? (
                  <label className="g-field">
                    <span className="field-label">
                      For (hours) <ProTag on={pro} />
                    </span>
                    <input
                      className="g-input"
                      type="number"
                      min={1}
                      max={ECONOMY_LIMITS.hours}
                      value={item.hours ?? ""}
                      placeholder="Kept"
                      disabled={!pro && !item.hours}
                      onChange={(e) => set(i, { hours: optional(e.target.value) })}
                    />
                  </label>
                ) : null}
                <label className="g-field">
                  <span className="field-label">Stock</span>
                  <input
                    className="g-input"
                    type="number"
                    min={1}
                    max={ECONOMY_LIMITS.stock}
                    value={item.stock ?? ""}
                    placeholder="No limit"
                    onChange={(e) => set(i, { stock: optional(e.target.value) })}
                  />
                </label>
                <label className="g-field">
                  <span className="field-label">Per member</span>
                  <input
                    className="g-input"
                    type="number"
                    min={1}
                    max={ECONOMY_LIMITS.stock}
                    value={item.perMember ?? ""}
                    placeholder="No limit"
                    onChange={(e) => set(i, { perMember: optional(e.target.value) })}
                  />
                </label>
                <label className="g-field">
                  <span className="field-label">Only for</span>
                  <select
                    className="g-input"
                    value={item.needsRoleId ?? ""}
                    onChange={(e) => set(i, { needsRoleId: e.target.value || null })}
                  >
                    <option value="">Everyone</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        @{r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="g-field shop-row__wide">
                  <span className="field-label">Description</span>
                  <input
                    className="g-input"
                    value={item.description ?? ""}
                    maxLength={ECONOMY_LIMITS.description}
                    placeholder="What it is and how long it lasts"
                    onChange={(e) => set(i, { description: e.target.value || null })}
                  />
                </label>
                {item.kind === "staff" ? (
                  <label className="g-field shop-row__wide">
                    <span className="field-label">Ask before buying</span>
                    <input
                      className="g-input"
                      value={item.question ?? ""}
                      maxLength={ECONOMY_LIMITS.question}
                      placeholder="Which color? Leave empty to ask nothing"
                      onChange={(e) => set(i, { question: e.target.value || null })}
                    />
                  </label>
                ) : null}
              </div>
              {i >= limit ? (
                <p className="g-help counter-row__note">Paused on Free: Garrison Pro sells it.</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="g-help">
          Nothing for sale yet. A role for a week, a custom color, a shout-out: add the first item.
        </p>
      )}
      <div className="list-rows__foot">
        <button
          type="button"
          className="g-btn g-btn--secondary g-btn--sm"
          disabled={full}
          onClick={() => {
            const id = newItemId();
            setItems([
              ...items,
              {
                id,
                name: "",
                description: null,
                emoji: null,
                price: 100,
                kind: "staff",
                roleId: null,
                hours: null,
                stock: null,
                perMember: null,
                needsRoleId: null,
                question: null,
              },
            ]);
            setAdded(id);
          }}
        >
          Add an item
        </button>
        <span className="g-help">
          {items.length} of {limit}
          {limit < ECONOMY_LIMITS.items ? ` on Free; up to ${ECONOMY_LIMITS.items} on Pro` : ""}
        </span>
      </div>
      <label className="g-field" htmlFor="staffChannelId">
        <span className="field-label">Hand-delivered items go to</span>
        <select
          className="g-input"
          id="staffChannelId"
          name="staffChannelId"
          value={staff}
          onChange={(e) => setStaff(e.target.value)}
        >
          <option value="">Pick a staff channel</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
        <span className="g-help">
          Each purchase posts a card there with Done and Refund. Roles are given at once instead.
        </span>
      </label>
      {blocked ? (
        <p className="g-help g-help--warn" role="status">
          {blocked} Nothing saves until then.
        </p>
      ) : null}
    </div>
  );
}
