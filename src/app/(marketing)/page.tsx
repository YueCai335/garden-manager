import type { Metadata } from "next";
import Link from "next/link";
import { workspaceHomePath } from "@/lib/workspaceRoutes";
import styles from "@/components/marketing/Landing.module.css";

export const metadata: Metadata = {
  title: "Garden Manager · Plan beds, log care, plan the next season",
  description: "Draw your garden to scale, record care in plain words, and plan next season's planting.",
};

/** The two features the landing page presents first. Their showcases come in phase S6b (ADR-0073). */
const features = [
  {
    id: "plan",
    title: "Draw your garden to scale",
    text: "Place raised beds, in-ground beds, and containers on a metric plan, then fill each one with plants at their real spacing.",
    href: workspaceHomePath,
  },
  {
    id: "note",
    title: "Write one note, get reviewed records",
    text: "Describe what you did in the garden in your own words. The AI Note splits it into care records you review before saving.",
    href: "/notes",
  },
];

export default function LandingPage() {
  return <>
    <section className={styles.hero} aria-labelledby="landing-title">
      <h1 id="landing-title">Plan the garden. Keep the record. Plan the next season.</h1>
      <p>Garden Manager keeps your beds, what grows in them, and how you cared for them in one place.</p>
      <Link className={styles.primary} href={workspaceHomePath}>Open the app</Link>
    </section>
    <section className={styles.features} aria-label="Features">
      {features.map((feature) => <article key={feature.id} className={styles.feature} aria-labelledby={`feature-${feature.id}`}>
        <h2 id={`feature-${feature.id}`}>{feature.title}</h2>
        <p>{feature.text}</p>
        <Link className={styles.secondary} href={feature.href} aria-describedby={`feature-${feature.id}`}>Try it</Link>
      </article>)}
    </section>
  </>;
}
