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

it("starts with a garden summary, guards an unapplied value, and restores the edit action", async () => {
  const user = userEvent.setup(); openPlan();
  const edit = await screen.findByRole("button", { name: "Edit garden details" });
  expect(screen.queryByLabelText("Garden name")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Garden properties" })).toHaveTextContent("10 × 6 m");
  await user.click(edit);
  // An empty name fails validation, so it stays in the field unapplied.
  fireEvent.change(screen.getByLabelText("Garden name"), { target: { value: " " } });
  fireEvent.keyDown(screen.getByLabelText("Garden name"), { key: "Enter" });
  expect(screen.getByText("Enter garden name.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Done" }));
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Garden name")).toHaveValue(" ");
  await user.click(screen.getByRole("button", { name: "Done" }));
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(screen.queryByLabelText("Garden name")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit garden details" })).toHaveFocus());
  expect(JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!).gardens[0].name).toBe("Demo Garden");
});

it("applies garden details on Enter as one undo step without clearing existing plants", async () => {
  const user = userEvent.setup(); openPlan();
  await user.click(await screen.findByRole("button", { name: "Edit garden details" }));
  const previousPlants = JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!).gardens[0].growingAreas[0].layout.allocations;
  fireEvent.change(screen.getByLabelText("Garden name"), { target: { value: "Kitchen garden" } });
  fireEvent.change(screen.getByLabelText("Garden width (m)"), { target: { value: "12" } });
  fireEvent.keyDown(screen.getByLabelText("Garden width (m)"), { key: "Enter" });
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.getByRole("region", { name: "Garden properties" })).toHaveTextContent("Kitchen garden · 12 × 6 m");
  const garden = JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!).gardens[0];
  expect(garden.growingAreas[0].layout.allocations).toEqual(previousPlants);
  // The name and the size changed together, so one Undo restores both.
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByRole("region", { name: "Garden properties" })).toHaveTextContent("Demo Garden · 10 × 6 m");
});
