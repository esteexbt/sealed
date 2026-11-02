import type { Metadata } from "next";
import "@fontsource/young-serif/400.css";
import "@fontsource-variable/public-sans";
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";

const url = process.env.APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: "Sealed",
  description: "Your work stays sealed until you're paid. Payments held by PayPal, deliveries checked with AI, released on approval.",
  applicationName: "Sealed",
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Sealed",
    description: "Your work stays sealed until you're paid.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Sealed: your work stays sealed until you're paid." }],
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Sealed", description: "Your work stays sealed until you're paid.", images: ["/og-image.png"] },
};

export const viewport = { themeColor: "#12172e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
