import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GardenPlanOverview } from "./GardenPlanOverview";
import { GrowingAreaLayoutEditor } from "./GrowingAreaLayoutEditor";
import { areaFocusViewport, areaPlanCorners, createRectangularLayout, gardenPlanViewport, type GrowingArea, type LayoutPoint } from "@/lib/gardenWorkspace";
import { areaLocalToPlan } from "@/lib/planGeometry";
import type { CanvasPlanting } from "./GardenPlanOverview";
import { fitCanvas, metresToCanvas } from "@/lib/canvasViewport";
import { areaAppearances } from "@/lib/planAppearance";

const size = vi.hoisted(() => ({ width: 700, height: 420 }));
vi.mock("@/hooks/useCanvasSize", async () => {
  const { useRef } = await import("react");
  return { useCanvasSize: () => ({ ref: useRef(null), ...size }) };
});
const plan = { widthMeters: 100, depthMeters: 80 };
function bed(): GrowingArea { return { id: "bed", name: "North bed", kind: "raised-bed", planPlacement: { x: 2, y: 3, rotationDegrees: 45 }, layout: createRectangularLayout(4, 2) }; }
beforeEach(() => { size.width = 700; size.height = 420; });

describe("responsive canvas interactions", () => {
  it("uses the compact thumbnail for the bed when the surrounding garden is large", () => {
    size.width = 176;
    size.height = 112;
    const area = { ...bed(), planPlacement: { x: 30, y: 40, rotationDegrees: 0 } };
    const { container } = render(<GardenPlanOverview compact plan={plan} growingAreas={[area]} />);
    // Rectangular beds draw as a Rect filled with their type colour.
    const outline = container.querySelector(`[fill="${areaAppearances["raised-bed"].fill}"]`);
    expect(Number(outline?.getAttribute("width"))).toBeGreaterThan(size.width * 0.7);
  });

  it("keeps nearby thumbnail labels from overlapping on narrow cards", () => {
    size.width = 270;
    size.height = 202;
    const first = { ...bed(), id: "first", name: "Planting bed 1", planPlacement: { x: 0, y: 0, rotationDegrees: 0 } };
    const second = { ...first, id: "second", name: "Planting bed 2", planPlacement: { x: 4.1, y: 0, rotationDegrees: 0 } };
    const distant = { ...first, id: "distant", name: "Distant bed", planPlacement: { x: 22, y: 0, rotationDegrees: 0 } };
    render(<GardenPlanOverview compact plan={plan} growingAreas={[first, second, distant]} />);
    const firstLabel = screen.getByTestId("area-label-first");
    const secondLabel = screen.getByTestId("area-label-second");
    expect(Math.abs(Number(secondLabel.getAttribute("x")) - Number(firstLabel.getAttribute("x")))).toBeLessThan(Number(firstLabel.getAttribute("width")));
    expect(Math.abs(Number(secondLabel.getAttribute("y")) - Number(firstLabel.getAttribute("y")))).toBeGreaterThanOrEqual(16);
  });

  it("waits for a nonzero size and zooming does not edit stored geometry", async () => {
    size.width = 0;
    const onPlacementChange = vi.fn(); const area = bed();
    const props = { plan, growingAreas: [area], editable: true, onPlacementChange, onExitArea: vi.fn() };
    const view = render(<GardenPlanOverview {...props} />);
    expect(screen.getByText("Preparing garden view…")).toBeVisible();
    expect(screen.queryByLabelText(/Garden Plan, /)).not.toBeInTheDocument();
    size.width = 358; size.height = 320; view.rerender(<GardenPlanOverview {...props} />);
    expect(screen.getByLabelText(/Garden Plan, /)).toHaveAttribute("width", "358");
    view.rerender(<GardenPlanOverview {...props} selectedAreaId="bed" />);
    view.rerender(<GardenPlanOverview {...props} />);
    expect(onPlacementChange).not.toHaveBeenCalled();
    expect(area).toEqual(bed());
  });

  it("pins the rendered transform during a drag and uses it for metre conversion after resize", async () => {
    const onPlacementChange = vi.fn(); const area = bed();
    const props = { plan, growingAreas: [area], editable: true, onPlacementChange };
    const view = render(<GardenPlanOverview {...props} />);
    const node = screen.getByLabelText("Open North bed on Garden Plan");
    // A mouse drags areas directly: no Move mode (ADR-0072, phase G4).
    expect(node).toHaveAttribute("draggable", "true");
    expect(screen.queryByRole("button", { name: "Move planting areas" })).not.toBeInTheDocument();
    const transform = fitCanvas(gardenPlanViewport(plan, [area], "growing-areas"), size.width, size.height)!;
    fireEvent.dragStart(node);
    size.width = 358; size.height = 320;
    view.rerender(<GardenPlanOverview {...props} />);
    expect(screen.getByLabelText(/Garden Plan, /)).toHaveAttribute("width", "700");
    const target = metresToCanvas({ x: 5.24, y: 6.27 }, transform);
    const position = vi.fn();
    Object.assign(node, { x: () => target.x, y: () => target.y, position });
    fireEvent.pointerUp(node);
    // The node returns to its rendered position; the saved placement redraws it.
    expect(position).toHaveBeenCalledWith(metresToCanvas(area.planPlacement, transform));
    expect(onPlacementChange).toHaveBeenCalledExactlyOnceWith("bed", { x: 5.2, y: 6.3, rotationDegrees: 45 });
    expect(screen.getByLabelText(/Garden Plan, /)).toHaveAttribute("width", "358");
  });

  it("restores the original map position on Escape without submitting a move", async () => {
    const area = bed();
    const onPlacementChange = vi.fn();
    render(<GardenPlanOverview plan={plan} growingAreas={[area]} editable onPlacementChange={onPlacementChange} />);
    const node = screen.getByLabelText("Open North bed on Garden Plan");
    const position = vi.fn();
    const stopDrag = vi.fn();
    Object.assign(node, { position, stopDrag });
    fireEvent.dragStart(node);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(node);
    const transform = fitCanvas(gardenPlanViewport(plan, [area], "growing-areas"), size.width, size.height)!;
    expect(stopDrag).toHaveBeenCalledOnce();
    expect(position).toHaveBeenCalledWith(metresToCanvas(area.planPlacement, transform));
    expect(onPlacementChange).not.toHaveBeenCalled();
  });

  it("lists tiny plants as keyboard buttons that open the same spacing", async () => {
    const user = userEvent.setup(); const area = bed();
    area.layout!.allocations = [{ id: "tiny", label: "Tiny basil", diameterMeters: 0.1, x: 1, y: 1 }];
    render(<GrowingAreaLayoutEditor area={area} onChange={vi.fn()} onArchivePlantingRecord={vi.fn()} />);
    expect(screen.queryByLabelText(/Metric layout/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Tiny basil" }));
    expect(screen.getByLabelText("Plant type")).toHaveValue("Tiny basil");
    expect(screen.getByRole("button", { name: "Remove plant" })).toBeVisible();
    expect(screen.getByLabelText("Plant spacing (m)")).toHaveValue(0.1);
  });
});

describe("zooming into one planting area", () => {
  const near = (): GrowingArea => ({ id: "near", name: "Near bed", kind: "in-ground", planPlacement: { x: 9, y: 3, rotationDegrees: 0 }, layout: createRectangularLayout(2, 1) });
  const groupPosition = (name: string) => {
    const node = screen.getByLabelText(`Open ${name} on Garden Plan`);
    return { x: Number(node.getAttribute("x")), y: Number(node.getAttribute("y")) };
  };
  const reducedMotion = (matches: boolean) => vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: matches && media.includes("reduced-motion"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));

  it("frames a rotated area inside the canvas and dims the other areas", () => {
    const area = { ...bed(), planPlacement: { x: 2, y: 3, rotationDegrees: 30 } };
    render(<GardenPlanOverview plan={plan} growingAreas={[area, near()]} editable selectedAreaId="bed" onExitArea={vi.fn()} />);
    const transform = fitCanvas(areaFocusViewport(area)!, size.width, size.height)!;
    const whole = fitCanvas(gardenPlanViewport(plan, [area, near()], "growing-areas"), size.width, size.height)!;
    expect(transform.scale).toBeGreaterThan(whole.scale);
    expect(groupPosition("North bed")).toEqual(metresToCanvas(area.planPlacement, transform));
    for (const corner of areaPlanCorners(area)) {
      const pixel = metresToCanvas(corner, transform);
      expect(pixel.x).toBeGreaterThanOrEqual(transform.padding);
      expect(pixel.x).toBeLessThanOrEqual(size.width - transform.padding);
      expect(pixel.y).toBeGreaterThanOrEqual(transform.padding);
      expect(pixel.y).toBeLessThanOrEqual(size.height - transform.padding);
    }
    expect(screen.getByLabelText("Open North bed on Garden Plan")).toHaveAttribute("opacity", "1");
    expect(screen.getByLabelText("Open Near bed on Garden Plan")).toHaveAttribute("opacity", "0.35");
    expect(screen.getByTestId("area-label-bed")).toBeInTheDocument();
    expect(screen.queryByTestId("area-label-near")).not.toBeInTheDocument();
    expect(screen.getByText("Viewing North bed. Drag it to move it, or drag its corner to resize it. Escape returns to the whole garden.")).toBeInTheDocument();
    // Only the zoomed area moves; the dimmed neighbour is not draggable.
    expect(screen.getByLabelText("Open North bed on Garden Plan")).toHaveAttribute("draggable", "true");
    expect(screen.getByLabelText("Open Near bed on Garden Plan")).toHaveAttribute("draggable", "false");
  });

  it("returns with Whole garden or Escape, but leaves Escape to text fields and drags", async () => {
    const user = userEvent.setup(); const onExitArea = vi.fn();
    render(<><input aria-label="Notes" /><GardenPlanOverview plan={plan} growingAreas={[bed(), near()]} editable selectedAreaId="bed" onExitArea={onExitArea} onPlacementChange={vi.fn()} /></>);
    await user.click(screen.getByRole("button", { name: "Whole garden" }));
    expect(onExitArea).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExitArea).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByLabelText("Notes"), { key: "Escape" });
    expect(onExitArea).toHaveBeenCalledTimes(2);
    const node = screen.getByLabelText("Open North bed on Garden Plan");
    Object.assign(node, { position: vi.fn(), stopDrag: vi.fn() });
    fireEvent.dragStart(node);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExitArea).toHaveBeenCalledTimes(2);
  });

  it("animates between the whole garden and the area, and switches at once with reduced motion", async () => {
    const area = bed(); const areas = [area, near()];
    const whole = fitCanvas(gardenPlanViewport(plan, areas, "growing-areas"), size.width, size.height)!;
    const zoomed = fitCanvas(areaFocusViewport(area)!, size.width, size.height)!;
    reducedMotion(false);
    const view = render(<GardenPlanOverview plan={plan} growingAreas={areas} editable onExitArea={vi.fn()} />);
    expect(groupPosition("North bed")).toEqual(metresToCanvas(area.planPlacement, whole));
    view.rerender(<GardenPlanOverview plan={plan} growingAreas={areas} editable selectedAreaId="bed" onExitArea={vi.fn()} />);
    // The first frame starts from the whole-garden view rather than jumping.
    expect(groupPosition("North bed")).toEqual(metresToCanvas(area.planPlacement, whole));
    await vi.waitFor(() => expect(groupPosition("North bed")).toEqual(metresToCanvas(area.planPlacement, zoomed)), { timeout: 2000 });
    reducedMotion(true);
    view.rerender(<GardenPlanOverview plan={plan} growingAreas={areas} editable onExitArea={vi.fn()} />);
    expect(groupPosition("North bed")).toEqual(metresToCanvas(area.planPlacement, whole));
  });

  it("keeps a selected area without a size on the whole-garden frame", () => {
    const unsized: GrowingArea = { id: "unsized", name: "New bed", kind: "raised-bed", planPlacement: { x: 0, y: 0, rotationDegrees: 0 } };
    render(<GardenPlanOverview plan={plan} growingAreas={[bed(), unsized]} editable selectedAreaId="unsized" onExitArea={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Whole garden" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Open North bed on Garden Plan")).toHaveAttribute("opacity", "1");
  });
});

describe("planting on the zoomed area", () => {
  const rotated = (): GrowingArea => ({ ...bed(), planPlacement: { x: 2, y: 3, rotationDegrees: 30 }, layout: { ...createRectangularLayout(4, 2), allocations: [
    { id: "basil", label: "Basil", x: 1, y: 1, diameterMeters: 0.4 },
    { id: "crowded", label: "Kale", x: 1.3, y: 1, diameterMeters: 0.4 },
    { id: "edge", label: "Squash", x: 3.9, y: 1, diameterMeters: 1 },
  ] } });
  const other = (): GrowingArea => ({ id: "other", name: "Other bed", kind: "in-ground", planPlacement: { x: 9, y: 3, rotationDegrees: 0 }, layout: { ...createRectangularLayout(1, 1), allocations: [{ id: "far", label: "Carrot", x: 0.5, y: 0.5, diameterMeters: 0.3 }] } });
  const planting = (overrides: Partial<CanvasPlanting> = {}): CanvasPlanting => ({
    areaId: "bed", onSelectPlant: vi.fn(), onMovePlant: vi.fn(), onPlacePlant: vi.fn(), onStopPlacing: vi.fn(), ...overrides,
  });
  const renderPlan = (props: { planting: CanvasPlanting; onExitArea?: () => void; onEditLayout?: (id: string) => void }) => {
    const area = rotated();
    render(<GardenPlanOverview plan={plan} growingAreas={[area, other()]} editable selectedAreaId="bed" onPlacementChange={vi.fn()} onExitArea={props.onExitArea ?? vi.fn()} onEditLayout={props.onEditLayout} planting={props.planting} />);
    return { area, transform: fitCanvas(areaFocusViewport(area)!, size.width, size.height)! };
  };
  const pointerAt = (node: HTMLElement, pixel: LayoutPoint) => Object.assign(node, { getStage: () => ({ getPointerPosition: () => pixel }) });

  it("places a plant where a click lands inside a rotated area, snapped and kept inside", () => {
    const actions = planting({ placing: { label: "Basil", diameterMeters: 0.4, color: "#519a55" } });
    const { area, transform } = renderPlan({ planting: actions });
    const layer = screen.getByLabelText("Place Basil on North bed");
    pointerAt(layer, metresToCanvas(areaLocalToPlan(area, { x: 2.53, y: 0.07 }), transform));
    fireEvent.mouseMove(layer);
    expect(screen.getByTestId("placement-preview")).toHaveAttribute("x", String(2.5 * transform.scale));
    fireEvent.click(layer);
    expect(actions.onPlacePlant).toHaveBeenCalledExactlyOnceWith({ x: 2.5, y: 0.2 });
    expect(screen.getByText("Basil placed at 2.5, 0.2 m. Click to place another; Escape stops.")).toBeInTheDocument();
  });

  it("ignores a placement click outside the area and explains where to click", () => {
    const actions = planting({ placing: { label: "Basil", diameterMeters: 0.4, color: "#519a55" } });
    const { area, transform } = renderPlan({ planting: actions });
    const layer = screen.getByLabelText("Place Basil on North bed");
    pointerAt(layer, metresToCanvas(areaLocalToPlan(area, { x: -0.5, y: 1 }), transform));
    fireEvent.mouseMove(layer);
    expect(screen.queryByTestId("placement-preview")).not.toBeInTheDocument();
    fireEvent.click(layer);
    expect(actions.onPlacePlant).not.toHaveBeenCalled();
    expect(screen.getByText("Click inside North bed to place Basil.")).toBeInTheDocument();
  });

  it("stops placing on Escape before leaving the zoomed area", () => {
    const onExitArea = vi.fn();
    const actions = planting({ placing: { label: "Basil", diameterMeters: 0.4, color: "#519a55" } });
    renderPlan({ planting: actions, onExitArea });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(actions.onStopPlacing).toHaveBeenCalledOnce();
    expect(onExitArea).not.toHaveBeenCalled();
  });

  it("selects and drags plants in the zoomed area only, and marks spacing warnings", () => {
    const onEditLayout = vi.fn();
    const actions = planting({ selectedPlantId: "basil" });
    const { transform } = renderPlan({ planting: actions, onEditLayout });
    const basil = screen.getByLabelText("Basil plant on Garden Plan");
    expect(basil).toHaveAttribute("draggable", "true");
    expect(basil).toHaveAttribute("stroke", "#2f6846");
    expect(screen.getByLabelText("Kale plant on Garden Plan")).toHaveAttribute("data-warning", "true");
    expect(screen.getByLabelText("Squash plant on Garden Plan")).toHaveAttribute("data-warning", "true");
    expect(screen.getByLabelText("Carrot plant on Garden Plan")).toHaveAttribute("draggable", "false");
    fireEvent.click(screen.getByLabelText("Kale plant on Garden Plan"));
    expect(actions.onSelectPlant).toHaveBeenCalledWith("crowded");
    fireEvent.click(screen.getByLabelText("Carrot plant on Garden Plan"));
    expect(onEditLayout).toHaveBeenCalledWith("other");
    fireEvent.dragStart(basil);
    Object.assign(basil, { x: () => 2.04 * transform.scale, y: () => 0.36 * transform.scale });
    fireEvent.pointerUp(basil);
    expect(actions.onMovePlant).toHaveBeenCalledExactlyOnceWith("basil", { x: 2, y: 0.4 });
  });

  it("cancels a plant drag on Escape without moving it or leaving the area", () => {
    const onExitArea = vi.fn();
    const actions = planting();
    renderPlan({ planting: actions, onExitArea });
    const basil = screen.getByLabelText("Basil plant on Garden Plan");
    const position = vi.fn(); const stopDrag = vi.fn();
    Object.assign(basil, { position, stopDrag });
    fireEvent.dragStart(basil);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(basil);
    expect(stopDrag).toHaveBeenCalledOnce();
    expect(actions.onMovePlant).not.toHaveBeenCalled();
    expect(onExitArea).not.toHaveBeenCalled();
  });

  it("disables plant dragging while placing", () => {
    renderPlan({ planting: planting({ placing: { label: "Basil", diameterMeters: 0.4, color: "#519a55" } }) });
    expect(screen.getByLabelText("Basil plant on Garden Plan")).toHaveAttribute("draggable", "false");
  });
});

describe("plant panel", () => {
  const panel = (allocations: GrowingArea["layout"] extends infer L ? L extends { allocations: infer A } ? A : never : never = []) => {
    const onChange = vi.fn(); const onArchivePlantingRecord = vi.fn();
    const area: GrowingArea = { ...bed(), planPlacement: { x: 0, y: 0, rotationDegrees: 0 }, layout: { ...createRectangularLayout(2, 1), allocations } };
    const view = render(<GrowingAreaLayoutEditor area={area} onChange={onChange} onArchivePlantingRecord={onArchivePlantingRecord} />);
    return { area, onChange, onArchivePlantingRecord, view };
  };

  it("suggests sourced spacing for a known plant and keeps a spacing the user typed", async () => {
    const user = userEvent.setup();
    panel();
    await user.click(screen.getByRole("button", { name: "Add plant" }));
    await user.type(screen.getByLabelText("Plant type"), "Tomato");
    expect(screen.getByLabelText("Plant spacing (m)")).toHaveValue(0.5);
    expect(screen.getByText(/Suggested for Tomato: 0.5 m \(18 in, staked/)).toHaveTextContent("University of Missouri Extension G6201");
    expect(screen.getByText("Click inside North bed on the plan to place Tomato. Escape stops.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Plant spacing (m)"), { target: { value: "0.7" } });
    await user.clear(screen.getByLabelText("Plant type"));
    await user.type(screen.getByLabelText("Plant type"), "Pepper");
    expect(screen.getByLabelText("Plant spacing (m)")).toHaveValue(0.7);
  });

  it("fills the area at the plant's spacing as one named change", async () => {
    const user = userEvent.setup();
    const { onChange } = panel();
    await user.click(screen.getByRole("button", { name: "Add plant" }));
    await user.type(screen.getByLabelText("Plant type"), "Basil");
    fireEvent.change(screen.getByLabelText("Plant spacing (m)"), { target: { value: "0.5" } });
    await user.click(screen.getByRole("button", { name: "Fill area" }));
    const [filled, label] = onChange.mock.lastCall!;
    expect(filled.allocations).toHaveLength(8);
    expect(label).toBe("fill North bed with Basil");
    // The plan's Undo replaces G3's "Undo fill" button (ADR-0072, phase G5).
    expect(screen.getByText("Placed 8 Basil. Undo removes them.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo fill" })).not.toBeInTheDocument();
  });

  it("lists spacing warnings and plant groups without blocking edits", () => {
    panel([
      { id: "a", label: "Basil", plantType: "Basil", x: 0.5, y: 0.5, diameterMeters: 0.4 },
      { id: "b", label: "Basil", plantType: "Basil", x: 0.7, y: 0.5, diameterMeters: 0.4 },
      { id: "c", label: "Squash", plantType: "Squash", x: 1.9, y: 0.5, diameterMeters: 1.2 },
    ]);
    const warnings = screen.getByRole("region", { name: "Spacing warnings" });
    expect(warnings).toHaveTextContent("Basil and Basil are closer than their spacing.");
    expect(warnings).toHaveTextContent("Squash reaches past the edge of North bed.");
    expect(screen.getByRole("region", { name: "Plant groups" })).toHaveTextContent("Basil × 2");
    expect(screen.getByRole("region", { name: "Plant groups" })).toHaveTextContent("Squash × 1");
  });

  it("finishes adding with Done without asking to discard the plant choice", async () => {
    const user = userEvent.setup();
    panel();
    await user.click(screen.getByRole("button", { name: "Add plant" }));
    await user.type(screen.getByLabelText("Plant type"), "Basil");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Plant type")).not.toBeInTheDocument();
  });
});

describe("placing and sizing planting areas directly (ADR-0072, phase G4)", () => {
  const coarsePointer = () => vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: media === "(pointer: coarse)", addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const square = (): GrowingArea => ({ id: "bed", name: "North bed", kind: "raised-bed", planPlacement: { x: 2, y: 3, rotationDegrees: 0 }, layout: createRectangularLayout(4, 2) });

  it("resizes the zoomed area from its corner handle, snapped, without moving it", () => {
    const onResizeArea = vi.fn(); const onPlacementChange = vi.fn(); const area = square();
    render(<GardenPlanOverview plan={plan} growingAreas={[area]} editable selectedAreaId="bed" onExitArea={vi.fn()} onPlacementChange={onPlacementChange} onResizeArea={onResizeArea} />);
    const transform = fitCanvas(areaFocusViewport(area)!, size.width, size.height)!;
    const handle = screen.getByLabelText("Resize North bed");
    expect(handle).toHaveAttribute("x", String(4 * transform.scale));
    expect(handle).toHaveAttribute("y", String(2 * transform.scale));
    Object.assign(handle, { position: vi.fn(), stopDrag: vi.fn(), x: () => 5.04 * transform.scale, y: () => 1.47 * transform.scale });
    fireEvent.dragStart(handle);
    expect(screen.getByTestId("resize-preview")).toHaveAttribute("width", String(4 * transform.scale));
    fireEvent.pointerUp(handle);
    expect(onResizeArea).toHaveBeenCalledExactlyOnceWith("bed", { widthMeters: 5, depthMeters: 1.5 });
    expect(onPlacementChange).not.toHaveBeenCalled();
    expect(screen.getByText("North bed resized to 5 × 1.5 m.")).toBeInTheDocument();
    expect(screen.queryByTestId("resize-preview")).not.toBeInTheDocument();
  });

  it("cancels a resize on Escape before leaving the zoomed area", () => {
    const onResizeArea = vi.fn(); const onExitArea = vi.fn();
    render(<GardenPlanOverview plan={plan} growingAreas={[square()]} editable selectedAreaId="bed" onExitArea={onExitArea} onPlacementChange={vi.fn()} onResizeArea={onResizeArea} />);
    const handle = screen.getByLabelText("Resize North bed");
    const position = vi.fn(); const stopDrag = vi.fn();
    Object.assign(handle, { position, stopDrag });
    fireEvent.dragStart(handle);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(handle);
    expect(stopDrag).toHaveBeenCalledOnce();
    expect(position).toHaveBeenCalled();
    expect(onResizeArea).not.toHaveBeenCalled();
    expect(onExitArea).not.toHaveBeenCalled();
  });

  it("shows no resize handle in the whole-garden view, for rotated outlines it cannot keep, or while placing plants", () => {
    const view = render(<GardenPlanOverview plan={plan} growingAreas={[square()]} editable onPlacementChange={vi.fn()} onResizeArea={vi.fn()} />);
    expect(screen.queryByLabelText("Resize North bed")).not.toBeInTheDocument();
    expect(screen.getByText("Click an area to open it, or drag it to move it. Escape cancels a move.")).toBeInTheDocument();
    const placing: CanvasPlanting = { areaId: "bed", placing: { label: "Basil", diameterMeters: 0.4, color: "#519a55" }, onSelectPlant: vi.fn(), onMovePlant: vi.fn(), onPlacePlant: vi.fn(), onStopPlacing: vi.fn() };
    view.rerender(<GardenPlanOverview plan={plan} growingAreas={[square()]} editable selectedAreaId="bed" onExitArea={vi.fn()} onPlacementChange={vi.fn()} onResizeArea={vi.fn()} planting={placing} />);
    expect(screen.queryByLabelText("Resize North bed")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Open North bed on Garden Plan")).toHaveAttribute("draggable", "false");
  });

  it("keeps the Move mode on touch screens so the canvas scrolls the page until Move is on", async () => {
    coarsePointer();
    const user = userEvent.setup();
    render(<GardenPlanOverview plan={plan} growingAreas={[square()]} editable selectedAreaId="bed" onExitArea={vi.fn()} onPlacementChange={vi.fn()} onResizeArea={vi.fn()} />);
    const node = screen.getByLabelText("Open North bed on Garden Plan");
    expect(node).toHaveAttribute("draggable", "false");
    expect(screen.queryByLabelText("Resize North bed")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Garden Plan, /)).toHaveStyle({ touchAction: "pan-y" });
    await user.click(screen.getByRole("button", { name: "Move planting areas" }));
    expect(node).toHaveAttribute("draggable", "true");
    expect(screen.getByLabelText("Resize North bed")).toBeInTheDocument();
    expect(screen.getByLabelText(/Garden Plan, /)).toHaveStyle({ touchAction: "none" });
    expect(screen.getByText("Drag an area. Escape cancels a move.")).toBeInTheDocument();
  });

  it("outlines both overlapping areas and explains the overlap without blocking a move", () => {
    const first = square();
    const second: GrowingArea = { ...square(), id: "east", name: "East bed", planPlacement: { x: 5, y: 4, rotationDegrees: 0 } };
    const apart: GrowingArea = { ...square(), id: "far", name: "Far bed", planPlacement: { x: 40, y: 40, rotationDegrees: 0 } };
    render(<GardenPlanOverview plan={plan} growingAreas={[first, second, apart]} editable onPlacementChange={vi.fn()} />);
    expect(screen.getByLabelText("Open North bed on Garden Plan")).toHaveAttribute("data-overlap", "true");
    expect(screen.getByLabelText("Open East bed on Garden Plan")).toHaveAttribute("data-overlap", "true");
    expect(screen.getByLabelText("Open Far bed on Garden Plan")).not.toHaveAttribute("data-overlap");
    expect(screen.getByTestId("overlap-bed")).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Overlapping planting areas" })).toHaveTextContent("North bed and East bed overlap. Move one if they are separate spaces on the ground.");
    expect(screen.getByLabelText("Open East bed on Garden Plan")).toHaveAttribute("draggable", "true");
  });

  it("lists areas without a size under Needs a size and places one only when asked", async () => {
    const user = userEvent.setup(); const onPlaceArea = vi.fn();
    const unsized: GrowingArea = { id: "old", name: "Old greenhouse", kind: "greenhouse", planPlacement: { x: 0, y: 0, rotationDegrees: 0 } };
    render(<GardenPlanOverview plan={plan} growingAreas={[square(), unsized]} editable onPlacementChange={vi.fn()} onPlaceArea={onPlaceArea} />);
    const needsSize = screen.getByRole("region", { name: "Needs a size" });
    expect(needsSize).toHaveTextContent("Old greenhouse");
    expect(needsSize).toHaveTextContent("Uses the standard greenhouse size, 2.5 × 3 m.");
    expect(screen.queryByLabelText("Open Old greenhouse on Garden Plan")).not.toBeInTheDocument();
    expect(onPlaceArea).not.toHaveBeenCalled();
    await user.click(within(needsSize).getByRole("button", { name: "Place Old greenhouse on plan" }));
    expect(onPlaceArea).toHaveBeenCalledExactlyOnceWith("old");
  });
});
