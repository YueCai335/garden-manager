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
// The home card shows its batch placeholder once batch drafting is enabled, and the header's
// "+ Note" opens the batch dialog from then on (ADR-0085 N6). Wait for sync too.
async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByPlaceholderText(/Write it your way, e\.g\./);
  await screen.findByText("All changes saved");
  await user.click(screen.getByRole("button", { name: "Note" }));
}
/** Rows start collapsed (ADR-0085); opening one shows its fields. */
async function expand(user: ReturnType<typeof userEvent.setup>, article: HTMLElement) {
  const details = article.querySelector("details")!;
  if (!details.open) await user.click(details.querySelector("summary")!);
  return within(article);
}
async function start(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByRole("textbox", { name: "Quick garden note" });
  fireEvent.change(input, { target: { value: "Watered front today; Watered back today" } });
  const split = await screen.findByRole("button", { name: "Split into records" });
  await waitFor(() => expect(split).toBeEnabled());
  await user.click(split);
  await screen.findByRole("article", { name: "Draft 1" });
}

describe("global batch note review", () => {
  it("explains an empty extraction and keeps manual drafts after a generation failure", async () => {
    const api = seed(); api.control.holdDraft = true;
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await openEditor(user);
    fireEvent.change(await screen.findByLabelText("Care note"), { target: { value: "Tomorrow I will water the front garden." } });
    await user.click(screen.getByRole("button", { name: "Split into records" }));
    await act(async () => api.control.finish({ drafts: [], notices: [{ reason: "planned", sourceText: "Tomorrow I will water the front garden.", message: "This is planned care, not a completed record." }] }));
    expect(await screen.findByRole("heading", { name: "No finished jobs found" })).toBeVisible();
    expect(screen.getByText(/No completed care records were extracted/)).toBeVisible();
    expect(screen.getByText("This is planned care, not a completed record.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add a record manually" }));
    fireEvent.change(screen.getByLabelText("Record note"), { target: { value: "Keep this manual correction" } });
    api.control.holdDraft = false; api.control.draftFail = true;
    await user.click(screen.getByRole("button", { name: "Edit and redo" }));
    await user.click(screen.getByRole("button", { name: "Split again" }));
    await user.click(screen.getByRole("button", { name: "Replace drafts" }));
    await screen.findByRole("button", { name: "Edit and redo" });
    expect(screen.getByLabelText("Record note")).toHaveValue("Keep this manual correction");
    await user.click(screen.getByRole("button", { name: "Edit and redo" }));
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
    const first = await expand(user, screen.getByRole("article", { name: "Draft 1" }));
    fireEvent.change(first.getByLabelText("Record note"), { target: { value: "Edited front note" } });
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(await screen.findByRole("button", { name: "Continue review" }));
    expect(within(await screen.findByRole("article", { name: "Draft 1" })).getByLabelText("Record note")).toHaveValue("Edited front note");
    await user.dblClick(screen.getByRole("button", { name: "Save 2 records" }));
    expect(await screen.findByRole("heading", { name: "Saved 2 records" })).toBeVisible();
    expect(api.requests).toHaveLength(1);
    expect(api.puts).toHaveLength(1);
    expect(api.remote().gardens.map((garden) => garden.careEvents.length)).toEqual([3, 4]);
    expect(api.remote().selectedGardenId).toBe("front");
    expect(location.pathname).toBe("/gardens");
    expect(screen.getByRole("link", { name: "View in Care history" })).toHaveAttribute("href", "/care?view=history");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "Garden Note" })).not.toBeInTheDocument();
  });

  it("blocks all records for an invalid selected row, then saves only included rows and keeps the rest", async () => {
    const api = seed();
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await start(user);
    const second = screen.getByRole("article", { name: "Draft 2" });
    await expand(user, second);
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
    await expand(user, first);
    await expand(user, screen.getByRole("article", { name: "Draft 2" }));
    await user.selectOptions(within(first).getByLabelText("Garden"), "back");
    // The record moves to the Back garden card, so look it up again.
    const moved = within(screen.getByRole("article", { name: "Draft 1" }));
    expect(screen.getByRole("region", { name: "Back garden" })).toContainElement(screen.getByRole("article", { name: "Draft 1" }));
    expect(moved.getByLabelText("Target")).toHaveValue("");
    expect(moved.getByLabelText("Date")).toHaveValue("2026-11-11");
    expect(moved.getByLabelText("Record note")).toHaveValue("Watered front today");
    expect(within(screen.getByRole("article", { name: "Draft 2" })).getByLabelText("Target")).toHaveValue("garden");
    await user.click(moved.getByRole("button", { name: "Remove draft" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove draft" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Edit and redo" }));
    expect(screen.getByLabelText("Care note")).toHaveValue("Watered front today; Watered back today");
  });

  it("opens a collapsed row and focuses its hidden invalid field before saving", async () => {
    const api = seed();
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await start(user);
    const first = screen.getByRole("article", { name: "Draft 1" });
    await expand(user, first);
    await user.selectOptions(within(first).getByLabelText("Care type"), "fertilizing");
    const amount = within(first).getByLabelText("Amount (optional)");
    await user.type(amount, "-2");
    await user.click(first.querySelector("summary")!);
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
    await user.click(screen.getByRole("button", { name: "View status" }));
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
    await screen.findByText(/Not saved yet/);
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
    await user.click(await screen.findByRole("button", { name: "Add a record manually" }));
    const draft = await screen.findByRole("article", { name: "Draft 1" });
    await user.selectOptions(within(draft).getByLabelText("Garden"), "all-gardens");
    // The record moves to the All gardens card, so look it up again.
    const moved = within(screen.getByRole("article", { name: "Draft 1" }));
    await user.selectOptions(moved.getByLabelText("Care type"), "watering");
    fireEvent.change(moved.getByLabelText("Date"), { target: { value: "2026-11-11" } });
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
    await user.click(screen.getByRole("button", { name: "Split into records" }));
    await screen.findByRole("heading", { name: "Reading your note" });
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("button", { name: "Splitting…" });
    // Cancel stops waiting; the late answer is ignored once the note changes.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.change(await screen.findByLabelText("Care note"), { target: { value: "New note" } });
    await act(async () => api.control.finish());
    act(() => testRouter.push("/notes"));
    expect(await screen.findByLabelText("Care note")).toHaveValue("New note");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    api.control.holdDraft = false;
    await user.click(screen.getByRole("button", { name: "Split into records" }));
    await screen.findByRole("article", { name: "Draft 1" });
    await user.click(screen.getByRole("button", { name: "Edit and redo" }));
    await user.click(screen.getByRole("button", { name: "Split again" }));
    expect(api.requests).toHaveLength(2);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Back to review" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Edit and redo" }));
    await user.click(screen.getByRole("button", { name: "Split again" }));
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
    await screen.findByText("Ticked off 1 task");
    expect(screen.getByText("Added 1 task")).toBeVisible();
    expect(screen.getByRole("region", { name: "Care tasks" })).toHaveTextContent("Water Front garden");
    await waitFor(() => expect(api.remote().gardens[0].careTasks.map((task) => task.id)).toEqual([expect.stringMatching(/^care-task-/)]));
    const added = api.remote().gardens[0].careTasks[0];
    expect(added).toMatchObject({ type: "watering", dueDate: "2026-11-12", targetScope: "garden", note: "Water front tomorrow" });
    // The unticked back-garden task stays as it was; the record itself is still saved.
    expect(api.remote().gardens[1].careTasks).toEqual(careFixture().gardens[1].careTasks);
    expect(api.remote().gardens[1].careEvents).toHaveLength(4);
  });

});

describe("note flow screens (ADR-0085 N5)", () => {
  const withNotes = (body: CareNoteBatchDraftResponse | { status: number; detail: string }) => {
    const api = seed();
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((async (url: string, init?: RequestInit) => {
      if (!url.endsWith("/care-note-drafts")) return original(url, init);
      return "status" in body ? response({ detail: body.detail }, body.status) : response(body);
    }) as typeof fetch);
    return api;
  };
  async function write(user: ReturnType<typeof userEvent.setup>, note: string) {
    await openEditor(user);
    fireEvent.change(await screen.findByLabelText("Care note"), { target: { value: note } });
    await user.click(screen.getByRole("button", { name: "Split into records" }));
  }

  it("lists due and overdue tasks while writing", async () => {
    seed();
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await openEditor(user);
    expect(await screen.findByRole("heading", { name: "What did you do in the garden?" })).toBeVisible();
    expect(screen.getByText("Due today")).toBeVisible();
    expect(screen.getByText(/Water Front garden · due Jun 1/)).toBeVisible();
    expect(screen.getByText("Use your keyboard's mic to dictate")).toBeVisible();
  });

  it("groups records by garden and links each record to its sentence and garden card", async () => {
    withNotes({ ...extraction, drafts: extraction.drafts.map((draft) => ({ ...draft, sourceText: draft.gardenId === "front" ? "Watered front today" : "Watered back today" })) });
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await write(user, "Watered front today; Watered back today");
    expect(await screen.findByRole("heading", { name: "2 records across 2 gardens" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Front garden" })).toContainElement(screen.getByRole("article", { name: "Draft 1" }));
    const sentence = screen.getByText("Watered front today", { selector: "span" });
    expect(sentence).not.toHaveAttribute("data-on");
    await user.hover(screen.getByRole("article", { name: "Draft 1" }));
    expect(sentence).toHaveAttribute("data-on", "true");
    expect(screen.getByText("Watered back today", { selector: "span" })).not.toHaveAttribute("data-on");
    await user.unhover(screen.getByRole("article", { name: "Draft 1" }));
    await user.hover(screen.getByRole("button", { name: /^Back garden/ }));
    expect(screen.getByText("Watered back today", { selector: "span" })).toHaveAttribute("data-on", "true");
    expect(screen.getByRole("region", { name: "Back garden" })).toHaveAttribute("data-on", "true");
  });

  it("says when a planted plant is not on the plan and shows a plant question as a notice without a link", async () => {
    withNotes({
      drafts: [{ ...extraction.drafts[0], type: "planting", sourceText: "Planted 2 basil", plantName: "Basil", plantCount: 2 }],
      notices: [{ sourceText: "Why are the tomato leaves yellow?", reason: "question", message: "This sounds like a question, not a completed care action, so no record was drafted.", task: null }],
    });
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await write(user, "Planted 2 basil. Why are the tomato leaves yellow?");
    const row = within(await screen.findByRole("article", { name: "Draft 1" }));
    expect(row.getByText("Planted")).toBeVisible();
    expect(row.getByText(/Basil · 2 plants/)).toBeVisible();
    expect(row.getByText(/isn't on the Front garden plan yet/)).toBeVisible();
    expect(row.getByRole("link", { name: "Add on plan →" })).toHaveAttribute("href", "/gardens/front/plan");
    expect(screen.getByText("This sounds like a question, not a completed care action, so no record was drafted.")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Plant Doctor/ })).not.toBeInTheDocument();
  });

  it("explains a failed request and a note with too many jobs, keeping the note", async () => {
    withNotes({ status: 503, detail: "provider down" });
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await write(user, "Watered front today");
    expect(await screen.findByRole("heading", { name: "Couldn't read your note" })).toBeVisible();
    expect(within(screen.getByRole("dialog", { name: "Garden Note" })).getByText("Watered front today")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.queryByText("provider down")).not.toBeInTheDocument();
  });

  it("asks to split a note with more than 12 jobs", async () => {
    withNotes({ status: 422, detail: "This note has too many events. Split it into notes with at most 12 completed care records." });
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await write(user, "Watered front today");
    expect(await screen.findByRole("heading", { name: "That's a lot for one note" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit note" }));
    expect(screen.getByLabelText("Care note")).toHaveValue("Watered front today");
  });

  it("shows the draft's state on the home card: waiting for review, then saved (ADR-0085 N6)", async () => {
    seed();
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await start(user);
    await user.click(screen.getByRole("button", { name: "Close" }));
    const card = within(screen.getByRole("region", { name: "AI Garden Notes" }));
    // The card swapped its button while the note was read; focus returns to the new one.
    await waitFor(() => expect(card.getByRole("button", { name: "Continue review" })).toHaveFocus());
    expect(card.getByText("2 records waiting for review")).toBeVisible();
    expect(card.getByText("Front garden")).toBeVisible();
    expect(card.getByText("Back garden")).toBeVisible();
    expect(card.getByText("Completes 2 tasks")).toBeVisible();
    expect(card.queryByRole("textbox", { name: "Quick garden note" })).not.toBeInTheDocument();
    await user.click(card.getByRole("button", { name: "Discard" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    await user.click(card.getByRole("button", { name: "Continue review" }));
    await user.click(screen.getByRole("button", { name: "Save 2 records" }));
    await screen.findByRole("heading", { name: "Saved 2 records" });
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(card.getByText("Saved 2 records")).toBeVisible();
    expect(card.getByText("Ticked off 2 tasks")).toBeVisible();
    expect(card.getByRole("link", { name: "View records" })).toHaveAttribute("href", "/care?view=history");
    await user.click(card.getByRole("button", { name: "Write another note" }));
    expect(card.getByRole("textbox", { name: "Quick garden note" })).toHaveValue("");
  });
});

describe("public demo batch notes (ADR-0086)", () => {
  it("shows the English hint and request ID, and leaves a target the visitor's garden no longer matches", async () => {
    vi.stubEnv("NEXT_PUBLIC_CARE_NOTE_BATCH_LIVE_ENTRY", "true");
    const server: ServerWorkspace = { ...careFixture(), workspaceId: "batch", revision: 0 };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("runtime-config")) return response({ portfolioDemo: true, careNoteBatchPublicAvailable: true });
      if (url.endsWith("/care-note-drafts")) return new Response(JSON.stringify(extraction), { status: 200, headers: { "X-Care-Note-Request": "abc123def456" } });
      return response(server);
    }));
    localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "batch");
    resetTestRouter("/gardens");
    const user = userEvent.setup();
    render(<GardenWorkspace />);

    await openEditor(user);
    expect(await screen.findByText(/Notes work best in English/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Care note"), { target: { value: "Watered front today; Watered back today" } });
    await user.click(screen.getByRole("button", { name: "Split into records" }));

    const first = await screen.findByRole("article", { name: "Draft 1" });
    expect(screen.getByText("Request ID: abc123def456")).toBeInTheDocument();
    // careFixture's gardens are not the showcase, so the server's IDs no longer match and the visitor chooses.
    expect(within(first).getByText("No target yet")).toBeInTheDocument();
    vi.unstubAllEnvs();
  });
});
