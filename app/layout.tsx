import type { Metadata } from "next";
import { Goudy_Bookletter_1911, Instrument_Sans } from "next/font/google";
import "./globals.css";

const serif = Goudy_Bookletter_1911({ weight: "400", subsets: ["latin"], variable: "--font-serif" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Good Company",
  description: "Your agent finds the right people. Their agents agree on a plan. No group chat.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
