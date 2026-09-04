import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GrowingAreaLayoutEditor } from "@/components/GrowingAreaLayoutEditor";
import { GardenWorkspace } from "@/components/GardenWorkspace";
import {
  createDemoGardenWorkspace,
  createGarden,
  createGardenWorkspace,
  GARDEN_WORKSPACE_STORAGE_KEY,
} from "@/lib/gardenWorkspace";
import { SERVER_WORKSPACE_STORAGE_KEY } from "@/components/GardenWorkspace";

async function loadDemo(user: ReturnType<typeof userEvent.setup>) {
  render(<GardenWorkspace />);
  await user.click(await screen.findByRole("button", { name: "Load demo garden" }));
}

async function openPlantingArea(user: ReturnType<typeof userEvent.setup>, name: string) {
  await openSelectedGarden();
  await user.click(screen.getByLabelText(`Open ${name} on Garden Plan`));
  await screen.findByRole("heading", { name: "Edit planting area" });
}

function areaInspectorForm() {
  const form = screen.getByLabelText("Rotation (degrees)").closest("form");
  if (!form) throw new Error("Planting-area inspector form was not found");
  return within(form);
}

async function openSelectedGarden() {
  fireEvent.click(await screen.findByRole("button", { name: "Open Demo Garden" }));
  await screen.findByRole("heading", { name: "Garden Plan" });
}

async function openCare(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Care records" }));
  const gardenCard = screen.getByRole("heading", { name: "Demo Garden", level: 3 }).closest("article");
  if (!gardenCard) throw new Error("Demo Garden care card was not found");
  await user.click(within(gardenCard).getByRole("button", { name: "Open care" }));
}

async function confirmDialog(user: ReturnType<typeof userEvent.setup>, message?: string) {
  if (message) expect(screen.getByText(message)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Confirm" }));
}

async function cancelDialog(user: ReturnType<typeof userEvent.setup>, message?: string) {
  if (message) expect(screen.getByText(message)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
}

describe("GardenWorkspace", () => {
  it("opens the Garden Plan directly from a garden thumbnail", async () => {
    const user = userEvent.setup();

    await loadDemo(user);
    await user.click(screen.getByRole("button", { name: "Open Demo Garden" }));
    expect(await screen.findByRole("heading", { name: "Garden Plan" })).toHaveFocus();
    expect(screen.queryByRole("navigation", { name: "Workspace sections" })).not.toBeInTheDocument();
  });

  it("groups daily records ahead of seasonal and reference tools", async () => {
    const user = userEvent.setup();

    await loadDemo(user);

    const dailyWork = screen.getByRole("region", { name: "Daily garden work" });
    expect(within(dailyWork).getByRole("button", { name: "Care records" })).toBeInTheDocument();
    expect(within(dailyWork).getByRole("button", { name: "AI garden note" })).toBeInTheDocument();

    const gardenTools = screen.getByRole("region", { name: "Garden tools" });
    expect(within(gardenTools).getByRole("button", { name: "Plant doctor" })).toBeInTheDocument();
    expect(within(gardenTools).getByRole("button", { name: "Plant guide" })).toBeInTheDocument();
    expect(within(gardenTools).getByRole("button", { name: "Next season plan" })).toBeInTheDocument();
  });

  it("shows local AI feature previews in the public portfolio demo", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/runtime-config")) {
        return { ok: true, json: async () => ({ portfolioDemo: true }) };
      }
      return { ok: false, json: async () => ({}) };
    }));

    await loadDemo(user);
    await user.click(screen.getByRole("button", { name: "AI garden note" }));
    expect(await screen.findByRole("heading", { name: "AI Garden Note runs in the local app" })).toBeInTheDocument();
    expect(screen.getByText("Completed care note")).toBeInTheDocument();
    expect(screen.getByText(/hosted AI API can serve authenticated users/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to gardens" }));
    await user.click(screen.getByRole("button", { name: "Plant doctor" }));
    expect(await screen.findByRole("heading", { name: "Plant Health runs in the local app" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to gardens" }));
    await user.click(screen.getByRole("button", { name: "Plant guide" }));
    expect(await screen.findByRole("heading", { name: "Plant Knowledge runs in the local app" })).toBeInTheDocument();
    expect(screen.queryByText("Import gardens to PostgreSQL first")).not.toBeInTheDocument();
  });

  it("syncs browser gardens to PostgreSQL automatically, reloads from PostgreSQL, and saves a later edit", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => JSON.parse(String(init?.body ?? JSON.stringify({ workspaceId: "server-workspace", ...workspace }))),
    }));
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));

    const firstRender = render(<GardenWorkspace />);
    await openSelectedGarden();
    await waitFor(() => expect(window.localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).not.toBeNull());
    const importedPayload = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(fetch.mock.calls[0][0]).toMatch(/\/import$/);
    const savedBrowserWorkspace = JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!);
    expect(savedBrowserWorkspace.gardens[0].growingAreas[0].layout.allocations[0].plantingRecordId).toBe("demo-planting-tomatoes");
    expect(window.localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBe(importedPayload.workspaceId);

    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "45");
    await user.click(areaInspectorForm().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetch.mock.calls).toContainEqual([
      expect.stringMatching(/\/workspaces\/local-/),
      expect.objectContaining({ method: "PUT" }),
    ]));

    firstRender.unmount();
    fetch.mockClear();
    render(<GardenWorkspace />);
    await screen.findByRole("button", { name: "Next season plan" });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/workspaces\/local-/),
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("keeps browser gardens active and usable when PostgreSQL is unreachable", async () => {
    const workspace = createDemoGardenWorkspace();
    const fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));

    render(<GardenWorkspace />);
    await openSelectedGarden();
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    expect(window.localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(screen.getByText(/Saved in this browser/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Garden Plan" })).toBeInTheDocument();
  });

  it("reports a PostgreSQL save failure without returning to browser storage", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: !init?.method,
      json: async () => ({ workspaceId: "server-workspace", ...workspace }),
    }));
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");

    render(<GardenWorkspace />);
    await openSelectedGarden();
    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "45");
    await user.click(areaInspectorForm().getByRole("button", { name: "Save" }));

    await screen.findByText("Changes could not be saved to PostgreSQL. Keep this page open and make another change after the API recovers.");
    expect(window.localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY)).toBe("server-workspace");
    expect(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)).toBe(JSON.stringify(workspace));
  });

  it("reviews an AI garden note before saving it to Care History", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/ai/care-note-draft")) {
        return {
          ok: true,
          json: async () => ({
            type: "fertilizing",
            date: "2026-08-31",
            note: "昨天施了 10 mL 鱼肥。",
            targetScope: "planting-area",
            growingAreaId: "demo-raised-bed",
            growingAreaName: "Sample raised bed",
            plantingRecordId: null,
            plantingRecordName: null,
            fertilizerProduct: "Fish fertilizer",
            fertilizerAmount: 10,
            fertilizerUnit: "mL",
            reviewNotes: [],
          }),
        };
      }
      return {
        ok: true,
        json: async () => init?.method ? JSON.parse(String(init.body)) : { workspaceId: "server-workspace", ...workspace },
      };
    });
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "AI garden note" }));
    await user.type(screen.getByLabelText("Care note"), "昨天施了 10 mL 鱼肥。");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(await screen.findByRole("heading", { name: "AI extracted draft" })).toBeInTheDocument();
    expect(screen.getByLabelText("Fertilizer product (optional)")).toHaveValue("Fish fertilizer");
    expect(screen.queryByText("AI care draft saved to Care History.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save to Care History" }));
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(screen.getByText(/Fish fertilizer/)).toBeInTheDocument();
  });

  it("reviews an AI plant-health assessment before saving it to health history", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/ai/plant-health-assessment")) {
        return {
          ok: true,
          json: async () => ({
            summary: "White coating needs a closer look.",
            possibleIssues: ["Powdery mildew"],
            nextSteps: ["Check nearby leaves tomorrow."],
            followUpQuestions: ["Does it wipe away?"],
            confidence: "low",
          }),
        };
      }
      return {
        ok: true,
        json: async () => init?.method ? JSON.parse(String(init.body)) : { workspaceId: "server-workspace", ...workspace },
      };
    });
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Plant doctor" }));
    await user.type(screen.getByLabelText("What do you observe?"), "White coating on the lower leaves.");
    await user.click(screen.getByRole("button", { name: "Create AI assessment" }));
    expect(await screen.findByRole("heading", { name: "Review assessment" })).toBeInTheDocument();
    expect(screen.getByLabelText("Summary")).toHaveValue("White coating needs a closer look.");

    await user.click(screen.getByRole("button", { name: "Save health record" }));
    const history = screen.getByRole("heading", { name: "Health history" }).closest("section");
    if (!history) throw new Error("Plant health history was not found");
    expect(within(history).getByText("White coating on the lower leaves.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/workspaces\/server-workspace$/),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("answers a Plant Knowledge question with visible source citations", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/plant-knowledge/answer")) {
        return {
          ok: true,
          json: async () => ({
            answer: "Observe the coating and improve airflow while you gather more detail.",
            confidence: "low",
            followUpQuestions: ["Does the coating wipe away?"],
            citations: [{
              sourceKey: "umn-preventing-plant-diseases",
              title: "Preventing plant diseases in the garden",
              publisher: "University of Minnesota Extension",
              sourceUrl: "https://extension.umn.edu/example",
              reviewedOn: "2026-09-01",
              excerpt: "Garden disease prevention includes sanitation and airflow.",
            }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => init?.method ? JSON.parse(String(init.body)) : { workspaceId: "server-workspace", ...workspace },
      };
    });
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Plant guide" }));
    await user.type(screen.getByLabelText("Question"), "My tomato has a white coating.");
    await user.click(screen.getByRole("button", { name: "Ask Plant Knowledge" }));

    expect(await screen.findByRole("heading", { name: "Answer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preventing plant diseases in the garden" })).toHaveAttribute("href", "https://extension.umn.edu/example");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/plant-knowledge\/answer$/),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("separates all-garden care from care for one named location", async () => {
    const user = userEvent.setup();
    await loadDemo(user);

    await user.click(screen.getByRole("button", { name: "Care records" }));
    const allGardensCard = screen.getByRole("heading", { name: "All gardens", level: 3 }).closest("article");
    const demoGardenCard = screen.getByRole("heading", { name: "Demo Garden", level: 3 }).closest("article");
    if (!allGardensCard || !demoGardenCard) throw new Error("Care cards were not found");

    await user.click(within(allGardensCard).getByRole("button", { name: "Open care" }));
    expect(screen.getByText("All gardens")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    expect(screen.getByLabelText("Target")).toHaveValue("all-gardens");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Back to gardens" }));

    await user.click(screen.getByRole("button", { name: "Care records" }));
    const refreshedDemoGardenCard = screen.getByRole("heading", { name: "Demo Garden", level: 3 }).closest("article");
    if (!refreshedDemoGardenCard) throw new Error("Demo Garden care card was not found");
    await user.click(within(refreshedDemoGardenCard).getByRole("button", { name: "Open care" }));
    await user.click(screen.getByRole("tab", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    expect(screen.getByLabelText("Target")).toHaveValue("garden");
    expect(screen.getByRole("option", { name: "Demo Garden" })).toBeInTheDocument();
  });

  it("opens editing directly from a garden thumbnail", async () => {
    const user = userEvent.setup();
    await loadDemo(user);

    expect(screen.queryByRole("button", { name: "Edit garden" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Demo Garden" }));
    expect(screen.getByRole("heading", { name: "Garden Plan" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Delete garden" })).toBeInTheDocument();
    expect(screen.getByLabelText("Garden width (m)")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Garden properties" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open a planting area" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Planting records" })).not.toBeInTheDocument();
  });

  it("opens the garden that was clicked when several gardens exist", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    window.localStorage.setItem(
      GARDEN_WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        ...workspace,
        gardens: [
          workspace.gardens[0],
          { ...workspace.gardens[0], id: "community-garden", name: "Community plot" },
        ],
      }),
    );
    render(<GardenWorkspace />);

    await user.click(await screen.findByRole("button", { name: "Open Community plot" }));
    expect(screen.getByRole("button", { name: "Delete garden" })).toBeInTheDocument();
    expect(screen.getByLabelText("Garden name")).toHaveValue("Community plot");
    expect(screen.getByRole("button", { name: "Back to gardens" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to gardens" }));
    expect(screen.getByRole("button", { name: "Open Community plot" })).toBeInTheDocument();
  });

  it("creates a measured planting area beside Garden Plan, then restores it", async () => {
    const user = userEvent.setup();
    const firstRender = render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Load demo garden" }));
    await user.click(screen.getByRole("button", { name: "Add garden" }));
    expect(screen.getByRole("heading", { name: "Start a new garden" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Garden name"), "Community plot");
    await user.click(screen.getByRole("button", { name: "Continue setup" }));
    expect(screen.getByRole("heading", { name: "Garden setup" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Garden width (m)"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Garden length (m)"), { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Add planting area" }));
    await user.type(screen.getByLabelText("Planting-area name"), "North bed");
    await user.clear(screen.getByLabelText("Length (m)"));
    await user.type(screen.getByLabelText("Length (m)"), "2");
    await user.clear(screen.getByLabelText("Width (m)"));
    await user.type(screen.getByLabelText("Width (m)"), "1");
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "90");
    await user.click(screen.getByRole("button", { name: "Add area" }));
    expect(screen.queryByRole("heading", { name: "Edit planting area" })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Open North bed on Garden Plan"));
    expect(await screen.findByRole("heading", { name: "Edit planting area" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add plant" }));
    const plantForm = screen.getByRole("heading", { name: "Add plant" }).closest("form")!;
    await user.type(within(plantForm).getByLabelText("Plant type"), "Kale");
    await user.click(within(plantForm).getByRole("button", { name: "Add" }));
    expect(screen.getAllByText("Kale").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(screen.getByRole("button", { name: "Open Community plot" })).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}"))
      .toMatchObject({ gardens: expect.arrayContaining([expect.objectContaining({ name: "Community plot", plan: { widthMeters: 4, depthMeters: 2 }, growingAreas: expect.arrayContaining([expect.objectContaining({ name: "North bed", layout: expect.objectContaining({ widthMeters: 2, depthMeters: 1 }), planPlacement: expect.objectContaining({ rotationDegrees: 90 }) })]), plantings: expect.arrayContaining([expect.objectContaining({ commonName: "Kale" })]) })]) }));

    firstRender.unmount();
    render(<GardenWorkspace />);
    await screen.findByRole("button", { name: "Open Community plot" });
    await user.click(screen.getByRole("button", { name: "Open Community plot" }));
    await user.click(screen.getByLabelText("Open North bed on Garden Plan"));
    expect(screen.getAllByText("Kale").length).toBeGreaterThan(0);
  });

  it("keeps one area editor for details and current layout plants", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openPlantingArea(user, "Sample raised bed");
    const inspector = screen.getByRole("complementary", { name: "Edit planting area" });
    expect(within(inspector).getByRole("region", { name: "Plant layout" })).toBeInTheDocument();
    expect(within(inspector).getByRole("button", { name: "Add plant" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Planting records/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit planting" })).not.toBeInTheDocument();

    const name = screen.getByLabelText("Planting-area name");
    await user.clear(name);
    await user.type(name, "Kitchen bed");
    await user.clear(screen.getByLabelText("Length (m)"));
    await user.type(screen.getByLabelText("Length (m)"), "2.5");
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "45");
    await user.click(areaInspectorForm().getByRole("button", { name: "Save" }));
    expect(screen.getByRole("heading", { name: "Edit planting area" })).toBeInTheDocument();
    expect(screen.getByLabelText("Length (m)")).toHaveValue(2.5);
    expect(screen.getByLabelText("Rotation (degrees)")).toHaveValue(45);

    await user.click(screen.getByRole("button", { name: "Add plant" }));
    const plantForm = screen.getByRole("heading", { name: "Add plant" }).closest("form")!;
    await user.type(within(plantForm).getByLabelText("Plant type"), "Basil");
    await user.click(within(plantForm).getByRole("button", { name: "Add" }));
    expect(screen.getByLabelText("Basil plant")).toBeInTheDocument();
  });

  it("saves all planting-area properties through one action", async () => {
    const user = userEvent.setup();
    const onSaveArea = vi.fn();
    render(<GrowingAreaLayoutEditor area={{ id: "area-1", name: "North bed", kind: "raised-bed", planPlacement: { x: 0.5, y: 0.5, rotationDegrees: 0 }, layout: { widthMeters: 2, depthMeters: 1, boundary: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }], allocations: [] } }} onArchivePlantingRecord={vi.fn()} onChange={vi.fn()} onSaveArea={onSaveArea} />);

    await user.clear(screen.getByLabelText("Planting-area name"));
    await user.type(screen.getByLabelText("Planting-area name"), "Kitchen bed");
    await user.selectOptions(screen.getByLabelText("Planting-area type"), "container");
    await user.clear(screen.getByLabelText("Length (m)"));
    await user.type(screen.getByLabelText("Length (m)"), "1.5");
    await user.clear(screen.getByLabelText("Width (m)"));
    await user.type(screen.getByLabelText("Width (m)"), "0.8");
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "45");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSaveArea).toHaveBeenCalledWith(
      "Kitchen bed",
      "container",
      45,
      expect.objectContaining({ widthMeters: 1.5, depthMeters: 0.8 }),
    );
  });

  it("keeps a removed layout plant available to Care History", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openCare(user);
    await user.click(screen.getByRole("tab", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    const form = screen.getByRole("heading", { name: "Add care event" }).closest("form")!;
    fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-06-05" } });
    await user.selectOptions(within(form).getByLabelText("Target"), "plant-group:demo-planting-tomatoes");
    await user.click(within(form).getByRole("button", { name: "Add care event" }));
    await user.click(screen.getByRole("button", { name: "Back to gardens" }));
    await openPlantingArea(user, "Sample raised bed");
    await user.click(screen.getByLabelText("Tomato plant"));
    await user.click(screen.getByLabelText("Remove Tomato"));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Back to gardens" }));
    await openCare(user);
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/Tomato · Sun Gold · Sample raised bed/)).toBeInTheDocument();
  });

  it("keeps gardens and planting areas when deletion is cancelled", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openPlantingArea(user, "Sample raised bed");
    await user.click(screen.getByRole("button", { name: "Delete area" }));
    await cancelDialog(user, "Delete Sample raised bed? This removes the planting area and its 1 planting record from this browser. Care history stays in this garden.");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByLabelText("Open Sample raised bed on Garden Plan")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete garden" }));
    await cancelDialog(user, "Delete Demo Garden? This removes its 3 planting areas and 2 planting records from this browser.");
    expect(screen.getByRole("button", { name: "Delete garden" })).toBeInTheDocument();
  });

  it("removes Demo Garden from a multi-garden browser workspace", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const personalGarden = createGarden("Back garden");
    window.localStorage.setItem(
      GARDEN_WORKSPACE_STORAGE_KEY,
      JSON.stringify({ ...workspace, gardens: [...workspace.gardens, personalGarden] }),
    );

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Demo garden" }));
    await user.click(screen.getByRole("button", { name: "Delete garden" }));
    await confirmDialog(user);

    expect(screen.getByLabelText("Garden name")).toHaveValue("Back garden");
    expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}")).toMatchObject({
      selectedGardenId: personalGarden.id,
      gardens: [expect.objectContaining({ id: personalGarden.id, name: "Back garden" })],
    });
    await user.click(screen.getByRole("button", { name: "Back to gardens" }));
    expect(screen.getByRole("button", { name: "Open Back garden" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Demo garden" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Demo Garden" })).not.toBeInTheDocument();
  });

  it("opens Demo Garden from a compact reference action when a personal garden exists", async () => {
    const user = userEvent.setup();
    const workspace = createGardenWorkspace("Back garden");
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));

    render(<GardenWorkspace />);
    expect(screen.queryByRole("button", { name: "Open Demo Garden" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Demo garden" }));

    expect(screen.getByRole("heading", { name: "Garden Plan" })).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}")).toMatchObject({
      selectedGardenId: "demo-garden",
      gardens: expect.arrayContaining([
        expect.objectContaining({ id: workspace.gardens[0].id, name: "Back garden" }),
        expect.objectContaining({ id: "demo-garden", name: "Demo Garden" }),
      ]),
    }));
    await user.click(screen.getByRole("button", { name: "Back to gardens" }));
    expect(screen.getByRole("button", { name: "Open Back garden" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Demo Garden" })).not.toBeInTheDocument();
  });

  it("saves Demo Garden removal from a multi-garden PostgreSQL workspace", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const personalGarden = createGarden("Back garden");
    const serverWorkspace = { ...workspace, gardens: [...workspace.gardens, personalGarden] };
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => JSON.parse(String(init?.body ?? JSON.stringify({ workspaceId: "server-workspace", ...serverWorkspace }))),
    }));
    vi.stubGlobal("fetch", fetch);
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Demo garden" }));
    await user.click(screen.getByRole("button", { name: "Delete garden" }));
    await confirmDialog(user);

    await waitFor(() => expect(fetch.mock.calls).toContainEqual([
      expect.stringMatching(/\/workspaces\/server-workspace$/),
      expect.objectContaining({ method: "PUT" }),
    ]));
    const savedPayload = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body));
    expect(savedPayload.gardens).toEqual([expect.objectContaining({ id: personalGarden.id })]);
  });

  it("keeps Tasks open-only and advances repeating care after completion", async () => {
    const user = userEvent.setup();
    const firstRender = render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Load demo garden" }));
    await openCare(user);
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add task" }));
    const form = screen.getByRole("heading", { name: "Add care task" }).closest("form")!;
    await user.selectOptions(within(form).getByLabelText("Care type"), "fertilizing");
    fireEvent.change(within(form).getByLabelText("Due date"), { target: { value: "2026-09-02" } });
    await user.selectOptions(within(form).getByLabelText("Target"), "planting-area:demo-raised-bed");
    await user.type(within(form).getByLabelText("Repeat every whole days (optional)"), "3");
    await user.type(within(form).getByLabelText("Note (optional)"), "Feed tomatoes");
    await user.click(within(form).getByRole("button", { name: "Add care task" }));
    const taskItem = screen.getByText("Fertilizing").closest("li")!;
    expect(taskItem).toHaveTextContent("Due 2026-09-02 · Sample raised bed · Repeats every 3 days · Feed tomatoes");
    await user.click(within(taskItem).getByRole("button", { name: "Edit" }));
    const editForm = screen.getByRole("heading", { name: "Edit care task" }).closest("form")!;
    await user.clear(within(editForm).getByLabelText("Note (optional)"));
    await user.type(within(editForm).getByLabelText("Note (optional)"), "Feed the bed");
    await user.click(within(editForm).getByRole("button", { name: "Save care task" }));
    await user.click(within(screen.getByText("Fertilizing").closest("li")!).getByRole("button", { name: "Complete" }));
    const completionForm = screen.getByRole("heading", { name: "Complete fertilizing task" }).closest("form")!;
    fireEvent.change(within(completionForm).getByLabelText("Completion date"), { target: { value: "2026-09-04" } });
    await user.click(within(completionForm).getByRole("button", { name: "Complete task" }));
    expect(screen.queryByRole("heading", { name: "Completed" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Completed 2026-09-04 · Sample raised bed/)).not.toBeInTheDocument();
    expect(screen.getByText(/Due 2026-09-07 · Sample raised bed/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/2026-09-04 · Sample raised bed · Feed the bed/)).toBeInTheDocument();
    firstRender.unmount();
    render(<GardenWorkspace />);
    await openCare(user);
    expect(screen.getByText(/Due 2026-09-07 · Sample raised bed/)).toBeInTheDocument();
  });

  it("marks deleted task targets as former and lets gardeners remove them", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openCare(user);
    await user.click(screen.getByRole("button", { name: "Add task" }));
    const form = screen.getByRole("heading", { name: "Add care task" }).closest("form")!;
    fireEvent.change(within(form).getByLabelText("Due date"), { target: { value: "2026-09-02" } });
    await user.selectOptions(within(form).getByLabelText("Target"), "planting-area:demo-raised-bed");
    await user.click(within(form).getByRole("button", { name: "Add care task" }));
    await user.click(screen.getByRole("button", { name: "Back to gardens" }));
    await openPlantingArea(user, "Sample raised bed");
    await user.click(screen.getByRole("button", { name: "Delete area" }));
    await confirmDialog(user);
    await user.click(screen.getByRole("button", { name: "Back to gardens" }));
    await openCare(user);
    const taskItem = screen.getByText(/Former planting area: Sample raised bed/).closest("li")!;
    await user.click(within(taskItem).getByRole("button", { name: "Remove" }));
    expect(screen.queryByText(/Former planting area: Sample raised bed/)).not.toBeInTheDocument();
  });

  it("moves a one-time completed task into History", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openCare(user);
    await user.click(screen.getByRole("button", { name: "Add task" }));
    const form = screen.getByRole("heading", { name: "Add care task" }).closest("form")!;
    fireEvent.change(within(form).getByLabelText("Due date"), { target: { value: "2026-09-02" } });
    await user.type(within(form).getByLabelText("Note (optional)"), "Water containers");
    await user.click(within(form).getByRole("button", { name: "Add care task" }));
    const taskItem = screen.getByText("Watering").closest("li")!;
    await user.click(within(taskItem).getByRole("button", { name: "Complete" }));
    await user.click(screen.getByRole("button", { name: "Complete task" }));

    expect(screen.queryByText("Water containers")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/Water containers/)).toBeInTheDocument();
  });

  it("records, edits, deletes, and persists Care Log events", async () => {
    const user = userEvent.setup();
    const firstRender = render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Load demo garden" }));
    await openCare(user);
    await user.click(screen.getByRole("tab", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    const wateringForm = screen.getByRole("heading", { name: "Add care event" }).closest("form")!;
    fireEvent.change(within(wateringForm).getByLabelText("Date"), { target: { value: "2026-06-01" } });
    await user.click(within(wateringForm).getByRole("button", { name: "Add care event" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    const fertilizerForm = screen.getByRole("heading", { name: "Add care event" }).closest("form")!;
    await user.selectOptions(within(fertilizerForm).getByLabelText("Care type"), "fertilizing");
    fireEvent.change(within(fertilizerForm).getByLabelText("Date"), { target: { value: "2026-06-02" } });
    await user.selectOptions(within(fertilizerForm).getByLabelText("Target"), "planting-area:demo-raised-bed");
    await user.click(within(fertilizerForm).getByRole("button", { name: "Add care event" }));
    const fertilizerItem = screen.getByText("Fertilizing").closest("li")!;
    await user.click(within(fertilizerItem).getByRole("button", { name: "Correct record" }));
    const editForm = screen.getByRole("heading", { name: "Edit care event" }).closest("form")!;
    await user.type(within(editForm).getByLabelText("Fertilizer product (optional)"), "Kelp meal");
    await user.click(within(editForm).getByRole("button", { name: "Save care event" }));
    await user.click(screen.getByRole("button", { name: "Back to gardens" }));
    await openCare(user);
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByRole("list")).toHaveTextContent("Sample raised bed");
    firstRender.unmount();
    render(<GardenWorkspace />);
    await openCare(user);
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/Kelp meal/)).toBeInTheDocument();
    await user.click(within(screen.getByText("Fertilizing").closest("li")!).getByRole("button", { name: "Delete record" }));
    expect(screen.queryByText(/Kelp meal/)).not.toBeInTheDocument();
  });

  it("keeps targeted care history with its former planting-area name", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openCare(user);
    await user.click(screen.getByRole("tab", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "Add care event" }));
    const form = screen.getByRole("heading", { name: "Add care event" }).closest("form")!;
    fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-06-04" } });
    await user.selectOptions(within(form).getByLabelText("Target"), "planting-area:demo-raised-bed");
    await user.click(within(form).getByRole("button", { name: "Add care event" }));
    await user.click(screen.getByRole("button", { name: "Back to gardens" }));
    await openPlantingArea(user, "Sample raised bed");
    await user.click(screen.getByRole("button", { name: "Delete area" }));
    await confirmDialog(user);
    await user.click(screen.getByRole("button", { name: "Back to gardens" }));
    await openCare(user);
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/2026-06-04 · Former planting area: Sample raised bed/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}").gardens[0].careEvents[0]).toMatchObject({ growingAreaName: "Sample raised bed", targetAreaDeleted: true });
  });

  it("keeps the dashboard compact and opens a planting area from Garden Plan", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    expect(screen.getByRole("button", { name: "Add garden" })).toBeInTheDocument();
    await openSelectedGarden();
    expect(screen.queryByText("Garden properties")).not.toBeInTheDocument();
    expect(screen.getByText("Planting areas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Sample raised bed/i }));
    expect(screen.getByRole("heading", { name: "Edit planting area" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    expect(screen.getByRole("heading", { name: "Edit planting area" })).toBeInTheDocument();
  });

  it("saves the garden name with its Garden Plan properties", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openSelectedGarden();

    fireEvent.change(screen.getByLabelText("Garden name"), { target: { value: "Kitchen garden" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}").gardens[0].name).toBe("Kitchen garden"));
  });

  it("shows save actions only after an existing garden or planting area changes", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openSelectedGarden();

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Garden name"));
    await user.type(screen.getByLabelText("Garden name"), "Kitchen garden");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    expect(areaInspectorForm().queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Rotation (degrees)"));
    await user.type(screen.getByLabelText("Rotation (degrees)"), "45");
    expect(areaInspectorForm().getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("focuses Garden Plan beds without changing the canvas frame and persists a selected plant color", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openSelectedGarden();
    expect(screen.getByRole("button", { name: "Focus beds" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Tomato")).toBeInTheDocument();
    const areaLabel = screen.getByTestId("area-label-demo-raised-bed");
    expect(areaLabel).toHaveAttribute("align", "center");
    expect(Number(areaLabel.getAttribute("y"))).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Full garden" }));
    expect(screen.getByRole("button", { name: "Full garden" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    fireEvent.click(screen.getByLabelText("Tomato plant"));
    fireEvent.change(screen.getByLabelText("Plant color"), { target: { value: "#1f77b4" } });
    await user.click(screen.getByRole("button", { name: "Save plant" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}").gardens[0].growingAreas[0].layout.allocations[0].color).toBe("#1f77b4"));
  });

  it("saves planting-area rotation with its other properties", async () => {
    const user = userEvent.setup();
    await loadDemo(user);
    await openPlantingArea(user, "Sample raised bed");
    const rotation = screen.getByLabelText("Rotation (degrees)");
    await user.clear(rotation);
    await user.type(rotation, "450");
    await user.click(areaInspectorForm().getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY) ?? "{}").gardens[0].growingAreas[0].planPlacement.rotationDegrees).toBe(90));
  });

  it("saves next-season choices separately from current plant records and shows pairing notes", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    workspace.gardens[0].plantings[0].plantingDate = "2024-05-18";
    window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("rotation-guidance")) {
        const request = JSON.parse(String(init?.body));
        const selectedNightshade = request.cropFamily === "nightshade";
        return {
          ok: true,
          json: async () => ({
            growingAreaId: request.growingAreaId,
            growingAreaKind: "raised-bed",
            season: 2026,
            history: [{ plantingId: "demo-planting-tomatoes", commonName: "Tomatoes", cropFamily: "nightshade", plantingDate: "2024-05-18", season: 2024 }],
            warning: selectedNightshade ? { cropFamily: "nightshade", plantings: [] } : null,
            automatedWarningSupported: true,
            hasAutomaticCompatibilityConclusion: selectedNightshade,
            rotationFriendlyCropFamilies: ["brassica", "cucurbit", "legume", "allium", "root", "leafy"],
          }),
        };
      }
      return { ok: true, json: async () => ({ workspaceId: "server-workspace", ...workspace }) };
    }));

    render(<GardenWorkspace />);
    await screen.findByRole("button", { name: "Next season plan" });
    await user.click(screen.getByRole("button", { name: "Next season plan" }));
    await screen.findByRole("heading", { name: "Next season planner" });
    expect(screen.getByRole("button", { name: "Planting areas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Full garden" }));
    expect(screen.getByRole("button", { name: "Full garden" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const raisedBed = screen.getByRole("heading", { name: "Sample raised bed" }).closest("article")!;
    expect(within(raisedBed).getByText("Last season")).toBeInTheDocument();
    expect(within(raisedBed).getByText("Avoid if possible")).toBeInTheDocument();
    expect(within(raisedBed).getByText("Good rotation fit")).toBeInTheDocument();
    await user.click(within(raisedBed).getByRole("button", { name: "Choose a plant" }));
    await user.type(within(raisedBed).getByLabelText("Plant type"), "Tomato");
    expect(within(raisedBed).getByText(/Crop family:/)).toHaveTextContent("Nightshade");
    expect(within(raisedBed).getByText(/automatic/)).toBeInTheDocument();
    await user.click(within(raisedBed).getByRole("button", { name: `Add to ${new Date().getFullYear() + 1} plan` }));

    const updatedRaisedBed = screen.getByRole("heading", { name: "Sample raised bed" }).closest("article")!;
    expect(within(updatedRaisedBed).getByText(`${new Date().getFullYear() + 1} plan`)).toBeInTheDocument();
    expect(within(updatedRaisedBed).getByText("Tomato")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: `${new Date().getFullYear() + 1} plan preview for Demo Garden`,
      }),
    ).toBeInTheDocument();
    const areaLabel = screen.getByTestId("season-area-label-demo-raised-bed");
    expect(Number(areaLabel.getAttribute("y"))).toBeLessThan(1);
    expect(screen.queryByRole("heading", { name: "Add plant" })).not.toBeInTheDocument();
    await user.click(within(updatedRaisedBed).getByRole("button", { name: "Choose a plant" }));
    await user.type(within(updatedRaisedBed).getByLabelText("Plant type"), "Basil");
    await user.click(within(updatedRaisedBed).getByRole("button", { name: `Add to ${new Date().getFullYear() + 1} plan` }));

    const pairedRaisedBed = (await screen.findByRole("heading", { name: "Sample raised bed" })).closest("article")!;
    expect(within(pairedRaisedBed).getByText(/Tomato \+ basil/)).toBeInTheDocument();
  });

  it("uses current layout plants as last-season history without waiting for a server request", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      GARDEN_WORKSPACE_STORAGE_KEY,
      JSON.stringify(createDemoGardenWorkspace()),
    );

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Next season plan" }));

    const raisedBed = screen.getByRole("heading", { name: "Sample raised bed" }).closest("article")!;
    expect(within(raisedBed).getByText("Tomato · Sun Gold")).toBeInTheDocument();
    expect(within(raisedBed).getByText("Nightshade (tomato, pepper, eggplant)")).toBeInTheDocument();
  });

  it("collapses repeated historical aliases into clear last-season labels", async () => {
    const user = userEvent.setup();
    const workspace = createDemoGardenWorkspace();
    const garden = workspace.gardens[0];
    const tomato = garden.plantings[0];
    garden.plantings = [
      tomato,
      { ...tomato, id: "old-sungold", commonName: "sungold", plantType: "sungold", variety: undefined },
      { ...tomato, id: "old-sungold-tomato", commonName: "sungoldtomato", plantType: "sungoldtomato", variety: undefined },
      { ...tomato, id: "old-basil", commonName: "九层塔", plantType: "九层塔", variety: undefined, cropFamily: "other" },
    ];
    window.localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));

    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Next season plan" }));

    const raisedBed = screen.getByRole("heading", { name: "Sample raised bed" }).closest("article")!;
    expect(within(raisedBed).getByText("Tomato · Sun Gold · Basil")).toBeInTheDocument();
    expect(within(raisedBed).queryByText(/sungoldtomato/i)).not.toBeInTheDocument();
  });

  it("supports direct plant selection, editing, duplication, and canvas removal in the layout editor", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GrowingAreaLayoutEditor area={{ id: "area-1", name: "North bed", kind: "raised-bed", planPlacement: { x: 0.5, y: 0.5, rotationDegrees: 0 }, layout: { widthMeters: 2, depthMeters: 1, boundary: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }], allocations: [{ id: "plant-1", label: "Tomato", x: 1, y: 0.5, diameterMeters: 0.6 }] } }} onArchivePlantingRecord={vi.fn()} onChange={onChange} onSaveArea={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Tomato plant"));
    await user.click(screen.getByRole("button", { name: "Duplicate plant" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ allocations: expect.arrayContaining([expect.objectContaining({ id: "plant-1" }), expect.objectContaining({ label: "Tomato", x: 1.6, y: 0.5 })]) }));
    fireEvent.click(screen.getByLabelText("Tomato plant"));
    await user.click(screen.getByLabelText("Remove Tomato"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ allocations: [] }));
  });

  it("adds a duplicate from the plant form for batch placement", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GrowingAreaLayoutEditor area={{ id: "area-1", name: "North bed", kind: "raised-bed", planPlacement: { x: 0.5, y: 0.5, rotationDegrees: 0 }, layout: { widthMeters: 2, depthMeters: 1, boundary: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }], allocations: [] } }} onArchivePlantingRecord={vi.fn()} onChange={onChange} onSaveArea={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add plant" }));
    const form = screen.getByRole("heading", { name: "Add plant" }).closest("form")!;
    await user.type(within(form).getByLabelText("Plant type"), "Basil");
    await user.click(within(form).getByRole("button", { name: "Add & duplicate" }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      allocations: [
        expect.objectContaining({ label: "Basil" }),
        expect.objectContaining({ label: "Basil" }),
      ],
    }));
  });
});
