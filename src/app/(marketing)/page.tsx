import type { Metadata } from "next";
import Link from "next/link";
import { ShaderBackdrop } from "@/components/marketing/ShaderBackdrop";
import { heroPreset } from "@/components/marketing/landingShader";
import { workspaceHomePath } from "@/lib/workspaceRoutes";
import { landingFeatures } from "@/components/marketing/landingFeatures";
import { GardenPlanShowcase } from "@/components/marketing/GardenPlanShowcase";
import styles from "@/components/marketing/Landing.module.css";

const title = "Garden Manager · Draw your garden, log it in one sentence";
const description = "Lay out beds to scale, place every plant, and turn a quick note into care records you can review.";

export const metadata: Metadata = {
  // Absolute social-preview URLs point at the public demo (ADR-0040) unless a deployment sets its own address.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://garden-manager-demo.vercel.app"),
  title,
  description,
  openGraph: { title, description, type: "website", images: [{ url: "/landing/og.jpg", width: 1200, height: 630, alt: "Garden Manager: Draw your garden. Log it in one sentence." }] },
  twitter: { card: "summary_large_image", title, description, images: ["/landing/og.jpg"] },
};

export default function LandingPage() {
  return <>
    <section className={`${styles.band} ${styles.hero}`} aria-labelledby="landing-title">
      <ShaderBackdrop preset={heroPreset} texture="/landing/hero-ridges.webp" still="/landing/hero-still.webp" />
      <div className={`${styles.wrap} ${styles.heroGrid}`}>
        <div>
          <h1 id="landing-title">Draw your garden. Log it in one sentence.</h1>
          <p className={styles.lede}>Lay out beds to scale, place every plant, and turn a quick note like &ldquo;watered the tomatoes&rdquo; into care records you can review.</p>
          <div className={styles.ctas}>
            <Link className={styles.primary} href={workspaceHomePath}>Open the app</Link>
            <a className={styles.ghost} href="#features">See the features</a>
          </div>
        </div>
        <figure className={styles.glass} aria-label="AI Note example">
          <p className={styles.glassLabel}>AI Note</p>
          <blockquote className={styles.note}>Watered the tomatoes and fed the raised bed with fish emulsion.</blockquote>
          <svg className={styles.split} viewBox="0 0 300 58" preserveAspectRatio="none" aria-hidden="true">
            <path d="M150 0 C150 22 80 22 72 50" />
            <path d="M150 0 C150 22 220 22 228 50" />
            <circle cx="72" cy="52" r="3.2" />
            <circle cx="228" cy="52" r="3.2" />
            <circle cx="150" cy="3" r="2.4" />
          </svg>
          <ul className={styles.records} aria-label="Care records from the note">
            <li><b>Watering</b><span>Tomato · Raised bed A</span></li>
            <li><b>Fertilizing</b><span>Fish emulsion · Raised bed A</span></li>
          </ul>
        </figure>
      </div>
    </section>
    {/* One full-width section per feature, in the header's order. A feature with steps plays its showcase (S6b, ADR-0084). */}
    <section id="features" className={`${styles.wrap} ${styles.features}`} aria-label="Features">
      {landingFeatures.map((feature, index) => "steps" in feature ? <GardenPlanShowcase key={feature.id} feature={feature} index={index} className={styles.showcase} /> : <article key={feature.id} id={feature.id} className={styles.feature} aria-labelledby={`feature-${feature.id}`}>
        <div>
          <p className={styles.kicker}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{feature.label}</p>
          <h2 id={`feature-${feature.id}`}>{feature.title}</h2>
        </div>
        <div>
          <p className={styles.featureText}>{feature.text}</p>
          <ul className={styles.points}>{feature.points.map((point) => <li key={point}>{point}</li>)}</ul>
          <div className={styles.featureLinks}>
            {feature.links.map((link) => <Link key={link.href} className={styles.secondary} href={link.href} aria-describedby={`feature-${feature.id}`}>{link.label}</Link>)}
          </div>
        </div>
      </article>)}
    </section>
  </>;
}
