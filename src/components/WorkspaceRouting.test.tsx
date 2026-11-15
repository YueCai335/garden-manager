import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GardenWorkspace, SERVER_WORKSPACE_STORAGE_KEY } from "@/test/WorkspaceHarness";
import { resetTestRouter, testRouter } from "@/test/router";
import { areaPath, gardenPath, seasonGardenPath } from "@/lib/workspaceRoutes";
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
    const modules = () => within(screen.getByRole("navigation", { name: "Workspace sections" }));
    await user.click(modules().getByRole("link", { name: "Care" }));
    expect(screen.getByRole("heading", { level: 1, name: "Care" })).toBeInTheDocument();
    await user.click(modules().getByRole("link", { name: "Next Season" }));
    expect(screen.getByRole("heading", { level: 1, name: `Next Season · ${new Date().getFullYear() + 1}` })).toBeInTheDocument();
    await user.click(modules().getByRole("link", { name: "Gardens" }));
    expect(screen.getByRole("heading", { level: 1, name: "Gardens" })).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/workspaces/routing"))).toHaveLength(1);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
  });

  it("shows the header modules once and the breadcrumb below them (ADR-0073)", async () => {
    const workspace = createDemoGardenWorkspace();
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    const modules = within(await screen.findByRole("navigation", { name: "Workspace sections" }));
    expect(modules.getAllByRole("link").map((link) => link.textContent)).toEqual(["Gardens", "Care", "Next Season", "Plant Doctor", "Plant Guide"]);
    expect(modules.getByRole("link", { name: "Gardens" })).toHaveAttribute("aria-current", "page");
    // L1 pages have no breadcrumb or "All gardens".
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "All gardens" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Open Demo Garden" }));
    const breadcrumb = () => within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(breadcrumb().getByRole("link", { name: "Gardens" })).toHaveAttribute("href", "/gardens");
    expect(breadcrumb().getByText("Demo Garden")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "All gardens" })).toHaveAttribute("href", "/gardens");
    expect(modules.getByRole("link", { name: "Gardens" })).toHaveAttribute("aria-current", "true");
    // A garden page has no second Care or Next Season.
    expect(screen.queryByRole("navigation", { name: "Garden sections" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Care" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Next Season" })).toHaveLength(1);

    // L3: the zoomed area adds itself, and the garden becomes a link back to the whole plan.
    act(() => testRouter.push(areaPath(workspace.selectedGardenId, "demo-raised-bed")));
    expect(breadcrumb().getByRole("link", { name: "Demo Garden" })).toHaveAttribute("href", gardenPath(workspace.selectedGardenId));
    expect(breadcrumb().getByText("Sample raised bed")).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("link", { name: "All gardens" }));
    expect(location.pathname).toBe("/gardens");
  });

  it("filters Next Season by the URL garden, offers Show all, and keeps a garden's links on the L1 modules", async () => {
    const workspace = seedLocal();
    const back = workspace.gardens[1];
    resetTestRouter(seasonGardenPath(back.id));
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    expect(await screen.findByRole("heading", { name: "Back garden", level: 2 })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Demo Garden", level: 2 })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Garden")).toHaveValue(back.id);
    expect(screen.getByText(/Only Back garden/)).toBeVisible();
    // An L1 page: no breadcrumb, and the header marks Next Season as the page.
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Workspace sections" })).getByRole("link", { name: "Next Season" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("link", { name: "Show all" }));
    expect(location.search).toBe("");
    expect(await screen.findByRole("heading", { name: "Demo Garden", level: 2 })).toBeVisible();
    expect(screen.queryByText(/Only Back garden/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Garden"), workspace.selectedGardenId);
    expect(location.search).toBe(`?garden=${workspace.selectedGardenId}`);
    expect(screen.getByText(/Only Demo Garden/)).toBeVisible();
    act(() => testRouter.back());
    await waitFor(() => expect(location.search).toBe(""));
    expect(screen.getByLabelText("Garden")).toHaveValue("all");
  });

  it("opens the Garden Note from the header on any page and returns focus on Escape", async () => {
    seedLocal();
    resetTestRouter("/care");
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    const note = await screen.findByRole("button", { name: "Note" });
    expect(note).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(note);
    expect(await screen.findByRole("heading", { name: "Garden Note", level: 2 })).toHaveFocus();
    expect(note).toHaveAttribute("aria-expanded", "true");
    fireEvent(screen.getByRole("dialog", { hidden: true }), new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Garden Note", level: 2 })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Note" })).toHaveFocus());
  });

  it("uses care view query parameters and retains a care form across route unmounts", async () => {
    seedLocal();
    resetTestRouter("/care?view=invalid&location=demo-garden");
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await screen.findByRole("heading", { name: "Tasks" });
    expect(location.search).toBe("?view=tasks&location=demo-garden");
    await user.click(screen.getByRole("link", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Keep this care draft" } });
    await user.click(screen.getByRole("link", { name: "Plant Guide" }));
    act(() => testRouter.back());
    await waitFor(() => expect(location.pathname).toBe("/care"));
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
