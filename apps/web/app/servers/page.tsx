import { listActiveGuilds } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Servers" };

export default async function ServersPage() {
  const session = await requireSession("/servers");
  const guilds = await listActiveGuilds(getDb(), session.manageableGuildIds);
  return (
    <>
      <Topbar username={session.username} />
      <main className="shell">
        <div className="main">
          <div className="page-head">
            <div>
              <span className="g-label">Your servers</span>
              <h1>Pick a server</h1>
              <p>Servers with Garrison where you have Manage Server.</p>
            </div>
          </div>
          {guilds.length ? (
            <div className="servers">
              {guilds.map((g) => (
                <Link key={g.id} href={`/servers/${g.id}`}>
                  <div className="g-card row-between">
                    <span className="big">{g.name}</span>
                    <span className="mono">{g.id}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="g-card">
              No servers yet. Add Garrison to a server you manage, then sign in again.
            </div>
          )}
        </div>
      </main>
    </>
  );
}
