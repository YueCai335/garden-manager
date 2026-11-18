import { repositoryUrl as repository } from "@/components/marketing/landingFeatures";
import styles from "./AppFooter.module.css";

/**
 * The app pages' footer (ADR-0083): a full-width bar on the landing footer's
 * leaf-vein photo, as a still image, mirroring the app bar at the top. The
 * modules stay in the header, so it carries only the project links and the
 * photo credit.
 */
export function AppFooter() {
  return <footer className={styles.footer}>
    <div className={styles.inner}>
      <p className={styles.brand}><strong>Garden Manager</strong> <span>· A portfolio project</span></p>
      <nav aria-label="Project">
        <ul className={styles.links}>
          <li><a href={repository}>GitHub</a></li>
          <li><a href={`${repository}#readme`}>Architecture</a></li>
          <li><a href={`${repository}/tree/main/docs/decisions`}>Decision records</a></li>
        </ul>
      </nav>
      <p className={styles.credit}>Photos by <a href="https://www.pexels.com/photo/12321610/">Victoria Knyshova</a> and <a href="https://www.pexels.com/photo/35451631/">Amel Uzunovic</a> on Pexels</p>
    </div>
  </footer>;
}
