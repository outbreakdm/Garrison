import "@garrison/brand/css/tokens.css";
import "@garrison/brand/css/components.css";
import "./app.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Saira_Semi_Condensed } from "next/font/google";
import type { ReactNode } from "react";

// Self-hosted at build time, so the CSP can stay at font-src 'self'.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
});
const saira = Saira_Semi_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-saira",
});

export const metadata: Metadata = {
  title: { default: "Garrison", template: "%s · Garrison" },
  description: "Guard the gate. Rally the squad.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${mono.variable} ${saira.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
