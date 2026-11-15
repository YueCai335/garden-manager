import type { Metadata } from "next";
import Link from "next/link";
import { ShaderBackdrop } from "@/components/marketing/ShaderBackdrop";
import { heroPreset } from "@/components/marketing/landingShader";
import { workspaceHomePath } from "@/lib/workspaceRoutes";
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

/** The two features the landing page presents. Their showcases come in phase S6b (ADR-0073). */
const features = [
  {
    id: "garden-plan",
    kicker: "Garden Plan",
    title: "Draw your garden to scale",
    text: "Place raised beds, in-ground beds, and containers on a metric plan, then fill each one with plants at their real spacing.",
    href: workspaceHomePath,
  },
  {
    id: "ai-note",
    kicker: "AI Note",
    title: "Write one note, get reviewed records",
    text: "Describe what you did in the garden in your own words. The AI Note splits it into care records you review before saving.",
    href: "/notes",
  },
];

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
    <section id="features" className={`${styles.wrap} ${styles.features}`} aria-label="Features">
      {features.map((feature) => <article key={feature.id} id={feature.id} className={styles.feature} aria-labelledby={`feature-${feature.id}`}>
        <p className={styles.kicker}>{feature.kicker}</p>
        <h2 id={`feature-${feature.id}`}>{feature.title}</h2>
        <p>{feature.text}</p>
        <Link className={styles.secondary} href={feature.href} aria-describedby={`feature-${feature.id}`}>Try it</Link>
      </article>)}
    </section>
  </>;
}
