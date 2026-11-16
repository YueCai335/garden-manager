import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { GardenWorkspace } from "@/test/WorkspaceHarness";
import { resetTestRouter } from "@/test/router";
import { createDemoGardenWorkspace, GARDEN_WORKSPACE_STORAGE_KEY } from "@/lib/gardenWorkspace";

function openPlan() {
  localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(createDemoGardenWorkspace()));
  resetTestRouter("/gardens/demo-garden/plan");
  render(<GardenWorkspace />);
}

it("shows the garden fields only on the Garden level and keeps an unapplied value across levels", async () => {
  const user = userEvent.setup(); openPlan();
  // An existing garden opens on Garden (ADR-0078), which holds the name and size.
  const level = await screen.findByRole("button", { name: "Garden" });
  expect(level).toHaveAttribute("aria-current", "true");
  expect(screen.queryByRole("button", { name: "Edit garden details" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete garden" })).toBeInTheDocument();
  // An empty name fails validation, so it stays in the field unapplied.
  fireEvent.change(screen.getByLabelText("Garden name"), { target: { value: " " } });
  fireEvent.keyDown(screen.getByLabelText("Garden name"), { key: "Enter" });
  expect(screen.getByText("Enter garden name.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Plants" }));
  expect(screen.queryByLabelText("Garden name")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Garden" }));
  expect(screen.getByLabelText("Garden name")).toHaveValue(" ");
  expect(JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!).gardens[0].name).toBe("Demo Garden");
});

it("applies garden details on Enter as one undo step without clearing existing plants", async () => {
  const user = userEvent.setup(); openPlan();
  await user.click(await screen.findByRole("button", { name: "Garden" }));
  const stored = () => JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!).gardens[0];
  const previousPlants = stored().growingAreas[0].layout.allocations;
  fireEvent.change(screen.getByLabelText("Garden name"), { target: { value: "Kitchen garden" } });
  fireEvent.change(screen.getByLabelText("Garden width (m)"), { target: { value: "12" } });
  fireEvent.keyDown(screen.getByLabelText("Garden width (m)"), { key: "Enter" });
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  await waitFor(() => expect(stored()).toMatchObject({ name: "Kitchen garden", plan: { widthMeters: 12, depthMeters: 6 } }));
  expect(stored().growingAreas[0].layout.allocations).toEqual(previousPlants);
  // The name and the size changed together, so one Undo restores both.
  await user.click(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() => expect(stored()).toMatchObject({ name: "Demo Garden", plan: { widthMeters: 10, depthMeters: 6 } }));
});
