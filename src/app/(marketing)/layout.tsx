import type { ReactNode } from "react";
import { LandingFooter } from "@/components/marketing/LandingFooter";
import { LandingHeader } from "@/components/marketing/LandingHeader";
import styles from "@/components/marketing/Landing.module.css";
import { displayFont } from "@/styles/fonts";

/**
 * The landing frame (ADR-0073). It has its own header and footer and loads no
 * workspace state or API, so it renders without the backend.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className={`${styles.frame} ${displayFont.variable}`}>
    <a className={styles.skip} href="#landing-content">Skip to content</a>
    <LandingHeader />
    <main id="landing-content">{children}</main>
    <LandingFooter />
  </div>;
}
