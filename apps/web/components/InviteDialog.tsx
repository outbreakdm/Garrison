"use client";

import { useRef, useState } from "react";
import { AutoRefresh } from "./AutoRefresh";

/**
 * "Add Garrison" for one server: a popup that explains what's asked for, then
 * opens Discord's invite with that server already chosen. While the person
 * finishes in Discord, the list refreshes itself until Garrison shows up.
 */
export function InviteDialog({ guildName, href }: { guildName: string; href: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [waiting, setWaiting] = useState(false);
  return (
    <>
      <button
        type="button"
        className="g-btn g-btn--primary"
        onClick={() => dialog.current?.showModal()}
      >
        Add Garrison
      </button>
      <dialog
        ref={dialog}
        className="g-card invite-dialog"
        aria-label={`Add Garrison to ${guildName}`}
      >
        <div className="card-col">
          <h2 className="block-title">Add Garrison to {guildName}</h2>
          <p className="muted">
            Discord opens with this server already picked. Garrison asks only for the permissions it
            uses (moderation, roles, channels, logs), never Administrator.
          </p>
          <ol className="invite-steps">
            <li>
              Click <strong>Continue to Discord</strong> and then <strong>Authorize</strong>.
            </li>
            <li>In Server Settings → Roles, drag Garrison above the roles it should manage.</li>
            <li>Come back here: this list updates by itself.</li>
          </ol>
          {waiting ? (
            <p className="notice notice--ok" role="status">
              Waiting for Garrison to join {guildName}… this page refreshes by itself.
            </p>
          ) : null}
          <div className="row-between">
            <button
              type="button"
              className="g-btn g-btn--ghost"
              onClick={() => dialog.current?.close()}
            >
              {waiting ? "Close" : "Cancel"}
            </button>
            <a
              className="g-btn g-btn--primary"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setWaiting(true)}
            >
              Continue to Discord
            </a>
          </div>
        </div>
      </dialog>
      {waiting ? <AutoRefresh every={4000} forMs={180_000} /> : null}
    </>
  );
}
