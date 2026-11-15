import { FEATURES } from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection, Mail } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "When Garrison refunds a plan, when it doesn't, and how to ask.",
  robots: { index: true, follow: true },
};

const DAYS = LEGAL.refundDays;
/** AI assistant supplies a day on Free; past this, a server is using paid AI. */
const FREE_AI = FEATURES["qm.dailyCredits"].free;

const sections: LegalSection[] = [
  {
    id: "first",
    title: `Full refund in the first ${DAYS} days`,
    body: (
      <>
        <p>
          If you start a new Pro or Agency subscription and it isn’t right for you, ask within{" "}
          {DAYS} days of the first payment and we’ll refund that payment in full. This applies to
          monthly and yearly plans.
        </p>
        <p>
          One first-payment refund per person. If you’ve had one before, later subscriptions aren’t
          covered by this section.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "When AI has been used",
    body: (
      <>
        <p>
          Every AI assistant message and plan runs on AI we pay for as it’s used, and that cost
          can’t be taken back. So the first-payment refund doesn’t apply if, after the payment, the
          server used more AI assistant supplies in any single day than the Free plan allows
          (currently {FREE_AI} a day). For an Agency plan, this counts every server in its seats.
        </p>
        <p>
          The dashboard records every AI assistant message, every plan and the changes it makes, and
          that record is what we check. Using other Pro features, or AI moderation, doesn’t affect
          your refund.
        </p>
      </>
    ),
  },
  {
    id: "renewals",
    title: "Renewals",
    body: (
      <>
        <p>
          Renewal payments, monthly or yearly, aren’t refunded. To avoid the next charge, cancel
          before your renewal date from Manage billing on your server’s{" "}
          <Link href="/servers">Plan page</Link>. Your plan stays on until the end of the period
          you’ve paid for.
        </p>
        <p>
          If you switch between monthly and yearly, Stripe adjusts the charge for the time left on
          your current period and shows you the amount before you confirm.
        </p>
      </>
    ),
  },
  {
    id: "always",
    title: "Always refunded",
    body: (
      <>
        <p>Whatever the timing, we refund:</p>
        <ul>
          <li>charges made by mistake, including duplicate charges;</li>
          <li>
            the unused part of a paid period if we stop offering your plan, or end it for a reason
            other than a breach of our Terms;
          </li>
          <li>
            any amount the law in your country says we must refund, including where Garrison didn’t
            work as described.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "not",
    title: "Not refunded",
    body: (
      <ul>
        <li>Renewals, except as described above.</li>
        <li>
          Partly used periods after you cancel; your plan simply runs to the end of the period.
        </li>
        <li>Plans ended because the Terms of Service were broken.</li>
        <li>Requests made after the first {DAYS} days, except where the law requires otherwise.</li>
      </ul>
    ),
  },
  {
    id: "eu",
    title: "EU and UK customers",
    body: (
      <p>
        If you live in the European Union or the United Kingdom, you have a legal right to withdraw
        from a new subscription within 14 days of buying it. When you subscribe, you ask for your
        plan to start right away, so if you withdraw, we may keep an amount in proportion to the
        days you had the plan and the AI you used. This policy never reduces those rights.
      </p>
    ),
  },
  {
    id: "how",
    title: "How to ask for a refund",
    body: (
      <>
        <p>
          Email <Mail subject="Refund request" /> with:
        </p>
        <ul>
          <li>your Discord username;</li>
          <li>the server the plan is for, or say it’s an Agency plan;</li>
          <li>the date of the payment, or the receipt Stripe sent you.</li>
        </ul>
        <p>
          We reply within 3 business days. Approved refunds go back to the original payment method;
          banks usually show them within 5 to 10 business days. When we refund a subscription, we
          cancel it at the same time, and the server returns to Free. Nothing you set up is deleted.
        </p>
        <p>
          If checkout showed that your purchase was sold through Link, Link may process the refund,
          under the same rules.
        </p>
      </>
    ),
  },
  {
    id: "disputes",
    title: "Please ask before disputing a charge",
    body: (
      <p>
        If something looks wrong on your statement, email us first. A dispute or chargeback through
        your bank ends the plan straight away and takes weeks to settle; an email is usually
        resolved in a day or two.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        If we change this policy, we’ll update the date at the top. Changes apply to payments made
        after the change, never to one you’ve already made.
      </p>
    ),
  },
];

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund Policy"
      lead="When Garrison refunds a plan, when it doesn’t, and how to ask."
      summary={[
        `New Pro and Agency subscriptions: a full refund if you ask within ${DAYS} days of the first payment.`,
        `Unless the server used more AI assistant supplies in a day than Free allows (${FREE_AI} a day). That AI costs us as it’s used.`,
        "Renewals aren’t refunded, but you can cancel any time and keep your plan to the end of the period.",
        "Mistaken charges are always refunded, and your consumer rights where you live always apply.",
      ]}
      sections={sections}
    />
  );
}
