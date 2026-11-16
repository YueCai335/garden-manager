"use client";

import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { useWorkspaceDraft } from "@/components/workspace/WorkspaceProvider";
import Link from "next/link";
import { areaPath } from "@/lib/workspaceRoutes";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { useCanvasSize } from "@/hooks/useCanvasSize";
import { useAnimatedViewport } from "@/hooks/useAnimatedViewport";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { areaKindDefaults, overlappingAreas, resizedAreaSize } from "@/lib/areaPlacement";
import { canvasToMetres, canvasGridTicks, fitCanvas, insetViewport, metresToCanvas, noInsets, overlayInsets, type CanvasInsets, type CanvasTransform, type OverlayCorner } from "@/lib/canvasViewport";
import { allocationCropFamily, areaAppearance, areaLabelPosition, areaSizeText, cropFamilyColor, cropFamilyLegendLabels, familiesInView, isRectangularLayout, planColors, plantingFamilies, ridgeLine } from "@/lib/planAppearance";
import { PLANT_LABEL_HEIGHT, placePlantLabels, type Box, type PlantCircle, type PlantGroup } from "@/lib/plantLabels";
import { areaLocalToPlan, isInsideArea, planToAreaLocal } from "@/lib/planGeometry";
import { plantCenterInArea, plantWarnings } from "@/lib/plantLayout";
import { minimumGardenSize, resizedGardenSize, type SetupStep } from "@/lib/guidedSetup";
import { GardenDetailsFields, type GardenDetailsChange } from "./editor/GardenDetailsFields";
import { Button } from "./ui/Button";
import { useConfirmation } from "./ConfirmDialog";
import editorStyles from "./editor/Editor.module.css";
import canvasStyles from "./canvas/Canvas.module.css";
import setupStyles from "./editor/Setup.module.css";

import {
  areaFocusViewport,
  clampPlanPosition,
  gardenPlanViewport,
  growingAreaKindLabels,
  growingAreaKinds,
  type LayoutPoint,
  type GardenPlan,
  type GrowingArea,
  type GrowingAreaKind,
  type PlanPlacement,
  type PlantingRecord,
} from "@/lib/gardenWorkspace";

type AreaSize = { widthMeters: number; depthMeters: number };

/** The smallest plant radius a garden thumbnail draws, in pixels, so every plant stays visible. */
const THUMBNAIL_PLANT_RADIUS = 3;

/** Undo and Redo for Garden Plan edits in this tab (ADR-0072, phase G5). */
export type PlanHistoryControls = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  /** Explains why the history was cleared, such as a sync conflict. */
  notice?: string;
  onUndo: () => void;
  onRedo: () => void;
};

/** Planting on the zoomed area (ADR-0072, phase G3). Points are in the area's own metres. */
export type CanvasPlanting = {
  areaId: string;
  selectedPlantId?: string;
  /** Set while the add form describes a valid plant: clicks inside the area place it. */
  placing?: { label: string; diameterMeters: number; plantType?: string; variety?: string };
  onSelectPlant: (plantId: string) => void;
  onMovePlant: (plantId: string, point: LayoutPoint) => void;
  onPlacePlant: (point: LayoutPoint) => void;
  onStopPlacing: () => void;
};

type GardenPlanOverviewProps = {
  plan: GardenPlan;
  gardenId?: string;
  gardenName?: string;
  selectedAreaId?: string;
  growingAreas: GrowingArea[];
  /** Planting records: a plant linked to one takes the record's crop family colour. */
  plantings?: Pick<PlantingRecord, "id" | "cropFamily">[];
  compact?: boolean;
  editable?: boolean;
  /**
   * The wide layout (ADR-0073 S4): the toolbar, zoom, and legend float over the
   * canvas as glass layers. Otherwise they sit in the page flow above and below
   * the canvas.
   */
  floating?: boolean;
  /** The open area's panel, in its own column beside the canvas in the wide layout. */
  sidePanel?: ReactNode;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  isAreaInspectorOpen?: boolean;
  areaListInSidebar?: boolean;
  /** Shown directly below the canvas while an area is zoomed, on narrower layouts. */
  areaPanel?: ReactNode;
  planting?: CanvasPlanting;
  history?: PlanHistoryControls;
  /** Adds an area of this type at its standard size in the first free spot. */
  onAddArea?: (kind: GrowingAreaKind) => void;
  /** Gives an area saved without a size its type's standard size on the plan. */
  onPlaceArea?: (areaId: string) => void;
  onResizeArea?: (areaId: string, size: AreaSize) => void;
  onGardenNameChange?: (name: string) => void;
  onPlanChange?: (plan: GardenPlan) => void;
  onPlacementChange?: (areaId: string, placement: PlanPlacement) => void;
  onEditLayout?: (areaId: string) => void;
  /** Closes the open area (Escape); the canvas returns to the whole garden. */
  onExitArea?: () => void;
  /** Deletes the garden; offered at the bottom of the garden details form. */
  onDeleteGarden?: () => void;
  /**
   * The guided setup step on screen (ADR-0072, phase G6). Each step shows only
   * its own controls: Garden size shows a draggable boundary corner, Planting
   * areas shows the type buttons, Plants shows planting, and Garden size and
   * Ready keep the canvas for viewing.
   */
  setupStep?: SetupStep;
  /** The setup track and the current step's panel, shown above the canvas. */
  setupPanel?: ReactNode;
  /** Shown for a garden with no planting areas outside the guide. */
  onStartSetup?: () => void;
};

export function GardenPlanOverview({
  plan,
  gardenId,
  selectedAreaId,
  gardenName: gardenNameFromProps = "",
  growingAreas,
  plantings,
  compact = false,
  editable = false,
  floating = false,
  sidePanel,
  headingRef,
  isAreaInspectorOpen = false,
  areaListInSidebar = false,
  areaPanel,
  planting,
  history,
  onAddArea,
  onPlaceArea,
  onResizeArea,
  onGardenNameChange,
  onPlanChange,
  onPlacementChange,
  onEditLayout,
  onExitArea,
  onDeleteGarden,
  setupStep,
  setupPanel,
  onStartSetup,
}: GardenPlanOverviewProps) {
  const [message, setMessage] = useState("");
  const detailsKey = `garden-details:${gardenId ?? "standalone"}`;
  const [editingDetails, setEditingDetails] = useWorkspaceDraft(`garden-details-open:${gardenId ?? "standalone"}`, false);
  // A value typed but not applied yet (it failed validation) keeps the fields open.
  const [detailsDraft, setDetailsDraft] = useWorkspaceDraft<unknown>(detailsKey, undefined);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const { confirmation, confirmDiscard } = useConfirmation();
  const closeDetails = () => {
    setDetailsDraft(undefined); setEditingDetails(false);
    requestAnimationFrame(() => detailsButton.current?.focus());
  };
  const gardenMinimum = minimumGardenSize(growingAreas);
  const applyDetails = ({ name, plan: nextPlan }: GardenDetailsChange) => {
    if (name) onGardenNameChange?.(name);
    if (nextPlan) onPlanChange?.(nextPlan);
    setMessage(nextPlan ? `Garden size set to ${nextPlan.widthMeters} × ${nextPlan.depthMeters} m.` : `Garden renamed to ${name}.`);
  };
  // Viewing steps keep the canvas still; the size step only drags the garden's corner.
  const viewOnly = setupStep === "size" || setupStep === "ready";
  const selectedArea = growingAreas.find((area) => area.id === selectedAreaId);
  // A selected area with a size zooms the canvas; one without a size has nothing to frame.
  const focusedArea = !compact && selectedArea?.layout ? selectedArea : undefined;
  const exitArea = () => {
    if (!focusedArea || !onExitArea) return;
    const id = focusedArea.id;
    onExitArea();
    requestAnimationFrame(() => {
      if (document.querySelector('dialog[open][aria-modal="true"]')) return;
      document.getElementById(`area-link-${id}`)?.focus({ preventScroll: true });
    });
  };
  // "Whole garden" only zooms out: the area stays open, and the button zooms back in.
  // Keyed by area, so opening another area zooms to it again.
  const [wholeGardenFor, setWholeGardenFor] = useState<string>();
  const showingWholeGarden = Boolean(focusedArea && wholeGardenFor === focusedArea.id);
  const exitAreaRef = useRef(exitArea);
  useEffect(() => { exitAreaRef.current = exitArea; });
  const canExitArea = Boolean(focusedArea && onExitArea);
  useEffect(() => {
    if (!canExitArea) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Modal panels and confirmations handle their own Escape; typing keeps it for the field.
      if (document.querySelector('dialog[open][aria-modal="true"]')) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      exitAreaRef.current();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [canExitArea]);

  // Ctrl/⌘ Z undoes and Shift+Ctrl/⌘ Z or Ctrl+Y redoes; text fields keep their own undo.
  const historyRef = useRef(history);
  useEffect(() => { historyRef.current = history; });
  const hasHistory = Boolean(history);
  useEffect(() => {
    if (!hasHistory) return;
    const shortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!(event.metaKey || event.ctrlKey) || event.altKey || (key !== "z" && key !== "y") || event.defaultPrevented) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector('dialog[open][aria-modal="true"], [role="alertdialog"]')) return;
      const controls = historyRef.current;
      const redo = key === "y" || event.shiftKey;
      if (redo ? !controls?.canRedo : !controls?.canUndo) return;
      event.preventDefault();
      if (redo) controls!.onRedo(); else controls!.onUndo();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [hasHistory]);

  if (compact)
    return (
      <div aria-hidden="true" className={canvasStyles.thumbnail}>
        <GardenPlanCanvas
          compact
          growingAreas={growingAreas}
          plantings={plantings}
          interactive={false}
          onMove={() => undefined}
          plan={plan}
        />
      </div>
    );

  const moveArea = (areaId: string, position: LayoutPoint) => {
    if (!editable || !onPlacementChange) return;
    const point = clampPlanPosition(position, plan);
    const area = growingAreas.find((candidate) => candidate.id === areaId);
    if (!area || (area.planPlacement.x === point.x && area.planPlacement.y === point.y)) return;
    onPlacementChange(areaId, { ...area.planPlacement, ...point });
    setMessage(`${area.name} moved to ${point.x.toFixed(1)}, ${point.y.toFixed(1)} m.`);
  };

  const resizeArea = (areaId: string, size: AreaSize) => {
    const area = growingAreas.find((candidate) => candidate.id === areaId);
    if (!editable || !onResizeArea || !area?.layout) return;
    if (area.layout.widthMeters === size.widthMeters && area.layout.depthMeters === size.depthMeters) return;
    onResizeArea(areaId, size);
    setMessage(`${area.name} resized to ${size.widthMeters} × ${size.depthMeters} m.`);
  };
  const overlaps = overlappingAreas(growingAreas);
  const resizeGarden = (size: GardenPlan) => {
    if (size.widthMeters === plan.widthMeters && size.depthMeters === plan.depthMeters) return;
    onPlanChange?.(size);
    setMessage(`Garden size set to ${size.widthMeters} × ${size.depthMeters} m.`);
  };
  // The plan's tools: in the page flow on narrower layouts, a floating glass toolbar on wide ones.
  const wholeGarden = focusedArea ? showingWholeGarden
    ? <Button id="plan-whole-garden" onClick={() => setWholeGardenFor(undefined)}>Zoom to {focusedArea.name}</Button>
    : <Button id="plan-whole-garden" onClick={() => setWholeGardenFor(focusedArea.id)}>Whole garden</Button> : null;
  const addButtons = editable && onAddArea && (!setupStep || setupStep === "areas") ? <AddAreaButtons onAdd={onAddArea} /> : null;
  const historyButtons = editable && history ? <div className={editorStyles.history} role="group" aria-label="Plan history">
    <Button aria-keyshortcuts="Control+Z Meta+Z" disabled={!history.canUndo} title={history.undoLabel ? `Undo ${history.undoLabel}` : "Nothing to undo"} onClick={history.onUndo}>
      <span aria-hidden="true">↶ </span>Undo
    </Button>
    <Button aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" disabled={!history.canRedo} title={history.redoLabel ? `Redo ${history.redoLabel}` : "Nothing to redo"} onClick={history.onRedo}>
      <span aria-hidden="true">↷ </span>Redo
    </Button>
  </div> : null;
  // The floating toolbar also carries Undo and Redo; the page-flow layout keeps them in the header.
  const tools = floating
    ? addButtons || historyButtons ? <>{addButtons}{addButtons && historyButtons && <span className={canvasStyles.toolSeparator} aria-hidden="true" />}{historyButtons}</> : null
    : addButtons;

  return (
    <section className="garden-plan" aria-labelledby="garden-plan-heading">
      {confirmation}
      <div className="section-header">
        <div>
          <h2 id="garden-plan-heading" ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
            Garden Plan
          </h2>
        </div>
        <div className="plan-header-actions">
          {!floating && historyButtons}
          <p className="plan-count">
            {growingAreas.length} planting{" "}
            {growingAreas.length === 1 ? "area" : "areas"}
          </p>
        </div>
      </div>
      {editable && history?.notice && <p className={editorStyles.historyNotice} role="status">{history.notice}</p>}
      {setupPanel}
      {editable && !setupStep ? (
        <section
          aria-label="Garden properties"
          className={`plan-boundary-settings${isAreaInspectorOpen ? " is-compact" : ""}`}
        >
          {editingDetails || detailsDraft !== undefined ? <GardenDetailsFields gardenId={gardenId} name={gardenNameFromProps} plan={plan} minimum={gardenMinimum} autoFocus onApply={applyDetails}>
            <p className={`${editorStyles.applyHint} plan-apply-hint`}>Changes apply when you leave a field or press Enter. Undo reverses them.</p>
            <div className="form-actions">
              <Button onClick={() => confirmDiscard(detailsDraft !== undefined, closeDetails, "edit-garden-details")}>Done</Button>
            </div>
            {onDeleteGarden && <div className={editorStyles.danger}>
              <p>Deleting removes this garden with its planting areas, plants, and care records.</p>
              <Button className="remove-button" onClick={onDeleteGarden}>Delete garden</Button>
            </div>}
          </GardenDetailsFields> : <div className={editorStyles.detailsSummary}>
            <p><strong>{gardenNameFromProps}</strong> · {plan.widthMeters} × {plan.depthMeters} m</p>
            <Button id="edit-garden-details" ref={detailsButton} onClick={() => setEditingDetails(true)}>Edit garden details</Button>
          </div>}
        </section>
      ) : null}
      {editable && !setupStep && onStartSetup && growingAreas.length === 0 && <div className={setupStyles.start}>
        <p>New here? The guided setup walks through the garden size, planting areas, and plants.</p>
        <Button variant="primary" onClick={onStartSetup}>Start guided setup</Button>
      </div>}
      <div>
        <div className="plan-view">
          {!floating && (wholeGarden || tools) && <div className={editorStyles.planToolbar}>
            {wholeGarden}
            {tools}
          </div>}
          <div className={floating && focusedArea && sidePanel ? editorStyles.planWithPanel : undefined}>
            <GardenPlanCanvas
              compact={false}
              floating={floating}
              overlays={floating ? { toolbar: tools, zoom: wholeGarden } : undefined}
              frameWholeGarden={showingWholeGarden}
              selectedAreaId={selectedAreaId}
              growingAreas={growingAreas}
              plantings={plantings}
              interactive={editable && !viewOnly}
              onEditLayout={viewOnly ? undefined : onEditLayout}
              onMove={moveArea}
              plan={plan}
              focusedAreaId={focusedArea?.id}
              planting={planting}
              overlapIds={overlaps.ids}
              onResize={onResizeArea ? resizeArea : undefined}
              boundary={editable && setupStep === "size" && onPlanChange ? { minimum: gardenMinimum, onResize: resizeGarden } : undefined}
            />
            {floating && focusedArea && sidePanel && <div className={editorStyles.sideColumn}>{sidePanel}</div>}
          </div>
          {editable && overlaps.pairs.length > 0 && <div className={canvasStyles.warning} role="note" aria-label="Overlapping planting areas">
            {overlaps.pairs.map(([first, second]) => <p key={`${first.id}:${second.id}`}>{first.name} and {second.name} overlap. Move one if they are separate spaces on the ground.</p>)}
          </div>}
        </div>
      </div>
      {focusedArea && areaPanel}
      {editable && !viewOnly && !areaListInSidebar && growingAreas.length > 0 && <GardenAreaList gardenId={gardenId} areas={growingAreas} selectedAreaId={selectedAreaId} onEditLayout={onEditLayout} onPlaceArea={onPlaceArea} />}
      {editable ? (
        <p aria-live="polite" className="workspace-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function areaSizeLabel(area: GrowingArea) {
  if (!area.layout) return "No size yet";
  const count = area.layout.allocations.length;
  return `${area.layout.widthMeters} × ${area.layout.depthMeters} m · ${count} ${count === 1 ? "plant" : "plants"}`;
}

/** One button per area type; each drops a standard-size area on the plan (ADR-0072, phase G4). */
function AddAreaButtons({ onAdd }: { onAdd: (kind: GrowingAreaKind) => void }) {
  return <div className={canvasStyles.kinds} role="group" aria-label="Add a planting area">
    <span className={canvasStyles.kindsLabel} aria-hidden="true">Add</span>
    {growingAreaKinds.map((kind) => {
      const { widthMeters, depthMeters } = areaKindDefaults[kind];
      const look = areaAppearance(kind);
      return <Button key={kind} aria-label={`Add ${growingAreaKindLabels[kind]}, ${widthMeters} × ${depthMeters} m`} className={canvasStyles.kind} onClick={() => onAdd(kind)}>
        <span className={canvasStyles.kindBody}>
          <span aria-hidden="true" className={canvasStyles.swatch} data-kind={kind} style={{ background: look.fill, borderColor: look.stroke, borderStyle: look.dash ? "dashed" : "solid" }} />
          <span className={canvasStyles.kindText}><span>{growingAreaKindLabels[kind]}</span><small>{widthMeters} × {depthMeters} m</small></span>
        </span>
      </Button>;
    })}
  </div>;
}

export function GardenAreaList({ gardenId, areas, selectedAreaId, onEditLayout, onPlaceArea }: { gardenId?: string; areas: GrowingArea[]; selectedAreaId?: string; onEditLayout?: (areaId: string) => void; onPlaceArea?: (areaId: string) => void }) {
  const sized = areas.filter((area) => area.layout);
  const unsized = areas.filter((area) => !area.layout);
  const entry = (area: GrowingArea) => {
    const content = <><strong>{area.name}</strong><span>{growingAreaKindLabels[area.kind]} · {areaSizeLabel(area)}</span></>;
    return gardenId
      ? <Link id={`area-link-${area.id}`} aria-current={selectedAreaId === area.id ? "true" : undefined} href={areaPath(gardenId, area.id)} aria-label={`Edit ${area.name}`}>{content}</Link>
      : <Button onClick={() => onEditLayout?.(area.id)}>{content}</Button>;
  };
  return <section className={editorStyles.areaList} aria-labelledby="plan-area-shortcuts-heading">
    <h3 id="plan-area-shortcuts-heading">Planting areas</h3>
    {sized.length ? <ul>{sized.map((area) => <li key={area.id}>{entry(area)}</li>)}</ul> : unsized.length ? null : <p>No planting areas yet.</p>}
    {unsized.length > 0 && <section className={editorStyles.needsSize} aria-labelledby="plan-needs-size-heading">
      <h4 id="plan-needs-size-heading">Needs a size</h4>
      <p>These areas have no size yet, so they are not on the plan.</p>
      <ul>{unsized.map((area) => {
        const size = areaKindDefaults[area.kind];
        return <li key={area.id}>
          {entry(area)}
          {onPlaceArea && <Button aria-label={`Place ${area.name} on plan`} aria-describedby={`place-size-${area.id}`} onClick={() => onPlaceArea(area.id)}>Place on plan</Button>}
          <small id={`place-size-${area.id}`}>Uses the standard {growingAreaKindLabels[area.kind].toLowerCase()} size, {size.widthMeters} × {size.depthMeters} m.</small>
        </li>;
      })}</ul>
    </section>}
  </section>;
}

type CanvasOverlays = { toolbar?: ReactNode; zoom?: ReactNode };

type GardenPlanCanvasProps = {
  plan: GardenPlan;
  growingAreas: GrowingArea[];
  plantings?: Pick<PlantingRecord, "id" | "cropFamily">[];
  compact: boolean;
  floating?: boolean;
  /** Glass layers over the canvas in the floating layout. */
  overlays?: CanvasOverlays;
  interactive: boolean;
  selectedAreaId?: string;
  onMove: (areaId: string, point: LayoutPoint) => void;
  onEditLayout?: (areaId: string) => void;
  /** The open area: the canvas zooms to it and dims the others. Undefined frames the whole garden. */
  focusedAreaId?: string;
  /** Frames the whole garden while an area stays open for planting and editing. */
  frameWholeGarden?: boolean;
  planting?: CanvasPlanting;
  /** Areas whose outlines overlap another area: drawn with a warning outline. */
  overlapIds?: Set<string>;
  onResize?: (areaId: string, size: AreaSize) => void;
  /** The guided setup's Garden size step: a draggable boundary corner that never cuts into the areas. */
  boundary?: { minimum: GardenPlan; onResize: (size: GardenPlan) => void };
};

function GardenPlanCanvas({
  plan,
  growingAreas,
  plantings,
  compact,
  floating = false,
  overlays,
  interactive,
  selectedAreaId,
  onMove,
  onEditLayout,
  focusedAreaId,
  frameWholeGarden = false,
  planting,
  overlapIds,
  onResize,
  boundary,
}: GardenPlanCanvasProps) {
  const size = useCanvasSize();
  // Touch keeps the explicit Move mode so swipes scroll the page; mouse and pen drag directly.
  const coarse = useCoarsePointer();
  const [moveModeOn, setMoveMode] = useState(false);
  const moveMode = coarse && moveModeOn;
  const [drag, setDrag] = useState<{ id: string; transform: CanvasTransform; origin: PlanPlacement; point: LayoutPoint }>();
  const dragSession = useRef<{ id: string; transform: CanvasTransform; restore: () => void; stop: () => void } | undefined>(undefined);
  const cancelDrag = () => {
    const session = dragSession.current;
    if (!session) return;
    dragSession.current = undefined;
    session.stop();
    session.restore();
    setDrag(undefined);
  };
  const [resize, setResize] = useState<{ id: string; transform: CanvasTransform; size: AreaSize }>();
  const resizeSession = useRef<{ id: string; transform: CanvasTransform; restore: () => void; stop: () => void } | undefined>(undefined);
  const cancelResize = () => {
    const session = resizeSession.current;
    if (!session) return;
    resizeSession.current = undefined;
    session.stop();
    session.restore();
    setResize(undefined);
  };
  const [gardenResize, setGardenResize] = useState<{ transform: CanvasTransform; size: GardenPlan }>();
  const gardenResizeSession = useRef<{ transform: CanvasTransform; restore: () => void; stop: () => void } | undefined>(undefined);
  const cancelGardenResize = () => {
    const session = gardenResizeSession.current;
    if (!session) return;
    gardenResizeSession.current = undefined;
    session.stop();
    session.restore();
    setGardenResize(undefined);
  };
  const [plantDrag, setPlantDrag] = useState<{ label: string; point: LayoutPoint }>();
  const plantDragSession = useRef<{ id: string; scale: number; restore: () => void; stop: () => void } | undefined>(undefined);
  const [ghost, setGhost] = useState<LayoutPoint>();
  const [placeHint, setPlaceHint] = useState("");
  const cancelPlantDrag = () => {
    const session = plantDragSession.current;
    if (!session) return;
    plantDragSession.current = undefined;
    session.stop();
    session.restore();
    setPlantDrag(undefined);
  };
  // A finger that travels (a page scroll over the canvas) is not a tap, even when it
  // ends over the shape it started on, so it never opens an area or selects a plant.
  const touchStart = useRef<LayoutPoint | undefined>(undefined);
  const scrolledTouch = (event: Event | undefined) => {
    const start = touchStart.current;
    const end = touchPoint(event);
    return Boolean(start && end && Math.hypot(end.x - start.x, end.y - start.y) > 10);
  };
  const stopPlacing = useRef<(() => void) | undefined>(undefined);
  useEffect(() => { stopPlacing.current = planting?.placing ? planting.onStopPlacing : undefined; });
  useEffect(() => {
    // Capture runs before the zoom's Escape handler: Escape first cancels a
    // drag, then stops placing, and only then leaves the zoomed area.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (dragSession.current) { event.preventDefault(); cancelDrag(); return; }
      if (resizeSession.current) { event.preventDefault(); cancelResize(); return; }
      if (gardenResizeSession.current) { event.preventDefault(); cancelGardenResize(); return; }
      if (plantDragSession.current) { event.preventDefault(); cancelPlantDrag(); return; }
      if (!stopPlacing.current || document.querySelector('dialog[open][aria-modal="true"]')) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      setGhost(undefined);
      stopPlacing.current();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, []);
  const openArea = growingAreas.find((area) => area.id === focusedAreaId && area.layout);
  // The area the view zooms to; "Whole garden" keeps the area open but frames everything.
  const focusedArea = frameWholeGarden ? undefined : openArea;
  const measuredAreas = growingAreas.filter((area) => area.layout);
  // Crop-family colours (ADR-0073 S4): a linked planting record's family, else the family the name implies.
  const recordFamilies = plantingFamilies(plantings);
  const familyOf = (allocation: Parameters<typeof allocationCropFamily>[0]) => allocationCropFamily(allocation, recordFamilies);
  // The legend lists the families in view: the zoomed area's, or the whole garden's.
  const legendFamilies = compact ? [] : familiesInView((focusedArea ? [focusedArea] : measuredAreas).flatMap((area) => area.layout!.allocations.map(familyOf)));
  const [fontFamily, setFontFamily] = useState<string>();
  useEffect(() => {
    // Konva draws text itself, so it needs the page's font by name once the font has loaded.
    let active = true;
    const read = () => { if (active) setFontFamily(getComputedStyle(document.body).fontFamily || undefined); };
    read();
    document.fonts?.ready.then(read).catch(() => undefined);
    return () => { active = false; };
  }, []);
  // Floating layers reserve bands along the canvas edges; framing keeps the garden or area clear of them.
  const stageRef = useRef<HTMLDivElement>(null);
  const insets = useOverlayInsets(stageRef, floating && !compact, [overlays?.toolbar, overlays?.zoom, legendFamilies.length]);
  const framePadding = compact ? 12 : 34;
  // The size step frames the whole garden with room past its far edges, so the corner can be dragged outwards.
  const room = Math.max(1, Math.max(plan.widthMeters, plan.depthMeters) * 0.4);
  const target = (focusedArea && areaFocusViewport(focusedArea))
    || (boundary ? { x: 0, y: 0, widthMeters: plan.widthMeters + room, depthMeters: plan.depthMeters + room } : gardenPlanViewport(plan, growingAreas, "growing-areas", compact ? 0.05 : undefined));
  const framedTarget = compact ? target : insetViewport(target, size.width, size.height, framePadding, insets);
  const { viewport: bounds, animating: zooming } = useAnimatedViewport(framedTarget, focusedArea?.id ?? (boundary ? "garden-size" : "whole-garden"));
  const calculated = fitCanvas(bounds, size.width, size.height, framePadding);
  const transform = drag?.transform ?? resize?.transform ?? gardenResize?.transform ?? calculated;
  // While the corner is dragged, the boundary and grid follow the previewed size.
  const drawnPlan = gardenResize?.size ?? plan;
  const viewport = transform?.bounds ?? bounds;
  const { padding = 34, scale = 0, width = 0, height = 0 } = transform ?? {};
  const offsetX = compact ? (width - viewport.widthMeters * scale) / 2 - padding : 0;
  const offsetY = compact ? (height - viewport.depthMeters * scale) / 2 - padding : 0;
  // Rulers sit just outside the garden's top and left edges, kept on screen and clear of floating layers.
  const rulerTop = Math.min(Math.max(padding - viewport.y * scale - 18, insets.top + 2), height - insets.bottom - 16);
  const rulerLeft = Math.min(Math.max(padding - viewport.x * scale - 34, insets.left + 2), width - insets.right - 32);
  const verticalGrid = compact ? [] : canvasGridTicks(Math.max(0, viewport.x), Math.min(drawnPlan.widthMeters, viewport.x + viewport.widthMeters), scale);
  const horizontalGrid = compact ? [] : canvasGridTicks(Math.max(0, viewport.y), Math.min(drawnPlan.depthMeters, viewport.y + viewport.depthMeters), scale);
  const draggedArea = measuredAreas.find((area) => area.id === drag?.id);
  const areaLabels = measuredAreas.map((area) => ({ area, ...areaLabelPosition(area, scale, padding, viewport) }));
  // An area with plants is named by its plants; only empty areas and the open area show their own name.
  const namedByArea = ({ area }: { area: GrowingArea }) => area.layout!.allocations.length === 0 || area.id === selectedAreaId;
  // While zoomed, only the focused area keeps its name so neighbours' labels never cover its plants.
  // A thumbnail answers "what is growing": once anything is planted it names plants only.
  const anyPlanted = measuredAreas.some((area) => area.layout!.allocations.length > 0);
  const labels = compact ? (anyPlanted ? [] : fitThumbnailLabels(areaLabels, width, height, offsetX, offsetY))
    : areaLabels.filter((label) => namedByArea(label) && (!focusedArea || label.area.id === focusedArea.id));
  const dimmed = (area: GrowingArea) => Boolean(focusedArea && area.id !== focusedArea.id);
  const plantingArea = planting && openArea?.id === planting.areaId ? openArea : undefined;
  const plantLabels = !transform ? [] : groupLabels({
    areas: focusedArea ? [focusedArea] : measuredAreas,
    allAreas: measuredAreas,
    // An area or plant being moved redraws its labels when it lands.
    hidden: new Set([drag?.id, resize?.id, plantDrag ? plantingArea?.id : undefined].filter((id): id is string => Boolean(id))),
    obstacles: [
      ...labels.map(({ x, y, width: labelWidth }) => ({ left: x, top: y, right: x + labelWidth, bottom: y + 16 })),
      ...areaLabels.filter(({ area }) => area.id === selectedAreaId).map(({ x, width: labelWidth, sizeY }) => {
        const sizeWidth = Math.max(labelWidth, 88);
        const left = x + (labelWidth - sizeWidth) / 2;
        return { left, top: sizeY, right: left + sizeWidth, bottom: sizeY + 16 };
      }),
    ],
    // Thumbnails draw in a layer shifted by the centring offset, with a 4 px margin.
    bounds: compact ? { left: 4 - offsetX, top: 4 - offsetY, right: width - offsetX - 4, bottom: height - offsetY - 4 }
      : { left: insets.left, top: insets.top, right: width - insets.right, bottom: height - insets.bottom },
    toCanvas: (point) => ({ x: padding + (point.x - viewport.x) * scale, y: padding + (point.y - viewport.y) * scale }),
    scale,
    minRadius: compact ? THUMBNAIL_PLANT_RADIUS : 0,
  });
  const warnings = plantingArea?.layout ? plantWarnings(plantingArea.layout) : undefined;
  const placing = plantingArea ? planting?.placing : undefined;
  // Areas drag directly with a mouse or pen, and only in Move mode on touch screens.
  const canDragAreas = interactive && !compact && !placing && (!coarse || moveMode);
  const resizedArea = measuredAreas.find((area) => area.id === resize?.id);
  // The pointer in the zoomed area's own metres.
  const pointerInArea = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const pointer = event.target.getStage?.()?.getPointerPosition();
    if (!pointer || !transform || !plantingArea) return undefined;
    return planToAreaLocal(plantingArea, canvasToMetres({ x: pointer.x - offsetX, y: pointer.y - offsetY }, transform));
  };
  const followPointer = (event: KonvaEventObject<MouseEvent>) => {
    const local = pointerInArea(event);
    setGhost(local && placing && plantingArea && isInsideArea(plantingArea, local) ? plantCenterInArea(local, placing.diameterMeters, plantingArea.layout!) : undefined);
  };
  const placeAtPointer = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const local = pointerInArea(event);
    if (!local || !placing || !plantingArea || !planting) return;
    if (!isInsideArea(plantingArea, local)) { setPlaceHint(`Click inside ${plantingArea.name} to place ${placing.label}.`); return; }
    const point = plantCenterInArea(local, placing.diameterMeters, plantingArea.layout!);
    planting.onPlacePlant(point);
    setPlaceHint(`${placing.label} placed at ${point.x.toFixed(1)}, ${point.y.toFixed(1)} m. Click to place another; Escape stops.`);
  };
  // The drag readout floats over the canvas: changing the toolbar's height mid-drag
  // would shift the canvas under the pointer.
  const readout = drag ? `${draggedArea?.name ?? "Area"} · ${drag.point.x.toFixed(1)}, ${drag.point.y.toFixed(1)} m`
    : resize ? `${resizedArea?.name ?? "Area"} · ${resize.size.widthMeters} × ${resize.size.depthMeters} m`
    : plantDrag ? `${plantDrag.label} · ${plantDrag.point.x.toFixed(1)}, ${plantDrag.point.y.toFixed(1)} m`
    : gardenResize ? `Garden · ${gardenResize.size.widthMeters} × ${gardenResize.size.depthMeters} m`
    : undefined;
  const hint = moveMode ? "Drag an area. Escape cancels a move."
    : placing && plantingArea ? placeHint || `Click inside ${plantingArea.name} to place ${placing.label}. Escape stops.`
    : coarse ? (plantingArea ? `Viewing ${plantingArea.name}. Drag a plant to move it, or choose a plant to add. Escape returns to the whole garden.`
      : openArea ? `Viewing ${openArea.name}. Escape returns to the whole garden.`
      : "Tap an area to open it, or turn on Move to drag it.")
    : plantingArea ? `Viewing ${plantingArea.name}. Drag a plant or the area to move it, or drag the corner to resize. Escape returns to the whole garden.`
    : openArea ? `Viewing ${openArea.name}. Drag it to move it, or drag its corner to resize it. Escape returns to the whole garden.`
    : "Click an area to open it, or drag it to move it. Escape cancels a move.";

  const legend = legendFamilies.length > 0 ? <div className={`${canvasStyles.legend}${floating ? ` ${canvasStyles.glass} ${canvasStyles.layer}` : ""}`} data-corner={floating ? "bottom-left" : undefined} data-testid="plan-legend">
    <span className={canvasStyles.legendTitle} id="plan-legend-title">Crop family</span>
    <ul aria-labelledby="plan-legend-title">{legendFamilies.map((family) => {
      const colors = cropFamilyColor(family);
      return <li key={family}><span aria-hidden="true" className={canvasStyles.legendDot} style={{ background: colors.fill, borderColor: colors.stroke }} />{cropFamilyLegendLabels[family]}</li>;
    })}</ul>
  </div> : null;

  return <div className={compact ? undefined : canvasStyles.frame} data-floating={compact ? undefined : floating}>
    {interactive && !compact && measuredAreas.length > 0 && <div className={canvasStyles.toolbar}>
      {coarse && <Button aria-pressed={moveMode} onClick={() => { cancelDrag(); cancelResize(); setMoveMode((value) => !value); }}>Move planting areas</Button>}
      <p>{hint}</p>
    </div>}
    <div ref={stageRef} className={compact ? canvasStyles.thumbnailStage : canvasStyles.stage}>
    <div ref={size.ref} className={`${canvasStyles.surface} ${compact ? canvasStyles.compact : ""}`} data-testid={compact ? undefined : "garden-plan-canvas"} data-move={moveMode} data-dragging={Boolean(drag || resize || plantDrag || gardenResize)} data-focused-area={focusedArea?.id} data-placing={Boolean(placing)} data-zooming={zooming}>
    {readout && <p className={canvasStyles.readout} role="status">{readout}</p>}
    {transform ? <Stage
      aria-label={`Garden Plan, ${plan.widthMeters} metres wide by ${plan.depthMeters} metres long`}
      height={height}
      width={width}
      style={{ touchAction: moveMode ? "none" : "pan-y" }}
      onTouchStart={(event) => { touchStart.current = touchPoint(event.evt); }}
    >
      <Layer listening={!compact} x={offsetX} y={offsetY}>
        {!compact && <Rect
          preventDefault={false}
          fill={planColors.ground}
          height={drawnPlan.depthMeters * scale}
          width={drawnPlan.widthMeters * scale}
          x={padding - viewport.x * scale}
          y={padding - viewport.y * scale}
        />}
        {!compact && verticalGrid.map((metre) => (
          <Line
            listening={false}
            key={`vertical-${metre}`}
            points={[
              padding + (metre - viewport.x) * scale,
              padding - viewport.y * scale,
              padding + (metre - viewport.x) * scale,
              padding + (drawnPlan.depthMeters - viewport.y) * scale,
            ]}
            stroke={planColors.grid}
            strokeWidth={1}
          />
        ))}
        {!compact && horizontalGrid.map((metre) => (
          <Line
            listening={false}
            key={`horizontal-${metre}`}
            points={[
              padding - viewport.x * scale,
              padding + (metre - viewport.y) * scale,
              padding + (drawnPlan.widthMeters - viewport.x) * scale,
              padding + (metre - viewport.y) * scale,
            ]}
            stroke={planColors.grid}
            strokeWidth={1}
          />
        ))}
        {/* The boundary sits over the grid: a 2 px content-green line (ADR-0073). */}
        {!compact && <Rect
          listening={false}
          height={drawnPlan.depthMeters * scale}
          stroke={planColors.boundary}
          strokeWidth={2}
          width={drawnPlan.widthMeters * scale}
          x={padding - viewport.x * scale}
          y={padding - viewport.y * scale}
        />}
        {!compact && verticalGrid.map((metre) => (
          <Text
            listening={false}
            fill={planColors.ruler}
            fontFamily={fontFamily}
            fontSize={12}
            key={`x-label-${metre}`}
            text={`${metre} m`}
            x={padding + (metre - viewport.x) * scale - 10}
            y={rulerTop}
          />
        ))}
        {!compact && horizontalGrid.map((metre) => (
          <Text
            listening={false}
            fill={planColors.ruler}
            fontFamily={fontFamily}
            fontSize={12}
            key={`y-label-${metre}`}
            align="right"
            text={`${metre} m`}
            width={30}
            x={rulerLeft}
            y={padding + (metre - viewport.y) * scale - 6}
          />
        ))}
        {drag && draggedArea && <Line
          listening={false} closed dash={[5, 4]} stroke="#5f5f63" strokeWidth={2}
          rotation={drag.origin.rotationDegrees} {...metresToCanvas(drag.origin, transform)}
          points={draggedArea.layout!.boundary.flatMap(({ x, y }) => [x * scale, y * scale])}
        />}
        {measuredAreas.map((area) => (
          <Group
            aria-label={
              compact
                ? undefined
                : interactive
                  ? `Open ${area.name} on Garden Plan`
                  : `${area.name} on Garden Plan`
            }
            data-overlap={overlapIds?.has(area.id) ? "true" : undefined}
            draggable={canDragAreas && !dimmed(area)}
            dragDistance={6}
            preventDefault={moveMode}
            dragBoundFunc={(position) => {
              const frozen = dragSession.current?.transform ?? transform;
              return metresToCanvas(clampPlanPosition(canvasToMetres(position, frozen), plan), frozen);
            }}
            onDragStart={(event) => {
              // Konva drag events bubble: a plant dragged inside this area must not start an area move.
              if (event.target !== event.currentTarget) return;
              const { target } = event;
              // On a hybrid device, a finger outside Move mode scrolls the page instead of moving the area.
              if (!moveMode && isTouchEvent(event.evt)) { target.stopDrag(); target.position(metresToCanvas(area.planPlacement, transform)); return; }
              const origin = area.planPlacement;
              dragSession.current = { id: area.id, transform, restore: () => target.position(metresToCanvas(origin, transform)), stop: () => target.stopDrag() };
              setDrag({ id: area.id, transform, origin, point: origin });
            }}
            onDragMove={({ target, currentTarget }) => {
              if (target !== currentTarget) return;
              const point = clampPlanPosition(canvasToMetres(target.position(), dragSession.current?.transform ?? transform), plan);
              setDrag((current) => current && (current.point.x !== point.x || current.point.y !== point.y) ? { ...current, point } : current);
            }}
            key={area.id}
            onClick={() => onEditLayout?.(area.id)}
            onDragEnd={(event) => {
              const session = dragSession.current;
              if (session?.id !== area.id) return;
              dragSession.current = undefined;
              const cancelled = event.evt?.type === "touchcancel" || event.evt?.type === "pointercancel";
              const point = canvasToMetres({ x: event.target.x(), y: event.target.y() }, session.transform);
              // Return the node to its rendered position first. The saved move then redraws it; when
              // the zoomed view re-centres by the same distance, its x and y props do not change and
              // react-konva would otherwise leave the node where the drag dropped it.
              session.restore();
              if (!cancelled) onMove(area.id, point);
              setDrag(undefined);
            }}
            onTap={(event) => { if (!scrolledTouch(event.evt)) onEditLayout?.(area.id); }}
            onMouseEnter={(event) => { if (canDragAreas && !dimmed(area)) setCursor(event, "grab"); }}
            onMouseLeave={(event) => setCursor(event, "")}
            opacity={dimmed(area) ? 0.35 : 1}
            rotation={area.planPlacement.rotationDegrees}
            x={padding + (area.planPlacement.x - viewport.x) * scale}
            y={padding + (area.planPlacement.y - viewport.y) * scale}
          >
            <AreaShape area={area} scale={scale} compact={compact} selected={selectedAreaId === area.id || drag?.id === area.id} overlapping={!compact && Boolean(overlapIds?.has(area.id))} preventDefault={moveMode} />
            {area.layout!.allocations.map((allocation) => {
              const editablePlant = plantingArea?.id === area.id;
              const selectedPlant = editablePlant && planting?.selectedPlantId === allocation.id;
              const warned = editablePlant && (warnings?.crowdedIds.has(allocation.id) || warnings?.pastEdgeIds.has(allocation.id));
              const colors = cropFamilyColor(familyOf(allocation));
              // Thumbnails keep every plant visible, however small its spacing is at that scale.
              const radius = Math.max((allocation.diameterMeters * scale) / 2, compact ? THUMBNAIL_PLANT_RADIUS : 0);
              return <Group key={allocation.id}>
                <Circle
                  aria-label={`${allocation.label} plant on Garden Plan`}
                  data-warning={warned ? "true" : undefined}
                  draggable={editablePlant && !placing && !moveMode}
                  dragDistance={4}
                  fill={colors.fill}
                  preventDefault={moveMode || editablePlant}
                  radius={radius}
                  stroke={selectedPlant ? planColors.selection : warned ? planColors.warning : colors.stroke}
                  strokeWidth={selectedPlant ? 3 : warned ? 2 : compact ? 0.75 : 1.25}
                  dash={warned && !selectedPlant ? [4, 3] : undefined}
                  x={allocation.x * scale}
                  y={allocation.y * scale}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    if (editablePlant) planting?.onSelectPlant(allocation.id);
                    else onEditLayout?.(area.id);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    if (scrolledTouch(event.evt)) return;
                    if (editablePlant) planting?.onSelectPlant(allocation.id);
                    else onEditLayout?.(area.id);
                  }}
                  onDragStart={({ target }) => {
                    if (!editablePlant) return;
                    const origin = { x: allocation.x * scale, y: allocation.y * scale };
                    plantDragSession.current = { id: allocation.id, scale, restore: () => target.position(origin), stop: () => target.stopDrag() };
                    setPlantDrag({ label: allocation.label, point: { x: allocation.x, y: allocation.y } });
                  }}
                  onDragMove={({ target }) => {
                    const session = plantDragSession.current;
                    if (!session) return;
                    const point = plantCenterInArea({ x: target.x() / session.scale, y: target.y() / session.scale }, allocation.diameterMeters, area.layout!);
                    setPlantDrag((current) => current && (current.point.x !== point.x || current.point.y !== point.y) ? { ...current, point } : current);
                  }}
                  onDragEnd={(event) => {
                    const session = plantDragSession.current;
                    if (session?.id !== allocation.id) return;
                    plantDragSession.current = undefined;
                    setPlantDrag(undefined);
                    if (event.evt?.type === "touchcancel" || event.evt?.type === "pointercancel") { session.restore(); return; }
                    const point = plantCenterInArea({ x: event.target.x() / session.scale, y: event.target.y() / session.scale }, allocation.diameterMeters, area.layout!);
                    // Snap the node itself: an unchanged position would not re-render it.
                    event.target.position?.({ x: point.x * session.scale, y: point.y * session.scale });
                    if (point.x !== allocation.x || point.y !== allocation.y) planting?.onMovePlant(allocation.id, point);
                  }}
                />
                {/* A small centre dot marks where the plant stands inside its spacing circle. */}
                {radius >= 6 && <Circle listening={false} fill={colors.stroke} radius={Math.max(1.4, radius * 0.12)} x={allocation.x * scale} y={allocation.y * scale} />}
              </Group>;
            })}
            {resize?.id === area.id && <Rect
              data-testid="resize-preview"
              dash={[6, 4]}
              height={resize.size.depthMeters * scale}
              listening={false}
              stroke={planColors.selection}
              strokeWidth={2}
              width={resize.size.widthMeters * scale}
            />}
            {onResize && canDragAreas && openArea?.id === area.id && isRectangularLayout(area.layout!) && <Rect
              aria-label={`Resize ${area.name}`}
              data-testid="resize-handle"
              draggable
              dragDistance={2}
              fill="#ffffff"
              height={14}
              hitStrokeWidth={20}
              offsetX={7}
              offsetY={7}
              preventDefault={moveMode}
              stroke={planColors.selection}
              strokeWidth={2}
              width={14}
              x={area.layout!.widthMeters * scale}
              y={area.layout!.depthMeters * scale}
              onMouseEnter={(event) => setCursor(event, "nwse-resize")}
              onMouseLeave={(event) => setCursor(event, "")}
              onClick={(event) => { event.cancelBubble = true; }}
              onTap={(event) => { event.cancelBubble = true; }}
              onDragStart={({ target }) => {
                const layout = area.layout!;
                const corner = { x: layout.widthMeters * scale, y: layout.depthMeters * scale };
                resizeSession.current = { id: area.id, transform, restore: () => target.position(corner), stop: () => target.stopDrag() };
                setResize({ id: area.id, transform, size: { widthMeters: layout.widthMeters, depthMeters: layout.depthMeters } });
              }}
              onDragMove={({ target }) => {
                const session = resizeSession.current;
                if (session?.id !== area.id) return;
                const next = resizedAreaSize({ x: target.x() / session.transform.scale, y: target.y() / session.transform.scale }, area, plan);
                target.position({ x: next.widthMeters * session.transform.scale, y: next.depthMeters * session.transform.scale });
                setResize((current) => current && (current.size.widthMeters !== next.widthMeters || current.size.depthMeters !== next.depthMeters) ? { ...current, size: next } : current);
              }}
              onDragEnd={(event) => {
                const session = resizeSession.current;
                if (session?.id !== area.id) return;
                resizeSession.current = undefined;
                setResize(undefined);
                if (event.evt?.type === "touchcancel" || event.evt?.type === "pointercancel") { session.restore(); return; }
                const next = resizedAreaSize({ x: event.target.x() / session.transform.scale, y: event.target.y() / session.transform.scale }, area, plan);
                // The handle redraws at the saved corner; an unchanged size would not re-render it.
                session.restore();
                onResize(area.id, next);
              }}
            />}
            {placing && ghost && plantingArea?.id === area.id && <Circle
              data-testid="placement-preview"
              dash={[5, 3]}
              fill={cropFamilyColor(familyOf({ label: placing.label, plantType: placing.plantType, variety: placing.variety })).fill}
              listening={false}
              opacity={0.6}
              radius={(placing.diameterMeters * scale) / 2}
              stroke={planColors.selection}
              strokeWidth={2}
              x={ghost.x * scale}
              y={ghost.y * scale}
            />}
          </Group>
        ))}
        {labels.map(({ area, width, x, y }) => (
          <Text
            align="center"
            data-testid={`area-label-${area.id}`}
            ellipsis
            fill={planColors.label}
            fontFamily={fontFamily}
            fontSize={compact ? 12 : 13}
            fontStyle="600"
            height={16}
            key={`area-label-${area.id}`}
            listening={false}
            text={area.name}
            width={width}
            wrap="none"
            x={x}
            y={y}
          />
        ))}
        {!compact && areaLabels.filter(({ area }) => area.id === selectedAreaId).map(({ area, width, x, sizeY }) => {
          const sizeWidth = Math.max(width, 88);
          return <Text
            align="center"
            data-testid={`area-size-${area.id}`}
            fill={planColors.mutedLabel}
            fontFamily={fontFamily}
            fontSize={12}
            height={16}
            key={`area-size-${area.id}`}
            listening={false}
            text={areaSizeText(area.layout!)}
            width={sizeWidth}
            wrap="none"
            x={x + (width - sizeWidth) / 2}
            y={sizeY}
          />;
        })}
        {plantLabels.map((label) => (
          <Text
            data-testid={`plant-label-${label.key}`}
            fill={planColors.label}
            fillAfterStrokeEnabled
            fontFamily={fontFamily}
            fontSize={12}
            fontStyle="600"
            height={PLANT_LABEL_HEIGHT}
            key={`plant-label-${label.key}`}
            lineJoin="round"
            listening={false}
            stroke={planColors.labelHalo}
            strokeWidth={4}
            text={label.text}
            verticalAlign="middle"
            align="center"
            width={label.width}
            wrap="none"
            x={label.x}
            y={label.y}
          />
        ))}
        {!compact && !measuredAreas.length ? (
          <Text
            fill={planColors.mutedLabel}
            fontSize={14}
            text={boundary ? "Drag the corner to change the garden size." : "Choose an area type above to add it to the plan."}
            width={Math.max(0, width - padding * 2)}
            x={padding}
            y={padding}
          />
        ) : null}
        {boundary && transform && <Rect
          aria-label="Resize the garden"
          data-testid="garden-resize-handle"
          draggable
          dragDistance={2}
          fill="#ffffff"
          height={18}
          hitStrokeWidth={24}
          offsetX={9}
          offsetY={9}
          stroke={planColors.selection}
          strokeWidth={2}
          width={18}
          x={padding + (plan.widthMeters - viewport.x) * scale}
          y={padding + (plan.depthMeters - viewport.y) * scale}
          onMouseEnter={(event) => setCursor(event, "nwse-resize")}
          onMouseLeave={(event) => setCursor(event, "")}
          onDragStart={({ target }) => {
            const corner = metresToCanvas({ x: plan.widthMeters, y: plan.depthMeters }, transform);
            gardenResizeSession.current = { transform, restore: () => target.position(corner), stop: () => target.stopDrag() };
            setGardenResize({ transform, size: plan });
          }}
          onDragMove={({ target }) => {
            const session = gardenResizeSession.current;
            if (!session) return;
            const next = resizedGardenSize(canvasToMetres(target.position(), session.transform), boundary.minimum);
            target.position(metresToCanvas({ x: next.widthMeters, y: next.depthMeters }, session.transform));
            setGardenResize((current) => current && (current.size.widthMeters !== next.widthMeters || current.size.depthMeters !== next.depthMeters) ? { ...current, size: next } : current);
          }}
          onDragEnd={(event) => {
            const session = gardenResizeSession.current;
            if (!session) return;
            gardenResizeSession.current = undefined;
            setGardenResize(undefined);
            const next = resizedGardenSize(canvasToMetres({ x: event.target.x(), y: event.target.y() }, session.transform), boundary.minimum);
            // The handle redraws at the saved corner; an unchanged size would not re-render it.
            session.restore();
            if (event.evt?.type === "touchcancel" || event.evt?.type === "pointercancel") return;
            boundary.onResize(next);
          }}
        />}
        {placing && plantingArea && <Rect
          aria-label={`Place ${placing.label} on ${plantingArea.name}`}
          fill="rgba(0,0,0,0)"
          height={height}
          preventDefault={false}
          width={width}
          x={-offsetX}
          y={-offsetY}
          onClick={placeAtPointer}
          onTap={placeAtPointer}
          onMouseMove={followPointer}
          onMouseLeave={() => setGhost(undefined)}
        />}
      </Layer>
    </Stage> : <p className={canvasStyles.placeholder}>Preparing garden view…</p>}
    </div>
    {floating && overlays?.toolbar && <div className={`${canvasStyles.glass} ${canvasStyles.layer} ${canvasStyles.tools}`} data-corner="top-left" role="toolbar" aria-label="Plan tools">{overlays.toolbar}</div>}
    {floating && overlays?.zoom && <div className={`${canvasStyles.glass} ${canvasStyles.layer} ${canvasStyles.zoom}`} data-corner="bottom-right">{overlays.zoom}</div>}
    {floating && legend}
    </div>
    {!floating && !compact && legend}
  </div>;
}

/**
 * Measures the floating layers inside `stage` and returns the canvas insets that
 * keep them clear of the framed garden or area. Remeasures when a layer resizes.
 */
function useOverlayInsets(stageRef: RefObject<HTMLDivElement | null>, enabled: boolean, layers: unknown[]) {
  const [insets, setInsets] = useState<CanvasInsets>(noInsets);
  const present = layers.map(Boolean).join();
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!enabled || !stage) { setInsets((current) => current === noInsets ? current : noInsets); return; }
    const measure = () => {
      const base = stage.getBoundingClientRect();
      const next = overlayInsets({ width: base.width, height: base.height }, [...stage.querySelectorAll<HTMLElement>(":scope > [data-corner]")].map((layer) => {
        const box = layer.getBoundingClientRect();
        return { corner: layer.dataset.corner as OverlayCorner, left: box.left - base.left, top: box.top - base.top, right: box.right - base.left, bottom: box.bottom - base.top };
      }));
      const rounded = { top: Math.ceil(next.top), right: Math.ceil(next.right), bottom: Math.ceil(next.bottom), left: Math.ceil(next.left) };
      setInsets((current) => current.top === rounded.top && current.right === rounded.right && current.bottom === rounded.bottom && current.left === rounded.left ? current : rounded);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    stage.querySelectorAll(":scope > [data-corner]").forEach((layer) => observer.observe(layer));
    return () => observer.disconnect();
  }, [stageRef, enabled, present]);
  return insets;
}

/**
 * One label per plant group (same plant type) in each labelled area, placed in
 * canvas pixels so it reads upright whatever the area's rotation. Circles of every
 * drawn area count as obstacles, so a label never covers a plant (ADR-0072 G1).
 */
function groupLabels({ areas, allAreas, hidden, obstacles, bounds, toCanvas, scale, minRadius = 0 }: {
  areas: GrowingArea[];
  allAreas: GrowingArea[];
  hidden: Set<string>;
  obstacles: Box[];
  bounds: Box;
  toCanvas: (point: LayoutPoint) => LayoutPoint;
  scale: number;
  minRadius?: number;
}) {
  const circleOf = (area: GrowingArea, allocation: { x: number; y: number; diameterMeters: number }): PlantCircle => ({
    ...toCanvas(areaLocalToPlan(area, allocation)),
    radius: Math.max((allocation.diameterMeters * scale) / 2, minRadius),
  });
  const circles = allAreas.flatMap((area) => area.layout!.allocations.map((allocation) => circleOf(area, allocation)));
  const groups: PlantGroup[] = areas.filter((area) => !hidden.has(area.id)).flatMap((area) => {
    const byType = new Map<string, PlantGroup>();
    for (const allocation of area.layout!.allocations) {
      const name = allocation.plantType?.trim() || allocation.label;
      const identity = name.toLocaleLowerCase();
      const group = byType.get(identity) ?? { key: `${area.id}:${identity}`, name, circles: [] };
      group.circles.push(circleOf(area, allocation));
      byType.set(identity, group);
    }
    return [...byType.values()];
  });
  return placePlantLabels({ groups, circles, obstacles, bounds });
}

/** One planting area's outline, drawn in area-local canvas pixels inside its positioned Group. */
function AreaShape({ area, scale, compact, selected, overlapping, preventDefault }: { area: GrowingArea; scale: number; compact: boolean; selected: boolean; overlapping: boolean; preventDefault: boolean }) {
  const layout = area.layout!;
  const look = areaAppearance(area.kind, compact);
  const width = layout.widthMeters * scale;
  const height = layout.depthMeters * scale;
  const points = layout.boundary.flatMap((point) => [point.x * scale, point.y * scale]);
  const rectangle = isRectangularLayout(layout);
  const radius = look.rounded ? Math.min(width, height) / 2 : Math.min(3, width / 4, height / 4);
  // The selection ring stands a little off the outline so the area keeps its own frame.
  const ring = compact ? 4 : 6;
  return <>
    {/* Selection draws a separate ring so the area keeps its type colours. */}
    {selected && (rectangle
      ? <Rect listening={false} x={-ring} y={-ring} width={width + ring * 2} height={height + ring * 2} cornerRadius={radius + ring} stroke={planColors.selection} strokeWidth={2} />
      : <Line listening={false} closed points={points} stroke={planColors.selection} strokeWidth={look.strokeWidth + 6} opacity={0.45} />)}
    {/* Framed beds and pots cast a faint shadow, which lifts them off the ground. */}
    {look.shadow && !compact && (rectangle
      ? <Rect listening={false} x={2} y={3} width={width} height={height} cornerRadius={radius} fill={planColors.shadow} />
      : <Line listening={false} x={2} y={3} closed points={points} fill={planColors.shadow} />)}
    {rectangle
      ? <Rect preventDefault={preventDefault} width={width} height={height} cornerRadius={radius} fill={look.fill} stroke={look.stroke} strokeWidth={look.strokeWidth} dash={look.dash} />
      : <Line preventDefault={preventDefault} closed points={points} fill={look.fill} stroke={look.stroke} strokeWidth={look.strokeWidth} dash={look.dash} />}
    {look.ridge && <Line listening={false} points={ridgeLine(layout).map((value) => value * scale)} stroke={look.stroke} strokeWidth={1} dash={[5, 4]} />}
    {/* Overlap is a warning, never a blocker: a dashed amber outline over the area's own edge. */}
    {overlapping && (rectangle
      ? <Rect data-testid={`overlap-${area.id}`} listening={false} width={width} height={height} cornerRadius={radius} stroke={planColors.warning} strokeWidth={2} dash={[6, 4]} />
      : <Line data-testid={`overlap-${area.id}`} listening={false} closed points={points} stroke={planColors.warning} strokeWidth={2} dash={[6, 4]} />)}
  </>;
}

/** The first finger's position in the viewport, from a touch event. */
function touchPoint(event: Event | undefined): LayoutPoint | undefined {
  if (typeof TouchEvent === "undefined" || !(event instanceof TouchEvent)) return undefined;
  const touch = event.touches[0] ?? event.changedTouches[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : undefined;
}

function isTouchEvent(event: Event | undefined) {
  if (!event) return false;
  return event.type.startsWith("touch") || (typeof PointerEvent !== "undefined" && event instanceof PointerEvent && event.pointerType === "touch");
}

function setCursor(event: KonvaEventObject<MouseEvent>, cursor: string) {
  const container = event.target?.getStage?.()?.container();
  if (container) container.style.cursor = cursor;
}

function fitThumbnailLabels(
  areas: ({ area: GrowingArea } & ReturnType<typeof areaLabelPosition>)[],
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
) {
  const placed: { area: GrowingArea; x: number; y: number; width: number }[] = [];
  const occupied = areas.map(({ left, right, top, bottom }) => ({ left, right, top, bottom }));
  for (const { area, left, right, top, bottom } of areas) {
    const textWidth = Array.from(area.name).reduce((pixels, character) => pixels + (character.charCodeAt(0) < 128 ? 8 : 12), 4);
    const labelWidth = Math.min(width - 8, 100, textWidth);
    const x = Math.max(4 - offsetX, Math.min((left + right - labelWidth) / 2, width - offsetX - labelWidth - 4));
    const y = [top - 19, bottom + 3, top - 37, bottom + 21].find((candidate) =>
      candidate + offsetY >= 4 && candidate + offsetY + 16 <= height - 4 &&
      !occupied.some((box) => x < box.right && x + labelWidth > box.left && candidate < box.bottom && candidate + 16 > box.top),
    );
    // Dense thumbnails omit labels that do not fit; the full plan lists all areas.
    if (y === undefined) continue;
    occupied.push({ left: x, right: x + labelWidth, top: y, bottom: y + 16 });
    placed.push({ area, x, y, width: labelWidth });
  }
  return placed;
}
