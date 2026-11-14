"use client";
import { useEffect } from "react";
import { useWorkspaceDraft } from "@/components/workspace/WorkspaceProvider";
import { GUIDED_SETUP_STORAGE_KEY, parseGuidedSetup, type GuidedSetup } from "@/lib/guidedSetup";

function readStoredSetup() {
  try {
    return typeof window === "undefined" ? undefined : parseGuidedSetup(window.sessionStorage.getItem(GUIDED_SETUP_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

/**
 * The guided setup in progress (ADR-0072, phase G6). It is the session-level
 * `setup:garden` draft, mirrored to this tab's session storage so a refresh
 * returns to the same step. Closing the tab ends it; nothing reaches the
 * workspace, the API, or the database.
 */
export function useGuidedSetup() {
  const [setup, setSetup] = useWorkspaceDraft<GuidedSetup | undefined>("setup:garden", readStoredSetup);
  useEffect(() => {
    try {
      if (setup) window.sessionStorage.setItem(GUIDED_SETUP_STORAGE_KEY, JSON.stringify(setup));
      else window.sessionStorage.removeItem(GUIDED_SETUP_STORAGE_KEY);
    } catch {
      // Without session storage the guide still works until the page reloads.
    }
  }, [setup]);
  return [setup, setSetup] as const;
}
