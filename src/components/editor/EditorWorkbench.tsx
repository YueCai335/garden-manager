"use client";
import { useEffect, useState, type ReactNode } from "react";
import styles from "./Editor.module.css";

export type EditorMode = "wide" | "overlay" | "mobile";
/**
 * Below 768 px the editor stacks (mobile); from 900 px the canvas runs full width
 * with the toolbar, zoom, legend, and area panel floating over it (ADR-0073 S4);
 * in between, the area panel sits below the canvas and properties open as an overlay.
 */
export const WIDE_EDITOR_QUERY = "(min-width: 900px)";
export const MOBILE_EDITOR_QUERY = "(width < 768px)";
export function editorMode(mobileViewport: boolean, wideViewport: boolean): EditorMode {
  return mobileViewport ? "mobile" : wideViewport ? "wide" : "overlay";
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    // Media queries match the CSS breakpoints even when overflow expands innerWidth on touch browsers.
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** `single` marks the guided setup's viewing steps, where nothing sits beside the plan. */
export function EditorWorkbench({ children, single = false }: { children: (mode: EditorMode) => ReactNode; single?: boolean }) {
  const mode = editorMode(useMediaQuery(MOBILE_EDITOR_QUERY), useMediaQuery(WIDE_EDITOR_QUERY));
  return <div className={styles.workbench} data-mode={mode} data-single={single || undefined}>{children(mode)}</div>;
}
