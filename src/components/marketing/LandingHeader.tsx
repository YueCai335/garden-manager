"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { workspaceHomePath } from "@/lib/workspaceRoutes";
import { landingFeatures, repositoryUrl } from "./landingFeatures";
import { heroPreset } from "./landingShader";
import { ShaderBackdrop } from "./ShaderBackdrop";
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

function GitHubMark() {
  return <svg viewBox="0 0 16 16" aria-hidden="true">
    <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>;
}

/**
 * The landing header (ADR-0073). It stays at the top of the window: clear over the hero,
 * then, once the page scrolls, a bar graded by the hero's own shader and photo, so it keeps
 * the hero's color and texture. Its links follow the feature sections, and the section in
 * view is marked. The app has its own header.
 */
export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [current, setCurrent] = useState<string>();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const sections = landingFeatures.map((feature) => document.getElementById(feature.id)).filter((section) => section !== null);
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    // A section counts as current while it crosses a line a third of the way down the window.
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id); else visible.delete(entry.target.id);
      }
      setCurrent(landingFeatures.find((feature) => visible.has(feature.id))?.id);
    }, { rootMargin: "-33% 0px -66% 0px" });
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);
  return <header className={`${styles.header} ${scrolled ? styles.scrolled : ""}`}>
    {/* Mounted only while scrolled: at the top the hero shows through, and the bar starts no second shader. */}
    {scrolled && <ShaderBackdrop preset={heroPreset} texture="/landing/hero-ridges.webp" still="/landing/hero-still.webp" />}
    <div className={`${styles.wrap} ${styles.headerInner}`}>
      <Link className={styles.brand} href="/"><LeafMark />Garden Manager</Link>
      <nav className={styles.siteNav} aria-label="Site">
        {landingFeatures.map((feature) => <a key={feature.id} href={`#${feature.id}`} aria-current={current === feature.id ? "location" : undefined}>{feature.label}</a>)}
      </nav>
      <a className={styles.github} href={repositoryUrl} aria-label="GitHub" title="Source code on GitHub"><GitHubMark /></a>
      <Link className={styles.ghost} href={workspaceHomePath}>Open app</Link>
    </div>
  </header>;
}
