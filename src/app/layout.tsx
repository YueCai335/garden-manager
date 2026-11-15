import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

// The body font for the landing page and the app (ADR-0073). next/font downloads
// it at build time and serves it from this site, so no page requests Google Fonts.
const instrumentSans = Instrument_Sans({ subsets: ["latin"], display: "swap", variable: "--font-instrument-sans" });

export const metadata: Metadata = {
  title: "Garden Manager",
  description: "Record garden care, manage planting areas, and plan the next growing season."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={instrumentSans.variable}>
      <body>{children}</body>
    </html>
  );
}
