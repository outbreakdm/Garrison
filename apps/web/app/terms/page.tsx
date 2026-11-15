import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection, Mail } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The agreement between you and Garrison for the bot, website and dashboard.",
  robots: { index: true, follow: true },
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "This agreement",
    body: (
      <>
        <p>
          These Terms of Service (“Terms”) are an agreement between you and the independent
          developer who runs Garrison, based in {LEGAL.state}, United States (“we”, “us”). They
          cover the Garrison Discord bot, the website at {LEGAL.site}, and the dashboard at{" "}
          {LEGAL.dashboard} (together, the “Service”).
        </p>
        <p>
          By adding Garrison to a server, signing in to the dashboard, or buying a plan, you agree
          to these Terms, our <Link href="/privacy">Privacy Policy</Link> and our{" "}
          <Link href="/refunds">Refund Policy</Link>. If you don’t agree, don’t use the Service. If
          you use it on behalf of a group or company, you confirm you can agree for them.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Who can use Garrison",
    body: (
      <p>
        You must be at least 13 years old, meet Discord’s minimum age where you live, and be allowed
        to use Discord. To buy a plan you must be an adult where you live, or have a parent or
        guardian’s permission. You must not use the Service if the law or a previous ban from us
        says you can’t.
      </p>
    ),
  },
  {
    id: "discord",
    title: "Garrison and Discord",
    body: (
      <p>
        Garrison works inside Discord, so you must also follow Discord’s Terms of Service and
        Community Guidelines. Garrison is not made, endorsed or supported by Discord. If Discord
        changes or limits what bots can do, some features may change or stop working, and that is
        outside our control.
      </p>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <p>
        You sign in with your Discord account. You’re responsible for what happens through it, so
        keep it secure. Tell us at <Mail subject="Account security" /> if you think someone else
        used it with Garrison. What you can manage in the dashboard follows your permissions in each
        Discord server; if those change, your access changes too.
      </p>
    ),
  },
  {
    id: "admins",
    title: "If you run a server",
    body: (
      <>
        <p>When you add Garrison to a server or change its settings, you confirm that:</p>
        <ul>
          <li>you have the right to add a bot to that server and set it up;</li>
          <li>
            you’ll set Garrison up lawfully, and tell your members how the server is moderated and
            logged, including when you keep the text of edited and deleted messages or turn on AI
            moderation;
          </li>
          <li>
            the actions you take with Garrison, such as bans, timeouts, role changes, deleting
            messages or restoring a backup, are your decisions and your responsibility.
          </li>
        </ul>
        <p>
          Garrison carries out what it’s configured or asked to do. Check settings and backups
          before you apply them; some actions in Discord can’t be undone.
        </p>
      </>
    ),
  },
  {
    id: "rules",
    title: "Rules for using Garrison",
    body: (
      <>
        <p>You must not use the Service to:</p>
        <ul>
          <li>break the law, or help anyone else break it;</li>
          <li>harass, threaten, dox or exploit anyone, or share content that sexualizes minors;</li>
          <li>send spam, mass direct messages, scams, phishing or malware;</li>
          <li>raid, nuke or take over servers, or dodge Discord’s enforcement;</li>
          <li>
            attack, overload, scrape, probe or reverse-engineer the Service, or get around its
            security;
          </li>
          <li>
            get around plan limits, for example by sharing paid features beyond the servers a plan
            covers, or by creating accounts or servers to collect more free AI use;
          </li>
          <li>
            use the AI features to create content that’s illegal, hateful or meant to deceive
            people;
          </li>
          <li>pretend to be Garrison, us, or Discord staff.</li>
        </ul>
      </>
    ),
  },
  {
    id: "content",
    title: "Your content",
    body: (
      <p>
        You keep ownership of what you and your server put into Garrison: settings, messages,
        tickets, suggestions, images and the rest. You give us permission to store, process, display
        and send that content only as needed to run the Service for you, including through the
        providers in our Privacy Policy. You’re responsible for having the right to use what you put
        in, including images you link for welcome or rank cards. We may remove content or turn off a
        feature on a server when it breaks these Terms.
      </p>
    ),
  },
  {
    id: "ai",
    title: "AI features",
    body: (
      <>
        <p>
          Some features use AI from other companies: Quartermaster, which plans server layouts, uses
          Anthropic; AI moderation uses OpenAI. AI can be wrong. Quartermaster shows its plan before
          anything changes, and you decide whether to apply it. AI moderation can miss harmful
          messages or flag fine ones, so it supports your moderators rather than replacing them.
        </p>
        <p>
          AI use is limited by daily credits on each plan, shown in the dashboard. Credits don’t
          roll over and have no cash value.
        </p>
      </>
    ),
  },
  {
    id: "plans",
    title: "Paid plans and billing",
    body: (
      <>
        <p>
          Garrison has a Free plan and paid plans: <strong>Pro</strong>, for one server, and{" "}
          <strong>Agency</strong>, which gives Pro to up to 5 servers you choose. Current prices and
          features are shown on our website and in the dashboard before you buy.
        </p>
        <ul>
          <li>
            <strong>Billing.</strong> Plans are paid in advance, monthly or yearly, through Stripe.
            Prices are in US dollars. Sales tax or VAT is added where it applies.
          </li>
          <li>
            <strong>Automatic renewal.</strong> Your plan renews at the end of each period, and your
            payment method is charged, until you cancel.
          </li>
          <li>
            <strong>Cancelling.</strong> Cancel any time from Manage billing on your server’s Plan
            page. Your plan stays on until the end of the period you’ve paid for, then the server
            returns to Free. Nothing you set up is deleted; features beyond Free stop working.
          </li>
          <li>
            <strong>Price changes.</strong> If a price changes, we’ll tell you before your next
            renewal. The new price applies from that renewal, and you can cancel before it does.
          </li>
          <li>
            <strong>Failed payments.</strong> If a renewal payment fails and isn’t fixed, the plan
            ends and the server returns to Free.
          </li>
          <li>
            <strong>Seller of record.</strong> When checkout shows that your purchase is sold
            through Link, Stripe’s reseller, Link sells you the plan and its buyer terms also apply
            to the payment.
          </li>
          <li>
            <strong>Disputes.</strong> Please contact us before disputing a charge with your bank;
            we can usually sort it out faster. Opening a dispute or a fraud claim ends the plan
            right away.
          </li>
        </ul>
        <p>
          We may change what’s in the Free plan, or add features to paid plans, at any time. We
          won’t remove a main feature of a paid plan during a period you’ve already paid for.
        </p>
      </>
    ),
  },
  {
    id: "refunds",
    title: "Refunds",
    body: (
      <p>
        Refunds follow our <Link href="/refunds">Refund Policy</Link>: in short, a full refund
        within {LEGAL.refundDays} days of your first payment, unless the server has already used
        more AI than the Free plan allows. Your rights under consumer law in your country are not
        affected.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability and changes",
    body: (
      <p>
        We work to keep Garrison running and show its health on the{" "}
        <Link href="/status">status page</Link>, but we don’t promise it will always be available or
        free of errors. We may change, add or remove features. If we stop offering a paid plan
        altogether, we’ll refund the unused part of any period you’ve paid for.
      </p>
    ),
  },
  {
    id: "ending",
    title: "Ending this agreement",
    body: (
      <>
        <p>
          You can stop using Garrison at any time by removing it from your servers and cancelling
          any plan. You can ask us to delete your data as described in our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          We may suspend or end your access, or Garrison’s use in a server, if you break these
          Terms, if the law requires it, or to protect people or the Service. Where reasonable, we
          tell you first and give you a chance to fix the problem. If we end a paid plan because you
          broke these Terms, we don’t owe a refund; if we end it for any other reason, we refund the
          unused part.
        </p>
        <p>
          Sections that by their nature should last, such as payment owed, disclaimers, limits on
          liability and disputes, continue after this agreement ends.
        </p>
      </>
    ),
  },
  {
    id: "others",
    title: "Other services",
    body: (
      <p>
        Garrison connects to services we don’t control, such as Discord, Stripe, Battle.net,
        RuneScape hiscores, YouTube and Twitch. Their own terms apply to your use of them, and we’re
        not responsible for them.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: (
      <p className="legal__caps">
        The Service is provided “as is” and “as available”. To the extent the law allows, we make no
        warranties, express or implied, including warranties of merchantability, fitness for a
        particular purpose, and non-infringement. We don’t promise that Garrison will catch every
        raid, scam or harmful message, or that backups will restore every detail of a server.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limits on liability",
    body: (
      <>
        <p className="legal__caps">
          To the extent the law allows, we are not liable for indirect, incidental, special,
          consequential or punitive damages, or for lost profits, data, goodwill or community
          members, arising from the Service. Our total liability for any claim about the Service is
          limited to the greater of the amount you paid us in the 12 months before the claim, or US
          $50.
        </p>
        <p>
          Some places don’t allow these limits. Where they don’t, they apply only as far as the law
          allows, and nothing in these Terms limits liability that can’t legally be limited.
        </p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Your responsibility for claims",
    body: (
      <p>
        If someone makes a claim against us because of how you used the Service, the content you put
        into it, or your breaking these Terms or the law, you agree to cover the reasonable costs of
        that claim, to the extent the law allows.
      </p>
    ),
  },
  {
    id: "disputes",
    title: "Disputes and governing law",
    body: (
      <>
        <p>
          If you have a problem, email <Mail subject="Dispute" /> first. Most things can be fixed
          that way, and we’ll try in good faith for 30 days before either of us goes further.
        </p>
        <p>
          These Terms are governed by the laws of the State of {LEGAL.state} and of the United
          States, without regard to conflict-of-law rules. Any court case about them will be in the
          state or federal courts located in {LEGAL.state}, and both of us agree to those courts. If
          you’re a consumer in a country whose laws give you the right to bring a case at home or to
          rely on its consumer protections, nothing here takes that away.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    body: (
      <p>
        We may update these Terms. We’ll change the date at the top, and for changes that matter
        we’ll announce them in the dashboard at least 14 days before they take effect. If you keep
        using the Service after that, the new Terms apply. If you don’t agree, stop using the
        Service and cancel any plan before they take effect.
      </p>
    ),
  },
  {
    id: "general",
    title: "General",
    body: (
      <p>
        These Terms, with the Privacy Policy and Refund Policy, are the whole agreement between us
        about the Service. If part of them can’t be enforced, the rest still applies. Not enforcing
        a part right away isn’t giving it up. You can’t transfer this agreement without our consent;
        we may transfer it to someone who takes over the Service, and they’ll be bound by it.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Email <Mail subject="Terms" /> with any question about these Terms. Legal notices to us go
        to the same address.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      lead="The agreement between you and Garrison for the bot, the website and the dashboard."
      summary={[
        "Use Garrison within the law and Discord’s rules. Server admins are responsible for how they set it up and the actions they take with it.",
        "Paid plans renew until you cancel. Cancelling keeps your plan until the end of the period you paid for.",
        `New subscriptions can be refunded within ${LEGAL.refundDays} days, unless the server has used more AI than Free allows.`,
        "Garrison is provided as is, and our liability is limited. Texas law applies, and your consumer rights where you live still stand.",
      ]}
      sections={sections}
    />
  );
}
