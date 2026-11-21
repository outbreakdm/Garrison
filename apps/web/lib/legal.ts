/**
 * Facts the legal pages share. Change a date here only with a real change to the
 * policy text, and say what changed in that page's "Changes" section.
 */
export const LEGAL = {
  contact: "support@garrisonbot.com",
  site: "garrisonbot.com",
  dashboard: "dash.garrisonbot.com",
  state: "Texas",
  updated: "November 20, 2026",
  /** Days after a first payment in which a refund can be asked for. */
  refundDays: 7,
} as const;

export const LEGAL_PAGES = [
  { href: "/terms", name: "Terms of Service" },
  { href: "/privacy", name: "Privacy Policy" },
  { href: "/refunds", name: "Refund Policy" },
] as const;
