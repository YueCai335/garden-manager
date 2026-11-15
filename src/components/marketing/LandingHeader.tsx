import Link from "next/link";
import { workspaceHomePath } from "@/lib/workspaceRoutes";
import styles from "./Landing.module.css";

/** The leaf mark: a leaf outline with two lime vein nodes. */
function LeafMark() {
  return <svg viewBox="0 0 26 26" aria-hidden="true">
    <path d="M13 23C6 19 4 12 6 4c6 1 11 5 12 12 0 3-2 5-5 7Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 7c2 5 4 9 5 16M10.5 12.5l-3 .5M12.4 17l3.6-1.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="7.5" cy="13" r="1.4" fill="#D6FF5C" />
    <circle cx="16" cy="15.6" r="1.4" fill="#D6FF5C" />
  </svg>;
}

/** The landing header (ADR-0073). It sits on top of the hero band; the app has its own header. */
export function LandingHeader() {
  return <header className={styles.header}>
    <div className={`${styles.wrap} ${styles.headerInner}`}>
      <Link className={styles.brand} href="/"><LeafMark />Garden Manager</Link>
      <nav className={styles.siteNav} aria-label="Site">
        <a href="#garden-plan">Garden Plan</a>
        <a href="#ai-note">AI Note</a>
        <a href="#built">How it&apos;s built</a>
      </nav>
      <Link className={styles.ghost} href={workspaceHomePath}>Open app</Link>
    </div>
  </header>;
}
