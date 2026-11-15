import Link from "next/link";
import { workspaceHomePath } from "@/lib/workspaceRoutes";
import styles from "./Landing.module.css";

export function LandingHeader() {
  return <header className={styles.header}>
    <Link className={styles.brand} href="/">Garden Manager</Link>
    <Link className={styles.primary} href={workspaceHomePath}>Open app</Link>
  </header>;
}
