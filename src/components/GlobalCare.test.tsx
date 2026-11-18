import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { GardenWorkspace } from "@/test/WorkspaceHarness";
import { resetTestRouter } from "@/test/router";
import { careFixture } from "@/test/careFixture";
import { addDays, GARDEN_WORKSPACE_STORAGE_KEY, todayDate } from "@/lib/gardenWorkspace";
import { CareWorkspace } from "./CareWorkspace";
import { workspaceCareGarden } from "@/lib/careViews";

const saved = () => JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!);
function open(path = "/care?view=history") {
  localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(careFixture()));
  resetTestRouter(path);
  return render(<GardenWorkspace />);
}
const row = (note: string) => within(screen.getByText(note).closest("li")!);
const user = () => userEvent.setup();
/** Opens a row's "⋯" menu and chooses an item (ADR-0080). */
async function menu(actor: ReturnType<typeof userEvent.setup>, note: string, item: string) {
  await actor.click(row(note).getByRole("button", { name: /^More actions for/ }));
  await actor.click(screen.getByRole("menuitem", { name: item }));
}
const gardenFilter = () => within(screen.getByRole("group", { name: "Filter by garden" }));
const careFilter = () => within(screen.getByRole("group", { name: "Filter by care type" }));
/** History's strip: its count reads "6 records" or "Showing 15 of 20 records". */
const strip = () => within(screen.getByRole("region", { name: "History" }));

it("filters History by garden without writes and corrects or deletes only the right owner despite matching IDs", async () => {
  const actor = user(); open();
  expect(await strip().findByText("6 records")).toBeVisible();
  const original = saved();
  await actor.click(gardenFilter().getByRole("button", { name: "Back garden" }));
  expect(gardenFilter().getByRole("button", { name: "Back garden" })).toHaveAttribute("aria-pressed", "true");
  expect(strip().getByText("3 records")).toBeVisible();
  expect(location.search).toBe("?view=history&location=back");
  expect(screen.queryByText("Front one")).not.toBeInTheDocument();
  expect(saved()).toEqual(original);
  await menu(actor, "Back one", "Correct record");
  const dialog = within(screen.getByRole("dialog", { name: "Edit care event" }));
  fireEvent.change(dialog.getByLabelText("Note (optional)"), { target: { value: "Back corrected" } });
  await actor.click(dialog.getByRole("button", { name: "Save care event" }));
  expect(saved().gardens[1].careEvents[0].note).toBe("Back corrected");
  expect(saved().gardens[0].careEvents).toEqual(original.gardens[0].careEvents);
  await actor.click(gardenFilter().getByRole("button", { name: "All" }));
  await menu(actor, "Front one", "Delete record");
  await actor.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete care record" }));
  expect(saved().gardens[0].careEvents).toHaveLength(1);
  expect(saved().gardens[1].careEvents).toHaveLength(3);
  expect(saved().careEvents).toEqual(original.careEvents);
});

it("keeps both History filters in the address and clears them together", async () => {
  const actor = user(); open("/care?view=history&location=front");
  expect(await screen.findByText("Front one")).toBeVisible();
  expect(screen.queryByText("Back one")).not.toBeInTheDocument();
  expect(screen.queryByText("Every garden")).not.toBeInTheDocument();
  await actor.click(careFilter().getByRole("button", { name: "Fertilizing" }));
  expect(location.search).toBe("?view=history&location=front&type=fertilizing");
  expect(screen.getByText("No care records match these filters.")).toBeVisible();
  await actor.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(location.search).toBe("?view=history");
  expect(await strip().findByText("6 records")).toBeVisible();
});

it("requires an explicit new-record location and keeps all-gardens events in the root", async () => {
  const actor = user(); open();
  await actor.click(await screen.findByRole("button", { name: "Add record" }));
  const dialog = within(screen.getByRole("dialog", { name: "Add care event" }));
  fireEvent.change(dialog.getByLabelText("Date"), { target: { value: "2026-06-02" } });
  await actor.click(dialog.getByRole("button", { name: "Add care event" }));
  expect(dialog.getByLabelText("Record location")).toHaveFocus();
  expect(saved().careEvents).toHaveLength(1);
  await actor.selectOptions(dialog.getByLabelText("Record location"), "all-gardens");
  expect(dialog.getByLabelText("Target")).toHaveValue("all-gardens");
  await actor.click(dialog.getByRole("button", { name: "Add care event" }));
  expect(saved().careEvents).toHaveLength(2);
  expect(saved().gardens.map((garden: { careEvents: unknown[] }) => garden.careEvents.length)).toEqual([2, 3]);
});

it("ticks a repeating task off in its own garden, unticks it, and completes on another date once", async () => {
  const actor = user(); open("/care");
  const today = within(await screen.findByRole("region", { name: "2 things left today." }));
  const todo = () => within(screen.getByRole("list", { name: /^To do/ }));
  await actor.click(within(todo().getByText("Back repeat").closest("li")!).getByRole("checkbox"));
  expect(saved().gardens[1].careTasks[0].dueDate).toBe(addDays(todayDate(), 3));
  expect(saved().gardens[1].careEvents).toHaveLength(4);
  expect(saved().gardens[1].careEvents.at(-1).date).toBe(todayDate());
  expect(saved().gardens[0].careTasks[0].dueDate).toBe("2026-06-01");
  expect(saved().careEvents).toHaveLength(1);
  expect(today.getByRole("heading", { level: 2 })).toHaveTextContent("1 thing left today.");
  // The tick moves the row to Done today, and the keyboard follows it.
  const done = within(screen.getByRole("list", { name: /^Done today/ })).getByRole("checkbox");
  expect(done).toHaveFocus();
  expect(done).toHaveAttribute("aria-checked", "true");
  await actor.click(done);
  expect(saved().gardens[1].careTasks[0].dueDate).toBe("2026-06-01");
  expect(saved().gardens[1].careEvents).toHaveLength(3);

  await menu(actor, "Front task", "Complete on another date…");
  const dialog = screen.getByRole("dialog", { name: "Complete watering task" });
  fireEvent.change(within(dialog).getByLabelText("Completion date"), { target: { value: "2026-06-04" } });
  const form = within(dialog).getByLabelText("Completion date").closest("form")!;
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(saved().gardens[0].careTasks).toHaveLength(0);
  expect(saved().gardens[0].careEvents).toHaveLength(3);
  expect(saved().gardens[1].careTasks[0].dueDate).toBe("2026-06-01");
});

it("ticks the same task from its garden card and the band together", async () => {
  const actor = user(); open("/care");
  const card = within(await screen.findByRole("article", { name: "Back garden" }));
  await actor.click(card.getByRole("checkbox", { name: "Water whole garden, Every 3 days" }));
  expect(card.getByRole("checkbox", { name: "Water whole garden, Every 3 days" })).toHaveFocus();
  expect(card.getByText("Done for today")).toBeVisible();
  expect(within(screen.getByRole("list", { name: /^Done today/ })).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("heading", { level: 2, name: "1 thing left today." })).toBeVisible();
});

it("scrolls a ?location= link to that garden's card and highlights it", async () => {
  open("/care?location=front");
  const card = await screen.findByRole("article", { name: "Front garden" });
  await waitFor(() => expect(card).toHaveAttribute("data-highlight"));
  expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
});

it("edits and removes a task in the selected owner without changing an equal ID elsewhere", async () => {
  const actor = user(); open("/care");
  await screen.findByText("Back repeat");
  await menu(actor, "Back repeat", "Edit task");
  const dialog = within(screen.getByRole("dialog", { name: "Edit care task" }));
  fireEvent.change(dialog.getByLabelText("Note (optional)"), { target: { value: "Back edited task" } });
  await actor.click(dialog.getByRole("button", { name: "Save care task" }));
  expect(saved().gardens[0].careTasks[0].note).toBe("Front task");
  expect(saved().gardens[1].careTasks[0].note).toBe("Back edited task");
  await menu(actor, "Back edited task", "Delete task");
  await actor.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete task" }));
  expect(saved().gardens[1].careTasks).toHaveLength(0);
  expect(saved().gardens[0].careTasks).toHaveLength(1);
  expect(saved().gardens[1].careEvents).toHaveLength(3);
});

it("says when a task beyond seven days will appear", async () => {
  const actor = user(); open("/care");
  await actor.click(await screen.findByRole("button", { name: "Add task" }));
  const dialog = within(screen.getByRole("dialog", { name: "Add care task" }));
  await actor.selectOptions(dialog.getByLabelText("Task location"), "front");
  fireEvent.change(dialog.getByLabelText("Due date"), { target: { value: "2099-03-10" } });
  await actor.click(dialog.getByRole("button", { name: "Add care task" }));
  expect(saved().gardens[0].careTasks).toHaveLength(2);
  expect(screen.getByText("Task added. It will appear here 7 days before March 10, 2099.")).toBeVisible();
});

it("corrects the root record alone from the All gardens filter and returns to Care", async () => {
  const actor = user(); open("/care?view=history&location=all-gardens");
  expect(await screen.findByText("Every garden")).toBeVisible();
  expect(strip().getByText("1 record")).toBeVisible();
  await menu(actor, "Every garden", "Correct record");
  const dialog = within(screen.getByRole("dialog", { name: "Edit care event" }));
  fireEvent.change(dialog.getByLabelText("Note (optional)"), { target: { value: "Root corrected" } });
  await actor.click(dialog.getByRole("button", { name: "Save care event" }));
  expect(saved().careEvents[0].note).toBe("Root corrected");
  expect(saved().gardens.map((garden: { careEvents: unknown[] }) => garden.careEvents.length)).toEqual([2, 3]);
  await actor.click(strip().getByRole("link", { name: "Care" }));
  expect(location.pathname + location.search).toBe("/care");
});

it("retains a draft when its garden disappears and refuses to save into a different owner", async () => {
  const workspace = careFixture(); const onUpdateRecords = vi.fn();
  const props = { garden: workspaceCareGarden(workspace), gardens: workspace.gardens, onUpdateRecords, onMessage: vi.fn(), initialView: "history" as const };
  const actor = user(); const view = render(<CareWorkspace {...props} />);
  await menu(actor, "Back one", "Correct record");
  fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Keep this correction" } });
  view.rerender(<CareWorkspace {...props} gardens={[workspace.gardens[0]]} />);
  fireEvent.submit(screen.getByLabelText("Note (optional)").closest("form")!);
  expect(onUpdateRecords).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Note (optional)")).toHaveValue("Keep this correction");
  expect(screen.getByRole("alert")).toHaveTextContent("Choose an available record location");
});

it("returns focus to the row's menu after completing from the edit dialog", async () => {
  const actor = user(); open("/care");
  await screen.findByText("Back repeat");
  const more = row("Back repeat").getByRole("button", { name: /^More actions for/ });
  await menu(actor, "Back repeat", "Edit task");
  await actor.click(within(screen.getByRole("dialog", { name: "Edit care task" })).getByRole("button", { name: "Complete on another date…" }));
  await actor.click(within(screen.getByRole("dialog", { name: "Complete watering task" })).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(more).toHaveFocus());
});

it("tells the user a filtered location no longer exists, even after another message", () => {
  const workspace = careFixture();
  render(<CareWorkspace garden={workspaceCareGarden(workspace)} gardens={workspace.gardens} locationFilter="gone" onLocationChange={vi.fn()}
    initialView="history" viewHref="/care" message="Water Back garden ticked off for today." onMessage={vi.fn()} onUpdateRecords={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("That location no longer exists. Showing all records. Water Back garden ticked off for today.");
  expect(within(screen.getByRole("group", { name: "Filter by garden" })).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Back one")).toBeVisible();
});
