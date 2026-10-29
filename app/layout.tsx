import type { Metadata } from "next";
import "@fontsource/young-serif/400.css";
import "@fontsource-variable/public-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sealed",
  description: "Your work stays sealed until you're paid. AI scoping and PayPal payments for freelancers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
