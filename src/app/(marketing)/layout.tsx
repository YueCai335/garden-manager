import type { ReactNode } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import { LandingFooter } from "@/components/marketing/LandingFooter";
import { LandingHeader } from "@/components/marketing/LandingHeader";
import styles from "@/components/marketing/Landing.module.css";

// The display font for large landing headings only (ADR-0073). next/font serves it from this site.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", variable: "--font-bricolage" });

/**
 * The landing frame (ADR-0073). It has its own header and footer and loads no
 * workspace state or API, so it renders without the backend.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className={`${styles.frame} ${bricolage.variable}`}>
    <a className={styles.skip} href="#landing-content">Skip to content</a>
    <LandingHeader />
    <main id="landing-content">{children}</main>
    <LandingFooter />
  </div>;
}
