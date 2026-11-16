import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";

import { createId, GARDEN_WORKSPACE_STORAGE_KEY, readGardenWorkspace, replaceLegacyDemoGarden, type GardenWorkspace } from "@/lib/gardenWorkspace";
import { importServerWorkspace, loadServerWorkspace, saveServerWorkspace, ServerWorkspaceError, type ServerWorkspace } from "@/lib/gardenWorkspaceApi";

export const SERVER_WORKSPACE_STORAGE_KEY = "sun-aware-garden-planner:server-workspace-id:v1";
export const WORKSPACE_RECOVERY_ARCHIVE_PREFIX = "sun-aware-garden-planner:workspace-recovery:v1:";
export type StorageSource = "browser" | "server";
export type WorkspaceSyncState = "loading" | "load-error" | "workspace-missing" | "empty" | "local" | "local-error" | "saving" | "saved" | "error" | "conflict";

type MissingWorkspace = { id: string; raw?: string | null; backup?: GardenWorkspace };

function adoptServerWorkspace(server: ServerWorkspace) {
  const { workspaceId: _workspaceId, revision, ...data } = server;
  void _workspaceId;
  const workspace = readGardenWorkspace(JSON.stringify(data));
  if (!workspace) throw new Error("Invalid server workspace");
  return { workspace, revision };
}

/** One workspace owner: local persistence, serial revision-checked writes, and explicit retries. */
export function useWorkspaceSync() {
  const [workspace, setWorkspaceState] = useState<GardenWorkspace>();
  const latestWorkspaceRef = useRef<GardenWorkspace | undefined>(undefined);
  // Evaluate each local mutation once against the latest accepted value, including
  // earlier actions in the same event. Business validation can read this snapshot.
  const setWorkspace = useCallback((update: SetStateAction<GardenWorkspace | undefined>) => {
    const next = typeof update === "function" ? update(latestWorkspaceRef.current) : update;
    latestWorkspaceRef.current = next;
    setWorkspaceState(next);
  }, []);
  const getLatestWorkspace = useCallback(() => latestWorkspaceRef.current, []);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageSource, setStorageSource] = useState<StorageSource>("browser");
  const [serverWorkspaceId, setServerWorkspaceId] = useState<string>();
  const [missingWorkspace, setMissingWorkspace] = useState<MissingWorkspace>();
  const [saveConflict, setSaveConflict] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [importFailed, setImportFailed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [confirmedSnapshot, setConfirmedSnapshot] = useState<string>();
  const [localSnapshot, setLocalSnapshot] = useState<string>();
  const [pendingSaveCount, setPendingSaveCount] = useState(0);
  const queuedServerWorkspaceRef = useRef<string | undefined>(undefined);
  const serverSaveQueueRef = useRef(Promise.resolve());
  const pendingSavesRef = useRef(0);
  const autoSyncInFlightRef = useRef(false);
  const restoringRef = useRef(false);
  const reloadingRef = useRef(false);
  const mountedRef = useRef(false);
  const serverRevisionRef = useRef(0);
  const conflictRevisionRef = useRef<number | undefined>(undefined);
  const conflictRef = useRef(false);
  // Invalidate queued writes and late responses when a conflict changes the baseline.
  const saveGenerationRef = useRef(0);
  const importGenerationRef = useRef(0);
  // Retrying a lost import response must reuse its original id and payload.
  const importRequestRef = useRef<{ id: string; snapshot: GardenWorkspace } | undefined>(undefined);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      saveGenerationRef.current += 1;
      importGenerationRef.current += 1;
      autoSyncInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    restoringRef.current = true;
    setIsLoaded(false);
    setRestoreError("");
    setMissingWorkspace(undefined);
    void (async () => {
      try {
        const savedServerWorkspaceId = window.localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY);
        if (savedServerWorkspaceId) {
          setStorageSource("server");
          setServerWorkspaceId(savedServerWorkspaceId);
          try {
            const { workspace: restored, revision } = adoptServerWorkspace(await loadServerWorkspace(savedServerWorkspaceId));
            if (!active) return;
            serverRevisionRef.current = revision;
            queuedServerWorkspaceRef.current = JSON.stringify(restored);
            setConfirmedSnapshot(queuedServerWorkspaceRef.current);
            // A swapped old demo differs from the confirmed copy, so it saves like any edit.
            setWorkspace(replaceLegacyDemoGarden(restored));
            setStorageError("");
          } catch (error) {
            if (!active) return;
            if (error instanceof ServerWorkspaceError && error.status === 404) {
              try {
                const raw = window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY);
                const copy = readGardenWorkspace(raw);
                // The archived bytes stay intact. Only workspace data belongs to the new import.
                const backup = copy && {
                  version: copy.version, selectedGardenId: copy.selectedGardenId, gardens: copy.gardens,
                  careEvents: copy.careEvents, careTasks: copy.careTasks,
                };
                setMissingWorkspace({ id: savedServerWorkspaceId, raw, backup });
                setStorageError("");
              } catch {
                setMissingWorkspace({ id: savedServerWorkspaceId });
              }
            } else {
              setRestoreError("Your workspace could not be loaded. Check your connection and retry.");
            }
          }
          return;
        }
        const saved = window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY);
        const restored = readGardenWorkspace(saved);
        setStorageSource("browser");
        setServerWorkspaceId(undefined);
        setStorageError("");
        if (restored) setWorkspace(replaceLegacyDemoGarden(restored));
        else if (saved) setRestoreError("Saved garden data could not be read. Keep this browser's data and try again.");
      } catch {
        if (active) setStorageError("This browser's storage is unavailable. Keep this page open while you work.");
      } finally {
        if (active) { restoringRef.current = false; setIsLoaded(true); }
      }
    })();
    return () => { active = false; restoringRef.current = false; };
  }, [restoreAttempt, setWorkspace]);

  const queueServerSave = useCallback((workspaceId: string, snapshot: GardenWorkspace) => {
    const generation = saveGenerationRef.current;
    pendingSavesRef.current += 1;
    setPendingSaveCount(pendingSavesRef.current);
    serverSaveQueueRef.current = serverSaveQueueRef.current.then(async () => {
      try {
        if (generation !== saveGenerationRef.current || !mountedRef.current) return;
        const saved = await saveServerWorkspace(workspaceId, snapshot, serverRevisionRef.current);
        if (generation !== saveGenerationRef.current || !mountedRef.current) return;
        serverRevisionRef.current = saved.revision;
        const confirmed = JSON.stringify(snapshot);
        setConfirmedSnapshot(confirmed);
        // An earlier success does not clear an error on a newer, unconfirmed edit.
        if (confirmed === JSON.stringify(latestWorkspaceRef.current)) setSaveError("");
      } catch (error) {
        if (generation !== saveGenerationRef.current || !mountedRef.current) return;
        if (error instanceof ServerWorkspaceError && error.status === 409) {
          saveGenerationRef.current += 1;
          conflictRevisionRef.current = error.currentRevision;
          conflictRef.current = true;
          setSaveConflict(true);
          setSaveError("");
        } else {
          setSaveError("Keep this page open. Check your connection, then retry to save your latest changes.");
        }
      } finally {
        pendingSavesRef.current -= 1;
        if (mountedRef.current) setPendingSaveCount(pendingSavesRef.current);
      }
    });
  }, []);

  const persistLocally = useCallback((snapshot: GardenWorkspace) => {
    try {
      const serialized = JSON.stringify(snapshot);
      window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, serialized);
      setLocalSnapshot(serialized);
      setStorageError("");
    } catch {
      setStorageError("Keep this page open. Check browser storage availability, then retry.");
    }
  }, []);

  const syncBrowserWorkspace = useCallback((snapshot: GardenWorkspace) => {
    if (autoSyncInFlightRef.current) return;
    autoSyncInFlightRef.current = true;
    setIsImporting(true);
    const generation = importGenerationRef.current;
    const request = importRequestRef.current ?? {
      id: `local-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
      snapshot,
    };
    importRequestRef.current = request;
    void (async () => {
      try {
        const { workspace: restored, revision } = adoptServerWorkspace(await importServerWorkspace(request.id, request.snapshot));
        if (!mountedRef.current || generation !== importGenerationRef.current) return;
        try { window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, request.id); }
        catch { setStorageError("The connection could not be remembered on this device. Keep this page open and retry."); return; }
        serverRevisionRef.current = revision;
        queuedServerWorkspaceRef.current = JSON.stringify(restored);
        setConfirmedSnapshot(queuedServerWorkspaceRef.current);
        setServerWorkspaceId(request.id);
        setStorageSource("server");
        setImportFailed(false);
        setStorageError("");
        // An import response must never erase edits made since its original request.
        if (latestWorkspaceRef.current === request.snapshot) setWorkspace(restored);
      } catch {
        if (mountedRef.current && generation === importGenerationRef.current) setImportFailed(true);
      } finally {
        if (generation === importGenerationRef.current) {
          autoSyncInFlightRef.current = false;
          if (mountedRef.current) setIsImporting(false);
        }
      }
    })();
  }, [setWorkspace]);

  useEffect(() => {
    if (!isLoaded || !workspace) return;
    if (storageSource === "browser") {
      persistLocally(workspace);
      syncBrowserWorkspace(workspace);
      return;
    }
    if (!serverWorkspaceId || saveConflict) return;
    const snapshot = JSON.stringify(workspace);
    if (snapshot === queuedServerWorkspaceRef.current) return;
    queuedServerWorkspaceRef.current = snapshot;
    queueServerSave(serverWorkspaceId, workspace);
  }, [isLoaded, persistLocally, queueServerSave, saveConflict, serverWorkspaceId, storageSource, syncBrowserWorkspace, workspace]);

  const clearBrowserWorkspace = () => {
    try { window.localStorage.removeItem(GARDEN_WORKSPACE_STORAGE_KEY); }
    catch { setStorageError("This device could not remove the saved workspace. Keep it open and try again."); return false; }
    importGenerationRef.current += 1;
    importRequestRef.current = undefined;
    autoSyncInFlightRef.current = false;
    setIsImporting(false);
    setImportFailed(false);
    setStorageError("");
    setLocalSnapshot(undefined);
    setWorkspace(undefined);
    return true;
  };

  const retrySync = () => {
    if (restoringRef.current || reloadingRef.current || autoSyncInFlightRef.current || pendingSavesRef.current || conflictRef.current) return;
    if (missingWorkspace || restoreError || (!latestWorkspaceRef.current && storageError)) {
      restoringRef.current = true;
      setIsLoaded(false);
      setRestoreAttempt((attempt) => attempt + 1);
      return;
    }
    const latest = latestWorkspaceRef.current;
    if (!latest) return;
    if (storageSource === "browser") {
      persistLocally(latest);
      syncBrowserWorkspace(latest);
    } else if (serverWorkspaceId) {
      // Bypass snapshot deduplication; replay the snapshot, never the business action.
      queuedServerWorkspaceRef.current = JSON.stringify(latest);
      queueServerSave(serverWorkspaceId, latest);
    }
  };

  const recoverMissingWorkspace = () => {
    if (!missingWorkspace || missingWorkspace.raw === undefined || restoringRef.current) {
      throw new Error("Check the saved workspace again before continuing.");
    }
    const { id, raw, backup } = missingWorkspace;
    const storage = window.localStorage;
    if (storage.getItem(SERVER_WORKSPACE_STORAGE_KEY) !== id || storage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) !== raw) {
      throw new Error("The saved workspace changed in another tab. Cancel and retry the workspace check.");
    }
    try {
      // Archive the original values before changing which workspace this browser opens.
      const archive = JSON.stringify({ workspaceId: id, browserSnapshot: raw });
      const archiveKey = `${WORKSPACE_RECOVERY_ARCHIVE_PREFIX}${id}`;
      const previousArchive = storage.getItem(archiveKey);
      if (previousArchive !== archive) {
        storage.setItem(previousArchive === null ? archiveKey : `${archiveKey}:${createId("backup")}`, archive);
      }
      if (raw !== null && !backup) storage.removeItem(GARDEN_WORKSPACE_STORAGE_KEY);
      storage.removeItem(SERVER_WORKSPACE_STORAGE_KEY);
    } catch {
      throw new Error("This browser could not prepare a new workspace. Check browser storage, then cancel and retry the workspace check.");
    }
    setMissingWorkspace(undefined);
    setStorageSource("browser");
    setServerWorkspaceId(undefined);
    setWorkspace(backup);
  };

  const reloadFromServer = async () => {
    if (!serverWorkspaceId || !conflictRef.current || reloadingRef.current || pendingSavesRef.current) return;
    reloadingRef.current = true;
    setIsReloading(true);
    setSaveError("");
    const generation = ++saveGenerationRef.current;
    const beforeReload = latestWorkspaceRef.current;
    try {
      const { workspace: restored, revision } = adoptServerWorkspace(await loadServerWorkspace(serverWorkspaceId));
      if (!mountedRef.current || generation !== saveGenerationRef.current) return;
      // A new edit during the read was not part of the discard confirmation.
      if (latestWorkspaceRef.current !== beforeReload) {
        setSaveError("You made more changes while loading. Review them before choosing Reload latest again.");
        return;
      }
      serverRevisionRef.current = revision;
      queuedServerWorkspaceRef.current = JSON.stringify(restored);
      setConfirmedSnapshot(queuedServerWorkspaceRef.current);
      setWorkspace(restored);
      conflictRef.current = false;
      setSaveConflict(false);
    } catch {
      if (mountedRef.current) setSaveError("The latest version could not be loaded. Your changes are still here. Try Reload latest again.");
    } finally {
      reloadingRef.current = false;
      if (mountedRef.current) setIsReloading(false);
    }
  };

  const keepLocalChanges = () => {
    const latest = latestWorkspaceRef.current;
    if (!serverWorkspaceId || !latest || !conflictRef.current || reloadingRef.current || pendingSavesRef.current) return;
    // Missing conflict revisions must never be guessed or bypass the concurrency check.
    if (conflictRevisionRef.current === undefined) {
      setSaveError("The server did not provide a version to replace. Reload the latest version before continuing.");
      return;
    }
    saveGenerationRef.current += 1;
    serverRevisionRef.current = conflictRevisionRef.current;
    conflictRef.current = false;
    setSaveConflict(false);
    queuedServerWorkspaceRef.current = JSON.stringify(latest);
    queueServerSave(serverWorkspaceId, latest);
  };

  const workspaceSnapshot = useMemo(() => workspace ? JSON.stringify(workspace) : undefined, [workspace]);
  const isSynced = storageSource === "server" && !saveConflict && !saveError && pendingSaveCount === 0 && workspaceSnapshot !== undefined && workspaceSnapshot === confirmedSnapshot;
  const isBusy = !isLoaded || pendingSaveCount > 0 || isImporting || isReloading;
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    setIsSlow(false);
    if (!isBusy) return;
    const timer = setTimeout(() => setIsSlow(true), 5000);
    return () => clearTimeout(timer);
  }, [isBusy]);
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  let syncState: WorkspaceSyncState = "saving";
  if (!isLoaded) syncState = "loading";
  else if (missingWorkspace) syncState = "workspace-missing";
  else if (restoreError) syncState = "load-error";
  else if (storageError) syncState = "local-error";
  else if (saveConflict) syncState = "conflict";
  else if (!workspace) syncState = "empty";
  else if (storageSource === "browser") syncState = workspaceSnapshot === localSnapshot ? "local" : "saving";
  else if (isSynced) syncState = "saved";
  else if (!pendingSaveCount && saveError) syncState = "error";
  return {
    workspace, setWorkspace, getLatestWorkspace, isSynced, isLoaded, storageSource, serverWorkspaceId,
    serverLoadFailed: Boolean(missingWorkspace || (serverWorkspaceId && restoreError)), missingWorkspace, recoverMissingWorkspace,
    saveConflict, clearBrowserWorkspace, reloadFromServer, keepLocalChanges, retrySync,
    syncState, syncError: restoreError || storageError || saveError, isBusy, isSlow, isOnline, importFailed, isImporting,
  };
}
