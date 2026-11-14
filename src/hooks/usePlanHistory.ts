"use client";
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import type { Garden, GardenWorkspace } from "@/lib/gardenWorkspace";
import { emptyPlanHistory, recordPlanChange, redoPlanChange, undoPlanChange, type PlanHistory } from "@/lib/planHistory";

export const HISTORY_CLEARED_BY_CONFLICT = "Undo history was cleared because this workspace changed in another tab.";
export const HISTORY_CLEARED_BY_OUTSIDE_CHANGE = "Undo history was cleared because this garden changed outside the plan.";

type Sync = {
  setWorkspace: (update: SetStateAction<GardenWorkspace | undefined>) => void;
  getLatestWorkspace: () => GardenWorkspace | undefined;
  saveConflict: boolean;
};

const gardenIn = (workspace: GardenWorkspace | undefined, gardenId: string) => workspace?.gardens.find((garden) => garden.id === gardenId);
const replaceGarden = (gardenId: string, update: (garden: Garden) => Garden) => (workspace: GardenWorkspace | undefined) =>
  workspace ? { ...workspace, gardens: workspace.gardens.map((garden) => garden.id === gardenId ? update(garden) : garden) } : workspace;

/**
 * Undo and Redo for Garden Plan edits in the current tab (ADR-0072, phase G5).
 * Lives in the workspace provider so moving between pages keeps it; a reload,
 * another garden, a sync conflict, or a change made outside the plan clears it.
 */
export function usePlanHistory({ setWorkspace, getLatestWorkspace, saveConflict }: Sync) {
  const [history, setHistory] = useState<PlanHistory>(emptyPlanHistory);
  const historyRef = useRef(history);
  const [notice, setNotice] = useState("");
  // Updates made by one user action (in one task) undo as one step.
  const batchOpen = useRef(false);
  const store = useCallback((next: PlanHistory) => { historyRef.current = next; setHistory(next); }, []);

  const record = useCallback((gardenId: string, label: string, update: (garden: Garden) => Garden) => {
    const before = gardenIn(getLatestWorkspace(), gardenId);
    setWorkspace(replaceGarden(gardenId, update));
    const after = gardenIn(getLatestWorkspace(), gardenId);
    if (!before || !after) return;
    store(recordPlanChange(historyRef.current, gardenId, { label, before, after }, batchOpen.current));
    setNotice("");
    if (!batchOpen.current) {
      batchOpen.current = true;
      queueMicrotask(() => { batchOpen.current = false; });
    }
  }, [getLatestWorkspace, setWorkspace, store]);

  const step = useCallback((direction: "undo" | "redo", gardenId: string) => {
    const current = gardenIn(getLatestWorkspace(), gardenId);
    const result = (direction === "undo" ? undoPlanChange : redoPlanChange)(historyRef.current, gardenId, current);
    store(result.history);
    if (result.status === "stale") setNotice(HISTORY_CLEARED_BY_OUTSIDE_CHANGE);
    if (result.status === "applied") setWorkspace(replaceGarden(gardenId, () => result.garden));
    return result;
  }, [getLatestWorkspace, setWorkspace, store]);

  // A conflict means another tab wrote this workspace; local steps may no longer match it.
  useEffect(() => {
    if (!saveConflict || (!historyRef.current.undo.length && !historyRef.current.redo.length)) return;
    store(emptyPlanHistory());
    setNotice(HISTORY_CLEARED_BY_CONFLICT);
  }, [saveConflict, store]);

  const forGarden = (gardenId: string | undefined) => {
    const own = Boolean(gardenId) && history.gardenId === gardenId;
    return {
      canUndo: own && history.undo.length > 0,
      canRedo: own && history.redo.length > 0,
      undoLabel: own ? history.undo.at(-1)?.label : undefined,
      redoLabel: own ? history.redo.at(-1)?.label : undefined,
      notice,
    };
  };

  return { record, undo: (gardenId: string) => step("undo", gardenId), redo: (gardenId: string) => step("redo", gardenId), forGarden };
}
