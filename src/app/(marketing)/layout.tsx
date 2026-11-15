import type { ReactNode } from "react";
import { LandingHeader } from "@/components/marketing/LandingHeader";
import styles from "@/components/marketing/Landing.module.css";

/**
 * The landing frame (ADR-0073). It has its own header and loads no workspace
 * state or API, so it renders without the backend.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className={styles.frame}>
    <a className={styles.skip} href="#landing-content">Skip to content</a>
    <LandingHeader />
    <main id="landing-content">{children}</main>
  </div>;
}
