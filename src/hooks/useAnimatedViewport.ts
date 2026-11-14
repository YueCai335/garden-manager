"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { interpolateViewport } from "@/lib/canvasViewport";
import type { GardenPlanViewport } from "@/lib/gardenWorkspace";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Returns the viewport to draw. When `key` changes (entering or leaving an
 * area), the viewport animates from what is on screen to the new target.
 * Other target changes, such as a moved area, apply immediately. Reduced
 * motion skips the animation.
 */
export function useAnimatedViewport(target: GardenPlanViewport, key: string, durationMs = 400) {
  const [animation, setAnimation] = useState<{ from: GardenPlanViewport; progress: number }>();
  const viewport = animation ? interpolateViewport(animation.from, target, animation.progress) : target;
  const shown = useRef(viewport);
  const lastKey = useRef(key);
  // Layout effects run before paint, so the first animated frame replaces the
  // target frame without a visible jump.
  useLayoutEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    if (prefersReducedMotion()) { setAnimation(undefined); return; }
    const from = shown.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = (now - start) / durationMs;
      if (progress >= 1) { setAnimation(undefined); return; }
      setAnimation({ from, progress });
      frame = requestAnimationFrame(step);
    };
    setAnimation({ from, progress: 0 });
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key, durationMs]);
  useLayoutEffect(() => { shown.current = viewport; });
  return { viewport, animating: Boolean(animation) };
}
