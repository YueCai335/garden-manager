import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoGardenWorkspace, GARDEN_WORKSPACE_STORAGE_KEY, readGardenWorkspace, type GardenWorkspace } from "@/lib/gardenWorkspace";
import { SERVER_WORKSPACE_STORAGE_KEY, useWorkspaceSync, WORKSPACE_RECOVERY_ARCHIVE_PREFIX } from "./useWorkspaceSync";
import type { ServerWorkspace } from "@/lib/gardenWorkspaceApi";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function serverHarness() {
  let server: ServerWorkspace = { ...createDemoGardenWorkspace(), workspaceId: "sync-test", revision: 0 };
  const puts: Array<{ snapshot: ServerWorkspace; request: ReturnType<typeof deferred<Response>> }> = [];
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const request = deferred<Response>();
      puts.push({ snapshot: JSON.parse(String(init.body)), request });
      return request.promise;
    }
    return Promise.resolve(response(server));
  });
  vi.stubGlobal("fetch", fetch);
  localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, server.workspaceId);
  return {
    fetch, puts,
    accept(index: number, loseResponse = false) {
      const put = puts[index];
      expect(put.snapshot.revision).toBe(server.revision);
      server = { ...put.snapshot, revision: server.revision + 1 };
      if (loseResponse) put.request.reject(new Error("Response lost"));
      else put.request.resolve(response(server));
    },
    conflict(index: number) {
      puts[index].request.resolve(response({ detail: { currentRevision: server.revision } }, 409));
    },
    get server() { return server; },
  };
}
function rename(workspace: GardenWorkspace | undefined, name: string): GardenWorkspace | undefined {
  return workspace && { ...workspace, gardens: workspace.gardens.map((garden, index) => index ? garden : { ...garden, name }) };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("workspace save recovery", () => {
  it("validates against same-event edits and preserves both changes in one snapshot", async () => {
    const harness = serverHarness();
    const { result } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.isSynced).toBe(true));
    act(() => {
      result.current.setWorkspace((workspace) => rename(workspace, "Renamed before batch"));
      const latest = result.current.getLatestWorkspace()!;
      expect(latest.gardens[0].name).toBe("Renamed before batch");
      result.current.setWorkspace({ ...latest, careEvents: [...latest.careEvents, { id: "same-event-care", type: "watering", date: "2026-11-11", targetScope: "all-gardens", note: "All gardens" }] });
    });
    await waitFor(() => expect(harness.puts).toHaveLength(1));
    expect(harness.puts[0].snapshot.gardens[0].name).toBe("Renamed before batch");
    expect(harness.puts[0].snapshot.careEvents.at(-1)?.id).toBe("same-event-care");
    await act(async () => harness.accept(0));
    expect(result.current.isSynced).toBe(true);
  });

  it("retries the latest snapshot without another edit and guards a same-tick double retry", async () => {
    const harness = serverHarness();
    const { result, unmount } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.isSynced).toBe(true));
    act(() => result.current.setWorkspace((workspace) => rename(workspace, "First change")));
    await waitFor(() => expect(harness.puts).toHaveLength(1));
    await act(async () => harness.puts[0].request.reject(new Error("Offline")));
    expect(result.current.syncState).toBe("error");
    expect(result.current.isSynced).toBe(false);
    act(() => { result.current.retrySync(); result.current.retrySync(); });
    await waitFor(() => expect(harness.puts).toHaveLength(2));
    expect(harness.puts[1].snapshot).toEqual(harness.puts[0].snapshot);
    expect(result.current.syncState).toBe("saving");
    await act(async () => harness.accept(1));
    expect(result.current.syncState).toBe("saved");
    expect(result.current.syncError).toBe("");
    unmount();
    const restored = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(restored.result.current.workspace?.gardens[0].name).toBe("First change"));
  });

  it("serializes a newer edit behind a retry, carries the revision forward, and retains the newest failure", async () => {
    const harness = serverHarness();
    const { result } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.isSynced).toBe(true));
    act(() => result.current.setWorkspace((workspace) => rename(workspace, "A")));
    await waitFor(() => expect(harness.puts).toHaveLength(1));
    await act(async () => harness.puts[0].request.reject(new Error("Offline")));
    act(() => result.current.retrySync());
    await waitFor(() => expect(harness.puts).toHaveLength(2));
    act(() => result.current.setWorkspace((workspace) => rename(workspace, "B")));
    expect(harness.puts).toHaveLength(2);
    await act(async () => harness.accept(1));
    await waitFor(() => expect(harness.puts).toHaveLength(3));
    expect(harness.puts[2].snapshot.revision).toBe(1);
    expect(result.current.isSynced).toBe(false);
    expect(result.current.syncError).not.toBe("");
    await act(async () => harness.puts[2].request.reject(new Error("New failure")));
    expect(result.current.syncState).toBe("error");
    act(() => result.current.retrySync());
    await waitFor(() => expect(harness.puts).toHaveLength(4));
    expect(harness.puts[3].snapshot.gardens[0].name).toBe("B");
    await act(async () => harness.accept(3));
    expect(result.current.isSynced).toBe(true);
  });

  it("does not claim A is saved during an in-flight A to B to A sequence", async () => {
    const harness = serverHarness();
    const { result } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.isSynced).toBe(true));
    const original = result.current.workspace;
    act(() => result.current.setWorkspace((workspace) => rename(workspace, "B")));
    await waitFor(() => expect(harness.puts).toHaveLength(1));
    act(() => result.current.setWorkspace(original));
    expect(result.current.isSynced).toBe(false);
    await act(async () => harness.accept(0));
    await waitFor(() => expect(harness.puts).toHaveLength(2));
    expect(result.current.isSynced).toBe(false);
    await act(async () => harness.accept(1));
    expect(result.current.isSynced).toBe(true);
  });

  it("treats a lost save response followed by 409 as a conflict, with no automatic overwrite or online retry", async () => {
    const harness = serverHarness();
    const { result } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.isSynced).toBe(true));
    act(() => result.current.setWorkspace((workspace) => rename(workspace, "Saved but response lost")));
    await waitFor(() => expect(harness.puts).toHaveLength(1));
    await act(async () => harness.accept(0, true));
    act(() => window.dispatchEvent(new Event("online")));
    expect(harness.puts).toHaveLength(1);
    act(() => result.current.retrySync());
    await waitFor(() => expect(harness.puts).toHaveLength(2));
    await act(async () => harness.conflict(1));
    expect(result.current.syncState).toBe("conflict");
    act(() => result.current.retrySync());
    expect(harness.puts).toHaveLength(2);
    await act(async () => result.current.reloadFromServer());
    expect(result.current.workspace?.gardens[0].name).toBe("Saved but response lost");
    expect(result.current.isSynced).toBe(true);
  });

  it("keeps an edit made during conflict reload until a new explicit decision", async () => {
    const harness = serverHarness();
    const { result } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.isSynced).toBe(true));
    act(() => result.current.setWorkspace((workspace) => rename(workspace, "Before reload")));
    await waitFor(() => expect(harness.puts).toHaveLength(1));
    await act(async () => harness.conflict(0));
    const reload = deferred<Response>();
    harness.fetch.mockImplementationOnce(() => reload.promise);
    let loading!: Promise<void>;
    act(() => { loading = result.current.reloadFromServer(); });
    act(() => result.current.setWorkspace((workspace) => rename(workspace, "Edited during reload")));
    await act(async () => { reload.resolve(response(harness.server)); await loading; });
    expect(result.current.workspace?.gardens[0].name).toBe("Edited during reload");
    expect(result.current.syncState).toBe("conflict");
    expect(result.current.syncError).toContain("You made more changes");
  });

  it("retries initial restoration without reloading the page or falling back to stale browser data", async () => {
    const harness = serverHarness();
    localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(rename(harness.server, "Stale browser")));
    harness.fetch.mockRejectedValueOnce(new Error("Offline"));
    const { result } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.syncState).toBe("load-error"));
    expect(result.current.workspace).toBeUndefined();
    act(() => { result.current.retrySync(); result.current.retrySync(); });
    await waitFor(() => expect(result.current.isSynced).toBe(true));
    expect(harness.fetch).toHaveBeenCalledTimes(2);
    expect(result.current.workspace?.gardens[0].name).toBe("Demo Garden");
  });

  it("preserves the old reference and original copy while restoring a 404 backup under a fresh server ID", async () => {
    const harness = serverHarness();
    const raw = JSON.stringify(rename(harness.server, "Browser copy"));
    localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, raw);
    harness.fetch.mockResolvedValueOnce(response({ detail: "Workspace not found" }, 404));
    const { result } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.syncState).toBe("workspace-missing"));
    expect(result.current.workspace).toBeUndefined();
    expect(harness.puts).toHaveLength(0);
    expect(localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBe(harness.server.workspaceId);
    expect(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)).toBe(raw);

    act(() => result.current.recoverMissingWorkspace());
    await waitFor(() => expect(harness.puts).toHaveLength(1));
    const restoredId = harness.puts[0].snapshot.workspaceId;
    expect(restoredId).not.toBe(harness.server.workspaceId);
    expect(harness.fetch.mock.calls.at(-1)?.[0]).toContain(`/workspaces/${restoredId}/import`);
    expect(harness.puts[0].snapshot.gardens[0].name).toBe("Browser copy");
    expect(harness.puts[0].snapshot).not.toHaveProperty("revision");
    expect(JSON.parse(localStorage.getItem(`${WORKSPACE_RECOVERY_ARCHIVE_PREFIX}${harness.server.workspaceId}`)!)).toEqual({
      workspaceId: harness.server.workspaceId, browserSnapshot: raw,
    });
    await act(async () => harness.puts[0].request.resolve(response({ ...harness.puts[0].snapshot, revision: 0 }, 201)));
    expect(result.current.isSynced).toBe(true);
    expect(localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBe(restoredId);
  });

  it("refuses recovery when another tab has already changed the workspace reference", async () => {
    const harness = serverHarness();
    harness.fetch.mockResolvedValueOnce(response({}, 404));
    const { result } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.syncState).toBe("workspace-missing"));
    localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "different-workspace");
    expect(() => result.current.recoverMissingWorkspace()).toThrow("changed in another tab");
    expect(localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBe("different-workspace");
    expect(localStorage.getItem(`${WORKSPACE_RECOVERY_ARCHIVE_PREFIX}${harness.server.workspaceId}`)).toBeNull();
    expect(harness.puts).toHaveLength(0);
  });

  it("keeps the existing reference and browser copy if archiving fails", async () => {
    const harness = serverHarness();
    const raw = JSON.stringify(createDemoGardenWorkspace());
    localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, raw);
    harness.fetch.mockResolvedValueOnce(response({}, 404));
    const { result } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.syncState).toBe("workspace-missing"));
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    expect(() => result.current.recoverMissingWorkspace()).toThrow("could not prepare a new workspace");
    expect(localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBe(harness.server.workspaceId);
    expect(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)).toBe(raw);
    expect(result.current.syncState).toBe("workspace-missing");
    expect(harness.puts).toHaveLength(0);
  });

  it("keeps a persistent local-storage failure and recovers only after a real write succeeds", async () => {
    const workspace = createDemoGardenWorkspace();
    localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    const { result } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.syncState).toBe("local-error"));
    expect(result.current.workspace).toEqual(readGardenWorkspace(JSON.stringify(workspace)));
    expect(result.current.isSynced).toBe(false);
    await waitFor(() => expect(result.current.isBusy).toBe(false));
    act(() => result.current.retrySync());
    await waitFor(() => expect(result.current.isBusy).toBe(false));
    expect(result.current.syncState).toBe("local-error");
    write.mockRestore();
    act(() => result.current.retrySync());
    await waitFor(() => expect(result.current.syncState).toBe("local"));
    expect(result.current.importFailed).toBe(true);
    expect(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)).toBe(JSON.stringify(result.current.workspace));
  });

  it("reuses the original import payload after a lost response and then saves all newer edits", async () => {
    const workspace = createDemoGardenWorkspace();
    localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    const imports: ServerWorkspace[] = [];
    const saves: ServerWorkspace[] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body));
      if (url.endsWith("/import")) {
        imports.push(sent);
        if (imports.length === 1) throw new Error("Import response lost");
        return response({ ...sent, revision: 0 });
      }
      saves.push(sent);
      return response({ ...sent, revision: 1 });
    });
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.importFailed).toBe(true));
    act(() => result.current.setWorkspace((current) => rename(current, "New local edit")));
    await waitFor(() => expect(result.current.isSynced).toBe(true));
    expect(imports).toHaveLength(2);
    expect(imports[1]).toEqual(imports[0]);
    expect(saves).toHaveLength(1);
    expect(saves[0].gardens[0].name).toBe("New local edit");
    expect(result.current.workspace?.gardens[0].name).toBe("New local edit");
  });

  it("does not resurrect a removed local workspace when its earlier import finishes", async () => {
    localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(createDemoGardenWorkspace()));
    const importing = deferred<Response>();
    const fetch = vi.fn(() => importing.promise);
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useWorkspaceSync());
    await waitFor(() => expect(result.current.isImporting).toBe(true));
    act(() => expect(result.current.clearBrowserWorkspace()).toBe(true));
    await act(async () => importing.resolve(response({ ...createDemoGardenWorkspace(), workspaceId: "old", revision: 0 })));
    expect(result.current.workspace).toBeUndefined();
    expect(localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(result.current.syncState).toBe("empty");
  });

  it("shows slow restoration and allows retry after the 30 second request timeout", async () => {
    vi.useFakeTimers();
    localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "slow");
    const fetch = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useWorkspaceSync());
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.syncState).toBe("loading");
    expect(result.current.isSlow).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(25000));
    expect(result.current.syncState).toBe("load-error");
    expect(result.current.isBusy).toBe(false);
    fetch.mockResolvedValueOnce(response({ ...createDemoGardenWorkspace(), workspaceId: "slow", revision: 1 }));
    await act(async () => result.current.retrySync());
    expect(result.current.isSynced).toBe(true);
  });

  it("times out an uncertain save, retaining the changed snapshot for explicit retry", async () => {
    vi.useFakeTimers();
    localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "timeout-save");
    let pendingSignal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      if (!init?.method) return Promise.resolve(response({ ...createDemoGardenWorkspace(), workspaceId: "timeout-save", revision: 0 }));
      pendingSignal = init.signal;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
      });
    }));
    const { result } = renderHook(() => useWorkspaceSync());
    await act(async () => {});
    act(() => result.current.setWorkspace((workspace) => rename(workspace, "Keep this edit")));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(pendingSignal?.aborted).toBe(true);
    expect(result.current.syncState).toBe("error");
    expect(result.current.isSynced).toBe(false);
    expect(result.current.workspace?.gardens[0].name).toBe("Keep this edit");
    expect(result.current.isBusy).toBe(false);
  });
});
