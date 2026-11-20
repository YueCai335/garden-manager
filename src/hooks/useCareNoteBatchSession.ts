import { useCallback, useEffect, useRef, useState } from "react";
import type { useWorkspaceSync } from "./useWorkspaceSync";
import { todayDate } from "@/lib/gardenWorkspace";
import { AI_CARE_NOTE_MAX_LENGTH, CARE_NOTE_BATCH_LIMIT, createAiCareNoteBatch, featureErrorMessage, type CareNoteBatchDraftResponse } from "@/lib/gardenWorkspaceApi";
import { applyCareDraftBatch, batchRowsPresent, newCareDraft, type CareDraftRow } from "@/lib/careNoteBatch";

type Receipt = { status: "applied" | "saved" | "discarded"; rows: CareDraftRow[]; note: string; sourceNote: string };
type BatchState = {
  rows: CareDraftRow[]; notices: CareNoteBatchDraftResponse["notices"]; sourceNote: string;
  loading: boolean; error: string; errors: Record<string, string>; receipt?: Receipt;
};
const empty = (): BatchState => ({ rows: [], notices: [], sourceNote: "", loading: false, error: "", errors: {} });

/** Owned by the workspace provider; navigation never resets a batch or its request guard. */
export function useCareNoteBatchSession(sync: ReturnType<typeof useWorkspaceSync>, note: string, setNote: (text: string) => void) {
  const [state, setState] = useState<BatchState>(empty);
  const current = useRef(state);
  const latestNote = useRef(note);
  latestNote.current = note;
  const sequence = useRef(0);
  const requesting = useRef(false);
  const update = useCallback((change: (old: BatchState) => BatchState) => {
    current.current = change(current.current);
    setState(current.current);
  }, []);
  useEffect(() => () => { sequence.current += 1; }, []);

  useEffect(() => {
    const receipt = current.current.receipt;
    const workspace = sync.getLatestWorkspace();
    if (receipt?.status !== "applied" || !workspace) return;
    if (!batchRowsPresent(workspace, receipt.rows)) {
      update((old) => ({ ...old, receipt: { ...receipt, status: "discarded" }, error: "These records are no longer in the current workspace. Review the retained drafts before adding them again." }));
    } else if (sync.isSynced) {
      const ids = new Set(receipt.rows.map((row) => row.draftId));
      update((old) => ({ ...old, rows: old.rows.filter((row) => !ids.has(row.draftId)), receipt: { ...receipt, status: "saved" } }));
      if (note === receipt.note) setNote("");
    }
  }, [sync, note, setNote, update]);

  const setText = (value: string) => {
    if (current.current.receipt?.status === "applied") return;
    sequence.current += 1;
    setNote(value);
  };
  const generate = async (available: boolean) => {
    if (!available || !sync.workspace || !sync.serverWorkspaceId || !sync.isSynced || !note.trim() || Array.from(note.trim()).length > AI_CARE_NOTE_MAX_LENGTH || requesting.current || current.current.receipt?.status === "applied") return;
    requesting.current = true;
    const request = ++sequence.current;
    const sourceNote = note;
    update((old) => ({ ...old, loading: true, error: "", errors: {} }));
    try {
      const result = await createAiCareNoteBatch(sync.serverWorkspaceId, note.trim(), todayDate());
      if (request !== sequence.current || sourceNote !== latestNote.current) return;
      if (result.drafts.length > CARE_NOTE_BATCH_LIMIT) throw new Error("Oversized batch");
      const rows = result.drafts.map(newCareDraft);
      update((old) => ({ ...old, rows, notices: result.notices, sourceNote, receipt: undefined }));
    } catch (error) {
      if (request === sequence.current && sourceNote === latestNote.current) update((old) => ({ ...old, error: featureErrorMessage(error, "The note could not be drafted. Your input is kept. Check your connection and try again, or add records manually.") }));
    } finally {
      requesting.current = false;
      update((old) => ({ ...old, loading: false }));
    }
  };
  const patchRow = (draftId: string, patch: Partial<CareDraftRow>) => {
    if (current.current.receipt?.status === "applied") return;
    sequence.current += 1;
    update((old) => ({ ...old, errors: {}, rows: old.rows.map((row) => row.draftId === draftId ? { ...row, ...patch, draftId: row.draftId, eventId: row.eventId } : row) }));
  };
  const addRow = () => {
    if (current.current.rows.length >= CARE_NOTE_BATCH_LIMIT || current.current.receipt?.status === "applied") return;
    const row = newCareDraft();
    sequence.current += 1;
    update((old) => ({ ...old, rows: [...old.rows, row], sourceNote: old.rows.length ? old.sourceNote : note, receipt: undefined, errors: {} }));
  };
  const removeRow = (id: string) => {
    if (current.current.receipt?.status === "applied") return;
    sequence.current += 1;
    update((old) => ({ ...old, rows: old.rows.filter((row) => row.draftId !== id), errors: {} }));
  };
  const apply = () => {
    if (current.current.loading) return;
    if (["applied", "saved"].includes(current.current.receipt?.status ?? "")) return;
    const workspace = sync.getLatestWorkspace();
    if (!workspace) return;
    const result = applyCareDraftBatch(workspace, current.current.rows);
    if (Object.keys(result.errors).length) {
      update((old) => ({ ...old, errors: result.errors, error: "No records were added. Check the highlighted fields." }));
      document.getElementById(Object.keys(result.errors)[0])?.focus();
      return;
    }
    sequence.current += 1;
    update((old) => ({ ...old, error: "", errors: {}, receipt: { status: "applied", rows: old.rows.filter((row) => row.included), note, sourceNote: old.sourceNote } }));
    sync.setWorkspace(result.workspace);
  };
  const recordMore = (keepRemaining = false) => {
    if (current.current.receipt?.status === "applied") return;
    sequence.current += 1;
    setNote(keepRemaining ? current.current.sourceNote : "");
    update((old) => keepRemaining ? { ...old, receipt: undefined, error: "", errors: {} } : empty());
  };
  return { ...state, note, setText, generate, patchRow, addRow, removeRow, apply, recordMore,
    stale: Boolean(state.rows.length && state.sourceNote !== note),
    hasDrafts: Boolean(state.rows.length && state.receipt?.status !== "applied"),
  };
}
