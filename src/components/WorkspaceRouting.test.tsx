import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GardenWorkspace, SERVER_WORKSPACE_STORAGE_KEY } from "@/test/WorkspaceHarness";
import { resetTestRouter, testRouter } from "@/test/router";
import { areaPath, gardenPath } from "@/lib/workspaceRoutes";
import { createDemoGardenWorkspace, createGarden, GARDEN_WORKSPACE_STORAGE_KEY, todayDate } from "@/lib/gardenWorkspace";

function seedLocal() {
  const workspace = createDemoGardenWorkspace();
  workspace.gardens.push(createGarden("Back garden"));
  window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  return workspace;
}
function serverHarness() {
  let workspace = createDemoGardenWorkspace();
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/runtime-config")) return { ok: true, json: async () => ({ portfolioDemo: false }) };
    if (init?.method === "PUT") workspace = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ workspaceId: "routing", revision: 0, ...workspace }) };
  });
  vi.stubGlobal("fetch", fetch);
  window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "routing");
  return { fetch, workspace };
}

describe("workspace routes and persistent provider", () => {
  it("loads the URL garden even when the saved selection names another garden, and writes to the URL owner", async () => {
    const workspace = seedLocal();
    const target = workspace.gardens[1];
    resetTestRouter(gardenPath(target.id));
    render(<GardenWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit garden details" }));
    expect(await screen.findByLabelText("Garden name")).toHaveValue("Back garden");
    fireEvent.change(screen.getByLabelText("Garden name"), { target: { value: "URL garden updated" } });
    fireEvent.keyDown(screen.getByLabelText("Garden name"), { key: "Enter" });
    const saved = JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!);
    expect(saved.gardens[0].name).toBe("Demo Garden");
    expect(saved.gardens[1].name).toBe("URL garden updated");
    expect(saved.selectedGardenId).toBe(workspace.selectedGardenId);
  });

  it("waits for server restoration before deciding that a deep-linked garden is missing", async () => {
    const workspace = createDemoGardenWorkspace();
    let resolve!: (response: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((done) => { resolve = done; })));
    localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "routing");
    resetTestRouter(gardenPath(workspace.gardens[0].id));
    render(<GardenWorkspace />);
    expect(screen.getByText("Loading garden workspace...")).toBeInTheDocument();
    expect(screen.queryByText("Garden not found in this workspace")).not.toBeInTheDocument();
    await act(async () => resolve({ ok: true, json: async () => ({ ...workspace, workspaceId: "routing", revision: 2 }) }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit garden details" }));
    expect(await screen.findByLabelText("Garden name")).toHaveValue("Demo Garden");
  });

  it("shows missing entities explicitly and clears the area parameter when switching gardens", async () => {
    const workspace = seedLocal();
    resetTestRouter(gardenPath("missing"));
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    expect(await screen.findByText("Garden not found in this workspace")).toBeInTheDocument();
    act(() => testRouter.push(areaPath(workspace.gardens[0].id, "missing-area")));
    expect(screen.getByRole("alert")).toHaveTextContent("Planting area not found");
    fireEvent.click(screen.getByRole("button", { name: "Edit garden details" }));
    expect(screen.getByLabelText("Garden name")).toHaveValue("Demo Garden");
    await user.selectOptions(screen.getByLabelText("Garden", { selector: "select" }), workspace.gardens[1].id);
    expect(location.pathname).toBe(gardenPath(workspace.gardens[1].id));
    expect(location.search).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Edit garden details" }));
    expect(screen.getByLabelText("Garden name")).toHaveValue("Back garden");
  });

  it("keeps one workspace restore across module navigation and does not write just to select a garden", async () => {
    const { fetch } = serverHarness();
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("link", { name: "Open Demo Garden" }));
    await user.click(within(screen.getByRole("navigation", { name: "Garden sections" })).getByRole("link", { name: "Care" }));
    expect(screen.getByRole("heading", { level: 1, name: "Care" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Tasks" })).toBeInTheDocument();
    await user.click(within(screen.getByRole("navigation", { name: "Garden sections" })).getByRole("link", { name: "Next Season" }));
    expect(screen.getByRole("heading", { level: 1, name: `Next Season · ${new Date().getFullYear() + 1}` })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Overview" }));
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/workspaces/routing"))).toHaveLength(1);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
  });

  it("uses care view query parameters and retains a care form across route unmounts", async () => {
    seedLocal();
    resetTestRouter(`${gardenPath("demo-garden", "care")}?view=invalid`);
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await screen.findByRole("heading", { name: "Tasks" });
    expect(location.search).toBe("?view=tasks");
    await user.click(screen.getByRole("link", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Keep this care draft" } });
    await user.click(screen.getByRole("link", { name: "Plant Guide" }));
    act(() => testRouter.back());
    await waitFor(() => expect(location.pathname).toBe(gardenPath("demo-garden", "care")));
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("Keep this care draft");
    act(() => testRouter.forward());
    await waitFor(() => expect(location.pathname).toBe("/guide"));
  });

  it("keeps note text across navigation, avoids implicit generation, and rejects a late response after an edit", async () => {
    const { fetch } = serverHarness();
    let resolveDraft!: (value: Response) => void;
    const original = fetch.getMockImplementation()!;
    fetch.mockImplementation((url, init) => url.includes("/ai/care-note-draft")
      ? new Promise<Response>((done) => { resolveDraft = done; })
      : original(url, init));
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Open note editor" }));
    fireEvent.change(await screen.findByLabelText("Care note"), { target: { value: "Watered the garden today" } });
    expect(fetch.mock.calls.filter(([url]) => url.includes("/ai/care-note-draft"))).toHaveLength(0);
    await user.selectOptions(screen.getByLabelText("Garden", { selector: "select" }), "demo-garden");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    act(() => testRouter.push("/notes"));
    expect(within(screen.getByRole("banner")).queryByRole("link", { name: /Garden Note/ })).not.toBeInTheDocument();
    const note = await screen.findByLabelText("Care note");
    expect(note).toHaveValue("Watered the garden today");
    fireEvent.change(note, { target: { value: "Revised care note" } });
    await act(async () => resolveDraft(new Response(JSON.stringify({ kind: "completed", type: "watering", date: todayDate(), targetScope: "garden", note: "Old note", reviewNotes: [] }))));
    expect(await screen.findByLabelText("Care note")).toHaveValue("Revised care note");
    expect(screen.queryByRole("heading", { name: "AI extracted draft" })).not.toBeInTheDocument();
    expect(fetch.mock.calls.filter(([url]) => url.includes("/ai/care-note-draft"))).toHaveLength(1);
  });
});
