import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GardenWorkspace, SERVER_WORKSPACE_STORAGE_KEY } from "@/test/WorkspaceHarness";
import { createDemoGardenWorkspace, createGarden, todayDate } from "@/lib/gardenWorkspace";

function seed(config: { portfolioDemo: boolean; careNotePublicAvailable?: boolean } | null = { portfolioDemo: false }) {
  const workspace = createDemoGardenWorkspace();
  const demo = workspace.gardens[0];
  workspace.gardens = [{ ...demo, id: "front", name: "Front garden" }, createGarden("Back garden"), demo];
  workspace.selectedGardenId = "front";
  localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "home-test");
  const fetch = vi.fn(async (url: string) => {
    if (url.includes("/runtime-config")) {
      if (!config) throw new Error("Offline");
      return new Response(JSON.stringify(config));
    }
    if (url.includes("/ai/")) throw new Error("Unexpected AI request");
    return new Response(JSON.stringify({ ...workspace, workspaceId: "home-test", revision: 1 }));
  });
  vi.stubGlobal("fetch", fetch);
  return { calls: () => fetch.mock.calls.filter(([url]) => url.includes("/ai/")), workspace };
}

describe("overview garden gallery and note entry", () => {
  it("summarizes current crops and unmeasured areas without showing historical or planned crops", async () => {
    const { workspace } = seed();
    const garden = workspace.gardens[0];
    const plant = garden.plantings[0];
    garden.plantings = [
      { ...plant, commonName: "Kale", plantType: "Kale", variety: undefined, isActive: true },
      { ...plant, id: "old-peas", commonName: "Peas", plantType: "Peas", variety: undefined, isActive: false },
    ];
    garden.growingAreas.push({ ...garden.growingAreas[0], id: "unmeasured", name: "New bed", layout: undefined });
    const future = { id: "plan-2027", seasonYear: 2027, plantings: [{ ...plant, id: "future-beans", commonName: "Beans", plantType: "Beans" }] };
    garden.seasonPlans = [future];
    render(<GardenWorkspace />);
    const gallery = await screen.findByRole("region", { name: /Your gardens/ });
    const front = within(gallery).getByRole("link", { name: "Open Front garden" });
    expect(front).toHaveAccessibleDescription(expect.stringContaining("1 needs a size"));
    expect(front).toHaveAccessibleDescription(expect.stringContaining("Growing now: Kale"));
    expect(front).not.toHaveTextContent(/Peas|Beans/);
    expect(within(gallery).getByRole("link", { name: "Open Back garden" })).toHaveAccessibleDescription(expect.stringContaining("No current plantings"));
    expect(within(gallery).getAllByRole("link", { name: /^Open / })).toHaveLength(2);
  });

  it("ticks a task off in Care to do, keeps it struck through, and unticks it (ADR-0073)", async () => {
    const { workspace } = seed();
    workspace.careTasks = [];
    workspace.gardens.forEach((garden) => { garden.careTasks = []; });
    workspace.gardens[0].careTasks = [{ id: "water-front", type: "watering", dueDate: todayDate(), targetScope: "garden", note: "" }];
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    const box = await screen.findByRole("region", { name: "Care to do" });
    const tick = within(box).getByRole("checkbox", { name: "Water Front garden" });
    expect(tick).not.toBeChecked();
    expect(within(box).getByText("0 of 1 done")).toBeVisible();
    await user.click(tick);
    expect(within(box).getByRole("checkbox", { name: "Water Front garden" })).toBeChecked();
    expect(within(box).getByText("All done")).toBeVisible();
    await user.click(within(box).getByRole("checkbox", { name: "Water Front garden" }));
    expect(within(box).getByRole("checkbox", { name: "Water Front garden" })).not.toBeChecked();
    expect(within(box).getByText("0 of 1 done")).toBeVisible();
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
