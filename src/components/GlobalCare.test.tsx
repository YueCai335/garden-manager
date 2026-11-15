import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Suspense, use, useState } from "react";
import { GardenWorkspace } from "@/test/WorkspaceHarness";
import { resetTestRouter } from "@/test/router";
import { careFixture } from "@/test/careFixture";
import { GARDEN_WORKSPACE_STORAGE_KEY } from "@/lib/gardenWorkspace";
import { CareWorkspace } from "./CareWorkspace";
import { workspaceCareGarden } from "@/lib/careViews";

const saved = () => JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!);
function open(path = "/care?view=history") {
  localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(careFixture()));
  resetTestRouter(path);
  return render(<GardenWorkspace />);
}
const row = (note: string) => within(screen.getByText(note).closest("li")!);

it("updates the Tasks link immediately while the location navigation is still pending", async () => {
  const workspace = careFixture();
  let finishNavigation!: () => void;
  const navigation = new Promise<void>((resolve) => { finishNavigation = resolve; });
  function RoutedCare() {
    const [location, setLocation] = useState("front");
    if (location === "all") use(navigation);
    return <CareWorkspace garden={workspaceCareGarden(workspace)} gardens={workspace.gardens}
      locationFilter={location} onLocationChange={setLocation} initialView="history" viewHref="/care"
      onMessage={vi.fn()} onUpdateRecords={vi.fn()} />;
  }

  const user = userEvent.setup();
  render(<Suspense fallback="Loading location"><RoutedCare /></Suspense>);
  expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/care?view=tasks&location=front");
  await user.selectOptions(screen.getByLabelText("Location"), "all");
  expect(screen.getByLabelText("Location")).toHaveValue("all");
  expect(screen.getByText("6 records")).toBeVisible();
  expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/care?view=tasks");
  await act(async () => finishNavigation());
  expect(screen.getByLabelText("Location")).toHaveValue("all");
});

it("aggregates six records, filters without writes, and edits/deletes only the correct owner despite matching IDs", async () => {
  const user = userEvent.setup(); open();
  expect(await screen.findByText("6 records")).toBeVisible();
  const original = saved();
  await user.selectOptions(screen.getByLabelText("Location"), "back");
  expect(screen.getByText("3 records")).toBeVisible();
  expect(screen.queryByText("Front one")).not.toBeInTheDocument();
  expect(saved()).toEqual(original);
  await user.click(row("Back one").getByRole("button", { name: "Correct record" }));
  fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Back corrected" } });
  // Browsing another location does not retarget the open edit form.
  await user.selectOptions(screen.getByLabelText("Location"), "front");
  await user.click(screen.getByRole("button", { name: "Save care event" }));
  expect(saved().gardens[1].careEvents[0].note).toBe("Back corrected");
  expect(saved().gardens[0].careEvents).toEqual(original.gardens[0].careEvents);
  await user.click(row("Front one").getByRole("button", { name: "Delete record" }));
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete care record" }));
  expect(saved().gardens[0].careEvents).toHaveLength(1);
  expect(saved().gardens[1].careEvents).toHaveLength(3);
  expect(saved().careEvents).toEqual(original.careEvents);
});

it("requires an explicit new-record location and keeps all-gardens events in the root", async () => {
  const user = userEvent.setup(); open();
  await user.click(await screen.findByRole("button", { name: "Add care event" }));
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-02" } });
  const form = screen.getByLabelText("Date").closest("form")!;
  await user.click(within(form).getByRole("button", { name: "Add care event" }));
  expect(screen.getByLabelText("Record location")).toHaveFocus();
  expect(saved().careEvents).toHaveLength(1);
  await user.selectOptions(screen.getByLabelText("Record location"), "all-gardens");
  expect(screen.getByLabelText("Target")).toHaveValue("all-gardens");
  await user.click(within(form).getByRole("button", { name: "Add care event" }));
  expect(saved().careEvents).toHaveLength(2);
  expect(saved().gardens.map((garden: { careEvents: unknown[] }) => garden.careEvents.length)).toEqual([2, 3]);
});

it("completes a repeating task once in its garden and leaves matching tasks elsewhere untouched", async () => {
  const user = userEvent.setup(); open("/care?view=tasks");
  await screen.findByText("Back repeat");
  await user.click(row("Back repeat").getByRole("button", { name: "Complete" }));
  fireEvent.change(screen.getByLabelText("Completion date"), { target: { value: "2026-06-04" } });
  const form = screen.getByLabelText("Completion date").closest("form")!;
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(saved().gardens[1].careTasks[0].dueDate).toBe("2026-06-07");
  expect(saved().gardens[1].careEvents).toHaveLength(4);
  expect(saved().gardens[0].careTasks[0].dueDate).toBe("2026-06-01");
  expect(saved().careEvents).toHaveLength(1);
});

it("shows only a garden's own records when Care is filtered to it, the view old garden links now land on", async () => {
  open("/care?view=history&location=front");
  expect(await screen.findByText("Front one")).toBeVisible();
  expect(screen.getByLabelText("Location")).toHaveValue("front");
  expect(screen.queryByText("Back one")).not.toBeInTheDocument();
  expect(screen.queryByText("Every garden")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/care?view=tasks&location=front");
});

it("edits and removes a task in the selected owner without changing an equal ID elsewhere", async () => {
  const user = userEvent.setup(); open("/care?view=tasks");
  await screen.findByText("Back repeat");
  await user.click(row("Back repeat").getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Back edited task" } });
  await user.click(screen.getByRole("button", { name: "Save care task" }));
  expect(saved().gardens[0].careTasks[0].note).toBe("Front task");
  expect(saved().gardens[1].careTasks[0].note).toBe("Back edited task");
  await user.click(row("Back edited task").getByRole("button", { name: "Delete" }));
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete task" }));
  expect(saved().gardens[1].careTasks).toHaveLength(0);
  expect(saved().gardens[0].careTasks).toHaveLength(1);
  expect(saved().gardens[1].careEvents).toHaveLength(3);
});

it("keeps the explicit root filter through view navigation and corrects the root record alone", async () => {
  const user = userEvent.setup(); open("/care?view=history&location=all-gardens");
  expect(await screen.findByText("1 record")).toBeVisible();
  await user.click(row("Every garden").getByRole("button", { name: "Correct record" }));
  fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Root corrected" } });
  await user.click(screen.getByRole("button", { name: "Save care event" }));
  expect(saved().careEvents[0].note).toBe("Root corrected");
  expect(saved().gardens.map((garden: { careEvents: unknown[] }) => garden.careEvents.length)).toEqual([2, 3]);
  await user.click(screen.getByRole("link", { name: "Tasks" }));
  expect(location.search).toContain("location=all-gardens");
  expect(screen.getByLabelText("Location")).toHaveValue("all-gardens");
});

it("retains a draft when its garden disappears and refuses to save into a different owner", async () => {
  const workspace = careFixture(); const onUpdateRecords = vi.fn();
  const props = { garden: workspaceCareGarden(workspace), gardens: workspace.gardens, onUpdateRecords, onMessage: vi.fn(), initialView: "history" as const };
  const user = userEvent.setup(); const view = render(<CareWorkspace {...props} />);
  await user.click(row("Back one").getByRole("button", { name: "Correct record" }));
  fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Keep this correction" } });
  view.rerender(<CareWorkspace {...props} gardens={[workspace.gardens[0]]} />);
  fireEvent.submit(screen.getByLabelText("Note (optional)").closest("form")!);
  expect(onUpdateRecords).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Note (optional)")).toHaveValue("Keep this correction");
  expect(screen.getByRole("alert")).toHaveTextContent("Choose an available record location");
});
