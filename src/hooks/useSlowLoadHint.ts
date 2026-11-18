"use client";
import { useEffect, useState } from "react";

/** How long a load runs before the waking-server hint appears (ADR-0079). */
export const SLOW_LOAD_HINT_DELAY_MS = 5_000;

/** The sentence shown while a sleeping demo server starts (ADR-0079). */
export const SLOW_LOAD_HINT = "The garden server is starting up. The first visit can take up to a minute.";

/** True once a load has run longer than `delayMs`. */
export function useSlowLoadHint(delayMs = SLOW_LOAD_HINT_DELAY_MS) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return slow;
}
