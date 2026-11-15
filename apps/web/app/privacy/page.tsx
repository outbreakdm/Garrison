import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection, Mail } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Garrison collects, why, who it shares it with, how long it keeps it.",
  robots: { index: true, follow: true },
};

const sections: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <>
        <p>
          Garrison is a Discord bot with a website at {LEGAL.site} and a dashboard at{" "}
          {LEGAL.dashboard} (together, “Garrison” or “the Service”). It is run by an independent
          developer based in {LEGAL.state}, United States (“we”, “us”).
        </p>
        <p>
          This policy covers everyone Garrison touches: people who sign in to the dashboard, people
          who add Garrison to a server (“server admins”), and members of servers that use Garrison,
          including members who never interact with it directly. Garrison is not made by or
          affiliated with Discord. Discord’s own privacy policy covers what Discord does with your
          data.
        </p>
      </>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <h3>When you sign in to the dashboard</h3>
        <p>
          You sign in with Discord. We ask Discord only for your basic profile and the list of
          servers you’re in (the <code>identify</code> and <code>guilds</code> scopes). We receive
          your Discord user ID, username, display name and avatar, and which servers you’re in and
          can manage. We do not receive your email address or your password, and we never see your
          Discord login.
        </p>

        <h3>When you’re a member of a server that uses Garrison</h3>
        <p>
          Garrison sees what a Discord bot in that server sees, and keeps only what the features the
          server’s admins turned on need. Depending on those features, that can include:
        </p>
        <ul>
          <li>
            <strong>Identity:</strong> your Discord user ID, username, display name and avatar.
          </li>
          <li>
            <strong>Activity counts:</strong> how many messages you send and when (for ranks and XP,
            and for server insights), when you were last active, and when you joined or left, with
            the invite you used and who created it. Insights store numbers, never what you wrote.
          </li>
          <li>
            <strong>Moderation records:</strong> warnings, timeouts, kicks and bans issued through
            Garrison, with the reason staff gave; private notes staff write about members;
            quarantines and appeals you submit.
          </li>
          <li>
            <strong>Things you send to Garrison:</strong> support tickets and modmail (the messages
            in them are kept as the ticket’s transcript), suggestions and your votes on them,
            giveaway entries, group and event sign-ups, and the voice room you own.
          </li>
          <li>
            <strong>The server’s event log:</strong> joins, leaves, role and nickname changes, voice
            moves and similar events. If staff turn on “keep message text”, the log also keeps the
            text of messages that are edited or deleted.
          </li>
          <li>
            <strong>Verification:</strong> whether you passed the server’s verification. If you
            verify on our website, Cloudflare Turnstile checks you’re a person (see “Who we share it
            with”).
          </li>
        </ul>

        <h3>Message content</h3>
        <p>
          To do its job, Garrison reads messages as they’re sent: to run commands, count XP, block
          scam links and banned words, and (on Pro servers that turn it on) check messages with AI
          moderation. Reading isn’t keeping. Garrison stores message text only in the places listed
          above: ticket and modmail transcripts, the event log when “keep message text” is on, and
          the suggestions and appeals you write. It does not store the server’s general chat.
        </p>

        <h3>Game accounts you choose to link</h3>
        <p>
          On the Your accounts page you can link game accounts so a server can give you roles based
          on them. This is optional and happens only when you start it. Depending on what you link,
          we receive the connections you’ve added to your Discord profile (only when you ask us to
          read them), your Battle.net BattleTag and World of Warcraft characters (the{" "}
          <code>wow.profile</code> scope), or a RuneScape name you type in, whose public hiscores we
          look up. You decide which servers can see each link, and you can remove a link at any
          time.
        </p>

        <h3>When you run a server with Garrison</h3>
        <p>
          We keep the server’s settings, a history of who changed which setting and when, requests
          sent from the dashboard to the bot, server backups you take (roles, channels and
          permissions, not messages), templates you save, and AI assistant requests (what was asked,
          by whom, and how much AI it used), and your conversations with the AI assistant.
        </p>

        <h3>When you pay</h3>
        <p>
          Payments are handled by Stripe. Your card details go to Stripe, never to us. We receive
          and keep the Stripe customer and subscription IDs, the plan, its status and renewal date,
          the Discord account that paid and the server it’s for. The email and billing address you
          enter at checkout are held by Stripe, and by Link when checkout shows that the purchase is
          sold through Link.
        </p>

        <h3>Technical data</h3>
        <p>
          Our hosting provider, Cloudflare, processes IP addresses and request details to deliver
          pages and block attacks. We keep error logs to fix problems. We do not use advertising,
          analytics or tracking tools, and we don’t follow you across other sites.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <>
        <p>We use the data above only to:</p>
        <ul>
          <li>run the features a server’s admins turn on, and the dashboard that controls them;</li>
          <li>keep Garrison and the servers it protects safe, and stop spam, raids and abuse;</li>
          <li>take payments, apply plans, and handle refunds and disputes;</li>
          <li>answer support requests and fix bugs;</li>
          <li>measure how the Service is doing in totals that identify no one;</li>
          <li>meet legal obligations and enforce our Terms of Service.</li>
        </ul>
        <p>
          We do not sell your data. We do not use it for advertising. We do not use it to train AI
          models, and the AI providers listed below receive it under API terms that don’t allow them
          to train on it.
        </p>
      </>
    ),
  },
  {
    id: "bases",
    title: "Legal bases (EEA and UK)",
    body: (
      <>
        <p>If you’re in the European Economic Area or the United Kingdom, we rely on:</p>
        <ul>
          <li>
            <strong>Contract:</strong> to provide the dashboard, your linked accounts and any plan
            you buy.
          </li>
          <li>
            <strong>Legitimate interests:</strong> to run the moderation, community and security
            features a server chooses, to keep the Service secure, and to keep records we need.
            Those interests are running a safe community tool that servers ask for; we limit what we
            keep to what each feature needs.
          </li>
          <li>
            <strong>Consent:</strong> for game accounts you link. You can withdraw it by removing
            the link.
          </li>
          <li>
            <strong>Legal obligation:</strong> for billing and tax records.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "admins",
    title: "Server admins’ role",
    body: (
      <>
        <p>
          Each server’s admins choose which Garrison features run there, for example whether the
          event log keeps message text or whether AI moderation is on. Admins should let their
          members know how the server is moderated and logged.
        </p>
        <p>
          If you have a question about records a particular server keeps about you, such as a
          moderation case or a staff note, you can ask that server’s staff, or contact us and we’ll
          help.
        </p>
      </>
    ),
  },
  {
    id: "share",
    title: "Who we share it with",
    body: (
      <>
        <p>
          We share data only with the services that run Garrison for us, each only what it needs,
          and under their own data protection terms:
        </p>
        <div className="table-wrap">
          <table className="legal__table">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">What for</th>
                <th scope="col">What it gets</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Discord</td>
                <td>Garrison runs on Discord</td>
                <td>The messages, roles and actions Garrison sends there</td>
              </tr>
              <tr>
                <td>Cloudflare</td>
                <td>
                  Hosting the bot, dashboard and website; network security; the Turnstile check
                </td>
                <td>All traffic to the Service, including IP addresses</td>
              </tr>
              <tr>
                <td>Supabase</td>
                <td>Our database</td>
                <td>The stored data described in this policy</td>
              </tr>
              <tr>
                <td>Stripe, and Link where checkout says so</td>
                <td>Payments and billing</td>
                <td>Your payment details, email and billing address, and the plan bought</td>
              </tr>
              <tr>
                <td>Anthropic</td>
                <td>
                  The AI assistant, which plans channels and roles (only when someone uses it)
                </td>
                <td>
                  The request and the server’s layout: its channel, category and role names. Not
                  members’ messages.
                </td>
              </tr>
              <tr>
                <td>OpenAI</td>
                <td>AI moderation (Pro, only when a server turns it on)</td>
                <td>The text of messages in that server, to be checked for harmful content</td>
              </tr>
              <tr>
                <td>Blizzard (Battle.net)</td>
                <td>Linking a Battle.net account (only if you do)</td>
                <td>The sign-in you approve on Battle.net</td>
              </tr>
              <tr>
                <td>Jagex</td>
                <td>RuneScape stats (only for names you link)</td>
                <td>The RuneScape name being looked up</td>
              </tr>
              <tr>
                <td>YouTube and Twitch</td>
                <td>Stream and video alerts a server sets up</td>
                <td>The public channel being followed, no member data</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          We may also disclose data if the law requires it, to protect people from harm, or to
          protect the Service and its users, and only as much as needed. If Garrison is ever
          transferred to a new owner, this policy would continue to apply to the data transferred,
          and we’d say so on this page first.
        </p>
      </>
    ),
  },
  {
    id: "keep",
    title: "How long we keep it",
    body: (
      <>
        <div className="table-wrap">
          <table className="legal__table">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Kept for</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Dashboard sign-in</td>
                <td>7 days, or until you sign out</td>
              </tr>
              <tr>
                <td>Event log entries, including any kept message text</td>
                <td>The period the server chooses, from 7 to 365 days (30 by default)</td>
              </tr>
              <tr>
                <td>Each member’s daily message count, for insights</td>
                <td>35 days</td>
              </tr>
              <tr>
                <td>Other insight totals, and join and leave records</td>
                <td>400 days</td>
              </tr>
              <tr>
                <td>
                  Tickets, moderation cases, staff notes, suggestions, XP and other server records
                </td>
                <td>As long as the server keeps Garrison, or until deleted on request</td>
              </tr>
              <tr>
                <td>Linked game accounts</td>
                <td>Until you remove the link</td>
              </tr>
              <tr>
                <td>Billing records</td>
                <td>As long as tax and accounting law requires, usually up to 7 years</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          When Garrison is removed from a server, we keep that server’s data so its setup is still
          there if Garrison is added back. The server’s owner can ask us to delete all of it at any
          time. Deleted data leaves our database backups as they roll over, within weeks.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your choices and rights",
    body: (
      <>
        <p>Wherever you live, you can ask us to:</p>
        <ul>
          <li>tell you what data we hold about you, and give you a copy;</li>
          <li>correct data that’s wrong;</li>
          <li>delete your data;</li>
          <li>stop using your data for a particular purpose.</li>
        </ul>
        <p>
          You can remove linked game accounts and choose which servers see them yourself, on the{" "}
          <Link href="/account">Your accounts</Link> page. For anything else, email{" "}
          <Mail subject="Privacy request" /> with your Discord username and what you’d like. To
          protect your data, we’ll confirm the request comes from the Discord account it’s about
          before acting on it. We answer within 30 days.
        </p>
        <p>
          Some records belong to a server’s moderation history, such as a ban reason. If deleting
          one would let someone dodge a server’s safety measures, we may keep it, and we’ll tell you
          why.
        </p>
        <p>
          <strong>EEA and UK:</strong> you also have the right to data portability and to complain
          to your local data protection authority.
        </p>
        <p>
          <strong>California and other US states:</strong> we don’t sell or share personal
          information for advertising, and we don’t use it for profiling. You have the rights above,
          and we won’t treat you differently for using them.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <>
        <p>
          Data travels encrypted. Each part of Garrison (the bot, the dashboard, and payment
          updates) has its own database login that can reach only what that part needs, and the
          database checks every request against those limits. Sign-in tokens are stored hashed.
          Secrets are never kept in our code. No system is perfectly secure, but if a breach affects
          your data, we’ll tell you and the authorities as the law requires.
        </p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "International transfers",
    body: (
      <p>
        We’re in the United States and our providers process data in the United States and other
        countries. Where data from the EEA, UK or Switzerland is transferred, we rely on our
        providers’ standard contractual clauses or other approved safeguards.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        Garrison is not for children under 13, and you must also meet Discord’s minimum age where
        you live. We don’t knowingly collect data from children under 13. If you think a child under
        13 has given us data, email <Mail subject="Child data" /> and we’ll delete it.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        We use only the cookies the Service needs to work: one that keeps you signed in, one that
        remembers your light or dark theme, short-lived ones that secure each sign-in with Discord
        or Battle.net, and one that carries a single confirmation message between pages for a few
        seconds. None track you, so there’s no cookie banner. Stripe’s checkout and Cloudflare’s
        Turnstile check set their own cookies for fraud prevention when you use them.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        If we change this policy, we’ll update the date at the top. If a change matters, such as a
        new kind of data or a new provider, we’ll announce it in the dashboard before it takes
        effect.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Email <Mail subject="Privacy" /> for anything about your privacy. We read every message.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lead="What Garrison collects, why, who it shares it with, how long it keeps it, and how to get it changed or deleted."
      summary={[
        "We keep what each feature a server turns on needs, and nothing for advertising. We never sell data.",
        "Garrison reads messages to moderate and count activity, but only stores message text in tickets, modmail, suggestions, appeals, and the event log when a server chooses to keep edited and deleted messages.",
        "Payments go through Stripe; we never see your card.",
        "You can ask us for a copy of your data, or to delete it, by email.",
      ]}
      sections={sections}
    />
  );
}
