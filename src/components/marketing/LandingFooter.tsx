import Link from "next/link";
import { workspaceHomePath } from "@/lib/workspaceRoutes";
import { ShaderBackdrop } from "./ShaderBackdrop";
import { footerPreset } from "./landingShader";
import { repositoryUrl as repository } from "./landingFeatures";
import styles from "./Landing.module.css";

/** The landing footer: a dense leaf-vein photo whose veins light up lime near the cursor (ADR-0073). */
export function LandingFooter() {
  return <footer id="built" className={`${styles.band} ${styles.footer}`}>
    <ShaderBackdrop preset={footerPreset} texture="/landing/footer-veins.webp" still="/landing/footer-still.webp" veinNodes lazy />
    <div className={`${styles.wrap} ${styles.footerGrid}`}>
      <div>
        <h2>Plan the season. Remember every watering.</h2>
        <p>A portfolio project built with Next.js, FastAPI, and PostgreSQL with pgvector.</p>
      </div>
      <nav aria-labelledby="footer-product">
        <p id="footer-product" className={styles.footerHeading}>Product</p>
        <ul>
          <li><Link href={workspaceHomePath}>Garden Plan</Link></li>
          <li><Link href="/notes">AI Note</Link></li>
          <li><Link href="/care">Care</Link></li>
          <li><Link href="/season">Next Season</Link></li>
        </ul>
      </nav>
      <nav aria-labelledby="footer-project">
        <p id="footer-project" className={styles.footerHeading}>Project</p>
        <ul>
          <li><a href={repository}>GitHub</a></li>
          <li><a href={`${repository}#readme`}>Architecture</a></li>
          <li><a href={`${repository}/tree/main/docs/decisions`}>Decision records</a></li>
        </ul>
      </nav>
      <div className={styles.footerBase}>
        <span>Garden Manager</span>
        <span>Photos by <a href="https://www.pexels.com/photo/12321610/">Victoria Knyshova</a> and <a href="https://www.pexels.com/photo/35451631/">Amel Uzunovic</a> on Pexels</span>
      </div>
    </div>
  </footer>;
}
