"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useCanvasSize } from "@/hooks/useCanvasSize";
import styles from "./Editor.module.css";

export type EditorMode = "wide" | "overlay" | "mobile";
export function editorMode(containerWidth: number, mobileViewport: boolean): EditorMode {
  return mobileViewport ? "mobile" : containerWidth >= 1080 ? "wide" : "overlay";
}
/** `single` drops the side column when nothing sits beside the plan (the guided setup's viewing steps). */
export function EditorWorkbench({ children, single = false }: { children: (mode: EditorMode) => ReactNode; single?: boolean }) {
  const { ref, width } = useCanvasSize();
  const [mobileViewport, setMobileViewport] = useState(false);
  useEffect(() => {
    // Match the CSS breakpoint even when overflow expands innerWidth on touch browsers.
    const viewport = window.matchMedia("(width < 768px)");
    const update = () => setMobileViewport(viewport.matches);
    update();
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);
  const mode = editorMode(width, mobileViewport);
  return <div ref={ref} className={styles.workbench} data-mode={mode} data-single={single || undefined}>{children(mode)}</div>;
}
