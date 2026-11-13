import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GardenPlanOverview } from "./GardenPlanOverview";
import { GrowingAreaLayoutEditor } from "./GrowingAreaLayoutEditor";
import { areaFocusViewport, areaPlanCorners, createRectangularLayout, gardenPlanViewport, type GrowingArea } from "@/lib/gardenWorkspace";
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
    const user = userEvent.setup(); const onPlacementChange = vi.fn(); const area = bed();
    const props = { plan, growingAreas: [area], editable: true, onPlacementChange };
    const view = render(<GardenPlanOverview {...props} />);
    const node = screen.getByLabelText("Open North bed on Garden Plan");
    expect(node).toHaveAttribute("draggable", "false");
    await user.click(screen.getByRole("button", { name: "Move planting areas" }));
    const transform = fitCanvas(gardenPlanViewport(plan, [area], "growing-areas"), size.width, size.height)!;
    fireEvent.dragStart(node);
    size.width = 358; size.height = 320;
    view.rerender(<GardenPlanOverview {...props} />);
    expect(screen.getByLabelText(/Garden Plan, /)).toHaveAttribute("width", "700");
    const target = metresToCanvas({ x: 5.24, y: 6.27 }, transform);
    Object.assign(node, { x: () => target.x, y: () => target.y });
    fireEvent.pointerUp(node);
    expect(onPlacementChange).toHaveBeenCalledExactlyOnceWith("bed", { x: 5.2, y: 6.3, rotationDegrees: 45 });
    expect(screen.getByLabelText(/Garden Plan, /)).toHaveAttribute("width", "358");
  });

  it("restores the original map position on Escape without submitting a move", async () => {
    const user = userEvent.setup();
    const area = bed();
    const onPlacementChange = vi.fn();
    render(<GardenPlanOverview plan={plan} growingAreas={[area]} editable onPlacementChange={onPlacementChange} />);
    await user.click(screen.getByRole("button", { name: "Move planting areas" }));
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

  it("exposes tiny plants in the keyboard list without enlarging their spacing or showing a delete hotspot", async () => {
    const user = userEvent.setup(); const area = bed();
    area.layout!.allocations = [{ id: "tiny", label: "Tiny basil", diameterMeters: 0.1, x: 1, y: 1 }];
    size.width = 358; size.height = 320;
    render(<GrowingAreaLayoutEditor area={area} onChange={vi.fn()} onArchivePlantingRecord={vi.fn()} onSaveArea={vi.fn()} />);
    expect(screen.queryByTestId("allocation-label-tiny")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remove Tiny basil")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tiny basil plant")).toHaveAttribute("draggable", "false");
    await user.click(screen.getByRole("button", { name: "Edit Tiny basil" }));
    expect(screen.getByLabelText("Plant type")).toHaveValue("Tiny basil");
    expect(screen.getByRole("button", { name: "Remove plant" })).toBeVisible();
    expect(screen.getByLabelText("Plant spacing (m)")).toHaveValue(0.1);
  });

  it("uses the plant canvas transform when a drag is resized mid-gesture", async () => {
    const user = userEvent.setup(); const onChange = vi.fn(); const area = bed();
    area.layout!.allocations = [{ id: "one", label: "Basil", diameterMeters: 0.3, x: 1, y: 1 }];
    const props = { area, onChange, onArchivePlantingRecord: vi.fn(), onSaveArea: vi.fn() };
    const view = render(<GrowingAreaLayoutEditor {...props} />);
    await user.click(screen.getByRole("button", { name: "Move plants" }));
    const node = screen.getByLabelText("Basil plant");
    const transform = fitCanvas({ x: 0, y: 0, widthMeters: 4, depthMeters: 2 }, size.width, size.height)!;
    act(() => fireEvent.dragStart(node));
    size.width = 358; size.height = 320; view.rerender(<GrowingAreaLayoutEditor {...props} />);
    const target = metresToCanvas({ x: 3.24, y: 1.46 }, transform);
    Object.assign(node, { x: () => target.x, y: () => target.y });
    fireEvent.pointerUp(node);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ allocations: [expect.objectContaining({ x: 3.2, y: 1.5 })] }));
    expect(screen.getByLabelText(/Metric layout, /)).toHaveAttribute("width", "358");
  });

  it("previews the same centre and spacing that a new plant will save", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GrowingAreaLayoutEditor area={bed()} onChange={onChange} onArchivePlantingRecord={vi.fn()} onSaveArea={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Add plant" }));
    await user.type(screen.getByLabelText("Plant type"), "Basil");
    fireEvent.change(screen.getByLabelText("Plant spacing (m)"), { target: { value: "0.4" } });
    expect(screen.getByText("Preview: Basil · 40 cm spacing · X 2 m, Y 1 m")).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ allocations: [expect.objectContaining({ x: 2, y: 1, diameterMeters: 0.4 })] }));
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
    expect(screen.getByText("Viewing North bed. Escape returns to the whole garden.")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Move planting areas" }));
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
