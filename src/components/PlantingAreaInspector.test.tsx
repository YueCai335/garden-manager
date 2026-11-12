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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledOnce();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
});

it("rejects blank and out-of-bound area coordinates and saves a complete position without losing plants", () => {
  const area = createDemoGardenWorkspace().gardens[0].growingAreas[0];
  const save = vi.fn(() => true);
  render(<Inspector area={area} save={save} />);
  for (const value of ["", "-1", "11"]) {
    fireEvent.change(screen.getByLabelText("Area X position (m)"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByLabelText("Area X position (m)")).toHaveFocus();
    expect(screen.getByLabelText("Area X position (m)")).toHaveAttribute("aria-invalid", "true");
  }
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Area X position (m)"), { target: { value: "2.34" } });
  fireEvent.change(screen.getByLabelText("Area Y position (m)"), { target: { value: "1.27" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenLastCalledWith(area.id, "Draft bed", area.kind, 0, expect.any(Object), { x: 5, y: 1 });
  fireEvent.change(screen.getByLabelText("Area X position (m)"), { target: { value: "2.5" } });
  view.rerender(<Inspector area={{ ...moved, planPlacement: { ...moved.planPlacement, x: 7 } }} save={save} />);
  expect(screen.getByLabelText("Area X position (m)")).toHaveValue(2.5);
  expect(screen.getByText(/These properties changed elsewhere/)).toBeInTheDocument();
});

it("nudges only the selected coordinate and waits for Save before applying it", () => {
  const area = createDemoGardenWorkspace().gardens[0].growingAreas[0];
  const save = vi.fn(() => true);
  render(<Inspector area={{ ...area, planPlacement: { ...area.planPlacement, x: 0 } }} save={save} />);
  expect(screen.getByRole("button", { name: "Move left 0.1 m" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Move right 0.1 m" }));
  expect(screen.getByLabelText("Area X position (m)")).toHaveValue(0.1);
  expect(screen.getByLabelText("Area Y position (m)")).toHaveValue(area.planPlacement.y);
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledWith(area.id, area.name, area.kind, 0, expect.any(Object), { x: 0.1, y: area.planPlacement.y });
});
