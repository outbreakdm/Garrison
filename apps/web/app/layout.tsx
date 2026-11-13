import "@garrison/brand/css/tokens.css";
import "@garrison/brand/css/components.css";
import "./app.css";
import "./cards.css";
import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { type ReactNode, Suspense } from "react";
import { artSrc } from "@/components/Art";
import { PendingForms } from "@/components/PendingForms";
import { siteUrl } from "@/lib/hosts";
import { currentTheme } from "@/lib/theme";

// Self-hosted at build time, so the CSP can stay at font-src 'self'. One grotesque
// carries display, UI and numbers; the width axis gives headings their set.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: { default: "Garrison", template: "%s · Garrison" },
  description: "Guard the gate. Rally the squad.",
  robots: { index: false, follow: false },
  // The link-preview picture, once apps/web/public/art has one. Absolute, as previews require.
  ...(artSrc("og") && process.env.APP_URL
    ? {
        metadataBase: new URL(siteUrl(process.env.APP_URL) || process.env.APP_URL),
        openGraph: { images: [artSrc("og") as string] },
        twitter: { card: "summary_large_image" as const, images: [artSrc("og") as string] },
      }
    : {}),
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await currentTheme();
  return (
    <html lang="en" data-theme={theme} className={archivo.variable}>
      <body>
        {children}
        <Suspense fallback={null}>
          <PendingForms />
        </Suspense>
      </body>
    </html>
  );
}
