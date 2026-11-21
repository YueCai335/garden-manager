import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GardenWorkspace, SERVER_WORKSPACE_STORAGE_KEY } from "@/test/WorkspaceHarness";
import { addDays, createDemoGardenWorkspace, createGarden, todayDate, type CareTask, type GardenWorkspace as Workspace, type PlantAllocation } from "@/lib/gardenWorkspace";
import { gardenPlants } from "@/lib/homeGardens";

type Config = { portfolioDemo: boolean; careNotePublicAvailable?: boolean; careNoteBatchAvailable?: boolean };

function seed(config: Config | null = { portfolioDemo: false }) {
  const workspace = createDemoGardenWorkspace();
  const demo = workspace.gardens[0];
  workspace.gardens = [{ ...demo, id: "front", name: "Front garden" }, createGarden("Back garden"), demo];
  workspace.selectedGardenId = "front";
  localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "home-test");
  const writes: Workspace[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/runtime-config")) {
      if (!config) throw new Error("Offline");
      return new Response(JSON.stringify(config));
    }
    if (url.includes("/ai/")) throw new Error("Unexpected AI request");
    if (init?.method === "PUT") {
      writes.push(JSON.parse(String(init.body)));
      return Response.json({ ...JSON.parse(String(init.body)), workspaceId: "home-test", revision: writes.length + 1 });
    }
    return new Response(JSON.stringify({ ...workspace, workspaceId: "home-test", revision: 1 }));
  });
  vi.stubGlobal("fetch", fetch);
  return { calls: () => fetch.mock.calls.filter(([url]) => url.includes("/ai/")), workspace, writes };
}

const plant = (label: string, x: number): PlantAllocation => ({ id: `plant-${label}`, label, plantType: label, x, y: 0.3, diameterMeters: 0.3 });
const task = (id: string, dueDate: string, extra: Partial<CareTask> = {}): CareTask => ({ id, type: "watering", dueDate, targetScope: "garden", note: "", ...extra });
/** jsdom reports inline colours as rgb(). */
const rgb = (hex: string) => `rgb(${hex.slice(1).match(/../g)!.map((pair) => parseInt(pair, 16)).join(", ")})`;

function clearCare(workspace: Workspace) {
  workspace.careTasks = []; workspace.careEvents = [];
  workspace.gardens.forEach((garden) => { garden.careTasks = []; garden.careEvents = []; });
}

describe("Gardens home (ADR-0081)", () => {
  it("stages the gardens on the band with totals, plan-coloured plant types, and New garden last", async () => {
    const { workspace } = seed();
    const garden = workspace.gardens[0];
    const [bed, ...others] = garden.growingAreas;
    garden.growingAreas = [{ ...bed, layout: { ...bed.layout!, allocations: [plant("Kale", 0.3), plant("Pepper", 0.6), plant("Lettuce", 0.9), plant("Basil", 1.2)] } }, ...others,
      { ...bed, id: "unmeasured", name: "New bed", layout: undefined }];
    // Past and planned crops are not on the plan, so they are not counted.
    const record = garden.plantings[0];
    garden.plantings = [{ ...record, id: "old-peas", commonName: "Peas", plantType: "Peas", isActive: false }];
    garden.seasonPlans = [{ id: "plan-2027", seasonYear: 2027, plantings: [{ ...record, id: "future-beans", commonName: "Beans", plantType: "Beans" }] }];
    render(<GardenWorkspace />);
    const gallery = await screen.findByRole("region", { name: "Your gardens" });
    expect(within(gallery).getByRole("heading", { level: 2, name: "Your gardens" })).toBeVisible();
    expect(within(gallery).getByText("2 gardens · 4 planting areas · 4 plants growing")).toBeVisible();
    expect(within(gallery).getByText(new Date(`${todayDate()}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }))).toBeVisible();

    const front = within(gallery).getByRole("link", { name: "Open Front garden" });
    expect(front).toHaveAccessibleDescription(expect.stringContaining("4 planting areas · 4 plants · 1 needs a size"));
    expect(front).not.toHaveTextContent(/Peas|Beans/);
    const shown = gardenPlants(garden).slice(0, 3);
    const dots = front.querySelectorAll<HTMLElement>("[data-plant-swatch]");
    expect([...dots].map((dot) => dot.parentElement!.textContent)).toEqual(shown.map(({ name }) => name));
    expect([...dots].map((dot) => [dot.style.backgroundColor, dot.style.borderColor])).toEqual(shown.map(({ colors }) => [rgb(colors.fill), rgb(colors.stroke)]));
    expect(front).toHaveTextContent("+1 more");

    const back = within(gallery).getByRole("link", { name: "Open Back garden" });
    expect(back).toHaveAccessibleDescription("Nothing planted yet");
    expect(back).toHaveTextContent("No planting areas yet");
    // The demo garden steps aside once the user has gardens of their own; the band offers it instead.
    expect(within(gallery).getAllByRole("link", { name: /^Open / })).toHaveLength(2);
    expect(within(gallery).getByRole("button", { name: "Demo garden" })).toBeVisible();
    const links = within(gallery).getAllByRole("link");
    expect(links.at(-1)).toBe(within(gallery).getByRole("link", { name: "New garden" }));
    expect(links.at(-1)).toHaveAttribute("href", "/gardens/new");
    expect(links.at(-1)).toHaveAccessibleDescription("Draw the outline, then add planting areas");
    expect(screen.queryByRole("link", { name: "Add garden" })).not.toBeInTheDocument();
  });

  it("ticks a task off in Care today, writes one history record, keeps focus, and unticks it", async () => {
    const { workspace, writes } = seed();
    clearCare(workspace);
    workspace.gardens[0].careTasks = [task("water-front", todayDate())];
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    const box = await screen.findByRole("region", { name: "Care today" });
    const front = screen.getByRole("link", { name: "Open Front garden" });
    const name = "Water Front garden, Whole garden";
    expect(within(box).getByRole("heading", { level: 2, name: "1 thing left" })).toBeVisible();
    expect(within(box).getByText("0 of 1 done")).toBeVisible();
    expect(front).toHaveTextContent("1 to do today");

    await user.click(within(box).getByRole("checkbox", { name }));
    const ticked = within(box).getByRole("checkbox", { name });
    expect(ticked).toBeChecked();
    expect(ticked).toHaveFocus();
    expect(within(box).getByRole("heading", { level: 2, name: "All done for today" })).toBeVisible();
    expect(within(box).getByText("1 of 1 done")).toBeVisible();
    expect(front).toHaveTextContent("All done today");
    await waitFor(() => expect(writes.at(-1)?.gardens[0].careEvents).toHaveLength(1));
    expect(writes.at(-1)!.gardens[0].careEvents[0]).toMatchObject({ type: "watering", date: todayDate(), targetScope: "garden" });
    expect(writes.at(-1)!.gardens[0].careTasks).toEqual([]);

    await user.click(ticked);
    const open = within(box).getByRole("checkbox", { name });
    expect(open).not.toBeChecked();
    expect(open).toHaveFocus();
    expect(within(box).getByText("0 of 1 done")).toBeVisible();
    expect(front).toHaveTextContent("1 to do today");
    await waitFor(() => expect(writes.at(-1)?.gardens[0].careEvents).toHaveLength(0));
  });

  it("lists only today's care, shows how late a task is, and sends the rest to Care", async () => {
    const { workspace } = seed();
    clearCare(workspace);
    const today = todayDate();
    workspace.careTasks = [task("all-late", addDays(today, -1), { targetScope: "all-gardens" }), task("all-tomorrow", addDays(today, 1), { targetScope: "all-gardens", type: "fertilizing" })];
    workspace.gardens[0].careTasks = Array.from({ length: 7 }, (_, index) => task(`front-${index}`, today));
    render(<GardenWorkspace />);
    const box = await screen.findByRole("region", { name: "Care today" });
    expect(within(box).getByRole("heading", { level: 2, name: "8 things left" })).toBeVisible();
    expect(within(box).getAllByRole("checkbox")).toHaveLength(6);
    expect(within(box).getAllByRole("checkbox")[0]).toHaveAccessibleName("Water all gardens");
    expect(within(box).getAllByText("Due yesterday")[0]).toBeVisible();
    expect(within(box).queryByText(/Fertilize|Tomorrow|Coming up/)).not.toBeInTheDocument();
    expect(within(box).getByRole("link", { name: "+2 more in Care" })).toHaveAttribute("href", "/care?view=tasks");
    expect(within(box).getByRole("link", { name: "Open Care" })).toHaveAttribute("href", "/care?view=tasks");
    // Workspace-wide care belongs to no garden card.
    expect(screen.getByRole("link", { name: "Open Front garden" })).toHaveTextContent("7 to do today");
    expect(screen.getByRole("link", { name: "Open Back garden" })).not.toHaveTextContent(/to do today|All done today/);
  });

  it.each([
    ["no care at all", [] as CareTask[], "Add a care task"],
    ["only later care", [task("later", addDays(todayDate(), 2))], "Open Care"],
  ])("says nothing is due today with %s", async (_label, tasks, link) => {
    const { workspace } = seed();
    clearCare(workspace);
    workspace.gardens[0].careTasks = tasks;
    render(<GardenWorkspace />);
    const box = await screen.findByRole("region", { name: "Care today" });
    expect(within(box).getByRole("heading", { level: 2, name: "Nothing due today" })).toBeVisible();
    expect(within(box).getByText("No watering or fertilizing is due today.")).toBeVisible();
    expect(within(box).queryByText(/of \d+ done/)).not.toBeInTheDocument();
    expect(within(box).getByRole("link", { name: link })).toHaveAttribute("href", "/care?view=tasks");
  });

  it("writes on the ruled paper and enables Split into records only for a note within the limit", async () => {
    seed({ portfolioDemo: false, careNoteBatchAvailable: true });
    render(<GardenWorkspace />);
    const block = await screen.findByRole("region", { name: "AI Garden Notes" });
    const paper = within(block).getByRole("textbox", { name: "Quick garden note" });
    const generate = await within(block).findByRole("button", { name: "Split into records" });
    expect(generate).toBeDisabled();
    expect(generate).toHaveAttribute("aria-haspopup", "dialog");
    // ADR-0085: the header's "+ Note" is the one way to open an empty note.
    expect(within(block).queryByRole("button", { name: "Open note editor" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
    fireEvent.change(paper, { target: { value: "Watered the front beds" } });
    expect(generate).toBeEnabled();
    fireEvent.change(paper, { target: { value: "🌱".repeat(501) } });
    expect(generate).toBeDisabled();
    expect(paper).toHaveAccessibleDescription("Shorten your note to 500 characters or fewer.");
  });

  it("opens the note dialog without navigating and restores focus and text after Escape", async () => {
    const api = seed();
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await screen.findByRole("link", { name: "Open Front garden" });
    expect(screen.queryByRole("textbox", { name: "Care note" })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Open note editor" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Garden Note" });
    expect(location.pathname).toBe("/gardens");
    expect(within(dialog).getByRole("heading", { name: "Garden Note" })).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Open Front garden" })).not.toBeInTheDocument();
    const note = await screen.findByLabelText("Care note");
    fireEvent.change(note, { target: { value: "Watered today" } });
    expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Garden", { selector: "select" }), "front");
    fireEvent.change(note, { target: { value: "🌱".repeat(501) } });
    expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
    fireEvent.change(note, { target: { value: "🌱".repeat(500) } });
    expect(screen.getByRole("button", { name: "Create draft" })).toBeEnabled();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog", { name: "Garden Note" })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Continue note" }));
    expect(await screen.findByLabelText("Care note")).toHaveValue("🌱".repeat(500));
    expect(api.calls()).toHaveLength(0);
  });

  it("keeps portfolio demo drafting restrictions on the note screen", async () => {
    const api = seed({ portfolioDemo: true, careNotePublicAvailable: false });
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Open note editor" }));
    expect(await screen.findByRole("heading", { name: "AI Garden Note runs in the local app" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create draft" })).not.toBeInTheDocument();
    expect(api.calls()).toHaveLength(0);
  });

  it("saves a manually reviewed single record on the homepage when batch drafting is unavailable", async () => {
    const { workspace } = seed();
    const writes: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/runtime-config")) return Response.json({ portfolioDemo: false });
      if (url.includes("/ai/")) throw new Error("Unexpected AI request");
      if (init?.method === "PUT") {
        writes.push(String(init.body));
        return Response.json({ ...JSON.parse(String(init.body)), workspaceId: "home-test", revision: 2 });
      }
      return Response.json({ ...workspace, workspaceId: "home-test", revision: 1 });
    }));
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Open note editor" }));
    const dialog = within(screen.getByRole("dialog", { name: "Garden Note" }));
    await user.selectOptions(await dialog.findByLabelText("Garden", { selector: "select" }), "front");
    await user.type(dialog.getByLabelText("Care note"), "Watered today");
    await user.click(dialog.getByRole("button", { name: "Fill in the record manually" }));
    await user.selectOptions(dialog.getByLabelText("Care type"), "watering");
    fireEvent.change(dialog.getByLabelText("Date"), { target: { value: todayDate() } });
    await user.selectOptions(dialog.getByLabelText("Target"), "garden");
    await user.click(dialog.getByRole("button", { name: "Save to Care History" }));
    expect(await dialog.findByRole("heading", { name: "Saved 1 record" })).toBeVisible();
    expect(location.pathname).toBe("/gardens");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]).gardens[0].careEvents.at(-1)).toMatchObject({ note: "Watered today", targetScope: "garden" });
    await user.click(dialog.getByRole("button", { name: "Done and close" }));
    expect(screen.queryByRole("dialog", { name: "Garden Note" })).not.toBeInTheDocument();
  });

  it("retains editable text when note settings fail and offers manual care", async () => {
    const api = seed(null);
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Open note editor" }));
    const note = await screen.findByLabelText("What did you do in your gardens?");
    fireEvent.change(note, { target: { value: "Keep this note" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Review draft" })).toBeDisabled());
    expect(screen.getByRole("link", { name: "Add manually" })).toHaveAttribute("href", "/care?view=history");
    expect(note).toHaveValue("Keep this note");
    expect(api.calls()).toHaveLength(0);
  });
});
