import type { Garden } from "@/lib/gardenWorkspace";

/**
 * Tab-scoped undo and redo for Garden Plan edits (ADR-0072, phase G5).
 *
 * Each entry keeps the whole garden before and after one user action. Undo
 * and redo never rewind server revisions: the restored garden is written as a
 * new forward change through the normal revision-checked sync. A step only
 * applies when the garden still matches what that step left behind; any
 * other change to the garden makes the history stale, and it clears rather
 * than overwrite that change.
 */
export const PLAN_HISTORY_LIMIT = 100;

export type PlanHistoryEntry = { label: string; before: Garden; after: Garden };
export type PlanHistory = { gardenId?: string; undo: PlanHistoryEntry[]; redo: PlanHistoryEntry[] };

export const emptyPlanHistory = (): PlanHistory => ({ undo: [], redo: [] });

export function sameGarden(a: Garden | undefined, b: Garden | undefined) {
  return Boolean(a && b) && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Adds one change. `merge` folds it into the newest entry, so one user action
 * that updates the garden twice (a removed plant and its archived record)
 * undoes in one step. A change in another garden starts a new history.
 * A new change always drops the redo steps.
 */
export function recordPlanChange(history: PlanHistory, gardenId: string, entry: PlanHistoryEntry, merge = false): PlanHistory {
  if (sameGarden(entry.before, entry.after)) return history;
  const undo = history.gardenId === gardenId ? history.undo : [];
  const last = undo.at(-1);
  if (merge && last && sameGarden(last.after, entry.before)) {
    return { gardenId, undo: [...undo.slice(0, -1), { ...last, after: entry.after }], redo: [] };
  }
  return { gardenId, undo: [...undo, entry].slice(-PLAN_HISTORY_LIMIT), redo: [] };
}

export type PlanHistoryStep =
  | { status: "applied"; history: PlanHistory; garden: Garden; label: string }
  | { status: "stale"; history: PlanHistory }
  | { status: "empty"; history: PlanHistory };

/** The garden to write for Undo, or "stale" when the garden changed outside this history. */
export function undoPlanChange(history: PlanHistory, gardenId: string, current: Garden | undefined): PlanHistoryStep {
  const entry = history.gardenId === gardenId ? history.undo.at(-1) : undefined;
  if (!entry) return { status: "empty", history };
  if (!sameGarden(current, entry.after)) return { status: "stale", history: emptyPlanHistory() };
  return { status: "applied", garden: entry.before, label: entry.label, history: { gardenId, undo: history.undo.slice(0, -1), redo: [...history.redo, entry] } };
}

/** The garden to write for Redo, or "stale" when the garden changed outside this history. */
export function redoPlanChange(history: PlanHistory, gardenId: string, current: Garden | undefined): PlanHistoryStep {
  const entry = history.gardenId === gardenId ? history.redo.at(-1) : undefined;
  if (!entry) return { status: "empty", history };
  if (!sameGarden(current, entry.before)) return { status: "stale", history: emptyPlanHistory() };
  return { status: "applied", garden: entry.after, label: entry.label, history: { gardenId, undo: [...history.undo, entry], redo: history.redo.slice(0, -1) } };
}
