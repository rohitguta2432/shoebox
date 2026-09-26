import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed, Rozha_One } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
});

const plexCondensed = IBM_Plex_Sans_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-plex-cond",
});

const rozha = Rozha_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-rozha",
});

export const metadata: Metadata = {
  title: "Shoebox · bill photo to GST ledger",
  description: "Turn a photo of a GST bill into a checked ledger entry. Runs on your own laptop.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${plexSans.variable} ${plexMono.variable} ${plexCondensed.variable} ${rozha.variable}`}>
      <body>
        {/* Rough edges for rubber-stamp ink */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
          <filter id="ink-edge">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" />
          </filter>
        </svg>
        {children}
      </body>
    </html>
  );
}
