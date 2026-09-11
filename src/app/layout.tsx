import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Garden Manager",
  description: "Plan garden beds from sun exposure and yard shadows."
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
