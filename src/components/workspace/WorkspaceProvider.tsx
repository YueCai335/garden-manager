"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useWorkspaceSync } from "@/hooks/useWorkspaceSync";
import { useCareNoteBatchSession } from "@/hooks/useCareNoteBatchSession";
import { sameAreaProperties, plantDraftIsDirty, type AreaPropertiesDraft, type PlantEditorDraft } from "@/lib/areaEditorDrafts";
import { batchRowsPresent, type CareDraftRow } from "@/lib/careNoteBatch";
import type { AiCareNoteDraft } from "@/lib/gardenWorkspaceApi";

type SingleNoteReceipt = { row: CareDraftRow; draft: AiCareNoteDraft; note: string; href: string; saved: boolean };

function useWorkspaceState() {
  const [message, setMessage] = useState("");
  const sync = useWorkspaceSync();
  const [areaDrafts, setAreaDrafts] = useState<Record<string, AreaPropertiesDraft>>({});
  const [plantDrafts, setPlantDrafts] = useState<Record<string, PlantEditorDraft>>({});
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [singleNoteReceipt, setSingleNoteReceipt] = useState<SingleNoteReceipt>();
  const requestRefs = useRef(new Map<string, { current: unknown }>());
  const setNoteText = useCallback((text: string) => setDrafts((current) => ({ ...current, "note:text": text })), []);
  const careNoteBatch = useCareNoteBatchSession(sync, (drafts["note:text"] as string | undefined) ?? "", setNoteText);
  const { workspace, isSynced } = sync;
  useEffect(() => {
    if (!singleNoteReceipt || singleNoteReceipt.saved || !workspace) return;
    if (!batchRowsPresent(workspace, [singleNoteReceipt.row])) {
      setDrafts((current) => ({ ...current,
        "note:draft": { ...singleNoteReceipt.draft }, "note:text": singleNoteReceipt.note,
        "note:saveError": "The record was removed when the workspace reloaded. Check the draft before saving again.",
      }));
      setSingleNoteReceipt(undefined);
    } else if (isSynced) {
      setSingleNoteReceipt({ ...singleNoteReceipt, saved: true });
    }
  }, [workspace, isSynced, singleNoteReceipt]);
  const setAreaDraft = (key: string, draft?: AreaPropertiesDraft) => setAreaDrafts((current) => {
    const next = { ...current };
    if (draft) next[key] = draft; else delete next[key];
    return next;
  });
  const discardDrafts = (key: string) => {
    setAreaDraft(key);
    setPlantDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
  };
  const hasUnsavedDrafts = careNoteBatch.hasDrafts || Object.values(areaDrafts).some((draft) => !sameAreaProperties(draft.values, draft.baseline)) || Object.values(plantDrafts).some(plantDraftIsDirty) || Object.values(dirty).some(Boolean) || Boolean(drafts["note:text"] || drafts["note:draft"]);
  const shouldWarnBeforeLeaving = hasUnsavedDrafts || sync.syncState === "local-error" || (Boolean(workspace) && sync.storageSource === "server" && !isSynced);
  useEffect(() => {
    if (!shouldWarnBeforeLeaving) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [shouldWarnBeforeLeaving]);
  return { ...sync, careNoteBatch, singleNoteReceipt, setSingleNoteReceipt, message, setMessage, areaDrafts, plantDrafts, setPlantDrafts, setAreaDraft, discardDrafts, drafts, setDrafts, setDirty, requestRefs };
}
const WorkspaceContext = createContext<ReturnType<typeof useWorkspaceState> | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const state = useWorkspaceState();
  return <WorkspaceContext.Provider value={state}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const state = useContext(WorkspaceContext);
  if (!state) throw new Error("WorkspaceProvider is required");
  return state;
}

/** In-memory fields owned by the shared layout; standalone component tests use local state. */
export function useWorkspaceDraft<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(WorkspaceContext);
  const [local, setLocal] = useState(initial);
  const initialValue = useRef(local);
  const setDrafts = context?.setDrafts;
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((update) => {
    if (!setDrafts) { setLocal(update); return; }
    setDrafts((current) => {
      const previous = Object.hasOwn(current, key) ? current[key] as T : initialValue.current;
      const value = typeof update === "function" ? (update as (old: T) => T)(previous) : update;
      if (Object.is(previous, value)) return current;
      // Returning a field to its initial value releases its session entry.
      const next = { ...current };
      if (Object.is(value, initialValue.current)) delete next[key]; else next[key] = value;
      return next;
    });
  }, [key, setDrafts]);
  return [context ? Object.hasOwn(context.drafts, key) ? context.drafts[key] as T : initialValue.current : local, setValue];
}
export function useWorkspaceRequestRef<T>(key: string, initial: T): { current: T } {
  const context = useContext(WorkspaceContext);
  const local = useRef(initial);
  if (!context) return local;
  const refs = context.requestRefs.current;
  if (!refs.has(key)) refs.set(key, local);
  return refs.get(key) as { current: T };
}
export function useUnsavedDraft(key: string, dirty: boolean) {
  const setDirty = useContext(WorkspaceContext)?.setDirty;
  useEffect(() => {
    setDirty?.((current) => {
      if (Boolean(current[key]) === dirty) return current;
      const next = { ...current };
      if (dirty) next[key] = true; else delete next[key];
      return next;
    });
  }, [dirty, key, setDirty]);
}
