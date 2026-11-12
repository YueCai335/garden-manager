import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
