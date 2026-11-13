"use client";

import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";

import { FormEvent, type RefObject, useEffect, useRef, useState } from "react";
import { useWorkspaceDraft, useUnsavedDraft } from "@/components/workspace/WorkspaceProvider";
import Link from "next/link";
import { areaPath } from "@/lib/workspaceRoutes";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { useCanvasSize } from "@/hooks/useCanvasSize";
import { useAnimatedViewport } from "@/hooks/useAnimatedViewport";
import { canvasToMetres, canvasGridTicks, fitCanvas, metresToCanvas, type CanvasTransform } from "@/lib/canvasViewport";
import { areaAppearance, areaLabelPosition, areaSizeText, isRectangularLayout, planColors, ridgeLine } from "@/lib/planAppearance";
import { Button } from "./ui/Button";
import { useConfirmation } from "./ConfirmDialog";
import editorStyles from "./editor/Editor.module.css";
import canvasStyles from "./canvas/Canvas.module.css";

import {
  allocationPlantColor,
  areaFocusViewport,
  clampPlanPosition,
  gardenPlanViewport,
  growingAreaKindLabels,
  snapToGrid,
  validateGardenPlanDimensions,
  type LayoutPoint,
  type GardenPlan,
  type GrowingArea,
  type PlanPlacement,
} from "@/lib/gardenWorkspace";

type GardenPlanOverviewProps = {
  plan: GardenPlan;
  gardenId?: string;
  gardenName?: string;
  selectedAreaId?: string;
  growingAreas: GrowingArea[];
  compact?: boolean;
  editable?: boolean;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  isAreaInspectorOpen?: boolean;
  areaListInSidebar?: boolean;
  showAreaPreview?: boolean;
  onAddArea?: () => void;
  onGardenNameChange?: (name: string) => void;
  onPlanChange?: (plan: GardenPlan) => void;
  onPlacementChange?: (areaId: string, placement: PlanPlacement) => void;
  onEditLayout?: (areaId: string) => void;
  /** Leaves the zoomed area and returns the canvas to the whole garden. */
  onExitArea?: () => void;
};

export function GardenPlanOverview({
  plan,
  gardenId,
  selectedAreaId,
  gardenName: gardenNameFromProps = "",
  growingAreas,
  compact = false,
  editable = false,
  headingRef,
  isAreaInspectorOpen = false,
  areaListInSidebar = false,
  showAreaPreview = false,
  onAddArea,
  onGardenNameChange,
  onPlanChange,
  onPlacementChange,
  onEditLayout,
  onExitArea,
}: GardenPlanOverviewProps) {
  type Details = { name: string; width: string; depth: string };
  const current = { name: gardenNameFromProps, width: String(plan.widthMeters), depth: String(plan.depthMeters) };
  const [draft, setDraft] = useWorkspaceDraft<{ baseline: Details; values: Details } | undefined>(`garden-details:${gardenId ?? "standalone"}`, undefined);
  const values = draft?.values ?? current;
  const { name: gardenName, width, depth } = values;
  const change = (field: keyof Details, value: string) => setDraft({ baseline: draft?.baseline ?? current, values: { ...values, [field]: value } });
  const setGardenName = (value: string) => change("name", value);
  const setWidth = (value: string) => change("width", value);
  const setDepth = (value: string) => change("depth", value);
  const [message, setMessage] = useState("");
  const [editingDetails, setEditingDetails] = useWorkspaceDraft(`garden-details-open:${gardenId ?? "standalone"}`, false);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const { confirmation, confirmDiscard } = useConfirmation();
  const closeDetails = () => {
    setDraft(undefined); setEditingDetails(false);
    requestAnimationFrame(() => detailsButton.current?.focus());
  };
  const hasPropertyChanges = gardenName.trim() !== gardenNameFromProps || !width.trim() || !depth.trim() || Number(width) !== plan.widthMeters || Number(depth) !== plan.depthMeters;
  useUnsavedDraft(`garden-details:${gardenId ?? "standalone"}`, Boolean(editable && hasPropertyChanges));
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

  if (compact)
    return (
      <div aria-hidden="true" className={canvasStyles.thumbnail}>
        <GardenPlanCanvas
          compact
          growingAreas={growingAreas}
          interactive={false}
          onMove={() => undefined}
          plan={plan}
        />
      </div>
    );

  const savePlanDimensions = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const widthMeters = Number(width);
    const depthMeters = Number(depth);
    if (!validateGardenPlanDimensions(widthMeters, depthMeters)) {
      setMessage("Enter plan dimensions of at least 0.1 metres.");
      return;
    }
    const nextGardenName = gardenName.trim();
    if (!nextGardenName) {
      setMessage("Enter a garden name to continue.");
      return;
    }
    onGardenNameChange?.(nextGardenName);
    onPlanChange?.({
      widthMeters: snapToGrid(widthMeters),
      depthMeters: snapToGrid(depthMeters),
    });
    closeDetails();
    setMessage("Garden properties updated.");
  };

  const moveArea = (areaId: string, position: LayoutPoint) => {
    if (!editable || !onPlacementChange) return;
    const point = clampPlanPosition(position, plan);
    const area = growingAreas.find((candidate) => candidate.id === areaId);
    if (!area || (area.planPlacement.x === point.x && area.planPlacement.y === point.y)) return;
    onPlacementChange(areaId, { ...area.planPlacement, ...point });
    setMessage(`${area.name} moved to ${point.x.toFixed(1)}, ${point.y.toFixed(1)} m.`);
  };

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
          <p className="plan-count">
            {growingAreas.length} planting{" "}
            {growingAreas.length === 1 ? "area" : "areas"}
          </p>
        </div>
      </div>
      {editable ? (
        <section
          aria-label="Garden properties"
          className={`plan-boundary-settings${isAreaInspectorOpen ? " is-compact" : ""}`}
        >
          {editingDetails || hasPropertyChanges ? <FeedbackForm className="plan-dimensions" onSubmit={savePlanDimensions} notice={hasPropertyChanges ? "Unsaved changes" : ""}>
            <FormField id="plan-garden-name" className="field plan-name-field">
              <label htmlFor="plan-garden-name">Garden name</label>
              <input
                autoFocus
                id="plan-garden-name"
                onChange={(event) => setGardenName(event.target.value)}
                required
                value={gardenName}
              />
            </FormField>
            <FormField id="plan-width" className="field">
              <label htmlFor="plan-width">
                Garden width (m)
              </label>
              <input
                id="plan-width" required
                min="0.1"
                onChange={(event) => setWidth(event.target.value)}
                step="0.1"
                type="number"
                value={width}
              />
            </FormField>
            <FormField id="plan-depth" className="field">
              <label htmlFor="plan-depth">
                Garden length (m)
              </label>
              <input
                id="plan-depth" required
                min="0.1"
                onChange={(event) => setDepth(event.target.value)}
                step="0.1"
                type="number"
                value={depth}
              />
            </FormField>
            <div className="form-actions">
              {hasPropertyChanges ? <button className="save-button" type="submit">Save</button> : null}
              <Button onClick={() => confirmDiscard(Boolean(hasPropertyChanges), closeDetails, "edit-garden-details")}>Cancel</Button>
            </div>
          </FeedbackForm> : <div className={editorStyles.detailsSummary}>
            <p><strong>{gardenNameFromProps}</strong> · {plan.widthMeters} × {plan.depthMeters} m</p>
            <Button id="edit-garden-details" ref={detailsButton} onClick={() => setEditingDetails(true)}>Edit garden details</Button>
          </div>}
        </section>
      ) : null}
      <div>
        <div className="plan-view">
          <div className={editorStyles.planToolbar}>
          {editable && onAddArea && <Button id="add-planting-area" variant="primary" onClick={onAddArea}>Add planting area</Button>}
          {canExitArea && <Button id="plan-whole-garden" onClick={exitArea}><span aria-hidden="true">← </span>Whole garden</Button>}
          </div>
          <div>
            <GardenPlanCanvas
              compact={false}
              selectedAreaId={selectedAreaId}
              growingAreas={growingAreas}
              interactive={editable}
              onEditLayout={onEditLayout}
              onMove={moveArea}
              plan={plan}
              focusedAreaId={focusedArea?.id}
            />
          </div>
        </div>
      </div>
      {showAreaPreview && gardenId && selectedArea && <section className={editorStyles.areaPreview} aria-label="Selected planting area">
        <div><h3>{selectedArea.name}</h3><p>{areaSizeLabel(selectedArea)}</p></div>
        <Link className="primary-button" href={areaPath(gardenId, selectedArea.id)}>Edit area</Link>
      </section>}
      {editable && !areaListInSidebar && growingAreas.length > 0 && <GardenAreaList gardenId={gardenId} areas={growingAreas} selectedAreaId={selectedAreaId} onEditLayout={onEditLayout} />}
      {editable ? (
        <p aria-live="polite" className="workspace-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function areaSizeLabel(area: GrowingArea) {
  if (!area.layout) return "Set measurements";
  const count = area.layout.allocations.length;
  return `${area.layout.widthMeters} × ${area.layout.depthMeters} m · ${count} ${count === 1 ? "plant" : "plants"}`;
}

export function GardenAreaList({ gardenId, areas, selectedAreaId, onEditLayout }: { gardenId?: string; areas: GrowingArea[]; selectedAreaId?: string; onEditLayout?: (areaId: string) => void }) {
  return <section className={editorStyles.areaList} aria-labelledby="plan-area-shortcuts-heading">
    <h3 id="plan-area-shortcuts-heading">Planting areas</h3>
    {areas.length ? <ul>{areas.map((area) => {
      const content = <><strong>{area.name}</strong><span>{growingAreaKindLabels[area.kind]} · {areaSizeLabel(area)}</span></>;
      return <li key={area.id}>{gardenId
        ? <Link id={`area-link-${area.id}`} aria-current={selectedAreaId === area.id ? "true" : undefined} href={areaPath(gardenId, area.id)} aria-label={`Edit ${area.name}`}>{content}</Link>
        : <Button onClick={() => onEditLayout?.(area.id)}>{content}</Button>}
      </li>;
    })}</ul> : <p>No planting areas yet.</p>}
  </section>;
}

type GardenPlanCanvasProps = {
  plan: GardenPlan;
  growingAreas: GrowingArea[];
  compact: boolean;
  interactive: boolean;
  selectedAreaId?: string;
  onMove: (areaId: string, point: LayoutPoint) => void;
  onEditLayout?: (areaId: string) => void;
  /** The area the canvas zooms to; other areas dim. Undefined frames the whole garden. */
  focusedAreaId?: string;
};

function GardenPlanCanvas({
  plan,
  growingAreas,
  compact,
  interactive,
  selectedAreaId,
  onMove,
  onEditLayout,
  focusedAreaId,
}: GardenPlanCanvasProps) {
  const size = useCanvasSize();
  const [moveMode, setMoveMode] = useState(false);
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
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !dragSession.current) return;
      event.preventDefault();
      cancelDrag();
    };
    // Capture runs before the zoom's Escape handler, so Escape cancels a drag first.
    if (moveMode) window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [moveMode]);
  const focusedArea = growingAreas.find((area) => area.id === focusedAreaId && area.layout);
  const target = (focusedArea && areaFocusViewport(focusedArea)) || gardenPlanViewport(plan, growingAreas, "growing-areas", compact ? 0.05 : undefined);
  const { viewport: bounds } = useAnimatedViewport(target, focusedArea?.id ?? "whole-garden");
  const calculated = fitCanvas(bounds, size.width, size.height, compact ? 12 : 34);
  const transform = drag?.transform ?? calculated;
  const viewport = transform?.bounds ?? bounds;
  const { padding = 34, scale = 0, width = 0, height = 0 } = transform ?? {};
  const offsetX = compact ? (width - viewport.widthMeters * scale) / 2 - padding : 0;
  const offsetY = compact ? (height - viewport.depthMeters * scale) / 2 - padding : 0;
  const verticalGrid = compact ? [] : canvasGridTicks(Math.max(0, viewport.x), Math.min(plan.widthMeters, viewport.x + viewport.widthMeters), scale);
  const horizontalGrid = compact ? [] : canvasGridTicks(Math.max(0, viewport.y), Math.min(plan.depthMeters, viewport.y + viewport.depthMeters), scale);
  const measuredAreas = growingAreas.filter((area) => area.layout);
  const draggedArea = measuredAreas.find((area) => area.id === drag?.id);
  const areaLabels = measuredAreas.map((area) => ({ area, ...areaLabelPosition(area, scale, padding, viewport) }));
  // While zoomed, only the focused area keeps its name so neighbours' labels never cover its plants.
  const labels = compact ? fitThumbnailLabels(areaLabels, width, height, offsetX, offsetY) : areaLabels.filter(({ area }) => !focusedArea || area.id === focusedArea.id);
  const dimmed = (area: GrowingArea) => Boolean(focusedArea && area.id !== focusedArea.id);

  return <div className={compact ? undefined : canvasStyles.frame}>
    {interactive && !compact && measuredAreas.length > 0 && <div className={canvasStyles.toolbar}>
      <Button aria-pressed={moveMode} onClick={() => { cancelDrag(); setMoveMode((value) => !value); }}>Move planting areas</Button>
      <p>{drag ? `${draggedArea?.name ?? "Area"} · ${drag.point.x.toFixed(1)}, ${drag.point.y.toFixed(1)} m` : moveMode ? "Drag an area. Escape cancels a move." : focusedArea ? `Viewing ${focusedArea.name}. Escape returns to the whole garden.` : "Select an area, or turn on Move to drag it."}</p>
    </div>}
    <div ref={size.ref} className={`${canvasStyles.surface} ${compact ? canvasStyles.compact : ""}`} data-move={moveMode} data-dragging={Boolean(drag)} data-focused-area={focusedArea?.id}>
    {transform ? <Stage
      aria-label={`Garden Plan, ${plan.widthMeters} metres wide by ${plan.depthMeters} metres long`}
      height={height}
      width={width}
      style={{ touchAction: moveMode ? "none" : "pan-y" }}
    >
      <Layer listening={!compact} x={offsetX} y={offsetY}>
        {!compact && <Rect
          preventDefault={false}
          fill={planColors.ground}
          height={plan.depthMeters * scale}
          stroke={planColors.boundary}
          strokeWidth={2}
          width={plan.widthMeters * scale}
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
              padding + (plan.depthMeters - viewport.y) * scale,
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
              padding + (plan.widthMeters - viewport.x) * scale,
              padding + (metre - viewport.y) * scale,
            ]}
            stroke={planColors.grid}
            strokeWidth={1}
          />
        ))}
        {!compact && verticalGrid.map((metre) => (
          <Text
            listening={false}
            fontSize={12}
            key={`x-label-${metre}`}
            text={`${metre} m`}
            x={padding + (metre - viewport.x) * scale - 10}
            y={12}
          />
        ))}
        {!compact && horizontalGrid.map((metre) => (
          <Text
            listening={false}
            fontSize={12}
            key={`y-label-${metre}`}
            text={`${metre} m`}
            x={3}
            y={padding + (metre - viewport.y) * scale - 6}
          />
        ))}
        {drag && draggedArea && <Line
          listening={false} closed dash={[5, 4]} stroke="#59665e" strokeWidth={2}
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
            draggable={interactive && moveMode}
            dragDistance={6}
            preventDefault={moveMode}
            dragBoundFunc={(position) => {
              const frozen = dragSession.current?.transform ?? transform;
              return metresToCanvas(clampPlanPosition(canvasToMetres(position, frozen), plan), frozen);
            }}
            onDragStart={({ target }) => {
              const origin = area.planPlacement;
              dragSession.current = { id: area.id, transform, restore: () => target.position(metresToCanvas(origin, transform)), stop: () => target.stopDrag() };
              setDrag({ id: area.id, transform, origin, point: origin });
            }}
            onDragMove={({ target }) => {
              const point = clampPlanPosition(canvasToMetres(target.position(), dragSession.current?.transform ?? transform), plan);
              setDrag((current) => current && (current.point.x !== point.x || current.point.y !== point.y) ? { ...current, point } : current);
            }}
            key={area.id}
            onClick={() => onEditLayout?.(area.id)}
            onDragEnd={(event) => {
              const session = dragSession.current;
              if (session?.id !== area.id) return;
              dragSession.current = undefined;
              if (event.evt?.type === "touchcancel" || event.evt?.type === "pointercancel") session.restore();
              else onMove(area.id, canvasToMetres({ x: event.target.x(), y: event.target.y() }, session.transform));
              setDrag(undefined);
            }}
            onTap={() => onEditLayout?.(area.id)}
            opacity={dimmed(area) ? 0.35 : 1}
            rotation={area.planPlacement.rotationDegrees}
            x={padding + (area.planPlacement.x - viewport.x) * scale}
            y={padding + (area.planPlacement.y - viewport.y) * scale}
          >
            <AreaShape area={area} scale={scale} compact={compact} selected={selectedAreaId === area.id || drag?.id === area.id} preventDefault={moveMode} />
            {area.layout!.allocations.map((allocation) => (
              <Group key={allocation.id}>
                <Circle
                  aria-label={`${allocation.label} plant on Garden Plan`}
                  fill={allocationPlantColor(allocation, area.layout!.allocations)}
                  opacity={0.9}
                  preventDefault={moveMode}
                  radius={(allocation.diameterMeters * scale) / 2}
                  stroke="#183a2a"
                  strokeWidth={1}
                  x={allocation.x * scale}
                  y={allocation.y * scale}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    onEditLayout?.(area.id);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    onEditLayout?.(area.id);
                  }}
                />
                {!compact && allocation.diameterMeters * scale >= 36 ? (
                  <Text
                    align="center"
                    fill="#183a2a"
                    fontSize={12}
                    height={Math.max(2, allocation.diameterMeters * scale)}
                    listening={false}
                    text={allocation.label}
                    verticalAlign="middle"
                    width={Math.max(2, allocation.diameterMeters * scale)}
                    wrap="none"
                    x={allocation.x * scale - allocation.diameterMeters * scale / 2}
                    y={allocation.y * scale - allocation.diameterMeters * scale / 2}
                  />
                ) : null}
              </Group>
            ))}
          </Group>
        ))}
        {labels.map(({ area, width, x, y }) => (
          <Text
            align="center"
            data-testid={`area-label-${area.id}`}
            ellipsis
            fill={planColors.label}
            fontSize={compact ? 12 : 13}
            fontStyle="bold"
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
        {!compact && !measuredAreas.length ? (
          <Text
            fill={planColors.mutedLabel}
            fontSize={14}
            text="Add a planting area to set its dimensions and show it here."
            width={Math.max(0, width - padding * 2)}
            x={padding}
            y={padding}
          />
        ) : null}
      </Layer>
    </Stage> : <p className={canvasStyles.placeholder}>Preparing garden view…</p>}
    </div>
  </div>;
}

/** One planting area's outline, drawn in area-local canvas pixels inside its positioned Group. */
function AreaShape({ area, scale, compact, selected, preventDefault }: { area: GrowingArea; scale: number; compact: boolean; selected: boolean; preventDefault: boolean }) {
  const layout = area.layout!;
  const look = areaAppearance(area.kind, compact);
  const width = layout.widthMeters * scale;
  const height = layout.depthMeters * scale;
  const points = layout.boundary.flatMap((point) => [point.x * scale, point.y * scale]);
  const rectangle = isRectangularLayout(layout);
  const radius = look.rounded ? Math.min(width, height) / 2 : Math.min(3, width / 4, height / 4);
  const ring = 4;
  return <>
    {/* Selection draws a separate ring so the area keeps its type colours. */}
    {selected && (rectangle
      ? <Rect listening={false} x={-ring} y={-ring} width={width + ring * 2} height={height + ring * 2} cornerRadius={radius + ring} stroke={planColors.selection} strokeWidth={3} />
      : <Line listening={false} closed points={points} stroke={planColors.selection} strokeWidth={look.strokeWidth + 6} opacity={0.45} />)}
    {rectangle
      ? <Rect preventDefault={preventDefault} width={width} height={height} cornerRadius={radius} fill={look.fill} stroke={look.stroke} strokeWidth={look.strokeWidth} dash={look.dash} />
      : <Line preventDefault={preventDefault} closed points={points} fill={look.fill} stroke={look.stroke} strokeWidth={look.strokeWidth} dash={look.dash} />}
    {look.ridge && <Line listening={false} points={ridgeLine(layout).map((value) => value * scale)} stroke={look.stroke} strokeWidth={1} dash={[5, 4]} />}
  </>;
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
