import type { Metadata } from "next";
import { Anton, Caveat, Inter, Oswald, Playfair_Display } from "next/font/google";
import "./globals.css";

// The five faces Claude may choose between, self-hosted by Next at build time
// so the canvas renders identically on every machine.
const impact = Anton({ weight: "400", subsets: ["latin"], variable: "--font-impact", display: "swap" });
const condensed = Oswald({ subsets: ["latin"], variable: "--font-condensed", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Playfair_Display({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const hand = Caveat({ subsets: ["latin"], variable: "--font-hand", display: "swap" });

export const metadata: Metadata = {
  title: "Golf Meme Digest",
  description: "Turn a photo into memes in the @golfmemedigest voice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${impact.variable} ${condensed.variable} ${sans.variable} ${serif.variable} ${hand.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
