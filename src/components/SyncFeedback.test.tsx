import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GardenWorkspace, SERVER_WORKSPACE_STORAGE_KEY } from "@/test/WorkspaceHarness";
import { resetTestRouter } from "@/test/router";
import { createDemoGardenWorkspace, GARDEN_WORKSPACE_STORAGE_KEY } from "@/lib/gardenWorkspace";
import { WORKSPACE_RECOVERY_ARCHIVE_PREFIX } from "@/hooks/useWorkspaceSync";
import type { ServerWorkspace } from "@/lib/gardenWorkspaceApi";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.restoreAllMocks());

describe("shared save feedback", () => {
  it("restores a browser copy from a deep link only after confirmation", async () => {
    const backup = createDemoGardenWorkspace();
    const oldId = "old-workspace";
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/runtime-config")) return response({ portfolioDemo: false });
      if (url.endsWith(`/${oldId}`)) return response({}, 404);
      if (url.endsWith("/import")) return response({ ...JSON.parse(String(init?.body)), revision: 0 }, 201);
      throw new Error(`Unexpected request to ${url}`);
    });
    vi.stubGlobal("fetch", fetch);
    localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, oldId);
    localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(backup));
    resetTestRouter("/care");
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    const restore = await screen.findByRole("button", { name: "Restore browser copy" });
    await user.click(restore);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Changes made only on the previous server may be missing");
    expect(localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBe(oldId);
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/import"))).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Restore browser copy" }));
    expect(await screen.findByRole("link", { name: "Open Demo Garden" })).toBeInTheDocument();
    await screen.findByText("All changes saved");
    expect(window.location.pathname).toBe("/gardens");
    expect(localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toMatch(/^local-/);
  });

  it("keeps Retry as the only recovery action when the workspace service returns a server error", async () => {
    const fetch = vi.fn(async () => response({}, 503));
    vi.stubGlobal("fetch", fetch);
    localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-unavailable");
    localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(createDemoGardenWorkspace()));
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await screen.findByRole("heading", { name: "Your workspace is unavailable" });
    expect(screen.queryByRole("button", { name: /restore browser copy|start a new workspace/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Your workspace is unavailable" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBe("server-unavailable");
  });

  it.each([null, "unreadable saved data"])("requires confirmation to start empty with browser data %j", async (raw) => {
    const fetch = vi.fn(async () => response({}, 404));
    vi.stubGlobal("fetch", fetch);
    const oldId = "missing-workspace";
    localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, oldId);
    if (raw !== null) localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, raw);
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await screen.findByRole("heading", { name: "Workspace not found" });
    expect(Boolean(screen.queryByRole("button", { name: "Download browser copy" }))).toBe(raw !== null);
    const start = screen.getByRole("button", { name: "Start a new workspace" });
    await user.click(start);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBe(oldId);
    expect(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)).toBe(raw);

    await user.click(start);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Start a new workspace" }));
    expect(await screen.findByRole("heading", { name: "Create your garden" })).toBeInTheDocument();
    expect(localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(`${WORKSPACE_RECOVERY_ARCHIVE_PREFIX}${oldId}`)!)).toEqual({ workspaceId: oldId, browserSnapshot: raw });
    // Starting empty makes no further workspace request; Overview's note entry may read runtime config.
    const workspaceRequests = fetch.mock.calls.filter((call) => !String((call as unknown[])[0]).endsWith("/runtime-config"));
    expect(workspaceRequests).toHaveLength(1);
  });

  it("recovers one Next Season record via Retry across modules and restores it after remount", async () => {
    let server: ServerWorkspace = { ...createDemoGardenWorkspace(), workspaceId: "feedback", revision: 0 };
    const puts: ServerWorkspace[] = [];
    let finishRetry!: () => void;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/runtime-config")) return response({ portfolioDemo: false });
      if (init?.method === "PUT") {
        const sent = JSON.parse(String(init.body));
        puts.push(sent);
        if (puts.length === 1) throw new Error("Offline");
        await new Promise<void>((resolve) => { finishRetry = resolve; });
        server = { ...sent, revision: server.revision + 1 };
      }
      return response(server);
    }));
    localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, server.workspaceId);
    resetTestRouter("/season");
    const user = userEvent.setup();
    const mounted = render(<GardenWorkspace />);
    const area = (await screen.findByRole("heading", { name: "Sample raised bed" })).closest("article")!;
    await user.click(within(area).getByRole("button", { name: "Choose a plant" }));
    await user.type(within(area).getByLabelText("Plant type"), "Kale");
    await user.click(within(area).getByRole("button", { name: /Add to .* plan/ }));
    expect(await screen.findByText("Changes not synced")).toBeInTheDocument();
    const firstId = puts[0].gardens[0].seasonPlans![0].plantings[0].id;
    await user.click(screen.getByRole("link", { name: "Overview" }));
    expect(screen.getByText("Changes not synced")).toBeInTheDocument();
    await user.dblClick(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
    expect(puts).toHaveLength(2);
    expect(puts[1].gardens[0].seasonPlans![0].plantings).toHaveLength(1);
    expect(puts[1].gardens[0].seasonPlans![0].plantings[0].id).toBe(firstId);
    await act(async () => finishRetry());
    expect(await screen.findByText("All changes saved")).toBeInTheDocument();
    mounted.unmount();
    resetTestRouter("/season");
    render(<GardenWorkspace />);
    const plan = await screen.findByRole("region", { name: /plan for Sample raised bed/ });
    expect(within(plan).getByText("Kale", { exact: true })).toBeInTheDocument();
    expect(puts).toHaveLength(2);
  });

  it("requires confirmation for conflict resolution and cancellation leaves the local version intact", async () => {
    const server = { ...createDemoGardenWorkspace(), workspaceId: "conflict", revision: 0 };
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "PUT"
      ? response({ detail: { currentRevision: 1 } }, 409)
      : response(server));
    vi.stubGlobal("fetch", fetch);
    localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, server.workspaceId);
    resetTestRouter("/gardens/demo-garden/plan");
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Edit garden details" }));
    fireEvent.change(await screen.findByLabelText("Garden name"), { target: { value: "My local name" } });
    fireEvent.keyDown(screen.getByLabelText("Garden name"), { key: "Enter" });
    await screen.findByText("A newer version is available");
    const calls = fetch.mock.calls.length;
    for (const label of ["Reload latest", "Keep my changes"]) {
      await user.click(screen.getByRole("button", { name: label }));
      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toHaveTextContent(label === "Reload latest" ? "discards this tab's unsynced" : "replaces the newer server workspace");
      expect(fetch).toHaveBeenCalledTimes(calls);
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.getByLabelText("Garden name")).toHaveValue("My local name");
      expect(fetch).toHaveBeenCalledTimes(calls);
    }
  });

  it("keeps a device-storage warning visible on other modules and warns before closing", async () => {
    localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(createDemoGardenWorkspace()));
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await screen.findByText("Changes could not be saved on this device");
    await user.click(within(screen.getByRole("navigation", { name: "Workspace sections" })).getByRole("link", { name: "Plant Guide" }));
    expect(screen.getByText("Changes could not be saved on this device")).toBeInTheDocument();
    expect(screen.queryByText("Saved on this device")).not.toBeInTheDocument();
    const leaving = new Event("beforeunload", { cancelable: true });
    fireEvent(window, leaving);
    expect(leaving.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled());
  });
});
