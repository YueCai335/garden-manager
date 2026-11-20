import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GardenWorkspace, SERVER_WORKSPACE_STORAGE_KEY } from "@/test/WorkspaceHarness";
import { resetTestRouter } from "@/test/router";
import { createDemoGardenWorkspace, GARDEN_WORKSPACE_STORAGE_KEY, todayDate } from "@/lib/gardenWorkspace";

function localRoute(path: string) {
  localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(createDemoGardenWorkspace()));
  resetTestRouter(path);
  render(<GardenWorkspace />);
}
function serverRoute(path: string, failQuestion = false) {
  const workspace = createDemoGardenWorkspace();
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/runtime-config")) return { ok: true, json: async () => ({ portfolioDemo: false }) };
    if (url.includes("/plant-knowledge")) return { ok: !failQuestion, json: async () => ({ detail: "Plant Guide could not complete this request. Your input is kept. Try again later." }) };
    if (url.includes("/ai/plant-health-assessment")) return { ok: true, json: async () => ({ summary: "Keep observing.", possibleIssues: [], nextSteps: [], followUpQuestions: [], confidence: "low" }) };
    return { ok: true, json: async () => ({ ...workspace, ...JSON.parse(String(init?.body ?? "{}")), workspaceId: "forms", revision: 0 }) };
  });
  vi.stubGlobal("fetch", fetch);
  localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "forms");
  resetTestRouter(path);
  render(<GardenWorkspace />);
  return fetch;
}
const saved = () => JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!);

describe("local form validation", () => {
  it("rejects a whitespace garden name without leaving onboarding", async () => {
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    fireEvent.change(await screen.findByLabelText("Garden name"), { target: { value: "   " } });
    await user.click(screen.getByRole("button", { name: "Create garden" }));
    expect(screen.getByLabelText("Garden name")).toHaveFocus();
    expect(screen.getByLabelText("Garden name")).toHaveAttribute("aria-invalid", "true");
    expect(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)).toBeNull();
  });

  it("reports invalid garden name and dimensions together and keeps the original workspace", async () => {
    localRoute("/gardens/demo-garden/plan");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Garden" }));
    fireEvent.change(await screen.findByLabelText("Garden name"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Garden width (m)"), { target: { value: "-1" } });
    fireEvent.keyDown(screen.getByLabelText("Garden width (m)"), { key: "Enter" });
    expect(screen.getByLabelText("Garden name")).toHaveFocus();
    expect(screen.getByLabelText("Garden width (m)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Garden name")).toHaveValue("   ");
    expect(saved().gardens[0].name).toBe("Demo Garden");
  });

  it("validates task date and whole-day interval without clearing the note", async () => {
    localRoute("/care?location=demo-garden");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add task" }));
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Repeat every whole days (optional)"), { target: { value: "1.5" } });
    await user.type(screen.getByLabelText("Note (optional)"), "Keep this note");
    await user.click(screen.getByRole("button", { name: "Add care task" }));
    expect(screen.getByLabelText("Due date")).toHaveFocus();
    expect(screen.getByLabelText("Repeat every whole days (optional)")).toHaveAccessibleDescription("Enter a whole number.");
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("Keep this note");
  });

  it("rejects zero fertilizer amount and accepts a positive amount smaller than 0.01", async () => {
    localRoute("/care?view=history&location=demo-garden");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add record" }));
    await user.click(screen.getByRole("radio", { name: "Fertilizing" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: todayDate() } });
    fireEvent.change(screen.getByLabelText("Fertilizer amount (optional)"), { target: { value: "0" } });
    fireEvent.submit(screen.getByLabelText("Fertilizer amount (optional)").closest("form")!);
    expect(screen.getByLabelText("Fertilizer amount (optional)")).toHaveAccessibleDescription("Enter a fertilizer amount greater than zero.");
    expect(screen.getByLabelText("Fertilizer amount (optional)")).toHaveFocus();
    await user.click(screen.getByRole("radio", { name: "Watering" }));
    expect(screen.queryByLabelText("Fertilizer amount (optional)")).not.toBeInTheDocument();
    expect(screen.queryByText("Check the highlighted fields before continuing.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Fertilizing" }));
    fireEvent.change(screen.getByLabelText("Fertilizer amount (optional)"), { target: { value: "0.001" } });
    fireEvent.submit(screen.getByLabelText("Fertilizer amount (optional)").closest("form")!);
    expect(saved().gardens[0].careEvents.at(-1).fertilizerAmount).toBe(0.001);
  });

  it("keeps a blank season choice open without adding a plan", async () => {
    localRoute("/season");
    const user = userEvent.setup();
    const area = await screen.findByRole("group", { name: "Sample raised bed" });
    await user.click(within(area).getByRole("button", { name: "Choose a plant for Sample raised bed" }));
    await user.click(within(area).getByRole("button", { name: /Add to .* plan/ }));
    expect(within(area).getByLabelText("Plant type")).toHaveFocus();
    expect(within(area).getByLabelText("Plant type")).toHaveAttribute("aria-invalid", "true");
    expect(saved().gardens[0].seasonPlans ?? []).toEqual([]);
  });

  it("validates Add and duplicate through the same plant form", async () => {
    localRoute("/gardens/demo-garden/plan?level=plants");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Edit Sample raised bed" }));
    await user.click(await screen.findByRole("button", { name: "Add plant" }));
    fireEvent.change(screen.getByLabelText("Plant spacing (m)"), { target: { value: "0" } });
    const count = saved().gardens[0].growingAreas[0].layout.allocations.length;
    await user.click(screen.getByRole("button", { name: "Add & duplicate" }));
    expect(screen.getByLabelText("Plant type")).toHaveFocus();
    expect(screen.getByLabelText("Plant spacing (m)")).toHaveAttribute("aria-invalid", "true");
    expect(saved().gardens[0].growingAreas[0].layout.allocations).toHaveLength(count);
  });

  it("does not call note generation for whitespace-only text", async () => {
    const fetch = serverRoute("/notes");
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Garden", { selector: "select" }), "demo-garden");
    fireEvent.change(screen.getByLabelText("Care note"), { target: { value: "   " } });
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(screen.getByLabelText("Care note")).toHaveFocus();
    expect(screen.getByLabelText("Care note")).toHaveAttribute("aria-invalid", "true");
    expect(fetch.mock.calls.filter(([url]) => url.includes("/ai/care-note-draft"))).toHaveLength(0);
  });

  it("shows Plant Guide request failures inside the form and retains its question", async () => {
    serverRoute("/guide", true);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Question"), "Why are leaves yellow?");
    await user.click(screen.getByRole("button", { name: "Ask Plant Guide" }));
    const error = await screen.findByText("Plant Guide could not complete this request. Your input is kept. Try again later.");
    expect(error.closest("form")).toBe(screen.getByLabelText("Question").closest("form"));
    expect(screen.getByLabelText("Question")).toHaveValue("Why are leaves yellow?");
  });

  it("validates health observations again before saving an already generated assessment", async () => {
    const fetch = serverRoute("/doctor?garden=demo-garden");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("What do you observe?"), "Leaves look yellow");
    await user.click(screen.getByRole("button", { name: "Create AI assessment" }));
    await screen.findByRole("heading", { name: "Review assessment" });
    fireEvent.change(screen.getByLabelText("Observed on"), { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Save health record" }));
    expect(screen.getByLabelText("Observed on")).toHaveFocus();
    expect(screen.getByLabelText("Observed on")).toHaveAccessibleDescription("Enter a valid observation date.");
    expect(screen.getByLabelText("What do you observe?")).toHaveValue("Leaves look yellow");
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
  });
});
