import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { testLayout } from "@/test/layout";
import { GardenWorkspace } from "@/test/WorkspaceHarness";
import { GARDEN_WORKSPACE_STORAGE_KEY } from "@/lib/gardenWorkspace";

async function openBed() {
  const user = userEvent.setup();
  render(<GardenWorkspace />);
  await user.click(await screen.findByRole("button", { name: "Load demo garden" }));
  await user.click(await screen.findByRole("link", { name: "Open Demo Garden" }));
  await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
  return user;
}
// These journeys use the side-column layout, where area properties and plants share one panel.
beforeEach(() => { testLayout.width = 1280; testLayout.viewportWidth = 1280; });
const properties = () => within(screen.getByLabelText("Planting-area name").closest("form")!);
const saved = () => JSON.parse(window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!);

describe("planting-area draft protection", () => {
  it("applies a typed name when focus leaves it, and keeps it while adding a plant", async () => {
    const user = await openBed();
    await user.clear(screen.getByLabelText("Planting-area name"));
    await user.type(screen.getByLabelText("Planting-area name"), "Kitchen bed");
    expect(saved().gardens[0].growingAreas[0].name).toBe("Sample raised bed");
    await user.click(screen.getByRole("button", { name: "Add plant" }));
    expect(saved().gardens[0].growingAreas[0].name).toBe("Kitchen bed");
    await user.type(screen.getByLabelText("Plant type"), "Kale");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByLabelText("Planting-area name")).toHaveValue("Kitchen bed");
    expect(properties().queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    const area = saved().gardens[0].growingAreas[0];
    expect(area.name).toBe("Kitchen bed");
    expect(area.layout.allocations.some((plant: { plantType: string }) => plant.plantType === "Kale")).toBe(true);
  });

  it("keeps area drafts when navigating to another module and back", async () => {
    const user = await openBed();
    fireEvent.change(screen.getByLabelText("Planting-area name"), { target: { value: "Unsaved bed" } });
    await user.click(screen.getByRole("link", { name: "All gardens" }));
    await user.click(screen.getByRole("link", { name: "Next Season" }));
    await user.click(within(screen.getByRole("navigation", { name: "Workspace sections" })).getByRole("link", { name: "Gardens" }));
    await user.click(screen.getByRole("link", { name: "Open Demo Garden" }));
    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    // A value still being typed (never blurred) is a draft that survives navigation.
    expect(screen.getByLabelText("Planting-area name")).toHaveValue("Unsaved bed");
    expect(saved().gardens[0].growingAreas[0].name).toBe("Sample raised bed");
  });

  it("asks before discarding a dirty area on close", async () => {
    const user = await openBed();
    fireEvent.change(screen.getByLabelText("Planting-area name"), { target: { value: "Pending" } });
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Planting-area name")).toHaveValue("Pending");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
    expect(screen.getByLabelText("Planting-area name")).toHaveValue("Sample raised bed");
  });
});

it("keeps a plant coordinate draft through resizing and navigation, then validates before applying", async () => {
  const user = await openBed();
  await user.click(screen.getByLabelText("Tomato plant on Garden Plan"));
  fireEvent.change(screen.getByLabelText("X position (m)"), { target: { value: "1.8" } });
  fireEvent.change(screen.getByLabelText("Width (m)"), { target: { value: "1" } });
  fireEvent.keyDown(screen.getByLabelText("Width (m)"), { key: "Enter" });
  expect(saved().gardens[0].growingAreas[0].layout.widthMeters).toBe(1);
  expect(screen.getByLabelText("X position (m)")).toHaveValue(1.8);
  expect(screen.getByText(/outside this area's current dimensions/)).toBeInTheDocument();
  const before = saved();
  fireEvent.keyDown(screen.getByLabelText("X position (m)"), { key: "Enter" });
  expect(saved()).toEqual(before);
  expect(screen.queryByRole("button", { name: "Save plant" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "All gardens" }));
  await user.click(screen.getByRole("link", { name: "Open Demo Garden" }));
  await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
  expect(screen.getByLabelText("X position (m)")).toHaveValue(1.8);
  await user.clear(screen.getByLabelText("X position (m)"));
  expect(screen.getByLabelText("X position (m)")).toHaveValue(null);
  await user.type(screen.getByLabelText("X position (m)"), "0.7{Enter}");
  expect(saved().gardens[0].growingAreas[0].layout.allocations[0].x).toBe(0.7);
  // The form stays open on the applied value.
  expect(screen.getByLabelText("X position (m)")).toHaveValue(0.7);
});

it("keeps a new plant draft through area property changes and asks before closing", async () => {
  const user = await openBed();
  await user.click(screen.getByRole("button", { name: "Add plant" }));
  fireEvent.change(screen.getByLabelText("Plant type"), { target: { value: "Kale" } });
  fireEvent.change(screen.getByLabelText("Planting-area name"), { target: { value: "Renamed bed" } });
  fireEvent.keyDown(screen.getByLabelText("Planting-area name"), { key: "Enter" });
  expect(saved().gardens[0].growingAreas[0].name).toBe("Renamed bed");
  expect(screen.getByLabelText("Plant type")).toHaveValue("Kale");
  await user.click(screen.getByRole("button", { name: "Done" }));
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Plant type")).toHaveValue("Kale");
});

it("shows the selected area's width and length below it on the plan, matching the form", async () => {
  await openBed();
  const size = screen.getByTestId("area-size-demo-raised-bed");
  const area = saved().gardens[0].growingAreas[0];
  expect(size).toHaveTextContent(`${area.layout.widthMeters} × ${area.layout.depthMeters} m`);
  expect(screen.getByLabelText("Width (m)")).toHaveValue(area.layout.widthMeters);
  expect(screen.getByLabelText("Length (m)")).toHaveValue(area.layout.depthMeters);
});

it("validates blank and negative dimensions locally without discarding the name", async () => {
  await openBed();
  fireEvent.change(screen.getByLabelText("Planting-area name"), { target: { value: "Changed" } });
  expect(screen.getByLabelText("Planting-area name")).toHaveValue("Changed");
  for (const value of ["", "0", "-1"]) {
    fireEvent.change(screen.getByLabelText("Width (m)"), { target: { value } });
    fireEvent.keyDown(screen.getByLabelText("Width (m)"), { key: "Enter" });
    expect(screen.getByLabelText("Width (m)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Width (m)")).toHaveFocus();
  }
  expect(saved().gardens[0].growingAreas[0].name).toBe("Sample raised bed");
  fireEvent.change(screen.getByLabelText("Width (m)"), { target: { value: "2.5" } });
  fireEvent.blur(screen.getByLabelText("Width (m)"));
  expect(saved().gardens[0].growingAreas[0]).toMatchObject({ name: "Changed", layout: expect.objectContaining({ widthMeters: 2.5 }) });
});

it("warns before unloading dirty drafts, and stops after explicit discard", async () => {
  const user = await openBed();
  fireEvent.change(screen.getByLabelText("Planting-area name"), { target: { value: "Unsaved" } });
  const dirtyEvent = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(dirtyEvent);
  expect(dirtyEvent.defaultPrevented).toBe(true);
  await user.click(screen.getByRole("button", { name: "Done" }));
  await user.click(screen.getByRole("button", { name: "Discard changes" }));
  const cleanEvent = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(cleanEvent);
  expect(cleanEvent.defaultPrevented).toBe(false);
});

it("keeps separate drafts for different planting areas", async () => {
  const user = await openBed();
  fireEvent.change(screen.getByLabelText("Planting-area name"), { target: { value: "Raised draft" } });
  const links = screen.getAllByLabelText(/^Open .* on Garden Plan$/);
  const other = links.find((link) => link.getAttribute("aria-label") !== "Open Sample raised bed on Garden Plan")!;
  const otherLabel = other.getAttribute("aria-label")!;
  await user.click(other);
  fireEvent.change(screen.getByLabelText("Planting-area name"), { target: { value: "Second draft" } });
  await user.click(screen.getByLabelText("Open Sample raised bed on Garden Plan"));
  expect(screen.getByLabelText("Planting-area name")).toHaveValue("Raised draft");
  await user.click(screen.getByLabelText(otherLabel));
  expect(screen.getByLabelText("Planting-area name")).toHaveValue("Second draft");
});

it("allows appending a word to the saved name without swallowing the intervening space", async () => {
  const user = await openBed();
  await user.type(screen.getByLabelText("Planting-area name"), " west");
  expect(screen.getByLabelText("Planting-area name")).toHaveValue("Sample raised bed west");
});
