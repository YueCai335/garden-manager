import { useCallback, useEffect, useRef, useState } from "react";

import {
  GARDEN_WORKSPACE_STORAGE_KEY,
  readGardenWorkspace,
  type GardenWorkspace,
} from "@/lib/gardenWorkspace";
import {
  importServerWorkspace,
  loadServerWorkspace,
  saveServerWorkspace,
  ServerWorkspaceError,
  type ServerWorkspace,
} from "@/lib/gardenWorkspaceApi";

export const SERVER_WORKSPACE_STORAGE_KEY =
  "sun-aware-garden-planner:server-workspace-id:v1";

export type StorageSource = "browser" | "server";

/** Split a server response into the workspace data and its revision number. */
function adoptServerWorkspace(server: ServerWorkspace) {
  const { workspaceId: _workspaceId, revision, ...data } = server;
  void _workspaceId;
  const workspace = readGardenWorkspace(JSON.stringify(data));
  if (!workspace) throw new Error("Invalid server workspace");
  return { workspace, revision };
}

/**
 * Owns where the workspace lives (browser or PostgreSQL) and keeps it saved.
 *
 * - On mount: restore from PostgreSQL when a server id is remembered,
 *   otherwise from localStorage.
 * - While in browser storage: persist every change to localStorage and try
 *   once at a time to import the workspace into PostgreSQL.
 * - Once server-backed: queue a PUT for every change, in order. Each PUT
 *   carries the revision this client last read; a 409 means another client
 *   saved first, and saving pauses until the gardener resolves the conflict.
 */
export function useWorkspaceSync({ onMessage }: { onMessage: (message: string) => void }) {
  const [workspace, setWorkspace] = useState<GardenWorkspace>();
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageSource, setStorageSource] = useState<StorageSource>("browser");
  const [serverWorkspaceId, setServerWorkspaceId] = useState<string>();
  const [serverLoadFailed, setServerLoadFailed] = useState(false);
  const [saveConflict, setSaveConflict] = useState(false);
  const queuedServerWorkspaceRef = useRef<string | undefined>(undefined);
  const serverSaveQueueRef = useRef(Promise.resolve());
  const autoSyncInFlightRef = useRef(false);
  // The revision PostgreSQL last confirmed for this client; echoed on every save.
  const serverRevisionRef = useRef(0);
  // Where the server actually is when a save is rejected as stale.
  const conflictRevisionRef = useRef<number | undefined>(undefined);
  // Always points at the newest workspace, so an async response can tell
  // whether edits happened while it was in flight.
  const latestWorkspaceRef = useRef<GardenWorkspace | undefined>(undefined);
  latestWorkspaceRef.current = workspace;

  useEffect(() => {
    let active = true;
    const restoreWorkspace = async () => {
      try {
        const savedServerWorkspaceId = window.localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY);
        if (savedServerWorkspaceId) {
          setStorageSource("server");
          setServerWorkspaceId(savedServerWorkspaceId);
          try {
            const { workspace: restored, revision } = adoptServerWorkspace(
              await loadServerWorkspace(savedServerWorkspaceId),
            );
            if (!active) return;
            serverRevisionRef.current = revision;
            queuedServerWorkspaceRef.current = JSON.stringify(restored);
            setWorkspace(restored);
            onMessage("Gardens restored from PostgreSQL.");
          } catch {
            if (!active) return;
            setServerLoadFailed(true);
            onMessage("PostgreSQL could not load this garden workspace. Check the API, then try again.");
          }
          return;
        }
        const saved = window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY);
        const restored = readGardenWorkspace(saved);
        if (restored) {
          setWorkspace(restored);
          onMessage("Gardens restored from this browser.");
        } else if (saved) {
          onMessage("Saved garden data could not be loaded.");
        }
      } catch {
        if (active) onMessage("This browser's garden storage is unavailable.");
      } finally {
        if (active) setIsLoaded(true);
      }
    };
    void restoreWorkspace();
    return () => {
      active = false;
    };
  }, [onMessage]);

  const queueServerSave = useCallback(
    (workspaceId: string, snapshot: GardenWorkspace) => {
      serverSaveQueueRef.current = serverSaveQueueRef.current.then(async () => {
        try {
          const saved = await saveServerWorkspace(workspaceId, snapshot, serverRevisionRef.current);
          serverRevisionRef.current = saved.revision;
          onMessage("Changes saved to PostgreSQL.");
        } catch (error) {
          if (error instanceof ServerWorkspaceError && error.status === 409) {
            conflictRevisionRef.current = error.currentRevision;
            setSaveConflict(true);
            onMessage("This garden was changed in another tab. Choose which copy to keep.");
            return;
          }
          onMessage("Changes could not be saved to PostgreSQL. Keep this page open and make another change after the API recovers.");
        }
      });
    },
    [onMessage],
  );

  useEffect(() => {
    if (!isLoaded || !workspace) return;
    if (storageSource === "browser") {
      try {
        window.localStorage.setItem(
          GARDEN_WORKSPACE_STORAGE_KEY,
          JSON.stringify(workspace),
        );
      } catch {
        onMessage("Changes could not be saved in this browser.");
      }
      if (autoSyncInFlightRef.current) return;
      autoSyncInFlightRef.current = true;
      void (async () => {
        const workspaceId = `local-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
        try {
          const { workspace: restored, revision } = adoptServerWorkspace(
            await importServerWorkspace(workspaceId, workspace),
          );
          window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, workspaceId);
          serverRevisionRef.current = revision;
          queuedServerWorkspaceRef.current = JSON.stringify(restored);
          setServerWorkspaceId(workspaceId);
          setStorageSource("server");
          // Only adopt the server's copy if nothing changed while the import
          // was in flight. Otherwise keep the newer local edits; switching to
          // "server" re-runs this effect and queues them as a save.
          if (latestWorkspaceRef.current === workspace) setWorkspace(restored);
        } catch {
          // PostgreSQL isn't reachable yet. Stay in browser storage and
          // retry automatically the next time the workspace changes.
        } finally {
          autoSyncInFlightRef.current = false;
        }
      })();
      return;
    }
    if (!serverWorkspaceId || saveConflict) return;
    const snapshot = JSON.stringify(workspace);
    if (snapshot === queuedServerWorkspaceRef.current) return;
    queuedServerWorkspaceRef.current = snapshot;
    queueServerSave(serverWorkspaceId, workspace);
  }, [isLoaded, onMessage, queueServerSave, saveConflict, serverWorkspaceId, storageSource, workspace]);

  /** Forget the browser-stored workspace (used after deleting the last garden). */
  const clearBrowserWorkspace = () => {
    window.localStorage.removeItem(GARDEN_WORKSPACE_STORAGE_KEY);
    setWorkspace(undefined);
  };

  /** Conflict resolution: drop this tab's unsaved edits and take the server's copy. */
  const reloadFromServer = async () => {
    if (!serverWorkspaceId) return;
    try {
      const { workspace: restored, revision } = adoptServerWorkspace(
        await loadServerWorkspace(serverWorkspaceId),
      );
      serverRevisionRef.current = revision;
      queuedServerWorkspaceRef.current = JSON.stringify(restored);
      setWorkspace(restored);
      setSaveConflict(false);
      onMessage("Reloaded the latest copy from PostgreSQL.");
    } catch {
      onMessage("PostgreSQL could not load the latest copy. Check the API, then try again.");
    }
  };

  /** Conflict resolution: keep this tab's edits and save them over the newer revision. */
  const keepLocalChanges = () => {
    if (!serverWorkspaceId || !workspace) return;
    if (conflictRevisionRef.current !== undefined) serverRevisionRef.current = conflictRevisionRef.current;
    setSaveConflict(false);
    queuedServerWorkspaceRef.current = JSON.stringify(workspace);
    queueServerSave(serverWorkspaceId, workspace);
  };

  return {
    workspace,
    setWorkspace,
    isLoaded,
    storageSource,
    serverWorkspaceId,
    serverLoadFailed,
    saveConflict,
    clearBrowserWorkspace,
    reloadFromServer,
    keepLocalChanges,
  };
}
