import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GardenWorkspace, SERVER_WORKSPACE_STORAGE_KEY } from "@/test/WorkspaceHarness";
import { careFixture } from "@/test/careFixture";
import { resetTestRouter, testRouter } from "@/test/router";
import type { CareNoteBatchDraftResponse, ServerWorkspace } from "@/lib/gardenWorkspaceApi";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const extraction: CareNoteBatchDraftResponse = { drafts: ["front", "back"].map((gardenId) => ({ gardenId, sourceText: `Watered ${gardenId} today`, type: "watering", date: "2026-11-11", targetScope: "garden", growingAreaId: null, plantingRecordId: null, fertilizerProduct: null, fertilizerAmount: null, fertilizerUnit: null, reviewNotes: [] })), notices: [] };
function seed() {
  let server: ServerWorkspace = { ...careFixture(), workspaceId: "batch", revision: 0 };
  const control = { fail: false, draftFail: false, conflict: false, lostResponse: false, holdDraft: false, finish: (_result = extraction) => {} };
  const puts: ServerWorkspace[] = [];
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("runtime-config")) return response({ portfolioDemo: false, careNoteBatchAvailable: true });
    if (url.endsWith("/care-note-drafts")) {
      requests.push(String(init?.body));
      if (control.draftFail) return response({ detail: "private provider failure" }, 503);
      if (control.holdDraft) return new Promise<Response>((resolve) => { control.finish = (result) => resolve(response(result)); });
      return response(extraction);
    }
    if (init?.method === "PUT") {
      const sent = JSON.parse(String(init.body));
      puts.push(sent);
      if (control.conflict) return response({ detail: { currentRevision: 1 } }, 409);
      if (control.fail) throw new Error("Offline");
      server = { ...sent, revision: server.revision + 1 };
      if (control.lostResponse) throw new Error("Response lost after saving");
    }
    return response(server);
  }));
  localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "batch");
  resetTestRouter("/gardens");
  return { control, puts, requests, remote: () => server };
}
// Before sync finishes, the primary button reads "Open note editor" and then becomes "Generate draft".
// Wait for the synced state so the click reaches the dedicated editor button.
async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("button", { name: "Generate draft" });
  await user.click(screen.getByRole("button", { name: "Open note editor" }));
}
async function start(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByRole("textbox", { name: "Quick garden note" });
  fireEvent.change(input, { target: { value: "Watered front today; Watered back today" } });
  const generate = await screen.findByRole("button", { name: "Generate draft" });
  await user.click(generate);
  await screen.findByRole("article", { name: "Draft 1" });
}

describe("global batch note review", () => {
  it("explains an empty extraction and keeps manual drafts after a generation failure", async () => {
    const api = seed(); api.control.holdDraft = true;
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await openEditor(user);
    fireEvent.change(await screen.findByLabelText("Care note"), { target: { value: "Tomorrow I will water the front garden." } });
    await user.click(screen.getByRole("button", { name: "Create drafts" }));
    await act(async () => api.control.finish({ drafts: [], notices: [{ reason: "planned", sourceText: "Tomorrow I will water the front garden.", message: "This is planned care, not a completed record." }] }));
    expect(await screen.findByText(/No completed care records were extracted/)).toBeVisible();
    expect(screen.getByText("This is planned care, not a completed record.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add record" }));
    fireEvent.change(screen.getByLabelText("Record note"), { target: { value: "Keep this manual correction" } });
    api.control.holdDraft = false; api.control.draftFail = true;
    await user.click(screen.getByRole("button", { name: "Generate again" }));
    await user.click(screen.getByRole("button", { name: "Replace drafts" }));
    await screen.findByRole("button", { name: "Generate again" });
    expect(screen.getByLabelText("Record note")).toHaveValue("Keep this manual correction");
    expect(screen.getByLabelText("Care note")).toHaveValue("Tomorrow I will water the front garden.");
    expect(screen.queryByText("private provider failure")).not.toBeInTheDocument();
    expect(api.puts).toHaveLength(0);
  });

  it("keeps edited drafts across modal closes and saves once on the homepage in Strict Mode", async () => {
    const api = seed();
    const user = userEvent.setup();
    render(<StrictMode><GardenWorkspace /></StrictMode>);
    await start(user);
    expect(screen.queryByLabelText("Garden for this record")).not.toBeInTheDocument();
    expect(api.puts).toHaveLength(0);
    const first = screen.getByRole("article", { name: "Draft 1" });
    fireEvent.change(within(first).getByLabelText("Record note"), { target: { value: "Edited front note" } });
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(await screen.findByRole("button", { name: "Continue note · 2 drafts" }));
    expect(within(await screen.findByRole("article", { name: "Draft 1" })).getByLabelText("Record note")).toHaveValue("Edited front note");
    await user.dblClick(screen.getByRole("button", { name: "Save 2 records" }));
    expect(await screen.findByRole("heading", { name: "Saved 2 records" })).toBeVisible();
    expect(api.requests).toHaveLength(1);
    expect(api.puts).toHaveLength(1);
    expect(api.remote().gardens.map((garden) => garden.careEvents.length)).toEqual([3, 4]);
    expect(api.remote().selectedGardenId).toBe("front");
    expect(location.pathname).toBe("/gardens");
    expect(screen.getByRole("link", { name: "View records" })).toHaveAttribute("href", "/care?view=history");
    await user.click(screen.getByRole("button", { name: "Done and close" }));
    expect(screen.queryByRole("dialog", { name: "Garden Note" })).not.toBeInTheDocument();
  });

  it("blocks all records for an invalid selected row, then saves only included rows and keeps the rest", async () => {
    const api = seed();
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await start(user);
    const second = screen.getByRole("article", { name: "Draft 2" });
    fireEvent.change(within(second).getByLabelText("Date"), { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Save 2 records" }));
    expect(within(second).getByLabelText("Date")).toHaveFocus();
    expect(api.puts).toHaveLength(0);
    await user.click(within(second).getByLabelText("Include record 2"));
    await user.click(screen.getByRole("button", { name: "Save 1 record" }));
    await screen.findByRole("heading", { name: "Saved 1 record" });
    await user.click(screen.getByRole("button", { name: "Review remaining drafts (1)" }));
    expect(within(screen.getByRole("article", { name: "Draft 1" })).getByLabelText("Garden")).toHaveValue("back");
    expect(api.remote().gardens[1].careEvents).toHaveLength(3);
  });

  it("changes only one row's target and preserves dates, original text and other rows", async () => {
    seed();
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await start(user);
    const first = screen.getByRole("article", { name: "Draft 1" });
    await user.selectOptions(within(first).getByLabelText("Garden"), "back");
    expect(within(first).getByLabelText("Target")).toHaveValue("");
    expect(within(first).getByLabelText("Date")).toHaveValue("2026-11-11");
    expect(within(first).getByLabelText("Record note")).toHaveValue("Watered front today");
    expect(within(screen.getByRole("article", { name: "Draft 2" })).getByLabelText("Target")).toHaveValue("garden");
    await user.click(within(first).getByRole("button", { name: "Remove draft" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove draft" }));
    expect(screen.getByLabelText("Care note")).toHaveValue("Watered front today; Watered back today");
  });

  it("opens collapsed fertilizer details and focuses a hidden invalid field before saving", async () => {
    const api = seed();
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await start(user);
    const first = screen.getByRole("article", { name: "Draft 1" });
    await user.selectOptions(within(first).getByLabelText("Care type"), "fertilizing");
    const details = within(first).getByText("Fertilizer details");
    await user.click(details);
    const amount = within(first).getByLabelText("Amount (optional)");
    await user.type(amount, "-2");
    await user.click(details);
    expect(amount).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save 2 records" }));
    expect(amount).toBeVisible();
    expect(amount).toHaveFocus();
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(api.puts).toHaveLength(0);
  });

  it("requires confirmation before clearing a note and its drafts", async () => {
    seed();
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await start(user);
    const dialog = screen.getByRole("dialog", { name: "Garden Note" });
    const discard = within(dialog).getByRole("button", { name: "Discard note" });
    await user.click(discard);
    const confirm = screen.getByRole("alertdialog", { name: "Discard note" });
    fireEvent(confirm, new Event("cancel", { cancelable: true, bubbles: true }));
    expect(dialog).toBeVisible();
    expect(within(dialog).getAllByRole("article")).toHaveLength(2);
    await user.click(discard);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard note" }));
    expect(dialog).toBeVisible();
    expect(within(dialog).getByLabelText("Care note")).toHaveValue("");
    expect(within(dialog).queryByRole("article")).not.toBeInTheDocument();
  });

  it("retains applied rows through a save failure and retries the snapshot with the same IDs", async () => {
    const api = seed(); api.control.fail = true;
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await start(user);
    await user.click(screen.getByRole("button", { name: "Save 2 records" }));
    const dialog = screen.getByRole("dialog", { name: "Garden Note" });
    await within(dialog).findByText("Changes not synced");
    expect(screen.queryByRole("button", { name: "Save 2 records" })).not.toBeInTheDocument();
    api.control.fail = false;
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "View note status" }));
    await user.dblClick(within(screen.getByRole("dialog", { name: "Garden Note" })).getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Saved 2 records" });
    expect(api.puts).toHaveLength(2);
    expect(api.puts[1].gardens).toEqual(api.puts[0].gardens);
  });

  it("restores review after conflict reload drops the batch, then reuses its stable record IDs", async () => {
    const api = seed(); api.control.conflict = true;
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await start(user);
    await user.click(screen.getByRole("button", { name: "Save 2 records" }));
    await user.click(await screen.findByRole("button", { name: "Reload latest" }));
    await user.click(screen.getByRole("button", { name: "Discard unsynced changes and reload" }));
    await screen.findByText(/Reloading removed some or all/);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    api.control.conflict = false;
    await user.click(screen.getByRole("button", { name: "Save 2 records" }));
    await screen.findByRole("heading", { name: "Saved 2 records" });
    expect(api.puts[1].gardens).toEqual(api.puts[0].gardens);
  });

  it("recognizes records already saved after a lost response without adding them again", async () => {
    const api = seed(); api.control.lostResponse = true;
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await start(user);
    await user.click(screen.getByRole("button", { name: "Save 2 records" }));
    await within(screen.getByRole("dialog", { name: "Garden Note" })).findByText("Changes not synced");
    api.control.lostResponse = false;
    api.control.conflict = true;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await user.click(await screen.findByRole("button", { name: "Reload latest" }));
    await user.click(screen.getByRole("button", { name: "Discard unsynced changes and reload" }));
    await screen.findByRole("heading", { name: "Saved 2 records" });
    expect(api.remote().gardens.map((garden) => garden.careEvents.length)).toEqual([3, 4]);
    expect(api.puts).toHaveLength(2);
  });

  it("allows a manual workspace-wide row without making a model request", async () => {
    const api = seed();
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await openEditor(user);
    await user.click(await screen.findByRole("button", { name: "Add record" }));
    const draft = await screen.findByRole("article", { name: "Draft 1" });
    await user.selectOptions(within(draft).getByLabelText("Garden"), "all-gardens");
    await user.selectOptions(within(draft).getByLabelText("Care type"), "watering");
    fireEvent.change(within(draft).getByLabelText("Date"), { target: { value: "2026-11-11" } });
    await user.click(screen.getByRole("button", { name: "Save 1 record" }));
    await screen.findByRole("heading", { name: "Saved 1 record" });
    expect(api.requests).toHaveLength(0);
    expect(api.remote().careEvents).toHaveLength(2);
    expect(api.remote().gardens.map((garden) => garden.careEvents.length)).toEqual([2, 3]);
  });

  it("does not let an old response overwrite revised note text and requires confirmation to replace edited drafts", async () => {
    const api = seed(); api.control.holdDraft = true;
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await openEditor(user);
    const text = await screen.findByLabelText("Care note");
    fireEvent.change(text, { target: { value: "Old note" } });
    await user.click(screen.getByRole("button", { name: "Create drafts" }));
    await screen.findByLabelText("Care note");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Continue note" }));
    await screen.findByRole("button", { name: "Creating drafts…" });
    fireEvent.change(await screen.findByLabelText("Care note"), { target: { value: "New note" } });
    await act(async () => api.control.finish());
    act(() => testRouter.push("/notes"));
    expect(await screen.findByLabelText("Care note")).toHaveValue("New note");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    api.control.holdDraft = false;
    await user.click(screen.getByRole("button", { name: "Create drafts" }));
    await screen.findByRole("article", { name: "Draft 1" });
    await user.click(screen.getByRole("button", { name: "Generate again" }));
    expect(api.requests).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Generate again" }));
    await user.click(screen.getByRole("button", { name: "Replace drafts" }));
    await waitFor(() => expect(api.requests).toHaveLength(3));
  });

  it("ticks off matched tasks unless unticked, and adds a planned job as a task (ADR-0085)", async () => {
    const api = seed();
    const planned = { sourceText: "Water front tomorrow", reason: "planned" as const, message: "This action is planned, so no completed care record was drafted.",
      task: { gardenId: "front", type: "watering" as const, dueDate: "2026-11-12", targetScope: "garden" as const, growingAreaId: null, plantingRecordId: null } };
    vi.mocked(fetch).mockImplementation(((original) => async (url: string, init?: RequestInit) =>
      url.endsWith("/care-note-drafts") ? response({ ...extraction, notices: [planned] }) : original(url, init))(vi.mocked(fetch).getMockImplementation()!) as typeof fetch);
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await start(user);
    const front = within(screen.getByRole("article", { name: "Draft 1" }));
    const back = within(screen.getByRole("article", { name: "Draft 2" }));
    expect(front.getByRole("checkbox", { name: /Completes “Water Front garden” · due Jun 1/ })).toBeChecked();
    await user.click(back.getByRole("checkbox", { name: /Completes “Water Back garden”/ }));
    await user.click(screen.getByRole("button", { name: "Add as a task for Nov 12" }));
    await user.click(screen.getByRole("button", { name: "Save 2 records" }));
    await screen.findByText("Ticked off 1 task · Added 1 task");
    await waitFor(() => expect(api.remote().gardens[0].careTasks.map((task) => task.id)).toEqual([expect.stringMatching(/^care-task-/)]));
    const added = api.remote().gardens[0].careTasks[0];
    expect(added).toMatchObject({ type: "watering", dueDate: "2026-11-12", targetScope: "garden", note: "Water front tomorrow" });
    // The unticked back-garden task stays as it was; the record itself is still saved.
    expect(api.remote().gardens[1].careTasks).toEqual(careFixture().gardens[1].careTasks);
    expect(api.remote().gardens[1].careEvents).toHaveLength(4);
  });
});
