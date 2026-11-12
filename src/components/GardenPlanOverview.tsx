"use client";

import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";

import { FormEvent, type RefObject, useEffect, useRef, useState } from "react";
import { useWorkspaceDraft, useUnsavedDraft } from "@/components/workspace/WorkspaceProvider";
import Link from "next/link";
import { areaPath } from "@/lib/workspaceRoutes";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { useCanvasSize } from "@/hooks/useCanvasSize";
import { canvasToMetres, canvasGridTicks, fitCanvas, metresToCanvas, type CanvasTransform } from "@/lib/canvasViewport";
import { Button } from "./ui/Button";
import { useConfirmation } from "./ConfirmDialog";
import editorStyles from "./editor/Editor.module.css";
import canvasStyles from "./canvas/Canvas.module.css";

import {
  allocationPlantColor,
  clampPlanPosition,
  gardenPlanViewport,
  growingAreaKindLabels,
  snapToGrid,
  validateGardenPlanDimensions,
  type LayoutPoint,
  type GardenPlan,
  type GardenPlanViewMode,
  type GardenPlanViewport,
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
  onDismissPreview?: () => void;
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
  onDismissPreview,
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
  const [viewMode, setViewMode] = useState<GardenPlanViewMode>("growing-areas");
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

  if (compact)
    return (
      <div aria-hidden="true" className={canvasStyles.thumbnail}>
        <GardenPlanCanvas
          compact
          growingAreas={growingAreas}
          interactive={false}
          onMove={() => undefined}
          plan={plan}
          viewMode="growing-areas"
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
  const selectedArea = growingAreas.find((area) => area.id === selectedAreaId);

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
          <div aria-label="Garden Plan tools" className="plan-view-controls">
            <button
              aria-pressed={viewMode === "growing-areas"}
              className="plan-view-control"
              onClick={() => setViewMode("growing-areas")}
              type="button"
            >
              Focus beds
            </button>
            <button
              aria-pressed={viewMode === "full"}
              className="plan-view-control"
              onClick={() => setViewMode("full")}
              type="button"
            >
              Full garden
            </button>
          </div>
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
              viewMode={viewMode}
            />
          </div>
        </div>
      </div>
      {showAreaPreview && gardenId && selectedArea && <section className={editorStyles.areaPreview} aria-label="Selected planting area">
        <div><h3>{selectedArea.name}</h3><p>{areaSizeLabel(selectedArea)}</p></div>
        <Link className="primary-button" href={areaPath(gardenId, selectedArea.id)}>Edit area</Link>
        <Button variant="text" aria-label="Dismiss selected area summary" onClick={() => {
          onDismissPreview?.();
          document.getElementById(`area-link-${selectedArea.id}`)?.focus({ preventScroll: true });
        }}>Dismiss</Button>
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
  viewMode: GardenPlanViewMode;
};

function GardenPlanCanvas({
  plan,
  growingAreas,
  compact,
  interactive,
  selectedAreaId,
  onMove,
  onEditLayout,
  viewMode,
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
    if (moveMode) window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [moveMode]);
  const bounds = gardenPlanViewport(plan, growingAreas, viewMode, compact ? 0.05 : undefined);
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
  const labels = compact ? fitThumbnailLabels(areaLabels, width, height, offsetX, offsetY) : areaLabels;

  return <div className={compact ? undefined : canvasStyles.frame}>
    {interactive && !compact && measuredAreas.length > 0 && <div className={canvasStyles.toolbar}>
      <Button aria-pressed={moveMode} onClick={() => { cancelDrag(); setMoveMode((value) => !value); }}>Move planting areas</Button>
      <p>{drag ? `${draggedArea?.name ?? "Area"} · ${drag.point.x.toFixed(1)}, ${drag.point.y.toFixed(1)} m` : moveMode ? "Drag an area. Escape cancels a move." : "Select an area, or turn on Move to drag it."}</p>
    </div>}
    <div ref={size.ref} className={`${canvasStyles.surface} ${compact ? canvasStyles.compact : ""}`} data-move={moveMode} data-dragging={Boolean(drag)}>
    {transform ? <Stage
      aria-label={`Garden Plan, ${plan.widthMeters} metres long by ${plan.depthMeters} metres wide`}
      height={height}
      width={width}
      style={{ touchAction: moveMode ? "none" : "pan-y" }}
    >
      <Layer listening={!compact} x={offsetX} y={offsetY}>
        {!compact && <Rect
          preventDefault={false}
          fill="#f8fbf6"
          height={plan.depthMeters * scale}
          stroke="#183a2a"
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
            stroke="#cfd7ce"
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
            stroke="#cfd7ce"
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
            rotation={area.planPlacement.rotationDegrees}
            x={padding + (area.planPlacement.x - viewport.x) * scale}
            y={padding + (area.planPlacement.y - viewport.y) * scale}
          >
            <Line
              preventDefault={moveMode}
              closed
              fill={compact ? "#d7e5d2" : "#dcebdc"}
              points={area.layout!.boundary.flatMap((point) => [
                point.x * scale,
                point.y * scale,
              ])}
              stroke={selectedAreaId === area.id || drag?.id === area.id ? "#183a2a" : "#276445"}
              strokeWidth={selectedAreaId === area.id || drag?.id === area.id ? 4 : 2}
            />
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
                {!compact && viewMode === "growing-areas" && allocation.diameterMeters * scale >= 36 ? (
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
            fill="#183a2a"
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
        {!compact && !measuredAreas.length ? (
          <Text
            fill="#657268"
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

function areaLabelPosition(
  area: GrowingArea,
  scale: number,
  padding: number,
  viewport: GardenPlanViewport,
) {
  const angle = (area.planPlacement.rotationDegrees * Math.PI) / 180;
  const origin = {
    x: padding + (area.planPlacement.x - viewport.x) * scale,
    y: padding + (area.planPlacement.y - viewport.y) * scale,
  };
  const points = area.layout!.boundary.map((point) => ({
    x: origin.x + point.x * scale * Math.cos(angle) - point.y * scale * Math.sin(angle),
    y: origin.y + point.x * scale * Math.sin(angle) + point.y * scale * Math.cos(angle),
  }));
  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const width = Math.max(80, Math.min(180, right - left + 24));
  const y = top - 20 >= 24 ? top - 20 : bottom + 6;
  return { width, x: (left + right - width) / 2, y, left, right, top, bottom };
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
