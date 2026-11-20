import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GardenWorkspace } from "@/test/WorkspaceHarness";
import { resetTestRouter } from "@/test/router";
import { createDemoGardenWorkspace, GARDEN_WORKSPACE_STORAGE_KEY, todayDate } from "@/lib/gardenWorkspace";

// ADR-0085 N2: Care adds, shows, and filters the five care types.
function openAt(path: string) {
  localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(createDemoGardenWorkspace()));
  resetTestRouter(path);
  render(<GardenWorkspace />);
}
const saved = () => JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!);

describe("Care with five care types", () => {
  it("offers the five types as pills and shows only the chosen type's details", async () => {
    openAt("/care");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add task" }));
    const dialog = within(screen.getByRole("dialog", { name: "Add care task" }));
    const types = within(dialog.getByRole("group", { name: "Care type" }));
    expect(types.getAllByRole("radio").map((radio) => radio.closest("label")!.textContent)).toEqual(["Watering", "Fertilizing", "Planting", "Pruning", "Pest treatment"]);
    expect(types.getByRole("radio", { name: "Watering" })).toBeChecked();
    expect(dialog.queryByLabelText(/optional\)$/, { selector: "input:not(#care-task-repeat):not(#care-task-note)" })).not.toBeInTheDocument();

    await user.click(types.getByRole("radio", { name: "Pest treatment" }));
    expect(dialog.getByLabelText("Problem (optional)")).toBeInTheDocument();
    expect(dialog.getByLabelText("Treatment to use (optional)")).toBeInTheDocument();
    await user.click(types.getByRole("radio", { name: "Planting" }));
    expect(dialog.queryByLabelText("Problem (optional)")).not.toBeInTheDocument();
    expect(dialog.getByLabelText("Plant (optional)")).toBeInTheDocument();
  });

  it("adds a pruning task with what to cut and shows it on the board", async () => {
    openAt("/care");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add task" }));
    const dialog = within(screen.getByRole("dialog", { name: "Add care task" }));
    await user.selectOptions(dialog.getByLabelText("Task location"), "demo-garden");
    await user.click(dialog.getByRole("radio", { name: "Pruning" }));
    fireEvent.change(dialog.getByLabelText("Due date"), { target: { value: todayDate() } });
    await user.type(dialog.getByLabelText("What to cut (optional)"), "Side shoots");
    await user.click(dialog.getByRole("button", { name: "Add care task" }));

    expect(saved().gardens[0].careTasks.at(-1)).toMatchObject({ type: "pruning", pruneDetail: "Side shoots", dueDate: todayDate() });
    expect(screen.getByText("Pruning task added.")).toBeInTheDocument();
    const row = within(screen.getAllByText("Prune Demo Garden")[0].closest("li")!);
    expect(row.getByText("Whole garden · Side shoots")).toBeInTheDocument();
  });

  it("checks the plant count and records a planting with the plant's name", async () => {
    openAt("/care?view=history&location=demo-garden");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add record" }));
    const dialog = within(screen.getByRole("dialog", { name: "Add care event" }));
    await user.click(dialog.getByRole("radio", { name: "Planting" }));
    fireEvent.change(dialog.getByLabelText("Date"), { target: { value: todayDate() } });
    await user.type(dialog.getByLabelText("Plant (optional)"), "Basil");
    fireEvent.change(dialog.getByLabelText("How many plants (optional)"), { target: { value: "1000" } });
    await user.click(dialog.getByRole("button", { name: "Add care event" }));
    expect(dialog.getByLabelText("How many plants (optional)")).toHaveAccessibleDescription("Enter a whole number of plants from 1 to 999.");
    expect(saved().gardens[0].careEvents.some((event: { type: string }) => event.type === "planting")).toBe(false);

    fireEvent.change(dialog.getByLabelText("How many plants (optional)"), { target: { value: "2" } });
    await user.click(dialog.getByRole("button", { name: "Add care event" }));
    expect(saved().gardens[0].careEvents.at(-1)).toMatchObject({ type: "planting", plantName: "Basil", plantCount: 2 });
    expect(screen.getByText("Planted Basil in Demo Garden")).toBeInTheDocument();
    expect(screen.getByText("Whole garden · 2 plants")).toBeInTheDocument();
  });

  it("filters History by each of the five types", async () => {
    openAt("/care?view=history");
    const user = userEvent.setup();
    const filter = within(await screen.findByRole("group", { name: "Filter by care type" }));
    expect(filter.getAllByRole("button").map((button) => button.textContent)).toEqual(["All", "Watering", "Fertilizing", "Planting", "Pruning", "Pest treatment"]);
    await user.click(filter.getByRole("button", { name: "Pest treatment" }));
    expect(filter.getByRole("button", { name: "Pest treatment" })).toHaveAttribute("aria-pressed", "true");
  });
});
