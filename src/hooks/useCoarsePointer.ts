"use client";
import { useEffect, useState } from "react";

const QUERY = "(pointer: coarse)";

/**
 * Whether the primary pointer is coarse (a finger on a phone or tablet).
 * Garden Plan keeps an explicit Move mode there, so a swipe over the canvas
 * still scrolls the page; mouse and pen users drag areas directly
 * (ADR-0072, phase G4).
 */
export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(QUERY);
    const update = () => setCoarse(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return coarse;
}
