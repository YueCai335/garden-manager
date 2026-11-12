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

it("starts with a garden summary, guards cancellation, and restores the edit action", async () => {
  const user = userEvent.setup(); openPlan();
  const edit = await screen.findByRole("button", { name: "Edit garden details" });
  expect(screen.queryByLabelText("Garden name")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Garden properties" })).toHaveTextContent("10 × 6 m");
  await user.click(edit);
  fireEvent.change(screen.getByLabelText("Garden name"), { target: { value: "Pending name" } });
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Garden name")).toHaveValue("Pending name");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(screen.queryByLabelText("Garden name")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit garden details" })).toHaveFocus());
  expect(JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!).gardens[0].name).toBe("Demo Garden");
});

it("saves garden details then returns to their summary without clearing existing plants", async () => {
  const user = userEvent.setup(); openPlan();
  await user.click(await screen.findByRole("button", { name: "Edit garden details" }));
  const previousPlants = JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!).gardens[0].growingAreas[0].layout.allocations;
  fireEvent.change(screen.getByLabelText("Garden name"), { target: { value: "Kitchen garden" } });
  fireEvent.change(screen.getByLabelText("Garden width (m)"), { target: { value: "12" } });
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.queryByLabelText("Garden name")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Garden properties" })).toHaveTextContent("Kitchen garden · 12 × 6 m");
  const garden = JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!).gardens[0];
  expect(garden.growingAreas[0].layout.allocations).toEqual(previousPlants);
});
