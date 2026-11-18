"use client";
import { useEffect } from "react";
import { apiUrl } from "@/lib/gardenWorkspaceApi";

/**
 * Wakes the API while a visitor reads the landing page (ADR-0079). The free
 * Render service sleeps when idle and takes about a minute to start, so the
 * app is more likely to be ready by the time the visitor opens it. The page
 * never waits for this request and ignores its result.
 */
export function ApiPrewarm() {
  useEffect(() => {
    // "no-cors" skips the CORS check: the response is never read.
    fetch(apiUrl("/health"), { mode: "no-cors", cache: "no-store" }).catch(() => {});
  }, []);
  return null;
}
