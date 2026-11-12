import { getActiveGuild, webVerifySettings } from "@garrison/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { getDb } from "@/lib/db";
import { isGuildMember } from "@/lib/discord";
import { env } from "@/lib/env";
import { readFlash } from "@/lib/flash";
import { isSnowflake } from "@/lib/security";
import { requireSession } from "@/lib/session";
import { currentTheme } from "@/lib/theme";
import { submitVerify } from "./actions";

export const metadata: Metadata = { title: "Verify" };

/**
 * Website verification: the member signs in with Discord (a bot can't), passes the
 * captcha when the host has Turnstile keys, and asks Garrison for the role. The bot
 * checks the account age and everything else again before giving it.
 */
export default async function VerifyPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  if (!isSnowflake(guildId)) notFound();
  const session = await requireSession(`/verify/${guildId}`);
  const db = await getDb();
  const [guild, settings] = await Promise.all([
    getActiveGuild(db, guildId),
    webVerifySettings(db, guildId),
  ]);
  if (!guild || !settings) notFound();
  const member = await isGuildMember(guild.id, session.userId);
  const flash = await readFlash();
  const siteKey = env().TURNSTILE_SITE_KEY;
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      <Topbar
        username={session.username}
        theme={await currentTheme()}
        back={`/verify/${guild.id}`}
      />
      <main className="shell">
        <div className="main appeal">
          <div className="page-head">
            <div>
              <h1>Verify for {guild.name}</h1>
              <p>
                One step to open the rest of the server. You're signed in as {session.username}.
                {settings.minAge > 0
                  ? ` Accounts must be at least ${settings.minAge} days old.`
                  : ""}
              </p>
            </div>
          </div>
          {flash?.ok ? (
            <div className="notice notice--ok" role="status">
              {flash.ok}
            </div>
          ) : null}
          {flash?.error ? (
            <div className="notice" role="alert">
              {flash.error}
            </div>
          ) : null}
          {member ? (
            <form action={submitVerify} className="g-card card-col">
              <input type="hidden" name="guildId" value={guild.id} />
              {siteKey ? (
                <>
                  <script
                    src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                    async
                    defer
                    nonce={nonce}
                  />
                  <div className="cf-turnstile" data-sitekey={siteKey} />
                </>
              ) : null}
              <div className="form-foot">
                <button type="submit" className="g-btn g-btn--primary">
                  Verify me
                </button>
                <span className="g-help">Garrison gives you the role within a few seconds.</span>
              </div>
            </form>
          ) : (
            <p className="notice" role="status">
              Join {guild.name} in Discord first, then come back here.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
