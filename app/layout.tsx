import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";

// Self-hosted by Next at build time, so the canvas renders the same fonts on
// every machine and there is no third-party request at page load.
const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "@golfmemedigest meme generator",
  description: "Turn a photo into @golfmemedigest-voiced meme variants.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${anton.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
