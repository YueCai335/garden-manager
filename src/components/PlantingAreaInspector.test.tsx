import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlantingAreaInspector } from "@/components/PlantingAreaInspector";
import { createDemoGardenWorkspace, type GrowingArea } from "@/lib/gardenWorkspace";
import { type AreaPropertiesDraft } from "@/lib/areaEditorDrafts";

function Inspector({ area, save = () => true }: { area: GrowingArea; save?: () => boolean }) {
  const [draft, setDraft] = useState<AreaPropertiesDraft>();
  return <PlantingAreaInspector plan={{ widthMeters: 10, depthMeters: 6 }} area={area} draft={draft} onDraftChange={setDraft} onDiscardPlants={() => {}} onClose={() => {}} onDelete={() => {}} onSave={save}>{null}</PlantingAreaInspector>;
}

describe("area baseline conflicts", () => {
  it("keeps dirty properties through allocation and placement updates, reports property conflicts, and reloads explicitly", () => {
    const area = createDemoGardenWorkspace().gardens[0].growingAreas[0];
    const { rerender } = render(<Inspector area={area} />);
    fireEvent.change(screen.getByLabelText("Planting-area name"), { target: { value: "My unsaved bed" } });
    rerender(<Inspector area={{ ...area, planPlacement: { ...area.planPlacement, x: 5 }, layout: { ...area.layout!, allocations: [] } }} />);
    expect(screen.getByLabelText("Planting-area name")).toHaveValue("My unsaved bed");
    expect(screen.queryByText(/These properties changed elsewhere/)).not.toBeInTheDocument();
    rerender(<Inspector area={{ ...area, name: "Remote name", planPlacement: { ...area.planPlacement, rotationDegrees: 90 } }} />);
    expect(screen.getByLabelText("Planting-area name")).toHaveValue("My unsaved bed");
    expect(screen.getByText(/These properties changed elsewhere/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload properties" }));
    expect(screen.getByLabelText("Planting-area name")).toHaveValue("Remote name");
    expect(screen.getByLabelText("Rotation (degrees)")).toHaveValue(90);
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("updates clean properties from current data and retains a rejected save", () => {
    const area = createDemoGardenWorkspace().gardens[0].growingAreas[0];
    const save = vi.fn(() => false);
    const { rerender } = render(<Inspector area={area} save={save} />);
    rerender(<Inspector area={{ ...area, name: "Remote name" }} save={save} />);
    expect(screen.getByLabelText("Planting-area name")).toHaveValue("Remote name");
    fireEvent.change(screen.getByLabelText("Planting-area name"), { target: { value: "Draft" } });
    fireEvent.blur(screen.getByLabelText("Planting-area name"));
    expect(save).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Planting-area name")).toHaveValue("Draft");
  });
});

it("rejects blank and out-of-bound area coordinates on Enter or blur and applies a complete position", () => {
  const area = createDemoGardenWorkspace().gardens[0].growingAreas[0];
  const save = vi.fn(() => true);
  render(<Inspector area={area} save={save} />);
  const x = screen.getByLabelText("Area X position (m)");
  for (const value of ["", "-1", "11"]) {
    fireEvent.change(x, { target: { value } });
    fireEvent.keyDown(screen.getByLabelText("Planting-area name"), { key: "Enter" });
    expect(x).toHaveFocus();
    expect(x).toHaveAttribute("aria-invalid", "true");
  }
  fireEvent.blur(x);
  expect(screen.getByText("Not applied yet: fix the highlighted values.")).toBeInTheDocument();
  expect(x).toHaveValue(11);
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(x, { target: { value: "2.34" } });
  fireEvent.change(screen.getByLabelText("Area Y position (m)"), { target: { value: "1.27" } });
  fireEvent.keyDown(screen.getByLabelText("Area Y position (m)"), { key: "Enter" });
  expect(save).toHaveBeenCalledWith(area.id, area.name, area.kind, 0, expect.any(Object), { x: 2.34, y: 1.27 });
});

it("follows a drag for untouched positions but preserves an explicitly typed position during remote updates", () => {
  const area = createDemoGardenWorkspace().gardens[0].growingAreas[0];
  const save = vi.fn(() => true);
  const view = render(<Inspector area={area} save={save} />);
  fireEvent.change(screen.getByLabelText("Planting-area name"), { target: { value: "Draft bed" } });
  const moved = { ...area, planPlacement: { ...area.planPlacement, x: 5 } };
  view.rerender(<Inspector area={moved} save={save} />);
  expect(screen.getByLabelText("Area X position (m)")).toHaveValue(5);
  expect(screen.queryByText(/These properties changed elsewhere/)).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByLabelText("Planting-area name"), { key: "Enter" });
  expect(save).toHaveBeenLastCalledWith(area.id, "Draft bed", area.kind, 0, expect.any(Object), { x: 5, y: 1 });
  fireEvent.change(screen.getByLabelText("Area X position (m)"), { target: { value: "2.5" } });
  view.rerender(<Inspector area={{ ...moved, planPlacement: { ...moved.planPlacement, x: 7 } }} save={save} />);
  expect(screen.getByLabelText("Area X position (m)")).toHaveValue(2.5);
  expect(screen.getByText(/These properties changed elsewhere/)).toBeInTheDocument();
});

it("applies a 0.1 m nudge to only the selected coordinate at once", () => {
  const area = createDemoGardenWorkspace().gardens[0].growingAreas[0];
  const save = vi.fn(() => true);
  render(<Inspector area={{ ...area, planPlacement: { ...area.planPlacement, x: 0 } }} save={save} />);
  expect(screen.getByRole("button", { name: "Move left 0.1 m" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Move right 0.1 m" }));
  expect(save).toHaveBeenCalledExactlyOnceWith(area.id, area.name, area.kind, 0, expect.any(Object), { x: 0.1, y: area.planPlacement.y });
});

it("has no Save button, ignores a blur that changes nothing, and applies the type at once", () => {
  const area = createDemoGardenWorkspace().gardens[0].growingAreas[0];
  const save = vi.fn(() => true);
  render(<Inspector area={area} save={save} />);
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  expect(screen.getByText("Changes apply when you leave a field or press Enter. Undo reverses them.")).toBeInTheDocument();
  fireEvent.blur(screen.getByLabelText("Width (m)"));
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Planting-area type"), { target: { value: "greenhouse" } });
  expect(save).toHaveBeenCalledExactlyOnceWith(area.id, area.name, "greenhouse", 0, expect.any(Object), area.planPlacement && { x: area.planPlacement.x, y: area.planPlacement.y });
});
